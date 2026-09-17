-- Aggiornamento non distruttivo: conserva tutte le condizioni già supportate.
begin;
alter table public."Libri" drop constraint "Libri_condizioni_check";
alter table public."Libri" add constraint "Libri_condizioni_check"
  check (condizioni in ('Nuovo', 'Come Nuovo', 'Ottimo', 'Buono', 'Discreto', 'Segnato', 'Sottolineato', 'Evidenziato', 'Con appunti', 'Copertina usurata'));
commit;
