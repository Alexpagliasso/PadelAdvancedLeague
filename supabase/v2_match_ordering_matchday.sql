-- PAD V2 - Persistenza giornate e ordine visuale calendario
-- Non applicare automaticamente. Serve per implementare:
-- - suddivisione calendario per giornate
-- - filtro giornata admin
-- - rimescola ordine calendario senza duplicare partite

alter table public.matches
  add column if not exists matchday integer,
  add column if not exists display_order integer;

-- Backfill idempotente:
-- - display_order mantiene un ordinamento stabile dentro ogni season;
-- - matchday usa il round reale del bracket quando disponibile;
-- - per match senza bracket preesistente, usa un valore sequenziale conservativo per season/fase.
with ordered_matches as (
  select
    matches.id,
    row_number() over (
      partition by matches.season_id
      order by
        matches.scheduled_at nulls last,
        matches.phase,
        matches.created_at,
        matches.id
    ) as season_order,
    row_number() over (
      partition by matches.season_id, matches.phase
      order by
        matches.scheduled_at nulls last,
        matches.created_at,
        matches.id
    ) as phase_order
  from public.matches
)
update public.matches
set
  display_order = coalesce(public.matches.display_order, ordered_matches.season_order),
  matchday = coalesce(public.matches.matchday, ordered_matches.phase_order)
from ordered_matches
where public.matches.id = ordered_matches.id
  and (public.matches.display_order is null or public.matches.matchday is null);

update public.matches
set matchday = tournament_bracket_matches.round_number
from public.tournament_bracket_matches
where public.matches.id = tournament_bracket_matches.match_id
  and tournament_bracket_matches.round_number is not null
  and (
    public.matches.matchday is null
    or public.matches.phase in ('playoff', 'playout')
  );

create index if not exists matches_season_matchday_idx
  on public.matches (season_id, matchday);

create index if not exists matches_season_display_order_idx
  on public.matches (season_id, display_order);

create index if not exists matches_season_phase_matchday_idx
  on public.matches (season_id, phase, matchday);

comment on column public.matches.matchday is
  'Giornata/round visuale del calendario PAD V2. Null per match non assegnati.';

comment on column public.matches.display_order is
  'Ordine visuale stabile delle partite nel calendario PAD V2. Usato per rimescolare senza duplicare match.';
