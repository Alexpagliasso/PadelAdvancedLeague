-- Padel Advanced League - Supabase V1 schema
-- Principle: simple today, extensible tomorrow.
-- Ready to run in the Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ============================================================
-- Enum types
-- ============================================================

do $$
begin
  create type public.profile_role as enum ('super_admin', 'admin', 'user');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.tournament_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.season_status as enum ('draft', 'active', 'completed', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_phase as enum ('regular_season', 'playoff', 'playout');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_status as enum ('scheduled', 'played', 'postponed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.result_status as enum ('pending', 'official');
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Shared helpers
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Profiles
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.profile_role not null default 'user',
  full_name text not null,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint profiles_email_not_blank check (email is null or length(btrim(email)) > 0)
);

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_role_idx on public.profiles(role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- Notifications
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint notifications_body_not_blank check (length(btrim(body)) > 0),
  constraint notifications_read_state_valid check (
    (is_read = true and read_at is not null)
    or (is_read = false)
  )
);

create index if not exists notifications_profile_id_idx on public.notifications(profile_id);
create index if not exists notifications_is_read_idx on public.notifications(is_read);
create index if not exists notifications_created_at_idx on public.notifications(created_at);

-- ============================================================
-- Tournaments and seasons
-- ============================================================

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status public.tournament_status not null default 'draft',
  is_public boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournaments_name_not_blank check (length(btrim(name)) > 0),
  constraint tournaments_slug_not_blank check (length(btrim(slug)) > 0)
);

create index if not exists tournaments_status_idx on public.tournaments(status);
create index if not exists tournaments_is_public_idx on public.tournaments(is_public);
create index if not exists tournaments_public_status_idx on public.tournaments(is_public, status);

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  slug text not null,
  status public.season_status not null default 'draft',
  starts_on date,
  ends_on date,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint seasons_name_not_blank check (length(btrim(name)) > 0),
  constraint seasons_slug_not_blank check (length(btrim(slug)) > 0),
  constraint seasons_dates_valid check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint seasons_tournament_slug_unique unique (tournament_id, slug),
  constraint seasons_id_tournament_id_unique unique (id, tournament_id)
);

create index if not exists seasons_tournament_id_idx on public.seasons(tournament_id);
create index if not exists seasons_status_idx on public.seasons(status);
create index if not exists seasons_public_status_idx on public.seasons(is_public, status);

drop trigger if exists seasons_set_updated_at on public.seasons;
create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

-- One row per season. Playoff/playout configuration lives here in V1.
create table if not exists public.season_settings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references public.seasons(id) on delete cascade,

  regular_season_label text not null default 'Regular season',

  playoffs_enabled boolean not null default false,
  playoff_teams_count integer,
  playoff_format text,

  playouts_enabled boolean not null default false,
  playout_teams_count integer,
  playout_format text,

  standings_tiebreak_order text[] not null default array[
    'points',
    'head_to_head',
    'set_difference',
    'game_difference'
  ],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint season_settings_regular_label_not_blank check (length(btrim(regular_season_label)) > 0),
  constraint season_settings_playoff_count_valid check (
    (playoffs_enabled = false and playoff_teams_count is null)
    or (playoffs_enabled = true and playoff_teams_count is not null and playoff_teams_count > 1)
  ),
  constraint season_settings_playout_count_valid check (
    (playouts_enabled = false and playout_teams_count is null)
    or (playouts_enabled = true and playout_teams_count is not null and playout_teams_count > 1)
  )
);

create index if not exists season_settings_season_id_idx on public.season_settings(season_id);

drop trigger if exists season_settings_set_updated_at on public.season_settings;
create trigger season_settings_set_updated_at
before update on public.season_settings
for each row execute function public.set_updated_at();

-- ============================================================
-- Teams and players
-- ============================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  slug text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teams_name_not_blank check (length(btrim(name)) > 0),
  constraint teams_slug_not_blank check (length(btrim(slug)) > 0),
  constraint teams_season_slug_unique unique (season_id, slug),
  constraint teams_season_name_unique unique (season_id, name),
  constraint teams_id_season_id_unique unique (id, season_id)
);

create index if not exists teams_season_id_idx on public.teams(season_id);

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint players_first_name_not_blank check (length(btrim(first_name)) > 0),
  constraint players_last_name_not_blank check (length(btrim(last_name)) > 0),
  constraint players_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create index if not exists players_profile_id_idx on public.players(profile_id);
