import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import {
  useAdminTournamentsQuery,
  useCreateSeasonMutation,
  useCreateTournamentMutation,
  useSeasonSettingsQuery,
  useSeasonsQuery,
  useUpdateSeasonMutation,
  useUpdateSeasonSettingsMutation,
  useUpdateTournamentMutation,
  useUpdateTournamentStatusMutation
} from '@/features/tournaments/api/tournamentsQueries';
import type {
  Season,
  SeasonSettings,
  TournamentWithSeasons
} from '@/features/tournaments/api/tournamentsApi';
import type { SeasonStatus, TournamentStatus } from '@/lib/supabase/types';

import styles from '@/features/tournaments/routes/AdminTournamentsRoute.module.scss';

type TournamentFormState = {
  name: string;
  slug: string;
  description: string;
  status: TournamentStatus;
  isPublic: boolean;
};

type SeasonFormState = {
  name: string;
  slug: string;
  status: SeasonStatus;
  startsOn: string;
  endsOn: string;
  isPublic: boolean;
};

type SettingsFormState = {
  regularSeasonLabel: string;
  playoffsEnabled: boolean;
  playoffTeamsCount: string;
  playoffFormat: string;
  playoutsEnabled: boolean;
  playoutTeamsCount: string;
  playoutFormat: string;
};

const emptyTournamentForm: TournamentFormState = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  isPublic: false
};

const emptySeasonForm: SeasonFormState = {
  name: '',
  slug: '',
  status: 'draft',
  startsOn: '',
  endsOn: '',
  isPublic: false
};

