import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FaFloppyDisk, FaPlus, FaTrashCan, FaUpload } from 'react-icons/fa6';

import type { Player } from '@/features/players/api/playersApi';
import {
  useCreatePlayerMutation,
  useDeletePlayerMutation,
  usePlayersQuery,
  useProfilesQuery,
  useUpdatePlayerMutation,
  useUploadPlayerPhotoMutation
} from '@/features/players/api/playersQueries';

import styles from '@/features/players/routes/AdminPlayersRoute.module.scss';

type PlayerFormState = {
  profileId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  photoUrl: string;
};

const emptyPlayerForm: PlayerFormState = {
  profileId: '',
  firstName: '',
  lastName: '',
  displayName: '',
  photoUrl: ''
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

function playerToForm(player: Player | null): PlayerFormState {
  if (!player) {
    return emptyPlayerForm;
  }

  return {
    profileId: player.profile_id ?? '',
    firstName: player.first_name,
    lastName: player.last_name,
    displayName: player.display_name || getGeneratedDisplayName(player.first_name, player.last_name),
    photoUrl: player.photo_url ?? ''
  };
}

function getGeneratedDisplayName(firstName: string, lastName: string): string {
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const initial = normalizedFirstName ? `${normalizedFirstName.slice(0, 1).toUpperCase()}.` : '';

  return [normalizedLastName, initial].filter(Boolean).join(' ');
}

function getFallbackPlayerLabel(player: Player): string {
  return player.display_name || `${player.first_name} ${player.last_name}`.trim();
}

const randomFirstNames = [
  'Marco',
  'Luca',
  'Andrea',
  'Matteo',
  'Davide',
  'Alessandro',
  'Giulia',
  'Sara',
  'Francesca',
  'Elena'
];

const randomLastNames = [
  'Rossi',
  'Bianchi',
  'Ferrari',
  'Gallo',
  'Costa',
  'Romano',
  'Bruno',
  'Rizzo',
  'Marino',
  'Conti'
];

function pickRandomItem(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)] ?? items[0] ?? '';
}

