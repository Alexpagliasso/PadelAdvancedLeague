# PAD V2 - Tornei Configurabili

## Obiettivo

Introdurre formule torneo configurabili senza rompere i tornei V1 esistenti.

La V2 deve continuare a nascondere `seasons` nella UI. Internamente, per compatibilita, il frontend puo continuare a usare la season `main` finche non verra completata una migrazione piu ampia verso `tournament_id` diretto su `teams` e `matches`.

## Stato Attuale

### Database

Il modello V1 contiene:

- `tournaments`
- `seasons`
- `season_settings`
- `teams.season_id`
- `team_members.season_id`
- `matches.season_id`
- `matches.phase` gia compatibile con:
  - `regular_season`
  - `playoff`
  - `playout`
- `match_sets`

Mancano invece:

- formula torneo;
- numero partecipanti previsto;
- fase corrente torneo;
- configurazione bye;
- configurazione playoff/playout direttamente sul torneo;
- modello persistente del tabellone;
- collegamento tra match di tabellone e avanzamento vincitori.

### Frontend

Le aree principali coinvolte saranno:

- `src/features/tournaments/api/tournamentsApi.ts`
- `src/features/tournaments/routes/AdminTournamentsRoute.tsx`
- `src/features/matches/api/matchesApi.ts`
- `src/features/matches/api/matchesQueries.ts`
- `src/features/matches/routes/AdminCalendarRoute.tsx`
- `src/features/matches/routes/AdminMatchesRoute.tsx`
- `src/features/public/api/publicTournamentApi.ts`
- `src/features/public/routes/PublicTournamentRoute.tsx`
- `src/features/standings/lib/standingsEngine.ts`
- `src/lib/supabase/types.ts`

## Decisione Tecnica

### Formule

Introdurre enum `tournament_format`:

- `round_robin`
- `knockout`
- `group_playoff_playout`

### Fasi

Introdurre enum `competition_phase`:

- `setup`
- `regular_season`
- `knockout`
- `completed`

Nota: `matches.phase` resta invariato e continua a indicare la fase della singola partita.

### Campi su `tournaments`

Aggiungere:

- `expected_teams_count integer`
- `format public.tournament_format`
- `current_phase public.competition_phase`
- `allow_byes boolean`
- `playoff_teams_count integer`
- `playout_teams_count integer`
- `regular_calendar_generated_at timestamptz`
- `knockout_generated_at timestamptz`
- `playoff_generated_at timestamptz`
- `playout_generated_at timestamptz`

Motivo:

- le impostazioni V2 appartengono al torneo;
- non reintroduciamo `seasons` in UI;
- i tornei V1 restano validi con default compatibili.

### Tabelle Tabellone

Introdurre:

#### `tournament_brackets`

Un bracket per torneo/fase:

- knockout diretto;
- playoff;
- playout.

Campi principali:

- `tournament_id`
- `bracket_type`
- `name`
- `status`
- `generated_at`

#### `tournament_bracket_matches`

Righe logiche del tabellone:

- round;
- posizione;
- seed;
- team home/away nullable per supportare placeholder/bye;
- `match_id` nullable;
- `winner_team_id` nullable;
- link al prossimo slot del tabellone.

Motivo:

- una partita reale in `matches` richiede due squadre;
- un bye o un match futuro non puo sempre diventare subito una riga `matches`;
- il tabellone deve poter rappresentare avanzamenti non ancora risolti.

## Compatibilita V1

Default per tornei esistenti:

- `format = round_robin`
- `expected_teams_count = numero squadre attuali del torneo, fallback 2`
- `current_phase = setup` se non ci sono match
- `current_phase = regular_season` se ci sono match non tutti completati
- `current_phase = completed` se tutte le partite esistenti sono ufficiali/giocate
- `allow_byes = true`
- playoff/playout null

La migration non elimina:

- `seasons`
- `season_settings`
- `season_id`
- `gallery`

## Validazioni

### Database

Constraint minime:

- `expected_teams_count >= 2`
- `playoff_teams_count > 1` se valorizzato
- `playout_teams_count > 1` se valorizzato
- playoff <= partecipanti
- playout <= partecipanti
- playoff + playout <= partecipanti
- `round_robin` non deve avere playoff/playout valorizzati
- `knockout` non deve avere playoff/playout valorizzati
- `group_playoff_playout` deve avere almeno playoff o playout valorizzato

