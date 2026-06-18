-- PAD V2 - Ranking squadre configurabile
-- Migration additiva per:
-- - flag torneo "Utilizza ranking"
-- - ranking opzionale sulle squadre

alter table public.tournaments
  add column if not exists use_ranking boolean not null default false;

alter table public.teams
  add column if not exists ranking integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_ranking_positive'
  ) then
    alter table public.teams
      add constraint teams_ranking_positive
      check (ranking is null or ranking > 0);
  end if;
end $$;

create unique index if not exists teams_season_ranking_unique
  on public.teams (season_id, ranking)
  where ranking is not null;

comment on column public.tournaments.use_ranking is
  'Abilita ranking obbligatorio e univoco sulle squadre del torneo PAD V2.';

comment on column public.teams.ranking is
  'Seed/ranking opzionale della squadra nel torneo PAD V2.';
