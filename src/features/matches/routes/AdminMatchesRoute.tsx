import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { MatchStatus } from '@/lib/supabase/types';
import type { MatchWithSets, MatchSetInput } from '@/features/matches/api/matchesApi';
import {
  useCreateMatchMutation,
  useDeleteMatchMutation,
  useMatchesBySeasonQuery,
  useUpdateMatchMutation
} from '@/features/matches/api/matchesQueries';
import { useTeamsBySeasonQuery } from '@/features/teams/api/teamsQueries';
import { useAdminTournamentsQuery } from '@/features/tournaments/api/tournamentsQueries';

import styles from '@/features/matches/routes/AdminMatchesRoute.module.scss';

type MatchFormState = {
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  time: string;
  venue: string;
  status: MatchStatus;
  set1Home: string;
  set1Away: string;
  set2Home: string;
  set2Away: string;
  set3Home: string;
  set3Away: string;
};

const emptyMatchForm: MatchFormState = {
  homeTeamId: '',
  awayTeamId: '',
  date: '',
  time: '',
  venue: '',
  status: 'scheduled',
  set1Home: '',
  set1Away: '',
  set2Home: '',
  set2Away: '',
  set3Home: '',
  set3Away: ''
};

const timeSlots = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
    .toString()
    .padStart(2, '0');
  const minutes = index % 2 === 0 ? '00' : '30';
  return `${hour}:${minutes}`;
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error.';
}

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getDatePart(value: string | null): string {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}

function getTimePart(value: string | null): string {
  if (!value) {
    return '';
  }

  return value.slice(11, 16);
}

function getScheduledAt(date: string, time: string): string | null {
  if (!date) {
    return null;
  }

  return `${date}T${time || '00:00'}:00`;
}

function isValidHalfHourTime(time: string): boolean {
  if (!time) {
    return true;
  }

  const [, minutes] = time.split(':');
  return minutes === '00' || minutes === '30';
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Da programmare';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getScoreLabel(match: MatchWithSets): string {
  if (match.result_status !== 'official') {
    return '-';
  }

  return `${match.home_sets_won.toString()}-${match.away_sets_won.toString()}`;
}

function getSetsLabel(match: MatchWithSets): string {
  if (match.sets.length === 0) {
    return '-';
  }

  return match.sets
    .sort((first, second) => first.set_number - second.set_number)
    .map((set) => `${set.home_games.toString()}-${set.away_games.toString()}`)
    .join(', ');
}

function parseSetScore(
  setNumber: 1 | 2 | 3,
  homeValue: string,
  awayValue: string,
  required: boolean
): MatchSetInput | null {
  const hasHome = homeValue.trim().length > 0;
  const hasAway = awayValue.trim().length > 0;

  if (!hasHome && !hasAway && !required) {
    return null;
  }

  if (!hasHome || !hasAway) {
    throw new Error('Completa entrambi i valori del set oppure lascialo vuoto.');
  }

  const homeGames = Number.parseInt(homeValue, 10);
  const awayGames = Number.parseInt(awayValue, 10);

  if (Number.isNaN(homeGames) || Number.isNaN(awayGames)) {
    throw new Error('I game dei set devono essere numeri validi.');
  }

  return {
    set_number: setNumber,
    home_games: homeGames,
    away_games: awayGames
  };
}

function getSetsFromForm(form: MatchFormState): MatchSetInput[] {
  const hasAnySetValue = [
    form.set1Home,
    form.set1Away,
    form.set2Home,
    form.set2Away,
    form.set3Home,
    form.set3Away
  ].some((value) => value.trim().length > 0);

  if (!hasAnySetValue) {
    return [];
  }

  const set1 = parseSetScore(1, form.set1Home, form.set1Away, true);
  const set2 = parseSetScore(2, form.set2Home, form.set2Away, true);
  const set3 = parseSetScore(3, form.set3Home, form.set3Away, false);

  return [set1, set2, set3].filter((set): set is MatchSetInput => set !== null);
}

