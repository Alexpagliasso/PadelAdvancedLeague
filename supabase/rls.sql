-- Padel Advanced League - Supabase RLS policies
-- Ready to run in the Supabase SQL Editor after supabase/schema.sql.
-- No React code. No enterprise RBAC tables. Roles are read from public.profiles.role.

-- ============================================================
-- Role helper functions
-- ============================================================

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'super_admin', false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.is_admin_or_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('super_admin', 'admin'), false)
$$;

create or replace function public.is_public_tournament(tournament_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = tournament_uuid
      and t.is_public = true
      and t.status in ('active', 'archived')
  )
$$;

create or replace function public.is_public_season(season_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.seasons s
    join public.tournaments t on t.id = s.tournament_id
    where s.id = season_uuid
      and s.is_public = true
      and s.status in ('active', 'completed', 'archived')
      and t.is_public = true
      and t.status in ('active', 'archived')
  )
$$;

create or replace function public.is_public_album(album_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gallery_albums ga
    where ga.id = album_uuid
      and ga.is_public = true
      and (
        (ga.season_id is not null and public.is_public_season(ga.season_id))
        or
        (ga.tournament_id is not null and public.is_public_tournament(ga.tournament_id))
      )
  )
$$;

-- ============================================================
-- Enable RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.tournaments enable row level security;
alter table public.seasons enable row level security;
alter table public.season_settings enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.team_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_sets enable row level security;
alter table public.gallery_albums enable row level security;
alter table public.gallery_photos enable row level security;

-- ============================================================
-- profiles
-- Reason: super_admin can administer users; admin can read profiles for operations;
-- normal users can read/update only their own profile and cannot self-promote.
-- ============================================================

drop policy if exists profiles_super_admin_select on public.profiles;
create policy profiles_super_admin_select on public.profiles
for select using (public.is_super_admin());

drop policy if exists profiles_super_admin_insert on public.profiles;
create policy profiles_super_admin_insert on public.profiles
for insert with check (public.is_super_admin());

drop policy if exists profiles_super_admin_update on public.profiles;
create policy profiles_super_admin_update on public.profiles
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists profiles_super_admin_delete on public.profiles;
create policy profiles_super_admin_delete on public.profiles
for delete using (public.is_super_admin());

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
for select using (public.is_admin());

drop policy if exists profiles_user_select_own on public.profiles;
create policy profiles_user_select_own on public.profiles
for select using (auth.uid() = auth_user_id);

drop policy if exists profiles_user_insert_own on public.profiles;
create policy profiles_user_insert_own on public.profiles
for insert with check (auth.uid() = auth_user_id and role = 'user');

drop policy if exists profiles_user_update_own on public.profiles;
create policy profiles_user_update_own on public.profiles
for update
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id and role = 'user');

-- ============================================================
-- notifications
-- Reason: admins manage notifications; users can only read their own notifications.
-- ============================================================

drop policy if exists notifications_super_admin_select on public.notifications;
create policy notifications_super_admin_select on public.notifications
for select using (public.is_super_admin());

drop policy if exists notifications_super_admin_insert on public.notifications;
create policy notifications_super_admin_insert on public.notifications
for insert with check (public.is_super_admin());

drop policy if exists notifications_super_admin_update on public.notifications;
create policy notifications_super_admin_update on public.notifications
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists notifications_super_admin_delete on public.notifications;
create policy notifications_super_admin_delete on public.notifications
for delete using (public.is_super_admin());

drop policy if exists notifications_admin_select on public.notifications;
create policy notifications_admin_select on public.notifications
for select using (public.is_admin());

drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
for insert with check (public.is_admin());

drop policy if exists notifications_admin_update on public.notifications;
create policy notifications_admin_update on public.notifications
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_admin_delete on public.notifications
for delete using (public.is_admin());

drop policy if exists notifications_user_select_own on public.notifications;
create policy notifications_user_select_own on public.notifications
for select using (profile_id = public.current_profile_id());

-- ============================================================
-- tournaments
-- Reason: admins manage tournaments; users read public tournaments only.
-- ============================================================

drop policy if exists tournaments_super_admin_select on public.tournaments;
create policy tournaments_super_admin_select on public.tournaments
for select using (public.is_super_admin());

drop policy if exists tournaments_super_admin_insert on public.tournaments;
create policy tournaments_super_admin_insert on public.tournaments
for insert with check (public.is_super_admin());

drop policy if exists tournaments_super_admin_update on public.tournaments;
create policy tournaments_super_admin_update on public.tournaments
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tournaments_super_admin_delete on public.tournaments;
create policy tournaments_super_admin_delete on public.tournaments
for delete using (public.is_super_admin());

