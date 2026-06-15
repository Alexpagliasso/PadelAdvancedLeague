import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import type { MatchWithSets } from '@/features/matches/api/matchesApi';
import {
  useGenerateCalendarMutation,
  useMatchesBySeasonQuery
} from '@/features/matches/api/matchesQueries';
import { useTeamsBySeasonQuery } from '@/features/teams/api/teamsQueries';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';

import styles from '@/features/matches/routes/AdminCalendarRoute.module.scss';

type CalendarRound = {
  label: string;
  matches: MatchWithSets[];
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Da programmare';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getRounds(matches: MatchWithSets[], teamsCount: number): CalendarRound[] {
  const roundSize = Math.max(1, Math.floor(teamsCount / 2));
  const sortedMatches = [...matches].sort((first, second) => {
    const firstDate = first.scheduled_at ?? first.created_at;
    const secondDate = second.scheduled_at ?? second.created_at;
    return firstDate.localeCompare(secondDate);
  });

  const rounds: CalendarRound[] = [];

  for (let index = 0; index < sortedMatches.length; index += roundSize) {
    rounds.push({
      label: `Giornata ${(Math.floor(index / roundSize) + 1).toString()}`,
      matches: sortedMatches.slice(index, index + roundSize)
    });
  }

  return rounds;
}

export function AdminCalendarRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();

  const tournamentOptions = useMemo(
    () =>
      (tournamentsQuery.data ?? [])
        .filter((tournament) => tournament.status === 'active')
        .map((tournament) => ({
          id: tournament.id,
          name: tournament.name,
          mainSeasonId:
            tournament.seasons.find((season) => season.slug === 'main')?.id ??
            tournament.seasons[0]?.id ??
            null
        }))
        .filter((tournament) => tournament.mainSeasonId !== null),
    [tournamentsQuery.data]
  );

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedSeasonId);
  const generateCalendarMutation = useGenerateCalendarMutation(selectedSeasonId);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const rounds = useMemo(() => getRounds(matches, teams.length), [matches, teams.length]);

  useEffect(() => {
    if (selectedTournamentId && tournamentOptions.some((option) => option.id === selectedTournamentId)) {
      return;
    }

    if (tournamentOptions.length > 0) {
      setSelectedTournamentId(tournamentOptions[0]?.id ?? null);
      return;
    }

    setSelectedTournamentId(null);
  }, [selectedTournamentId, tournamentOptions]);

  const getTeamName = (teamId: string): string => {
    const team = teams.find((item) => item.id === teamId);
    return team?.name ?? 'Squadra';
  };

  const handleGenerateCalendar = async () => {
    setMessage(null);

    try {
      const createdCount = await generateCalendarMutation.mutateAsync({
        teamIds: teams.map((team) => team.id)
      });
      setMessage(
        createdCount > 0
          ? `Calendario generato: ${createdCount.toString()} partite create.`
          : 'Calendario gia completo: nessuna partita creata.'
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Calendario</h1>
        </div>
        <button
          className={styles.button}
          disabled={!selectedSeasonId || teams.length < 2 || generateCalendarMutation.isPending}
          onClick={() => void handleGenerateCalendar()}
          type="button"
        >
          Genera calendario
        </button>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.label}>Torneo attivo</span>
          <select
            className={styles.select}
            onChange={(event) => {
              setSelectedTournamentId(event.target.value || null);
              setMessage(null);
            }}
            value={selectedTournamentId ?? ''}
          >
            <option value="">Seleziona torneo</option>
            {tournamentOptions.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </label>
        {message ? <p className={styles.muted}>{message}</p> : null}
      </div>

      {matchesQuery.isError ? <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p> : null}
      {teamsQuery.isError ? <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p> : null}

      <div className={styles.rounds}>
        {rounds.map((round) => (
          <section className={styles.panel} key={round.label}>
            <h2 className={styles.panelTitle}>{round.label}</h2>
            <div className={styles.mobileList}>
              {round.matches.map((match) => (
                <Link
                  className={cx(styles.matchCard, match.status === 'played' && styles.matchCardPlayed)}
                  key={match.id}
                  to={`${appPaths.adminMatches}/${match.id}/edit`}
                >
                  <strong>
                    {getTeamName(match.home_team_id)} vs {getTeamName(match.away_team_id)}
                  </strong>
                  <span>{formatDateTime(match.scheduled_at)}</span>
                  <span>{match.status}</span>
                </Link>
              ))}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Partita</th>
                    <th>Data</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {round.matches.map((match) => (
                    <tr
                      className={match.status === 'played' ? styles.tableRowPlayed : undefined}
                      key={match.id}
                    >
                      <td>
                        <Link to={`${appPaths.adminMatches}/${match.id}/edit`}>
                          {getTeamName(match.home_team_id)} vs {getTeamName(match.away_team_id)}
                        </Link>
                      </td>
                      <td>{formatDateTime(match.scheduled_at)}</td>
                      <td>{match.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
