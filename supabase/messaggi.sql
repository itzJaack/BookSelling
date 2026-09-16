-- Esegui DOPO schema.sql. Aggiornamento ri-eseguibile anche su un database esistente.
-- Non richiede altre chiavi o email: i permessi admin usano le RLS delle offerte.
begin;

alter table public."Offerte_Scambi"
  add column if not exists codice_richiesta text not null
    default ('SEC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  add column if not exists libro_titolo text;
create unique index if not exists offerte_codice_richiesta_idx
  on public."Offerte_Scambi" (codice_richiesta);
update public."Offerte_Scambi" o set libro_titolo = l.titolo
  from public."Libri" l where l.id = o.libro_id and o.libro_titolo is null;
update public."Offerte_Scambi" set libro_titolo = 'Libro non più in catalogo' where libro_titolo is null;
alter table public."Offerte_Scambi" alter column libro_titolo set not null;

-- Eliminare un libro non elimina lo storico di acquisto e le conversazioni.
alter table public."Offerte_Scambi" alter column libro_id drop not null;
alter table public."Offerte_Scambi" drop constraint if exists "Offerte_Scambi_libro_id_fkey";
alter table public."Offerte_Scambi" add constraint "Offerte_Scambi_libro_id_fkey"
  foreign key (libro_id) references public."Libri" (id) on delete set null;

create table if not exists public."Accessi_Richieste" (
  offerta_id uuid primary key references public."Offerte_Scambi" (id) on delete cascade,
  chiave_hash bytea not null
);
create table if not exists public."Messaggi_Richieste" (
  id bigint generated always as identity primary key,
  offerta_id uuid not null references public."Offerte_Scambi" (id) on delete cascade,
  client_id uuid not null default gen_random_uuid(),
  autore text not null check (autore in ('Acquirente', 'Venditore')),
  testo text not null check (char_length(btrim(testo)) between 1 and 2000),
  data_inserimento timestamptz not null default now(),
  unique (offerta_id, client_id)
);
create index if not exists messaggi_richiesta_idx on public."Messaggi_Richieste" (offerta_id, id);
alter table public."Accessi_Richieste" enable row level security;
alter table public."Messaggi_Richieste" enable row level security;
revoke all on public."Accessi_Richieste", public."Messaggi_Richieste" from public, anon, authenticated;
grant select, insert, update on public."Accessi_Richieste" to authenticated;
grant select, insert on public."Messaggi_Richieste" to authenticated;
grant usage on sequence public."Messaggi_Richieste_id_seq" to authenticated;

-- Una SELECT sulle offerte passa già dalle policy del proprietario configurato.
drop policy if exists "Admin gestisce accessi" on public."Accessi_Richieste";
create policy "Admin gestisce accessi" on public."Accessi_Richieste" for all to authenticated
  using (exists (select 1 from public."Offerte_Scambi" o where o.id = offerta_id))
  with check (exists (select 1 from public."Offerte_Scambi" o where o.id = offerta_id));
drop policy if exists "Admin legge messaggi" on public."Messaggi_Richieste";
create policy "Admin legge messaggi" on public."Messaggi_Richieste" for select to authenticated
  using (exists (select 1 from public."Offerte_Scambi" o where o.id = offerta_id));
drop policy if exists "Admin risponde" on public."Messaggi_Richieste";
create policy "Admin risponde" on public."Messaggi_Richieste" for insert to authenticated
  with check (autore = 'Venditore' and exists (select 1 from public."Offerte_Scambi" o where o.id = offerta_id));

-- La creazione passa dalla RPC: offerta e accesso vengono salvati insieme.
drop policy if exists "Offerte pubbliche in inserimento" on public."Offerte_Scambi";
revoke insert on public."Offerte_Scambi" from anon, authenticated;

create or replace function public.crea_richiesta(
  p_id uuid, p_chiave text, p_libro_id uuid, p_nome text, p_contatto text,
  p_prezzo numeric, p_luogo text, p_messaggio text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_codice text;
  v_titolo text;
  v_hash bytea;
begin
  if p_id is null or p_chiave is null or p_chiave !~ '^[0-9a-f]{64}$' then
    raise exception 'Accesso richiesta non valido';
  end if;
  v_hash := sha256(convert_to(p_chiave, 'UTF8'));
  -- Serializza i tentativi con lo stesso ID: un retry di rete non duplica l'offerta.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select o.codice_richiesta into v_codice from public."Offerte_Scambi" o
    join public."Accessi_Richieste" a on a.offerta_id = o.id
    where o.id = p_id and a.chiave_hash = v_hash;
  if found then return jsonb_build_object('id', p_id, 'codice_richiesta', v_codice); end if;
  if exists (select 1 from public."Offerte_Scambi" where id = p_id) then
    raise exception 'Accesso richiesta non valido';
  end if;
  select titolo into v_titolo from public."Libri" where id = p_libro_id and disponibile for share;
  if not found then raise exception 'Questo libro non è più disponibile'; end if;
  insert into public."Offerte_Scambi" (id, libro_id, libro_titolo, nome_acquirente,
    email_o_telefono, prezzo_offerto, luogo_proposto, messaggio)
    values (p_id, p_libro_id, v_titolo, btrim(p_nome), btrim(p_contatto),
      p_prezzo, btrim(p_luogo), btrim(coalesce(p_messaggio, '')))
    returning codice_richiesta into v_codice;
  insert into public."Accessi_Richieste" (offerta_id, chiave_hash) values (p_id, v_hash);
  return jsonb_build_object('id', p_id, 'codice_richiesta', v_codice);
end;
$$;

create or replace function public.leggi_richiesta(
  p_codice text, p_chiave text, p_dopo bigint default 0, p_prima bigint default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_offerta public."Offerte_Scambi"%rowtype;
  v_messaggi jsonb;
  v_min bigint;
  v_max bigint;
begin
  select o.* into v_offerta from public."Offerte_Scambi" o
    join public."Accessi_Richieste" a on a.offerta_id = o.id
    where o.codice_richiesta = upper(btrim(p_codice))
      and a.chiave_hash = sha256(convert_to(p_chiave, 'UTF8'));
  if not found then raise exception 'Link non valido o accesso revocato'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb), min(m.id), max(m.id)
    into v_messaggi, v_min, v_max from (
      select id, autore, testo, data_inserimento from public."Messaggi_Richieste"
      where offerta_id = v_offerta.id
        and (p_prima is null or id < p_prima)
        and (p_prima is not null or id > coalesce(p_dopo, 0))
      order by
        case when p_prima is null and coalesce(p_dopo, 0) > 0 then id end asc,
        id desc
      limit 50
    ) m;
  return jsonb_build_object(
    'richiesta', jsonb_build_object('codice_richiesta', v_offerta.codice_richiesta,
      'libro_titolo', v_offerta.libro_titolo, 'stato', v_offerta.stato,
      'prezzo_offerto', v_offerta.prezzo_offerto, 'luogo_proposto', v_offerta.luogo_proposto,
      'messaggio', v_offerta.messaggio),
    'messaggi', v_messaggi,
    'precedenti', exists (select 1 from public."Messaggi_Richieste" where offerta_id = v_offerta.id and id < v_min),
    'successivi', exists (select 1 from public."Messaggi_Richieste" where offerta_id = v_offerta.id and id > v_max)
  );
end;
$$;

create or replace function public.invia_messaggio_richiesta(
  p_codice text, p_chiave text, p_testo text, p_client_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select o.id into v_id from public."Offerte_Scambi" o
    join public."Accessi_Richieste" a on a.offerta_id = o.id
    where o.codice_richiesta = upper(btrim(p_codice))
      and a.chiave_hash = sha256(convert_to(p_chiave, 'UTF8'))
    for update of a;
  if not found then raise exception 'Link non valido o accesso revocato'; end if;
  if exists (select 1 from public."Messaggi_Richieste" where offerta_id = v_id and client_id = p_client_id) then return; end if;
  if exists (select 1 from public."Messaggi_Richieste" where offerta_id = v_id
      and autore = 'Acquirente' and data_inserimento > now() - interval '3 seconds') then
    raise exception 'Attendi qualche secondo prima di inviare un altro messaggio';
  end if;
  insert into public."Messaggi_Richieste" (offerta_id, client_id, autore, testo)
    values (v_id, p_client_id, 'Acquirente', btrim(p_testo));
end;
$$;

-- RLS invoker: solo il proprietario può creare/sostituire un link privato.
-- Utile anche per offerte precedenti a questa migrazione. Il vecchio link scade.
create or replace function public.rigenera_accesso_richiesta(p_offerta_id uuid, p_chiave text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_codice text;
begin
  select codice_richiesta into v_codice from public."Offerte_Scambi" where id = p_offerta_id;
  if not found then raise exception 'Richiesta non accessibile'; end if;
  if p_chiave is null or p_chiave !~ '^[0-9a-f]{64}$' then raise exception 'Chiave non valida'; end if;
  insert into public."Accessi_Richieste" (offerta_id, chiave_hash)
    values (p_offerta_id, sha256(convert_to(p_chiave, 'UTF8')))
    on conflict (offerta_id) do update set chiave_hash = excluded.chiave_hash;
  return v_codice;
end;
$$;

revoke all on function public.crea_richiesta(uuid, text, uuid, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.leggi_richiesta(text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.invia_messaggio_richiesta(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.rigenera_accesso_richiesta(uuid, text) from public, anon, authenticated;
grant execute on function public.crea_richiesta(uuid, text, uuid, text, text, numeric, text, text) to anon, authenticated;
grant execute on function public.leggi_richiesta(text, text, bigint, bigint) to anon, authenticated;
grant execute on function public.invia_messaggio_richiesta(text, text, text, uuid) to anon, authenticated;
grant execute on function public.rigenera_accesso_richiesta(uuid, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public."Messaggi_Richieste";
exception when duplicate_object then null;
end $$;
commit;