drop policy if exists tournaments_admin_select on public.tournaments;
create policy tournaments_admin_select on public.tournaments
for select using (public.is_admin());

drop policy if exists tournaments_admin_insert on public.tournaments;
create policy tournaments_admin_insert on public.tournaments
for insert with check (public.is_admin());

drop policy if exists tournaments_admin_update on public.tournaments;
create policy tournaments_admin_update on public.tournaments
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists tournaments_admin_delete on public.tournaments;
create policy tournaments_admin_delete on public.tournaments
for delete using (public.is_admin());

drop policy if exists tournaments_user_select_public on public.tournaments;
create policy tournaments_user_select_public on public.tournaments
for select using (is_public = true and status in ('active', 'archived'));

-- ============================================================
-- seasons
-- Reason: admins manage seasons; users read seasons only when both season and tournament are public.
-- ============================================================

drop policy if exists seasons_super_admin_select on public.seasons;
create policy seasons_super_admin_select on public.seasons
for select using (public.is_super_admin());

drop policy if exists seasons_super_admin_insert on public.seasons;
create policy seasons_super_admin_insert on public.seasons
for insert with check (public.is_super_admin());

drop policy if exists seasons_super_admin_update on public.seasons;
create policy seasons_super_admin_update on public.seasons
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists seasons_super_admin_delete on public.seasons;
create policy seasons_super_admin_delete on public.seasons
for delete using (public.is_super_admin());

drop policy if exists seasons_admin_select on public.seasons;
create policy seasons_admin_select on public.seasons
for select using (public.is_admin());

drop policy if exists seasons_admin_insert on public.seasons;
create policy seasons_admin_insert on public.seasons
for insert with check (public.is_admin());

drop policy if exists seasons_admin_update on public.seasons;
create policy seasons_admin_update on public.seasons
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists seasons_admin_delete on public.seasons;
create policy seasons_admin_delete on public.seasons
for delete using (public.is_admin());

drop policy if exists seasons_user_select_public on public.seasons;
create policy seasons_user_select_public on public.seasons
for select using (public.is_public_season(id));

-- ============================================================
-- season_settings
-- Reason: admins manage season settings; users read settings only for public seasons.
-- ============================================================

drop policy if exists season_settings_super_admin_select on public.season_settings;
create policy season_settings_super_admin_select on public.season_settings
for select using (public.is_super_admin());

drop policy if exists season_settings_super_admin_insert on public.season_settings;
create policy season_settings_super_admin_insert on public.season_settings
for insert with check (public.is_super_admin());

drop policy if exists season_settings_super_admin_update on public.season_settings;
create policy season_settings_super_admin_update on public.season_settings
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists season_settings_super_admin_delete on public.season_settings;
create policy season_settings_super_admin_delete on public.season_settings
for delete using (public.is_super_admin());

drop policy if exists season_settings_admin_select on public.season_settings;
create policy season_settings_admin_select on public.season_settings
for select using (public.is_admin());

drop policy if exists season_settings_admin_insert on public.season_settings;
create policy season_settings_admin_insert on public.season_settings
for insert with check (public.is_admin());

drop policy if exists season_settings_admin_update on public.season_settings;
create policy season_settings_admin_update on public.season_settings
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists season_settings_admin_delete on public.season_settings;
create policy season_settings_admin_delete on public.season_settings
for delete using (public.is_admin());

drop policy if exists season_settings_user_select_public on public.season_settings;
create policy season_settings_user_select_public on public.season_settings
for select using (public.is_public_season(season_id));

-- ============================================================
-- teams
-- Reason: admins manage teams; users read teams belonging to public seasons.
-- ============================================================

drop policy if exists teams_super_admin_select on public.teams;
create policy teams_super_admin_select on public.teams
for select using (public.is_super_admin());

drop policy if exists teams_super_admin_insert on public.teams;
create policy teams_super_admin_insert on public.teams
for insert with check (public.is_super_admin());

drop policy if exists teams_super_admin_update on public.teams;
create policy teams_super_admin_update on public.teams
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists teams_super_admin_delete on public.teams;
create policy teams_super_admin_delete on public.teams
for delete using (public.is_super_admin());

drop policy if exists teams_admin_select on public.teams;
create policy teams_admin_select on public.teams
for select using (public.is_admin());

drop policy if exists teams_admin_insert on public.teams;
create policy teams_admin_insert on public.teams
for insert with check (public.is_admin());

