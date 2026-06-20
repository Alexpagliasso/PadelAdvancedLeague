import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaCalendarDays, FaMedal, FaPlus, FaRankingStar, FaTrophy, FaUsers } from 'react-icons/fa6';
import {
  MdAdminPanelSettings,
  MdCancel,
  MdCheckCircle,
  MdChevronLeft,
  MdChevronRight,
  MdEventBusy,
  MdFilterList,
  MdMoreVert,
  MdSchedule
} from 'react-icons/md';
import { Link, useParams } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import { PageLoader } from '@/components/loaders/PadLoaders';
import type {
  MatchWithSets,
  TournamentBracketMatch,
  TournamentBracketWithMatches
} from '@/features/matches/api/matchesApi';
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
import {
  createBracketSourceMap,
  getBracketMatchCode,
  getBracketSlotLabel
} from '@/features/matches/lib/bracketDisplay';
import { getUniqueMatchesByFixture, isMatchPlayed } from '@/features/matches/lib/matchStatus';
import { calculateStandings } from '@/features/standings/lib/standingsEngine';
import type { MatchPhase } from '@/lib/supabase/types';

import styles from '@/features/public/routes/PublicTournamentRoute.module.scss';

type PublicTab = 'standings' | 'teams' | 'calendar' | 'results';
type StandingsSubTab = 'regular_season' | 'playoff' | 'playout';
type PhaseFilter = 'all' | MatchPhase;
type MatchOutcome = 'win' | 'loss';
type RecentResult = MatchOutcome | null;
type MatchPhaseLabels = Map<string, string>;
type FinalPhaseDestination = 'playoff' | 'playout';

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

function getPhaseLabel(phase: PhaseFilter): string {
  const labels: Record<PhaseFilter, string> = {
    all: 'Tutte',
    regular_season: 'Girone',
    playoff: 'Playoff',
    playout: 'Playout'
  };

  return labels[phase];
}

function getAvailableTournamentPhases(matches: MatchWithSets[]): MatchPhase[] {
  const phases: MatchPhase[] = ['regular_season', 'playoff', 'playout'];

  return phases.filter((phase) => matches.some((match) => match.phase === phase));
}

function getAvailableTeamPhases(teamId: string, matches: MatchWithSets[]): MatchPhase[] {
  return getAvailableTournamentPhases(
    matches.filter((match) => match.home_team_id === teamId || match.away_team_id === teamId)
  );
}

function filterMatchesByPhase<TMatch extends Pick<MatchWithSets, 'phase'>>(
  matches: TMatch[],
  phase: PhaseFilter
): TMatch[] {
  if (phase === 'all') {
    return matches;
  }

  return matches.filter((match) => match.phase === phase);
}

function getDetailedPhaseLabel(
  match: Pick<MatchWithSets, 'id' | 'phase'>,
  tournamentFormat: PublicTournament['format'],
  bracketMatchByMatchId: Map<string, TournamentBracketMatch & { bracketType: TournamentBracketWithMatches['bracket_type'] }>
): string {
  if (match.phase === 'regular_season') {
    return 'Girone';
  }

  const bracketMatch = bracketMatchByMatchId.get(match.id);

  if (tournamentFormat === 'knockout') {
    return bracketMatch?.round_label ?? 'Eliminazione diretta';
  }

  if (match.phase === 'playoff') {
    return bracketMatch?.round_label ? `${bracketMatch.round_label} playoff` : 'Playoff';
  }

  return bracketMatch?.round_label ? `${bracketMatch.round_label} playout` : 'Playout';
}

function getTournamentPlayoffLabel(tournament: PublicTournament): string {
  const label = tournament.playoff_label?.trim();
  return label && label.length > 0 ? label : 'Playoff';
}

function getTournamentPlayoutLabel(tournament: PublicTournament): string {
  const label = tournament.playout_label?.trim();
  return label && label.length > 0 ? label : 'Playout';
}

function getStandingDestination(
  position: number,
  tournament: PublicTournament
): { type: FinalPhaseDestination; label: string } | null {
  if (tournament.format !== 'group_playoff_playout') {
    return null;
  }

  const playoffCount = tournament.playoff_teams_count ?? 0;
  const playoutCount = tournament.playout_teams_count ?? 0;

  if (playoffCount > 0 && position <= playoffCount) {
    return { type: 'playoff', label: getTournamentPlayoffLabel(tournament) };
  }

  if (playoutCount > 0 && position > tournament.expected_teams_count - playoutCount) {
    return { type: 'playout', label: getTournamentPlayoutLabel(tournament) };
  }

  return null;
}

