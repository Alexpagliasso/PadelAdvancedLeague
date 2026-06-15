import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';
import type { Season, SeasonSettings } from '@/features/seasons/api/seasonsApi';
import {
  useCreateSeasonMutation,
  useSeasonSettingsQuery,
  useTournamentSeasonsQuery,
  useUpdateSeasonMutation,
  useUpdateSeasonSettingsMutation,
  useUpdateSeasonStatusMutation
} from '@/features/seasons/api/seasonsQueries';
import type { SeasonStatus } from '@/lib/supabase/types';

import styles from '@/features/seasons/routes/AdminSeasonsRoute.module.scss';

type AdminSeasonsRouteProps = {
  mode?: 'manage' | 'settings';
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
  playoffsEnabled: boolean;
  playoffTeamsCount: string;
  playoutsEnabled: boolean;
  playoutTeamsCount: string;
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
  playoffsEnabled: false,
  playoffTeamsCount: '',
  playoutsEnabled: false,
  playoutTeamsCount: ''
};

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
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

  return 'Unexpected error.';
}

function parseNullablePositiveInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
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
    playoffsEnabled: settings.playoffs_enabled,
    playoffTeamsCount: settings.playoff_teams_count?.toString() ?? '',
    playoutsEnabled: settings.playouts_enabled,
    playoutTeamsCount: settings.playout_teams_count?.toString() ?? ''
  };
}

