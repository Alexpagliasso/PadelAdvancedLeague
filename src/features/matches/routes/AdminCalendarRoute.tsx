import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaShuffle } from 'react-icons/fa6';
import { MdCancel, MdCheckCircle, MdEventBusy, MdSchedule } from 'react-icons/md';

import { ButtonLoader, SectionLoader } from '@/components/loaders/PadLoaders';
import type { MatchSetInput, MatchWithSets } from '@/features/matches/api/matchesApi';
import {
  useMatchesBySeasonQuery,
  useResetMatchResultMutation,
  useShuffleCalendarOrderMutation,
  useUpdateMatchMutation
} from '@/features/matches/api/matchesQueries';
import {
  buildMatchDateTime,
  formatMatchDate,
  formatMatchDateTime,
  getMatchDateInputValue,
  getMatchTimeOrDefault,
  getNearestHalfHourTime,
  halfHourTimeSlots
} from '@/features/matches/lib/matchDateTime';
import { usePlayersQuery } from '@/features/players/api/playersQueries';
import type { TeamWithMembers } from '@/features/teams/api/teamsApi';
import { useTeamsBySeasonQuery } from '@/features/teams/api/teamsQueries';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';
import type { MatchPhase, MatchStatus } from '@/lib/supabase/types';

import styles from '@/features/matches/routes/AdminCalendarRoute.module.scss';

type CalendarRound = {
  label: string;
  matches: MatchWithSets[];
};

type MatchModalFormState = {
  date: string;
  time: string;
  venue: string;
  status: MatchStatus;
  set1Home: string;
  set1Away: string;
  set2Home: string;
  set2Away: string;
  set3Home: string;
  set3Away: string;
  set3Supertiebreak: boolean;
};

type PhaseFilter = 'all' | MatchPhase;

const emptyMatchForm: MatchModalFormState = {
  date: '',
  time: getNearestHalfHourTime(),
  venue: 'GPadel Borgaro',
  status: 'scheduled',
  set1Home: '',
  set1Away: '',
  set2Home: '',
  set2Away: '',
  set3Home: '',
  set3Away: '',
  set3Supertiebreak: true
};

const defaultVenue = 'GPadel Borgaro';
const otherVenueValue = '__other__';
const venueOptions = [
  'GPadel Borgaro',
  'GPadel Leinì',
  'GPadel Borgo Vittoria',
  'GPadel Borgo Po',
  'GPadel Rivalta/Bruino',
  'GPadel Torino',
  'GPadel Torrazza'
];

const phaseLabels: Record<MatchPhase, string> = {
  regular_season: 'Girone',
  playoff: 'Playoff',
  playout: 'Playout'
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Errore imprevisto.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    scheduled: 'Da disputare',
    played: 'Giocata',
    postponed: 'Rinviata',
    cancelled: 'Annullata'
  };

  return labels[status];
}

function getStatusIcon(status: MatchStatus): IconType {
  const icons: Record<MatchStatus, IconType> = {
    scheduled: MdSchedule,
    played: MdCheckCircle,
    postponed: MdEventBusy,
    cancelled: MdCancel
  };

  return icons[status];
}

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const StatusIcon = getStatusIcon(status);

  return (
    <span className={cx(styles.badge, styles[`badge_${status}`])}>
      <StatusIcon aria-hidden="true" className={styles.badgeIcon} />
      <span>{getStatusLabel(status)}</span>
    </span>
  );
}

function getCalendarGeneratedAt(matches: MatchWithSets[]): string | null {
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort((first, second) => first.created_at.localeCompare(second.created_at))[0]
    ?.created_at ?? null;
}

function compareMatches(first: MatchWithSets, second: MatchWithSets): number {
  const firstDay = first.matchday ?? Number.MAX_SAFE_INTEGER;
  const secondDay = second.matchday ?? Number.MAX_SAFE_INTEGER;

  if (firstDay !== secondDay) {
    return firstDay - secondDay;
  }

  const firstOrder = first.display_order ?? Number.MAX_SAFE_INTEGER;
  const secondOrder = second.display_order ?? Number.MAX_SAFE_INTEGER;

  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return (first.scheduled_at ?? first.created_at).localeCompare(second.scheduled_at ?? second.created_at);
}