function useBracketVisibleRoundCount(): number {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateVisibleCount = () => {
      setVisibleCount(mediaQuery.matches ? 2 : 1);
    };

    updateVisibleCount();
    mediaQuery.addEventListener('change', updateVisibleCount);

    return () => {
      mediaQuery.removeEventListener('change', updateVisibleCount);
    };
  }, []);

  return visibleCount;
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getTeamName(teams: PublicTeam[], teamId: string): string {
  return teams.find((team) => team.id === teamId)?.name ?? 'Squadra';
}

function getBracketStatusLabel(status: TournamentBracketWithMatches['status']): string {
  const labels: Record<TournamentBracketWithMatches['status'], string> = {
    draft: 'Bozza',
    generated: 'Generato',
    completed: 'Completato'
  };

  return labels[status];
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
    const firstMatchday = first.matchday ?? Number.MAX_SAFE_INTEGER;
    const secondMatchday = second.matchday ?? Number.MAX_SAFE_INTEGER;

    if (firstMatchday !== secondMatchday) {
      return firstMatchday - secondMatchday;
    }

    const firstDisplayOrder = first.display_order ?? Number.MAX_SAFE_INTEGER;
    const secondDisplayOrder = second.display_order ?? Number.MAX_SAFE_INTEGER;

    if (firstDisplayOrder !== secondDisplayOrder) {
      return firstDisplayOrder - secondDisplayOrder;
    }

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
    return <PageLoader label="Caricamento tornei..." />;
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
    return <PageLoader label="Caricamento torneo..." />;
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
  const [search, setSearch] = useState('');
  const filteredTournaments = tournaments.filter((tournament) =>
    tournament.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <main className={cx(styles.page, styles.publicThemeLight, styles.selectionPage)}>
      <header className={cx(styles.hero, styles.selectionHero)}>
        <PublicBrandBar />
        <div className={styles.heroContent}>
          <div className={styles.selectionPanel}>
            <div className={styles.selectionIntroCard}>
              <h1>Scegli competizione</h1>
              <p>Seleziona il torneo da seguire</p>
              <Link className={styles.selectionAdminLink} to={appPaths.auth}>
                <MdAdminPanelSettings aria-hidden="true" />
                <span>Admin Login</span>
              </Link>
            </div>
            <label className={styles.selectionSearch}>
              <span className={styles.srOnly}>Cerca torneo</span>
              <input
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Cerca torneo..."
                type="search"
                value={search}
              />
            </label>
            <div className={styles.competitionCards}>
              {filteredTournaments.map((tournament) => (
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
              {filteredTournaments.length === 0 ? (
                <p className={styles.selectionNoResults}>Nessun torneo trovato.</p>
              ) : null}
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
  const [standingsSubTab, setStandingsSubTab] = useState<StandingsSubTab>('regular_season');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [calendarPhase, setCalendarPhase] = useState<PhaseFilter>('all');
  const [calendarFilterOpen, setCalendarFilterOpen] = useState(false);
  const [calendarTeamSearch, setCalendarTeamSearch] = useState('');
  const [selectedCalendarTeamIds, setSelectedCalendarTeamIds] = useState<string[]>([]);
  const [teamNameSearch, setTeamNameSearch] = useState('');
  const [resultsPhase, setResultsPhase] = useState<PhaseFilter>('all');
  const [resultsFilterOpen, setResultsFilterOpen] = useState(false);
  const [resultsTeamSearch, setResultsTeamSearch] = useState('');
  const [selectedResultsTeamIds, setSelectedResultsTeamIds] = useState<string[]>([]);

  const playoffBracket = useMemo(
    () => data.brackets.find((bracket) => bracket.bracket_type === 'playoff') ?? null,
    [data.brackets]
  );
  const playoutBracket = useMemo(
    () => data.brackets.find((bracket) => bracket.bracket_type === 'playout') ?? null,
    [data.brackets]
  );
  const knockoutBracket = useMemo(
    () => data.brackets.find((bracket) => bracket.bracket_type === 'knockout') ?? null,
    [data.brackets]
  );
  const isKnockoutTournament = data.tournament.format === 'knockout';
  const hasStandingsSubTabs =
    data.tournament.format === 'group_playoff_playout' &&
    (playoffBracket !== null || playoutBracket !== null);
  const standingsSubTabs = useMemo(
    () => {
      if (data.tournament.format !== 'group_playoff_playout') {
        return [{ id: 'regular_season' as const, label: 'Girone' }];
      }

      return [
        { id: 'regular_season' as const, label: 'Girone' },
        playoffBracket ? { id: 'playoff' as const, label: getTournamentPlayoffLabel(data.tournament) } : null,
        playoutBracket ? { id: 'playout' as const, label: getTournamentPlayoutLabel(data.tournament) } : null
      ].filter((tab): tab is { id: StandingsSubTab; label: string } => tab !== null);
    },
    [data.tournament, playoffBracket, playoutBracket]
  );
  const regularSeasonMatches = useMemo(
    () => data.matches.filter((match) => match.phase === 'regular_season'),
    [data.matches]
  );
  const availableCalendarPhases = useMemo(
    () => getAvailableTournamentPhases(data.matches),
    [data.matches]
  );
  const bracketMatchByMatchId = useMemo(() => {
    const bracketMatchMap = new Map<
      string,
      TournamentBracketMatch & { bracketType: TournamentBracketWithMatches['bracket_type'] }
    >();

    data.brackets.forEach((bracket) => {
      bracket.bracketMatches.forEach((bracketMatch) => {
        if (bracketMatch.match_id) {
          bracketMatchMap.set(bracketMatch.match_id, {
            ...bracketMatch,
            bracketType: bracket.bracket_type
          });
        }
      });
    });

    return bracketMatchMap;
  }, [data.brackets]);
  const matchPhaseLabels = useMemo(() => {
    const phaseLabels = new Map<string, string>();

    data.matches.forEach((match) => {
      phaseLabels.set(
        match.id,
        getDetailedPhaseLabel(match, data.tournament.format, bracketMatchByMatchId)
      );
    });

    return phaseLabels;
  }, [bracketMatchByMatchId, data.matches, data.tournament.format]);
  const standings = useMemo(
    () => (isKnockoutTournament ? [] : calculateStandings(data.teams, regularSeasonMatches)),
    [data.teams, isKnockoutTournament, regularSeasonMatches]
  );
  const filteredTeams = useMemo(() => {
    const teamQuery = teamNameSearch.trim().toLowerCase();

    return data.teams.filter((team) => {
      const matchesTeamSearch =
        teamQuery.length === 0 ||
        [
          team.name,
          getTeamDisplayLabel(team),
          ...team.players.flatMap((player) => [
            getPlayerLabel(player),
            player.first_name,
            player.last_name,
            player.display_name
          ])
        ]
          .join(' ')
          .toLowerCase()
          .includes(teamQuery);

      return matchesTeamSearch;
    });
  }, [data.teams, teamNameSearch]);
  const calendarMatches = useMemo(
    () => sortCalendarMatches(data.matches),
    [data.matches]
  );
  const upcomingMatches = useMemo(
    () =>
      calendarMatches
        .filter(
          (match) =>
            match.status === 'scheduled' &&
            match.scheduled_at !== null &&
            !isMatchPlayed(match)
        )
        .slice(0, 5),
    [calendarMatches]
  );
  const filteredCalendarMatches = useMemo(() => {
    const phaseMatches = filterMatchesByPhase(calendarMatches, calendarPhase);

    if (selectedCalendarTeamIds.length === 0) {
      return phaseMatches;
    }

    const selectedIds = new Set(selectedCalendarTeamIds);

    return phaseMatches.filter(
      (match) => selectedIds.has(match.home_team_id) || selectedIds.has(match.away_team_id)
    );
  }, [calendarMatches, calendarPhase, selectedCalendarTeamIds]);
  const resultMatches = useMemo(
    () => sortResultMatches(data.matches),
    [data.matches]
  );
  const availableResultPhases = useMemo(
    () => getAvailableTournamentPhases(resultMatches),
    [resultMatches]
  );
  const filteredResultMatches = useMemo(() => {
    const phaseMatches = filterMatchesByPhase(resultMatches, resultsPhase);

    if (selectedResultsTeamIds.length === 0) {
      return phaseMatches;
    }

    const selectedIds = new Set(selectedResultsTeamIds);

    return phaseMatches.filter(
      (match) => selectedIds.has(match.home_team_id) || selectedIds.has(match.away_team_id)
    );
  }, [resultMatches, resultsPhase, selectedResultsTeamIds]);
  const recentResultsByTeamId = useMemo(() => {
    const results = new Map<string, RecentResult[]>();

    for (const team of data.teams) {
      results.set(team.id, getLastFiveResultsForTeam(team.id, regularSeasonMatches));
    }

    return results;
  }, [regularSeasonMatches, data.teams]);

  useEffect(() => {
    if (isKnockoutTournament) {
      setStandingsSubTab('regular_season');
      return;
    }

    if (!standingsSubTabs.some((tab) => tab.id === standingsSubTab)) {
      setStandingsSubTab('regular_season');
    }
  }, [isKnockoutTournament, standingsSubTab, standingsSubTabs]);

  useEffect(() => {
    if (calendarPhase !== 'all' && !availableCalendarPhases.includes(calendarPhase)) {
      setCalendarPhase('all');
    }
  }, [availableCalendarPhases, calendarPhase]);

  useEffect(() => {
    if (resultsPhase !== 'all' && !availableResultPhases.includes(resultsPhase)) {
      setResultsPhase('all');
    }
  }, [availableResultPhases, resultsPhase]);

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
              <h2>{isKnockoutTournament ? 'Tabellone' : 'Classifica'}</h2>
              <span>{isKnockoutTournament ? 'Eliminazione diretta' : 'Aggiornata'}</span>
            </div>

            {isKnockoutTournament ? (
              knockoutBracket ? (
                <BracketBoard bracket={knockoutBracket} matches={data.matches} teams={data.teams} />
              ) : (
                <div className={styles.inlineEmptyState}>
                  <p>Il tabellone non è ancora disponibile.</p>
                </div>
              )
            ) : null}

            {!isKnockoutTournament && hasStandingsSubTabs ? (
              <PhaseSegmentedControl
                label="Sezione classifica"
                onChange={(phase) => {
                  if (phase !== 'all') {
                    setStandingsSubTab(phase);
                  }
                }}
                phases={standingsSubTabs.map((tab) => tab.id)}
                value={standingsSubTab}
              />
            ) : null}

            {!isKnockoutTournament && standingsSubTab === 'regular_season' ? (
              <>
                <div className={styles.standingsList}>
                  {standings.map((row) => {
                    const destination = getStandingDestination(row.position, data.tournament);

                    return (
                    <article
                      className={cx(
                        styles.standingCard,
                        destination?.type === 'playoff' && styles.standingCardPlayoff,
                        destination?.type === 'playout' && styles.standingCardPlayout
                      )}
                      key={row.teamId}
                    >
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
                      {destination ? (
                        <span
                          className={cx(
                            styles.finalPhaseBadge,
                            destination.type === 'playoff'
                              ? styles.finalPhaseBadgePlayoff
                              : styles.finalPhaseBadgePlayout
                          )}
                        >
                          {destination.label}
                        </span>
                      ) : null}
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
                    );
                  })}
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
                      {standings.map((row) => {
                        const destination = getStandingDestination(row.position, data.tournament);

                        return (
                        <tr
                          className={cx(
                            destination?.type === 'playoff' && styles.standingRowPlayoff,
                            destination?.type === 'playout' && styles.standingRowPlayout
                          )}
                          key={row.teamId}
                        >
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
                              {destination ? (
                                <span
                                  className={cx(
                                    styles.finalPhaseBadge,
                                    destination.type === 'playoff'
                                      ? styles.finalPhaseBadgePlayoff
                                      : styles.finalPhaseBadgePlayout
                                  )}
                                >
                                  {destination.label}
                                </span>
                              ) : null}
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {!isKnockoutTournament && standingsSubTab === 'playoff' && playoffBracket ? (
              <BracketBoard bracket={playoffBracket} matches={data.matches} teams={data.teams} />
            ) : null}

            {!isKnockoutTournament && standingsSubTab === 'playout' && playoutBracket ? (
              <BracketBoard bracket={playoutBracket} matches={data.matches} teams={data.teams} />
            ) : null}
          </section>
        ) : null}

        {activeTab === 'teams' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Squadre</h2>
              <span>{filteredTeams.length.toString()} squadre</span>
            </div>
            <div className={styles.teamFilters}>
              <div className={styles.teamFilterField}>
                <label htmlFor="public-team-search">Cerca squadra</label>
                <input
                  id="public-team-search"
                  onChange={(event) => {
                    setTeamNameSearch(event.target.value);
                  }}
                  placeholder="Cerca squadra o giocatore..."
                  type="search"
                  value={teamNameSearch}
                />
              </div>

              {teamNameSearch ? (
                <button
                  className={styles.clearFilterButton}
                  onClick={() => {
                    setTeamNameSearch('');
                  }}
                  type="button"
                >
                  Pulisci filtri
                </button>
              ) : null}
            </div>
            <div className={styles.accordion}>
              {filteredTeams.map((team) => (
                <TeamAccordionItem
                  isOpen={openTeamId === team.id}
                  key={team.id}
                  matches={data.matches}
                  phaseLabels={matchPhaseLabels}
                  onOpen={() => {
                    setOpenTeamId((current) => (current === team.id ? null : team.id));
                  }}
                  points={standings.find((row) => row.teamId === team.id)?.points ?? 0}
                  seasonId={data.season.id}
                  team={team}
                  teams={data.teams}
                />
              ))}
              {filteredTeams.length === 0 ? (
                <p className={styles.muted}>Nessuna squadra trovata.</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'calendar' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Calendario</h2>
              <span>{filteredCalendarMatches.length.toString()} partite trovate</span>
            </div>
            <div className={styles.calendarAccordions}>
              <details className={styles.calendarAccordion} open>
                <summary className={styles.calendarAccordionSummary}>
                  <span>Prossime partite</span>
                  <small>{upcomingMatches.length.toString()} programmate</small>
                </summary>
                <div className={styles.calendarAccordionBody}>
                  <MatchList
                    emptyLabel="Nessuna prossima partita programmata."
                    matches={upcomingMatches}
                    phaseLabels={matchPhaseLabels}
                    teams={data.teams}
                  />
                </div>
              </details>

              <details className={styles.calendarAccordion}>
                <summary className={styles.calendarAccordionSummary}>
                  <span>Calendario completo</span>
                  <small>{filteredCalendarMatches.length.toString()} partite trovate</small>
                </summary>
                <div className={styles.calendarAccordionBody}>
                  <PublicFilterPanel
                    availablePhases={availableCalendarPhases}
                    isOpen={calendarFilterOpen}
                    onClear={() => {
                      setSelectedCalendarTeamIds([]);
                      setCalendarTeamSearch('');
                      setCalendarPhase('all');
                    }}
                    onPhaseChange={setCalendarPhase}
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
                    phase={calendarPhase}
                    search={calendarTeamSearch}
                    selectedTeamIds={selectedCalendarTeamIds}
                    teams={data.teams}
                  />
                  <MatchList
                    emptyLabel="Calendario non disponibile."
                    matches={filteredCalendarMatches}
                    phaseLabels={matchPhaseLabels}
                    teams={data.teams}
                  />
                </div>
              </details>
            </div>
          </section>
        ) : null}

        {activeTab === 'results' ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Risultati</h2>
              <span>{filteredResultMatches.length.toString()} risultati trovati</span>
            </div>
            <PublicFilterPanel
              availablePhases={availableResultPhases}
              isOpen={resultsFilterOpen}
              onClear={() => {
                setSelectedResultsTeamIds([]);
                setResultsTeamSearch('');
                setResultsPhase('all');
              }}
              onPhaseChange={setResultsPhase}
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
              phase={resultsPhase}
              search={resultsTeamSearch}
              selectedTeamIds={selectedResultsTeamIds}
              teams={data.teams}
            />
            <MatchList
              emptyLabel="Nessun risultato disponibile."
              matches={filteredResultMatches}
              phaseLabels={matchPhaseLabels}
              teams={data.teams}
            />
          </section>
        ) : null}
      </section>
    </main>
  );
}

function BracketBoard({
  bracket,
  matches,
  teams
}: {
  bracket: TournamentBracketWithMatches;
  matches: MatchWithSets[];
  teams: PublicTeam[];
}) {
  const visibleRoundCount = useBracketVisibleRoundCount();
  const [firstVisibleRoundIndex, setFirstVisibleRoundIndex] = useState(0);
  const sourceMap = useMemo(
    () => createBracketSourceMap(bracket.bracketMatches),
    [bracket.bracketMatches]
  );
  const rounds = Array.from(
    new Map(
      [...bracket.bracketMatches]
        .sort((first, second) => first.round_number - second.round_number || first.position - second.position)
        .map((bracketMatch) => [bracketMatch.round_number, bracketMatch.round_label])
    ).entries()
  );
  const maxFirstVisibleRoundIndex = Math.max(rounds.length - visibleRoundCount, 0);
  const safeFirstVisibleRoundIndex = Math.min(firstVisibleRoundIndex, maxFirstVisibleRoundIndex);
  const visibleRounds = rounds.slice(
    safeFirstVisibleRoundIndex,
    safeFirstVisibleRoundIndex + visibleRoundCount
  );
  const visibleRoundLabel = visibleRounds.map(([, roundLabel]) => roundLabel).join(' / ');
  const shouldShowControls = rounds.length > visibleRoundCount;

  useEffect(() => {
    setFirstVisibleRoundIndex((current) => Math.min(current, maxFirstVisibleRoundIndex));
  }, [maxFirstVisibleRoundIndex]);

  const moveBracket = (direction: 'previous' | 'next') => {
    setFirstVisibleRoundIndex((current) => {
      const nextIndex = direction === 'next' ? current + 1 : current - 1;
      return Math.max(0, Math.min(nextIndex, maxFirstVisibleRoundIndex));
    });
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>{bracket.name}</h2>
        <span>{getBracketStatusLabel(bracket.status)}</span>
      </div>
      {shouldShowControls ? (
        <div className={styles.bracketControls} aria-label="Navigazione turni tabellone">
          <button
            aria-label="Turno precedente"
            className={styles.bracketControlButton}
            disabled={safeFirstVisibleRoundIndex === 0}
            onClick={() => {
              moveBracket('previous');
            }}
            type="button"
          >
            <MdChevronLeft aria-hidden="true" />
          </button>
          <div className={styles.bracketVisibleLabel} aria-live="polite">
            {visibleRoundLabel}
          </div>
          <button
            aria-label="Turno successivo"
            className={styles.bracketControlButton}
            disabled={safeFirstVisibleRoundIndex >= maxFirstVisibleRoundIndex}
            onClick={() => {
              moveBracket('next');
            }}
            type="button"
          >
            <MdChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className={styles.bracketBoard}>
        {visibleRounds.map(([roundNumber, roundLabel]) => (
          <section className={styles.bracketRound} key={roundNumber}>
            <h3>{roundLabel}</h3>
            <div className={styles.bracketRoundMatches}>
              {bracket.bracketMatches
                .filter((bracketMatch) => bracketMatch.round_number === roundNumber)
                .sort((first, second) => first.position - second.position)
                .map((bracketMatch) => {
                  const match = matches.find((item) => item.id === bracketMatch.match_id) ?? null;

                  return (
                    <BracketMatchCard
                      bracketMatch={bracketMatch}
                      key={bracketMatch.id}
                      match={match}
                      sourceMap={sourceMap}
                      teams={teams}
                    />
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function BracketMatchCard({
  bracketMatch,
  match,
  sourceMap,
  teams
}: {
  bracketMatch: TournamentBracketMatch;
  match: MatchWithSets | null;
  sourceMap: Map<string, string>;
  teams: PublicTeam[];
}) {
  const winnerTeamId = bracketMatch.winner_team_id ?? (match ? getWinnerTeamId(match) : null);
  const compactSets = match ? getCompactSetLabels(match) : [];
  const matchCode = getBracketMatchCode(bracketMatch.round_label, bracketMatch.position);
  const homeLabel = getBracketSlotLabel({
    bracketMatch,
    getTeamLabel: (teamId) => getTeamName(teams, teamId),
    slot: 'home',
    sourceMap
  });
  const awayLabel = getBracketSlotLabel({
    bracketMatch,
    getTeamLabel: (teamId) => getTeamName(teams, teamId),
    slot: 'away',
    sourceMap
  });

  return (
    <article
      className={cx(
        styles.bracketMatchCard,
        bracketMatch.is_bye
          ? styles.bracketMatchBye
          : match
            ? styles[`matchCard_${match.status}`]
            : styles.bracketMatchPending
      )}
    >
      <div className={styles.bracketMatchMeta}>
        <span className={styles.bracketMatchCode}>{matchCode}</span>
        {bracketMatch.is_bye ? (
          <span className={cx(styles.badge, styles.badgeBye)}>Bye</span>
        ) : match ? (
          <MatchStatusBadge status={match.status} />
        ) : (
          <span className={cx(styles.badge, styles.badge_scheduled)}>Da disputare</span>
        )}
      </div>
      <div className={styles.matchTopline}>
        <strong className={styles.matchTeams}>
          <span className={cx(winnerTeamId === bracketMatch.home_team_id && styles.winnerTeam)}>
            {homeLabel}
            {winnerTeamId === bracketMatch.home_team_id ? (
              <MdCheckCircle
                aria-label="Squadra vincente"
                className={styles.winnerIcon}
                title="Squadra vincente"
              />
            ) : null}
          </span>
          <span className={styles.versus}>vs</span>
          <span className={cx(winnerTeamId === bracketMatch.away_team_id && styles.winnerTeam)}>
            {awayLabel}
            {winnerTeamId === bracketMatch.away_team_id ? (
              <MdCheckCircle
                aria-label="Squadra vincente"
                className={styles.winnerIcon}
                title="Squadra vincente"
              />
            ) : null}
          </span>
        </strong>
      </div>

      {bracketMatch.is_bye ? (
        <p className={styles.bracketWaiting}>Squadra qualificata al turno successivo.</p>
      ) : null}

      {match && isMatchPlayed(match) ? (
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

      {!match && !bracketMatch.is_bye ? <p className={styles.bracketWaiting}>Partita non ancora definita.</p> : null}
    </article>
  );
}

function PhaseSegmentedControl({
  includeAll = false,
  label,
  onChange,
  phases,
  value
}: {
  includeAll?: boolean;
  label: string;
  onChange: (phase: PhaseFilter) => void;
  phases: MatchPhase[];
  value: PhaseFilter;
}) {
  const visiblePhases: PhaseFilter[] = includeAll ? ['all', ...phases] : phases;

  if (visiblePhases.length <= 1 && !includeAll) {
    return null;
  }

  return (
    <div
      aria-label={label}
      className={styles.phaseSegmentedControl}
      role="group"
    >
      {visiblePhases.map((phase) => (
        <button
          aria-pressed={value === phase}
          className={cx(
            styles.phaseSegment,
            value === phase && styles.phaseSegmentActive
          )}
          key={phase}
          onClick={() => {
            onChange(phase);
          }}
          type="button"
        >
          <span>{getPhaseLabel(phase)}</span>
        </button>
      ))}
    </div>
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

function PublicFilterPanel({
  availablePhases,
  isOpen,
  onClear,
  onPhaseChange,
  onSearchChange,
  onToggleOpen,
  onToggleTeam,
  phase,
  search,
  selectedTeamIds,
  teams
}: {
  availablePhases: MatchPhase[];
  isOpen: boolean;
  onClear: () => void;
  onPhaseChange: (phase: PhaseFilter) => void;
  onSearchChange: (value: string) => void;
  onToggleOpen: () => void;
  onToggleTeam: (teamId: string) => void;
  phase: PhaseFilter;
  search: string;
  selectedTeamIds: string[];
  teams: PublicTeam[];
}) {
  const panelId = useId();
  const searchTerm = search.trim().toLowerCase();
  const shouldShowTeamResults = searchTerm.length >= 2;
  const filteredTeams = shouldShowTeamResults
    ? teams
        .filter((team) => {
          const searchableText = [
            team.name,
            getTeamDisplayLabel(team),
            ...team.players.map(getPlayerLabel)
          ]
            .join(' ')
            .toLowerCase();

          return searchableText.includes(searchTerm);
        })
        .filter((team) => !selectedTeamIds.includes(team.id))
        .slice(0, 6)
    : [];
  const selectedTeams = selectedTeamIds
    .map((teamId) => teams.find((team) => team.id === teamId) ?? null)
    .filter((team): team is PublicTeam => team !== null);
  const selectedCount = selectedTeamIds.length;
  const activeFiltersCount = selectedCount + (phase === 'all' ? 0 : 1);

  return (
    <div className={cx(styles.publicFilterPanel, isOpen && styles.publicFilterPanelOpen)}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className={styles.publicFilterToggle}
        onClick={onToggleOpen}
        type="button"
      >
        <span className={styles.publicFilterToggleLabel}>
          <MdFilterList aria-hidden="true" className={styles.publicFilterIcon} />
          <span>Filtri</span>
        </span>
        {activeFiltersCount > 0 ? (
          <span className={styles.publicFilterBadge}>
            {activeFiltersCount.toString()} {activeFiltersCount === 1 ? 'attivo' : 'attivi'}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className={styles.publicFilterPanelBody} id={panelId}>
          <div className={styles.publicFilterSection}>
            <div className={styles.publicFilterSectionHeader}>
              <h3>Squadra</h3>
              {selectedCount > 0 ? <span>{selectedCount.toString()} selezionate</span> : null}
            </div>

            <label className={styles.calendarFilterSearch}>
              <input
                onChange={(event) => {
                  onSearchChange(event.target.value);
                }}
                placeholder="Cerca squadra o giocatore..."
                type="search"
                value={search}
              />
            </label>

            {selectedTeams.length > 0 ? (
              <div className={styles.publicFilterSelectedTeams} aria-label="Squadre selezionate">
                {selectedTeams.map((team) => (
                  <span className={styles.publicFilterSelectedTeam} key={team.id}>
                    <span>{getTeamDisplayLabel(team)}</span>
                    <button
                      aria-label={`Rimuovi ${getTeamDisplayLabel(team)}`}
                      onClick={() => {
                        onToggleTeam(team.id);
                      }}
                      type="button"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {shouldShowTeamResults ? (
              <div className={styles.publicFilterTeamResults}>
                {filteredTeams.length > 0 ? (
                  filteredTeams.map((team) => (
                    <button
                      className={styles.publicFilterTeamResult}
                      key={team.id}
                      onClick={() => {
                        onToggleTeam(team.id);
                        onSearchChange('');
                      }}
                      type="button"
                    >
                      <strong>{getTeamDisplayLabel(team)}</strong>
                      <span>{team.name}</span>
                    </button>
                  ))
                ) : (
                  <p className={styles.publicFilterNoResults}>Nessuna squadra trovata</p>
                )}
              </div>
            ) : null}
          </div>

          <div className={styles.publicFilterSection}>
            <div className={styles.publicFilterSectionHeader}>
              <h3>Fase</h3>
              {phase !== 'all' ? <span>{getPhaseLabel(phase)}</span> : null}
            </div>
            <PhaseSegmentedControl
              includeAll
              label="Filtra per fase"
              onChange={onPhaseChange}
              phases={availablePhases}
              value={phase}
            />
          </div>

          {activeFiltersCount > 0 ? (
            <button className={styles.clearFilterButton} onClick={onClear} type="button">
              Pulisci filtri
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TeamAccordionItem({
  isOpen,
  matches,
  onOpen,
  phaseLabels,
  points,
  seasonId,
  team,
  teams
}: {
  isOpen: boolean;
  matches: MatchWithSets[];
  onOpen: () => void;
  phaseLabels: MatchPhaseLabels;
  points: number;
  seasonId: string;
  team: PublicTeam;
  teams: PublicTeam[];
}) {
  const [selectedPhase, setSelectedPhase] = useState<MatchPhase | null>(null);
  const teamMatches = getUniqueMatchesByFixture(
    matches.filter(
      (match) =>
        match.season_id === seasonId &&
        (match.home_team_id === team.id || match.away_team_id === team.id)
    )
  );
  const availableTeamPhases = useMemo(
    () => getAvailableTeamPhases(team.id, teamMatches),
    [team.id, teamMatches]
  );
  const activeTeamPhase =
    selectedPhase && availableTeamPhases.includes(selectedPhase)
      ? selectedPhase
      : availableTeamPhases.includes('regular_season')
        ? 'regular_season'
        : availableTeamPhases[0] ?? null;
  const totalePartite = teamMatches.length;
  const partiteGiocate = teamMatches.filter(isMatchPlayed).length;
  const partiteDaGiocare = Math.max(totalePartite - partiteGiocate, 0);
  const sortedTeamMatches = sortCalendarMatches(
    activeTeamPhase ? filterMatchesByPhase(teamMatches, activeTeamPhase) : teamMatches
  );

  useEffect(() => {
    if (selectedPhase && !availableTeamPhases.includes(selectedPhase)) {
      setSelectedPhase(null);
    }
  }, [availableTeamPhases, selectedPhase]);

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
          <PhaseSegmentedControl
            label={`Filtra partite ${getTeamDisplayLabel(team)} per fase`}
            onChange={(phase) => {
              if (phase !== 'all') {
                setSelectedPhase(phase);
              }
            }}
            phases={availableTeamPhases}
            value={activeTeamPhase ?? 'regular_season'}
          />
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
                    <span className={styles.matchBadges}>
                      <MatchPhaseBadge label={phaseLabels.get(match.id) ?? getPhaseLabel(match.phase)} />
                      <MatchStatusBadge status={match.status} />
                    </span>
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
  phaseLabels,
  teams
}: {
  emptyLabel: string;
  matches: MatchWithSets[];
  phaseLabels: MatchPhaseLabels;
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
                <span className={styles.matchBadges}>
                  <MatchPhaseBadge label={phaseLabels.get(match.id) ?? getPhaseLabel(match.phase)} />
                  <MatchStatusBadge status={match.status} />
                </span>
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

function MatchPhaseBadge({ label }: { label: string }) {
  return <span className={styles.matchPhaseBadge}>{label}</span>;
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
