-- Correzione di installazione prima dell'attivazione sui dispositivi.
-- pg_net non è rilocabile: ricrearlo soltanto se nessuna notifica è in uso.
begin;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_net' and extnamespace='public'::regnamespace) then
    if exists(select 1 from public.push_subscriptions) or exists(select 1 from public.push_jobs)
      or exists(select 1 from net.http_request_queue) then
      raise exception 'pg_net in uso: non ricreare l’estensione';
    end if;
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
commit;
