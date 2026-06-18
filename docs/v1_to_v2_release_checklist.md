# PAD V2 - Checklist Migrazione DB V1 Reale -> V2

## Scopo

Audit tecnico delle migration V2 da applicare al database V1 reale senza perdita dati.

Migration analizzate:

- `supabase/v2_configurable_tournaments.sql`
- `supabase/v2_match_ordering_matchday.sql`
- `supabase/v2_ranking_config.sql`

Non risultano altre migration V2 nel repository.

## Esito Sintetico

La migrazione V2 e complessivamente additiva e compatibile con i dati V1, a condizione di rispettare l'ordine indicato e di verificare che sul DB V1 siano gia presenti le funzioni usate dalle policy RLS:

- `public.set_updated_at()`
- `public.is_public_tournament(uuid)`
- `public.is_admin()`
- `public.is_super_admin()`

Il rischio principale non e perdita dati, ma blocco applicazione/migration se il DB V1 reale non e allineato a `supabase/rls.sql` aggiornato, in particolare per `is_public_tournament`.

## Ordine Esatto Migration

1. Backup completo DB Supabase V1.
2. Eseguire query pre-migrazione sotto.
3. Verificare che `public.is_public_tournament(uuid)` esista.
4. Applicare `supabase/v2_configurable_tournaments.sql`.
5. Applicare `supabase/v2_match_ordering_matchday.sql`.
6. Applicare `supabase/v2_ranking_config.sql`.
7. Eseguire query post-migrazione sotto.
8. Deploy frontend V2 solo dopo esito post-check positivo.

Nota: `v2_match_ordering_matchday.sql` deve essere applicata dopo `v2_configurable_tournaments.sql` perche contiene un update che legge `public.tournament_bracket_matches`.

## Audit Migration

### `v2_configurable_tournaments.sql`

1. Sicura / Non sicura: Sicura con prerequisiti RLS/funzioni presenti.
2. Additiva / Distruttiva: Additiva.
3. Richiede backfill: Si.
4. Idempotente: Quasi completamente. Usa `create type` con `duplicate_object`, `add column if not exists`, `create table if not exists`, `drop policy if exists`. Da rieseguire con cautela perche ricrea trigger/policy.
5. Rischio perdita dati: Basso. Non droppa tabelle o dati V1.
6. Rischio blocco applicazione: Medio se mancano funzioni RLS o se constraint esistenti/dati inattesi non consentono `expected_teams_count not null`.

Backfill:

- `expected_teams_count`: numero squadre per torneo, fallback 2.
- `format`: default `round_robin`.
- `current_phase`: `setup` se non ci sono match, `completed` se tutti i match sono `played + official`, altrimenti `regular_season`.
- `allow_byes`: default `true`.
- `regular_calendar_generated_at`: primo `created_at` match se il torneo ha match.
- playoff/playout: restano `null`.
- bracket: tabelle nuove vuote.

Compatibilita V1:

- Tornei V1 diventano `round_robin`.
- Squadre/team_members/matches esistenti restano invariati.
- Risultati esistenti restano invariati.
- Playoff/playout assenti restano opzionali.

Punti attenzione:

- Le policy bracket usano `public.is_public_tournament(tournament_id)`. Se la funzione non esiste sul DB V1 reale, la migration fallisce.
- La constraint `tournaments_format_settings_valid` e compatibile con i default V1 perche `format = round_robin` e playoff/playout sono null.
- Il blocco `alter column expected_teams_count set not null` cattura errori e stampa notice: se fallisse, il DB potrebbe restare con colonna nullable mentre `types.ts` la considera non-null. Il post-check deve verificarlo.

### `v2_match_ordering_matchday.sql`

