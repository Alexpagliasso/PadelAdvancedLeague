import type { MatchWithSets } from '@/features/matches/api/matchesApi';
import type { TeamWithMembers } from '@/features/teams/api/teamsApi';

export type StandingRow = {
  teamId: string;
  teamName: string;
  position: number;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  points: number;
  headToHeadPoints: number;
};

type MutableStandingRow = Omit<StandingRow, 'position'>;

function getPointsForSetScore(setsWon: number, setsLost: number): number {
  if (setsWon === 2 && setsLost === 0) {
    return 3;
  }

  if (setsWon === 2 && setsLost === 1) {
    return 2;
  }

  if (setsWon === 1 && setsLost === 2) {
    return 1;
  }

  return 0;
}

function isOfficialPlayedMatch(match: MatchWithSets): boolean {
  return (
    match.status === 'played' &&
    match.result_status === 'official' &&
    match.sets.length >= 2 &&
    match.home_sets_won + match.away_sets_won > 0
  );
}

function createInitialRows(teams: TeamWithMembers[]): Map<string, MutableStandingRow> {
  return new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        played: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        setDiff: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDiff: 0,
        points: 0,
        headToHeadPoints: 0
      }
    ])
  );
}

function applyMatchToRows(rows: Map<string, MutableStandingRow>, match: MatchWithSets): void {
  const homeRow = rows.get(match.home_team_id);
  const awayRow = rows.get(match.away_team_id);

  if (!homeRow || !awayRow || !isOfficialPlayedMatch(match)) {
    return;
  }

  homeRow.played += 1;
  awayRow.played += 1;

  homeRow.setsWon += match.home_sets_won;
  homeRow.setsLost += match.away_sets_won;
  awayRow.setsWon += match.away_sets_won;
  awayRow.setsLost += match.home_sets_won;

  if (match.home_sets_won > match.away_sets_won) {
    homeRow.wins += 1;
    awayRow.losses += 1;
  } else {
    awayRow.wins += 1;
    homeRow.losses += 1;
  }

  homeRow.points += getPointsForSetScore(match.home_sets_won, match.away_sets_won);
  awayRow.points += getPointsForSetScore(match.away_sets_won, match.home_sets_won);

  match.sets.forEach((set) => {
    const isSupertiebreak = set.set_number === 3 && Math.max(set.home_games, set.away_games) >= 10;
    const homeGamesForStandings = isSupertiebreak ? 1 : set.home_games;
    const awayGamesForStandings = isSupertiebreak ? 1 : set.away_games;

    homeRow.gamesWon += homeGamesForStandings;
    homeRow.gamesLost += awayGamesForStandings;
    awayRow.gamesWon += awayGamesForStandings;
    awayRow.gamesLost += homeGamesForStandings;
  });

  homeRow.setDiff = homeRow.setsWon - homeRow.setsLost;
  homeRow.gameDiff = homeRow.gamesWon - homeRow.gamesLost;
  awayRow.setDiff = awayRow.setsWon - awayRow.setsLost;
  awayRow.gameDiff = awayRow.gamesWon - awayRow.gamesLost;
}

function applyHeadToHead(rows: MutableStandingRow[], matches: MatchWithSets[]): void {
  const pointsGroups = new Map<number, MutableStandingRow[]>();

  rows.forEach((row) => {
    const group = pointsGroups.get(row.points) ?? [];
    group.push(row);
    pointsGroups.set(row.points, group);
    row.headToHeadPoints = 0;
  });

  pointsGroups.forEach((group) => {
    if (group.length < 2) {
      return;
    }

    const tiedTeamIds = new Set(group.map((row) => row.teamId));

    matches.forEach((match) => {
      if (
        !isOfficialPlayedMatch(match) ||
        !tiedTeamIds.has(match.home_team_id) ||
        !tiedTeamIds.has(match.away_team_id)
      ) {
        return;
      }

      const homeRow = group.find((row) => row.teamId === match.home_team_id);
      const awayRow = group.find((row) => row.teamId === match.away_team_id);

      if (!homeRow || !awayRow) {
        return;
      }

      homeRow.headToHeadPoints += getPointsForSetScore(
        match.home_sets_won,
        match.away_sets_won
      );
      awayRow.headToHeadPoints += getPointsForSetScore(
        match.away_sets_won,
        match.home_sets_won
      );
    });
  });
}

function compareStandingRows(first: MutableStandingRow, second: MutableStandingRow): number {
  return (
    second.points - first.points ||
    second.headToHeadPoints - first.headToHeadPoints ||
    second.setDiff - first.setDiff ||
    second.gameDiff - first.gameDiff ||
    first.teamName.localeCompare(second.teamName, 'it')
  );
}

export function calculateStandings(
  teams: TeamWithMembers[],
  matches: MatchWithSets[]
): StandingRow[] {
  const rowsByTeam = createInitialRows(teams);

  matches.forEach((match) => {
    applyMatchToRows(rowsByTeam, match);
  });

  const rows = Array.from(rowsByTeam.values());
  applyHeadToHead(rows, matches);

  return rows.sort(compareStandingRows).map((row, index) => ({
    ...row,
    position: index + 1
  }));
}
