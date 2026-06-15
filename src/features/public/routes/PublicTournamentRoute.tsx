import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import type { MatchWithSets } from '@/features/matches/api/matchesApi';
import type {
  PublicPlayer,
  PublicTeam,
  PublicTournamentData
} from '@/features/public/api/publicTournamentApi';
import { usePublicTournamentQuery } from '@/features/public/api/publicTournamentQueries';
import { calculateStandings } from '@/features/standings/lib/standingsEngine';

import styles from '@/features/public/routes/PublicTournamentRoute.module.scss';

type PublicTab = 'standings' | 'teams' | 'calendar' | 'results';

const publicTabs: { id: PublicTab; label: string }[] = [
  { id: 'standings', label: 'Classifica' },
  { id: 'teams', label: 'Squadre' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'results', label: 'Risultati' }
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Da programmare';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium'
  }).format(new Date(value));
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function getTeamName(teams: PublicTeam[], teamId: string): string {
  return teams.find((team) => team.id === teamId)?.name ?? 'Squadra';
}

function getOpponentName(match: MatchWithSets, selectedTeamId: string, teams: PublicTeam[]): string {
  const opponentId = match.home_team_id === selectedTeamId ? match.away_team_id : match.home_team_id;
  return getTeamName(teams, opponentId);
}

function getMatchResult(match: MatchWithSets, teams: PublicTeam[]): string {
  if (match.status !== 'played' || match.result_status !== 'official') {
    return 'Da disputare';
  }

  return `${getTeamName(teams, match.home_team_id)} ${match.home_sets_won.toString()} - ${match.away_sets_won.toString()} ${getTeamName(teams, match.away_team_id)}`;
}

function getPlayerLabel(player: PublicPlayer): string {
  return player.display_name || `${player.first_name} ${player.last_name}`.trim();
}

function getTeamDisplayLabel(team: PublicTeam): string {
  const firstPlayer = team.players[0] ?? null;
  const secondPlayer = team.players[1] ?? null;

  if (firstPlayer && secondPlayer) {
    return `${getPlayerLabel(firstPlayer)} - ${getPlayerLabel(secondPlayer)}`;
  }

  if (firstPlayer) {
    return getPlayerLabel(firstPlayer);
  }

  return team.name;
}

function getCompactResult(match: MatchWithSets): string {
  if (match.status !== 'played' || match.result_status !== 'official') {
    return 'Da disputare';
  }

  return `${match.home_sets_won.toString()}-${match.away_sets_won.toString()}`;
}

function getSetsLabel(match: MatchWithSets): string {
  if (match.sets.length === 0) {
    return '';
  }

  return [...match.sets]
    .sort((first, second) => first.set_number - second.set_number)
    .map(
      (set) =>
        `Set ${set.set_number.toString()}: ${set.home_games.toString()}-${set.away_games.toString()}`
    )
    .join(' · ');
}

function sortCalendarMatches(matches: MatchWithSets[]): MatchWithSets[] {
  return [...matches].sort((first, second) => {
    const firstDate = first.scheduled_at ?? first.created_at;
    const secondDate = second.scheduled_at ?? second.created_at;
    return firstDate.localeCompare(secondDate);
  });
}

function sortResultMatches(matches: MatchWithSets[]): MatchWithSets[] {
  return [...matches]
    .filter((match) => match.status === 'played' && match.result_status === 'official')
    .sort((first, second) => {
      const firstDate = first.scheduled_at ?? first.updated_at;
      const secondDate = second.scheduled_at ?? second.updated_at;
      return secondDate.localeCompare(firstDate);
    });
}

export function PublicTournamentRoute() {
  const params = useParams<{ slug?: string }>();
  const tournamentQuery = usePublicTournamentQuery(params.slug ?? null);
  const data = tournamentQuery.data ?? null;

  useEffect(() => {
    document.title = 'PAD - Padel And Drink';
  }, []);

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

  return <PublicTournamentView data={data} />;
}

