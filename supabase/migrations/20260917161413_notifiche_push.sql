-- Dopo schema.sql e messaggi.sql. Per un altro progetto cambiare email e URL.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists push_private;
revoke all on schema push_private from public, anon, authenticated;

create table public.push_settings (
  id boolean primary key default true check (id),
  site_url text not null,
  function_url text not null,
  admin_email text not null,
  public_key text
);
insert into public.push_settings(site_url,function_url,admin_email) values
 ('https://itzjaack.github.io/BookSelling/','https://hehivxuzzrtaqvkwjkbe.supabase.co/functions/v1/push-notifications','proprietario@example.com');
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null check (length(endpoint) between 20 and 2048),
  endpoint_hash text not null,
  p256dh text not null,
  auth text not null,
  recipient text not null check (recipient in ('admin','buyer')),
  principal text not null,
  offerta_id uuid references public."Offerte_Scambi"(id) on delete cascade,
  access_hash text,
  updated_at timestamptz not null default now(),
  unique(endpoint_hash,recipient,principal),
  check ((recipient='admin' and offerta_id is null and access_hash is null) or (recipient='buyer' and offerta_id is not null and access_hash is not null))
);
create index push_recipient_idx on public.push_subscriptions(recipient,principal);
create index push_offer_idx on public.push_subscriptions(offerta_id);
create table public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  event_key text not null,
  kind text not null check (kind in ('offer','message','test')),
  code text,
  status text not null default 'pending' check (status in ('pending','processing','done','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_error text,
  unique(subscription_id,event_key)
);
create index push_queue_idx on public.push_jobs(available_at) where status in ('pending','processing');
alter table public.push_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_settings,public.push_subscriptions,public.push_jobs from public,anon,authenticated;
grant all on public.push_settings,public.push_subscriptions,public.push_jobs to service_role;

-- Segreti generati sul server e conservati cifrati in Vault, mai nel frontend.
select vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'seconda_push_worker');
create function push_private.server_config(p_public text,p_private text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.push_settings%rowtype; v_private text; v_worker text;
begin
  select * into s from public.push_settings where id for update;
  if s.public_key is null and p_public is not null and p_private is not null then
    perform vault.create_secret(p_private,'seconda_push_vapid');
    update public.push_settings set public_key=p_public where id returning * into s;
  end if;
  select decrypted_secret into v_private from vault.decrypted_secrets where name='seconda_push_vapid';
  select decrypted_secret into v_worker from vault.decrypted_secrets where name='seconda_push_worker';
  return to_jsonb(s)||jsonb_build_object('private_key',v_private,'worker_secret',v_worker);
end $$;
create function public.push_server_config(p_public text default null,p_private text default null) returns jsonb
language sql security invoker set search_path='' as $$ select push_private.server_config(p_public,p_private) $$;
revoke all on function push_private.server_config(text,text) from public,anon,authenticated;
revoke all on function public.push_server_config(text,text) from public,anon,authenticated;
grant usage on schema push_private to service_role;
grant execute on function push_private.server_config(text,text),public.push_server_config(text,text) to service_role;

create function push_private.enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
  if TG_TABLE_NAME='Offerte_Scambi' then
    insert into public.push_jobs(subscription_id,event_key,kind,code)
      select id,'offer:'||new.id,'offer',new.codice_richiesta from public.push_subscriptions where recipient='admin'
      on conflict do nothing;
  else
    select codice_richiesta into v_code from public."Offerte_Scambi" where id=new.offerta_id;
    insert into public.push_jobs(subscription_id,event_key,kind,code)
      select s.id,'message:'||new.id,'message',v_code from public.push_subscriptions s
      where (new.autore='Acquirente' and s.recipient='admin')
        or (new.autore='Venditore' and s.recipient='buyer' and s.offerta_id=new.offerta_id
          and exists(select 1 from public."Accessi_Richieste" a where a.offerta_id=s.offerta_id and encode(a.chiave_hash,'hex')=s.access_hash))
      on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function push_private.enqueue() from public,anon,authenticated;
create trigger push_new_offer after insert on public."Offerte_Scambi" for each row execute function push_private.enqueue();
create trigger push_new_message after insert on public."Messaggi_Richieste" for each row execute function push_private.enqueue();

create function push_private.revoke_buyer() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.push_subscriptions where offerta_id=new.offerta_id and access_hash<>encode(new.chiave_hash,'hex');
  return new;
end $$;
revoke all on function push_private.revoke_buyer() from public,anon,authenticated;
create trigger push_access_changed after update of chiave_hash on public."Accessi_Richieste" for each row execute function push_private.revoke_buyer();

create function public.push_claim() returns setof public.push_jobs language sql security invoker set search_path='' as $$
  update public.push_jobs set status='processing',attempts=attempts+1,available_at=now()+interval '3 minutes'
  where id in (select id from public.push_jobs where status in ('pending','processing') and available_at<=now()
    and attempts<5 order by available_at limit 30 for update skip locked) returning *;
$$;
revoke all on function public.push_claim() from public,anon,authenticated;
grant execute on function public.push_claim() to service_role;

create function push_private.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare v_url text; v_secret text;
begin
  update public.push_jobs set status='dead' where attempts>=5 and status in ('pending','processing') and available_at<=now();
  delete from public.push_jobs where created_at<now()-interval '7 days';
  if not exists(select 1 from public.push_jobs where status in ('pending','processing') and available_at<=now()) then return; end if;
  select function_url into v_url from public.push_settings where id;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='seconda_push_worker';
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-push-worker',v_secret),body:='{"action":"process"}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function push_private.dispatch() from public,anon,authenticated;
select cron.schedule('seconda-push-delivery','* * * * *','select push_private.dispatch()');
commit;