drop policy if exists teams_admin_update on public.teams;
create policy teams_admin_update on public.teams
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists teams_admin_delete on public.teams;
create policy teams_admin_delete on public.teams
for delete using (public.is_admin());

drop policy if exists teams_user_select_public on public.teams;
create policy teams_user_select_public on public.teams
for select using (public.is_public_season(season_id));

-- ============================================================
-- players
-- Reason: admins manage players; users can read players visible through public team memberships.
-- ============================================================

drop policy if exists players_super_admin_select on public.players;
create policy players_super_admin_select on public.players
for select using (public.is_super_admin());

drop policy if exists players_super_admin_insert on public.players;
create policy players_super_admin_insert on public.players
for insert with check (public.is_super_admin());

drop policy if exists players_super_admin_update on public.players;
create policy players_super_admin_update on public.players
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists players_super_admin_delete on public.players;
create policy players_super_admin_delete on public.players
for delete using (public.is_super_admin());

drop policy if exists players_admin_select on public.players;
create policy players_admin_select on public.players
for select using (public.is_admin());

drop policy if exists players_admin_insert on public.players;
create policy players_admin_insert on public.players
for insert with check (public.is_admin());

drop policy if exists players_admin_update on public.players;
create policy players_admin_update on public.players
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists players_admin_delete on public.players;
create policy players_admin_delete on public.players
for delete using (public.is_admin());

drop policy if exists players_user_select_public_or_own on public.players;
create policy players_user_select_public_or_own on public.players
for select using (
  profile_id = public.current_profile_id()
  or exists (
    select 1
    from public.team_members tm
    where tm.player_id = players.id
      and public.is_public_season(tm.season_id)
  )
);

-- ============================================================
-- team_members
-- Reason: admins manage team composition; users read memberships only for public seasons.
-- ============================================================

drop policy if exists team_members_super_admin_select on public.team_members;
create policy team_members_super_admin_select on public.team_members
for select using (public.is_super_admin());

drop policy if exists team_members_super_admin_insert on public.team_members;
create policy team_members_super_admin_insert on public.team_members
for insert with check (public.is_super_admin());

drop policy if exists team_members_super_admin_update on public.team_members;
create policy team_members_super_admin_update on public.team_members
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists team_members_super_admin_delete on public.team_members;
create policy team_members_super_admin_delete on public.team_members
for delete using (public.is_super_admin());

drop policy if exists team_members_admin_select on public.team_members;
create policy team_members_admin_select on public.team_members
for select using (public.is_admin());

drop policy if exists team_members_admin_insert on public.team_members;
create policy team_members_admin_insert on public.team_members
for insert with check (public.is_admin());

drop policy if exists team_members_admin_update on public.team_members;
create policy team_members_admin_update on public.team_members
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists team_members_admin_delete on public.team_members;
create policy team_members_admin_delete on public.team_members
for delete using (public.is_admin());

drop policy if exists team_members_user_select_public on public.team_members;
create policy team_members_user_select_public on public.team_members
for select using (public.is_public_season(season_id));

-- ============================================================
-- matches
-- Reason: admins manage matches and results; users read matches only for public seasons.
-- ============================================================

drop policy if exists matches_super_admin_select on public.matches;
create policy matches_super_admin_select on public.matches
for select using (public.is_super_admin());

drop policy if exists matches_super_admin_insert on public.matches;
create policy matches_super_admin_insert on public.matches
for insert with check (public.is_super_admin());

drop policy if exists matches_super_admin_update on public.matches;
create policy matches_super_admin_update on public.matches
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists matches_super_admin_delete on public.matches;
create policy matches_super_admin_delete on public.matches
for delete using (public.is_super_admin());

drop policy if exists matches_admin_select on public.matches;
create policy matches_admin_select on public.matches
for select using (public.is_admin());

drop policy if exists matches_admin_insert on public.matches;
create policy matches_admin_insert on public.matches
for insert with check (public.is_admin());

drop policy if exists matches_admin_update on public.matches;
create policy matches_admin_update on public.matches
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists matches_admin_delete on public.matches;
create policy matches_admin_delete on public.matches
for delete using (public.is_admin());

drop policy if exists matches_user_select_public on public.matches;
create policy matches_user_select_public on public.matches
for select using (public.is_public_season(season_id));

-- ============================================================
-- match_sets
-- Reason: admins manage set scores; users read set scores only for public matches/seasons.
-- ============================================================

drop policy if exists match_sets_super_admin_select on public.match_sets;
create policy match_sets_super_admin_select on public.match_sets
for select using (public.is_super_admin());