export function PublicTournamentView({
  data,
  header
}: {
  data: PublicTournamentData;
  header?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<PublicTab>('standings');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const standings = useMemo(
    () => calculateStandings(data.teams, data.matches),
    [data]
  );
  const calendarMatches = useMemo(
    () => sortCalendarMatches(data.matches),
    [data.matches]
  );
  const resultMatches = useMemo(
    () => sortResultMatches(data.matches),
    [data.matches]
  );
  const matchesByTeam = useMemo(() => {
    const groups = new Map<string, MatchWithSets[]>();

    data.teams.forEach((team) => {
      groups.set(
        team.id,
        sortCalendarMatches(
          data.matches.filter(
            (match) => match.home_team_id === team.id || match.away_team_id === team.id
          )
        )
      );
    });

    return groups;
  }, [data]);

  return (
    <main className={styles.page}>
      {header ?? (
        <header className={styles.hero}>
          <nav className={styles.nav}>
            <Link className={styles.adminLink} to={appPaths.auth}>
              Login admin
            </Link>
          </nav>
          <div className={styles.heroContent}>
            <img className={styles.heroLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
            <p className={styles.eyebrow}>Torneo attivo</p>
            <h1>{data.tournament.name}</h1>
            {data.tournament.description ? <p>{data.tournament.description}</p> : null}
          </div>
        </header>
      )}

      <section className={styles.content}>
        <nav className={styles.tabs} aria-label="Sezioni torneo">
          {publicTabs.map((tab) => (
            <button
              className={cx(styles.tabButton, activeTab === tab.id && styles.tabButtonActive)}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'standings' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Classifica</h2>
              <span>Live</span>
            </div>
            <div className={styles.standingsList}>
              {standings.map((row) => (
                <article className={styles.standingCard} key={row.teamId}>
                  <span className={styles.position}>{row.position}</span>
                  <strong>{row.teamName}</strong>
                  <span>PG {row.played}</span>
                  <span>V {row.wins}</span>
                  <span>P {row.losses}</span>
                  <span>DSG {row.setDiff}</span>
                  <span>DGG {row.gameDiff}</span>
                  <b>{row.points} pt</b>
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
        ) : null}

        {activeTab === 'teams' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Squadre</h2>
              <span>{data.teams.length.toString()} squadre</span>
            </div>
            <div className={styles.accordion}>
              {data.teams.map((team) => (
                <TeamAccordionItem
                  isOpen={openTeamId === team.id}
                  key={team.id}
                  matches={matchesByTeam.get(team.id) ?? []}
                  onOpen={() => {
                    setOpenTeamId((current) => (current === team.id ? null : team.id));
                  }}
                  points={standings.find((row) => row.teamId === team.id)?.points ?? 0}
                  team={team}
                  teams={data.teams}
                />
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === 'calendar' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Calendario</h2>
              <span>{calendarMatches.length.toString()} partite</span>
            </div>
            <MatchList matches={calendarMatches} teams={data.teams} emptyLabel="Calendario non disponibile." />
          </section>
        ) : null}

        {activeTab === 'results' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Risultati</h2>
              <span>{resultMatches.length.toString()} disputate</span>
            </div>
            <MatchList matches={resultMatches} teams={data.teams} emptyLabel="Nessun risultato disponibile." />
          </section>
        ) : null}
      </section>
    </main>
  );
}

function TeamAccordionItem({
  isOpen,
  matches,
  onOpen,
  points,
  team,
  teams
}: {
  isOpen: boolean;
  matches: MatchWithSets[];
  onOpen: () => void;
  points: number;
  team: PublicTeam;
  teams: PublicTeam[];
}) {
  const playedCount = matches.filter(
    (match) => match.status === 'played' && match.result_status === 'official'
  ).length;
  const pendingCount = Math.max(0, matches.length - playedCount);

  return (
    <article className={cx(styles.accordionItem, isOpen && styles.accordionItemOpen)}>
      <button
        aria-expanded={isOpen}
        className={styles.accordionHeader}
        onClick={onOpen}
        type="button"
      >
        <span className={styles.teamIdentity}>
          <span className={styles.playerPair}>
            {team.players.length > 0 ? (
              team.players.slice(0, 2).map((player) => (
                <span className={styles.playerIdentity} key={player.id}>
                  {player.photo_url ? (
                    <img alt="" src={player.photo_url} />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden="true" />
                  )}
                  <strong>{getPlayerLabel(player)}</strong>
                </span>
              ))
            ) : (
              <>
                <span className={styles.avatarFallback} aria-hidden="true" />
                <strong>{getTeamDisplayLabel(team)}</strong>
              </>
            )}
          </span>
        </span>
        <span className={styles.teamStats}>
          <b>{points} pt</b>
          <small>{playedCount.toString()} giocate</small>
          <small>{pendingCount.toString()} da giocare</small>
        </span>
      </button>

      {isOpen ? (
        <div className={styles.accordionPanel}>
          {matches.length === 0 ? <p className={styles.muted}>Nessuna partita per questa squadra.</p> : null}
          <div className={styles.matchList}>
            {matches.map((match) => (
              <article
                className={cx(styles.matchCard, styles[`matchCard_${match.status}`])}
                key={match.id}
              >
                <div className={styles.matchTopline}>
                  <strong>vs {getOpponentName(match, team.id, teams)}</strong>
                  <span className={cx(styles.badge, styles[`badge_${match.status}`])}>
                    {match.status}
                  </span>
                </div>
                <dl className={styles.matchMeta}>
                  <div>
                    <dt>Data</dt>
                    <dd>{formatDate(match.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt>Ora</dt>
                    <dd>{formatTime(match.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt>Luogo</dt>
                    <dd>{match.venue ?? 'Da definire'}</dd>
                  </div>
                  <div>
                    <dt>Risultato</dt>
                    <dd>{getCompactResult(match)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MatchList({
  emptyLabel,
  matches,
  teams
}: {
  emptyLabel: string;
  matches: MatchWithSets[];
  teams: PublicTeam[];
}) {
  if (matches.length === 0) {
    return <p className={styles.muted}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.matchList}>
      {matches.map((match) => (
        <article
          className={cx(styles.matchCard, styles[`matchCard_${match.status}`])}
          key={match.id}
        >
          <div className={styles.matchTopline}>
            <strong>
              {getTeamName(teams, match.home_team_id)} vs {getTeamName(teams, match.away_team_id)}
            </strong>
            <span className={cx(styles.badge, styles[`badge_${match.status}`])}>{match.status}</span>
          </div>
          <span>
            {formatDate(match.scheduled_at)} · {formatTime(match.scheduled_at)}
          </span>
          <span>{match.venue ?? 'Luogo da definire'}</span>
          <strong>{getMatchResult(match, teams)}</strong>
          {getSetsLabel(match) ? <small>{getSetsLabel(match)}</small> : null}
        </article>
      ))}
    </div>
  );
}