create index if not exists players_display_name_idx on public.players(display_name);
create index if not exists players_last_first_name_idx on public.players(last_name, first_name);

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null references public.players(id) on delete restrict,
  position smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint team_members_team_season_fk
    foreign key (team_id, season_id)
    references public.teams(id, season_id)
    on delete cascade,
  constraint team_members_position_valid check (position in (1, 2)),
  constraint team_members_one_player_per_season unique (season_id, player_id),
  constraint team_members_one_player_per_team unique (team_id, player_id),
  constraint team_members_one_position_per_team unique (team_id, position)
);

create index if not exists team_members_season_id_idx on public.team_members(season_id);
create index if not exists team_members_team_id_idx on public.team_members(team_id);
create index if not exists team_members_player_id_idx on public.team_members(player_id);

drop trigger if exists team_members_set_updated_at on public.team_members;
create trigger team_members_set_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

create or replace function public.prevent_team_more_than_two_members()
returns trigger
language plpgsql
as $$
declare
  members_count integer;
begin
  select count(*)
    into members_count
    from public.team_members tm
    where tm.team_id = new.team_id
      and tm.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if members_count >= 2 then
    raise exception 'A team cannot have more than 2 players';
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_max_two_members on public.team_members;
create trigger team_members_max_two_members
before insert or update on public.team_members
for each row execute function public.prevent_team_more_than_two_members();

-- ============================================================
-- Matches and match sets
-- ============================================================

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  phase public.match_phase not null default 'regular_season',
  home_team_id uuid not null,
  away_team_id uuid not null,
  scheduled_at timestamptz,
  venue text,
  status public.match_status not null default 'scheduled',
  result_status public.result_status not null default 'pending',
  home_sets_won smallint not null default 0,
  away_sets_won smallint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matches_home_team_season_fk
    foreign key (home_team_id, season_id)
    references public.teams(id, season_id)
    on delete restrict,
  constraint matches_away_team_season_fk
    foreign key (away_team_id, season_id)
    references public.teams(id, season_id)
    on delete restrict,
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_sets_non_negative check (home_sets_won >= 0 and away_sets_won >= 0),
  constraint matches_set_score_valid check (
    (result_status = 'pending' and home_sets_won = 0 and away_sets_won = 0)
    or (
      result_status = 'official'
      and (home_sets_won, away_sets_won) in ((2, 0), (2, 1), (1, 2), (0, 2))
    )
  )
);

create index if not exists matches_season_id_idx on public.matches(season_id);
create index if not exists matches_season_phase_idx on public.matches(season_id, phase);
create index if not exists matches_season_status_idx on public.matches(season_id, status);
create index if not exists matches_scheduled_at_idx on public.matches(scheduled_at);
create index if not exists matches_home_team_id_idx on public.matches(home_team_id);
create index if not exists matches_away_team_id_idx on public.matches(away_team_id);
create index if not exists matches_official_results_idx on public.matches(season_id, phase, result_status);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create table if not exists public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number smallint not null,
  home_games smallint not null,
  away_games smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint match_sets_set_number_valid check (set_number between 1 and 3),
  constraint match_sets_games_non_negative check (home_games >= 0 and away_games >= 0),
  constraint match_sets_match_set_unique unique (match_id, set_number)
);

create index if not exists match_sets_match_id_idx on public.match_sets(match_id);

drop trigger if exists match_sets_set_updated_at on public.match_sets;
create trigger match_sets_set_updated_at
before update on public.match_sets
for each row execute function public.set_updated_at();

-- ============================================================
-- Gallery
-- ============================================================

create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  title text not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gallery_albums_title_not_blank check (length(btrim(title)) > 0),
  constraint gallery_albums_scope_required check (
    season_id is not null or tournament_id is not null
  )
);

create index if not exists gallery_albums_season_id_idx on public.gallery_albums(season_id);
create index if not exists gallery_albums_tournament_id_idx on public.gallery_albums(tournament_id);
create index if not exists gallery_albums_public_idx on public.gallery_albums(is_public);

drop trigger if exists gallery_albums_set_updated_at on public.gallery_albums;
create trigger gallery_albums_set_updated_at
before update on public.gallery_albums
for each row execute function public.set_updated_at();

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order integer not null default 1,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gallery_photos_image_url_not_blank check (length(btrim(image_url)) > 0),
  constraint gallery_photos_sort_order_positive check (sort_order > 0)
);

create index if not exists gallery_photos_album_id_idx on public.gallery_photos(album_id);
create index if not exists gallery_photos_album_sort_idx on public.gallery_photos(album_id, sort_order);
create unique index if not exists gallery_photos_one_cover_per_album_idx
  on public.gallery_photos(album_id)
  where is_cover = true;

drop trigger if exists gallery_photos_set_updated_at on public.gallery_photos;
create trigger gallery_photos_set_updated_at
before update on public.gallery_photos
for each row execute function public.set_updated_at();
