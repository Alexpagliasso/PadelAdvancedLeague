import type { TournamentBracketMatch } from '@/features/matches/api/matchesApi';
import type { BracketSlot } from '@/lib/supabase/types';

type BracketMatchDisplayData = Pick<
  TournamentBracketMatch,
  'advances_to_id' | 'advances_to_slot' | 'id' | 'position' | 'round_label'
>;

export function getBracketMatchCode(roundLabel: string, position: number): string {
  const normalizedLabel = roundLabel.trim().toLowerCase();
  const prefix = (() => {
    if (normalizedLabel.includes('trentadues')) {
      return 'T';
    }

    if (normalizedLabel.includes('sedices')) {
      return 'SED';
    }

    if (normalizedLabel.includes('ottav')) {
      return 'O';
    }

    if (normalizedLabel.includes('quart')) {
      return 'Q';
    }

    if (normalizedLabel.includes('semifinal')) {
      return 'S';
    }

    if (normalizedLabel.includes('final')) {
      return 'F';
    }

    return 'M';
  })();

  return `${prefix}${position.toString()}`;
}

export function createBracketSourceMap(
  bracketMatches: BracketMatchDisplayData[]
): Map<string, string> {
  const sourceMap = new Map<string, string>();

  bracketMatches.forEach((bracketMatch) => {
    if (!bracketMatch.advances_to_id || !bracketMatch.advances_to_slot) {
      return;
    }

    sourceMap.set(
      `${bracketMatch.advances_to_id}:${bracketMatch.advances_to_slot}`,
      getBracketMatchCode(bracketMatch.round_label, bracketMatch.position)
    );
  });

  return sourceMap;
}

export function getBracketSlotLabel({
  bracketMatch,
  getTeamLabel,
  sourceMap,
  slot
}: {
  bracketMatch: Pick<TournamentBracketMatch, 'away_team_id' | 'home_team_id' | 'id'>;
  getTeamLabel: (teamId: string) => string;
  sourceMap: Map<string, string>;
  slot: BracketSlot;
}): string {
  const teamId = slot === 'home' ? bracketMatch.home_team_id : bracketMatch.away_team_id;

  if (teamId) {
    return getTeamLabel(teamId);
  }

  const sourceMatchCode = sourceMap.get(`${bracketMatch.id}:${slot}`);

  if (sourceMatchCode) {
    return `Vincente ${sourceMatchCode}`;
  }

  return 'Da definire';
}
