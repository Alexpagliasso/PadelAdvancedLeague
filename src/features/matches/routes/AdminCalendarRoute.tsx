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

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium'
  }).format(new Date(value));
}

function getResultLabel(match: MatchWithSets, homeTeamName: string, awayTeamName: string): string {
  if (match.result_status !== 'official' || match.status !== 'played') {
    return 'Da disputare';
  }

  return `${homeTeamName} ${match.home_sets_won.toString()} - ${match.away_sets_won.toString()} ${awayTeamName}`;
}

function getStatusLabel(status: MatchWithSets['status']): string {
  const labels: Record<MatchWithSets['status'], string> = {
    scheduled: 'Scheduled',
    played: 'Played',
    postponed: 'Postponed',
    cancelled: 'Cancelled'
  };

  return labels[status];
}

function getCalendarGeneratedAt(matches: MatchWithSets[]): string | null {
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort((first, second) => first.created_at.localeCompare(second.created_at))[0]
    ?.created_at ?? null;
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
  const calendarGeneratedAt = useMemo(() => getCalendarGeneratedAt(matches), [matches]);
  const isCalendarGenerated = calendarGeneratedAt !== null;

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

    if (isCalendarGenerated) {
      setMessage('Il calendario è già stato generato e non può essere modificato.');
      return;
    }

    const shouldGenerate = window.confirm(
      'Una volta generato il calendario non sarà più possibile rigenerarlo. Continuare?'
    );

    if (!shouldGenerate) {
      return;
    }

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
          disabled={
            !selectedSeasonId ||
            teams.length < 2 ||
            isCalendarGenerated ||
            generateCalendarMutation.isPending
          }
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
        {calendarGeneratedAt ? (
          <p className={styles.successMessage}>Calendario generato il {formatDate(calendarGeneratedAt)}</p>
        ) : null}
        {isCalendarGenerated ? (
          <p className={styles.muted}>Il calendario è già stato generato e non può essere modificato.</p>
        ) : null}
        {!isCalendarGenerated && teams.length < 2 ? (
          <p className={styles.muted}>Servono almeno 2 squadre per generare il calendario.</p>
        ) : null}
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
                (() => {
                  const homeTeamName = getTeamName(match.home_team_id);
                  const awayTeamName = getTeamName(match.away_team_id);

                  return (
                    <Link
                      className={cx(
                        styles.matchCard,
                        match.status === 'played' && styles.matchCardPlayed
                      )}
                      key={match.id}
                      to={`${appPaths.adminMatches}/${match.id}/edit`}
                    >
                      <span className={cx(styles.badge, styles[`badge_${match.status}`])}>
                        {getStatusLabel(match.status)}
                      </span>
                      <strong>
                        {homeTeamName} vs {awayTeamName}
                      </strong>
                      <span>Data: {formatDateTime(match.scheduled_at)}</span>
                      <span>Luogo: {match.venue ?? '-'}</span>
                      <span>{getResultLabel(match, homeTeamName, awayTeamName)}</span>
                    </Link>
                  );
                })()
              ))}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Luogo</th>
                    <th>Squadra A</th>
                    <th>Squadra B</th>
                    <th>Stato</th>
                    <th>Risultato</th>
                  </tr>
                </thead>
                <tbody>
                  {round.matches.map((match) => {
                    const homeTeamName = getTeamName(match.home_team_id);
                    const awayTeamName = getTeamName(match.away_team_id);

                    return (
                      <tr
                        className={match.status === 'played' ? styles.tableRowPlayed : undefined}
                        key={match.id}
                      >
                        <td>
                          <Link to={`${appPaths.adminMatches}/${match.id}/edit`}>
                            {formatDateTime(match.scheduled_at)}
                          </Link>
                        </td>
                        <td>{match.venue ?? '-'}</td>
                        <td>{homeTeamName}</td>
                        <td>{awayTeamName}</td>
                        <td>
                          <span className={cx(styles.badge, styles[`badge_${match.status}`])}>
                            {getStatusLabel(match.status)}
                          </span>
                        </td>
                        <td>{getResultLabel(match, homeTeamName, awayTeamName)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