export function AdminPlayersRoute() {
  const playersQuery = usePlayersQuery();
  const profilesQuery = useProfilesQuery();
  const createPlayerMutation = useCreatePlayerMutation();
  const updatePlayerMutation = useUpdatePlayerMutation();
  const deletePlayerMutation = useDeletePlayerMutation();
  const uploadPhotoMutation = useUploadPlayerPhotoMutation();
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [form, setForm] = useState<PlayerFormState>(emptyPlayerForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [playerListPage, setPlayerListPage] = useState(1);
  const [selectedBulkPlayerIds, setSelectedBulkPlayerIds] = useState<string[]>([]);
  const [isPlayerListOpen, setIsPlayerListOpen] = useState(false);
  const [isDisplayNameEdited, setIsDisplayNameEdited] = useState(false);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return players;
    }

    return players.filter((player) =>
      [getFallbackPlayerLabel(player), player.first_name, player.last_name]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [players, search]);
  const playersPerPage = 8;
  const playerPageCount = Math.max(1, Math.ceil(filteredPlayers.length / playersPerPage));
  const visiblePlayers = useMemo(
    () =>
      filteredPlayers.slice(
        (playerListPage - 1) * playersPerPage,
        playerListPage * playersPerPage
      ),
    [filteredPlayers, playerListPage]
  );
  const isBusy =
    createPlayerMutation.isPending ||
    updatePlayerMutation.isPending ||
    deletePlayerMutation.isPending ||
    uploadPhotoMutation.isPending;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 860px)');
    const syncListOpenState = () => {
      setIsPlayerListOpen(mediaQuery.matches);
    };

    syncListOpenState();
    mediaQuery.addEventListener('change', syncListOpenState);

    return () => {
      mediaQuery.removeEventListener('change', syncListOpenState);
    };
  }, []);

  useEffect(() => {
    setPlayerListPage(1);
  }, [search]);

  useEffect(() => {
    if (playerListPage > playerPageCount) {
      setPlayerListPage(playerPageCount);
    }
  }, [playerListPage, playerPageCount]);

  const handleNewPlayer = () => {
    setSelectedPlayerId(null);
    setForm(emptyPlayerForm);
    setIsDisplayNameEdited(false);
    setPhotoFile(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    setFormError(null);
  };

  const handleGenerateRandomPlayer = () => {
    const existingLabels = new Set(
      players.map((player) =>
        [player.first_name, player.last_name, player.display_name].join(' ').toLowerCase()
      )
    );
    let firstName = pickRandomItem(randomFirstNames);
    let lastName = pickRandomItem(randomLastNames);
    let attempts = 0;

    while (
      attempts < 30 &&
      existingLabels.has(
        [firstName, lastName, getGeneratedDisplayName(firstName, lastName)]
          .join(' ')
          .toLowerCase()
      )
    ) {
      firstName = pickRandomItem(randomFirstNames);
      lastName = pickRandomItem(randomLastNames);
      attempts += 1;
    }

    if (attempts >= 30) {
      lastName = `${lastName} ${Math.floor(Math.random() * 900 + 100).toString()}`;
    }

    setSelectedPlayerId(null);
    setIsDisplayNameEdited(false);
    setPhotoFile(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    setForm({
      profileId: '',
      firstName,
      lastName,
      displayName: getGeneratedDisplayName(firstName, lastName),
      photoUrl: ''
    });
    setFormError(null);
  };

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayerId(player.id);
    setForm(playerToForm(player));
    setIsDisplayNameEdited(
      player.display_name !== getGeneratedDisplayName(player.first_name, player.last_name)
    );
    setPhotoFile(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    setFormError(null);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    try {
      const photoUrl = photoFile ? await uploadPhotoMutation.mutateAsync(photoFile) : form.photoUrl || null;
      const payload = {
        profile_id: form.profileId || null,
        first_name: form.firstName,
        last_name: form.lastName,
        display_name: form.displayName || getGeneratedDisplayName(form.firstName, form.lastName),
        photo_url: photoUrl
      };

      if (selectedPlayer) {
        await updatePlayerMutation.mutateAsync({ id: selectedPlayer.id, ...payload });
        setForm({
          profileId: payload.profile_id ?? '',
          firstName: payload.first_name,
          lastName: payload.last_name,
          displayName: payload.display_name,
          photoUrl: payload.photo_url ?? ''
        });
        setIsDisplayNameEdited(
          payload.display_name !== getGeneratedDisplayName(payload.first_name, payload.last_name)
        );
        setPhotoFile(null);
        if (photoInputRef.current) {
          photoInputRef.current.value = '';
        }
      } else {
        await createPlayerMutation.mutateAsync(payload);
        handleNewPlayer();
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!selectedPlayer) {
      return;
    }

    setFormError(null);

    try {
      await deletePlayerMutation.mutateAsync(selectedPlayer.id);
      handleNewPlayer();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBulkPlayerIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Eliminare ${selectedBulkPlayerIds.length.toString()} giocatori selezionati?`
    );

    if (!confirmed) {
      return;
    }

    setFormError(null);

    try {
      for (const playerId of selectedBulkPlayerIds) {
        await deletePlayerMutation.mutateAsync(playerId);
      }
      setSelectedBulkPlayerIds([]);
      if (selectedPlayerId && selectedBulkPlayerIds.includes(selectedPlayerId)) {
        handleNewPlayer();
      }
    } catch (error) {
      setFormError(
        `Eliminazione non completata. Verifica che i giocatori non siano associati a squadre. ${getErrorMessage(error)}`
      );
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Area admin</p>
          <h1 className={styles.title}>Giocatori</h1>
        </div>
        <button className={styles.button} onClick={handleNewPlayer} type="button">
          <FaPlus aria-hidden="true" className={styles.buttonIcon} />
          <span>Nuovo giocatore</span>
        </button>
      </header>

      <div className={styles.layout}>
        <aside className={cx(styles.panel, styles.listPanel)}>
          <details
            className={styles.mobileListDetails}
            onToggle={(event) => {
              setIsPlayerListOpen(event.currentTarget.open);
            }}
            open={isPlayerListOpen}
          >
            <summary>Lista giocatori</summary>
            <div className={styles.listControls}>
              <label className={styles.field}>
                <span className={styles.label}>Cerca giocatore</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Cerca per nome..."
                  type="search"
                  value={search}
                />
              </label>
              <button
                className={styles.buttonDanger}
                disabled={isBusy || selectedBulkPlayerIds.length === 0}
                onClick={() => void handleBulkDelete()}
                type="button"
              >
                <FaTrashCan aria-hidden="true" className={styles.buttonIcon} />
                <span>Elimina selezionati</span>
              </button>
            </div>
          <h2 className={styles.panelTitle}>Lista giocatori</h2>
          {playersQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {playersQuery.isError ? (
            <p className={styles.error}>{getErrorMessage(playersQuery.error)}</p>
          ) : null}
          {!playersQuery.isLoading && players.length === 0 ? (
            <p className={styles.muted}>Nessun giocatore creato.</p>
          ) : null}
          {!playersQuery.isLoading && players.length > 0 && filteredPlayers.length === 0 ? (
            <p className={styles.muted}>Nessun giocatore trovato.</p>
          ) : null}
          <ul className={styles.list}>
            {visiblePlayers.map((player) => (
              <li key={player.id}>
                <div className={styles.selectableListItem}>
                  <label className={styles.bulkCheckbox}>
                    <input
                      checked={selectedBulkPlayerIds.includes(player.id)}
                      onChange={(event) => {
                        setSelectedBulkPlayerIds((current) =>
                          event.target.checked
                            ? [...current, player.id]
                            : current.filter((playerId) => playerId !== player.id)
                        );
                      }}
                      type="checkbox"
                    />
                    <span className={styles.srOnly}>Seleziona {getFallbackPlayerLabel(player)}</span>
                  </label>
                  <button
                    className={cx(
                      styles.listButton,
                      player.id === selectedPlayerId && styles.listButtonActive
                    )}
                    onClick={() => {
                      handleSelectPlayer(player);
                    }}
                    type="button"
                  >
                  {player.photo_url ? (
                    <img alt="" className={styles.avatar} src={player.photo_url} />
                  ) : (
                    <span className={styles.avatarFallback}>
                      {getFallbackPlayerLabel(player).slice(0, 1)}
                    </span>
                  )}
                  <span>
                    <strong>{getFallbackPlayerLabel(player)}</strong>
                    <small>
                      {player.first_name} {player.last_name}
                    </small>
                  </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {filteredPlayers.length > playersPerPage ? (
            <div className={styles.pagination} aria-label="Paginazione giocatori">
              <button
                className={styles.buttonSecondary}
                disabled={playerListPage === 1}
                onClick={() => {
                  setPlayerListPage((current) => Math.max(1, current - 1));
                }}
                type="button"
              >
                Precedente
              </button>
              <span>
                {playerListPage} / {playerPageCount}
              </span>
              <button
                className={styles.buttonSecondary}
                disabled={playerListPage === playerPageCount}
                onClick={() => {
                  setPlayerListPage((current) => Math.min(playerPageCount, current + 1));
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
            {selectedPlayer ? 'Modifica giocatore' : 'Crea giocatore'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.testActions}>
              <button
                className={styles.buttonSecondary}
                disabled={isBusy}
                onClick={handleGenerateRandomPlayer}
                type="button"
              >
                Genera giocatore casuale
              </button>
            </div>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    const firstName = event.target.value;
                    setForm((current) => ({
                      ...current,
                      firstName,
                      displayName: isDisplayNameEdited
                        ? current.displayName
                        : getGeneratedDisplayName(firstName, current.lastName)
                    }));
                  }}
                  required
                  value={form.firstName}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Cognome</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    const lastName = event.target.value;
                    setForm((current) => ({
                      ...current,
                      lastName,
                      displayName: isDisplayNameEdited
                        ? current.displayName
                        : getGeneratedDisplayName(current.firstName, lastName)
                    }));
                  }}
                  required
                  value={form.lastName}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Nome pubblico</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setIsDisplayNameEdited(true);
                    setForm((current) => ({ ...current, displayName: event.target.value }));
                  }}
                  required
                  value={form.displayName}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Profilo associato</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, profileId: event.target.value }));
                  }}
                  value={form.profileId}
                >
                  <option value="">Nessun profilo</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  <FaUpload aria-hidden="true" className={styles.labelIcon} />
                  <span>Foto profilo</span>
                </span>
                <input
                  accept="image/*"
                  className={styles.input}
                  onChange={(event) => {
                    setPhotoFile(event.target.files?.[0] ?? null);
                  }}
                  ref={photoInputRef}
                  type="file"
                />
              </label>
            </div>

            {formError ? <p className={styles.error}>{formError}</p> : null}

            <div className={styles.actions}>
              <button className={styles.button} disabled={isBusy} type="submit">
                <FaFloppyDisk aria-hidden="true" className={styles.buttonIcon} />
                <span>Salva giocatore</span>
              </button>
              {selectedPlayer ? (
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
