import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';

import { useMatchesBySeasonQuery } from '@/features/matches/api/matchesQueries';
import { usePlayersQuery } from '@/features/players/api/playersQueries';
import {
  useCreateTeamMutation,
  useTeamsBySeasonQuery
} from '@/features/teams/api/teamsQueries';
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

type QuickTeamFormState = {
  name: string;
  slug: string;
  playerOneId: string;
  playerTwoId: string;
};

const emptyTournamentForm: TournamentFormState = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  isPublic: false
};

const emptyQuickTeamForm: QuickTeamFormState = {
  name: '',
  slug: '',
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

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium'
  }).format(new Date(value));
}

export function AdminTournamentsRoute() {
  const tournamentsQuery = useAdminTournamentsQuery();
  const playersQuery = usePlayersQuery();
  const createTournamentMutation = useCreateTournamentMutation();
  const updateTournamentMutation = useUpdateTournamentMutation();
  const updateTournamentStatusMutation = useUpdateTournamentStatusMutation();
  const deleteTournamentMutation = useDeleteTournamentMutation();
  const didAutoSelectTournament = useRef(false);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(emptyTournamentForm);
  const [quickTeamForm, setQuickTeamForm] = useState<QuickTeamFormState>(emptyQuickTeamForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);

  const tournaments = useMemo(() => tournamentsQuery.data ?? [], [tournamentsQuery.data]);
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedMainSeasonId =
    selectedTournament?.seasons.find((season) => season.slug === 'main')?.id ??
    selectedTournament?.seasons[0]?.id ??
    null;
  const teamsQuery = useTeamsBySeasonQuery(selectedMainSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedMainSeasonId);
  const createTeamMutation = useCreateTeamMutation(selectedMainSeasonId);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const playedMatchesCount = matches.filter(
    (match) => match.status === 'played' && match.result_status === 'official'
  ).length;
  const pendingMatchesCount = Math.max(0, matches.length - playedMatchesCount);
  const completionPercentage =
    matches.length > 0 ? Math.round((playedMatchesCount / matches.length) * 100) : 0;
  const calendarGeneratedAt =
    matches.length > 0
      ? [...matches].sort((first, second) => first.created_at.localeCompare(second.created_at))[0]
          ?.created_at ?? null
      : null;

  const isBusy =
    createTournamentMutation.isPending ||
    updateTournamentMutation.isPending ||
    updateTournamentStatusMutation.isPending ||
    deleteTournamentMutation.isPending ||
    createTeamMutation.isPending;

  useEffect(() => {
    if (!selectedTournamentId && !didAutoSelectTournament.current && tournaments.length > 0) {
      didAutoSelectTournament.current = true;
      setSelectedTournamentId(tournaments[0]?.id ?? null);
    }
  }, [selectedTournamentId, tournaments]);

  useEffect(() => {
    setTournamentForm(tournamentToForm(selectedTournament));
    setQuickTeamForm(emptyQuickTeamForm);
    setTeamFormError(null);
  }, [selectedTournament]);

  const handleCreateTournament = () => {
    didAutoSelectTournament.current = true;
    setSelectedTournamentId(null);
    setTournamentForm(emptyTournamentForm);
    setQuickTeamForm(emptyQuickTeamForm);
    setFormError(null);
    setTeamFormError(null);
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player?.display_name ?? 'Giocatore';
  };

  const handleSubmitQuickTeam = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTeamFormError(null);

    if (!selectedMainSeasonId) {
      setTeamFormError('Questo torneo non ha una stagione principale disponibile.');
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

    try {
      await createTeamMutation.mutateAsync({
        season_id: selectedMainSeasonId,
        name: quickTeamForm.name,
        slug: quickTeamForm.slug,
        logo_url: null,
        player_ids: [quickTeamForm.playerOneId, quickTeamForm.playerTwoId].filter(Boolean)
      });
      setQuickTeamForm(emptyQuickTeamForm);
    } catch (error) {
      setTeamFormError(getErrorMessage(error));
    }
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

      await createTournamentMutation.mutateAsync({
        name: tournamentForm.name,
        slug: tournamentForm.slug,
        description: tournamentForm.description.trim() || null,
        is_public: tournamentForm.isPublic
      });
      handleCreateTournament();
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

          {selectedTournament ? (
            <div className={styles.detailBlock}>
              <div className={styles.dashboardGrid}>
                <div className={styles.statCard}>
                  <span>Squadre</span>
                  <strong>{teams.length}</strong>
                </div>
                <div className={styles.statCard}>
                  <span>Partite</span>
                  <strong>{matches.length}</strong>
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

              <div className={styles.progressBlock}>
                <div className={styles.progressHeader}>
                  <strong>
                    {playedMatchesCount} / {matches.length} partite completate
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
                  <p className={styles.muted}>Calendario generato il {formatDate(calendarGeneratedAt)}</p>
                ) : (
                  <p className={styles.muted}>Calendario non ancora generato.</p>
                )}
                {matchesQuery.isError ? (
                  <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p>
                ) : null}
              </div>

              <div className={styles.detailHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Squadre del torneo</h2>
                  <p className={styles.muted}>
                    Le squadre vengono salvate automaticamente nella season principale.
                  </p>
                </div>
                <span className={styles.badge}>{teams.length} squadre</span>
              </div>

              {teamsQuery.isLoading ? <p className={styles.muted}>Caricamento squadre...</p> : null}
              {teamsQuery.isError ? (
                <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p>
              ) : null}
              {!teamsQuery.isLoading && teams.length === 0 ? (
                <p className={styles.muted}>Nessuna squadra collegata a questo torneo.</p>
              ) : null}

              <ul className={styles.teamList}>
                {teams.map((team) => (
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

              <form
                className={styles.form}
                onSubmit={(event) => void handleSubmitQuickTeam(event)}
              >
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
                      required
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
                      required
                      value={quickTeamForm.slug}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Giocatore 1</span>
                    <select
                      className={styles.select}
                      onChange={(event) => {
                        setQuickTeamForm((current) => ({
                          ...current,
                          playerOneId: event.target.value
                        }));
                      }}
                      value={quickTeamForm.playerOneId}
                    >
                      <option value="">Seleziona giocatore</option>
                      {players.map((player) => (
                        <option
                          disabled={player.id === quickTeamForm.playerTwoId}
                          key={player.id}
                          value={player.id}
                        >
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Giocatore 2</span>
                    <select
                      className={styles.select}
                      onChange={(event) => {
                        setQuickTeamForm((current) => ({
                          ...current,
                          playerTwoId: event.target.value
                        }));
                      }}
                      value={quickTeamForm.playerTwoId}
                    >
                      <option value="">Seleziona giocatore</option>
                      {players.map((player) => (
                        <option
                          disabled={player.id === quickTeamForm.playerOneId}
                          key={player.id}
                          value={player.id}
                        >
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {teamFormError ? <p className={styles.error}>{teamFormError}</p> : null}

                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={isBusy || !selectedMainSeasonId}
                    type="submit"
                  >
                    Aggiungi squadra
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
