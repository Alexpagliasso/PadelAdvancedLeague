import { supabase } from '@/lib/supabase/client';
import type { StandingRow } from '@/features/standings/lib/standingsEngine';
import type { Database, BracketType, MatchPhase, MatchStatus } from '@/lib/supabase/types';

export type Match = Database['public']['Tables']['matches']['Row'];
export type MatchSet = Database['public']['Tables']['match_sets']['Row'];
export type TournamentBracket = Database['public']['Tables']['tournament_brackets']['Row'];
export type TournamentBracketMatch =
  Database['public']['Tables']['tournament_bracket_matches']['Row'];

export type MatchWithSets = Match & {
  sets: MatchSet[];
};

export type TournamentBracketWithMatches = TournamentBracket & {
  bracketMatches: TournamentBracketMatch[];
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

export type GeneratePlayoffPlayoutInput = {
  tournamentId: string;
  seasonId: string;
  standings: StandingRow[];
};

export type GeneratePlayoffPlayoutResult = {
  generatedPlayoff: boolean;
  generatedPlayout: boolean;
  createdMatches: number;
};

export type ShuffleCalendarOrderInput = {
  seasonId: string;
  teamsCount: number;
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

export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) {
    return 1;
  }

  let current = 1;
  while (current < value) {
    current *= 2;
  }

  return current;
}

export function calculateByeCount(teamCount: number): number {
  return nextPowerOfTwo(teamCount) - teamCount;
}

export function pairHighLow<TItem>(items: TItem[]): [TItem, TItem][] {
  const pairs: [TItem, TItem][] = [];

  for (let index = 0; index < Math.floor(items.length / 2); index += 1) {
    const highSeed = items[index];
    const lowSeed = items[items.length - 1 - index];

    if (highSeed && lowSeed) {
      pairs.push([highSeed, lowSeed]);
    }
  }

  return pairs;
}

function isCompletedMatch(match: MatchWithSets): boolean {
  const hasSetScore = match.home_sets_won + match.away_sets_won > 0;

  return (
    match.status === 'played' ||
    match.result_status === 'official' ||
    hasSetScore ||
    match.sets.length > 0
  );
}

function getRoundLabel(bracketSize: number, roundNumber: number): string {
  const remainingTeams = bracketSize / 2 ** (roundNumber - 1);

  if (remainingTeams <= 2) {
    return 'Finale';
  }

  if (remainingTeams === 4) {
    return 'Semifinale';
  }

  if (remainingTeams === 8) {
    return 'Quarti';
  }

  return `Turno ${roundNumber.toString()}`;
}

export function getMatchWinnerTeamId(match: Match): string | null {
  if (match.home_sets_won > match.away_sets_won) {
    return match.home_team_id;
  }

  if (match.away_sets_won > match.home_sets_won) {
    return match.away_team_id;
  }

  return null;
}

export async function listMatchesBySeason(seasonId: string): Promise<MatchWithSets[]> {
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', seasonId)
    .order('matchday', { ascending: true, nullsFirst: false })
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

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

export async function listTournamentBrackets(
  tournamentId: string
): Promise<TournamentBracketWithMatches[]> {
  const { data: brackets, error: bracketsError } = await supabase
    .from('tournament_brackets')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('bracket_type', { ascending: true });

  if (bracketsError) {
    throw bracketsError;
  }

  const bracketIds = brackets.map((bracket) => bracket.id);

  if (bracketIds.length === 0) {
    return [];
  }

  const { data: bracketMatches, error: bracketMatchesError } = await supabase
    .from('tournament_bracket_matches')
    .select('*')
    .in('bracket_id', bracketIds)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true });

  if (bracketMatchesError) {
    throw bracketMatchesError;
  }

  return brackets.map((bracket) => ({
    ...bracket,
    bracketMatches: bracketMatches.filter((match) => match.bracket_id === bracket.id)
  }));
}

export async function getMatchById(id: string): Promise<Match | null> {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

  if (resultSummary && (data.phase === 'playoff' || data.phase === 'playout')) {
    await updateBracketWinner(data);
  }

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
      scheduled_at: null,
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

  if (data.phase === 'playoff' || data.phase === 'playout') {
    await clearBracketWinner(data.id);
  }

  return data;
}

