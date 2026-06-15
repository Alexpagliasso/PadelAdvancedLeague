import { type SyntheticEvent, useMemo, useRef, useState } from 'react';

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
    displayName: player.display_name,
    photoUrl: player.photo_url ?? ''
  };
}

function getDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
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

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const isBusy =
    createPlayerMutation.isPending ||
    updatePlayerMutation.isPending ||
    deletePlayerMutation.isPending ||
    uploadPhotoMutation.isPending;

  const handleNewPlayer = () => {
    setSelectedPlayerId(null);
    setForm(emptyPlayerForm);
    setPhotoFile(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    setFormError(null);
  };

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayerId(player.id);
    setForm(playerToForm(player));
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
        display_name: form.displayName || getDisplayName(form.firstName, form.lastName),
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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Area admin</p>
          <h1 className={styles.title}>Giocatori</h1>
        </div>
        <button className={styles.button} onClick={handleNewPlayer} type="button">
          Nuovo giocatore
        </button>
      </header>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Lista giocatori</h2>
          {playersQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {playersQuery.isError ? (
            <p className={styles.error}>{getErrorMessage(playersQuery.error)}</p>
          ) : null}
          <ul className={styles.list}>
            {players.map((player) => (
              <li key={player.id}>
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
                    <span className={styles.avatarFallback}>{player.display_name.slice(0, 1)}</span>
                  )}
                  <span>
                    <strong>{player.display_name}</strong>
                    <small>
                      {player.first_name} {player.last_name}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {selectedPlayer ? 'Modifica giocatore' : 'Crea giocatore'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome</span>
                <input
                  className={styles.input}
                  onBlur={() => {
                    if (!form.displayName) {
                      setForm((current) => ({
                        ...current,
                        displayName: getDisplayName(current.firstName, current.lastName)
                      }));
                    }
                  }}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, firstName: event.target.value }));
                  }}
                  required
                  value={form.firstName}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Cognome</span>
                <input
                  className={styles.input}
                  onBlur={() => {
                    if (!form.displayName) {
                      setForm((current) => ({
                        ...current,
                        displayName: getDisplayName(current.firstName, current.lastName)
                      }));
                    }
                  }}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, lastName: event.target.value }));
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
                <span className={styles.label}>Foto profilo</span>
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
                Salva giocatore
              </button>
              {selectedPlayer ? (
                <button
                  className={styles.buttonDanger}
                  disabled={isBusy}
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  Elimina
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