1. Sicura / Non sicura: Sicura se eseguita dopo `v2_configurable_tournaments.sql`.
2. Additiva / Distruttiva: Additiva.
3. Richiede backfill: Si.
4. Idempotente: Si per colonne/indici e backfill conservativo. Attenzione: su rerun puo riallineare `matchday` dei match playoff/playout dal bracket.
5. Rischio perdita dati: Basso. Non modifica risultati, squadre, set, calendario logico o accoppiamenti.
6. Rischio blocco applicazione: Basso/Medio se eseguita prima della creazione di `tournament_bracket_matches`.

Backfill:

- `display_order`: ordine stabile per `season_id` basato su `scheduled_at`, `phase`, `created_at`, `id`.
- `matchday`: ordine sequenziale per `season_id + phase`.
- Per match collegati a bracket, usa `tournament_bracket_matches.round_number`.

Compatibilita V1:

- I match V1 esistenti ricevono `matchday` e `display_order`.
- I risultati gia giocati non vengono modificati.
- La classifica non cambia.

Punti attenzione:

- Per calendari V1 storici senza `matchday`, il backfill assegna una giornata per ogni posizione sequenziale nella fase. E sicuro, ma non necessariamente uguale a una giornata sportiva reale.
- La migration non richiede RLS.

### `v2_ranking_config.sql`

1. Sicura / Non sicura: Sicura.
2. Additiva / Distruttiva: Additiva.
3. Richiede backfill: No per dati V1. Default `use_ranking = false`, `teams.ranking = null`.
4. Idempotente: Si.
5. Rischio perdita dati: Basso. Non modifica squadre esistenti salvo aggiunta colonna nullable.
6. Rischio blocco applicazione: Basso.

Backfill:

- `tournaments.use_ranking`: default `false`, non null.
- `teams.ranking`: `null` per tutte le squadre esistenti.

Compatibilita V1:

- Nessun torneo V1 richiede ranking dopo la migrazione.
- La unique parziale `(season_id, ranking) where ranking is not null` non impatta i record V1 perche `ranking` resta null.

Punti attenzione:

- La V2 frontend usa `use_ranking` e `teams.ranking`; questa migration deve essere applicata prima del deploy.

## Query SQL Prima Della Migrazione

### 1. Conteggi base

```sql
select 'tournaments' as table_name, count(*) from public.tournaments
union all select 'seasons', count(*) from public.seasons
union all select 'teams', count(*) from public.teams
union all select 'players', count(*) from public.players
union all select 'team_members', count(*) from public.team_members
union all select 'matches', count(*) from public.matches
union all select 'match_sets', count(*) from public.match_sets
union all select 'gallery_albums', count(*) from public.gallery_albums
union all select 'gallery_photos', count(*) from public.gallery_photos;
```

### 2. Funzioni prerequisito

```sql
select
  proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'set_updated_at',
    'is_public_tournament',
    'is_admin',
    'is_super_admin'
  )
order by proname;
```

Atteso: tutte e quattro presenti. Se `is_public_tournament` manca, aggiornare prima `supabase/rls.sql` o introdurre solo quella funzione in modo controllato.

### 3. Tornei senza season

```sql
select t.id, t.name
from public.tournaments t
left join public.seasons s on s.tournament_id = t.id
where s.id is null;
```

Atteso: zero righe. Se ci sono righe, la migration mette `expected_teams_count = 2`; e sicuro ma va confermato.

### 4. Tornei con piu season

```sql
select
  t.id,
  t.name,
  count(s.id) as seasons_count
from public.tournaments t
join public.seasons s on s.tournament_id = t.id
group by t.id, t.name
having count(s.id) > 1
order by seasons_count desc;
```

Atteso V1: idealmente zero o solo casi noti. La migration conta squadre/match su tutte le season del torneo.

### 5. Stato match esistenti

```sql
select
  s.tournament_id,
  t.name,
  count(m.id) as matches_count,
  count(m.id) filter (where m.status = 'played' and m.result_status = 'official') as official_played_count,
  count(m.id) filter (where m.status = 'played' and m.result_status <> 'official') as played_not_official_count,
  count(m.id) filter (where m.result_status = 'official' and m.status <> 'played') as official_not_played_count
from public.tournaments t
join public.seasons s on s.tournament_id = t.id
left join public.matches m on m.season_id = s.id
group by s.tournament_id, t.name
order by t.name;
```