export async function deleteMatchSafely(matchId: string): Promise<void> {
  const match = await getMatchById(matchId);

  if (!match) {
    throw new Error('Partita non trovata.');
  }

  const { data: sets, error: setsError } = await supabase
    .from('match_sets')
    .select('id')
    .eq('match_id', matchId);

  if (setsError) {
    throw setsError;
  }

  const { data: bracketMatches, error: bracketError } = await supabase
    .from('tournament_bracket_matches')
    .select('id')
    .eq('match_id', matchId);

  if (bracketError) {
    throw bracketError;
  }

  const hasResult =
    match.home_sets_won + match.away_sets_won > 0 ||
    match.status === 'played' ||
    match.result_status === 'official' ||
    sets.length > 0;
  const isBracketMatch =
    bracketMatches.length > 0 || match.phase === 'playoff' || match.phase === 'playout';

  if (hasResult || isBracketMatch) {
    throw new Error('Non puoi eliminare una partita già giocata, con risultato o collegata a un tabellone.');
  }

  const { error } = await supabase.from('matches').delete().eq('id', matchId);

  if (error) {
    throw error;
  }
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
        matchday: null,
        display_order: null,
        notes: null
      });
      existingPairs.add(pairKey);
    }
  }

  if (matchesToInsert.length === 0) {
    return 0;
  }

  const roundSize = Math.max(1, Math.floor(uniqueTeamIds.length / 2));
  const orderedMatchesToInsert = matchesToInsert.map((match, index) => ({
    ...match,
    matchday: Math.floor(index / roundSize) + 1,
    display_order: index + 1
  }));

  const { error } = await supabase.from('matches').insert(orderedMatchesToInsert);

  if (error) {
    throw error;
  }

  return matchesToInsert.length;
}

export async function shuffleCalendarOrder(input: ShuffleCalendarOrderInput): Promise<void> {
  if (input.teamsCount < 2) {
    throw new Error('Servono almeno 2 squadre per rimescolare il calendario.');
  }

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, phase, matchday, display_order, scheduled_at, created_at')
    .eq('season_id', input.seasonId)
    .eq('phase', 'regular_season')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  if (matches.length === 0) {
    throw new Error('Genera il calendario prima di rimescolare l’ordine.');
  }

  const shuffled = [...matches];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    const random = shuffled[randomIndex];

    if (!current || !random) {
      continue;
    }

    shuffled[index] = random;
    shuffled[randomIndex] = current;
  }

  const roundSize = Math.max(1, Math.floor(input.teamsCount / 2));

  for (const [index, match] of shuffled.entries()) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        matchday: Math.floor(index / roundSize) + 1,
        display_order: index + 1
      })
      .eq('id', match.id);

    if (updateError) {
      throw updateError;
    }
  }
}

type BracketSeed = {
  seed: number;
  teamId: string;
  teamName: string;
};

type BracketFixture = {
  home: BracketSeed | null;
  away: BracketSeed | null;
  isBye: boolean;
};

function generateBracketSeedsWithByes(
  qualifiedTeams: StandingRow[],
  allowByes: boolean
): BracketFixture[] {
  if (qualifiedTeams.length < 2) {
    throw new Error('Servono almeno 2 squadre qualificate per generare il tabellone.');
  }

  const byeCount = calculateByeCount(qualifiedTeams.length);

  if (byeCount > 0 && !allowByes) {
    throw new Error(
      'Il numero di squadre qualificate non è una potenza di 2. Abilita i bye automatici.'
    );
  }

  const seeds = qualifiedTeams.map((team) => ({
    seed: team.position,
    teamId: team.teamId,
    teamName: team.teamName
  }));

  const fixtures: BracketFixture[] = [];
  const teamsWithBye = seeds.slice(0, byeCount);
  const teamsToPair = seeds.slice(byeCount);

  teamsWithBye.forEach((seed) => {
    fixtures.push({
      home: seed,
      away: null,
      isBye: true
    });
  });

  pairHighLow(teamsToPair).forEach(([home, away]) => {
    fixtures.push({
      home,
      away,
      isBye: false
    });
  });

  return fixtures;
}

function getExistingGeneratedTypes(
  tournament: Pick<
    Database['public']['Tables']['tournaments']['Row'],
    'playoff_generated_at' | 'playout_generated_at'
  >,
  brackets: Pick<TournamentBracket, 'bracket_type'>[],
  matches: Pick<Match, 'phase'>[]
): Set<BracketType> {
  const generatedTypes = new Set<BracketType>();

  if (tournament.playoff_generated_at) {
    generatedTypes.add('playoff');
  }

  if (tournament.playout_generated_at) {
    generatedTypes.add('playout');
  }

  brackets.forEach((bracket) => {
    generatedTypes.add(bracket.bracket_type);
  });

  matches.forEach((match) => {
    if (match.phase === 'playoff' || match.phase === 'playout') {
      generatedTypes.add(match.phase);
    }
  });

  return generatedTypes;
}