function matchToForm(match: MatchWithSets | null): MatchFormState {
  if (!match) {
    return emptyMatchForm;
  }

  const sortedSets = [...match.sets].sort((first, second) => first.set_number - second.set_number);
  const getSet = (setNumber: 1 | 2 | 3) =>
    sortedSets.find((set) => set.set_number === setNumber) ?? null;
  const set1 = getSet(1);
  const set2 = getSet(2);
  const set3 = getSet(3);

  return {
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    date: getDatePart(match.scheduled_at),
    time: getTimePart(match.scheduled_at),
    venue: match.venue ?? '',
    status: match.status,
    set1Home: set1?.home_games.toString() ?? '',
    set1Away: set1?.away_games.toString() ?? '',
    set2Home: set2?.home_games.toString() ?? '',
    set2Away: set2?.away_games.toString() ?? '',
    set3Home: set3?.home_games.toString() ?? '',
    set3Away: set3?.away_games.toString() ?? ''
  };
}

export function AdminMatchesRoute() {
  const params = useParams<{ matchId?: string }>();
  const tournamentsQuery = useAdminTournamentsQuery();

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

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [form, setForm] = useState<MatchFormState>(emptyMatchForm);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTournament =
    tournamentOptions.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedSeasonId = selectedTournament?.mainSeasonId ?? null;

  const teamsQuery = useTeamsBySeasonQuery(selectedSeasonId);
  const matchesQuery = useMatchesBySeasonQuery(selectedSeasonId);
  const createMatchMutation = useCreateMatchMutation(selectedSeasonId);
  const updateMatchMutation = useUpdateMatchMutation(selectedSeasonId);
  const deleteMatchMutation = useDeleteMatchMutation(selectedSeasonId);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;

  const isBusy =
    createMatchMutation.isPending ||
    updateMatchMutation.isPending ||
    deleteMatchMutation.isPending;

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
    if (params.matchId) {
      return;
    }

    setSelectedMatchId(null);
    setForm(emptyMatchForm);
    setFormError(null);
  }, [params.matchId, selectedTournamentId]);

  useEffect(() => {
    if (!params.matchId || !matches.some((match) => match.id === params.matchId)) {
      return;
    }

    const match = matches.find((item) => item.id === params.matchId) ?? null;

    if (match) {
      setSelectedMatchId(match.id);
      setForm(matchToForm(match));
      setFormError(null);
    }
  }, [matches, params.matchId]);

  const getTeamName = (teamId: string): string => {
    const team = teams.find((item) => item.id === teamId);
    return team?.name ?? 'Squadra';
  };

  const handleNewMatch = () => {
    setSelectedMatchId(null);
    setForm(emptyMatchForm);
    setFormError(null);
  };

  const handleSelectMatch = (match: MatchWithSets) => {
    setSelectedMatchId(match.id);
    setForm(matchToForm(match));
    setFormError(null);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedSeasonId) {
      setFormError('Seleziona un torneo attivo prima di salvare la partita.');
      return;
    }

    if (form.homeTeamId === form.awayTeamId) {
      setFormError('Una squadra non puo giocare contro se stessa.');
      return;
    }

    if (!isValidHalfHourTime(form.time)) {
      setFormError('Le partite possono iniziare solo a ora intera o alla mezzora.');
      return;
    }

    try {
      const sets = getSetsFromForm(form);

      if (!selectedMatch && sets.length > 0 && (!form.date || !form.time || !form.venue.trim())) {
        setFormError('Se inserisci un risultato, data, ora e luogo sono obbligatori.');
        return;
      }

      const payload = {
        season_id: selectedSeasonId,
        home_team_id: form.homeTeamId,
        away_team_id: form.awayTeamId,
        scheduled_at: getScheduledAt(form.date, form.time),
        venue: form.venue.trim() || null,
        status: form.status,
        sets
      };

      if (selectedMatch) {
        await updateMatchMutation.mutateAsync({ id: selectedMatch.id, ...payload });
        setForm((current) => ({
          ...current,
          status: sets.length > 0 ? 'played' : payload.status
        }));
      } else {
        await createMatchMutation.mutateAsync(payload);
        handleNewMatch();
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!selectedMatch) {
      return;
    }

    setFormError(null);

    try {
      await deleteMatchMutation.mutateAsync(selectedMatch.id);
      handleNewMatch();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Partite</h1>
        </div>
        <button className={styles.button} disabled={!selectedSeasonId} onClick={handleNewMatch} type="button">
          Nuova partita
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
          <p className={styles.muted}>Attiva un torneo prima di creare le partite.</p>
        ) : null}
      </div>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {selectedMatch ? 'Modifica partita' : 'Crea partita'}
          </h2>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Squadra A</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, homeTeamId: event.target.value }));
                  }}
                  required
                  value={form.homeTeamId}
                >
                  <option value="">Seleziona squadra</option>
                  {teams.map((team) => (
                    <option disabled={team.id === form.awayTeamId} key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Squadra B</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, awayTeamId: event.target.value }));
                  }}
                  required
                  value={form.awayTeamId}
                >
                  <option value="">Seleziona squadra</option>
                  {teams.map((team) => (
                    <option disabled={team.id === form.homeTeamId} key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Data</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, date: event.target.value }));
                  }}
                  type="date"
                  value={form.date}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Ora</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, time: event.target.value }));
                  }}
                  value={form.time}
                >
                  <option value="">Seleziona ora</option>
                  {timeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Luogo</span>
                <input
                  className={styles.input}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, venue: event.target.value }));
                  }}
                  value={form.venue}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Stato</span>
                <select
                  className={styles.select}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as MatchStatus
                    }));
                  }}
                  value={form.status}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="played">Played</option>
                  <option value="postponed">Postponed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <div className={styles.resultGrid}>
              <span className={styles.resultLabel}>Set 1</span>
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set1Home: event.target.value }));
                }}
                placeholder="A"
                type="number"
                value={form.set1Home}
              />
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set1Away: event.target.value }));
                }}
                placeholder="B"
                type="number"
                value={form.set1Away}
              />

              <span className={styles.resultLabel}>Set 2</span>
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set2Home: event.target.value }));
                }}
                placeholder="A"
                type="number"
                value={form.set2Home}
              />
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set2Away: event.target.value }));
                }}
                placeholder="B"
                type="number"
                value={form.set2Away}
              />

              <span className={styles.resultLabel}>Set 3</span>
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set3Home: event.target.value }));
                }}
                placeholder="A"
                type="number"
                value={form.set3Home}
              />
              <input
                className={styles.input}
                min={0}
                onChange={(event) => {
                  setForm((current) => ({ ...current, set3Away: event.target.value }));
                }}
                placeholder="B"
                type="number"
                value={form.set3Away}
              />
            </div>

            {formError ? <p className={styles.error}>{formError}</p> : null}

            <div className={styles.actions}>
              <button className={styles.button} disabled={isBusy || !selectedSeasonId} type="submit">
                Salva partita
              </button>
              {selectedMatch ? (
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

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Lista partite</h2>
          {matchesQuery.isLoading ? <p className={styles.muted}>Caricamento...</p> : null}
          {matchesQuery.isError ? (
            <p className={styles.error}>{getErrorMessage(matchesQuery.error)}</p>
          ) : null}
          {!matchesQuery.isLoading && selectedSeasonId && matches.length === 0 ? (
            <p className={styles.muted}>Nessuna partita per questo torneo.</p>
          ) : null}

          <div className={styles.mobileList}>
            {matches.map((match) => (
              <button
                className={cx(styles.matchCard, match.id === selectedMatchId && styles.matchCardActive)}
                key={match.id}
                onClick={() => {
                  handleSelectMatch(match);
                }}
                type="button"
              >
                <strong>
                  {getTeamName(match.home_team_id)} vs {getTeamName(match.away_team_id)}
                </strong>
                <span>{formatDateTime(match.scheduled_at)}</span>
                <span>
                  {match.status} · {getScoreLabel(match)} · {getSetsLabel(match)}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Partita</th>
                  <th>Luogo</th>
                  <th>Stato</th>
                  <th>Risultato</th>
                  <th>Set</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr
                    className={match.id === selectedMatchId ? styles.tableRowActive : undefined}
                    key={match.id}
                    onClick={() => {
                      handleSelectMatch(match);
                    }}
                  >
                    <td>{formatDateTime(match.scheduled_at)}</td>
                    <td>
                      {getTeamName(match.home_team_id)} vs {getTeamName(match.away_team_id)}
                    </td>
                    <td>{match.venue ?? '-'}</td>
                    <td>{match.status}</td>
                    <td>{getScoreLabel(match)}</td>
                    <td>{getSetsLabel(match)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
