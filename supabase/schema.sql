-- Seconda Pagina — schema iniziale per Supabase
-- 1) Sostituisci proprietario@example.com con l'email del tuo account Supabase Auth.
-- 2) Esegui tutto in Supabase Dashboard > SQL Editor > New query.
-- 3) Esegui poi supabase/messaggi.sql per codici richiesta e conversazioni private.
-- Su un database già configurato, applica solo messaggi.sql per questo aggiornamento.

create extension if not exists "pgcrypto";

create table if not exists public."Libri" (
  id uuid primary key default gen_random_uuid(),
  isbn text not null unique check (char_length(isbn) between 10 and 17),
  titolo text not null check (char_length(titolo) between 2 and 180),
  editore_edizione text not null,
  materia text not null,
  prezzo_richiesto numeric(8,2) not null check (prezzo_richiesto >= 0),
  condizioni text not null check (condizioni in ('Nuovo', 'Come Nuovo', 'Ottimo', 'Buono', 'Discreto', 'Segnato', 'Sottolineato', 'Evidenziato', 'Con appunti', 'Copertina usurata')),
  disponibile boolean not null default true,
  data_inserimento timestamptz not null default now()
);

create table if not exists public."Offerte_Scambi" (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public."Libri"(id) on delete cascade,
  nome_acquirente text not null check (char_length(nome_acquirente) between 2 and 100),
  email_o_telefono text not null check (char_length(email_o_telefono) between 5 and 160),
  prezzo_offerto numeric(8,2) not null check (prezzo_offerto > 0),
  luogo_proposto text not null check (char_length(luogo_proposto) between 2 and 160),
  messaggio text not null default '' check (char_length(messaggio) <= 1000),
  stato text not null default 'In attesa' check (stato in ('In attesa', 'Accettata', 'Rifiutata')),
  data_inserimento timestamptz not null default now()
);

create index if not exists libri_materia_idx on public."Libri" (materia);
create index if not exists libri_disponibile_idx on public."Libri" (disponibile);
create index if not exists offerte_libro_id_idx on public."Offerte_Scambi" (libro_id);

alter table public."Libri" enable row level security;
alter table public."Offerte_Scambi" enable row level security;

grant select on public."Libri" to anon, authenticated;
grant insert on public."Offerte_Scambi" to anon, authenticated;
grant insert, update, delete on public."Libri" to authenticated;
grant select, update, delete on public."Offerte_Scambi" to authenticated;

-- Tutti, anche senza login, possono leggere il catalogo.
drop policy if exists "Catalogo leggibile da tutti" on public."Libri";
create policy "Catalogo leggibile da tutti"
  on public."Libri" for select
  to anon, authenticated
  using (true);

-- Tutti possono creare un'offerta, ma soltanto con lo stato iniziale previsto.
drop policy if exists "Offerte pubbliche in inserimento" on public."Offerte_Scambi";
create policy "Offerte pubbliche in inserimento"
  on public."Offerte_Scambi" for insert
  to anon, authenticated
  with check (stato = 'In attesa');

-- Solo il proprietario autenticato può creare, modificare o eliminare libri.
drop policy if exists "Solo proprietario gestisce libri" on public."Libri";
create policy "Solo proprietario gestisce libri"
  on public."Libri" for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'proprietario@example.com')
  with check ((auth.jwt() ->> 'email') = 'proprietario@example.com');

-- Solo il proprietario può leggere i contatti e gestire lo stato delle offerte.
drop policy if exists "Solo proprietario gestisce offerte" on public."Offerte_Scambi";
create policy "Solo proprietario gestisce offerte"
  on public."Offerte_Scambi" for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'proprietario@example.com');

drop policy if exists "Solo proprietario aggiorna offerte" on public."Offerte_Scambi";
create policy "Solo proprietario aggiorna offerte"
  on public."Offerte_Scambi" for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'proprietario@example.com')
  with check ((auth.jwt() ->> 'email') = 'proprietario@example.com');

drop policy if exists "Solo proprietario elimina offerte" on public."Offerte_Scambi";
create policy "Solo proprietario elimina offerte"
  on public."Offerte_Scambi" for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'proprietario@example.com');

-- Abilita gli aggiornamenti del catalogo in tempo reale.
do $$
begin
  alter publication supabase_realtime add table public."Libri";
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public."Offerte_Scambi";
exception when duplicate_object then null;
end $$;

-- Aggiorna un'offerta in una singola transazione. Se accettata, segna il libro come venduto.
create or replace function public.gestisci_offerta(p_offerta_id uuid, p_stato text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_libro_id uuid;
begin
  if p_stato not in ('Accettata', 'Rifiutata') then
    raise exception 'Stato offerta non valido';
  end if;

  update public."Offerte_Scambi"
  set stato = p_stato
  where id = p_offerta_id and stato = 'In attesa'
  returning libro_id into v_libro_id;

  if v_libro_id is null then
    raise exception 'Offerta non trovata o già gestita';
  end if;

  if p_stato = 'Accettata' then
    update public."Libri" set disponibile = false where id = v_libro_id;
  end if;
end;
$$;

revoke all on function public.gestisci_offerta(uuid, text) from public, anon;
grant execute on function public.gestisci_offerta(uuid, text) to authenticated;

insert into public."Libri" (isbn, titolo, editore_edizione, materia, prezzo_richiesto, condizioni, disponibile)
values
  ('9788808420649', 'Matematica.verde 2', 'Zanichelli · 3ª edizione', 'Matematica', 18.00, 'Come Nuovo', true),
  ('9788839535985', 'La vita davanti a noi', 'Paravia · Vol. 1', 'Italiano', 14.50, 'Buono', true),
  ('9788805078515', 'Fisica: lezioni e problemi', 'SEI · Edizione blu', 'Fisica', 21.00, 'Segnato', true)
on conflict (isbn) do nothing;
