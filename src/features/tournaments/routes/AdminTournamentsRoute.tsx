import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaFloppyDisk,
  FaPenToSquare,
  FaPlus,
  FaSitemap,
  FaTrashCan,
  FaUser,
  FaXmark
} from 'react-icons/fa6';
import { MdPauseCircle, MdPlayCircle } from 'react-icons/md';
import { Link } from 'react-router-dom';

import {
  useGenerateCalendarMutation,
  useGenerateKnockoutMutation,
  useGeneratePlayoffPlayoutMutation,
  useMatchesBySeasonQuery,
  useTournamentBracketsQuery
} from '@/features/matches/api/matchesQueries';
import {
  createBracketSourceMap,
  getBracketMatchCode,
  getBracketSlotLabel
} from '@/features/matches/lib/bracketDisplay';
import { formatMatchDate } from '@/features/matches/lib/matchDateTime';
import { getUniqueMatchesByFixture, isMatchPlayed } from '@/features/matches/lib/matchStatus';
import { usePlayersQuery } from '@/features/players/api/playersQueries';
import { calculateStandings, type StandingRow } from '@/features/standings/lib/standingsEngine';
import {
  useCreateTeamMutation,
  useTeamsBySeasonQuery
} from '@/features/teams/api/teamsQueries';
import {
  useAdminTournamentsQuery,
  useCreateConfiguredTournamentMutation,
  useDeleteTournamentMutation,
  useUpdateTournamentMutation,
  useUpdateTournamentStatusMutation
} from '@/features/tournaments/api/tournamentsQueries';
import type { Player } from '@/features/players/api/playersApi';
import type {
  CreateConfiguredTournamentInput,
  TournamentWithSeasons
} from '@/features/tournaments/api/tournamentsApi';
import {
  competitionPhaseLabels,
  tournamentFormatDescriptions,
  tournamentFormatLabels,
  tournamentFormatOptions,
  type TournamentFormat
} from '@/features/tournaments/types/tournamentFormat';
import type {
  BracketType,
  MatchStatus,
  TournamentStatus
} from '@/lib/supabase/types';

import styles from '@/features/tournaments/routes/AdminTournamentsRoute.module.scss';

type TournamentFormState = {
  name: string;
  slug: string;
  description: string;
  status: TournamentStatus;
  isPublic: boolean;
  expectedTeamsCount: string;
  format: TournamentFormat;
  allowByes: boolean;
  playoffTeamsCount: string;
  playoutTeamsCount: string;
};

type QuickTeamFormState = {
  name: string;
  slug: string;
  playerOneId: string;
  playerTwoId: string;
};

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type DetailTab = 'overview' | 'teams';

type WizardTeamState = {
  name: string;
  playerOneId: string;
  playerTwoId: string;
  ranking: string;
};

type TournamentWizardState = TournamentFormState & {
  splitRegularSeasonRounds: boolean;
  teams: WizardTeamState[];
};

const emptyTournamentForm: TournamentFormState = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  isPublic: false,
  expectedTeamsCount: '2',
  format: 'round_robin',
  allowByes: true,
  playoffTeamsCount: '',
  playoutTeamsCount: ''
};

const emptyQuickTeamForm: QuickTeamFormState = {
  name: '',
  slug: '',
  playerOneId: '',
  playerTwoId: ''
};

function createEmptyWizardTeams(count: number): WizardTeamState[] {
  return Array.from({ length: count }, () => ({
    name: '',
    playerOneId: '',
    playerTwoId: '',
    ranking: ''
  }));
}

function createEmptyWizardState(): TournamentWizardState {
  return {
    ...emptyTournamentForm,
    splitRegularSeasonRounds: true,
    teams: createEmptyWizardTeams(2)
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Errore imprevisto.';
}

function getTournamentStatusLabel(status: TournamentStatus): string {
  const labels: Record<TournamentStatus, string> = {
    draft: 'Bozza',
    active: 'Attivo',
    archived: 'Archiviato'
  };

  return labels[status];
}

function getMatchStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    scheduled: 'Da disputare',
    played: 'Giocata',
    postponed: 'Rinviata',
    cancelled: 'Annullata'
  };

  return labels[status];
}