### Frontend

Validazioni UX:

- non cambiare formula se esistono match, salvo futuro reset esplicito;
- knockout con numero non potenza di 2 richiede `allow_byes = true`;
- playoff/playout generabili solo quando la fase a gironi e completata.

## Generazione Calendario

### Round Robin

Resta il comportamento V1:

- ogni coppia si affronta una volta;
- generazione una sola volta;
- match non eliminabili;
- risultato azzerabile.

In V2:

- impostare `tournaments.regular_calendar_generated_at`;
- impostare `current_phase = regular_season`;
- creare `matches.phase = regular_season`.

### Knockout

Nuova logica pura testabile:

- `isPowerOfTwo(value)`
- `nextPowerOfTwo(value)`
- `calculateByeCount(teamCount)`
- `seedTeamsForBracket(teams)`
- `pairSeedsHighLow(seeds)`
- `generateBracketRounds(seeds, allowByes)`

Regole:

- seed ordinati da classifica o manualmente;
- primo contro ultimo, secondo contro penultimo;
- se non potenza di 2 e bye abilitati, i seed piu alti ricevono bye;
- creare `tournament_brackets`;
- creare `tournament_bracket_matches`;
- creare `matches` solo quando entrambe le squadre sono note.

### Playoff / Playout

Quando tutte le partite regular season sono ufficiali:

- calcolare classifica finale;
- playoff prende le prime N;
- playout prende le ultime N;
- accoppiamenti high-low dentro il blocco.

Esempi:

- playoff 8: `1 vs 8`, `2 vs 7`, `3 vs 6`, `4 vs 5`
- playout 4: `9 vs 12`, `10 vs 11`

## UI Admin

### Tornei

Nel form crea/modifica:

- numero partecipanti;
- formula radio:
  - Girone all'italiana;
  - Eliminazione diretta;
  - Girone + playoff/playout;
- campi dinamici:
  - bye automatici;
  - squadre playoff;
  - squadre playout.

Blocchi:

- se calendario/tabellone gia generato, formula disabilitata;
- mostra messaggio: `La formula non puo essere modificata dopo la generazione del calendario.`

### Calendario / Tabellone

Aggiungere sezione admin:

- Formula torneo;
- Fase corrente;
- Genera calendario;
- Genera playoff/playout;
- Visualizza tabellone.

Vista tabellone:

- mobile: lista round e match;
- desktop: bracket visuale semplice a colonne.

## UI Pubblica

Tab pubblici:

- sempre:
  - Classifica;
  - Squadre;
  - Calendario;
  - Risultati.
- solo se esistono dati:
  - Playoff;
  - Playout.

Per knockout puro:

- mostra tab `Tabellone` o `Playoff` in base alla label scelta in UI.

## API / React Query

Nuove API:

- `updateTournamentCompetitionSettings`
- `generateKnockoutBracket`
- `generatePlayoffPlayoutBrackets`
- `listTournamentBrackets`
- `listBracketMatches`
- `advanceBracketWinner`

Query keys:

- `tournamentBrackets.byTournament(tournamentId)`
- `tournamentBrackets.detail(bracketId)`

## Test

Unit test consigliati sulle funzioni pure:

- solo girone;
- knockout 8;
- knockout 10 con bye;
- knockout 10 senza bye deve fallire;
- girone + playoff 8;
- girone + playoff 8 + playout 4;
- playoff + playout > partecipanti deve fallire;
- generazione playoff solo con regular season completata;
- impossibilita di rigenerare calendario/tabellone.

## Sequenza Implementativa

1. Applicare migration Supabase V2.
2. Aggiornare `src/lib/supabase/types.ts`.
3. Estendere API tornei.
4. Estendere form admin tornei.
5. Estrarre helpers puri per bracket.
6. Aggiornare generazione calendario:
   - round robin;
   - knockout;
   - playoff/playout.
7. Aggiungere UI tabellone admin.
8. Aggiungere tab pubblici playoff/playout condizionali.
9. Test manuali e build.

## Rischi

- Il modello V1 usa ancora `season_id`: evitare refactor simultaneo a `tournament_id`.
- I bye non sono match reali: serve tabella bracket separata.
- Cambiare formula dopo partite create puo corrompere dati: bloccare in UI e validare lato API.
- RLS deve includere le nuove tabelle bracket prima di usarle in pubblico.

