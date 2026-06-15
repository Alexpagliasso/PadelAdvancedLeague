import type { MatchWithSets } from '@/features/matches/api/matchesApi';

type MatchWithOptionalSetRelations = Pick<MatchWithSets, 'status' | 'result_status'> &
  Partial<Pick<MatchWithSets, 'sets'>> & {
    home_sets_won: number | string | null;
    away_sets_won: number | string | null;
    match_sets?: unknown[];
  };

type MatchFixture = MatchWithOptionalSetRelations & {
  away_team_id: string;
  created_at?: string;
  home_team_id: string;
  id: string;
  scheduled_at?: string | null;
  season_id: string;
  updated_at?: string;
};

export function isMatchPlayed(match: MatchWithOptionalSetRelations): boolean {
  const homeSetsWon = Number(match.home_sets_won);
  const awaySetsWon = Number(match.away_sets_won);
  const hasSetScore =
    Number.isFinite(homeSetsWon) && Number.isFinite(awaySetsWon) && homeSetsWon + awaySetsWon > 0;
  const hasSets = Array.isArray(match.sets) && match.sets.length > 0;
  const hasMatchSets = Array.isArray(match.match_sets) && match.match_sets.length > 0;

  return (
    match.status === 'played' ||
    match.result_status === 'official' ||
    hasSetScore ||
    hasSets ||
    hasMatchSets
  );
}

function getFixtureKey(match: MatchFixture): string {
  return `${match.season_id}:${[match.home_team_id, match.away_team_id].sort().join(':')}`;
}

function getMatchTimestamp(match: MatchFixture): string {
  return match.updated_at ?? match.scheduled_at ?? match.created_at ?? '';
}

function shouldReplaceFixtureMatch(current: MatchFixture, candidate: MatchFixture): boolean {
  const currentIsPlayed = isMatchPlayed(current);
  const candidateIsPlayed = isMatchPlayed(candidate);

  if (candidateIsPlayed !== currentIsPlayed) {
    return candidateIsPlayed;
  }

  return getMatchTimestamp(candidate).localeCompare(getMatchTimestamp(current)) > 0;
}

export function getUniqueMatchesByFixture<TMatch extends MatchFixture>(matches: TMatch[]): TMatch[] {
  const uniqueMatches = new Map<string, TMatch>();

  matches.forEach((match) => {
    const key = getFixtureKey(match);
    const current = uniqueMatches.get(key);

    if (!current || shouldReplaceFixtureMatch(current, match)) {
      uniqueMatches.set(key, match);
    }
  });

  return Array.from(uniqueMatches.values());
}
