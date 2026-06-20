-- PAD V2 - Label personalizzate fasi finali
-- Migration additiva: non modifica risultati, partite o dati esistenti in modo distruttivo.

alter table public.tournaments
  add column if not exists playoff_label text default 'Playoff',
  add column if not exists playout_label text default 'Playout';

comment on column public.tournaments.playoff_label is
  'Nome pubblico/admin della fase playoff PAD V2. Fallback applicativo: Playoff.';

comment on column public.tournaments.playout_label is
  'Nome pubblico/admin della fase playout PAD V2. Fallback applicativo: Playout.';
