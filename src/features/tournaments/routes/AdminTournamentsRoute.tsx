import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';

import {
  useAdminTournamentsQuery,
  useCreateTournamentMutation,
  useDeleteTournamentMutation,
  useUpdateTournamentMutation,
  useUpdateTournamentStatusMutation
} from '@/features/tournaments/api/tournamentsQueries';
import type { TournamentWithSeasons } from '@/features/tournaments/api/tournamentsApi';
import type { TournamentStatus } from '@/lib/supabase/types';

import styles from '@/features/tournaments/routes/AdminTournamentsRoute.module.scss';

type TournamentFormState = {
  name: string;
  slug: string;
  description: string;
  status: TournamentStatus;
  isPublic: boolean;
};

const emptyTournamentForm: TournamentFormState = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  isPublic: false
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

  return 'Unexpected error.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
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
    isPublic: tournament.is_public
  };
}

export function AdminTournamentsRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const createTournamentMutation = useCreateTournamentMutation();
  const updateTournamentMutation = useUpdateTournamentMutation();
  const updateTournamentStatusMutation = useUpdateTournamentStatusMutation();
  const deleteTournamentMutation = useDeleteTournamentMutation();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(emptyTournamentForm);
  const [formError, setFormError] = useState<string | null>(null);

  const tournaments = useMemo(() => tournamentsQuery.data ?? [], [tournamentsQuery.data]);
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;

  const isBusy =
    createTournamentMutation.isPending ||
    updateTournamentMutation.isPending ||
    updateTournamentStatusMutation.isPending ||
    deleteTournamentMutation.isPending;

  useEffect(() => {
    if (!selectedTournamentId && tournaments.length > 0) {
      setSelectedTournamentId(tournaments[0]?.id ?? null);
    }
  }, [selectedTournamentId, tournaments]);

  useEffect(() => {
    setTournamentForm(tournamentToForm(selectedTournament));
  }, [selectedTournament]);

  const handleCreateTournament = () => {
    setSelectedTournamentId(null);
    setTournamentForm(emptyTournamentForm);
    setFormError(null);
  };

  const handleSubmitTournament = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    try {
      if (selectedTournament) {
        await updateTournamentMutation.mutateAsync({
          id: selectedTournament.id,
          name: tournamentForm.name,
          slug: tournamentForm.slug,
          description: tournamentForm.description.trim() || null,
          status: tournamentForm.status,
          is_public: tournamentForm.isPublic
        });
        return;
      }

      const created = await createTournamentMutation.mutateAsync({
        name: tournamentForm.name,
        slug: tournamentForm.slug,
        description: tournamentForm.description.trim() || null,
        is_public: tournamentForm.isPublic
      });
      setSelectedTournamentId(created.id);
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
      await updateTournamentStatusMutation.mutateAsync({ id: selectedTournament.id, status });
      setTournamentForm((current) => ({ ...current, status }));
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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tornei</h1>
        <div className={styles.actions}>
          <button className={styles.button} onClick={handleCreateTournament} type="button">
            Nuovo torneo
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Lista tornei</h2>
          {tournamentsQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {tournamentsQuery.isError ? (
            <p className={styles.error}>{getErrorMessage(tournamentsQuery.error)}</p>
          ) : null}
          {!tournamentsQuery.isLoading && tournaments.length === 0 ? (
            <p className={styles.muted}>Nessun torneo creato.</p>
          ) : null}
          <ul className={styles.list}>
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <button
                  className={cx(
                    styles.listButton,
                    tournament.id === selectedTournamentId && styles.listButtonActive
                  )}
                  onClick={() => {
                    setSelectedTournamentId(tournament.id);
                  }}
                  type="button"
                >
                  <strong>{tournament.name}</strong>
                  <br />
                  <span className={styles.muted}>
                    {tournament.status}
                    {tournament.seasons.some((season) => season.slug === 'main')
                      ? ' · demo ready'
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.panel}>
          {formError ? <p className={styles.error}>{formError}</p> : null}

          <h2 className={styles.panelTitle}>
            {selectedTournament ? 'Modifica torneo' : 'Crea torneo'}
          </h2>
          <form className={styles.form} onSubmit={(event) => void handleSubmitTournament(event)}>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome</span>
                <input
                  className={styles.input}
                  onBlur={() => {
                    if (!tournamentForm.slug) {
                      setTournamentForm((current) => ({
                        ...current,
                        slug: slugify(current.name)
                      }));
                    }
                  }}
                  onChange={(event) => {
                    setTournamentForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  required
                  value={tournamentForm.name}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Slug</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setTournamentForm((current) => ({
                      ...current,
                      slug: slugify(event.target.value)
                    }));
                  }}
                  required
                  value={tournamentForm.slug}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Descrizione</span>
              <textarea
                className={styles.textarea}
                onChange={(event) => {
                  setTournamentForm((current) => ({
                    ...current,
                    description: event.target.value
                  }));
                }}
                value={tournamentForm.description}
              />
            </label>

            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Stato</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setTournamentForm((current) => ({
                      ...current,
                      status: event.target.value as TournamentStatus
                    }));
                  }}
                  value={tournamentForm.status}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label className={styles.checkboxRow}>
                <input
                  checked={tournamentForm.isPublic}
                  onChange={(event) => {
                    setTournamentForm((current) => ({
                      ...current,
                      isPublic: event.target.checked
                    }));
                  }}
                  type="checkbox"
                />
                Pubblico
              </label>
            </div>

            <div className={styles.actions}>
              <button className={styles.button} disabled={isBusy} type="submit">
                Salva torneo
              </button>
              {selectedTournament ? (
                <>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || selectedTournament.status === 'active'}
                    onClick={() => void handleStatusChange('active')}
                    type="button"
                  >
                    Attiva
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || selectedTournament.status === 'draft'}
                    onClick={() => void handleStatusChange('draft')}
                    type="button"
                  >
                    Disattiva
                  </button>
                  <button
                    className={styles.buttonDanger}
                    disabled={isBusy}
                    onClick={() => void handleDeleteTournament()}
                    type="button"
                  >
                    Elimina
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