export function AdminSeasonsRoute({ mode = 'manage' }: AdminSeasonsRouteProps) {
  const params = useParams<{ seasonId?: string; tournamentId?: string }>();
  const tournamentsQuery = useAdminTournamentsQuery();
  const tournaments = useMemo(() => tournamentsQuery.data ?? [], [tournamentsQuery.data]);
  const routeTournamentId = params.tournamentId ?? null;
  const routeSeasonId = params.seasonId ?? null;

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(emptySeasonForm);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(emptySettingsForm);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;

  const seasonsQuery = useTournamentSeasonsQuery(selectedTournamentId);
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;

  const settingsQuery = useSeasonSettingsQuery(selectedSeasonId);
  const createSeasonMutation = useCreateSeasonMutation(selectedTournamentId);
  const updateSeasonMutation = useUpdateSeasonMutation(selectedTournamentId);
  const updateSeasonStatusMutation = useUpdateSeasonStatusMutation(selectedTournamentId);
  const updateSeasonSettingsMutation = useUpdateSeasonSettingsMutation(selectedSeasonId);

  const isBusy =
    createSeasonMutation.isPending ||
    updateSeasonMutation.isPending ||
    updateSeasonStatusMutation.isPending ||
    updateSeasonSettingsMutation.isPending;

  useEffect(() => {
    if (routeTournamentId) {
      setSelectedTournamentId(routeTournamentId);
    }
  }, [routeTournamentId]);

  useEffect(() => {
    if (!routeSeasonId || tournaments.length === 0) {
      return;
    }

    const ownerTournament = tournaments.find((tournament) =>
      tournament.seasons.some((season) => season.id === routeSeasonId)
    );

    if (ownerTournament) {
      setSelectedTournamentId(ownerTournament.id);
      setSelectedSeasonId(routeSeasonId);
    }
  }, [routeSeasonId, tournaments]);

  useEffect(() => {
    if (!selectedTournamentId && !routeTournamentId && !routeSeasonId && tournaments.length > 0) {
      setSelectedTournamentId(tournaments[0]?.id ?? null);
    }
  }, [routeSeasonId, routeTournamentId, selectedTournamentId, tournaments]);

  useEffect(() => {
    if (selectedTournamentId) {
      if (!routeSeasonId) {
        setSelectedSeasonId(null);
      }
      setSeasonForm(emptySeasonForm);
      setSettingsForm(emptySettingsForm);
      setFormError(null);
    }
  }, [routeSeasonId, selectedTournamentId]);

  useEffect(() => {
    if (!selectedSeasonId && !routeSeasonId && seasons.length > 0) {
      setSelectedSeasonId(seasons[0]?.id ?? null);
    }
  }, [routeSeasonId, selectedSeasonId, seasons]);

  useEffect(() => {
    if (routeSeasonId && seasons.some((season) => season.id === routeSeasonId)) {
      setSelectedSeasonId(routeSeasonId);
    }
  }, [routeSeasonId, seasons]);

  useEffect(() => {
    setSeasonForm(seasonToForm(selectedSeason));
  }, [selectedSeason]);

  useEffect(() => {
    setSettingsForm(settingsToForm(settingsQuery.data ?? null));
  }, [settingsQuery.data]);

  const handleNewSeason = () => {
    setSelectedSeasonId(null);
    setSeasonForm(emptySeasonForm);
    setSettingsForm(emptySettingsForm);
    setFormError(null);
  };

  const handleSubmitSeason = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedTournamentId) {
      setFormError('Select a tournament before saving a season.');
      return;
    }

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
        return;
      }

      const createdSeason = await createSeasonMutation.mutateAsync({
        tournament_id: selectedTournamentId,
        name: seasonForm.name,
        slug: seasonForm.slug,
        starts_on: seasonForm.startsOn || null,
        ends_on: seasonForm.endsOn || null,
        is_public: seasonForm.isPublic
      });

      setSelectedSeasonId(createdSeason.id);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleSubmitSettings = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedSeasonId) {
      setFormError('Save or select a season before editing playoff settings.');
      return;
    }

    try {
      await updateSeasonSettingsMutation.mutateAsync({
        season_id: selectedSeasonId,
        regular_season_label: 'Regular season',
        playoffs_enabled: settingsForm.playoffsEnabled,
        playoff_teams_count: settingsForm.playoffsEnabled
          ? parseNullablePositiveInteger(settingsForm.playoffTeamsCount)
          : null,
        playoff_format: null,
        playouts_enabled: settingsForm.playoutsEnabled,
        playout_teams_count: settingsForm.playoutsEnabled
          ? parseNullablePositiveInteger(settingsForm.playoutTeamsCount)
          : null,
        playout_format: null,
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

  const handleStatusChange = async (status: Extract<SeasonStatus, 'active' | 'archived'>) => {
    if (!selectedSeason) {
      return;
    }

    setFormError(null);

    try {
      await updateSeasonStatusMutation.mutateAsync({ id: selectedSeason.id, status });
      setSeasonForm((current) => ({ ...current, status }));
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>{mode === 'settings' ? 'Season settings' : 'Seasons'}</h1>
        </div>
        <Link className={styles.buttonSecondary} to={appPaths.adminTournaments}>
          Tournaments
        </Link>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.label}>Tournament</span>
          <select
            className={styles.select}
            disabled={tournamentsQuery.isLoading}
            onChange={(event) => {
              setSelectedTournamentId(event.target.value || null);
            }}
            value={selectedTournamentId ?? ''}
          >
            <option value="">Select tournament</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Season list</h2>
            <button
              className={styles.buttonSecondary}
              disabled={!selectedTournamentId}
              onClick={handleNewSeason}
              type="button"
            >
              New
            </button>
          </div>

          {selectedTournament ? (
            <p className={styles.muted}>{selectedTournament.name}</p>
          ) : (
            <p className={styles.muted}>Create or select a tournament first.</p>
          )}

          <ul className={styles.list}>
            {seasons.map((season) => (
              <li key={season.id}>
                <button
                  className={cx(
                    styles.listButton,
                    selectedSeasonId === season.id && styles.listButtonActive
                  )}
                  onClick={() => {
                    setSelectedSeasonId(season.id);
                  }}
                  type="button"
                >
                  <strong>{season.name}</strong>
                  <span>{season.status}</span>
                </button>
              </li>
            ))}
          </ul>

          {seasonsQuery.isLoading ? <p className={styles.muted}>Loading seasons...</p> : null}
          {!seasonsQuery.isLoading && selectedTournament && seasons.length === 0 ? (
            <p className={styles.muted}>No seasons yet.</p>
          ) : null}
        </aside>

        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                {selectedSeason ? 'Edit season' : 'Create season'}
              </h2>
            {selectedSeason ? (
                <div className={styles.actions}>
                  <Link
                    className={styles.buttonSecondary}
                    to={appPaths.adminSeasonSettings(selectedSeason.id)}
                  >
                    Settings
                  </Link>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || selectedSeason.status === 'active'}
                    onClick={() => {
                      void handleStatusChange('active');
                    }}
                    type="button"
                  >
                    Activate
                  </button>
                  <button
                    className={styles.buttonDanger}
                    disabled={isBusy || selectedSeason.status === 'archived'}
                    onClick={() => {
                      void handleStatusChange('archived');
                    }}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              ) : null}
            </div>

            <form className={styles.form} onSubmit={(event) => void handleSubmitSeason(event)}>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Name</span>
                  <input
                    className={styles.input}
                    onBlur={() => {
                      if (!seasonForm.slug) {
                        setSeasonForm((current) => ({
                          ...current,
                          slug: slugify(current.name)
                        }));
                      }
                    }}
                    onChange={(event) => {
                      setSeasonForm((current) => ({ ...current, name: event.target.value }));
                    }}
                    required
                    type="text"
                    value={seasonForm.name}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Slug</span>
                  <input
                    className={styles.input}
                    onChange={(event) => {
                      setSeasonForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                    }}
                    required
                    type="text"
                    value={seasonForm.slug}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Start date</span>
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
                  <span className={styles.label}>End date</span>
                  <input
                    className={styles.input}
                    onChange={(event) => {
                      setSeasonForm((current) => ({ ...current, endsOn: event.target.value }));
                    }}
                    type="date"
                    value={seasonForm.endsOn}
                  />
                </label>

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
                  Public season
                </label>
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={isBusy || !selectedTournamentId}
                  type="submit"
                >
                  Save season
                </button>
              </div>
            </form>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Playoff and playout</h2>

            <form className={styles.form} onSubmit={(event) => void handleSubmitSettings(event)}>
              <div className={styles.grid}>
                <label className={styles.checkboxRow}>
                  <input
                    checked={settingsForm.playoffsEnabled}
                    disabled={!selectedSeasonId}
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
                    disabled={!selectedSeasonId || !settingsForm.playoffsEnabled}
                    min={2}
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

                <label className={styles.checkboxRow}>
                  <input
                    checked={settingsForm.playoutsEnabled}
                    disabled={!selectedSeasonId}
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
                    disabled={!selectedSeasonId || !settingsForm.playoutsEnabled}
                    min={2}
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

              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={isBusy || !selectedSeasonId || settingsQuery.isLoading}
                  type="submit"
                >
                  Save settings
                </button>
              </div>
            </form>
          </section>

          {formError ? <p className={styles.error}>{formError}</p> : null}
        </div>
      </div>
    </section>
  );
}