drop policy if exists match_sets_super_admin_insert on public.match_sets;
create policy match_sets_super_admin_insert on public.match_sets
for insert with check (public.is_super_admin());

drop policy if exists match_sets_super_admin_update on public.match_sets;
create policy match_sets_super_admin_update on public.match_sets
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists match_sets_super_admin_delete on public.match_sets;
create policy match_sets_super_admin_delete on public.match_sets
for delete using (public.is_super_admin());

drop policy if exists match_sets_admin_select on public.match_sets;
create policy match_sets_admin_select on public.match_sets
for select using (public.is_admin());

drop policy if exists match_sets_admin_insert on public.match_sets;
create policy match_sets_admin_insert on public.match_sets
for insert with check (public.is_admin());

drop policy if exists match_sets_admin_update on public.match_sets;
create policy match_sets_admin_update on public.match_sets
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists match_sets_admin_delete on public.match_sets;
create policy match_sets_admin_delete on public.match_sets
for delete using (public.is_admin());

drop policy if exists match_sets_user_select_public on public.match_sets;
create policy match_sets_user_select_public on public.match_sets
for select using (
  exists (
    select 1
    from public.matches m
    where m.id = match_sets.match_id
      and public.is_public_season(m.season_id)
  )
);

-- ============================================================
-- gallery_albums
-- Reason: admins manage gallery albums; users read only public albums in public scope.
-- ============================================================

drop policy if exists gallery_albums_super_admin_select on public.gallery_albums;
create policy gallery_albums_super_admin_select on public.gallery_albums
for select using (public.is_super_admin());

drop policy if exists gallery_albums_super_admin_insert on public.gallery_albums;
create policy gallery_albums_super_admin_insert on public.gallery_albums
for insert with check (public.is_super_admin());

drop policy if exists gallery_albums_super_admin_update on public.gallery_albums;
create policy gallery_albums_super_admin_update on public.gallery_albums
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists gallery_albums_super_admin_delete on public.gallery_albums;
create policy gallery_albums_super_admin_delete on public.gallery_albums
for delete using (public.is_super_admin());

drop policy if exists gallery_albums_admin_select on public.gallery_albums;
create policy gallery_albums_admin_select on public.gallery_albums
for select using (public.is_admin());

drop policy if exists gallery_albums_admin_insert on public.gallery_albums;
create policy gallery_albums_admin_insert on public.gallery_albums
for insert with check (public.is_admin());

drop policy if exists gallery_albums_admin_update on public.gallery_albums;
create policy gallery_albums_admin_update on public.gallery_albums
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists gallery_albums_admin_delete on public.gallery_albums;
create policy gallery_albums_admin_delete on public.gallery_albums
for delete using (public.is_admin());

drop policy if exists gallery_albums_user_select_public on public.gallery_albums;
create policy gallery_albums_user_select_public on public.gallery_albums
for select using (
  is_public = true
  and (
    (season_id is not null and public.is_public_season(season_id))
    or
    (tournament_id is not null and public.is_public_tournament(tournament_id))
  )
);

-- ============================================================
-- gallery_photos
-- Reason: admins manage gallery photos; users read photos only from public albums.
-- ============================================================

drop policy if exists gallery_photos_super_admin_select on public.gallery_photos;
create policy gallery_photos_super_admin_select on public.gallery_photos
for select using (public.is_super_admin());

drop policy if exists gallery_photos_super_admin_insert on public.gallery_photos;
create policy gallery_photos_super_admin_insert on public.gallery_photos
for insert with check (public.is_super_admin());

drop policy if exists gallery_photos_super_admin_update on public.gallery_photos;
create policy gallery_photos_super_admin_update on public.gallery_photos
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists gallery_photos_super_admin_delete on public.gallery_photos;
create policy gallery_photos_super_admin_delete on public.gallery_photos
for delete using (public.is_super_admin());

drop policy if exists gallery_photos_admin_select on public.gallery_photos;
create policy gallery_photos_admin_select on public.gallery_photos
for select using (public.is_admin());

drop policy if exists gallery_photos_admin_insert on public.gallery_photos;
create policy gallery_photos_admin_insert on public.gallery_photos
for insert with check (public.is_admin());

drop policy if exists gallery_photos_admin_update on public.gallery_photos;
create policy gallery_photos_admin_update on public.gallery_photos
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists gallery_photos_admin_delete on public.gallery_photos;
create policy gallery_photos_admin_delete on public.gallery_photos
for delete using (public.is_admin());

drop policy if exists gallery_photos_user_select_public on public.gallery_photos;
create policy gallery_photos_user_select_public on public.gallery_photos
for select using (public.is_public_album(album_id));
