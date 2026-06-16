# Migrazione V1 - Rimozione Seasons e Gallery

## Stato

Documento di analisi e piano.  
Non contiene SQL eseguibile definitivo.  
Non modifica database, frontend o RLS.

## Decisione Architetturale

Per la V1, PAD deve usare un modello più semplice:

- un `tournament` rappresenta direttamente una competizione;
- non esiste multi-stagione nel frontend;
- `teams` appartengono direttamente a un torneo;
- `matches` appartengono direttamente a un torneo;
- la classifica è calcolata per torneo;
- il calendario è generato per torneo;
- la Gallery viene rimossa completamente dall'app.

Le tabelle `seasons` e `season_settings` non devono essere eliminate subito. Devono prima essere rese non necessarie al frontend e sostituite da relazioni dirette a `tournaments`.

## Dipendenze Attuali

### Frontend - Gallery

La Gallery è poco integrata nel frontend:

- `src/app/router/paths.ts`
  - `adminGallery`
- `src/app/router/router.tsx`
  - route `/admin/gallery`
  - placeholder `AdminPlaceholderRoute title="Gallery"`
- `src/features/admin/layout/AdminLayout.tsx`
  - voce sidebar `Gallery`
  - icona Gallery
  - title `PAD | Gallery`

Non risultano moduli CRUD Gallery reali nel frontend.

### Frontend - Seasons

Il concetto di season è invece ancora centrale nel data layer:

- `src/features/tournaments/api/tournamentsApi.ts`
  - tipi `Season`, `SeasonSettings`, `TournamentWithSeasons`
  - creazione automatica della season `main`
  - funzioni `listSeasonsByTournament`, `createSeason`, `updateSeason`
  - funzioni `getSeasonSettings`, `ensureSeasonSettings`, `updateSeasonSettings`
- `src/features/tournaments/api/tournamentsQueries.ts`
  - query key `seasons`
  - query key `settings`
  - hook season/settings
- `src/features/tournaments/routes/AdminTournamentsRoute.tsx`
  - cerca la season `main`
  - usa `selectedMainSeasonId`
  - statistiche torneo via matches/teams filtrati per season
  - creazione rapida squadra dentro la season `main`
- `src/features/teams/api/teamsApi.ts`
  - `SaveTeamInput.season_id`
  - `listTeamsBySeason`
  - vincolo applicativo player una sola squadra per season
  - insert/update `team_members.season_id`
- `src/features/teams/api/teamsQueries.ts`
  - query key `by-season`
  - hook `useTeamsBySeasonQuery`
- `src/features/teams/routes/AdminTeamsRoute.tsx`
  - seleziona torneo ma ricava `mainSeasonId`
  - lista/crea/modifica squadre via `selectedSeasonId`
  - player picker calcola assegnazioni dalla lista team della season
- `src/features/matches/api/matchesApi.ts`
  - `SaveMatchInput.season_id`
  - `listMatchesBySeason`
  - `generateRoundRobinCalendar(seasonId, teamIds)`
  - insert/update `matches.season_id`
- `src/features/matches/api/matchesQueries.ts`
  - query key `by-season`
  - mutation invalidate per season
- `src/features/matches/routes/AdminMatchesRoute.tsx`
  - seleziona torneo ma ricava `mainSeasonId`
  - route edit match usa `match.season_id` per ritrovare il torneo
- `src/features/matches/routes/AdminCalendarRoute.tsx`
  - seleziona torneo ma ricava `mainSeasonId`
  - calendario generato via season
- `src/features/standings/routes/AdminStandingsRoute.tsx`
  - classifica filtrata per `selectedSeasonId`
- `src/features/public/api/publicTournamentApi.ts`
  - recupera `seasons.slug = 'main'`
  - `PublicTournamentData` contiene `season`
  - squadre, membri e partite filtrati per `season_id`
- `src/features/public/routes/PublicTournamentRoute.tsx`
  - passa `data.season.id`
  - filtra match accordion per `season_id`
- `src/features/admin/routes/AdminDashboardRoute.tsx`
  - riusa `usePublicTournamentQuery`, quindi dipende indirettamente dalla season `main`
- `src/features/matches/lib/matchStatus.ts`
  - deduplica fixture usando `season_id`