function getRounds(matches: MatchWithSets[], teamsCount: number): CalendarRound[] {
  const sortedMatches = [...matches].sort(compareMatches);
  const explicitMatchdays = sortedMatches.filter((match) => match.matchday !== null);

  if (explicitMatchdays.length > 0) {
    const matchdays = Array.from(new Set(explicitMatchdays.map((match) => match.matchday))).sort(
      (first, second) => (first ?? 0) - (second ?? 0)
    );

    const rounds = matchdays.map((matchday) => ({
      label: `Giornata ${String(matchday ?? '-')}`,
      matches: sortedMatches.filter((match) => match.matchday === matchday)
    }));
    const unassignedMatches = sortedMatches.filter((match) => match.matchday === null);

    return unassignedMatches.length > 0
      ? [...rounds, { label: 'Senza giornata', matches: unassignedMatches }]
      : rounds;
  }

  const roundSize = Math.max(1, Math.floor(teamsCount / 2));
  const rounds: CalendarRound[] = [];

  for (let index = 0; index < sortedMatches.length; index += roundSize) {
    rounds.push({
      label: `Giornata ${(Math.floor(index / roundSize) + 1).toString()}`,
      matches: sortedMatches.slice(index, index + roundSize)
    });
  }

  return rounds;
}

function getResultLabel(match: MatchWithSets): string {
  if (match.result_status !== 'official' || match.status !== 'played') {
    return 'Da disputare';
  }

  return `${match.home_sets_won.toString()} - ${match.away_sets_won.toString()}`;
}

function getSetDetail(match: MatchWithSets): string {
  return match.sets
    .map((set) => `${set.home_games.toString()}-${set.away_games.toString()}`)
    .join(' · ');
}

function matchToForm(match: MatchWithSets): MatchModalFormState {
  const setOne = match.sets.find((set) => set.set_number === 1);
  const setTwo = match.sets.find((set) => set.set_number === 2);
  const setThree = match.sets.find((set) => set.set_number === 3);

  return {
    date: getMatchDateInputValue(match.scheduled_at),
    time: getMatchTimeOrDefault(match.scheduled_at),
    venue: match.venue ?? defaultVenue,
    status: match.status,
    set1Home: setOne?.home_games.toString() ?? '',
    set1Away: setOne?.away_games.toString() ?? '',
    set2Home: setTwo?.home_games.toString() ?? '',
    set2Away: setTwo?.away_games.toString() ?? '',
    set3Home: setThree?.home_games.toString() ?? '',
    set3Away: setThree?.away_games.toString() ?? '',
    set3Supertiebreak: setThree
      ? Math.max(setThree.home_games, setThree.away_games) >= 10
      : true
  };
}