Serve per prevedere `current_phase`. I match `official_not_played` o `played_not_official` possono far risultare il torneo non `completed`.

### 6. Integrita team_members

```sql
select tm.*
from public.team_members tm
left join public.teams t on t.id = tm.team_id
where t.id is null
   or t.season_id <> tm.season_id;
```

Atteso: zero righe.

### 7. Integrita match/team

```sql
select m.id, m.season_id, m.home_team_id, ht.season_id as home_season_id, m.away_team_id, at.season_id as away_season_id
from public.matches m
left join public.teams ht on ht.id = m.home_team_id
left join public.teams at on at.id = m.away_team_id
where ht.id is null
   or at.id is null
   or ht.season_id <> m.season_id
   or at.season_id <> m.season_id;
```

Atteso: zero righe.

### 8. Colonne V2 gia presenti accidentalmente

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'tournaments' and column_name in (
      'expected_teams_count',
      'format',
      'current_phase',
      'allow_byes',
      'use_ranking',
      'playoff_teams_count',
      'playout_teams_count',
      'regular_calendar_generated_at',
      'knockout_generated_at',
      'playoff_generated_at',
      'playout_generated_at'
    ))
    or (table_name = 'teams' and column_name = 'ranking')
    or (table_name = 'matches' and column_name in ('matchday', 'display_order'))
  )
order by table_name, column_name;
```

Atteso su V1 puro: zero righe.

## Query SQL Dopo La Migrazione

### 1. Conteggi invariati

Ripetere la query conteggi base e confrontarla con il pre-check. Le tabelle V1 devono avere gli stessi conteggi, salvo eventuali trigger esterni non previsti.

### 2. Colonne e null critici

```sql
select
  count(*) filter (where expected_teams_count is null) as tournaments_expected_null,
  count(*) filter (where format is null) as tournaments_format_null,
  count(*) filter (where current_phase is null) as tournaments_phase_null,
  count(*) filter (where allow_byes is null) as tournaments_allow_byes_null,
  count(*) filter (where use_ranking is null) as tournaments_use_ranking_null
from public.tournaments;
```

Atteso: tutti zero.

### 3. Default V1 compatibili

```sql
select
  format,
  current_phase,
  allow_byes,
  use_ranking,
  count(*)
from public.tournaments
group by format, current_phase, allow_byes, use_ranking
order by count(*) desc;
```

Atteso per dati V1: `format = round_robin`, `allow_byes = true`, `use_ranking = false`; `current_phase` variabile.

### 4. `expected_teams_count` coerente con squadre

```sql
select
  t.id,
  t.name,
  t.expected_teams_count,
  greatest(coalesce(count(distinct tm.id), 0), 2) as expected_from_v1
from public.tournaments t
left join public.seasons s on s.tournament_id = t.id
left join public.teams tm on tm.season_id = s.id
group by t.id, t.name, t.expected_teams_count
having t.expected_teams_count <> greatest(coalesce(count(distinct tm.id), 0), 2);
```

Atteso: zero righe, salvo tornei senza season o dati particolari gia noti.

### 5. Matchday/display_order valorizzati

```sql
select
  count(*) filter (where matchday is null) as matches_matchday_null,
  count(*) filter (where display_order is null) as matches_display_order_null,
  count(*) as matches_total
from public.matches;
```

Atteso: zero null se esiste almeno un match, salvo match inseriti dopo la migration senza valorizzazione.

### 6. Nessun risultato alterato

Eseguire prima e dopo, confrontando aggregati:

```sql
select
  count(*) as matches_count,
  sum(home_sets_won) as home_sets_sum,
  sum(away_sets_won) as away_sets_sum,
  count(*) filter (where status = 'played') as played_count,
  count(*) filter (where result_status = 'official') as official_count
from public.matches;

