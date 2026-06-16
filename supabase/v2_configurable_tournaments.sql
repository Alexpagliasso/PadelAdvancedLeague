-- PAD V2 - Configurable tournaments and brackets
-- Run after supabase/schema.sql and supabase/rls.sql.
-- This migration is additive: it does not remove seasons, season_settings, gallery, or existing V1 data.

-- ============================================================
-- Enum types
-- ============================================================

do $$
begin
  create type public.tournament_format as enum (
    'round_robin',
    'knockout',
    'group_playoff_playout'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.competition_phase as enum (
    'setup',
    'regular_season',
    'knockout',
    'completed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.bracket_type as enum (
    'knockout',
    'playoff',
    'playout'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.bracket_status as enum (
    'draft',
    'generated',
    'completed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.bracket_slot as enum (
    'home',
    'away'
  );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Tournament configuration
-- ============================================================

alter table public.tournaments
  add column if not exists expected_teams_count integer,
  add column if not exists format public.tournament_format not null default 'round_robin',
  add column if not exists current_phase public.competition_phase not null default 'setup',
  add column if not exists allow_byes boolean not null default true,
  add column if not exists playoff_teams_count integer,
  add column if not exists playout_teams_count integer,
  add column if not exists regular_calendar_generated_at timestamptz,
  add column if not exists knockout_generated_at timestamptz,
  add column if not exists playoff_generated_at timestamptz,
  add column if not exists playout_generated_at timestamptz;

update public.tournaments t
set
  expected_teams_count = greatest(coalesce(team_counts.team_count, 0), 2),
  current_phase = case
    when coalesce(match_counts.match_count, 0) = 0 then 'setup'::public.competition_phase
    when match_counts.match_count = match_counts.official_count then 'completed'::public.competition_phase
    else 'regular_season'::public.competition_phase
  end,
  regular_calendar_generated_at = case
    when coalesce(match_counts.match_count, 0) > 0 then match_counts.first_match_created_at
    else t.regular_calendar_generated_at
  end
from (
  select
    s.tournament_id,
    count(distinct tm.id)::integer as team_count
  from public.seasons s
  left join public.teams tm on tm.season_id = s.id
  group by s.tournament_id
) team_counts
left join (
  select
    s.tournament_id,
    count(m.id)::integer as match_count,
    count(m.id) filter (
      where m.status = 'played' and m.result_status = 'official'
    )::integer as official_count,
    min(m.created_at) as first_match_created_at
  from public.seasons s
  left join public.matches m on m.season_id = s.id
  group by s.tournament_id
) match_counts on match_counts.tournament_id = team_counts.tournament_id
where t.id = team_counts.tournament_id
  and t.expected_teams_count is null;

update public.tournaments
set expected_teams_count = 2
where expected_teams_count is null;

do $$
begin
  alter table public.tournaments
    alter column expected_teams_count set not null;
exception when others then
  raise notice 'Could not set tournaments.expected_teams_count not null: %', sqlerrm;
end $$;

do $$
begin
  alter table public.tournaments
    add constraint tournaments_expected_teams_count_valid
    check (expected_teams_count >= 2);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.tournaments
    add constraint tournaments_playoff_count_valid
    check (
      playoff_teams_count is null
      or (playoff_teams_count > 1 and playoff_teams_count <= expected_teams_count)
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.tournaments
    add constraint tournaments_playout_count_valid
    check (
      playout_teams_count is null
      or (playout_teams_count > 1 and playout_teams_count <= expected_teams_count)
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.tournaments
    add constraint tournaments_playoff_playout_total_valid
    check (
      coalesce(playoff_teams_count, 0) + coalesce(playout_teams_count, 0)
      <= expected_teams_count
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.tournaments
    add constraint tournaments_format_settings_valid
    check (
      (
        format in ('round_robin', 'knockout')
        and playoff_teams_count is null
        and playout_teams_count is null
      )
      or (
        format = 'group_playoff_playout'
        and (playoff_teams_count is not null or playout_teams_count is not null)
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists tournaments_format_idx on public.tournaments(format);
create index if not exists tournaments_current_phase_idx on public.tournaments(current_phase);

-- ============================================================
-- Brackets
-- ============================================================

create table if not exists public.tournament_brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket_type public.bracket_type not null,
  name text not null,
  status public.bracket_status not null default 'generated',
  generated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournament_brackets_name_not_blank check (length(btrim(name)) > 0),
  constraint tournament_brackets_completed_at_valid check (
    status <> 'completed' or completed_at is not null
  ),
  constraint tournament_brackets_one_type_per_tournament unique (tournament_id, bracket_type)
);

create index if not exists tournament_brackets_tournament_id_idx
  on public.tournament_brackets(tournament_id);
create index if not exists tournament_brackets_type_idx
  on public.tournament_brackets(bracket_type);

drop trigger if exists tournament_brackets_set_updated_at on public.tournament_brackets;
create trigger tournament_brackets_set_updated_at
before update on public.tournament_brackets
for each row execute function public.set_updated_at();

create table if not exists public.tournament_bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.tournament_brackets(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  round_number integer not null,
  round_label text not null,
  position integer not null,
  home_seed integer,
  away_seed integer,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  winner_team_id uuid references public.teams(id) on delete set null,
  is_bye boolean not null default false,
  advances_to_id uuid references public.tournament_bracket_matches(id) on delete set null,
  advances_to_slot public.bracket_slot,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournament_bracket_matches_round_valid check (round_number > 0),
  constraint tournament_bracket_matches_position_valid check (position > 0),
  constraint tournament_bracket_matches_round_label_not_blank check (length(btrim(round_label)) > 0),
  constraint tournament_bracket_matches_distinct_teams check (
    home_team_id is null
    or away_team_id is null
    or home_team_id <> away_team_id
  ),
  constraint tournament_bracket_matches_bye_valid check (
    is_bye = false
    or (
      match_id is null
      and winner_team_id is not null
      and (
        (home_team_id is not null and away_team_id is null)
        or (home_team_id is null and away_team_id is not null)
      )
    )
  ),
  constraint tournament_bracket_matches_advances_slot_valid check (
    (advances_to_id is null and advances_to_slot is null)
    or (advances_to_id is not null and advances_to_slot is not null)
  ),
  constraint tournament_bracket_matches_unique_position unique (bracket_id, round_number, position)
);

create index if not exists tournament_bracket_matches_bracket_id_idx
  on public.tournament_bracket_matches(bracket_id);
create index if not exists tournament_bracket_matches_match_id_idx
  on public.tournament_bracket_matches(match_id);
create index if not exists tournament_bracket_matches_home_team_id_idx
  on public.tournament_bracket_matches(home_team_id);
create index if not exists tournament_bracket_matches_away_team_id_idx
  on public.tournament_bracket_matches(away_team_id);
create index if not exists tournament_bracket_matches_winner_team_id_idx
  on public.tournament_bracket_matches(winner_team_id);

drop trigger if exists tournament_bracket_matches_set_updated_at on public.tournament_bracket_matches;
create trigger tournament_bracket_matches_set_updated_at
before update on public.tournament_bracket_matches
for each row execute function public.set_updated_at();

-- ============================================================
-- RLS for bracket tables
-- ============================================================

alter table public.tournament_brackets enable row level security;
alter table public.tournament_bracket_matches enable row level security;

-- tournament_brackets: admins manage, public users read public tournaments.
drop policy if exists tournament_brackets_super_admin_select on public.tournament_brackets;
create policy tournament_brackets_super_admin_select on public.tournament_brackets
for select using (public.is_super_admin());

drop policy if exists tournament_brackets_super_admin_insert on public.tournament_brackets;
create policy tournament_brackets_super_admin_insert on public.tournament_brackets
for insert with check (public.is_super_admin());

drop policy if exists tournament_brackets_super_admin_update on public.tournament_brackets;
create policy tournament_brackets_super_admin_update on public.tournament_brackets
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tournament_brackets_super_admin_delete on public.tournament_brackets;
create policy tournament_brackets_super_admin_delete on public.tournament_brackets
for delete using (public.is_super_admin());

drop policy if exists tournament_brackets_admin_select on public.tournament_brackets;
create policy tournament_brackets_admin_select on public.tournament_brackets
for select using (public.is_admin());

drop policy if exists tournament_brackets_admin_insert on public.tournament_brackets;
create policy tournament_brackets_admin_insert on public.tournament_brackets
for insert with check (public.is_admin());

drop policy if exists tournament_brackets_admin_update on public.tournament_brackets;
create policy tournament_brackets_admin_update on public.tournament_brackets
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists tournament_brackets_admin_delete on public.tournament_brackets;
create policy tournament_brackets_admin_delete on public.tournament_brackets
for delete using (public.is_admin());

drop policy if exists tournament_brackets_user_select_public on public.tournament_brackets;
create policy tournament_brackets_user_select_public on public.tournament_brackets
for select using (public.is_public_tournament(tournament_id));

-- tournament_bracket_matches: admins manage, public users read via parent bracket/tournament.
drop policy if exists tournament_bracket_matches_super_admin_select on public.tournament_bracket_matches;
create policy tournament_bracket_matches_super_admin_select on public.tournament_bracket_matches
for select using (public.is_super_admin());

drop policy if exists tournament_bracket_matches_super_admin_insert on public.tournament_bracket_matches;
create policy tournament_bracket_matches_super_admin_insert on public.tournament_bracket_matches
for insert with check (public.is_super_admin());

drop policy if exists tournament_bracket_matches_super_admin_update on public.tournament_bracket_matches;
create policy tournament_bracket_matches_super_admin_update on public.tournament_bracket_matches
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tournament_bracket_matches_super_admin_delete on public.tournament_bracket_matches;
create policy tournament_bracket_matches_super_admin_delete on public.tournament_bracket_matches
for delete using (public.is_super_admin());

drop policy if exists tournament_bracket_matches_admin_select on public.tournament_bracket_matches;
create policy tournament_bracket_matches_admin_select on public.tournament_bracket_matches
for select using (public.is_admin());

drop policy if exists tournament_bracket_matches_admin_insert on public.tournament_bracket_matches;
create policy tournament_bracket_matches_admin_insert on public.tournament_bracket_matches
for insert with check (public.is_admin());

drop policy if exists tournament_bracket_matches_admin_update on public.tournament_bracket_matches;
create policy tournament_bracket_matches_admin_update on public.tournament_bracket_matches
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists tournament_bracket_matches_admin_delete on public.tournament_bracket_matches;
create policy tournament_bracket_matches_admin_delete on public.tournament_bracket_matches
for delete using (public.is_admin());

drop policy if exists tournament_bracket_matches_user_select_public on public.tournament_bracket_matches;
create policy tournament_bracket_matches_user_select_public on public.tournament_bracket_matches
for select using (
  exists (
    select 1
    from public.tournament_brackets tb
    where tb.id = tournament_bracket_matches.bracket_id
      and public.is_public_tournament(tb.tournament_id)
  )
);

