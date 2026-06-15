import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';

import { usePlayersQuery } from '@/features/players/api/playersQueries';
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

  return 'Unexpected error.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const createTeamMutation = useCreateTeamMutation(selectedSeasonId);
  const updateTeamMutation = useUpdateTeamMutation(selectedSeasonId);
  const deleteTeamMutation = useDeleteTeamMutation(selectedSeasonId);
  const uploadLogoMutation = useUploadTeamLogoMutation();

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const isBusy =
    createTeamMutation.isPending ||
    updateTeamMutation.isPending ||
    deleteTeamMutation.isPending ||
    uploadLogoMutation.isPending;

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
    setLogoFile(null);
    setFormError(null);
  }, [selectedTournamentId]);

  const getPlayerName = (playerId: string): string => {
    const player = players.find((item) => item.id === playerId);
    return player?.display_name ?? 'Unknown player';
  };

  const handleNewTeam = () => {
    setSelectedTeamId(null);
    setForm(emptyTeamForm);
    setLogoFile(null);
    setFormError(null);
  };

  const handleSelectTeam = (team: TeamWithMembers) => {
    setSelectedTeamId(team.id);
    setForm(teamToForm(team));
    setLogoFile(null);
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
      } else {
        const created = await createTeamMutation.mutateAsync(payload);
        setSelectedTeamId(created.id);
      }

      setLogoFile(null);
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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Squadre</h1>
        </div>
        <button className={styles.button} disabled={!selectedSeasonId} onClick={handleNewTeam} type="button">
          Nuova squadra
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
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Lista squadre</h2>
          {teamsQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {teamsQuery.isError ? <p className={styles.error}>{getErrorMessage(teamsQuery.error)}</p> : null}
          {!teamsQuery.isLoading && selectedSeasonId && teams.length === 0 ? (
            <p className={styles.muted}>Nessuna squadra per questo torneo.</p>
          ) : null}
          <ul className={styles.list}>
            {teams.map((team) => (
              <li key={team.id}>
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
                      {team.members.length > 0
                        ? team.members.map((member) => getPlayerName(member.player_id)).join(' / ')
                        : 'Nessun giocatore'}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {selectedTeam ? 'Modifica squadra' : 'Crea squadra'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.grid}>
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

              <label className={styles.field}>
                <span className={styles.label}>Giocatore 1</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, playerOneId: event.target.value }));
                  }}
                  value={form.playerOneId}
                >
                  <option value="">Seleziona giocatore</option>
                  {players.map((player) => (
                    <option disabled={player.id === form.playerTwoId} key={player.id} value={player.id}>
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
                    setForm((current) => ({ ...current, playerTwoId: event.target.value }));
                  }}
                  value={form.playerTwoId}
                >
                  <option value="">Seleziona giocatore</option>
                  {players.map((player) => (
                    <option disabled={player.id === form.playerOneId} key={player.id} value={player.id}>
                      {player.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Logo squadra</span>
                <input
                  accept="image/*"
                  className={styles.input}
                  onChange={(event) => {
                    setLogoFile(event.target.files?.[0] ?? null);
                  }}
                  type="file"
                />
              </label>
            </div>

            {formError ? <p className={styles.error}>{formError}</p> : null}

            <div className={styles.actions}>
              <button className={styles.button} disabled={isBusy || !selectedSeasonId} type="submit">
                Salva squadra
              </button>
              {selectedTeam ? (
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
