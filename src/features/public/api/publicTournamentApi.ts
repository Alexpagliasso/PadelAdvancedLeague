import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import type { MatchWithSets, TournamentBracketWithMatches } from '@/features/matches/api/matchesApi';
import { listTournamentBrackets } from '@/features/matches/api/matchesApi';
import type { TeamWithMembers } from '@/features/teams/api/teamsApi';

export type PublicTournament = Database['public']['Tables']['tournaments']['Row'];
export type PublicSeason = Database['public']['Tables']['seasons']['Row'];
export type PublicPlayer = Database['public']['Tables']['players']['Row'];
export type PublicTeam = TeamWithMembers & {
  players: PublicPlayer[];
};
export type PublicTournamentData = {
  tournament: PublicTournament;
  season: PublicSeason;
  teams: PublicTeam[];
  matches: MatchWithSets[];
  brackets: TournamentBracketWithMatches[];
};

export async function listPublicTournaments(): Promise<PublicTournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('is_public', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

async function getPublicTournament(slug: string | null): Promise<PublicTournament | null> {
  const query = supabase
    .from('tournaments')
    .select('*')
    .eq('is_public', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const { data, error } = slug
    ? await query.eq('slug', slug).maybeSingle()
    : await query.limit(1).maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getMainSeason(tournamentId: string): Promise<PublicSeason | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('slug', 'main')
    .eq('is_public', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function listPublicTeams(seasonId: string): Promise<PublicTeam[]> {
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .eq('season_id', seasonId)
    .order('name', { ascending: true });

  if (teamsError) {
    throw teamsError;
  }

  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('*')
    .eq('season_id', seasonId)
    .order('position', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const playerIds = Array.from(new Set(members.map((member) => member.player_id)));
  const { data: players, error: playersError } =
    playerIds.length > 0
      ? await supabase.from('players').select('*').in('id', playerIds)
      : { data: [], error: null };

  if (playersError) {
    throw playersError;
  }

  return teams.map((team) => {
    const teamMembers = members.filter((member) => member.team_id === team.id);
    const teamPlayers = teamMembers
      .map((member) => players.find((player) => player.id === member.player_id) ?? null)
      .filter((player): player is PublicPlayer => player !== null);

    return {
      ...team,
      members: teamMembers,
      players: teamPlayers
    };
  });
}

async function listPublicMatches(seasonId: string): Promise<MatchWithSets[]> {
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', seasonId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (matchesError) {
    throw matchesError;
  }

  const matchIds = matches.map((match) => match.id);

  if (matchIds.length === 0) {
    return [];
  }

  const { data: sets, error: setsError } = await supabase
    .from('match_sets')
    .select('*')
    .in('match_id', matchIds)
    .order('set_number', { ascending: true });

  if (setsError) {
    throw setsError;
  }

  return matches.map((match) => ({
    ...match,
    sets: sets.filter((set) => set.match_id === match.id)
  }));
}

export async function getPublicTournamentData(slug: string | null): Promise<PublicTournamentData | null> {
  const tournament = await getPublicTournament(slug);

  if (!tournament) {
    return null;
  }

  const season = await getMainSeason(tournament.id);

  if (!season) {
    return null;
  }

  const [teams, matches, brackets] = await Promise.all([
    listPublicTeams(season.id),
    listPublicMatches(season.id),
    listTournamentBrackets(tournament.id)
  ]);

  return {
    tournament,
    season,
    teams,
    matches,
    brackets
  };
}
