import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import type { MatchWithSets } from '@/features/matches/api/matchesApi';
import { usePublicTournamentQuery } from '@/features/public/api/publicTournamentQueries';
import { calculateStandings } from '@/features/standings/lib/standingsEngine';
import type { TeamWithMembers } from '@/features/teams/api/teamsApi';

import styles from '@/features/public/routes/PublicTournamentRoute.module.scss';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error.';
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

function getTeamName(teams: TeamWithMembers[], teamId: string): string {
  return teams.find((team) => team.id === teamId)?.name ?? 'Squadra';
}

function getScoreLabel(match: MatchWithSets): string {
  if (match.result_status !== 'official') {
    return match.status;
  }

  return `${match.home_sets_won.toString()}-${match.away_sets_won.toString()}`;
}

function getSetsLabel(match: MatchWithSets): string {
  if (match.sets.length === 0) {
    return '';
  }

  return match.sets
    .sort((first, second) => first.set_number - second.set_number)
    .map((set) => `${set.home_games.toString()}-${set.away_games.toString()}`)
    .join(', ');
}

export function PublicTournamentRoute() {
  const params = useParams<{ slug?: string }>();
  const tournamentQuery = usePublicTournamentQuery(params.slug ?? null);
  const data = tournamentQuery.data ?? null;
  const standings = useMemo(
    () => (data ? calculateStandings(data.teams, data.matches) : []),
    [data]
  );

  if (tournamentQuery.isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>Caricamento torneo...</p>
      </main>
    );
  }

  if (tournamentQuery.isError) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{getErrorMessage(tournamentQuery.error)}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyState}>
          <h1>Nessun torneo attivo</h1>
          <p>Non ci sono tornei pubblici attivi da mostrare.</p>
          <Link className={styles.adminLink} to={appPaths.auth}>
            Login admin
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <nav className={styles.nav}>
          <strong>Padel League</strong>
          <Link className={styles.adminLink} to={appPaths.auth}>
            Login admin
          </Link>
        </nav>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Torneo attivo</p>
          <h1>{data.tournament.name}</h1>
          {data.tournament.description ? <p>{data.tournament.description}</p> : null}
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Squadre</h2>
          <span>{data.teams.length.toString()} squadre</span>
        </div>
        <div className={styles.teamGrid}>
          {data.teams.map((team) => (
            <article className={styles.teamCard} key={team.id}>
              {team.logo_url ? (
                <img alt="" className={styles.teamLogo} src={team.logo_url} />
              ) : (
                <span className={styles.logoFallback}>{team.name.slice(0, 1)}</span>
              )}
              <strong>{team.name}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Calendario e risultati</h2>
          <span>{data.matches.length.toString()} partite</span>
        </div>
        <div className={styles.matchList}>
          {data.matches.map((match) => (
            <article className={styles.matchCard} key={match.id}>
              <span className={styles.matchDate}>{formatDateTime(match.scheduled_at)}</span>
              <strong>
                {getTeamName(data.teams, match.home_team_id)} vs{' '}
                {getTeamName(data.teams, match.away_team_id)}
              </strong>
              <span>
                {match.venue ?? 'Luogo da definire'} · {getScoreLabel(match)}
              </span>
              {getSetsLabel(match) ? <small>Set: {getSetsLabel(match)}</small> : null}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Classifica</h2>
          <span>Live</span>
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
                <th>DSG</th>
                <th>DGG</th>
                <th>Pt</th>
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
                  <td>{row.setDiff}</td>
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
    </main>
  );
}