const emptySettingsForm: SettingsFormState = {
  regularSeasonLabel: 'Regular season',
  playoffsEnabled: false,
  playoffTeamsCount: '',
  playoffFormat: '',
  playoutsEnabled: false,
  playoutTeamsCount: '',
  playoutFormat: ''
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

function seasonToForm(season: Season | null): SeasonFormState {
  if (!season) {
    return emptySeasonForm;
  }

  return {
    name: season.name,
    slug: season.slug,
    status: season.status,
    startsOn: season.starts_on ?? '',
    endsOn: season.ends_on ?? '',
    isPublic: season.is_public
  };
}

function settingsToForm(settings: SeasonSettings | null): SettingsFormState {
  if (!settings) {
    return emptySettingsForm;
  }

  return {
    regularSeasonLabel: settings.regular_season_label,
    playoffsEnabled: settings.playoffs_enabled,
    playoffTeamsCount: settings.playoff_teams_count?.toString() ?? '',
    playoffFormat: settings.playoff_format ?? '',
    playoutsEnabled: settings.playouts_enabled,
    playoutTeamsCount: settings.playout_teams_count?.toString() ?? '',
    playoutFormat: settings.playout_format ?? ''
  };
}

function parseNullablePositiveInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function AdminTournamentsRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const createTournamentMutation = useCreateTournamentMutation();
  const updateTournamentMutation = useUpdateTournamentMutation();
  const updateTournamentStatusMutation = useUpdateTournamentStatusMutation();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(emptyTournamentForm);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(emptySeasonForm);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(emptySettingsForm);
  const [formError, setFormError] = useState<string | null>(null);

  const tournaments = useMemo(() => tournamentsQuery.data ?? [], [tournamentsQuery.data]);
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;

  const seasonsQuery = useSeasonsQuery(selectedTournamentId);
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;

  const settingsQuery = useSeasonSettingsQuery(selectedSeasonId);
  const createSeasonMutation = useCreateSeasonMutation(selectedTournamentId);
  const updateSeasonMutation = useUpdateSeasonMutation(selectedTournamentId);
  const updateSeasonSettingsMutation = useUpdateSeasonSettingsMutation(selectedSeasonId);

  const isBusy =
    createTournamentMutation.isPending ||
    updateTournamentMutation.isPending ||
    updateTournamentStatusMutation.isPending ||
    createSeasonMutation.isPending ||
    updateSeasonMutation.isPending ||
    updateSeasonSettingsMutation.isPending;

  useEffect(() => {
    if (!selectedTournamentId && tournaments.length > 0) {
      setSelectedTournamentId(tournaments[0]?.id ?? null);
    }
  }, [selectedTournamentId, tournaments]);

  useEffect(() => {
    setTournamentForm(tournamentToForm(selectedTournament));
    setSelectedSeasonId(null);
  }, [selectedTournament]);

  useEffect(() => {
    setSeasonForm(seasonToForm(selectedSeason));
  }, [selectedSeason]);

  useEffect(() => {
    setSettingsForm(settingsToForm(settingsQuery.data ?? null));
  }, [settingsQuery.data]);

  const handleCreateTournament = () => {
    setSelectedTournamentId(null);
    setSelectedSeasonId(null);
    setTournamentForm(emptyTournamentForm);
    setSeasonForm(emptySeasonForm);
    setSettingsForm(emptySettingsForm);
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
      } else {
        const created = await createTournamentMutation.mutateAsync({
          name: tournamentForm.name,
          slug: tournamentForm.slug,
          description: tournamentForm.description.trim() || null,
          is_public: tournamentForm.isPublic
        });
        setSelectedTournamentId(created.id);
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleStatusChange = async (status: TournamentStatus) => {
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

  const handleCreateSeason = () => {
    setSelectedSeasonId(null);
    setSeasonForm(emptySeasonForm);
    setSettingsForm(emptySettingsForm);
    setFormError(null);
  };

  const handleSubmitSeason = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTournamentId) {
      setFormError('Select a tournament before saving a season.');
      return;
    }

    setFormError(null);

    try {
      if (selectedSeason) {
        await updateSeasonMutation.mutateAsync({
          id: selectedSeason.id,
          tournament_id: selectedTournamentId,
          name: seasonForm.name,
          slug: seasonForm.slug,
          status: seasonForm.status,
          starts_on: seasonForm.startsOn || null,
          ends_on: seasonForm.endsOn || null,
          is_public: seasonForm.isPublic
        });
      } else {
        const created = await createSeasonMutation.mutateAsync({
          tournament_id: selectedTournamentId,
          name: seasonForm.name,
          slug: seasonForm.slug,
          starts_on: seasonForm.startsOn || null,
          ends_on: seasonForm.endsOn || null,
          is_public: seasonForm.isPublic
        });
        setSelectedSeasonId(created.id);
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleSubmitSettings = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSeasonId) {
      setFormError('Select a season before saving settings.');
      return;
    }

    setFormError(null);

    try {
      await updateSeasonSettingsMutation.mutateAsync({
        season_id: selectedSeasonId,
        regular_season_label: settingsForm.regularSeasonLabel,
        playoffs_enabled: settingsForm.playoffsEnabled,
        playoff_teams_count: settingsForm.playoffsEnabled
          ? parseNullablePositiveInteger(settingsForm.playoffTeamsCount)
          : null,
        playoff_format: settingsForm.playoffsEnabled
          ? settingsForm.playoffFormat.trim() || null
          : null,
        playouts_enabled: settingsForm.playoutsEnabled,
        playout_teams_count: settingsForm.playoutsEnabled
          ? parseNullablePositiveInteger(settingsForm.playoutTeamsCount)
          : null,
        playout_format: settingsForm.playoutsEnabled
          ? settingsForm.playoutFormat.trim() || null
          : null,
        standings_tiebreak_order: [
          'points',
          'head_to_head',
          'set_difference',
          'game_difference'
        ]
      });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tournaments</h1>
        <div className={styles.actions}>
          <Link
            className={styles.buttonSecondary}
            to={
              selectedTournament
                ? appPaths.adminTournamentSeasons(selectedTournament.id)
                : appPaths.adminTournaments
            }
          >
            Seasons
          </Link>
          <button className={styles.button} onClick={handleCreateTournament} type="button">
            New tournament
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Tournament list</h2>
          {tournamentsQuery.isLoading && <p className={styles.muted}>Loading...</p>}
          {tournamentsQuery.isError && (
            <p className={styles.error}>{getErrorMessage(tournamentsQuery.error)}</p>
          )}
          {!tournamentsQuery.isLoading && tournaments.length === 0 && (
            <p className={styles.muted}>No tournaments yet.</p>
          )}
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
                    {tournament.status} · {tournament.seasons.length} seasons
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className={styles.stack}>
          {formError && <p className={styles.error}>{formError}</p>}

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>
              {selectedTournament ? 'Edit tournament' : 'Create tournament'}
            </h2>
            <form className={styles.form} onSubmit={(event) => void handleSubmitTournament(event)}>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Name</span>
                  <input
                    className={styles.input}
                    onChange={(event) => {
                      const name = event.target.value;
                      setTournamentForm((current) => ({
                        ...current,
                        name,
                        slug: current.slug || slugify(name)
                      }));
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
                      setTournamentForm((current) => ({ ...current, slug: event.target.value }));
                    }}
                    required
                    value={tournamentForm.slug}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Description</span>
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
                  <span className={styles.label}>Status</span>
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
                  Public
                </label>
              </div>
              <div className={styles.actions}>
                <button className={styles.button} disabled={isBusy} type="submit">
                  Save tournament
                </button>
                {selectedTournament && (
                  <>
                    <button
                      className={styles.buttonSecondary}
                      disabled={isBusy}
                      onClick={() => void handleStatusChange('active')}
                      type="button"
                    >
                      Activate
                    </button>
                    <button
                      className={styles.buttonSecondary}
                      disabled={isBusy}
                      onClick={() => void handleStatusChange('draft')}
                      type="button"
                    >
                      Deactivate
                    </button>
                    <button
                      className={styles.buttonDanger}
                      disabled={isBusy}
                      onClick={() => void handleStatusChange('archived')}
                      type="button"
                    >
                      Archive
                    </button>
                  </>
                )}
              </div>
            </form>
          </section>

          {selectedTournament && (
            <section className={styles.panel}>
              <div className={styles.header}>
                <h2 className={styles.panelTitle}>Seasons</h2>
                <button className={styles.buttonSecondary} onClick={handleCreateSeason} type="button">
                  New season
                </button>
              </div>
              <ul className={styles.list}>
                {seasons.map((season) => (
                  <li key={season.id}>
                    <button
                      className={cx(
                        styles.listButton,
                        season.id === selectedSeasonId && styles.listButtonActive
                      )}
                      onClick={() => {
                        setSelectedSeasonId(season.id);
                      }}
                      type="button"
                    >
                      <strong>{season.name}</strong>
                      <br />
                      <span className={styles.muted}>{season.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selectedTournament && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                {selectedSeason ? 'Edit season' : 'Create season'}
              </h2>
              <form className={styles.form} onSubmit={(event) => void handleSubmitSeason(event)}>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Name</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        const name = event.target.value;
                        setSeasonForm((current) => ({
                          ...current,
                          name,
                          slug: current.slug || slugify(name)
                        }));
                      }}
                      required
                      value={seasonForm.name}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Slug</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        setSeasonForm((current) => ({ ...current, slug: event.target.value }));
                      }}
                      required
                      value={seasonForm.slug}
                    />
                  </label>
                </div>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Starts on</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        setSeasonForm((current) => ({ ...current, startsOn: event.target.value }));
                      }}
                      type="date"
                      value={seasonForm.startsOn}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Ends on</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        setSeasonForm((current) => ({ ...current, endsOn: event.target.value }));
                      }}
                      type="date"
                      value={seasonForm.endsOn}
                    />
                  </label>
                </div>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Status</span>
                    <select
                      className={styles.select}
                      onChange={(event) => {
                        setSeasonForm((current) => ({
                          ...current,
                          status: event.target.value as SeasonStatus
                        }));
                      }}
                      value={seasonForm.status}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label className={styles.checkboxRow}>
                    <input
                      checked={seasonForm.isPublic}
                      onChange={(event) => {
                        setSeasonForm((current) => ({
                          ...current,
                          isPublic: event.target.checked
                        }));
                      }}
                      type="checkbox"
                    />
                    Public
                  </label>
                </div>
                <button className={styles.button} disabled={isBusy} type="submit">
                  Save season
                </button>
              </form>
            </section>
          )}

          {selectedSeason && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Season settings</h2>
              <form className={styles.form} onSubmit={(event) => void handleSubmitSettings(event)}>
                <label className={styles.field}>
                  <span className={styles.label}>Regular season label</span>
                  <input
                    className={styles.input}
                    onChange={(event) => {
                      setSettingsForm((current) => ({
                        ...current,
                        regularSeasonLabel: event.target.value
                      }));
                    }}
                    required
                    value={settingsForm.regularSeasonLabel}
                  />
                </label>

                <div className={styles.grid}>
                  <label className={styles.checkboxRow}>
                    <input
                      checked={settingsForm.playoffsEnabled}
                      onChange={(event) => {
                        setSettingsForm((current) => ({
                          ...current,
                          playoffsEnabled: event.target.checked
                        }));
                      }}
                      type="checkbox"
                    />
                    Playoff enabled
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Playoff teams</span>
                    <input
                      className={styles.input}
                      disabled={!settingsForm.playoffsEnabled}
                      min="2"
                      onChange={(event) => {
                        setSettingsForm((current) => ({
                          ...current,
                          playoffTeamsCount: event.target.value
                        }));
                      }}
                      type="number"
                      value={settingsForm.playoffTeamsCount}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>Playoff format</span>
                  <input
                    className={styles.input}
                    disabled={!settingsForm.playoffsEnabled}
                    onChange={(event) => {
                      setSettingsForm((current) => ({
                        ...current,
                        playoffFormat: event.target.value
                      }));
                    }}
                    placeholder="semifinals_final"
                    value={settingsForm.playoffFormat}
                  />
                </label>

                <div className={styles.grid}>
                  <label className={styles.checkboxRow}>
                    <input
                      checked={settingsForm.playoutsEnabled}
                      onChange={(event) => {
                        setSettingsForm((current) => ({
                          ...current,
                          playoutsEnabled: event.target.checked
                        }));
                      }}
                      type="checkbox"
                    />
                    Playout enabled
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Playout teams</span>
                    <input
                      className={styles.input}
                      disabled={!settingsForm.playoutsEnabled}
                      min="2"
                      onChange={(event) => {
                        setSettingsForm((current) => ({
                          ...current,
                          playoutTeamsCount: event.target.value
                        }));
                      }}
                      type="number"
                      value={settingsForm.playoutTeamsCount}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>Playout format</span>
                  <input
                    className={styles.input}
                    disabled={!settingsForm.playoutsEnabled}
                    onChange={(event) => {
                      setSettingsForm((current) => ({
                        ...current,
                        playoutFormat: event.target.value
                      }));
                    }}
                    placeholder="simple_playout"
                    value={settingsForm.playoutFormat}
                  />
                </label>

                <button className={styles.button} disabled={isBusy} type="submit">
                  Save settings
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