function getAdvancementMappings(currentRoundSize: number): {
  fromPosition: number;
  slot: 'home' | 'away';
  toPosition: number;
}[] {
  const mappings: {
    fromPosition: number;
    slot: 'home' | 'away';
    toPosition: number;
  }[] = [];

  for (let index = 0; index < currentRoundSize / 2; index += 1) {
    mappings.push({
      fromPosition: index + 1,
      toPosition: index + 1,
      slot: 'home'
    });
    mappings.push({
      fromPosition: currentRoundSize - index,
      toPosition: index + 1,
      slot: 'away'
    });
  }

  return mappings;
}

async function createKnockoutMatchIfReady(
  bracketMatchId: string,
  seasonId: string,
  phase: Extract<MatchPhase, 'playoff' | 'playout'>
): Promise<number> {
  const { data: bracketMatch, error: bracketMatchError } = await supabase
    .from('tournament_bracket_matches')
    .select('*')
    .eq('id', bracketMatchId)
    .single();

  if (bracketMatchError) {
    throw bracketMatchError;
  }

  if (
    bracketMatch.match_id ||
    bracketMatch.is_bye ||
    !bracketMatch.home_team_id ||
    !bracketMatch.away_team_id
  ) {
    return 0;
  }

  if (bracketMatch.home_team_id === bracketMatch.away_team_id) {
    return 0;
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .insert({
      season_id: seasonId,
      phase,
      home_team_id: bracketMatch.home_team_id,
      away_team_id: bracketMatch.away_team_id,
      scheduled_at: null,
      venue: null,
      status: 'scheduled',
      result_status: 'pending',
      home_sets_won: 0,
      away_sets_won: 0,
      notes: null
    })
    .select('*')
    .single();

  if (matchError) {
    throw matchError;
  }

  const { error: updateError } = await supabase
    .from('tournament_bracket_matches')
    .update({ match_id: match.id })
    .eq('id', bracketMatch.id)
    .is('match_id', null);

  if (updateError) {
    throw updateError;
  }

  return 1;
}

export async function advanceWinnerToNextMatch(
  bracketMatch: Pick<
    TournamentBracketMatch,
    'advances_to_id' | 'advances_to_slot'
  >,
  winnerTeamId: string,
  seasonId: string,
  phase: Extract<MatchPhase, 'playoff' | 'playout'>
): Promise<number> {
  if (!bracketMatch.advances_to_id || !bracketMatch.advances_to_slot) {
    return 0;
  }

  const updateValues =
    bracketMatch.advances_to_slot === 'home'
      ? { home_team_id: winnerTeamId }
      : { away_team_id: winnerTeamId };

  const { error: updateError } = await supabase
    .from('tournament_bracket_matches')
    .update(updateValues)
    .eq('id', bracketMatch.advances_to_id);

  if (updateError) {
    throw updateError;
  }

  return createKnockoutMatchIfReady(bracketMatch.advances_to_id, seasonId, phase);
}

export async function updateBracketWinner(match: Match): Promise<void> {
  const winnerTeamId = getMatchWinnerTeamId(match);

  if (!winnerTeamId) {
    return;
  }

  const { data: bracketMatch, error: bracketMatchError } = await supabase
    .from('tournament_bracket_matches')
    .select('*')
    .eq('match_id', match.id)
    .maybeSingle();

  if (bracketMatchError) {
    throw bracketMatchError;
  }

  if (!bracketMatch) {
    return;
  }

  if (bracketMatch.winner_team_id === winnerTeamId) {
    return;
  }

  const { error: updateError } = await supabase
    .from('tournament_bracket_matches')
    .update({ winner_team_id: winnerTeamId })
    .eq('id', bracketMatch.id);

  if (updateError) {
    throw updateError;
  }

  if (match.phase === 'playoff' || match.phase === 'playout') {
    await advanceWinnerToNextMatch(bracketMatch, winnerTeamId, match.season_id, match.phase);
  }
}

async function clearBracketWinner(matchId: string): Promise<void> {
  const { error } = await supabase
    .from('tournament_bracket_matches')
    .update({ winner_team_id: null })
    .eq('match_id', matchId);

  if (error) {
    throw error;
  }
}

async function processBracketByes(
  bracketId: string,
  seasonId: string,
  phase: Extract<MatchPhase, 'playoff' | 'playout'>
): Promise<number> {
  const { data: byeMatches, error } = await supabase
    .from('tournament_bracket_matches')
    .select('*')
    .eq('bracket_id', bracketId)
    .eq('is_bye', true)
    .not('winner_team_id', 'is', null)
    .order('position', { ascending: true });

  if (error) {
    throw error;
  }

  let createdMatches = 0;

  for (const byeMatch of byeMatches) {
    if (byeMatch.winner_team_id) {
      createdMatches += await advanceWinnerToNextMatch(
        byeMatch,
        byeMatch.winner_team_id,
        seasonId,
        phase
      );
    }
  }

  return createdMatches;
}

async function createBracket(
  tournamentId: string,
  seasonId: string,
  bracketType: Extract<BracketType, 'knockout' | 'playoff' | 'playout'>,
  name: string,
  qualifiedTeams: StandingRow[],
  allowByes: boolean
): Promise<number> {
  const bracketSize = nextPowerOfTwo(qualifiedTeams.length);
  const fixtures = generateBracketSeedsWithByes(qualifiedTeams, allowByes);
  const roundCount = Math.log2(bracketSize);
  const phase: Extract<MatchPhase, 'playoff' | 'playout'> =
    bracketType === 'playout' ? 'playout' : 'playoff';

  const { data: bracket, error: bracketError } = await supabase
    .from('tournament_brackets')
    .insert({
      tournament_id: tournamentId,
      bracket_type: bracketType,
      name,
      status: 'generated'
    })
    .select('*')
    .single();

  if (bracketError) {
    throw bracketError;
  }

  let createdMatches = 0;
  const rowsByRound: TournamentBracketMatch[][] = [];

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const matchCount = bracketSize / 2 ** roundNumber;
    const roundRows: TournamentBracketMatch[] = [];

    for (let position = 1; position <= matchCount; position += 1) {
      const fixture = roundNumber === 1 ? fixtures[position - 1] ?? null : null;
      let matchId: string | null = null;

      if (fixture?.home && fixture.away) {
        const { data: match, error: matchError } = await supabase
          .from('matches')
          .insert({
            season_id: seasonId,
            phase,
            home_team_id: fixture.home.teamId,
            away_team_id: fixture.away.teamId,
            scheduled_at: null,
            venue: null,
            status: 'scheduled',
            result_status: 'pending',
            home_sets_won: 0,
            away_sets_won: 0,
            notes: null
          })
          .select('*')
          .single();

        if (matchError) {
          throw matchError;
        }

        matchId = match.id;
        createdMatches += 1;
      }

      const { data: bracketMatch, error: bracketMatchError } = await supabase
        .from('tournament_bracket_matches')
        .insert({
          bracket_id: bracket.id,
          match_id: matchId,
          round_number: roundNumber,
          round_label: getRoundLabel(bracketSize, roundNumber),
          position,
          home_seed: fixture?.home?.seed ?? null,
          away_seed: fixture?.away?.seed ?? null,
          home_team_id: fixture?.home?.teamId ?? null,
          away_team_id: fixture?.away?.teamId ?? null,
          winner_team_id: fixture?.isBye
            ? fixture.home?.teamId ?? fixture.away?.teamId ?? null
            : null,
          is_bye: fixture?.isBye ?? false,
          advances_to_id: null,
          advances_to_slot: null
        })
        .select('*')
        .single();

      if (bracketMatchError) {
        throw bracketMatchError;
      }

      roundRows.push(bracketMatch);
    }

    rowsByRound.push(roundRows);
  }

  for (let roundIndex = 0; roundIndex < rowsByRound.length - 1; roundIndex += 1) {
    const currentRound = rowsByRound[roundIndex] ?? [];
    const nextRound = rowsByRound[roundIndex + 1] ?? [];

    for (const mapping of getAdvancementMappings(currentRound.length)) {
      const currentMatch = currentRound.find((row) => row.position === mapping.fromPosition);
      const nextMatch = nextRound.find((row) => row.position === mapping.toPosition);

      if (!currentMatch || !nextMatch) {
        continue;
      }

      const { error: updateError } = await supabase
        .from('tournament_bracket_matches')
        .update({
          advances_to_id: nextMatch.id,
          advances_to_slot: mapping.slot
        })
        .eq('id', currentMatch.id);

      if (updateError) {
        throw updateError;
      }
    }
  }

  createdMatches += await processBracketByes(
    bracket.id,
    seasonId,
    phase
  );

  return createdMatches;
}