function parseScoreValue(value: string, label: string): number {
  if (!value.trim()) {
    throw new Error(`${label} è obbligatorio.`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} deve essere un numero intero positivo.`);
  }

  return parsed;
}

function getSetWinner(homeGames: number, awayGames: number): 'home' | 'away' | null {
  if (homeGames > awayGames) {
    return 'home';
  }

  if (awayGames > homeGames) {
    return 'away';
  }

  return null;
}

function validateNormalSet(homeGames: number, awayGames: number, label: string): void {
  const high = Math.max(homeGames, awayGames);
  const low = Math.min(homeGames, awayGames);

  const isValid =
    (high === 6 && low >= 0 && low <= 4) ||
    (high === 7 && (low === 5 || low === 6));

  if (!isValid || homeGames === awayGames) {
    throw new Error(`${label} non valido. Usa 6-0...6-4, 7-5 o 7-6.`);
  }
}

function validateSupertiebreak(homeGames: number, awayGames: number): void {
  const high = Math.max(homeGames, awayGames);
  const low = Math.min(homeGames, awayGames);

  const isValid = high === 10 ? low <= 8 : high > 10 && low === high - 2;

  if (!isValid || homeGames === awayGames) {
    throw new Error('Supertiebreak non valido. Esempi validi: 10-8, 11-9, 12-10.');
  }
}

function getSetsFromForm(form: MatchModalFormState): MatchSetInput[] {
  const hasAnyResult =
    form.set1Home ||
    form.set1Away ||
    form.set2Home ||
    form.set2Away ||
    form.set3Home ||
    form.set3Away;

  if (!hasAnyResult) {
    return [];
  }

  const set1Home = parseScoreValue(form.set1Home, 'Set 1 squadra A');
  const set1Away = parseScoreValue(form.set1Away, 'Set 1 squadra B');
  const set2Home = parseScoreValue(form.set2Home, 'Set 2 squadra A');
  const set2Away = parseScoreValue(form.set2Away, 'Set 2 squadra B');

  validateNormalSet(set1Home, set1Away, 'Set 1');
  validateNormalSet(set2Home, set2Away, 'Set 2');

  const setOneWinner = getSetWinner(set1Home, set1Away);
  const setTwoWinner = getSetWinner(set2Home, set2Away);
  const sets: MatchSetInput[] = [
    { set_number: 1, home_games: set1Home, away_games: set1Away },
    { set_number: 2, home_games: set2Home, away_games: set2Away }
  ];

  if (setOneWinner === setTwoWinner) {
    return sets;
  }

  const set3Home = parseScoreValue(form.set3Home, 'Set 3 squadra A');
  const set3Away = parseScoreValue(form.set3Away, 'Set 3 squadra B');

  if (form.set3Supertiebreak) {
    validateSupertiebreak(set3Home, set3Away);
  } else {
    validateNormalSet(set3Home, set3Away, 'Set 3');
  }

  return [...sets, { set_number: 3, home_games: set3Home, away_games: set3Away }];
}

function shouldShowThirdSet(form: MatchModalFormState): boolean {
  const set1Home = Number(form.set1Home);
  const set1Away = Number(form.set1Away);
  const set2Home = Number(form.set2Home);
  const set2Away = Number(form.set2Away);

  if (
    !Number.isInteger(set1Home) ||
    !Number.isInteger(set1Away) ||
    !Number.isInteger(set2Home) ||
    !Number.isInteger(set2Away) ||
    set1Home === set1Away ||
    set2Home === set2Away
  ) {
    return Boolean(form.set3Home || form.set3Away);
  }

  return getSetWinner(set1Home, set1Away) !== getSetWinner(set2Home, set2Away);
}

function getTeamLabel(team: TeamWithMembers, getPlayerName: (playerId: string) => string): string {
  const memberNames = team.members
    .sort((first, second) => first.position - second.position)
    .map((member) => getPlayerName(member.player_id))
    .filter(Boolean);

  return memberNames.length > 0 ? memberNames.join(' / ') : team.name;
}

function getTeamSearchText(
  team: TeamWithMembers,
  getPlayerName: (playerId: string) => string
): string {
  return `${team.name} ${team.members.map((member) => getPlayerName(member.player_id)).join(' ')}`
    .trim()
    .toLowerCase();
}

export function AdminCalendarRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const playersQuery = usePlayersQuery();

  const tournamentOptions = useMemo(
    () =>
      (tournamentsQuery.data ?? [])
        .filter((tournament) => tournament.status === 'active')
        .map((tournament) => ({
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
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
  const [matchdayFilter, setMatchdayFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [matchForm, setMatchForm] = useState<MatchModalFormState>(emptyMatchForm);
  const [modalError, setModalError] = useState<string | null>(null);

  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedSeasonId);
  const shuffleCalendarMutation = useShuffleCalendarOrderMutation(selectedSeasonId);
  const updateMatchMutation = useUpdateMatchMutation(selectedSeasonId);
  const resetMatchMutation = useResetMatchResultMutation(selectedSeasonId);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;
  const calendarGeneratedAt = useMemo(() => getCalendarGeneratedAt(matches), [matches]);
  const isCalendarGenerated = calendarGeneratedAt !== null;
  const availableMatchdays = useMemo(
    () =>
      Array.from(
        new Set(
          matches
            .map((match) => match.matchday)
            .filter((matchday): matchday is number => matchday !== null)
        )
      ).sort((first, second) => first - second),
    [matches]
  );
  const availablePhases = useMemo(
    () => Array.from(new Set(matches.map((match) => match.phase))).sort(),
    [matches]
  );

  const getPlayerName = useCallback((playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    const fallbackName = `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim();
    return player?.display_name ?? fallbackName;
  }, [players]);

  const getTeamName = (teamId: string): string => {
    const team = teams.find((item) => item.id === teamId);
    return team ? getTeamLabel(team, getPlayerName) : 'Squadra';
  };

  const filteredTeamOptions = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    return teams
      .filter((team) => getTeamSearchText(team, getPlayerName).includes(query))
      .slice(0, 8);
  }, [getPlayerName, teamSearch, teams]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        const matchesMatchday =
          matchdayFilter === 'all' || match.matchday === Number(matchdayFilter);
        const matchesPhase = phaseFilter === 'all' || match.phase === phaseFilter;
        const matchesTeam =
          !selectedTeamId ||
          match.home_team_id === selectedTeamId ||
          match.away_team_id === selectedTeamId;

        return matchesMatchday && matchesPhase && matchesTeam;
      }),
    [matchdayFilter, matches, phaseFilter, selectedTeamId]
  );
  const rounds = useMemo(
    () => getRounds(filteredMatches, teams.length),
    [filteredMatches, teams.length]
  );
  const selectedTeam = selectedTeamId
    ? teams.find((team) => team.id === selectedTeamId) ?? null
    : null;

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

  useEffect(() => {
    setMatchdayFilter('all');
    setPhaseFilter('all');
    setSelectedTeamId(null);
    setTeamSearch('');
    setMessage(null);
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedMatch) {
      return;
    }

    setMatchForm(matchToForm(selectedMatch));
    setModalError(null);
  }, [selectedMatch]);

  useEffect(() => {
    if (!selectedMatchId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedMatchId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedMatchId]);

  const handleShuffleCalendar = async () => {
    setMessage(null);

    if (!isCalendarGenerated) {
      setMessage('Genera il calendario prima di rimescolare l’ordine.');
      return;
    }

    const confirmed = window.confirm(
      'Verrà modificato solo l’ordine visuale delle giornate. Gli accoppiamenti resteranno invariati. Continuare?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await shuffleCalendarMutation.mutateAsync({ teamsCount: teams.length });
      setMessage('Ordine calendario rimescolato correttamente.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleSaveMatch = async () => {
    if (!selectedMatch || !selectedSeasonId) {
      return;
    }

    setModalError(null);

    try {
      const sets = getSetsFromForm(matchForm);

      if (sets.length > 0 && (!matchForm.date || !matchForm.time || !matchForm.venue.trim())) {
        setModalError('Per salvare un risultato devi inserire data, ora e luogo della partita.');
        return;
      }

      await updateMatchMutation.mutateAsync({
        id: selectedMatch.id,
        season_id: selectedSeasonId,
        home_team_id: selectedMatch.home_team_id,
        away_team_id: selectedMatch.away_team_id,
        scheduled_at: buildMatchDateTime(matchForm.date, matchForm.time),
        venue: matchForm.venue.trim() || null,
        status: sets.length > 0 ? 'played' : matchForm.status,
        sets
      });
      setSelectedMatchId(null);
      setMessage('Partita aggiornata correttamente.');
    } catch (error) {
      setModalError(getErrorMessage(error));
    }
  };

  const handleResetResult = async () => {
    if (!selectedMatch) {
      return;
    }

    const confirmed = window.confirm('Vuoi annullare il risultato di questa partita?');

    if (!confirmed) {
      return;
    }

    setModalError(null);

    try {
      await resetMatchMutation.mutateAsync(selectedMatch.id);
      setSelectedMatchId(null);
      setMessage('Risultato annullato.');
    } catch (error) {
      setModalError(getErrorMessage(error));
    }
  };

  const resetFilters = () => {
    setMatchdayFilter('all');
    setPhaseFilter('all');
    setSelectedTeamId(null);
    setTeamSearch('');
  };

  const isSavingMatch = updateMatchMutation.isPending || resetMatchMutation.isPending;
  const showThirdSet = shouldShowThirdSet(matchForm);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Area admin</p>
          <h1 className={styles.title}>Calendario</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.buttonSecondary}
            disabled={!selectedSeasonId || !isCalendarGenerated || shuffleCalendarMutation.isPending}
            onClick={() => void handleShuffleCalendar()}
            type="button"
          >
            {shuffleCalendarMutation.isPending ? (
              <ButtonLoader label="Rimescolo" />
            ) : (
              <>
                <FaShuffle aria-hidden="true" className={styles.buttonIcon} />
                <span>Rimescola ordine calendario</span>
              </>
            )}
          </button>
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

        <div className={styles.filters}>
          <label className={styles.field}>
            <span className={styles.label}>Giornata</span>
            <select
              className={styles.select}
              onChange={(event) => {
                setMatchdayFilter(event.target.value);
              }}
              value={matchdayFilter}
            >
              <option value="all">Tutte</option>
              {availableMatchdays.map((matchday) => (
                <option key={matchday} value={matchday}>
                  Giornata {matchday}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Fase</span>
            <select
              className={styles.select}
              onChange={(event) => {
                setPhaseFilter(event.target.value as PhaseFilter);
              }}
              value={phaseFilter}
            >
              <option value="all">Tutte</option>
              {availablePhases.map((phase) => (
                <option key={phase} value={phase}>
                  {selectedTournament?.format === 'knockout' && phase === 'playoff'
                    ? 'Knockout'
                    : phaseLabels[phase]}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="admin-calendar-team-search">
              Squadra
            </label>
            <input
              className={styles.input}
              id="admin-calendar-team-search"
              onChange={(event) => {
                setTeamSearch(event.target.value);
              }}
              placeholder="Cerca squadra o giocatore..."
              value={teamSearch}
            />
            {filteredTeamOptions.length > 0 ? (
              <div className={styles.searchResults}>
                {filteredTeamOptions.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => {
                      setSelectedTeamId(team.id);
                      setTeamSearch('');
                    }}
                    type="button"
                  >
                    {getTeamLabel(team, getPlayerName)}
                  </button>
                ))}
              </div>
            ) : teamSearch.trim().length >= 2 ? (
              <p className={styles.searchEmpty}>Nessuna squadra trovata.</p>
            ) : null}
            {selectedTeam ? (
              <span className={styles.selectedChip}>
                {getTeamLabel(selectedTeam, getPlayerName)}
                <button
                  aria-label="Rimuovi filtro squadra"
                  onClick={() => {
                    setSelectedTeamId(null);
                  }}
                  type="button"
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>

          <button className={styles.clearButton} onClick={resetFilters} type="button">
            Pulisci filtri
          </button>
        </div>

        {calendarGeneratedAt ? (
          <p className={styles.successMessage}>Calendario generato il {formatMatchDate(calendarGeneratedAt)}</p>
        ) : null}
        {!isCalendarGenerated && teams.length < 2 ? (
          <p className={styles.muted}>Servono almeno 2 squadre per generare il calendario.</p>
        ) : null}
        {message ? <p className={styles.muted}>{message}</p> : null}
      </div>

      {matchesQuery.isError ? <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p> : null}
      {teamsQuery.isError ? <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p> : null}
      {playersQuery.isError ? <p className={styles.error}>{getErrorMessage(playersQuery.error)}</p> : null}

      {matchesQuery.isLoading || teamsQuery.isLoading ? (
        <SectionLoader label="Caricamento calendario" />
      ) : null}

      <div className={styles.rounds}>
        {rounds.map((round) => (
          <section className={styles.panel} key={round.label}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{round.label}</h2>
              <span className={styles.muted}>{round.matches.length} partite</span>
            </div>
            <div className={styles.mobileList}>
              {round.matches.map((match) => {
                const homeTeamName = getTeamName(match.home_team_id);
                const awayTeamName = getTeamName(match.away_team_id);

                return (
                  <button
                    className={cx(
                      styles.matchCard,
                      match.status === 'played' && styles.matchCardPlayed
                    )}
                    key={match.id}
                    onClick={() => {
                      setSelectedMatchId(match.id);
                    }}
                    type="button"
                  >
                    <span className={styles.matchCardTop}>
                      <MatchStatusBadge status={match.status} />
                      <span>{phaseLabels[match.phase]}</span>
                    </span>
                    <strong>
                      {homeTeamName} vs {awayTeamName}
                    </strong>
                    <span>Data: {formatMatchDateTime(match.scheduled_at)}</span>
                    <span>Luogo: {match.venue ?? '-'}</span>
                    <span>
                      Risultato: {getResultLabel(match)}
                      {match.sets.length > 0 ? ` (${getSetDetail(match)})` : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ordine</th>
                    <th>Data</th>
                    <th>Luogo</th>
                    <th>Fase</th>
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
                        onClick={() => {
                          setSelectedMatchId(match.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedMatchId(match.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td>{match.display_order ?? '-'}</td>
                        <td>{formatMatchDateTime(match.scheduled_at)}</td>
                        <td>{match.venue ?? '-'}</td>
                        <td>{phaseLabels[match.phase]}</td>
                        <td>{homeTeamName}</td>
                        <td>{awayTeamName}</td>
                        <td>
                          <MatchStatusBadge status={match.status} />
                        </td>
                        <td>
                          <strong>{getResultLabel(match)}</strong>
                          {match.sets.length > 0 ? (
                            <small className={styles.setDetail}>{getSetDetail(match)}</small>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!matchesQuery.isLoading && rounds.length === 0 ? (
          <section className={styles.panel}>
            <p className={styles.muted}>Nessuna partita trovata con i filtri selezionati.</p>
          </section>
        ) : null}
      </div>

      {selectedMatch ? (
        <div
          className={styles.modalOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedMatchId(null);
            }
          }}
          role="presentation"
        >
          <section aria-modal="true" className={styles.modal} role="dialog">
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Partita</p>
                <h2>
                  {getTeamName(selectedMatch.home_team_id)} vs {getTeamName(selectedMatch.away_team_id)}
                </h2>
              </div>
              <button
                aria-label="Chiudi modale partita"
                className={styles.closeButton}
                onClick={() => {
                  setSelectedMatchId(null);
                }}
                type="button"
              >
                ×
              </button>
            </header>

            {modalError ? <p className={styles.error}>{modalError}</p> : null}

            <div className={styles.modalGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Data</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setMatchForm((current) => ({ ...current, date: event.target.value }));
                  }}
                  type="date"
                  value={matchForm.date}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Ora</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setMatchForm((current) => ({ ...current, time: event.target.value }));
                  }}
                  value={matchForm.time}
                >
                  {halfHourTimeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="match-venue-choice">
                  Luogo
                </label>
                <select
                  className={styles.select}
                  id="match-venue-choice"
                  onChange={(event) => {
                    setMatchForm((current) => ({
                      ...current,
                      venue: event.target.value === otherVenueValue ? '' : event.target.value
                    }));
                  }}
                  value={venueOptions.includes(matchForm.venue) ? matchForm.venue : otherVenueValue}
                >
                  {venueOptions.map((venue) => (
                    <option key={venue} value={venue}>
                      {venue}
                    </option>
                  ))}
                  <option value={otherVenueValue}>Altro</option>
                </select>
                {!venueOptions.includes(matchForm.venue) ? (
                  <input
                    className={styles.input}
                    onChange={(event) => {
                      setMatchForm((current) => ({ ...current, venue: event.target.value }));
                    }}
                    placeholder="Inserisci luogo"
                    value={matchForm.venue}
                  />
                ) : null}
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Stato</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setMatchForm((current) => ({
                      ...current,
                      status: event.target.value as MatchStatus
                    }));
                  }}
                  value={matchForm.status}
                >
                  <option value="scheduled">Da disputare</option>
                  <option value="postponed">Rinviata</option>
                  <option value="cancelled">Annullata</option>
                  <option value="played">Giocata</option>
                </select>
              </label>
            </div>

            <fieldset className={styles.resultBox}>
              <legend>Risultato</legend>
              <div className={styles.scoreRows}>
                <div className={styles.scoreRow}>
                  <span>Set 1</span>
                  <input
                    aria-label="Set 1 game squadra A"
                    className={styles.scoreInput}
                    onChange={(event) => {
                      setMatchForm((current) => ({ ...current, set1Home: event.target.value }));
                    }}
                    inputMode="numeric"
                    value={matchForm.set1Home}
                  />
                  <span>-</span>
                  <input
                    aria-label="Set 1 game squadra B"
                    className={styles.scoreInput}
                    onChange={(event) => {
                      setMatchForm((current) => ({ ...current, set1Away: event.target.value }));
                    }}
                    inputMode="numeric"
                    value={matchForm.set1Away}
                  />
                </div>
                <div className={styles.scoreRow}>
                  <span>Set 2</span>
                  <input
                    aria-label="Set 2 game squadra A"
                    className={styles.scoreInput}
                    onChange={(event) => {
                      setMatchForm((current) => ({ ...current, set2Home: event.target.value }));
                    }}
                    inputMode="numeric"
                    value={matchForm.set2Home}
                  />
                  <span>-</span>
                  <input
                    aria-label="Set 2 game squadra B"
                    className={styles.scoreInput}
                    onChange={(event) => {
                      setMatchForm((current) => ({ ...current, set2Away: event.target.value }));
                    }}
                    inputMode="numeric"
                    value={matchForm.set2Away}
                  />
                </div>
                {showThirdSet ? (
                  <div className={styles.scoreRow}>
                    <span>Set 3</span>
                    <input
                      aria-label="Set 3 game squadra A"
                      className={styles.scoreInput}
                      onChange={(event) => {
                        setMatchForm((current) => ({ ...current, set3Home: event.target.value }));
                      }}
                      inputMode="numeric"
                      value={matchForm.set3Home}
                    />
                    <span>-</span>
                    <input
                      aria-label="Set 3 game squadra B"
                      className={styles.scoreInput}
                      onChange={(event) => {
                        setMatchForm((current) => ({ ...current, set3Away: event.target.value }));
                      }}
                      inputMode="numeric"
                      value={matchForm.set3Away}
                    />
                  </div>
                ) : null}
              </div>
              {showThirdSet ? (
                <label className={styles.checkboxRow}>
                  <input
                    checked={matchForm.set3Supertiebreak}
                    onChange={(event) => {
                      setMatchForm((current) => ({
                        ...current,
                        set3Supertiebreak: event.target.checked
                      }));
                    }}
                    type="checkbox"
                  />
                  Set 3 come supertiebreak
                </label>
              ) : null}
              <p className={styles.muted}>
                Set normali validi: 6-0...6-4, 7-5, 7-6. Supertiebreak: 10-8,
                11-9, 12-10.
              </p>
            </fieldset>

            <footer className={styles.modalActions}>
              <button
                className={styles.buttonDanger}
                disabled={isSavingMatch || selectedMatch.sets.length === 0}
                onClick={() => void handleResetResult()}
                type="button"
              >
                Reset
              </button>
              <button
                className={styles.button}
                disabled={isSavingMatch}
                onClick={() => void handleSaveMatch()}
                type="button"
              >
                {isSavingMatch ? (
                  <ButtonLoader label="Salvo" />
                ) : selectedMatch.sets.length > 0 || showThirdSet || matchForm.set1Home || matchForm.set1Away ? (
                  'Salva'
                ) : (
                  'Programma'
                )}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