select
  count(*) as sets_count,
  sum(home_games) as home_games_sum,
  sum(away_games) as away_games_sum
from public.match_sets;
```

Atteso: valori invariati.

### 7. Tabelle bracket vuote su V1

```sql
select 'tournament_brackets' as table_name, count(*) from public.tournament_brackets
union all
select 'tournament_bracket_matches', count(*) from public.tournament_bracket_matches;
```

Atteso dopo migrazione V1: zero righe, finche non vengono generati tabelloni V2.

### 8. Ranking default

```sql
select
  count(*) filter (where use_ranking = true) as tournaments_with_ranking,
  count(*) filter (where use_ranking = false) as tournaments_without_ranking
from public.tournaments;

select
  count(*) filter (where ranking is not null) as teams_with_ranking,
  count(*) filter (where ranking is null) as teams_without_ranking
from public.teams;
```

Atteso per V1: `tournaments_with_ranking = 0`, `teams_with_ranking = 0`.

### 9. RLS bracket leggibile

Da utente anon/pubblico, testare una select su bracket di torneo pubblico dopo aver generato un tabellone in staging. Prima della generazione, basta verificare che le policy esistano:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('tournament_brackets', 'tournament_bracket_matches')
order by tablename, policyname;
```

## Tipi Supabase

`src/lib/supabase/types.ts` e coerente con le migration V2:

- enum `tournament_format`
- enum `competition_phase`
- enum `bracket_type`
- enum `bracket_status`
- enum `bracket_slot`
- `tournaments.expected_teams_count`
- `tournaments.format`
- `tournaments.current_phase`
- `tournaments.allow_byes`
- `tournaments.use_ranking`
- `tournaments.playoff_teams_count`
- `tournaments.playout_teams_count`
- timestamp generazione calendario/tabelloni
- `teams.ranking`
- `matches.matchday`
- `matches.display_order`
- `tournament_brackets`
- `tournament_bracket_matches`

Nota: il tipo `TableDefinition` usa `Partial<Row>` per Insert/Update, quindi e permissivo rispetto a default DB.

## Migration Da Correggere Prima Del Deploy

Nessuna correzione obbligatoria rilevata per perdita dati.

Raccomandazioni prima del deploy:

1. Confermare su DB V1 reale la presenza di `public.is_public_tournament(uuid)`.
2. Eseguire le query pre-check e salvare output.
3. Applicare le migration in staging copiato da V1 prima della produzione.
4. Eseguire le query post-check e confrontare i conteggi.

Possibile hardening opzionale, non necessario per il deploy:

- In `v2_configurable_tournaments.sql`, far fallire esplicitamente la migration se `expected_teams_count` resta null invece di catturare solo notice. Oggi il fallback dovrebbe coprire tutti i record, ma il post-check deve verificarlo.
- In `v2_match_ordering_matchday.sql`, evitare di sovrascrivere `matchday` playoff/playout su rerun se in futuro venisse modificato manualmente. Oggi e accettabile perche i bracket V2 sono generati dal sistema.

## Rischi Residui

- Se il DB V1 reale non ha le funzioni RLS aggiornate, `v2_configurable_tournaments.sql` puo fallire nella creazione policy.
- Se esistono tornei V1 con piu season reali, `expected_teams_count` somma tutte le squadre del torneo. E sicuro, ma puo non rappresentare il modello desiderato.
- Se alcuni match V1 sono `played` ma non `official`, `current_phase` non diventera `completed`. Non e perdita dati, ma puo richiedere revisione operativa.
- `matchday` per match V1 viene ricostruito in modo tecnico, non storico. Il calendario resta leggibile e ordinabile, ma le giornate potrebbero non coincidere con eventuali giornate reali non persistite in V1.
- Le tabelle bracket nuove sono opzionali e vuote: non rompono V1, ma richiedono RLS funzionante per la futura vista pubblica dei tabelloni.
- `use_ranking` e `teams.ranking` partono disattivati/null: i tornei V1 non avranno ranking finche non viene configurato manualmente.
