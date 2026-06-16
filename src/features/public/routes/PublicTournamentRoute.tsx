import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaCalendarDays, FaRankingStar, FaTrophy, FaUsers } from 'react-icons/fa6';
import {
  MdAdminPanelSettings,
  MdCancel,
  MdCheckCircle,
  MdDarkMode,
  MdEventBusy,
  MdLightMode,
  MdSchedule
} from 'react-icons/md';
import { Link, useParams } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import type { MatchWithSets } from '@/features/matches/api/matchesApi';
import type {
  PublicPlayer,
  PublicTeam,
  PublicTournament,
  PublicTournamentData
} from '@/features/public/api/publicTournamentApi';
import {
  usePublicTournamentQuery,
  usePublicTournamentsQuery
} from '@/features/public/api/publicTournamentQueries';
import {
  formatMatchDate,
  formatMatchTime
} from '@/features/matches/lib/matchDateTime';
import { getUniqueMatchesByFixture, isMatchPlayed } from '@/features/matches/lib/matchStatus';
import { calculateStandings } from '@/features/standings/lib/standingsEngine';

import styles from '@/features/public/routes/PublicTournamentRoute.module.scss';

type PublicTab = 'standings' | 'teams' | 'calendar' | 'results';
type PublicTheme = 'light' | 'dark';

const publicTabs: { icon: IconType; id: PublicTab; label: string }[] = [
  { icon: FaRankingStar, id: 'standings', label: 'Classifica' },
  { icon: FaUsers, id: 'teams', label: 'Squadre' },
  { icon: FaCalendarDays, id: 'calendar', label: 'Calendario' },
  { icon: MdCheckCircle, id: 'results', label: 'Risultati' }
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Errore imprevisto.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getInitialPublicTheme(): PublicTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.localStorage.getItem('pad-public-theme') === 'dark' ? 'dark' : 'light';
}