export async function generateKnockoutBracket(input: {
  tournamentId: string;
  seasonId: string;
  standings: StandingRow[];
  allowByes: boolean;
}): Promise<number> {
  const { data: existingBrackets, error: bracketsError } = await supabase
    .from('tournament_brackets')
    .select('id')
    .eq('tournament_id', input.tournamentId)
    .eq('bracket_type', 'knockout');

  if (bracketsError) {
    throw bracketsError;
  }

  if (existingBrackets.length > 0) {
    throw new Error('Il tabellone è già stato generato e non può essere modificato.');
  }

  const matches = await listMatchesBySeason(input.seasonId);

  if (matches.some((match) => match.phase === 'playoff' || match.phase === 'playout')) {
    throw new Error('Esistono già partite di tabellone per questo torneo.');
  }

  const createdMatches = await createBracket(
    input.tournamentId,
    input.seasonId,
    'knockout',
    'Tabellone eliminazione diretta',
    input.standings,
    input.allowByes
  );

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('tournaments')
    .update({
      current_phase: 'knockout',
      knockout_generated_at: now
    })
    .eq('id', input.tournamentId);

  if (updateError) {
    throw updateError;
  }

  return createdMatches;
}

export async function generatePlayoffPlayoutBrackets(
  input: GeneratePlayoffPlayoutInput
): Promise<GeneratePlayoffPlayoutResult> {
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', input.tournamentId)
    .single();

  if (tournamentError) {
    throw tournamentError;
  }

  if (tournament.format !== 'group_playoff_playout') {
    throw new Error('Questo torneo non usa la formula Girone + fasi finali.');
  }

  if (!tournament.playoff_teams_count && !tournament.playout_teams_count) {
    throw new Error('Configura almeno playoff o playout prima della generazione.');
  }

  const matches = await listMatchesBySeason(input.seasonId);
  const regularSeasonMatches = matches.filter((match) => match.phase === 'regular_season');

  if (regularSeasonMatches.length === 0) {
    throw new Error('Genera e completa il girone prima di creare playoff e playout.');
  }

  if (!regularSeasonMatches.every(isCompletedMatch)) {
    throw new Error('Completa tutte le partite del girone prima di generare playoff e playout.');
  }

  const { data: existingBrackets, error: bracketsError } = await supabase
    .from('tournament_brackets')
    .select('id, bracket_type')
    .eq('tournament_id', input.tournamentId);

  if (bracketsError) {
    throw bracketsError;
  }

  const existingFinalMatches = matches.filter(
    (match) => match.phase === 'playoff' || match.phase === 'playout'
  );
  const generatedTypes = getExistingGeneratedTypes(tournament, existingBrackets, existingFinalMatches);
  let generatedPlayoff = false;
  let generatedPlayout = false;
  let createdMatches = 0;

  if (tournament.playoff_teams_count && !generatedTypes.has('playoff')) {
    const playoffTeams = input.standings.slice(0, tournament.playoff_teams_count);
    const playoffLabel = tournament.playoff_label?.trim();

    if (playoffTeams.length !== tournament.playoff_teams_count) {
      throw new Error('Non ci sono abbastanza squadre in classifica per generare i playoff.');
    }

    createdMatches += await createBracket(
      input.tournamentId,
      input.seasonId,
      'playoff',
      playoffLabel && playoffLabel.length > 0 ? playoffLabel : 'Playoff',
      playoffTeams,
      tournament.allow_byes
    );
    generatedPlayoff = true;
  }

  if (tournament.playout_teams_count && !generatedTypes.has('playout')) {
    const playoutTeams = input.standings.slice(-tournament.playout_teams_count);
    const playoutLabel = tournament.playout_label?.trim();

    if (playoutTeams.length !== tournament.playout_teams_count) {
      throw new Error('Non ci sono abbastanza squadre in classifica per generare i playout.');
    }

    createdMatches += await createBracket(
      input.tournamentId,
      input.seasonId,
      'playout',
      playoutLabel && playoutLabel.length > 0 ? playoutLabel : 'Playout',
      playoutTeams,
      tournament.allow_byes
    );
    generatedPlayout = true;
  }

  if (!generatedPlayoff && !generatedPlayout) {
    throw new Error('Playoff e playout sono già stati generati.');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('tournaments')
    .update({
      current_phase: 'knockout',
      playoff_generated_at: generatedPlayoff ? now : tournament.playoff_generated_at,
      playout_generated_at: generatedPlayout ? now : tournament.playout_generated_at
    })
    .eq('id', input.tournamentId);

  if (updateError) {
    throw updateError;
  }

  return {
    generatedPlayoff,
    generatedPlayout,
    createdMatches
  };
}
