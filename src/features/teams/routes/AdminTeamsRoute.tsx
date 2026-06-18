import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FaFloppyDisk, FaPlus, FaTrashCan, FaUpload, FaUser, FaXmark } from 'react-icons/fa6';

import { usePlayersQuery } from '@/features/players/api/playersQueries';
import type { Player } from '@/features/players/api/playersApi';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';
import type { TeamWithMembers } from '@/features/teams/api/teamsApi';
import {
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useTeamsBySeasonQuery,
  useUpdateTeamMutation,
  useUploadTeamLogoMutation
} from '@/features/teams/api/teamsQueries';

import styles from '@/features/teams/routes/AdminTeamsRoute.module.scss';

type TeamFormState = {
  name: string;
  slug: string;
  logoUrl: string;
  playerOneId: string;
  playerTwoId: string;
  ranking: string;
};

const emptyTeamForm: TeamFormState = {
  name: '',
  slug: '',
  logoUrl: '',
  playerOneId: '',
  playerTwoId: '',
  ranking: ''
};

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

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getPlayerLabel(player: Player): string {
  return player.display_name || `${player.first_name} ${player.last_name}`.trim();
}

function getTeamFallbackName(players: Player[]): string {
  return players.map(getPlayerLabel).join(' / ');
}

function shuffleItems<TItem>(items: TItem[]): TItem[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function teamToForm(team: TeamWithMembers | null): TeamFormState {
  if (!team) {
    return emptyTeamForm;
  }

  const sortedMembers = [...team.members].sort((first, second) => first.position - second.position);

  return {
    name: team.name,
    slug: team.slug,
    logoUrl: team.logo_url ?? '',
    playerOneId: sortedMembers[0]?.player_id ?? '',
    playerTwoId: sortedMembers[1]?.player_id ?? '',
    ranking: team.ranking?.toString() ?? ''
  };
}

function getRankingValidationError(
  rankingValue: string,
  expectedTeamsCount: number,
  usedRankings: Set<number>
): string | null {
  const ranking = Number(rankingValue);

  if (!Number.isInteger(ranking) || ranking < 1 || ranking > expectedTeamsCount) {
    return `Il ranking deve essere compreso tra 1 e ${expectedTeamsCount.toString()}.`;
  }

  if (usedRankings.has(ranking)) {
    return "Ranking già assegnato a un'altra squadra.";
  }

  return null;
}

function PlayerAvatar({ player }: { player: Player }) {
  if (player.photo_url) {
    return <img alt="" className={styles.playerAvatar} src={player.photo_url} />;
  }

  return (
    <span className={styles.playerAvatarFallback} aria-hidden="true">
      <FaUser />
    </span>
  );
}

export function AdminTeamsRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const playersQuery = usePlayersQuery();

  const tournamentOptions = useMemo(
    () =>
      (tournamentsQuery.data ?? [])
        .filter((tournament) => tournament.status !== 'archived')
        .map((tournament) => ({
          id: tournament.id,
          expectedTeamsCount: tournament.expected_teams_count,
          format: tournament.format,
          useRanking: tournament.use_ranking,
          name: tournament.name,
          mainSeasonId:
            tournament.seasons.find((season) => season.slug === 'main')?.id ??
            tournament.seasons[0]?.id ??
            null
        }))
        .filter((tournament) => tournament.mainSeasonId !== null),
    [tournamentsQuery.data]
  );
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamFormState>(emptyTeamForm);
  const [playerSearch, setPlayerSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamListPage, setTeamListPage] = useState(1);
  const [selectedBulkTeamIds, setSelectedBulkTeamIds] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isTeamListOpen, setIsTeamListOpen] = useState(false);

  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const createTeamMutation = useCreateTeamMutation(selectedSeasonId);
  const updateTeamMutation = useUpdateTeamMutation(selectedSeasonId);
  const deleteTeamMutation = useDeleteTeamMutation(selectedSeasonId);
  const uploadLogoMutation = useUploadTeamLogoMutation();
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();

    if (!query) {
      return teams;
    }

    return teams.filter((team) => {
      const playerNames = team.members
        .map((member) => {
          const player = players.find((item) => item.id === member.player_id);
          return player ? getPlayerLabel(player) : '';
        })
        .join(' ');
      return [team.name, playerNames].join(' ').toLowerCase().includes(query);
    });
  }, [teamSearch, teams, players]);
  const teamsPerPage = 8;
  const teamPageCount = Math.max(1, Math.ceil(filteredTeams.length / teamsPerPage));
  const visibleTeams = useMemo(
    () =>
      filteredTeams.slice(
        (teamListPage - 1) * teamsPerPage,
        teamListPage * teamsPerPage
      ),
    [filteredTeams, teamListPage]
  );
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const isCreatingTeam = selectedTeam === null;
  const isTournamentTeamLimitReached =
    selectedTournament !== null && teams.length >= selectedTournament.expectedTeamsCount;
  const isTeamLimitReached =
    isTournamentTeamLimitReached && isCreatingTeam;
  const usedRankings = useMemo(() => {
    const rankings = new Set<number>();

    teams.forEach((team) => {
      if (team.id === selectedTeam?.id || team.ranking === null) {
        return;
      }

      rankings.add(team.ranking);
    });

    return rankings;
  }, [selectedTeam?.id, teams]);
  const rankingError =
    selectedTournament?.useRanking === true
      ? getRankingValidationError(form.ranking, selectedTournament.expectedTeamsCount, usedRankings)
      : null;
  const selectedPlayerIds = useMemo(
    () => [form.playerOneId, form.playerTwoId].filter(Boolean),
    [form.playerOneId, form.playerTwoId]
  );
  const selectedPlayers = useMemo(
    () =>
      selectedPlayerIds
        .map((playerId) => players.find((player) => player.id === playerId) ?? null)
        .filter((player): player is Player => player !== null),
    [players, selectedPlayerIds]
  );
  const assignedPlayersById = useMemo(() => {
    const assignments = new Map<string, string>();

    teams.forEach((team) => {
      if (team.id === selectedTeam?.id) {
        return;
      }

      team.members.forEach((member) => {
        assignments.set(member.player_id, team.name);
      });
    });

    return assignments;
  }, [selectedTeam?.id, teams]);
  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();

    return players.filter((player) => {
      const isSelected = selectedPlayerIds.includes(player.id);
      const isAssignedToOtherTeam = assignedPlayersById.has(player.id);

      if (isSelected || isAssignedToOtherTeam) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        player.display_name,
        getPlayerLabel(player),
        player.first_name,
        player.last_name
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [assignedPlayersById, playerSearch, players, selectedPlayerIds]);
  const availablePlayers = useMemo(
    () =>
      players.filter(
        (player) => !assignedPlayersById.has(player.id) && !selectedPlayerIds.includes(player.id)
      ),
    [assignedPlayersById, players, selectedPlayerIds]
  );
  const isBusy =
    createTeamMutation.isPending ||
    updateTeamMutation.isPending ||
    deleteTeamMutation.isPending ||
    uploadLogoMutation.isPending;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 860px)');
    const syncListOpenState = () => {
      setIsTeamListOpen(mediaQuery.matches);
    };

    syncListOpenState();
    mediaQuery.addEventListener('change', syncListOpenState);

    return () => {
      mediaQuery.removeEventListener('change', syncListOpenState);
    };
  }, []);

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
    setSelectedTeamId(null);
    setForm(emptyTeamForm);
    setPlayerSearch('');
    setTeamSearch('');
    setTeamListPage(1);
    setSelectedBulkTeamIds([]);
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    setFormError(null);
  }, [selectedTournamentId]);

  useEffect(() => {
    setTeamListPage(1);
  }, [teamSearch]);

  useEffect(() => {
    if (teamListPage > teamPageCount) {
      setTeamListPage(teamPageCount);
    }
  }, [teamListPage, teamPageCount]);

  const getPlayerName = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player ? getPlayerLabel(player) : 'Giocatore sconosciuto';
  };

  const handleNewTeam = () => {
    setSelectedTeamId(null);
    setForm(emptyTeamForm);
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    setFormError(null);
  };

  const handleSelectTeam = (team: TeamWithMembers) => {
    setSelectedTeamId(team.id);
    setForm(teamToForm(team));
    setPlayerSearch('');
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    setFormError(null);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedSeasonId) {
      setFormError('Seleziona un torneo attivo prima di salvare la squadra.');
      return;
    }

    if (form.playerOneId && form.playerTwoId && form.playerOneId === form.playerTwoId) {
      setFormError('Lo stesso giocatore non puo occupare entrambe le posizioni.');
      return;
    }

    try {
      const teamName = form.name.trim() || getTeamFallbackName(selectedPlayers);

      if (!teamName) {
        setFormError('Seleziona almeno un giocatore o inserisci un nome squadra.');
        return;
      }

      if (isTeamLimitReached) {
        setFormError('Numero massimo di squadre raggiunto.');
        return;
      }

      if (selectedTournament?.useRanking && rankingError) {
        setFormError(rankingError);
        return;
      }

      const logoUrl = logoFile ? await uploadLogoMutation.mutateAsync(logoFile) : form.logoUrl || null;
      const payload = {
        season_id: selectedSeasonId,
        name: teamName,
        slug: form.slug || slugify(teamName),
        logo_url: logoUrl,
        ranking: selectedTournament?.useRanking ? Number(form.ranking) : null,
        player_ids: [form.playerOneId, form.playerTwoId].filter(Boolean)
      };

      if (selectedTeam) {
        await updateTeamMutation.mutateAsync({ id: selectedTeam.id, ...payload });
        setForm({
          name: payload.name,
          slug: payload.slug,
          logoUrl: payload.logo_url ?? '',
          playerOneId: payload.player_ids[0] ?? '',
          playerTwoId: payload.player_ids[1] ?? '',
          ranking: payload.ranking?.toString() ?? ''
        });
        setLogoFile(null);
        if (logoInputRef.current) {
          logoInputRef.current.value = '';
        }
      } else {
        await createTeamMutation.mutateAsync(payload);
        handleNewTeam();
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const updateSelectedPlayers = (playerIds: string[]) => {
    const nextPlayerIds = playerIds.slice(0, 2);

    setForm((current) => ({
      ...current,
      playerOneId: nextPlayerIds[0] ?? '',
      playerTwoId: nextPlayerIds[1] ?? ''
    }));
  };

  const handleSelectPlayer = (playerId: string) => {
    if (selectedPlayerIds.includes(playerId) || selectedPlayerIds.length >= 2) {
      return;
    }

    updateSelectedPlayers([...selectedPlayerIds, playerId]);
  };

  const handleRemovePlayer = (playerId: string) => {
    updateSelectedPlayers(selectedPlayerIds.filter((selectedPlayerId) => selectedPlayerId !== playerId));
  };

  const handleGenerateRandomTeam = () => {
    setFormError(null);

    const [firstPlayer, secondPlayer] = shuffleItems(availablePlayers);

    if (isTeamLimitReached) {
      setFormError('Numero massimo di squadre raggiunto.');
      return;
    }

    if (!firstPlayer || !secondPlayer) {
      setFormError('Servono almeno 2 giocatori disponibili per generare una squadra casuale.');
      return;
    }

    const firstFreeRanking = selectedTournament?.useRanking
      ? Array.from({ length: selectedTournament.expectedTeamsCount }, (_, index) => index + 1).find(
          (ranking) => !usedRankings.has(ranking)
        )
      : null;

    if (selectedTournament?.useRanking && !firstFreeRanking) {
      setFormError('Nessun ranking disponibile.');
      return;
    }

    const teamName = getTeamFallbackName([firstPlayer, secondPlayer]);
    setSelectedTeamId(null);
    setForm({
      name: teamName,
      slug: slugify(teamName),
      logoUrl: '',
      playerOneId: firstPlayer.id,
      playerTwoId: secondPlayer.id,
      ranking: firstFreeRanking?.toString() ?? ''
    });
    setPlayerSearch('');
  };

  const handleGenerateAllRandomTeams = async () => {
    if (!selectedSeasonId || !selectedTournament) {
      setFormError('Seleziona un torneo prima di generare le squadre.');
      return;
    }

    setFormError(null);

    const missingTeams = Math.max(selectedTournament.expectedTeamsCount - teams.length, 0);

    if (missingTeams === 0) {
      setFormError('Numero massimo di squadre raggiunto.');
      return;
    }

    const shuffledPlayers = shuffleItems(
      players.filter((player) => !assignedPlayersById.has(player.id))
    );

    if (shuffledPlayers.length < missingTeams * 2) {
      setFormError(
        `Servono ${(missingTeams * 2).toString()} giocatori disponibili per generare ${missingTeams.toString()} squadre.`
      );
      return;
    }

    try {
      const freeRankings = selectedTournament.useRanking
        ? Array.from({ length: selectedTournament.expectedTeamsCount }, (_, index) => index + 1).filter(
            (ranking) => !usedRankings.has(ranking)
          )
        : [];

      if (selectedTournament.useRanking && freeRankings.length < missingTeams) {
        throw new Error("Ranking già assegnato a un'altra squadra.");
      }

      for (let index = 0; index < missingTeams; index += 1) {
        const firstPlayer = shuffledPlayers[index * 2];
        const secondPlayer = shuffledPlayers[index * 2 + 1];

        if (!firstPlayer || !secondPlayer) {
          throw new Error('Giocatori disponibili insufficienti.');
        }

        const teamName = getTeamFallbackName([firstPlayer, secondPlayer]);
        await createTeamMutation.mutateAsync({
          season_id: selectedSeasonId,
          name: teamName,
          slug: slugify(teamName),
          logo_url: null,
          ranking: selectedTournament.useRanking ? freeRankings[index] ?? null : null,
          player_ids: [firstPlayer.id, secondPlayer.id]
        });
      }

      handleNewTeam();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!selectedTeam) {
      return;
    }

    setFormError(null);

    try {
      await deleteTeamMutation.mutateAsync(selectedTeam.id);
      handleNewTeam();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBulkTeamIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Eliminare ${selectedBulkTeamIds.length.toString()} squadre selezionate?`
    );

    if (!confirmed) {
      return;
    }

    setFormError(null);

    try {
      for (const teamId of selectedBulkTeamIds) {
        await deleteTeamMutation.mutateAsync(teamId);
      }
      setSelectedBulkTeamIds([]);
      if (selectedTeamId && selectedBulkTeamIds.includes(selectedTeamId)) {
        handleNewTeam();
      }
    } catch (error) {
      setFormError(
        `Eliminazione non completata. Verifica che la squadra non abbia partite collegate. ${getErrorMessage(error)}`
      );
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Area admin</p>
          <h1 className={styles.title}>Squadre</h1>
        </div>
        <button
          className={styles.button}
          disabled={!selectedSeasonId || isTournamentTeamLimitReached}
          onClick={handleNewTeam}
          type="button"
        >
          <FaPlus aria-hidden="true" className={styles.buttonIcon} />
          <span>Nuova squadra</span>
        </button>
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
          <p className={styles.muted}>Crea un torneo prima di aggiungere le squadre.</p>
        ) : null}
      </div>

      <div className={styles.layout}>
        <aside className={cx(styles.panel, styles.listPanel)}>
          <details
            className={styles.mobileListDetails}
            onToggle={(event) => {
              setIsTeamListOpen(event.currentTarget.open);
            }}
            open={isTeamListOpen}
          >
            <summary>Lista squadre</summary>
            <div className={styles.listControls}>
              <label className={styles.field}>
                <span className={styles.label}>Cerca squadra</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setTeamSearch(event.target.value);
                  }}
                  placeholder="Cerca squadra o giocatore..."
                  type="search"
                  value={teamSearch}
                />
              </label>
              <button
                className={styles.buttonDanger}
                disabled={isBusy || selectedBulkTeamIds.length === 0}
                onClick={() => void handleBulkDelete()}
                type="button"
              >
                <FaTrashCan aria-hidden="true" className={styles.buttonIcon} />
                <span>Elimina selezionate</span>
              </button>
            </div>
          <h2 className={styles.panelTitle}>Lista squadre</h2>
          {teamsQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {teamsQuery.isError ? <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p> : null}
          {!teamsQuery.isLoading && selectedSeasonId && teams.length === 0 ? (
            <p className={styles.muted}>Nessuna squadra per questo torneo.</p>
          ) : null}
          {!teamsQuery.isLoading && teams.length > 0 && filteredTeams.length === 0 ? (
            <p className={styles.muted}>Nessuna squadra trovata.</p>
          ) : null}
          <ul className={styles.list}>
            {visibleTeams.map((team) => (
              <li key={team.id}>
                <div className={styles.selectableListItem}>
                  <label className={styles.bulkCheckbox}>
                    <input
                      checked={selectedBulkTeamIds.includes(team.id)}
                      onChange={(event) => {
                        setSelectedBulkTeamIds((current) =>
                          event.target.checked
                            ? [...current, team.id]
                            : current.filter((teamId) => teamId !== team.id)
                        );
                      }}
                      type="checkbox"
                    />
                    <span className={styles.srOnly}>Seleziona {team.name}</span>
                  </label>
                  <button
                    className={cx(styles.listButton, team.id === selectedTeamId && styles.listButtonActive)}
                    onClick={() => {
                      handleSelectTeam(team);
                    }}
                    type="button"
                  >
                  {team.logo_url ? (
                    <img alt="" className={styles.logo} src={team.logo_url} />
                  ) : (
                    <span className={styles.logoFallback}>{team.name.slice(0, 1)}</span>
                  )}
                  <span>
                    <strong>{team.name}</strong>
                    <small>
                      {selectedTournament?.name ?? 'Torneo'}
                      {' · '}
                      {team.members.length > 0
                        ? team.members.map((member) => getPlayerName(member.player_id)).join(' / ')
                        : 'Nessun giocatore'}
                    </small>
                  </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {filteredTeams.length > teamsPerPage ? (
            <div className={styles.pagination} aria-label="Paginazione squadre">
              <button
                className={styles.buttonSecondary}
                disabled={teamListPage === 1}
                onClick={() => {
                  setTeamListPage((current) => Math.max(1, current - 1));
                }}
                type="button"
              >
                Precedente
              </button>
              <span>
                {teamListPage} / {teamPageCount}
              </span>
              <button
                className={styles.buttonSecondary}
                disabled={teamListPage === teamPageCount}
                onClick={() => {
                  setTeamListPage((current) => Math.min(teamPageCount, current + 1));
                }}
                type="button"
              >
                Successivo
              </button>
            </div>
          ) : null}
          </details>
        </aside>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {selectedTeam ? 'Modifica squadra' : 'Crea squadra'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.testActions}>
              <button
                className={styles.buttonSecondary}
                disabled={isBusy || !selectedSeasonId || isTournamentTeamLimitReached}
                onClick={handleGenerateRandomTeam}
                type="button"
              >
                Genera squadra casuale
              </button>
              <button
                className={styles.buttonSecondary}
                disabled={isBusy || !selectedSeasonId || isTournamentTeamLimitReached}
                onClick={() => void handleGenerateAllRandomTeams()}
                type="button"
              >
                Genera tutte le squadre casuali
              </button>
            </div>
            {isTeamLimitReached ? (
              <p className={styles.error}>Numero massimo di squadre raggiunto.</p>
            ) : null}
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Torneo</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setSelectedTournamentId(event.target.value || null);
                  }}
                  required
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

              <label className={styles.field}>
                <span className={styles.label}>Nome squadra</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    const name = event.target.value;
                    setForm((current) => ({ ...current, name, slug: slugify(name) }));
                  }}
                  placeholder="Vuoto = nomi giocatori"
                  value={form.name}
                />
              </label>

              {selectedTournament?.useRanking ? (
                <label className={styles.field}>
                  <span className={styles.label}>Ranking</span>
                  <input
                    className={styles.input}
                    min={1}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, ranking: event.target.value }));
                    }}
                    type="number"
                    value={form.ranking}
                  />
                  {rankingError ? <span className={styles.fieldError}>{rankingError}</span> : null}
                </label>
              ) : null}

              <div className={styles.playerPicker}>
                <div className={styles.playerPickerHeader}>
                  <span className={styles.label}>Giocatori</span>
                  <span className={styles.playerPickerHint}>
                    Seleziona 2 giocatori
                  </span>
                </div>

                <div className={styles.selectedPlayers}>
                  {selectedPlayers.length > 0 ? (
                    selectedPlayers.map((player) => (
                      <div className={styles.selectedPlayerCard} key={player.id}>
                        <PlayerAvatar player={player} />
                        <strong>{getPlayerLabel(player)}</strong>
                        <button
                          aria-label={`Rimuovi ${getPlayerLabel(player)}`}
                          className={styles.removePlayerButton}
                          onClick={() => {
                            handleRemovePlayer(player.id);
                          }}
                          type="button"
                        >
                          <FaXmark aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className={styles.muted}>Nessun giocatore selezionato.</p>
                  )}
                </div>

                {selectedPlayerIds.length < 2 ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Cerca giocatore</span>
                      <input
                        className={styles.input}
                        onChange={(event) => {
                          setPlayerSearch(event.target.value);
                        }}
                        placeholder="Cerca per nome..."
                        value={playerSearch}
                      />
                    </label>

                    <div className={styles.playerCards}>
                      {playersQuery.isLoading ? <p className={styles.muted}>Caricamento giocatori...</p> : null}
                      {!playersQuery.isLoading && filteredPlayers.length === 0 ? (
                        <p className={styles.muted}>Nessun giocatore disponibile</p>
                      ) : null}
                      {filteredPlayers.map((player) => {
                        const isSelected = selectedPlayerIds.includes(player.id);
                        const assignedTeamName = assignedPlayersById.get(player.id) ?? null;
                        const isAssigned = assignedTeamName !== null;
                        const isLimitReached = selectedPlayerIds.length >= 2 && !isSelected;
                        const isDisabled = isAssigned || isSelected || isLimitReached;

                        return (
                          <button
                            className={cx(
                              styles.playerCard,
                              isSelected && styles.playerCardSelected,
                              isDisabled && !isSelected && styles.playerCardDisabled
                            )}
                            disabled={isDisabled}
                            key={player.id}
                            onClick={() => {
                              handleSelectPlayer(player.id);
                            }}
                            type="button"
                          >
                            <PlayerAvatar player={player} />
                            <span className={styles.playerCardBody}>
                              <strong>{getPlayerLabel(player)}</strong>
                              {isSelected ? <small>Selezionato</small> : null}
                              {isAssigned ? <small>Già assegnato a una squadra</small> : null}
                              {!isSelected && !isAssigned && isLimitReached ? (
                                <small>Massimo 2 giocatori</small>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>

              <label className={styles.field}>
                <span className={styles.label}>
                  <FaUpload aria-hidden="true" className={styles.labelIcon} />
                  <span>Logo squadra</span>
                </span>
                <input
                  accept="image/*"
                  className={styles.input}
                  onChange={(event) => {
                    setLogoFile(event.target.files?.[0] ?? null);
                  }}
                  ref={logoInputRef}
                  type="file"
                />
              </label>
            </div>

            {formError ? <p className={styles.error}>{formError}</p> : null}

            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={isBusy || !selectedSeasonId || isTeamLimitReached || Boolean(rankingError)}
                type="submit"
              >
                <FaFloppyDisk aria-hidden="true" className={styles.buttonIcon} />
                <span>Salva squadra</span>
              </button>
              {selectedTeam ? (
                <button
                  className={styles.buttonDanger}
                  disabled={isBusy}
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  <FaTrashCan aria-hidden="true" className={styles.buttonIcon} />
                  <span>Elimina</span>
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