function usePublicTheme() {
  const [theme, setTheme] = useState<PublicTheme>(getInitialPublicTheme);

  useEffect(() => {
    window.localStorage.setItem('pad-public-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggleTheme };
}

function getTeamName(teams: PublicTeam[], teamId: string): string {
  return teams.find((team) => team.id === teamId)?.name ?? 'Squadra';
}

function getOpponentName(match: MatchWithSets, selectedTeamId: string, teams: PublicTeam[]): string {
  const opponentId = match.home_team_id === selectedTeamId ? match.away_team_id : match.home_team_id;
  return getTeamName(teams, opponentId);
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
  if (!isMatchPlayed(match)) {
    return 'Da disputare';
  }

  return `${match.home_sets_won.toString()} - ${match.away_sets_won.toString()}`;
}

function getWinnerTeamId(match: MatchWithSets): string | null {
  if (!isMatchPlayed(match)) {
    return null;
  }

  if (match.home_sets_won > match.away_sets_won) {
    return match.home_team_id;
  }

  if (match.away_sets_won > match.home_sets_won) {
    return match.away_team_id;
  }

  return null;
}

function getTeamMatchOutcome(teamId: string, match: MatchWithSets): 'win' | 'loss' | null {
  if (!isMatchPlayed(match)) {
    return null;
  }

  if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
    return null;
  }

  const homeWon = match.home_sets_won > match.away_sets_won;
  const selectedTeamIsHome = match.home_team_id === teamId;
  const selectedTeamWon = selectedTeamIsHome ? homeWon : !homeWon;

  return selectedTeamWon ? 'win' : 'loss';
}

function getMatchSortDate(match: MatchWithSets): string {
  return match.scheduled_at ?? match.updated_at;
}

function getLastPlayedMatchForTeam(teamId: string, matches: MatchWithSets[]): MatchWithSets | null {
  const playedMatches = matches.filter(
    (match) =>
      isMatchPlayed(match) && (match.home_team_id === teamId || match.away_team_id === teamId)
  );

  if (playedMatches.length === 0) {
    return null;
  }

  return [...playedMatches].sort((first, second) =>
    getMatchSortDate(second).localeCompare(getMatchSortDate(first))
  )[0] ?? null;
}

function getStatusLabel(status: MatchWithSets['status']): string {
  const labels: Record<MatchWithSets['status'], string> = {
    scheduled: 'Da disputare',
    played: 'Giocata',
    postponed: 'Rinviata',
    cancelled: 'Annullata'
  };

  return labels[status];
}

function getStatusIcon(status: MatchWithSets['status']): IconType {
  const icons: Record<MatchWithSets['status'], IconType> = {
    scheduled: MdSchedule,
    played: MdCheckCircle,
    postponed: MdEventBusy,
    cancelled: MdCancel
  };

  return icons[status];
}

function getPodiumIcon(position: number): IconType | null {
  if (position >= 1 && position <= 3) {
    return FaRankingStar;
  }

  return null;
}

function getPodiumClass(position: number): string | false | undefined {
  if (position === 1) {
    return styles.positionGold;
  }

  if (position === 2) {
    return styles.positionSilver;
  }

  if (position === 3) {
    return styles.positionBronze;
  }

  return false;
}

function getCompactSetLabels(match: MatchWithSets): string[] {
  if (match.sets.length === 0) {
    return [];
  }

  return [...match.sets]
    .sort((first, second) => first.set_number - second.set_number)
    .map((set) => `${set.home_games.toString()}-${set.away_games.toString()}`);
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
    .filter(isMatchPlayed)
    .sort((first, second) => {
      const firstDate = first.scheduled_at ?? first.updated_at;
      const secondDate = second.scheduled_at ?? second.updated_at;
      return secondDate.localeCompare(firstDate);
    });
}

export function PublicTournamentRoute() {
  const params = useParams<{ slug?: string }>();
  const routeSlug = params.slug ?? null;
  const isSlugRoute = routeSlug !== null;
  const tournamentsQuery = usePublicTournamentsQuery();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const publicTournaments = tournamentsQuery.data ?? [];
  const selectedTournamentSlug = isSlugRoute ? routeSlug : selectedSlug;
  const tournamentQuery = usePublicTournamentQuery(
    selectedTournamentSlug,
    isSlugRoute || selectedSlug !== null
  );
  const data = tournamentQuery.data ?? null;

  useEffect(() => {
    document.title = 'PAD - Padel And Drink';
  }, []);

  useEffect(() => {
    if (isSlugRoute || !tournamentsQuery.data) {
      return;
    }

    if (tournamentsQuery.data.length === 1) {
      setSelectedSlug(tournamentsQuery.data[0]?.slug ?? null);
      return;
    }

    setSelectedSlug((current) =>
      current && tournamentsQuery.data.some((tournament) => tournament.slug === current)
        ? current
        : null
    );
  }, [isSlugRoute, tournamentsQuery.data]);

  if (!isSlugRoute && tournamentsQuery.isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>Caricamento tornei...</p>
      </main>
    );
  }

  if (!isSlugRoute && tournamentsQuery.isError) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{getErrorMessage(tournamentsQuery.error)}</p>
      </main>
    );
  }

  if (!isSlugRoute && publicTournaments.length === 0) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyState}>
          <h1>Nessun torneo attivo</h1>
          <p>Non ci sono tornei pubblici attivi da mostrare.</p>
          <Link className={styles.adminLink} to={appPaths.auth}>
            Accesso admin
          </Link>
        </section>
      </main>
    );
  }

  if (!isSlugRoute && !selectedSlug) {
    return (
      <PublicTournamentSelectionPage
        onSelectTournament={setSelectedSlug}
        tournaments={publicTournaments}
      />
    );
  }

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
          <h1>Torneo non disponibile</h1>
          <p>Il torneo richiesto non e pubblico o non e attivo.</p>
        </section>
      </main>
    );
  }

  return (
    <PublicTournamentView
      data={data}
      selector={
        !isSlugRoute && publicTournaments.length > 1 ? (
          <TournamentSelect
            onChange={setSelectedSlug}
            selectedSlug={selectedSlug}
            tournaments={publicTournaments}
          />
        ) : null
      }
    />
  );
}

