import { useEffect, useMemo, useState } from 'react';

import { useMatchesBySeasonQuery } from '@/features/matches/api/matchesQueries';
import { calculateStandings } from '@/features/standings/lib/standingsEngine';
import { useTeamsBySeasonQuery } from '@/features/teams/api/teamsQueries';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';

import styles from '@/features/standings/routes/AdminStandingsRoute.module.scss';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error.';
}

export function AdminStandingsRoute() {
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
  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedSeasonId);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const officialMatchesCount = matches.filter(
    (match) => match.status === 'played' && match.result_status === 'official'
  ).length;
  const standings = useMemo(() => calculateStandings(teams, matches), [matches, teams]);

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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Classifica</h1>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.label}>Torneo attivo</span>
          <select
            className={styles.select}
            onChange={(event) => {
              setSelectedTournamentId(event.target.value || null);
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
        {!tournamentsQuery.isLoading && tournamentOptions.length === 0 ? (
          <p className={styles.muted}>Attiva un torneo per visualizzare la classifica.</p>
        ) : null}
      </div>

      <section className={styles.panel}>
        <div className={styles.summary}>
          <h2 className={styles.panelTitle}>Classifica dinamica</h2>
          <p className={styles.muted}>
            Partite ufficiali considerate: {officialMatchesCount.toString()}
          </p>
        </div>

        {teamsQuery.isError ? <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p> : null}
        {matchesQuery.isError ? (
          <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p>
        ) : null}
        {teamsQuery.isLoading || matchesQuery.isLoading ? (
          <p className={styles.muted}>Calcolo classifica...</p>
        ) : null}
        {!teamsQuery.isLoading && selectedSeasonId && standings.length === 0 ? (
          <p className={styles.muted}>Nessuna squadra disponibile per questo torneo.</p>
        ) : null}

        <div className={styles.mobileList}>
          {standings.map((row) => (
            <article className={styles.card} key={row.teamId}>
              <div className={styles.cardHeader}>
                <strong>
                  {row.position.toString()}. {row.teamName}
                </strong>
                <span>{row.points.toString()} pt</span>
              </div>
              <dl className={styles.statsGrid}>
                <div>
                  <dt>PG</dt>
                  <dd>{row.played}</dd>
                </div>
                <div>
                  <dt>V</dt>
                  <dd>{row.wins}</dd>
                </div>
                <div>
                  <dt>P</dt>
                  <dd>{row.losses}</dd>
                </div>
                <div>
                  <dt>DSG</dt>
                  <dd>{row.setDiff}</dd>
                </div>
                <div>
                  <dt>DGG</dt>
                  <dd>{row.gameDiff}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Squadra</th>
                <th>PG</th>
                <th>V</th>
                <th>P</th>
                <th>SV</th>
                <th>SP</th>
                <th>DSG</th>
                <th>GV</th>
                <th>GP</th>
                <th>DGG</th>
                <th>Punti</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.teamId}>
                  <td>{row.position}</td>
                  <td>{row.teamName}</td>
                  <td>{row.played}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.setsWon}</td>
                  <td>{row.setsLost}</td>
                  <td>{row.setDiff}</td>
                  <td>{row.gamesWon}</td>
                  <td>{row.gamesLost}</td>
                  <td>{row.gameDiff}</td>
                  <td>
                    <strong>{row.points}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