function getBracketTypeLabel(type: BracketType): string {
  const labels: Record<BracketType, string> = {
    knockout: 'Tabellone',
    playoff: 'Playoff',
    playout: 'Playout'
  };

  return labels[type];
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function parseRequiredPositiveInteger(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} deve essere un numero intero.`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(value: string, label: string): number | null {
  if (!value.trim()) {
    return null;
  }

  return parseRequiredPositiveInteger(value, label);
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getPlayerLabel(player: Player): string {
  return player.display_name || `${player.first_name} ${player.last_name}`.trim();
}

function PlayerAvatar({ player }: { player: Player }) {
  if (player.photo_url) {
    return <img alt="" className={styles.playerAvatar} src={player.photo_url} />;
  }

  return (
    <span aria-hidden="true" className={styles.playerAvatarFallback}>
      <FaUser />
    </span>
  );
}

function QuickPlayerPicker({
  label,
  options,
  search,
  selectedPlayer,
  onRemove,
  onSearchChange,
  onSelect
}: {
  label: string;
  options: Player[];
  search: string;
  selectedPlayer: Player | null;
  onRemove: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (playerId: string) => void;
}) {
  return (
    <div className={styles.playerPicker}>
      <label className={styles.field}>
        <span className={styles.label}>{label}</span>
        <input
          className={styles.input}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          placeholder="Cerca giocatore..."
          type="search"
          value={search}
        />
      </label>
      {selectedPlayer ? (
        <span className={styles.selectedPlayerChip}>
          <PlayerAvatar player={selectedPlayer} />
          <strong>{getPlayerLabel(selectedPlayer)}</strong>
          <button aria-label={`Rimuovi ${label}`} onClick={onRemove} type="button">
            <FaXmark aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {search.trim().length >= 2 ? (
        <div className={styles.playerResults}>
          {options.length > 0 ? (
            options.map((player) => (
              <button
                key={player.id}
                onClick={() => {
                  onSelect(player.id);
                }}
                type="button"
              >
                <PlayerAvatar player={player} />
                <span>{getPlayerLabel(player)}</span>
              </button>
            ))
          ) : (
            <p className={styles.muted}>Nessun giocatore disponibile.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function tournamentToForm(tournament: TournamentWithSeasons | null): TournamentFormState {
  if (!tournament) {
    return emptyTournamentForm;
  }

  return {
    name: tournament.name,
    slug: tournament.slug,
    description: tournament.description ?? '',
    status: tournament.status,
    isPublic: tournament.is_public,
    expectedTeamsCount: tournament.expected_teams_count.toString(),
    format: tournament.format,
    allowByes: tournament.allow_byes,
    playoffTeamsCount: tournament.playoff_teams_count?.toString() ?? '',
    playoutTeamsCount: tournament.playout_teams_count?.toString() ?? ''
  };
}

function tournamentToWizardState(tournament: TournamentWithSeasons): TournamentWizardState {
  const expectedTeamsCount = Math.max(tournament.expected_teams_count, 2);

  return {
    ...tournamentToForm(tournament),
    splitRegularSeasonRounds: true,
    teams: createEmptyWizardTeams(expectedTeamsCount)
  };
}

type NormalizedCompetitionSettings = {
  expected_teams_count: number;
  format: TournamentFormat;
  allow_byes: boolean;
  playoff_teams_count: number | null;
  playout_teams_count: number | null;
};

function normalizeCompetitionSettings(
  form: TournamentFormState
): NormalizedCompetitionSettings {
  const expectedTeamsCount = parseRequiredPositiveInteger(
    form.expectedTeamsCount,
    'Il numero partecipanti'
  );

  if (expectedTeamsCount < 2) {
    throw new Error('Il numero partecipanti deve essere almeno 2.');
  }

  if (form.format === 'round_robin') {
    return {
      expected_teams_count: expectedTeamsCount,
      format: form.format,
      allow_byes: false,
      playoff_teams_count: null,
      playout_teams_count: null
    };
  }

  if (form.format === 'knockout') {
    if (!isPowerOfTwo(expectedTeamsCount) && !form.allowByes) {
      throw new Error(
        'Eliminazione diretta con partecipanti non potenza di 2 richiede i bye automatici.'
      );
    }

    return {
      expected_teams_count: expectedTeamsCount,
      format: form.format,
      allow_byes: form.allowByes,
      playoff_teams_count: null,
      playout_teams_count: null
    };
  }

  const playoffTeamsCount = parseOptionalPositiveInteger(
    form.playoffTeamsCount,
    'Il numero squadre playoff'
  );
  const playoutTeamsCount = parseOptionalPositiveInteger(
    form.playoutTeamsCount,
    'Il numero squadre playout'
  );

  if (playoffTeamsCount !== null && playoffTeamsCount <= 1) {
    throw new Error('Le squadre playoff devono essere almeno 2.');
  }

  if (playoutTeamsCount !== null && playoutTeamsCount <= 1) {
    throw new Error('Le squadre playout devono essere almeno 2.');
  }

  if (playoffTeamsCount === null && playoutTeamsCount === null) {
    throw new Error('Configura almeno playoff o playout.');
  }

  if (playoffTeamsCount !== null && playoffTeamsCount > expectedTeamsCount) {
    throw new Error('Le squadre playoff non possono superare i partecipanti.');
  }

  if (playoutTeamsCount !== null && playoutTeamsCount > expectedTeamsCount) {
    throw new Error('Le squadre playout non possono superare i partecipanti.');
  }

  if ((playoffTeamsCount ?? 0) + (playoutTeamsCount ?? 0) > expectedTeamsCount) {
    throw new Error('Playoff e playout non possono superare il numero partecipanti.');
  }

  return {
    expected_teams_count: expectedTeamsCount,
    format: form.format,
    allow_byes: form.allowByes,
    playoff_teams_count: playoffTeamsCount,
    playout_teams_count: playoutTeamsCount
  };
}

export function AdminTournamentsRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const playersQuery = usePlayersQuery();
  const createConfiguredTournamentMutation = useCreateConfiguredTournamentMutation();
  const updateTournamentMutation = useUpdateTournamentMutation();
  const updateTournamentStatusMutation = useUpdateTournamentStatusMutation();
  const deleteTournamentMutation = useDeleteTournamentMutation();
  const didAutoSelectTournament = useRef(false);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [teamSearchInTournament, setTeamSearchInTournament] = useState('');
  const [isEditingTournament, setIsEditingTournament] = useState(false);
  const [wizardForm, setWizardForm] = useState<TournamentWizardState>(createEmptyWizardState);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [quickTeamForm, setQuickTeamForm] = useState<QuickTeamFormState>(emptyQuickTeamForm);
  const [quickPlayerOneSearch, setQuickPlayerOneSearch] = useState('');
  const [quickPlayerTwoSearch, setQuickPlayerTwoSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);
  const [finalPhaseError, setFinalPhaseError] = useState<string | null>(null);
  const [isTournamentDetailOpen, setIsTournamentDetailOpen] = useState(false);

  const tournaments = useMemo(() => tournamentsQuery.data ?? [], [tournamentsQuery.data]);
  const filteredTournaments = useMemo(() => {
    const query = tournamentSearch.trim().toLowerCase();

    if (!query) {
      return tournaments;
    }

    return tournaments.filter((tournament) =>
      [tournament.name, tournament.description ?? '', getTournamentStatusLabel(tournament.status)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [tournamentSearch, tournaments]);
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedMainSeasonId =
    selectedTournament?.seasons.find((season) => season.slug === 'main')?.id ??
    selectedTournament?.seasons[0]?.id ??
    null;
  const teamsQuery = useTeamsBySeasonQuery(selectedMainSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedMainSeasonId);
  const bracketsQuery = useTournamentBracketsQuery(selectedTournamentId);
  const createTeamMutation = useCreateTeamMutation(selectedMainSeasonId);
  const generateCalendarMutation = useGenerateCalendarMutation(selectedMainSeasonId);
  const generateKnockoutMutation = useGenerateKnockoutMutation(
    selectedTournamentId,
    selectedMainSeasonId
  );
  const generatePlayoffPlayoutMutation = useGeneratePlayoffPlayoutMutation(
    selectedTournamentId,
    selectedMainSeasonId
  );
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const filteredTournamentTeams = useMemo(() => {
    const query = teamSearchInTournament.trim().toLowerCase();

    if (!query) {
      return teams;
    }

    return teams.filter((team) => {
      const playerNames = team.members
        .map((member) => players.find((player) => player.id === member.player_id)?.display_name ?? '')
        .join(' ');

      return [team.name, playerNames].join(' ').toLowerCase().includes(query);
    });
  }, [players, teamSearchInTournament, teams]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const brackets = useMemo(() => bracketsQuery.data ?? [], [bracketsQuery.data]);
  const uniqueMatches = useMemo(() => getUniqueMatchesByFixture(matches), [matches]);
  const regularSeasonMatches = useMemo(
    () => getUniqueMatchesByFixture(matches.filter((match) => match.phase === 'regular_season')),
    [matches]
  );
  const standings = useMemo(
    () => calculateStandings(teams, regularSeasonMatches),
    [regularSeasonMatches, teams]
  );
  const isRegularSeasonCompleted =
    regularSeasonMatches.length > 0 && regularSeasonMatches.every(isMatchPlayed);
  const hasPlayoffConfigured = Boolean(selectedTournament?.playoff_teams_count);
  const hasPlayoutConfigured = Boolean(selectedTournament?.playout_teams_count);
  const hasPlayoffGenerated =
    (selectedTournament?.playoff_generated_at ?? null) !== null ||
      brackets.some((bracket) => bracket.bracket_type === 'playoff') ||
      matches.some((match) => match.phase === 'playoff');
  const hasPlayoutGenerated =
    (selectedTournament?.playout_generated_at ?? null) !== null ||
      brackets.some((bracket) => bracket.bracket_type === 'playout') ||
      matches.some((match) => match.phase === 'playout');
  const hasFinalPhaseToGenerate =
    (hasPlayoffConfigured && !hasPlayoffGenerated) ||
    (hasPlayoutConfigured && !hasPlayoutGenerated);
  const canGenerateFinalPhase =
    selectedTournament?.format === 'group_playoff_playout' &&
    isRegularSeasonCompleted &&
    (hasPlayoffConfigured || hasPlayoutConfigured) &&
    hasFinalPhaseToGenerate;
  const finalPhaseUnavailableReason = (() => {
    if (!selectedTournament) {
      return null;
    }

    if (selectedTournament.format !== 'group_playoff_playout') {
      return 'La fase finale è disponibile solo per tornei con formula Girone + playoff/playout.';
    }

    if (!hasPlayoffConfigured && !hasPlayoutConfigured) {
      return 'Configura almeno playoff o playout per generare la fase finale.';
    }

    if (regularSeasonMatches.length === 0) {
      return 'Genera il calendario del girone prima di creare playoff e playout.';
    }

    if (!isRegularSeasonCompleted) {
      return 'Completa tutte le partite del girone prima di generare playoff e playout.';
    }

    if (!hasFinalPhaseToGenerate) {
      return 'Playoff e playout sono già stati generati.';
    }

    return null;
  })();
  const playedMatchesCount = uniqueMatches.filter(isMatchPlayed).length;
  const pendingMatchesCount = Math.max(uniqueMatches.length - playedMatchesCount, 0);
  const isTeamRegistrationComplete = selectedTournament
    ? teams.length === selectedTournament.expected_teams_count
    : false;
  const canGenerateCalendarFromTournament =
    Boolean(selectedTournament) &&
    selectedTournament?.format !== 'knockout' &&
    isTeamRegistrationComplete &&
    uniqueMatches.length === 0;
  const completionPercentage =
    uniqueMatches.length > 0 ? Math.round((playedMatchesCount / uniqueMatches.length) * 100) : 0;
  const calendarGeneratedAt =
    matches.length > 0
      ? [...matches].sort((first, second) => first.created_at.localeCompare(second.created_at))[0]
          ?.created_at ?? null
      : null;
  const isFormulaLocked = Boolean(
    selectedTournament?.regular_calendar_generated_at ??
      selectedTournament?.knockout_generated_at ??
      selectedTournament?.playoff_generated_at ??
      selectedTournament?.playout_generated_at ??
      calendarGeneratedAt
  );

  const isBusy =
    createConfiguredTournamentMutation.isPending ||
    updateTournamentMutation.isPending ||
    updateTournamentStatusMutation.isPending ||
    deleteTournamentMutation.isPending ||
    createTeamMutation.isPending ||
    generateCalendarMutation.isPending ||
    generateKnockoutMutation.isPending ||
    generatePlayoffPlayoutMutation.isPending;

  useEffect(() => {
    if (!selectedTournamentId && !isCreatingTournament && !didAutoSelectTournament.current && tournaments.length > 0) {
      didAutoSelectTournament.current = true;
      setSelectedTournamentId(tournaments[0]?.id ?? null);
    }
  }, [isCreatingTournament, selectedTournamentId, tournaments]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncDetailOpenState = () => {
      setIsTournamentDetailOpen(mediaQuery.matches);
    };

    syncDetailOpenState();
    mediaQuery.addEventListener('change', syncDetailOpenState);

    return () => {
      mediaQuery.removeEventListener('change', syncDetailOpenState);
    };
  }, []);

  useEffect(() => {
    if (selectedTournament) {
      setWizardForm(tournamentToWizardState(selectedTournament));
      setWizardStep(1);
      setIsTournamentDetailOpen(window.matchMedia('(min-width: 768px)').matches);
    }
    setQuickTeamForm(emptyQuickTeamForm);
    setQuickPlayerOneSearch('');
    setQuickPlayerTwoSearch('');
    setTeamFormError(null);
    setFinalPhaseError(null);
    setDetailTab('overview');
    setIsEditingTournament(false);
    setTeamSearchInTournament('');
  }, [selectedTournament]);

  const handleCreateTournament = () => {
    didAutoSelectTournament.current = true;
    setSelectedTournamentId(null);
    setIsCreatingTournament(true);
    setIsEditingTournament(true);
    setWizardForm(createEmptyWizardState());
    setWizardStep(1);
    setQuickTeamForm(emptyQuickTeamForm);
    setQuickPlayerOneSearch('');
    setQuickPlayerTwoSearch('');
    setFormError(null);
    setTeamFormError(null);
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player?.display_name ?? 'Giocatore';
  };

  const assignedPlayerIds = useMemo(() => {
    const ids = new Set<string>();

    teams.forEach((team) => {
      team.members.forEach((member) => {
        ids.add(member.player_id);
      });
    });

    return ids;
  }, [teams]);

  const getAvailableQuickPlayers = (query: string, currentPlayerId: string, otherPlayerId: string) => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length < 2) {
      return [];
    }

    return players
      .filter((player) => {
        if (player.id === otherPlayerId) {
          return false;
        }

        if (assignedPlayerIds.has(player.id) && player.id !== currentPlayerId) {
          return false;
        }

        return [player.display_name, player.first_name, player.last_name]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 6);
  };

  const getSelectedQuickPlayer = (playerId: string): Player | null =>
    players.find((player) => player.id === playerId) ?? null;

  const getTeamName = (teamId: string | null): string => {
    if (!teamId) {
      return 'In attesa vincitore';
    }

    return teams.find((team) => team.id === teamId)?.name ?? 'Squadra';
  };

  const handleSubmitQuickTeam = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTeamFormError(null);

    if (!selectedMainSeasonId) {
      setTeamFormError('Questo torneo non è ancora pronto per gestire le squadre.');
      return;
    }

    if (
      quickTeamForm.playerOneId &&
      quickTeamForm.playerTwoId &&
      quickTeamForm.playerOneId === quickTeamForm.playerTwoId
    ) {
      setTeamFormError('Lo stesso giocatore non puo occupare entrambe le posizioni.');
      return;
    }

    if (!quickTeamForm.playerOneId || !quickTeamForm.playerTwoId) {
      setTeamFormError('Seleziona due giocatori per creare la squadra.');
      return;
    }

    try {
      const fallbackName = `${getPlayerName(quickTeamForm.playerOneId)} / ${getPlayerName(quickTeamForm.playerTwoId)}`;
      const teamName = quickTeamForm.name.trim() || fallbackName;

      await createTeamMutation.mutateAsync({
        season_id: selectedMainSeasonId,
        name: teamName,
        slug: quickTeamForm.slug || slugify(teamName),
        logo_url: null,
        player_ids: [quickTeamForm.playerOneId, quickTeamForm.playerTwoId].filter(Boolean)
      });
      setQuickTeamForm(emptyQuickTeamForm);
      setQuickPlayerOneSearch('');
      setQuickPlayerTwoSearch('');
    } catch (error) {
      setTeamFormError(getErrorMessage(error));
    }
  };

  const handleSubmitTournamentEdit = async (input: CreateConfiguredTournamentInput) => {
    if (!selectedTournament) {
      return;
    }

    setFormError(null);

    try {
      await updateTournamentMutation.mutateAsync({
        id: selectedTournament.id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        status: input.status,
        is_public: selectedTournament.is_public,
        expected_teams_count: isFormulaLocked
          ? selectedTournament.expected_teams_count
          : input.expected_teams_count,
        format: isFormulaLocked ? selectedTournament.format : input.format,
        allow_byes: isFormulaLocked ? selectedTournament.allow_byes : input.allow_byes,
        playoff_teams_count: isFormulaLocked
          ? selectedTournament.playoff_teams_count
          : input.playoff_teams_count,
        playout_teams_count: isFormulaLocked
          ? selectedTournament.playout_teams_count
          : input.playout_teams_count
      });
      setIsEditingTournament(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleStatusChange = async (status: Extract<TournamentStatus, 'active' | 'draft'>) => {
    if (!selectedTournament) {
      return;
    }

    setFormError(null);

    try {
      if (status === 'active') {
        const expectedTeamsCount = selectedTournament.expected_teams_count;

        if (teams.length < expectedTeamsCount) {
          setFormError(
            `Per attivare il torneo servono ${expectedTeamsCount.toString()} squadre. Attualmente ne sono presenti ${teams.length.toString()}.`
          );
          return;
        }

        if (teams.length > expectedTeamsCount) {
          setFormError(
            `Il torneo prevede ${expectedTeamsCount.toString()} squadre, ma ne sono presenti ${teams.length.toString()}.`
          );
          return;
        }

        if (
          selectedTournament.format === 'group_playoff_playout' &&
          !selectedTournament.playoff_teams_count &&
          !selectedTournament.playout_teams_count
        ) {
          setFormError('Configura almeno playoff o playout prima di attivare il torneo.');
          return;
        }

        if (
          selectedTournament.format === 'group_playoff_playout' &&
          ((selectedTournament.playoff_teams_count ?? 0) +
            (selectedTournament.playout_teams_count ?? 0) >
            expectedTeamsCount)
        ) {
          setFormError('Playoff e playout non possono superare il numero di squadre previste.');
          return;
        }

        if (uniqueMatches.length === 0) {
          if (selectedTournament.format === 'knockout') {
            const seedStandings: StandingRow[] = [...teams]
              .sort((first, second) => first.name.localeCompare(second.name))
              .map((team, index) => ({
                teamId: team.id,
                teamName: team.name,
                position: index + 1,
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
                headToHeadPoints: index + 1
              }));

            await generateKnockoutMutation.mutateAsync({
              standings: seedStandings,
              allowByes: selectedTournament.allow_byes
            });
          } else {
            await generateCalendarMutation.mutateAsync({ teamIds: teams.map((team) => team.id) });
          }
        }
      }

      await updateTournamentStatusMutation.mutateAsync({ id: selectedTournament.id, status });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleDeleteTournament = async () => {
    if (!selectedTournament) {
      return;
    }

    setFormError(null);

    try {
      await deleteTournamentMutation.mutateAsync(selectedTournament.id);
      handleCreateTournament();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleGenerateFinalPhase = async () => {
    setFinalPhaseError(null);

    if (!selectedTournament || !selectedMainSeasonId) {
      setFinalPhaseError('Seleziona un torneo prima di generare la fase finale.');
      return;
    }

    if (!canGenerateFinalPhase) {
      setFinalPhaseError(finalPhaseUnavailableReason ?? 'La fase finale non è generabile.');
      return;
    }

    const confirmed = window.confirm(
      'Verranno generati playoff e playout sulla base della classifica attuale. L’operazione non potrà essere ripetuta. Continuare?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await generatePlayoffPlayoutMutation.mutateAsync({ standings });
    } catch (error) {
      setFinalPhaseError(getErrorMessage(error));
    }
  };

  const handleGenerateCalendarFromTournament = async () => {
    setFormError(null);

    if (!selectedTournament || !selectedMainSeasonId) {
      setFormError('Seleziona un torneo prima di generare il calendario.');
      return;
    }

    if (!canGenerateCalendarFromTournament) {
      setFormError('Il calendario può essere generato solo con squadre complete e nessuna partita esistente.');
      return;
    }

    const confirmed = window.confirm(
      'Verrà generato il calendario del torneo senza duplicare partite. Continuare?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await generateCalendarMutation.mutateAsync({ teamIds: teams.map((team) => team.id) });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleCreateConfiguredTournament = async (
    input: Parameters<typeof createConfiguredTournamentMutation.mutateAsync>[0]
  ) => {
    setFormError(null);

    try {
      const createdTournament = await createConfiguredTournamentMutation.mutateAsync(input);
      didAutoSelectTournament.current = true;
      setSelectedTournamentId(createdTournament.id);
      setIsCreatingTournament(false);
      setIsEditingTournament(false);
      setWizardForm(createEmptyWizardState());
      setWizardStep(1);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tornei</h1>
      </header>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <button className={styles.button} onClick={handleCreateTournament} type="button">
            <FaPlus aria-hidden="true" className={styles.buttonIcon} />
            <span>Crea nuovo torneo</span>
          </button>
          <label className={cx(styles.field, styles.tournamentSearchField)}>
            <span className={styles.label}>Cerca torneo</span>
            <input
              className={styles.input}
              onChange={(event) => {
                setTournamentSearch(event.target.value);
              }}
              placeholder="Nome, stato..."
              type="search"
              value={tournamentSearch}
            />
          </label>
          <h2 className={styles.panelTitle}>Lista tornei</h2>
          {tournamentsQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {tournamentsQuery.isError ? (
            <p className={styles.error}>{getErrorMessage(tournamentsQuery.error)}</p>
          ) : null}
          {!tournamentsQuery.isLoading && tournaments.length === 0 ? (
            <p className={styles.muted}>Nessun torneo creato.</p>
          ) : null}
          <ul className={styles.list}>
            {filteredTournaments.map((tournament) => (
              <li key={tournament.id}>
                <button
                  className={cx(
                    styles.listButton,
                    tournament.id === selectedTournamentId && styles.listButtonActive
                  )}
                  onClick={() => {
                    setIsCreatingTournament(false);
                    setSelectedTournamentId(tournament.id);
                  }}
                  type="button"
                >
                  <strong>{tournament.name}</strong>
                  <br />
                  <span className={styles.muted}>
                    {getTournamentStatusLabel(tournament.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.panel}>
          {formError ? <p className={styles.error}>{formError}</p> : null}

          <h2 className={cx(styles.panelTitle, selectedTournament ? styles.desktopOnlyTitle : false)}>
            {selectedTournament ? 'Dettaglio torneo' : isCreatingTournament ? 'Crea torneo' : 'Seleziona un torneo'}
          </h2>
          {selectedTournament ? (
            <details
              className={styles.tournamentDetailDisclosure}
              onToggle={(event) => {
                setIsTournamentDetailOpen(event.currentTarget.open);
              }}
              open={isTournamentDetailOpen}
            >
              <summary className={styles.tournamentDetailSummary}>Dettaglio torneo</summary>
              <div className={styles.tournamentDetailBody}>
              <div className={styles.detailTopBar}>
                <div className={styles.detailTabs} role="tablist" aria-label="Dettaglio torneo">
                  {[
                    ['overview', 'Panoramica'],
                    ['teams', 'Squadre']
                  ].map(([tab, label]) => (
                    <button
                      aria-pressed={detailTab === tab}
                      className={cx(
                        styles.detailTab,
                        detailTab === tab && styles.detailTabActive
                      )}
                      key={tab}
                      onClick={() => {
                        setDetailTab(tab as DetailTab);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className={styles.actionBar}>
                  <button
                    aria-label={selectedTournament.status === 'active' ? 'Disattiva torneo' : 'Attiva torneo'}
                    className={cx(styles.actionButton, styles.actionButtonPrimary)}
                    disabled={isBusy}
                    onClick={() =>
                      void handleStatusChange(
                        selectedTournament.status === 'active' ? 'draft' : 'active'
                      )
                    }
                    title={selectedTournament.status === 'active' ? 'Disattiva torneo' : 'Attiva torneo'}
                    type="button"
                  >
                    {selectedTournament.status === 'active' ? (
                      <MdPauseCircle aria-hidden="true" />
                    ) : (
                      <MdPlayCircle aria-hidden="true" />
                    )}
                    <span className={styles.actionButtonPrimaryText}>
                      {selectedTournament.status === 'active' ? 'Disattiva' : 'Attiva'}
                    </span>
                  </button>
                  <button
                    aria-label="Salva torneo"
                    className={styles.actionButton}
                    disabled={isBusy || !isEditingTournament || detailTab !== 'overview'}
                    onClick={() => {
                      document.getElementById('tournament-edit-wizard-submit')?.click();
                    }}
                    title="Salva torneo"
                    type="button"
                  >
                    <FaFloppyDisk aria-hidden="true" />
                    <span className={styles.actionButtonText}>Salva</span>
                  </button>
                  <button
                    aria-label="Modifica torneo"
                    className={styles.actionButton}
                    disabled={isBusy}
                    onClick={() => {
                      setDetailTab('overview');
                      if (!isEditingTournament) {
                        setWizardForm(tournamentToWizardState(selectedTournament));
                        setWizardStep(1);
                      }
                      setIsEditingTournament((current) => !current);
                    }}
                    title="Modifica torneo"
                    type="button"
                  >
                    <FaPenToSquare aria-hidden="true" />
                    <span className={styles.actionButtonText}>
                      {isEditingTournament ? 'Fine' : 'Modifica'}
                    </span>
                  </button>
                  <button
                    aria-label="Elimina torneo"
                    className={cx(styles.actionButton, styles.actionButtonDanger)}
                    disabled={isBusy}
                    onClick={() => {
                      const confirmed = window.confirm(
                        'Vuoi eliminare questo torneo? L’operazione non può essere annullata.'
                      );

                      if (confirmed) {
                        void handleDeleteTournament();
                      }
                    }}
                    title="Elimina torneo"
                    type="button"
                  >
                    <FaTrashCan aria-hidden="true" />
                    <span className={styles.actionButtonText}>Elimina</span>
                  </button>
                </div>
              </div>
              </div>
            </details>
          ) : null}
          {!selectedTournament && isCreatingTournament ? (
            <TournamentCreationWizard
              form={wizardForm}
              isBusy={isBusy}
              onChange={setWizardForm}
              onSubmit={(input) => void handleCreateConfiguredTournament(input)}
              players={players}
              setStep={setWizardStep}
              step={wizardStep}
            />
          ) : !selectedTournament ? (
            <div className={styles.emptyState}>
              <h3>Seleziona un torneo</h3>
              <p className={styles.muted}>
                Scegli un torneo dalla lista a sinistra oppure crea una nuova competizione.
              </p>
            </div>
          ) : null}

          {selectedTournament && isTournamentDetailOpen ? (
            <div className={styles.detailBlock}>
              {isEditingTournament && detailTab === 'overview' ? (
                <TournamentCreationWizard
                  form={wizardForm}
                  isBusy={isBusy}
                  locked={isFormulaLocked}
                  mode="edit"
                  onChange={setWizardForm}
                  onSubmit={(input) => void handleSubmitTournamentEdit(input)}
                  players={players}
                  setStep={setWizardStep}
                  step={wizardStep}
                  submitButtonId="tournament-edit-wizard-submit"
                />
              ) : null}

              {detailTab === 'overview' && !isEditingTournament ? (
                <>
              <section className={styles.configCard}>
                <div className={styles.detailHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>{selectedTournament.name}</h2>
                    <p className={styles.muted}>
                      {selectedTournament.description ?? 'Nessuna descrizione inserita.'}
                    </p>
                  </div>
                  <span
                    className={cx(
                      styles.phaseBadge,
                      isTeamRegistrationComplete ? styles.phaseCompleted : styles.phaseSetup
                    )}
                  >
                    {isTeamRegistrationComplete ? 'Pronto' : 'Incompleto'}
                  </span>
                </div>
                <dl className={styles.configGrid}>
                  <div>
                    <dt>Stato</dt>
                    <dd>{getTournamentStatusLabel(selectedTournament.status)}</dd>
                  </div>
                  <div>
                    <dt>Formula</dt>
                    <dd>{tournamentFormatLabels[selectedTournament.format]}</dd>
                  </div>
                  <div>
                    <dt>Fase corrente</dt>
                    <dd>{competitionPhaseLabels[selectedTournament.current_phase]}</dd>
                  </div>
                  <div>
                    <dt>Partecipanti</dt>
                    <dd>
                      {teams.length} / {selectedTournament.expected_teams_count}
                    </dd>
                  </div>
                  <div>
                    <dt>Partite</dt>
                    <dd>
                      {playedMatchesCount} / {uniqueMatches.length}
                    </dd>
                  </div>
                  <div>
                    <dt>Calendario</dt>
                    <dd>{calendarGeneratedAt ? 'Generato' : 'Non generato'}</dd>
                  </div>
                </dl>
              </section>

              <section className={styles.finalPhaseCard}>
                <div className={styles.detailHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Competizione</h2>
                    <p className={styles.muted}>
                      Stato calendario, tabelloni e azioni di generazione.
                    </p>
                  </div>
                  <span
                    className={cx(
                      styles.phaseBadge,
                      isRegularSeasonCompleted
                        ? styles.phaseCompleted
                        : styles.phaseRegularSeason
                    )}
                  >
                    {isRegularSeasonCompleted ? 'Girone completato' : 'Girone non completato'}
                  </span>
                </div>

                <div className={styles.finalPhaseSummary}>
                  <div>
                    <span>Calendario</span>
                    <strong>{calendarGeneratedAt ? formatMatchDate(calendarGeneratedAt) : 'Non generato'}</strong>
                  </div>
                  <div>
                    <span>Knockout</span>
                    <strong>{selectedTournament.knockout_generated_at ? 'Generato' : '-'}</strong>
                  </div>
                  <div>
                    <span>Playoff</span>
                    <strong>
                      {hasPlayoffConfigured
                        ? hasPlayoffGenerated
                          ? 'Generati'
                          : `${String(selectedTournament.playoff_teams_count ?? 0)} squadre`
                        : 'Non configurati'}
                    </strong>
                  </div>
                  <div>
                    <span>Playout</span>
                    <strong>
                      {hasPlayoutConfigured
                        ? hasPlayoutGenerated
                          ? 'Generati'
                          : `${String(selectedTournament.playout_teams_count ?? 0)} squadre`
                        : 'Non configurati'}
                    </strong>
                  </div>
                  <div>
                    <span>Partite girone</span>
                    <strong>
                      {regularSeasonMatches.filter(isMatchPlayed).length} /{' '}
                      {regularSeasonMatches.length}
                    </strong>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    className={styles.button}
                    disabled={isBusy || !canGenerateCalendarFromTournament}
                    onClick={() => void handleGenerateCalendarFromTournament()}
                    type="button"
                  >
                    <FaPlus aria-hidden="true" className={styles.buttonIcon} />
                    <span>Genera calendario</span>
                  </button>
                  {calendarGeneratedAt ? (
                    <span className={styles.badge}>Calendario generato</span>
                  ) : null}
                </div>

                {finalPhaseUnavailableReason ? (
                  <p className={styles.warningMessage}>{finalPhaseUnavailableReason}</p>
                ) : null}
                {finalPhaseError ? <p className={styles.error}>{finalPhaseError}</p> : null}
                {bracketsQuery.isError ? (
                  <p className={styles.error}>{getErrorMessage(bracketsQuery.error)}</p>
                ) : null}

                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || !canGenerateFinalPhase}
                    onClick={() => void handleGenerateFinalPhase()}
                    type="button"
                  >
                    <FaSitemap aria-hidden="true" className={styles.buttonIcon} />
                    <span>Genera Playoff/Playout</span>
                  </button>
                </div>

                {brackets.filter((bracket) => bracket.bracket_type !== 'knockout').length > 0 ? (
                  <div className={styles.bracketList}>
                    {brackets
                      .filter((bracket) => bracket.bracket_type !== 'knockout')
                      .map((bracket) => {
                        const sourceMap = createBracketSourceMap(bracket.bracketMatches);
                        const roundLabels = Array.from(
                          new Set(
                            bracket.bracketMatches.map(
                              (bracketMatch) => bracketMatch.round_label
                            )
                          )
                        );

                        return (
                          <section className={styles.bracketSection} key={bracket.id}>
                            <div className={styles.bracketHeader}>
                              <h3>{getBracketTypeLabel(bracket.bracket_type)}</h3>
                              <span>{bracket.status === 'generated' ? 'Generato' : 'Bozza'}</span>
                            </div>

                            {roundLabels.map((roundLabel) => (
                              <div className={styles.bracketRound} key={roundLabel}>
                                <h4>{roundLabel}</h4>
                                <div className={styles.bracketMatches}>
                                  {bracket.bracketMatches
                                    .filter(
                                      (bracketMatch) =>
                                        bracketMatch.round_label === roundLabel
                                    )
                                    .map((bracketMatch) => {
                                      const linkedMatch =
                                        matches.find(
                                          (match) => match.id === bracketMatch.match_id
                                        ) ?? null;
                                      const matchCode = getBracketMatchCode(
                                        bracketMatch.round_label,
                                        bracketMatch.position
                                      );
                                      const homeLabel = getBracketSlotLabel({
                                        bracketMatch,
                                        getTeamLabel: getTeamName,
                                        slot: 'home',
                                        sourceMap
                                      });
                                      const awayLabel = getBracketSlotLabel({
                                        bracketMatch,
                                        getTeamLabel: getTeamName,
                                        slot: 'away',
                                        sourceMap
                                      });
                                      const bracketMatchClassName = [
                                        styles.bracketMatch,
                                        bracketMatch.is_bye ? styles.bracketMatchBye : null
                                      ]
                                        .filter(Boolean)
                                        .join(' ');
                                      const bracketBadgeClassName = [
                                        styles.bracketBadge,
                                        bracketMatch.is_bye
                                          ? styles.bracketBadgeBye
                                          : linkedMatch
                                            ? styles.bracketBadgeReady
                                            : styles.bracketBadgePending
                                      ]
                                        .filter(Boolean)
                                        .join(' ');

                                      return (
                                        <article
                                          className={bracketMatchClassName}
                                          key={bracketMatch.id}
                                        >
                                          <div>
                                            <span className={styles.bracketMatchMeta}>
                                              <strong className={styles.bracketMatchCode}>
                                                {matchCode}
                                              </strong>
                                              <span className={bracketBadgeClassName}>
                                                {bracketMatch.is_bye
                                                  ? 'Bye'
                                                  : linkedMatch
                                                    ? getMatchStatusLabel(linkedMatch.status)
                                                    : 'Da disputare'}
                                              </span>
                                            </span>
                                            <strong>
                                              {homeLabel} vs {awayLabel}
                                            </strong>
                                            {!linkedMatch && !bracketMatch.is_bye ? (
                                              <span>In attesa che si completi il turno precedente</span>
                                            ) : null}
                                            {bracketMatch.is_bye ? (
                                              <span>Squadra qualificata al turno successivo</span>
                                            ) : null}
                                          </div>
                                          {bracketMatch.match_id ? (
                                            <Link
                                              className={styles.inlineLink}
                                              to={`/admin/matches/${bracketMatch.match_id}/edit`}
                                            >
                                              Modifica risultato
                                            </Link>
                                          ) : null}
                                        </article>
                                      );
                                    })}
                                </div>
                              </div>
                            ))}
                          </section>
                        );
                      })}
                  </div>
                ) : null}
              </section>

              <div
                className={styles.dashboardGrid}
              >
                <div className={styles.statCard}>
                  <span>Squadre</span>
                  <strong>{teams.length}</strong>
                </div>
                <div className={styles.statCard}>
                  <span>Partite</span>
                  <strong>{uniqueMatches.length}</strong>
                </div>
                <div className={styles.statCard}>
                  <span>Giocate</span>
                  <strong>{playedMatchesCount}</strong>
                </div>
                <div className={styles.statCard}>
                  <span>Da giocare</span>
                  <strong>{pendingMatchesCount}</strong>
                </div>
              </div>

              <div
                className={styles.progressBlock}
              >
                <div className={styles.progressHeader}>
                  <strong>
                    {playedMatchesCount} / {uniqueMatches.length} partite completate
                  </strong>
                  <span>{completionPercentage}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${completionPercentage.toString()}%` }}
                  />
                </div>
                {calendarGeneratedAt ? (
                  <p className={styles.muted}>Calendario generato il {formatMatchDate(calendarGeneratedAt)}</p>
                ) : (
                  <p className={styles.muted}>Calendario non ancora generato.</p>
                )}
                {matchesQuery.isError ? (
                  <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p>
                ) : null}
              </div>

                </>
              ) : null}

              {detailTab === 'teams' ? (
                <>
              <div className={styles.detailHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Squadre del torneo</h2>
                  <p className={styles.muted}>
                    Gestisci le squadre collegate a questo torneo.
                  </p>
                </div>
                <span className={styles.badge}>
                  {teams.length} / {selectedTournament.expected_teams_count} squadre registrate
                </span>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>Cerca squadra</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setTeamSearchInTournament(event.target.value);
                  }}
                  placeholder="Cerca squadra o giocatore..."
                  type="search"
                  value={teamSearchInTournament}
                />
              </label>

              {teamsQuery.isLoading ? <p className={styles.muted}>Caricamento squadre...</p> : null}
              {teamsQuery.isError ? (
                <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p>
              ) : null}
              {!teamsQuery.isLoading && teams.length === 0 ? (
                <p className={styles.muted}>Nessuna squadra collegata a questo torneo.</p>
              ) : null}

              <ul className={styles.teamList}>
                {filteredTournamentTeams.map((team) => (
                  <li className={styles.teamItem} key={team.id}>
                    <strong>{team.name}</strong>
                    <span>
                      {team.members.length > 0
                        ? team.members.map((member) => getPlayerName(member.player_id)).join(' / ')
                        : 'Nessun giocatore'}
                    </span>
                  </li>
                ))}
              </ul>

              {isEditingTournament ? (
              <form className={styles.form} onSubmit={(event) => void handleSubmitQuickTeam(event)}>
                <h3 className={styles.sectionTitle}>Aggiungi squadra</h3>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Nome squadra</span>
                    <input
                      className={styles.input}
                      onBlur={() => {
                        if (!quickTeamForm.slug) {
                          setQuickTeamForm((current) => ({
                            ...current,
                            slug: slugify(current.name)
                          }));
                        }
                      }}
                      onChange={(event) => {
                        setQuickTeamForm((current) => ({
                          ...current,
                          name: event.target.value
                        }));
                      }}
                      value={quickTeamForm.name}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Slug</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        setQuickTeamForm((current) => ({
                          ...current,
                          slug: slugify(event.target.value)
                        }));
                      }}
                      placeholder="Generato automaticamente se vuoto"
                      value={quickTeamForm.slug}
                    />
                  </label>
                </div>

                <div className={styles.grid}>
                  <QuickPlayerPicker
                    label="Giocatore 1"
                    onRemove={() => {
                      setQuickTeamForm((current) => ({ ...current, playerOneId: '' }));
                    }}
                    onSearchChange={setQuickPlayerOneSearch}
                    onSelect={(playerId) => {
                      setQuickTeamForm((current) => ({ ...current, playerOneId: playerId }));
                      setQuickPlayerOneSearch('');
                    }}
                    options={getAvailableQuickPlayers(
                      quickPlayerOneSearch,
                      quickTeamForm.playerOneId,
                      quickTeamForm.playerTwoId
                    )}
                    search={quickPlayerOneSearch}
                    selectedPlayer={getSelectedQuickPlayer(quickTeamForm.playerOneId)}
                  />
                  <QuickPlayerPicker
                    label="Giocatore 2"
                    onRemove={() => {
                      setQuickTeamForm((current) => ({ ...current, playerTwoId: '' }));
                    }}
                    onSearchChange={setQuickPlayerTwoSearch}
                    onSelect={(playerId) => {
                      setQuickTeamForm((current) => ({ ...current, playerTwoId: playerId }));
                      setQuickPlayerTwoSearch('');
                    }}
                    options={getAvailableQuickPlayers(
                      quickPlayerTwoSearch,
                      quickTeamForm.playerTwoId,
                      quickTeamForm.playerOneId
                    )}
                    search={quickPlayerTwoSearch}
                    selectedPlayer={getSelectedQuickPlayer(quickTeamForm.playerTwoId)}
                  />
                </div>

                {teamFormError ? <p className={styles.error}>{teamFormError}</p> : null}

                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || !selectedMainSeasonId}
                    type="submit"
                  >
                    <FaPlus aria-hidden="true" className={styles.buttonIcon} />
                    <span>Aggiungi squadra</span>
                  </button>
                </div>
              </form>
              ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function TournamentCreationWizard({
  form,
  isBusy,
  locked = false,
  mode = 'create',
  onChange,
  onSubmit,
  players,
  setStep,
  step,
  submitButtonId
}: {
  form: TournamentWizardState;
  isBusy: boolean;
  locked?: boolean;
  mode?: 'create' | 'edit';
  onChange: (form: TournamentWizardState | ((current: TournamentWizardState) => TournamentWizardState)) => void;
  onSubmit: (input: CreateConfiguredTournamentInput) => void;
  players: Player[];
  setStep: (step: WizardStep) => void;
  step: WizardStep;
  submitButtonId?: string;
}) {
  const [wizardError, setWizardError] = useState<string | null>(null);
  const isEditMode = mode === 'edit';
  const selectedPlayerIds = form.teams.flatMap((team) =>
    [team.playerOneId, team.playerTwoId].filter(Boolean)
  );
  const expectedTeamsCount = Number(form.expectedTeamsCount) || 0;
  const allStepItems: { id: WizardStep; label: string }[] = [
    { id: 1, label: 'Dati' },
    { id: 2, label: 'Formula' },
    { id: 3, label: 'Config' },
    { id: 4, label: 'Squadre' },
    { id: 5, label: 'Attivazione' },
    { id: 6, label: 'Riepilogo' }
  ];
  const stepOrder: WizardStep[] = isEditMode ? [1, 2, 3, 6] : [1, 2, 3, 4, 5, 6];
  const stepItems = allStepItems.filter((item) => stepOrder.includes(item.id));

  const updateForm = (updater: (current: TournamentWizardState) => TournamentWizardState) => {
    onChange(updater);
  };

  const resizeTeams = (count: number) => {
    updateForm((current) => {
      const nextTeams = [...current.teams];

      while (nextTeams.length < count) {
        nextTeams.push({ name: '', playerOneId: '', playerTwoId: '', ranking: '' });
      }

      return {
        ...current,
        teams: nextTeams.slice(0, count)
      };
    });
  };

  const getAvailablePlayers = (teamIndex: number, slot: 'one' | 'two') => {
    const currentTeam = form.teams[teamIndex];
    const currentPlayerId = slot === 'one' ? currentTeam?.playerOneId : currentTeam?.playerTwoId;
    const otherCurrentPlayerId = slot === 'one' ? currentTeam?.playerTwoId : currentTeam?.playerOneId;

    return players.filter((player) => {
      if (player.id === currentPlayerId) {
        return true;
      }

      if (player.id === otherCurrentPlayerId) {
        return false;
      }

      return !selectedPlayerIds.includes(player.id);
    });
  };

  const getPlayerNameById = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player ? getPlayerLabel(player) : 'Giocatore';
  };

  const validateCurrentStep = (): CreateConfiguredTournamentInput | null => {
    const getCompletedWizardTeams = () =>
      form.teams.filter(
        (team) =>
          team.name.trim() ||
          team.playerOneId ||
          team.playerTwoId ||
          team.ranking.trim()
      );

    if (step === 1) {
      const expectedCount = parseRequiredPositiveInteger(
        form.expectedTeamsCount,
        'Il numero partecipanti'
      );

      if (!form.name.trim()) {
        throw new Error('Inserisci il nome del torneo.');
      }

      if (expectedCount < 2) {
        throw new Error('Il torneo deve avere almeno 2 partecipanti.');
      }
    }

    if (step === 2) {
      const expectedCount = parseRequiredPositiveInteger(
        form.expectedTeamsCount,
        'Il numero partecipanti'
      );

      if (expectedCount < 2) {
        throw new Error('Il torneo deve avere almeno 2 partecipanti.');
      }
    }

    if (step === 3) {
      normalizeCompetitionSettings(form);
    }

    if (!isEditMode && (step === 4 || step === 6)) {
      const settings = normalizeCompetitionSettings(form);
      const completedTeams = getCompletedWizardTeams();

      const usedPlayers = new Set<string>();
      const usedRankings = new Set<number>();

      completedTeams.forEach((team, index) => {
        if (!team.playerOneId || !team.playerTwoId) {
          throw new Error(`Completa i 2 giocatori della squadra ${String(index + 1)}.`);
        }

        if (team.playerOneId === team.playerTwoId) {
          throw new Error(`La squadra ${String(index + 1)} usa due volte lo stesso giocatore.`);
        }

        [team.playerOneId, team.playerTwoId].forEach((playerId) => {
          if (usedPlayers.has(playerId)) {
            throw new Error('Un giocatore può appartenere a una sola squadra nel torneo.');
          }

          usedPlayers.add(playerId);
        });

        if (settings.format === 'knockout') {
          const ranking = Number(team.ranking);

          if (!Number.isInteger(ranking) || ranking < 1 || ranking > settings.expected_teams_count) {
            throw new Error(`Inserisci un ranking valido per la squadra ${String(index + 1)}.`);
          }

          if (usedRankings.has(ranking)) {
            throw new Error('Il ranking deve essere univoco per torneo.');
          }

          usedRankings.add(ranking);
        }
      });
    }

    if (step < 6) {
      return null;
    }

    const settings = normalizeCompetitionSettings(form);
    const normalizedTeams = isEditMode
      ? []
      : getCompletedWizardTeams().map((team, index) => {
          const fallbackName = `${getPlayerNameById(team.playerOneId)} / ${getPlayerNameById(team.playerTwoId)}`;
          const name = team.name.trim() || fallbackName;

          return {
            name,
            slug: slugify(name) || `squadra-${String(index + 1)}`,
            player_ids: [team.playerOneId, team.playerTwoId] as [string, string],
            ranking: settings.format === 'knockout' ? Number(team.ranking) : null
          };
        });

    return {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim() || null,
      is_public: false,
      status: isEditMode ? form.status : 'draft',
      split_regular_season_rounds: form.splitRegularSeasonRounds,
      teams: normalizedTeams,
      ...settings
    };
  };

  const goNext = () => {
    setWizardError(null);

    try {
      validateCurrentStep();
      const currentIndex = stepOrder.indexOf(step);
      const nextStep = stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)] ?? step;
      setStep(nextStep);
    } catch (error) {
      setWizardError(getErrorMessage(error));
    }
  };

  const goBack = () => {
    setWizardError(null);
    const currentIndex = stepOrder.indexOf(step);
    const previousStep = stepOrder[Math.max(currentIndex - 1, 0)] ?? step;
    setStep(previousStep);
  };

  const handleSubmit = () => {
    setWizardError(null);

    try {
      validateCurrentStep();
      const input = validateCurrentStep();

      if (input) {
        onSubmit(input);
      }
    } catch (error) {
      setWizardError(getErrorMessage(error));
    }
  };

  return (
    <div className={styles.wizard}>
      {submitButtonId ? (
        <button hidden id={submitButtonId} onClick={handleSubmit} type="button" />
      ) : null}

      <ol
        className={styles.wizardSteps}
        aria-label={isEditMode ? 'Step modifica torneo' : 'Step creazione torneo'}
      >
        {stepItems.map((item) => (
          <li
            className={cx(
              styles.wizardStep,
              item.id === step && styles.wizardStepActive,
              item.id < step && styles.wizardStepDone
            )}
            key={item.id}
          >
            <span>{item.id}</span>
            <strong>{item.label}</strong>
          </li>
        ))}
      </ol>

      {wizardError ? <p className={styles.error}>{wizardError}</p> : null}
      {isEditMode && locked ? (
        <p className={styles.warningMessage}>
          Questi dati non possono essere modificati dopo la generazione del calendario o del tabellone.
        </p>
      ) : null}

      <div className={styles.wizardCard}>
        {step === 1 ? (
          <div className={styles.form}>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome torneo</span>
                <input
                  className={styles.input}
                  onBlur={() => {
                    if (!form.slug) {
                      updateForm((current) => ({ ...current, slug: slugify(current.name) }));
                    }
                  }}
                  onChange={(event) => {
                    updateForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  value={form.name}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Numero partecipanti</span>
                <input
                  className={styles.input}
                  disabled={isEditMode && locked}
                  min={2}
                  onChange={(event) => {
                    const count = Math.max(Number(event.target.value) || 0, 0);
                    updateForm((current) => ({
                      ...current,
                      expectedTeamsCount: event.target.value
                    }));

                    if (count >= 0) {
                      resizeTeams(count);
                    }
                  }}
                  type="number"
                  value={form.expectedTeamsCount}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Descrizione</span>
              <textarea
                className={styles.textarea}
                onChange={(event) => {
                  updateForm((current) => ({ ...current, description: event.target.value }));
                }}
                value={form.description}
              />
            </label>

            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Stato</span>
                <select
                  className={styles.select}
                  disabled={!isEditMode}
                  onChange={(event) => {
                    updateForm((current) => ({
                      ...current,
                      status: event.target.value as TournamentStatus
                    }));
                  }}
                  value={isEditMode ? form.status : 'draft'}
                >
                  <option value="draft">Bozza</option>
                  {isEditMode ? <option value="active">Attivo</option> : null}
                  {isEditMode ? <option value="archived">Archiviato</option> : null}
                </select>
              </label>

            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.radioCards}>
            {tournamentFormatOptions.map((format) => (
              <label
                className={cx(
                  styles.radioCard,
                  form.format === format && styles.radioCardActive,
                  locked && styles.radioCardDisabled
                )}
                key={format}
              >
                <input
                  checked={form.format === format}
                  disabled={locked}
                  name="wizard-format"
                  onChange={() => {
                    updateForm((current) => ({
                      ...current,
                      format,
                      allowByes: format === 'round_robin' ? false : current.allowByes,
                      playoffTeamsCount: format === 'group_playoff_playout' ? current.playoffTeamsCount : '',
                      playoutTeamsCount: format === 'group_playoff_playout' ? current.playoutTeamsCount : ''
                    }));
                  }}
                  type="radio"
                />
                <span>
                  <strong>
                    {format === 'group_playoff_playout'
                      ? 'Girone + eliminazione diretta'
                      : tournamentFormatLabels[format]}
                  </strong>
                  <small>{tournamentFormatDescriptions[format]}</small>
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className={styles.form}>
            {form.format === 'round_robin' || form.format === 'group_playoff_playout' ? (
              <label className={styles.checkboxRow}>
                <input
                  checked={form.splitRegularSeasonRounds}
                  disabled={isEditMode && locked}
                  onChange={(event) => {
                    updateForm((current) => ({
                      ...current,
                      splitRegularSeasonRounds: event.target.checked
                    }));
                  }}
                  type="checkbox"
                />
                Suddividi il girone per giornate
              </label>
            ) : null}

            {form.format !== 'round_robin' ? (
              <label className={styles.checkboxRow}>
                <input
                  checked={form.allowByes}
                  disabled={isEditMode && locked}
                  onChange={(event) => {
                    updateForm((current) => ({ ...current, allowByes: event.target.checked }));
                  }}
                  type="checkbox"
                />
                Consenti bye automatici
              </label>
            ) : null}

            {form.format === 'group_playoff_playout' ? (
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Squadre playoff</span>
                  <input
                    className={styles.input}
                    disabled={isEditMode && locked}
                    min={2}
                    onChange={(event) => {
                      updateForm((current) => ({
                        ...current,
                        playoffTeamsCount: event.target.value
                      }));
                    }}
                    type="number"
                    value={form.playoffTeamsCount}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Squadre playout</span>
                  <input
                    className={styles.input}
                    disabled={isEditMode && locked}
                    min={2}
                    onChange={(event) => {
                      updateForm((current) => ({
                        ...current,
                        playoutTeamsCount: event.target.value
                      }));
                    }}
                    type="number"
                    value={form.playoutTeamsCount}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className={styles.wizardTeams}>
            {form.teams.map((team, teamIndex) => (
              <section className={styles.wizardTeamCard} key={teamIndex}>
                <h3>Squadra {teamIndex + 1}</h3>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Nome squadra opzionale</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        updateForm((current) => ({
                          ...current,
                          teams: current.teams.map((item, index) =>
                            index === teamIndex ? { ...item, name: event.target.value } : item
                          )
                        }));
                      }}
                      placeholder="Vuoto = nomi giocatori"
                      value={team.name}
                    />
                  </label>

                  {form.format === 'knockout' ? (
                    <label className={styles.field}>
                      <span className={styles.label}>Ranking</span>
                      <input
                        className={styles.input}
                        min={1}
                        onChange={(event) => {
                          updateForm((current) => ({
                            ...current,
                            teams: current.teams.map((item, index) =>
                              index === teamIndex ? { ...item, ranking: event.target.value } : item
                            )
                          }));
                        }}
                        type="number"
                        value={team.ranking}
                      />
                    </label>
                  ) : null}
                </div>

                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Giocatore 1</span>
                    <select
                      className={styles.select}
                      onChange={(event) => {
                        updateForm((current) => ({
                          ...current,
                          teams: current.teams.map((item, index) =>
                            index === teamIndex
                              ? { ...item, playerOneId: event.target.value }
                              : item
                          )
                        }));
                      }}
                      value={team.playerOneId}
                    >
                      <option value="">Seleziona giocatore</option>
                      {getAvailablePlayers(teamIndex, 'one').map((player) => (
                        <option key={player.id} value={player.id}>
                          {getPlayerLabel(player)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Giocatore 2</span>
                    <select
                      className={styles.select}
                      onChange={(event) => {
                        updateForm((current) => ({
                          ...current,
                          teams: current.teams.map((item, index) =>
                            index === teamIndex
                              ? { ...item, playerTwoId: event.target.value }
                              : item
                          )
                        }));
                      }}
                      value={team.playerTwoId}
                    >
                      <option value="">Seleziona giocatore</option>
                      {getAvailablePlayers(teamIndex, 'two').map((player) => (
                        <option key={player.id} value={player.id}>
                          {getPlayerLabel(player)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className={styles.wizardSummary}>
            <h3>Attivazione e generazione</h3>
            <p>
              Il torneo verrà salvato in bozza anche senza squadre. Calendario e tabellone saranno
              generati solo quando il torneo verrà attivato e saranno presenti tutte le squadre
              previste.
            </p>
            {form.format === 'round_robin' ? (
              <p>All’attivazione verrà generato il calendario del girone all’italiana.</p>
            ) : null}
            {form.format === 'knockout' ? (
              <p>All’attivazione verrà generato il tabellone a eliminazione diretta.</p>
            ) : null}
            {form.format === 'group_playoff_playout' ? (
              <p>
                All’attivazione verrà generato il girone. Playoff e playout saranno generabili dopo
                il completamento del girone.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 6 ? (
          <div className={styles.wizardSummary}>
            <h3>Riepilogo</h3>
            <dl className={styles.configGrid}>
              <div>
                <dt>Torneo</dt>
                <dd>{form.name || '-'}</dd>
              </div>
              <div>
                <dt>Formula</dt>
                <dd>
                  {form.format === 'group_playoff_playout'
                    ? 'Girone + eliminazione diretta'
                    : tournamentFormatLabels[form.format]}
                </dd>
              </div>
              <div>
                <dt>Squadre</dt>
                <dd>
                  {isEditMode
                    ? `${expectedTeamsCount.toString()} partecipanti previsti`
                    : `${form.teams.filter((team) => team.playerOneId && team.playerTwoId).length.toString()} / ${expectedTeamsCount.toString()} inserite`}
                </dd>
              </div>
              <div>
                <dt>Stato</dt>
                <dd>{isEditMode ? getTournamentStatusLabel(form.status) : 'Bozza'}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      <div className={styles.wizardActions}>
        <button
          className={styles.buttonSecondary}
          disabled={isBusy || step === 1}
          onClick={goBack}
          type="button"
        >
          Indietro
        </button>
        {step < 6 ? (
          <button className={styles.button} disabled={isBusy} onClick={goNext} type="button">
            Avanti
          </button>
        ) : (
          <button className={styles.button} disabled={isBusy} onClick={handleSubmit} type="button">
            <FaFloppyDisk aria-hidden="true" className={styles.buttonIcon} />
            <span>{isEditMode ? 'Salva' : 'Salva torneo'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