- `src/lib/supabase/types.ts`
  - tipi generati/allineati allo schema attuale, ancora con seasons/gallery

### Database

Schema attuale:

- `tournaments`
- `seasons`
- `season_settings`
- `teams.season_id`
- `team_members.season_id`
- `matches.season_id`
- `gallery_albums`
- `gallery_photos`

Vincoli attuali legati a `season_id`:

- `teams_season_slug_unique`
- `teams_season_name_unique`
- `teams_id_season_id_unique`
- `team_members_team_season_fk`
- `team_members_one_player_per_season`
- `matches_home_team_season_fk`
- `matches_away_team_season_fk`
- indici `teams_season_id_idx`, `team_members_season_id_idx`, `matches_season_*`

RLS attuale:

- funzioni `is_public_season`, `is_public_album`
- policy su `seasons`
- policy su `season_settings`
- policy teams/team_members/matches/match_sets basate su `is_public_season`
- policy Gallery complete su `gallery_albums` e `gallery_photos`

## Piano di Migrazione Database

### Fase 0 - Backup e Verifica

Prima di ogni migrazione:

- esportare backup Supabase;
- contare record in `tournaments`, `seasons`, `teams`, `team_members`, `matches`, `gallery_albums`, `gallery_photos`;
- verificare se esistono tornei con più di una season reale;
- verificare se esistono season non `main` con dati;
- verificare duplicati potenziali per `(tournament_id, slug)` e `(tournament_id, name)` quando i team verranno spostati da season a tournament.

### Fase 1 - Aggiunta Colonne Dirette

Aggiungere colonne senza rimuovere nulla:

- `teams.tournament_id uuid null references tournaments(id)`
- `team_members.tournament_id uuid null references tournaments(id)`
- `matches.tournament_id uuid null references tournaments(id)`

Motivo: mantenere compatibilità con i dati esistenti e permettere una migrazione progressiva.

### Fase 2 - Backfill Dati

Popolare i nuovi campi dai dati esistenti:

- `teams.tournament_id = seasons.tournament_id` tramite `teams.season_id`
- `team_members.tournament_id = seasons.tournament_id` tramite `team_members.season_id`
- `matches.tournament_id = seasons.tournament_id` tramite `matches.season_id`

Verifiche dopo backfill:

- nessun `teams.tournament_id` nullo;
- nessun `team_members.tournament_id` nullo;
- nessun `matches.tournament_id` nullo;
- ogni `match.home_team_id` e `match.away_team_id` appartiene allo stesso `tournament_id` della partita;
- ogni `team_member.team_id` appartiene allo stesso `tournament_id` della membership.

### Fase 3 - Nuovi Indici e Vincoli Affiancati

Aggiungere indici e vincoli basati su torneo, mantenendo quelli basati su season:

- index `teams_tournament_id_idx`
- unique `teams_tournament_slug_unique`
- unique `teams_tournament_name_unique`
- unique `teams_id_tournament_id_unique`
- index `team_members_tournament_id_idx`
- unique `team_members_one_player_per_tournament`
- foreign key composita `team_members(team_id, tournament_id) -> teams(id, tournament_id)`
- index `matches_tournament_id_idx`
- index `matches_tournament_phase_idx`
- index `matches_tournament_status_idx`
- index `matches_tournament_phase_result_status_idx`
- foreign key composita `matches(home_team_id, tournament_id) -> teams(id, tournament_id)`
- foreign key composita `matches(away_team_id, tournament_id) -> teams(id, tournament_id)`

Nota: la FK composita richiede prima una unique su `teams(id, tournament_id)`.

### Fase 4 - Aggiornamento RLS

Aggiornare RLS in modo compatibile:

- introdurre helper `is_public_tournament(tournament_uuid uuid)` come fonte principale;
- mantenere temporaneamente `is_public_season` solo per compatibilità;
- modificare policy di `teams`, `team_members`, `matches`, `match_sets` per usare `tournament_id`;
- rimuovere policy Gallery solo nella fase di drop Gallery.

### Fase 5 - Frontend su Tournament

Dopo che `tournament_id` è disponibile:

- sostituire query by season con query by tournament;
- rinominare hook e API:
  - `listTeamsBySeason` -> `listTeamsByTournament`
  - `useTeamsBySeasonQuery` -> `useTeamsByTournamentQuery`
  - `listMatchesBySeason` -> `listMatchesByTournament`
  - `useMatchesBySeasonQuery` -> `useMatchesByTournamentQuery`
  - `generateRoundRobinCalendar(seasonId)` -> `generateRoundRobinCalendar(tournamentId)`
- rimuovere `mainSeasonId` dal frontend;
- rimuovere `selectedSeasonId` dai componenti;
- rimuovere `PublicTournamentData.season`;
- cambiare deduplica fixture da `season_id` a `tournament_id`;
- cambiare player picker da assegnazione per season ad assegnazione per tournament.

### Fase 6 - Rendere Non Null i Nuovi Campi

Solo dopo deploy frontend e verifica:

- rendere `teams.tournament_id not null`;
- rendere `team_members.tournament_id not null`;
- rendere `matches.tournament_id not null`.

### Fase 7 - Rimozione Season dal Modello Attivo

Solo dopo almeno un ciclo di verifica:

- rimuovere vincoli applicativi e RLS basati su `season_id`;
- valutare rimozione colonne:
  - `teams.season_id`
  - `team_members.season_id`
  - `matches.season_id`
- valutare drop tabelle:
  - `season_settings`
  - `seasons`
- rimuovere enum `season_status` solo se non usato altrove.

Questa fase deve essere separata dalla fase di introduzione `tournament_id`.

### Fase 8 - Rimozione Gallery

Prima del drop:

- verificare se `gallery_albums` contiene dati;
- verificare se `gallery_photos` contiene dati;
- decidere se esportare immagini e metadata.

Poi:

- rimuovere route/link frontend Gallery;
- rimuovere policy RLS Gallery;
- droppare `gallery_photos`;
- droppare `gallery_albums`;
- rimuovere eventuali indici e trigger associati.

## File Frontend da Modificare

### Routing e Layout

- `src/app/router/paths.ts`
  - rimuovere `adminGallery`
  - valutare se mantenere `adminSettings`
- `src/app/router/router.tsx`
  - rimuovere route `/admin/gallery`
  - rimuovere import/uso placeholder Gallery
- `src/features/admin/layout/AdminLayout.tsx`
  - rimuovere voce Gallery
  - rimuovere title `PAD | Gallery`
  - rimuovere icona Gallery importata se non più usata

### Tournaments

- `src/features/tournaments/api/tournamentsApi.ts`
  - rimuovere dipendenza runtime da `seasons`
  - eliminare creazione automatica `main`
  - rimuovere API season/settings dal frontend V1
  - esporre tornei come competizioni dirette
- `src/features/tournaments/api/tournamentsQueries.ts`
  - rimuovere hook season/settings
  - semplificare query keys
- `src/features/tournaments/routes/AdminTournamentsRoute.tsx`
  - rimuovere `selectedMainSeasonId`
  - statistiche via `tournament_id`
  - quick team creation via tournament

### Teams

- `src/features/teams/api/teamsApi.ts`
  - sostituire `season_id` con `tournament_id`
  - rinominare funzioni by tournament
  - validazione player unico per torneo
  - insert/update `team_members.tournament_id`
- `src/features/teams/api/teamsQueries.ts`
  - query key by tournament
  - invalidate by tournament
- `src/features/teams/routes/AdminTeamsRoute.tsx`
  - rimuovere `mainSeasonId` e `selectedSeasonId`
  - usare `selectedTournamentId`
  - player picker controlla assegnazioni per torneo

### Matches e Calendario

- `src/features/matches/api/matchesApi.ts`
  - sostituire `SaveMatchInput.season_id` con `tournament_id`
  - query by tournament
  - generation calendario per torneo
  - FK logica team/tournament
- `src/features/matches/api/matchesQueries.ts`
  - query key by tournament
  - invalidate by tournament
- `src/features/matches/routes/AdminMatchesRoute.tsx`
  - rimuovere `mainSeasonId`
  - edit match risale al torneo da `match.tournament_id`
- `src/features/matches/routes/AdminCalendarRoute.tsx`
  - generazione calendario per torneo
  - lista match per torneo
- `src/features/matches/lib/matchStatus.ts`
  - deduplica fixture su `tournament_id`

### Standings

- `src/features/standings/routes/AdminStandingsRoute.tsx`
  - squadre e match by tournament