function PublicTournamentSelectionPage({
  onSelectTournament,
  tournaments
}: {
  onSelectTournament: (slug: string | null) => void;
  tournaments: PublicTournament[];
}) {
  const { theme, toggleTheme } = usePublicTheme();

  return (
    <main
      className={cx(
        styles.page,
        theme === 'dark' ? styles.publicThemeDark : styles.publicThemeLight
      )}
    >
      <header className={styles.hero}>
        <nav className={styles.nav}>
          <ThemeToggleButton onToggle={toggleTheme} theme={theme} />
          <Link className={styles.adminLink} to={appPaths.auth}>
            <MdAdminPanelSettings aria-hidden="true" className={styles.adminIcon} />
            <span className={styles.adminLinkText}>Admin</span>
          </Link>
        </nav>
        <div className={styles.heroContent}>
          <img className={styles.heroLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
          <p className={styles.brandTagline}>Padel And Drink</p>
          <h1>Competizioni</h1>
          <div className={styles.selectionSelect}>
            <TournamentSelect
              onChange={onSelectTournament}
              selectedSlug={null}
              tournaments={tournaments}
            />
          </div>
          <div className={styles.competitionCards}>
            {tournaments.map((tournament) => (
              <button
                className={styles.competitionCard}
                key={tournament.id}
                onClick={() => {
                  onSelectTournament(tournament.slug);
                }}
                type="button"
              >
                <span className={styles.competitionIcon}>
                  <FaTrophy aria-hidden="true" />
                </span>
                <span className={styles.competitionBody}>
                  <strong>{tournament.name}</strong>
                  {tournament.description ? <small>{tournament.description}</small> : null}
                  <em>Attivo</em>
                </span>
              </button>
            ))}
          </div>
          <p className={styles.heroHint}>Scegli un torneo per vedere classifica, squadre e calendario.</p>
        </div>
      </header>
    </main>
  );
}

function TournamentSelect({
  onChange,
  selectedSlug,
  tournaments
}: {
  onChange: (slug: string | null) => void;
  selectedSlug: string | null;
  tournaments: PublicTournament[];
}) {
  return (
    <label className={styles.tournamentSelect}>
      <span>Seleziona torneo</span>
      <select
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
        value={selectedSlug ?? ''}
      >
        <option value="">Seleziona torneo</option>
        {tournaments.map((tournament) => (
          <option key={tournament.id} value={tournament.slug}>
            {tournament.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PublicTournamentView({
  data,
  header,
  selector
}: {
  data: PublicTournamentData;
  header?: ReactNode;
  selector?: ReactNode;
}) {
  const { theme, toggleTheme } = usePublicTheme();
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
  const lastOutcomesByTeamId = useMemo(() => {
    const outcomes = new Map<string, 'win' | 'loss'>();

    for (const team of data.teams) {
      const lastMatch = getLastPlayedMatchForTeam(team.id, data.matches);
      const outcome = lastMatch ? getTeamMatchOutcome(team.id, lastMatch) : null;

      if (outcome) {
        outcomes.set(team.id, outcome);
      }
    }

    return outcomes;
  }, [data.matches, data.teams]);

  return (
    <main
      className={cx(
        styles.page,
        header
          ? styles.publicThemeLight
          : theme === 'dark'
            ? styles.publicThemeDark
            : styles.publicThemeLight
      )}
    >
      {header ?? (
        <header className={styles.hero}>
          <nav className={styles.nav}>
            <ThemeToggleButton onToggle={toggleTheme} theme={theme} />
            <Link className={styles.adminLink} to={appPaths.auth}>
              <MdAdminPanelSettings aria-hidden="true" className={styles.adminIcon} />
              <span className={styles.adminLinkText}>Admin</span>
            </Link>
          </nav>
          <div className={styles.heroContent}>
            <img className={styles.heroLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
            <p className={styles.brandTagline}>Padel And Drink</p>
            <div className={styles.tournamentHeroCard}>
              <p className={styles.eyebrow}>Torneo attivo</p>
              {selector ?? <h1>{data.tournament.name}</h1>}
              {data.tournament.description ? <p>{data.tournament.description}</p> : null}
            </div>
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
              <tab.icon aria-hidden="true" className={styles.inlineIcon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {activeTab === 'standings' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Classifica</h2>
              <span>Aggiornata</span>
            </div>
            <div className={styles.standingsList}>
              {standings.map((row) => (
                <article className={styles.standingCard} key={row.teamId}>
                  <span
                    className={cx(
                      styles.position,
                      row.position <= 3 && styles.positionPodium,
                      getPodiumClass(row.position)
                    )}
                  >
                    {(() => {
                      const PodiumIcon = getPodiumIcon(row.position);

                      return PodiumIcon ? (
                        <PodiumIcon aria-hidden="true" className={styles.positionIcon} />
                      ) : (
                        row.position
                      );
                    })()}
                  </span>
                  <strong className={styles.teamNameWithOutcome}>
                    <span>{row.teamName}</span>
                    <OutcomeIcon
                      outcome={lastOutcomesByTeamId.get(row.teamId) ?? null}
                      variant="last"
                    />
                  </strong>
                  <span>PG {row.played}</span>
                  <span>V {row.wins}</span>
                  <span>P {row.losses}</span>
                  <span>SV {row.setsWon}</span>
                  <span>SP {row.setsLost}</span>
                  <span>DS {row.setDiff}</span>
                  <span>GV {row.gamesWon}</span>
                  <span>GP {row.gamesLost}</span>
                  <span>DG {row.gameDiff}</span>
                  <b>{row.points} Pt</b>
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
                    <th>DS</th>
                    <th>GV</th>
                    <th>GP</th>
                    <th>DG</th>
                    <th>Pt</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.teamId}>
                      <td>
                        <span
                          className={cx(
                            styles.tablePosition,
                            row.position <= 3 && styles.positionPodium,
                            getPodiumClass(row.position)
                          )}
                        >
                          {(() => {
                            const PodiumIcon = getPodiumIcon(row.position);

                            return PodiumIcon ? (
                              <>
                                <PodiumIcon aria-hidden="true" className={styles.positionIcon} />
                                <span>{row.position}</span>
                              </>
                            ) : (
                              row.position
                            );
                          })()}
                        </span>
                      </td>
                      <td>
                        <span className={styles.teamNameWithOutcome}>
                          <span>{row.teamName}</span>
                          <OutcomeIcon
                            outcome={lastOutcomesByTeamId.get(row.teamId) ?? null}
                            variant="last"
                          />
                        </span>
                      </td>
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
                  matches={data.matches}
                  onOpen={() => {
                    setOpenTeamId((current) => (current === team.id ? null : team.id));
                  }}
                  points={standings.find((row) => row.teamId === team.id)?.points ?? 0}
                  seasonId={data.season.id}
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

function ThemeToggleButton({
  onToggle,
  theme
}: {
  onToggle: () => void;
  theme: PublicTheme;
}) {
  const Icon = theme === 'dark' ? MdLightMode : MdDarkMode;
  const label = theme === 'dark' ? 'Light' : 'Dark';

  return (
    <button
      aria-label={`Passa al tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}
      className={styles.themeToggle}
      onClick={onToggle}
      type="button"
    >
      <Icon aria-hidden="true" className={styles.themeToggleIcon} />
      <span>{label}</span>
    </button>
  );
}

function TeamAccordionItem({
  isOpen,
  matches,
  onOpen,
  points,
  seasonId,
  team,
  teams
}: {
  isOpen: boolean;
  matches: MatchWithSets[];
  onOpen: () => void;
  points: number;
  seasonId: string;
  team: PublicTeam;
  teams: PublicTeam[];
}) {
  const teamMatches = getUniqueMatchesByFixture(
    matches.filter(
      (match) =>
        match.season_id === seasonId &&
        (match.home_team_id === team.id || match.away_team_id === team.id)
    )
  );
  const totalePartite = teamMatches.length;
  const partiteGiocate = teamMatches.filter(isMatchPlayed).length;
  const partiteDaGiocare = Math.max(totalePartite - partiteGiocate, 0);
  const sortedTeamMatches = sortCalendarMatches(teamMatches);

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
          <small>{partiteGiocate.toString()} giocate</small>
          <small>{partiteDaGiocare.toString()} da giocare</small>
        </span>
      </button>

      {isOpen ? (
        <div className={styles.accordionPanel}>
          {sortedTeamMatches.length === 0 ? <p className={styles.muted}>Nessuna partita per questa squadra.</p> : null}
          <div className={styles.matchList}>
            {sortedTeamMatches.map((match) => {
              const outcome = getTeamMatchOutcome(team.id, match);

              return (
                <article
                  className={cx(styles.matchCard, styles[`matchCard_${match.status}`])}
                  key={match.id}
                >
                  <div className={styles.matchTopline}>
                    <strong>vs {getOpponentName(match, team.id, teams)}</strong>
                    <MatchStatusBadge status={match.status} />
                  </div>
                  <dl className={styles.matchMeta}>
                    <div>
                      <dt>Data</dt>
                      <dd>{formatMatchDate(match.scheduled_at)}</dd>
                    </div>
                    <div>
                      <dt>Ora</dt>
                      <dd>{formatMatchTime(match.scheduled_at)}</dd>
                    </div>
                    <div>
                      <dt>Luogo</dt>
                      <dd>{match.venue ?? 'Da definire'}</dd>
                    </div>
                    <div>
                      <dt>Risultato</dt>
                      <dd className={styles.resultWithOutcome}>
                        <OutcomeIcon outcome={outcome} variant="match" />
                        <span>{getCompactResult(match)}</span>
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function OutcomeIcon({
  outcome,
  variant
}: {
  outcome: 'win' | 'loss' | null;
  variant: 'last' | 'match';
}) {
  if (!outcome) {
    return null;
  }

  const isWin = outcome === 'win';
  const label =
    variant === 'last'
      ? `Ultima partita: ${isWin ? 'vittoria' : 'sconfitta'}`
      : isWin
        ? 'Vittoria'
        : 'Sconfitta';

  const Icon = isWin ? MdCheckCircle : MdCancel;

  return (
    <span
      aria-label={label}
      className={cx(styles.outcomeIconWrap, isWin ? styles.outcomeWin : styles.outcomeLoss)}
      title={label}
    >
      <Icon aria-hidden="true" className={styles.outcomeIcon} />
    </span>
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
      {matches.map((match) => {
        const winnerTeamId = getWinnerTeamId(match);
        const compactSets = getCompactSetLabels(match);

        return (
          <article
            className={cx(styles.matchCard, styles[`matchCard_${match.status}`])}
            key={match.id}
          >
            <div className={styles.matchSchedule}>
              <span>{formatMatchDate(match.scheduled_at)}</span>
              <strong>{formatMatchTime(match.scheduled_at)}</strong>
              <small>{match.venue ?? 'Luogo da definire'}</small>
            </div>
            <div className={styles.matchMain}>
              <div className={styles.matchTopline}>
                <strong className={styles.matchTeams}>
                  <span className={cx(winnerTeamId === match.home_team_id && styles.winnerTeam)}>
                    {getTeamName(teams, match.home_team_id)}
                    {winnerTeamId === match.home_team_id ? (
                      <MdCheckCircle
                        aria-label="Squadra vincente"
                        className={styles.winnerIcon}
                        title="Squadra vincente"
                      />
                    ) : null}
                  </span>
                  <span className={styles.versus}>vs</span>
                  <span className={cx(winnerTeamId === match.away_team_id && styles.winnerTeam)}>
                    {getTeamName(teams, match.away_team_id)}
                    {winnerTeamId === match.away_team_id ? (
                      <MdCheckCircle
                        aria-label="Squadra vincente"
                        className={styles.winnerIcon}
                        title="Squadra vincente"
                      />
                    ) : null}
                  </span>
                </strong>
                <MatchStatusBadge status={match.status} />
              </div>
              {isMatchPlayed(match) ? (
                <div className={styles.scoreSummary}>
                  <strong className={styles.scorePill}>{getCompactResult(match)}</strong>
                  {compactSets.length > 0 ? (
                    <span className={styles.setChips} aria-label="Dettaglio set">
                      {compactSets.map((setLabel) => (
                        <small className={styles.setChip} key={setLabel}>
                          {setLabel}
                        </small>
                      ))}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MatchStatusBadge({ status }: { status: MatchWithSets['status'] }) {
  const StatusIcon = getStatusIcon(status);

  return (
    <span className={cx(styles.badge, styles[`badge_${status}`])}>
      <StatusIcon aria-hidden="true" className={styles.badgeIcon} />
      <span className={styles.badgeLabel}>{getStatusLabel(status)}</span>
    </span>
  );
}
