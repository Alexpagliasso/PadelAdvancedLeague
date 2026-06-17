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
};

const emptyTeamForm: TeamFormState = {
  name: '',
  slug: '',
  logoUrl: '',
  playerOneId: '',
  playerTwoId: ''
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
    playerTwoId: sortedMembers[1]?.player_id ?? ''
  };
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
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamFormState>(emptyTeamForm);
  const [playerSearch, setPlayerSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
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
        .map((member) => players.find((player) => player.id === member.player_id)?.display_name ?? '')
        .join(' ');
      return [team.name, playerNames].join(' ').toLowerCase().includes(query);
    });
  }, [teamSearch, teams, players]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
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

    if (!query) {
      return players;
    }

    return players.filter((player) => {
      const searchableText = [
        player.display_name,
        player.first_name,
        player.last_name
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [playerSearch, players]);
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
    setSelectedBulkTeamIds([]);
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    setFormError(null);
  }, [selectedTournamentId]);

  const getPlayerName = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player?.display_name ?? 'Giocatore sconosciuto';
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
      const logoUrl = logoFile ? await uploadLogoMutation.mutateAsync(logoFile) : form.logoUrl || null;
      const payload = {
        season_id: selectedSeasonId,
        name: form.name,
        slug: form.slug,
        logo_url: logoUrl,
        player_ids: [form.playerOneId, form.playerTwoId].filter(Boolean)
      };

      if (selectedTeam) {
        await updateTeamMutation.mutateAsync({ id: selectedTeam.id, ...payload });
        setForm({
          name: payload.name,
          slug: payload.slug,
          logoUrl: payload.logo_url ?? '',
          playerOneId: payload.player_ids[0] ?? '',
          playerTwoId: payload.player_ids[1] ?? ''
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
        <button className={styles.button} disabled={!selectedSeasonId} onClick={handleNewTeam} type="button">
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
          <p className={styles.muted}>Attiva un torneo prima di creare le squadre.</p>
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
            {filteredTeams.map((team) => (
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
          </details>
        </aside>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {selectedTeam ? 'Modifica squadra' : 'Crea squadra'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
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
                  onBlur={() => {
                    if (!form.slug) {
                      setForm((current) => ({ ...current, slug: slugify(current.name) }));
                    }
                  }}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  required
                  value={form.name}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Slug</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                  }}
                  required
                  value={form.slug}
                />
              </label>

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
                    <p className={styles.muted}>Nessun giocatore trovato</p>
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
              <button className={styles.button} disabled={isBusy || !selectedSeasonId} type="submit">
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
