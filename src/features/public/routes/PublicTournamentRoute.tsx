import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaCalendarDays, FaMedal, FaPlus, FaRankingStar, FaTrophy, FaUsers } from 'react-icons/fa6';
import {
  MdAdminPanelSettings,
  MdCancel,
  MdCheckCircle,
  MdEventBusy,
  MdFilterList,
  MdMoreVert,
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
type MatchOutcome = 'win' | 'loss';
type RecentResult = MatchOutcome | null;

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

function getTeamMatchOutcome(teamId: string, match: MatchWithSets): MatchOutcome | null {
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

function getLastFiveResultsForTeam(teamId: string, matches: MatchWithSets[]): RecentResult[] {
  const playedMatches = matches.filter(
    (match) =>
      isMatchPlayed(match) && (match.home_team_id === teamId || match.away_team_id === teamId)
  );

  const results = [...playedMatches]
    .sort((first, second) => getMatchSortDate(second).localeCompare(getMatchSortDate(first)))
    .slice(0, 5)
    .map((match) => getTeamMatchOutcome(teamId, match));

  while (results.length < 5) {
    results.push(null);
  }

  return results;
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
    return FaMedal;
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
      changeCompetitionAction={
        !isSlugRoute && publicTournaments.length > 1 ? (
          <button
            className={styles.changeCompetitionButton}
            onClick={() => {
              setSelectedSlug(null);
            }}
            type="button"
          >
            Cambia competizione
          </button>
        ) : null
      }
      data={data}
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
  const [createModalStep, setCreateModalStep] = useState<'closed' | 'choice' | 'visitor'>('closed');

  return (
    <main className={cx(styles.page, styles.publicThemeLight, styles.selectionPage)}>
      <header className={cx(styles.hero, styles.selectionHero)}>
        <PublicBrandBar />
        <div className={styles.heroContent}>
          <div className={styles.selectionIntroCard}>
            <img className={styles.selectionLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
            <h1>Scegli competizione</h1>
            <p>Seleziona il torneo da seguire</p>
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
            <button
              className={cx(styles.competitionCard, styles.createCompetitionCard)}
              onClick={() => {
                setCreateModalStep('choice');
              }}
              type="button"
            >
              <span className={styles.competitionIcon}>
                <FaPlus aria-hidden="true" />
              </span>
              <span className={styles.competitionBody}>
                <strong>Crea nuovo torneo</strong>
                <small>Vuoi organizzare una nuova competizione?</small>
              </span>
            </button>
          </div>
        </div>
      </header>
      {createModalStep !== 'closed' ? (
        <CreateTournamentModal
          onClose={() => {
            setCreateModalStep('closed');
          }}
          onVisitorContinue={() => {
            setCreateModalStep('visitor');
          }}
          step={createModalStep}
        />
      ) : null}
    </main>
  );
}

function CreateTournamentModal({
  onClose,
  onVisitorContinue,
  step
}: {
  onClose: () => void;
  onVisitorContinue: () => void;
  step: 'choice' | 'visitor';
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className={styles.modalOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-modal="true"
        className={styles.modalCard}
        role="dialog"
        aria-labelledby="create-tournament-modal-title"
      >
        {step === 'choice' ? (
          <>
            <h2 id="create-tournament-modal-title">Sei gia un utente registrato?</h2>
            <div className={styles.modalActions}>
              <Link autoFocus className={styles.modalPrimaryAction} to={appPaths.auth}>
                Si, accedi
              </Link>
              <button className={styles.modalSecondaryAction} onClick={onVisitorContinue} type="button">
                No, continua come visitatore
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="create-tournament-modal-title">Area riservata</h2>
            <p>
              Al momento l'area riservata e disponibile solo per utenti registrati. Puoi
              continuare a consultare tornei, calendari, risultati e classifiche in modalita utente.
            </p>
            <button autoFocus className={styles.modalPrimaryAction} onClick={onClose} type="button">
              Torna alle competizioni
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function PublicBrandBar({
  actions,
  children
}: {
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <div className={styles.brandBar}>
      <span className={styles.brandIdentity}>
        <img className={styles.brandLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
        <span className={styles.brandText}>
          <strong>PAD</strong>
          <small>Padel And Drink</small>
        </span>
      </span>
      {children ? <div className={styles.brandBarContent}>{children}</div> : null}
      <div className={styles.brandActions}>
        {actions}
        <Link className={styles.adminLink} to={appPaths.auth}>
          <MdAdminPanelSettings aria-hidden="true" className={styles.adminIcon} />
          <span className={styles.adminLinkText}>Admin</span>
        </Link>
      </div>
      <div className={styles.mobileActionMenu} ref={mobileMenuRef}>
        <button
          aria-expanded={isMobileMenuOpen}
          aria-label="Apri menu"
          className={styles.mobileMenuButton}
          onClick={() => {
            setIsMobileMenuOpen((current) => !current);
          }}
          type="button"
        >
          <MdMoreVert aria-hidden="true" />
        </button>
        {isMobileMenuOpen ? (
          <div className={styles.mobileMenuPanel}>
            {actions}
            <Link aria-label="Login admin" className={styles.adminLink} to={appPaths.auth}>
              <MdAdminPanelSettings aria-hidden="true" className={styles.adminIcon} />
              <span className={styles.adminLinkText}>Login admin</span>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PublicTournamentView({
  changeCompetitionAction,
  data,
  header
}: {
  changeCompetitionAction?: ReactNode;
  data: PublicTournamentData;
  header?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<PublicTab>('standings');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [calendarFilterOpen, setCalendarFilterOpen] = useState(false);
  const [calendarTeamSearch, setCalendarTeamSearch] = useState('');
  const [selectedCalendarTeamIds, setSelectedCalendarTeamIds] = useState<string[]>([]);
  const [resultsFilterOpen, setResultsFilterOpen] = useState(false);
  const [resultsTeamSearch, setResultsTeamSearch] = useState('');
  const [selectedResultsTeamIds, setSelectedResultsTeamIds] = useState<string[]>([]);

  const standings = useMemo(
    () => calculateStandings(data.teams, data.matches),
    [data]
  );
  const calendarMatches = useMemo(
    () => sortCalendarMatches(data.matches),
    [data.matches]
  );
  const filteredCalendarMatches = useMemo(() => {
    if (selectedCalendarTeamIds.length === 0) {
      return calendarMatches;
    }

    const selectedIds = new Set(selectedCalendarTeamIds);

    return calendarMatches.filter(
      (match) => selectedIds.has(match.home_team_id) || selectedIds.has(match.away_team_id)
    );
  }, [calendarMatches, selectedCalendarTeamIds]);
  const resultMatches = useMemo(
    () => sortResultMatches(data.matches),
    [data.matches]
  );
  const filteredResultMatches = useMemo(() => {
    if (selectedResultsTeamIds.length === 0) {
      return resultMatches;
    }

    const selectedIds = new Set(selectedResultsTeamIds);

    return resultMatches.filter(
      (match) => selectedIds.has(match.home_team_id) || selectedIds.has(match.away_team_id)
    );
  }, [resultMatches, selectedResultsTeamIds]);
  const recentResultsByTeamId = useMemo(() => {
    const results = new Map<string, RecentResult[]>();

    for (const team of data.teams) {
      results.set(team.id, getLastFiveResultsForTeam(team.id, data.matches));
    }

    return results;
  }, [data.matches, data.teams]);

  return (
    <main className={cx(styles.page, styles.publicThemeLight)}>
      {header ?? (
        <header className={cx(styles.hero, styles.tournamentHeader)}>
          <PublicBrandBar actions={changeCompetitionAction}>
            <div className={styles.selectedCompetition}>
              <h1>{data.tournament.name}</h1>
              {data.tournament.description ? <p>{data.tournament.description}</p> : null}
            </div>
          </PublicBrandBar>
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
                    <RecentResultsStrip results={recentResultsByTeamId.get(row.teamId) ?? []} />
                  </strong>
                  <b className={styles.mobilePoints}>{row.points} Pt</b>
                  <div className={styles.mobileStandingStats}>
                    <span>PG {row.played}</span>
                    <span>V {row.wins}</span>
                    <span>P {row.losses}</span>
                    <span>SV {row.setsWon}</span>
                    <span>SP {row.setsLost}</span>
                    <span>DS {row.setDiff}</span>
                    <span>DG {row.gameDiff}</span>
                  </div>
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
                    <th>DG</th>
                    <th>Forma</th>
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
                        </span>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.setsWon}</td>
                      <td>{row.setsLost}</td>
                      <td>{row.setDiff}</td>
                      <td>{row.gameDiff}</td>
                      <td>
                        <RecentResultsStrip results={recentResultsByTeamId.get(row.teamId) ?? []} compact />
                      </td>
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
              <span>{filteredCalendarMatches.length.toString()} partite trovate</span>
            </div>
            <CalendarTeamFilter
              isOpen={calendarFilterOpen}
              onClear={() => {
                setSelectedCalendarTeamIds([]);
                setCalendarTeamSearch('');
              }}
              onSearchChange={setCalendarTeamSearch}
              onToggleOpen={() => {
                setCalendarFilterOpen((current) => !current);
              }}
              onToggleTeam={(teamId) => {
                setSelectedCalendarTeamIds((current) =>
                  current.includes(teamId)
                    ? current.filter((selectedTeamId) => selectedTeamId !== teamId)
                    : [...current, teamId]
                );
              }}
              search={calendarTeamSearch}
              selectedTeamIds={selectedCalendarTeamIds}
              teams={data.teams}
            />
            <MatchList matches={filteredCalendarMatches} teams={data.teams} emptyLabel="Calendario non disponibile." />
          </section>
        ) : null}

        {activeTab === 'results' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Risultati</h2>
              <span>{filteredResultMatches.length.toString()} risultati trovati</span>
            </div>
            <CalendarTeamFilter
              isOpen={resultsFilterOpen}
              onClear={() => {
                setSelectedResultsTeamIds([]);
                setResultsTeamSearch('');
              }}
              onSearchChange={setResultsTeamSearch}
              onToggleOpen={() => {
                setResultsFilterOpen((current) => !current);
              }}
              onToggleTeam={(teamId) => {
                setSelectedResultsTeamIds((current) =>
                  current.includes(teamId)
                    ? current.filter((selectedTeamId) => selectedTeamId !== teamId)
                    : [...current, teamId]
                );
              }}
              search={resultsTeamSearch}
              selectedTeamIds={selectedResultsTeamIds}
              teams={data.teams}
            />
            <MatchList matches={filteredResultMatches} teams={data.teams} emptyLabel="Nessun risultato disponibile." />
          </section>
        ) : null}
      </section>
    </main>
  );
}

function RecentResultsStrip({
  compact = false,
  results
}: {
  compact?: boolean;
  results: RecentResult[];
}) {
  const normalizedResults = [...results].slice(0, 5);

  while (normalizedResults.length < 5) {
    normalizedResults.push(null);
  }

  return (
    <span className={cx(styles.recentResults, compact && styles.recentResultsCompact)}>
      {normalizedResults.map((result, index) => {
        const label = result === 'win' ? 'Vittoria' : result === 'loss' ? 'Sconfitta' : 'Nessuna partita';
        const text = result === 'win' ? 'V' : result === 'loss' ? 'S' : '-';

        return (
          <span
            aria-label={label}
            className={cx(
              styles.recentResult,
              result === 'win' && styles.recentResultWin,
              result === 'loss' && styles.recentResultLoss,
              result === null && styles.recentResultEmpty
            )}
            key={`${index.toString()}-${text}`}
            title={label}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
}

function CalendarTeamFilter({
  isOpen,
  onClear,
  onSearchChange,
  onToggleOpen,
  onToggleTeam,
  search,
  selectedTeamIds,
  teams
}: {
  isOpen: boolean;
  onClear: () => void;
  onSearchChange: (value: string) => void;
  onToggleOpen: () => void;
  onToggleTeam: (teamId: string) => void;
  search: string;
  selectedTeamIds: string[];
  teams: PublicTeam[];
}) {
  const filteredTeams = teams.filter((team) =>
    getTeamDisplayLabel(team).toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedCount = selectedTeamIds.length;

  return (
    <div className={styles.calendarFilter}>
      <div className={styles.calendarFilterBar}>
        <button
          aria-expanded={isOpen}
          className={styles.calendarFilterToggle}
          onClick={onToggleOpen}
          type="button"
        >
          <span className={styles.calendarFilterLabel}>
            <MdFilterList aria-hidden="true" className={styles.calendarFilterIcon} />
            <span>Filtra per squadra</span>
          </span>
          <span className={styles.calendarFilterCount}>
            {selectedCount === 0 ? 'Tutte' : selectedCount.toString()}
          </span>
        </button>
        {selectedCount > 0 ? (
          <button className={styles.clearFilterButton} onClick={onClear} type="button">
            Pulisci filtri
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className={styles.calendarFilterPanel}>
          {teams.length > 8 ? (
            <label className={styles.calendarFilterSearch}>
              <span>Cerca squadra</span>
              <input
                onChange={(event) => {
                  onSearchChange(event.target.value);
                }}
                placeholder="Nome squadra"
                type="search"
                value={search}
              />
            </label>
          ) : null}

          <div className={styles.calendarFilterOptions}>
            {filteredTeams.map((team) => {
              const checked = selectedTeamIds.includes(team.id);

              return (
                <label className={styles.calendarFilterOption} key={team.id}>
                  <input
                    checked={checked}
                    onChange={() => {
                      onToggleTeam(team.id);
                    }}
                    type="checkbox"
                  />
                  <span>{getTeamDisplayLabel(team)}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
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
          <small>
            {partiteGiocate.toString()} giocate, {partiteDaGiocare.toString()} da giocare
          </small>
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
