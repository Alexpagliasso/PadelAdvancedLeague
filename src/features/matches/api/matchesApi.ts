import { supabase } from '@/lib/supabase/client';
import type { Database, MatchStatus } from '@/lib/supabase/types';

export type Match = Database['public']['Tables']['matches']['Row'];
export type MatchSet = Database['public']['Tables']['match_sets']['Row'];

export type MatchWithSets = Match & {
  sets: MatchSet[];
};

export type MatchSetInput = {
  set_number: 1 | 2 | 3;
  home_games: number;
  away_games: number;
};

export type SaveMatchInput = {
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string | null;
  venue: string | null;
  status: MatchStatus;
  sets: MatchSetInput[];
};

export type UpdateMatchInput = SaveMatchInput & {
  id: string;
};

type ResultSummary = {
  home_sets_won: number;
  away_sets_won: number;
};

function getResultSummary(sets: MatchSetInput[]): ResultSummary | null {
  if (sets.length === 0) {
    return null;
  }

  if (sets.length < 2 || sets.length > 3) {
    throw new Error('Il risultato deve contenere 2 o 3 set.');
  }

  let homeSetsWon = 0;
  let awaySetsWon = 0;

  sets.forEach((set) => {
    if (set.home_games < 0 || set.away_games < 0) {
      throw new Error('I game dei set non possono essere negativi.');
    }

    if (set.home_games === set.away_games) {
      throw new Error('Un set non puo finire in pareggio.');
    }

    if (set.home_games > set.away_games) {
      homeSetsWon += 1;
    } else {
      awaySetsWon += 1;
    }
  });

  const isValidResult =
    (homeSetsWon === 2 && awaySetsWon === 0 && sets.length === 2) ||
    (homeSetsWon === 0 && awaySetsWon === 2 && sets.length === 2) ||
    (homeSetsWon === 2 && awaySetsWon === 1 && sets.length === 3) ||
    (homeSetsWon === 1 && awaySetsWon === 2 && sets.length === 3);

  if (!isValidResult) {
    throw new Error('Risultato non valido. Sono ammessi solo 2-0, 2-1, 1-2 o 0-2.');
  }

  return {
    home_sets_won: homeSetsWon,
    away_sets_won: awaySetsWon
  };
}

async function replaceMatchSets(matchId: string, sets: MatchSetInput[]): Promise<void> {
  const { error: deleteError } = await supabase.from('match_sets').delete().eq('match_id', matchId);

  if (deleteError) {
    throw deleteError;
  }

  if (sets.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from('match_sets').insert(
    sets.map((set) => ({
      match_id: matchId,
      set_number: set.set_number,
      home_games: set.home_games,
      away_games: set.away_games
    }))
  );

  if (insertError) {
    throw insertError;
  }
}

function validateTeams(homeTeamId: string, awayTeamId: string): void {
  if (homeTeamId === awayTeamId) {
    throw new Error('Una squadra non puo giocare contro se stessa.');
  }
}

export async function listMatchesBySeason(seasonId: string): Promise<MatchWithSets[]> {
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

export async function createMatch(input: SaveMatchInput): Promise<Match> {
  validateTeams(input.home_team_id, input.away_team_id);
  const resultSummary = getResultSummary(input.sets);

  const { data, error } = await supabase
    .from('matches')
    .insert({
      season_id: input.season_id,
      phase: 'regular_season',
      home_team_id: input.home_team_id,
      away_team_id: input.away_team_id,
      scheduled_at: input.scheduled_at,
      venue: input.venue,
      status: resultSummary ? 'played' : input.status,
      result_status: resultSummary ? 'official' : 'pending',
      home_sets_won: resultSummary?.home_sets_won ?? 0,
      away_sets_won: resultSummary?.away_sets_won ?? 0,
      notes: null
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await replaceMatchSets(data.id, input.sets);

  return data;
}

export async function updateMatch(input: UpdateMatchInput): Promise<Match> {
  validateTeams(input.home_team_id, input.away_team_id);
  const resultSummary = getResultSummary(input.sets);

  const { data, error } = await supabase
    .from('matches')
    .update({
      season_id: input.season_id,
      home_team_id: input.home_team_id,
      away_team_id: input.away_team_id,
      scheduled_at: input.scheduled_at,
      venue: input.venue,
      status: resultSummary ? 'played' : input.status,
      result_status: resultSummary ? 'official' : 'pending',
      home_sets_won: resultSummary?.home_sets_won ?? 0,
      away_sets_won: resultSummary?.away_sets_won ?? 0
    })
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await replaceMatchSets(input.id, input.sets);

  return data;
}

export async function resetMatchResult(id: string): Promise<Match> {
  const { error: setsError } = await supabase.from('match_sets').delete().eq('match_id', id);

  if (setsError) {
    throw setsError;
  }

  const { data, error } = await supabase
    .from('matches')
    .update({
      status: 'scheduled',
      result_status: 'pending',
      home_sets_won: 0,
      away_sets_won: 0
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function generateRoundRobinCalendar(
  seasonId: string,
  teamIds: string[]
): Promise<number> {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));

  if (uniqueTeamIds.length < 2) {
    throw new Error('Servono almeno 2 squadre per generare il calendario.');
  }

  const { data: existingMatches, error: existingMatchesError } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('season_id', seasonId);

  if (existingMatchesError) {
    throw existingMatchesError;
  }

  if (existingMatches.length > 0) {
    throw new Error('Il calendario è già stato generato e non può essere modificato.');
  }

  const existingPairs = new Set(
    existingMatches.map((match) => [match.home_team_id, match.away_team_id].sort().join(':'))
  );

  const matchesToInsert: Database['public']['Tables']['matches']['Insert'][] = [];

  for (let firstIndex = 0; firstIndex < uniqueTeamIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < uniqueTeamIds.length; secondIndex += 1) {
      const homeTeamId = uniqueTeamIds[firstIndex];
      const awayTeamId = uniqueTeamIds[secondIndex];

      if (!homeTeamId || !awayTeamId) {
        continue;
      }

      const pairKey = [homeTeamId, awayTeamId].sort().join(':');

      if (existingPairs.has(pairKey)) {
        continue;
      }

      matchesToInsert.push({
        season_id: seasonId,
        phase: 'regular_season' as const,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        scheduled_at: null,
        venue: null,
        status: 'scheduled' as const,
        result_status: 'pending' as const,
        home_sets_won: 0,
        away_sets_won: 0,
        notes: null
      });
      existingPairs.add(pairKey);
    }
  }

  if (matchesToInsert.length === 0) {
    return 0;
  }

  const { error } = await supabase.from('matches').insert(matchesToInsert);

  if (error) {
    throw error;
  }

  return matchesToInsert.length;
}