- `src/features/standings/lib/standingsEngine.ts`
  - probabilmente invariato, se riceve già array filtrati

### Public

- `src/features/public/api/publicTournamentApi.ts`
  - rimuovere `PublicSeason`
  - non chiamare `getMainSeason`
  - team/members/matches filtrati per `tournament_id`
- `src/features/public/api/publicTournamentQueries.ts`
  - probabilmente invariato nelle chiavi, ma cambia payload
- `src/features/public/routes/PublicTournamentRoute.tsx`
  - rimuovere `data.season`
  - accordion filtra per `tournament_id`
  - home pubblica resta selezione torneo diretta
- `src/features/admin/routes/AdminDashboardRoute.tsx`
  - beneficia del nuovo `PublicTournamentData` senza season

### Tipi Supabase

- `src/lib/supabase/types.ts`
  - aggiornare dopo migrazione schema.

## Rischi

### Dati Esistenti

Se un torneo ha più season con squadre o match, spostare tutto su `tournament_id` può creare conflitti:

- due team con stesso slug in season diverse dello stesso torneo;
- due team con stesso nome in season diverse dello stesso torneo;
- stesso player in due team di season diverse, ora diventerebbe conflitto nello stesso torneo;
- match duplicati tra stesse squadre.

Mitigazione:

- audit preliminare;
- migrazione in due fasi;
- non rendere subito `tournament_id not null`;
- non droppare subito `season_id`.

### RLS

Le policy pubbliche oggi usano `is_public_season`. Se si cambia il frontend prima delle policy, la vista pubblica può smettere di leggere dati.

Mitigazione:

- aggiungere policy tournament-based prima del deploy frontend;
- mantenere policy legacy finché `season_id` esiste.

### Team Members

Il vincolo "un giocatore può appartenere a una sola squadra" cambia semanticamente:

- prima: una sola squadra per season;
- dopo: una sola squadra per torneo.

Mitigazione:

- verificare conflitti prima di creare unique su `(tournament_id, player_id)`;
- mostrare report dei conflitti.

### Calendario

La generazione calendario attuale blocca se esiste qualsiasi match nella season. Dopo la migrazione dovrà bloccare se esiste qualsiasi match nel torneo.

Mitigazione:

- controllare duplicati per coppia team nello stesso torneo;
- mantenere il blocco "calendario già generato".

### Match Edit

La route edit match oggi usa `match.season_id` per selezionare il torneo. Dovrà usare `match.tournament_id`.

Mitigazione:

- introdurre `tournament_id` su match prima del refactor frontend.

### Gallery

Anche se non esiste UI reale, le tabelle potrebbero contenere dati caricati manualmente.

Mitigazione:

- audit conteggi;
- export opzionale;
- drop solo dopo conferma.

### Tipi TypeScript

La rimozione o aggiunta di colonne richiede riallineamento manuale di `src/lib/supabase/types.ts` se non viene rigenerato automaticamente.

Mitigazione:

- aggiornare tipi nello stesso commit della migrazione frontend;
- build TypeScript obbligatoria.

## Sequenza Consigliata

1. Approvare questo piano.
2. Creare migration Supabase fase 1-4:
   - aggiunta `tournament_id`;
   - backfill;
   - indici/vincoli affiancati;
   - RLS compatibile.
3. Aggiornare tipi Supabase.
4. Refactor frontend da season a tournament.
5. Rimuovere link e route Gallery frontend.
6. Test end-to-end:
   - crea torneo;
   - crea giocatori;
   - crea squadre;
   - genera calendario;
   - inserisci risultato;
   - verifica classifica;
   - verifica home pubblica.
7. Dopo verifica dati reali, pianificare migration fase 6-8:
   - `tournament_id not null`;
   - rimozione season dal modello;
   - drop Gallery.

## Decisioni Da Confermare

- Mantenere `team_members.tournament_id` come duplicazione intenzionale per vincoli e query?
- Rimuovere davvero `season_settings` o spostare playoff/playout settings su `tournaments`?
- Il vincolo player unico deve essere per torneo, non più per season?
- Gallery deve essere eliminata anche dal database o solo dal frontend nella prima fase?
- Tenere `/admin/settings` come placeholder oppure rimuoverla insieme a Gallery?
