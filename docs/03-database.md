# Database Design

## 1. Scopo del documento

Questo documento definisce il modello dati completo della PWA per la gestione di tornei di padel.

Il documento deriva da:

- `docs/01-business-rules.md`;
- `docs/02-architecture.md`.

Definisce:

- tabelle;
- relazioni;
- foreign key;
- indici;
- enum;
- vincoli logici;
- dati derivati;
- separazione tra dominio competitivo, accesso, media, pubblicazione e audit.

Il documento non contiene SQL.

## 1.1 Revisione critica e miglioramenti applicati

La revisione del modello ha evidenziato quattro aree principali.

### Normalizzazione

Valutazione:

- il nucleo competitivo è correttamente normalizzato;
- `team_memberships.season_id` è una duplicazione intenzionale e accettabile;
- `match_results.home_games_won` e `away_games_won` sono denormalizzazioni accettabili solo se derivano dai set;
- `media_links` è flessibile ma meno rigorosa di FK dedicate;
- `public_season_summaries` e ranking snapshot sono dati derivati, non fonte di verità.

Miglioramenti:

- chiarire quali campi sono denormalizzati e perché;
- limitare `media_links` a gallery e associazioni secondarie;
- usare FK dirette per media principali come logo squadra, foto profilo e cover;
- evitare che snapshot e riepiloghi diventino editabili.

### Scalabilità

Valutazione:

- le letture pubbliche di classifiche, calendari e gallery sono i percorsi più sensibili;
- gli audit e gli snapshot possono crescere nel tempo;
- una classifica ricalcolata sempre on demand può diventare costosa;
- troppe tabelle opzionali nel primo rilascio aumentano costi e manutenzione.

Miglioramenti:

- prevedere snapshot classifica con invalidazione;
- mantenere snapshot storici solo se utili;
- introdurre paginazione per media e audit;
- rendere differibili tabelle non necessarie all'MVP.

### Semplicità

Valutazione:

- il modello completo supporta molte funzioni, ma l'MVP deve partire più compatto;
- stati partita e stati risultato rischiavano di sovrapporsi;
- playoff/playout e tabelloni non devono complicare la regular season.

Miglioramenti:

- separare ciclo di vita della partita da ufficialità del risultato;
- indicare tabelle differibili;
- chiarire che una sola fase `regular_season` basta per MVP;
- rimandare qualificazioni e bracket finché non servono.

### Performance

Valutazione:

- indici singoli troppo generici sono meno utili di indici compositi allineati alle query;
- i record attivi/correnti richiedono indici partial;
- RLS userà spesso ruolo, profilo e ambito insieme;
- gallery e ranking devono leggere dati ordinati già filtrati.

Miglioramenti:

- preferire indici compositi per query pubbliche;
- usare partial index per membership attive, risultati correnti e snapshot validi;
- indicizzare `snapshot_id + position`;
- indicizzare `season_id + status + scheduled_at` per calendario e risultati.

## 2. Principi di modellazione

### 2.1 Stagione come confine competitivo

La stagione è il confine principale per:

- squadre;
- appartenenza giocatori;
- partite;
- risultati;
- fasi;
- classifiche.

Ogni dato competitivo deve essere riconducibile a una stagione e, indirettamente, a un torneo.

### 2.2 Fonte di verità

La fonte di verità è composta da dati transazionali:

- tornei;
- stagioni;
- squadre;
- giocatori;
- appartenenze;
- fasi;
- partite;
- risultati;
- media metadata;
- ruoli;
- audit.

Classifiche, statistiche e qualificazioni sono dati derivati.

### 2.3 Classifica derivata

La classifica non deve essere modificabile manualmente.

Il database può contenere snapshot tecnici della classifica per ottimizzare le letture pubbliche, ma tali snapshot:

- non sono fonte di verità;
- devono essere ricalcolabili;
- devono essere invalidati dopo modifiche ai risultati ufficiali;
- devono essere collegati a stagione e fase.

### 2.4 Sicurezza e Supabase

Il modello è pensato per Supabase/Postgres.

Le tabelle sensibili devono supportare Row Level Security:

- dati pubblici leggibili dai visitatori;
- dati amministrativi leggibili e modificabili solo da ruoli autorizzati;
- dati personali protetti;
- scritture competitive critiche preferibilmente gestite tramite funzioni backend controllate.

### 2.5 Media separati dal dominio competitivo

I file media non sono dati competitivi.

Logo squadra, foto profilo e gallery devono essere rappresentati tramite metadata e associazioni, senza usare path o URL come chiavi di dominio.

### 2.6 Normalizzazione pragmatica

Il modello deve restare normalizzato per i dati competitivi primari.

Regola:

- tornei, stagioni, squadre, giocatori, partite e risultati devono evitare duplicazioni non necessarie;
- le denormalizzazioni sono ammesse solo per performance, letture pubbliche o vincoli difficili da esprimere;
- ogni dato denormalizzato deve avere una fonte di verità chiara;
- ogni snapshot o riepilogo deve poter essere eliminato e ricreato.

Denormalizzazioni ammesse:

- `team_memberships.season_id`, per vincoli e query frequenti;
- `match_results.home_games_won` e `match_results.away_games_won`, se derivabili dai set;
- `public_season_summaries`, se implementata come tabella o vista materializzata;
- `ranking_snapshot_rows`, come cache tecnica della classifica.

Denormalizzazioni da evitare:

- copiare dati personali dei giocatori nelle tabelle pubbliche;
- salvare classifiche come dato editabile;
- duplicare ruoli in più punti;
- usare URL media come fonte di verità.

### 2.7 Semplicità dell'MVP

Il database deve supportare l'architettura completa, ma l'implementazione iniziale dovrebbe restare più piccola.

Tabelle prioritarie MVP:

- `profiles`;
- `user_roles`;
- `tournaments`;
- `seasons`;
- `players`;
- `teams`;
- `team_memberships`;
- `season_phases`;
- `matches`;
- `match_results`;
- `match_set_scores`;
- `media_assets`;
- `audit_events`.

Tabelle differibili:

- `phase_qualifications`;
- `phase_bracket_slots`;
- `ranking_tiebreak_details`;
- `media_links`, se nella prima versione bastano logo squadra, foto profilo e cover;
- `public_season_summaries`, se le letture pubbliche sono ancora leggere.

### 2.8 Performance by query path

Gli indici devono seguire i percorsi reali dell'applicazione.

Percorsi principali:

- consultazione pubblica di tornei e stagioni;
- calendario e risultati per stagione;
- classifica pubblica;
- gestione squadre;
- inserimento e conferma risultati;
- audit per torneo o stagione;
- gallery paginata.

Evitare indici generici su ogni campo se non supportano una query concreta: troppi indici rallentano scritture e rettifiche.

## 3. Convenzioni generali

### 3.1 Chiavi primarie

Tutte le tabelle principali usano un identificativo univoco `id`.

Tipo consigliato:

- UUID.

Motivo:

- compatibile con Supabase;
- sicuro per client pubblici;
- adatto a dati creati in contesti distribuiti.

### 3.2 Timestamp standard

Le tabelle transazionali principali dovrebbero includere:

- `created_at`;
- `updated_at`;
- `deleted_at`, solo dove serve soft delete;
- `created_by`, dove rilevante;
- `updated_by`, dove rilevante.

### 3.3 Soft delete

Usare soft delete per:

- media;
- profili;
- squadre non ancora coinvolte in risultati;
- dati amministrativi che devono restare tracciabili.

Evitare cancellazione fisica per dati che partecipano allo storico competitivo.

### 3.4 Nomi e slug

Per entità pubbliche come tornei e stagioni è utile prevedere uno slug.

Lo slug serve alla navigazione pubblica, non deve sostituire la chiave primaria.

## 4. Enum

### 4.1 `app_role`

Valori:

- `admin`;
- `tournament_manager`;
- `player`.

Nota:

- il visitatore non autenticato non richiede un ruolo persistito.

### 4.2 `role_scope_type`

Valori:

- `global`;
- `tournament`;
- `season`;
- `player_profile`.

### 4.3 `tournament_status`

Valori:

- `draft`;
- `active`;
- `archived`.

### 4.4 `season_status`

Valori:

- `draft`;
- `active`;
- `completed`;
- `archived`.

### 4.5 `visibility_status`

Valori:

- `private`;
- `public`;
- `hidden`.

### 4.6 `phase_type`

Valori:

- `regular_season`;
- `playoff`;
- `playout`;
- `final`;
- `custom`.

Nota:

- `custom` va usato con cautela e solo se il formato è validabile.

### 4.7 `phase_format`

Valori iniziali:

- `none`;
- `single_final`;
- `semifinals_final`;
- `quarterfinals_semifinals_final`;
- `simple_playout`;
- `round_robin`;

### 4.8 `match_status`

Valori:

- `scheduled`;
- `postponed`;
- `played`;
- `cancelled`;
- `not_approved`.

Nota:

- `match_status` descrive il ciclo di vita della partita;
- lo stato competitivo del risultato vive in `result_status`;
- evitare di duplicare l'ufficialità sia sulla partita sia sul risultato come fonte di verità.

### 4.9 `result_status`

Valori:

- `draft`;
- `provisional`;
- `official`;
- `corrected`;
- `voided`.

### 4.10 `media_type`

Valori:

- `team_logo`;
- `player_photo`;
- `gallery_photo`;
- `tournament_image`;
- `season_image`;

### 4.11 `media_visibility`

Valori:

- `private`;
- `public`;
- `hidden`;

### 4.12 `media_status`

Valori:

- `draft`;
- `published`;
- `hidden`;
- `removed`.

### 4.13 `audit_event_type`

Valori minimi:

- `result_confirmed`;
- `result_corrected`;
- `result_voided`;
- `team_membership_changed`;
- `phase_configured`;
- `role_assigned`;
- `role_revoked`;
- `season_archived`;
- `qualification_overridden`;
- `placement_overridden`;
- `media_published`;
- `media_removed`.

### 4.14 `ranking_snapshot_status`

Valori:

- `valid`;
- `stale`;
- `rebuilding`;
- `failed`.

### 4.15 `tie_resolution_status`

Valori:

- `resolved`;
- `unresolved`;
- `manual_override_required`;
- `shared_position`;

### 4.16 `media_entity_type`

Valori:

- `tournament`;
- `season`;
- `team`;
- `player`;
- `match`;
- `phase`.

Nota:

- serve solo per associazioni media flessibili;
- non deve essere usato per relazioni competitive primarie.

## 5. Tabelle Access Domain

## 5.1 `profiles`

Profilo applicativo collegato all'utente Supabase Auth.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo profilo. Coincide o si collega all'utente auth. |
| `auth_user_id` | Identificativo utente Supabase Auth. |
| `display_name` | Nome visualizzato nell'app. |
| `email` | Email applicativa, se necessaria per ricerche amministrative. |
| `phone` | Telefono opzionale. |
| `avatar_media_id` | Media opzionale per avatar generico. |
| `is_active` | Indica se il profilo è attivo. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |

Foreign key:

- `avatar_media_id` -> `media_assets.id`, nullable.

Nota di normalizzazione:

- il collegamento diretto ad `avatar_media_id` è opzionale;
- per evitare dipendenze circolari rigide in fase di bootstrap, il profilo deve poter esistere senza media;
- nella prima versione si può omettere `avatar_media_id` e usare solo `players.photo_media_id` per le foto sportive.

Relazioni:

- un profilo può avere uno o più ruoli applicativi;
- un profilo può essere collegato a un giocatore.

Indici:

- unique su `auth_user_id`;
- unique opzionale su `email` solo se l'email applicativa è realmente usata per login o ricerca amministrativa;
- index su `is_active`.

Note sicurezza:

- dati personali non devono essere pubblici per default.

## 5.2 `user_roles`

Assegna ruoli applicativi a un profilo con ambito.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo assegnazione ruolo. |
| `profile_id` | Profilo utente. |
| `role` | Ruolo applicativo. |
| `scope_type` | Tipo di ambito. |
| `scope_id` | Identificativo dell'ambito. |
| `is_active` | Ruolo attivo o revocato. |
| `assigned_by` | Profilo che ha assegnato il ruolo. |
| `assigned_at` | Data assegnazione. |
| `revoked_by` | Profilo che ha revocato il ruolo. |
| `revoked_at` | Data revoca. |

Foreign key:

- `profile_id` -> `profiles.id`;
- `assigned_by` -> `profiles.id`, nullable;
- `revoked_by` -> `profiles.id`, nullable.

Relazioni:

- un profilo può avere più ruoli;
- un ruolo può essere globale o limitato a torneo/stagione/profilo giocatore.

Indici:

- index su `profile_id`;
- index su `scope_type`, `scope_id`;
- index su `is_active`;
- composite index su `profile_id`, `role`, `is_active`;
- composite index su `role`, `scope_type`, `scope_id`, `is_active`;
- unique consigliato su `profile_id`, `role`, `scope_type`, `scope_id` per ruoli attivi.

Vincoli logici:

- `admin` dovrebbe usare `scope_type = global`;
- `tournament_manager` dovrebbe usare `scope_type = tournament`;
- `player` dovrebbe usare `scope_type = player_profile`.

Nota performance:

- le policy RLS useranno spesso `profile_id + role + scope`, quindi gli indici compositi sono più utili di indici separati troppo generici.

## 6. Tabelle Competition Domain

## 6.1 `tournaments`

Rappresenta una competizione organizzata.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo torneo. |
| `name` | Nome torneo. |
| `slug` | Slug pubblico. |
| `description` | Descrizione opzionale. |
| `status` | Stato torneo. |
| `visibility` | Visibilità pubblica. |
| `cover_media_id` | Immagine opzionale del torneo. |
| `created_by` | Profilo creatore. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |
| `archived_at` | Data archiviazione. |

Foreign key:

- `cover_media_id` -> `media_assets.id`, nullable;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- un torneo ha molte stagioni;
- un torneo può avere gestori tramite `user_roles`;
- un torneo può avere media associati.

Indici:

- unique su `slug`;
- composite index su `visibility`, `status`;
- index su `created_at`.

Nota performance:

- le query pubbliche filtrano tipicamente per `visibility = public` e `status = active`, quindi un indice composito è preferibile a due indici separati.

## 6.2 `seasons`

Rappresenta una specifica edizione temporale di un torneo.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo stagione. |
| `tournament_id` | Torneo di appartenenza. |
| `name` | Nome stagione. |
| `slug` | Slug relativo alla stagione. |
| `status` | Stato stagione. |
| `visibility` | Visibilità pubblica. |
| `start_date` | Data inizio opzionale. |
| `end_date` | Data fine opzionale. |
| `settings` | Configurazione controllata della stagione. |
| `created_by` | Profilo creatore. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |
| `archived_at` | Data archiviazione. |

Foreign key:

- `tournament_id` -> `tournaments.id`;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- una stagione appartiene a un torneo;
- una stagione ha molte squadre;
- una stagione ha molte fasi;
- una stagione ha molte partite;
- una stagione ha snapshot classifica.

Indici:

- index su `tournament_id`;
- unique su `tournament_id`, `slug`;
- index su `tournament_id`, `status`;
- index su `tournament_id`, `visibility`.
- composite index su `tournament_id`, `visibility`, `status`.

Vincoli:

- stagione senza torneo non ammessa;
- modifiche ordinarie bloccate quando `status` è `completed` o `archived`.

## 6.3 `players`

Rappresenta il profilo sportivo di un giocatore.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo giocatore. |
| `profile_id` | Profilo utente collegato, se il giocatore ha account. |
| `first_name` | Nome. |
| `last_name` | Cognome. |
| `display_name` | Nome visualizzato pubblicamente. |
| `birth_date` | Data nascita opzionale e privata. |
| `photo_media_id` | Foto profilo giocatore. |
| `public_profile_enabled` | Indica se il profilo è visibile pubblicamente. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |
| `deleted_at` | Soft delete. |

Foreign key:

- `profile_id` -> `profiles.id`, nullable;
- `photo_media_id` -> `media_assets.id`, nullable.

Relazioni:

- un giocatore può avere un profilo utente;
- un giocatore può partecipare a molte stagioni;
- un giocatore può appartenere a una sola squadra nella stessa stagione.

Indici:

- index su `profile_id`;
- index su `display_name` per ricerca semplice;
- index su `last_name`, `first_name`;
- index su `public_profile_enabled`;
- unique opzionale su `profile_id` quando non null.

Nota semplicità:

- evitare dati anagrafici non necessari all'MVP;
- se la data di nascita non serve a una regola di torneo, rimane opzionale e non pubblica.

Privacy:

- dati personali come `birth_date` non devono essere letti pubblicamente.

## 6.4 `teams`

Rappresenta una squadra/coppia di padel in una stagione.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo squadra. |
| `season_id` | Stagione di appartenenza. |
| `name` | Nome squadra. |
| `slug` | Slug squadra nella stagione. |
| `logo_media_id` | Logo squadra. |
| `seed` | Posizione seed opzionale per tabelloni. |
| `is_active` | Squadra attiva nella stagione. |
| `created_by` | Profilo creatore. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |
| `deleted_at` | Soft delete. |

Foreign key:

- `season_id` -> `seasons.id`;
- `logo_media_id` -> `media_assets.id`, nullable;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- una squadra appartiene a una stagione;
- una squadra ha massimo 2 giocatori tramite `team_memberships`;
- una squadra può giocare molte partite come squadra A o B.

Indici:

- index su `season_id`;
- unique su `season_id`, `slug`;
- unique consigliato su `season_id`, `name` per squadre attive;
- partial index su `season_id`, `is_active` per squadre attive;
- composite index su `season_id`, `seed` se usato per tabelloni.

Vincoli:

- una squadra non può esistere senza stagione;
- una squadra non può superare 2 membership attive.

Nota di normalizzazione:

- `seed` è opzionale e va usato solo se serve al tabellone;
- il seed competitivo di playoff/playout può essere rappresentato in `phase_qualifications`, evitando di sovraccaricare `teams.seed` con significati diversi.

## 6.5 `team_memberships`

Associa giocatori a squadre nella stagione.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo membership. |
| `season_id` | Stagione, duplicata intenzionalmente per vincoli e query. |
| `team_id` | Squadra. |
| `player_id` | Giocatore. |
| `position` | Posizione nella coppia, ad esempio 1 o 2. |
| `is_active` | Membership attiva. |
| `joined_at` | Data associazione. |
| `left_at` | Data uscita, se storicizzata. |
| `created_by` | Profilo autore. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |

Foreign key:

- `season_id` -> `seasons.id`;
- `team_id` -> `teams.id`;
- `player_id` -> `players.id`;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- una squadra ha massimo 2 membership attive;
- un giocatore ha massimo 1 membership attiva nella stessa stagione.

Indici:

- index su `season_id`;
- index su `team_id`;
- index su `player_id`;
- index su `season_id`, `player_id`;
- index su `team_id`, `is_active`;
- partial unique su `season_id`, `player_id` per membership attive;
- partial unique su `team_id`, `player_id` per membership attive;
- partial unique su `team_id`, `position` per membership attive;
- composite index su `season_id`, `team_id`, `is_active`.

Vincoli logici:

- `season_id` deve coincidere con la stagione della squadra;
- massimo due record attivi per `team_id`;
- non ammettere lo stesso giocatore due volte nella stessa squadra;
- cambio membership in stagione attiva deve essere auditato.

Nota implementativa:

- il limite massimo di 2 giocatori per squadra richiede un vincolo server-side o funzione controllata, perché un semplice vincolo relazionale non basta in modo portabile.
- la duplicazione di `season_id` è intenzionale: migliora query e vincoli di unicità, ma deve essere validata contro `teams.season_id`.

## 7. Tabelle Phase Domain

## 7.1 `season_phases`

Rappresenta una fase competitiva della stagione.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo fase. |
| `season_id` | Stagione di appartenenza. |
| `name` | Nome fase. |
| `type` | Tipo fase. |
| `format` | Formato supportato. |
| `sort_order` | Ordinamento tra fasi. |
| `is_enabled` | Indica se la fase è abilitata. |
| `starts_after_phase_id` | Fase precedente opzionale. |
| `qualification_count` | Numero squadre coinvolte o qualificate. |
| `settings` | Configurazione controllata. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |

Foreign key:

- `season_id` -> `seasons.id`;
- `starts_after_phase_id` -> `season_phases.id`, nullable.

Relazioni:

- una stagione ha una o più fasi;
- una fase ha molte partite;
- una fase può generare qualificazioni.

Indici:

- index su `season_id`;
- index su `season_id`, `type`;
- unique su `season_id`, `sort_order`;
- partial unique su `season_id`, `type` per la fase `regular_season`;
- index su `season_id`, `is_enabled`.

Vincoli:

- almeno una fase `regular_season` per stagione competitiva;
- playoff/playout devono usare formati supportati;
- configurazioni arbitrarie non validabili da evitare.

Nota semplicità:

- nella prima versione è sufficiente creare una sola fase `regular_season`;
- playoff e playout possono essere aggiunti quando il flusso di regular season è stabile.

## 7.2 `phase_qualifications`

Memorizza squadre qualificate o coinvolte in playoff/playout.

Questa tabella rappresenta un dato derivato o derivato con override auditato.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo qualificazione. |
| `phase_id` | Fase di destinazione. |
| `source_phase_id` | Fase sorgente, di solito regular season. |
| `team_id` | Squadra qualificata o coinvolta. |
| `rank_position` | Posizione usata per qualificazione. |
| `seed` | Seed nel tabellone. |
| `is_manual_override` | Indica se la qualificazione è stata forzata. |
| `override_reason` | Motivazione override. |
| `created_by` | Profilo autore. |
| `created_at` | Data creazione. |

Foreign key:

- `phase_id` -> `season_phases.id`;
- `source_phase_id` -> `season_phases.id`, nullable;
- `team_id` -> `teams.id`;
- `created_by` -> `profiles.id`, nullable.

Indici:

- index su `phase_id`;
- index su `team_id`;
- unique su `phase_id`, `team_id`;
- unique su `phase_id`, `seed`;
- index su `is_manual_override`.

Vincoli:

- squadra qualificata deve appartenere alla stessa stagione della fase;
- override manuali devono essere auditati.

Nota:

- questa tabella è differibile rispetto all'MVP;
- se non ci sono playoff/playout attivi, non serve popolarla.

## 7.3 `phase_bracket_slots`

Rappresenta slot del tabellone per playoff/playout.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo slot. |
| `phase_id` | Fase di appartenenza. |
| `round_number` | Numero turno. |
| `slot_number` | Numero slot nel turno. |
| `team_id` | Squadra assegnata, se nota. |
| `source_match_id` | Match sorgente opzionale per avanzamento. |
| `source_outcome` | Vincente o perdente del match sorgente, se applicabile. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |

Foreign key:

- `phase_id` -> `season_phases.id`;
- `team_id` -> `teams.id`, nullable;
- `source_match_id` -> `matches.id`, nullable.

Indici:

- index su `phase_id`;
- unique su `phase_id`, `round_number`, `slot_number`;
- index su `team_id`;

Vincoli:

- squadra assegnata deve appartenere alla stessa stagione della fase;
- slot e partite devono essere coerenti con il formato fase.

Nota:

- tabella utile solo quando si gestiscono tabelloni;
- per MVP con sola regular season non è necessaria.

## 8. Tabelle Match & Result Domain

## 8.1 `matches`

Rappresenta una partita ufficiale o programmata.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo partita. |
| `season_id` | Stagione di appartenenza. |
| `phase_id` | Fase competitiva. |
| `home_team_id` | Prima squadra. |
| `away_team_id` | Seconda squadra. |
| `scheduled_at` | Data e ora partita. |
| `venue` | Campo o sede opzionale. |
| `round_number` | Turno o giornata. |
| `match_number` | Numero partita nella fase o calendario. |
| `status` | Stato partita. |
| `is_public` | Visibilità pubblica della partita. |
| `created_by` | Profilo creatore. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |
| `cancelled_at` | Data annullamento. |

Foreign key:

- `season_id` -> `seasons.id`;
- `phase_id` -> `season_phases.id`;
- `home_team_id` -> `teams.id`;
- `away_team_id` -> `teams.id`;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- una partita appartiene a una stagione;
- una partita appartiene a una fase;
- una partita coinvolge due squadre;
- una partita può avere uno o più risultati storicizzati.

Indici:

- index su `season_id`;
- index su `phase_id`;
- index su `home_team_id`;
- index su `away_team_id`;
- index su `season_id`, `phase_id`;
- composite index su `season_id`, `status`, `scheduled_at`;
- composite index su `season_id`, `phase_id`, `scheduled_at`;
- index su `phase_id`, `round_number`, `match_number`;
- composite index su `home_team_id`, `scheduled_at`;
- composite index su `away_team_id`, `scheduled_at`;

Vincoli:

- `home_team_id` e `away_team_id` devono essere diversi;
- entrambe le squadre devono appartenere alla stessa stagione della partita;
- `phase_id` deve appartenere alla stessa stagione della partita.

Nota di normalizzazione:

- `matches.status` non deve duplicare lo stato del risultato;
- la partita può essere `played`, ma solo `match_results.status = official` rende il risultato valido per la classifica.

## 8.2 `match_results`

Rappresenta il risultato di una partita.

Permette storicizzazione e rettifiche senza perdere il valore precedente.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo risultato. |
| `match_id` | Partita. |
| `status` | Stato risultato. |
| `home_sets_won` | Set vinti dalla prima squadra. |
| `away_sets_won` | Set vinti dalla seconda squadra. |
| `home_games_won` | Game totali vinti dalla prima squadra. |
| `away_games_won` | Game totali vinti dalla seconda squadra. |
| `winner_team_id` | Squadra vincente, se risultato valido. |
| `is_current` | Indica il risultato corrente della partita. |
| `submitted_by` | Profilo che ha inserito il risultato. |
| `submitted_at` | Data inserimento. |
| `confirmed_by` | Profilo che ha confermato il risultato. |
| `confirmed_at` | Data conferma. |
| `correction_of_result_id` | Risultato precedente rettificato. |
| `void_reason` | Motivazione annullamento. |
| `correction_reason` | Motivazione rettifica. |
| `created_at` | Data creazione. |
| `updated_at` | Data aggiornamento. |

Foreign key:

- `match_id` -> `matches.id`;
- `winner_team_id` -> `teams.id`, nullable;
- `submitted_by` -> `profiles.id`, nullable;
- `confirmed_by` -> `profiles.id`, nullable;
- `correction_of_result_id` -> `match_results.id`, nullable.

Relazioni:

- una partita può avere più risultati storici;
- una partita deve avere al massimo un risultato corrente;
- solo il risultato corrente ufficiale incide sulla classifica.

Indici:

- index su `match_id`;
- index su `status`;
- partial unique su `match_id` dove `is_current = true`;
- partial index su `match_id`, `status` dove `is_current = true`;
- partial index su `match_id` dove `status = official` e `is_current = true`;
- index su `winner_team_id`;
- index su `confirmed_at`;

Vincoli:

- risultati validi per il sistema punti: 2-0, 2-1, 1-2, 0-2;
- una squadra deve arrivare a 2 set vinti per risultato ufficiale;
- `winner_team_id` deve essere una delle due squadre della partita;
- game totali non negativi;
- risultato ufficiale deve avere `confirmed_by` e `confirmed_at`;
- rettifica deve indicare `correction_reason`.

Nota performance:

- la query più frequente sui risultati cerca il risultato corrente della partita;
- gli indici partial su `is_current` sono più efficienti di un indice generico su tutta la tabella storica.

## 8.3 `match_set_scores`

Rappresenta i punteggi dei singoli set.

Questa tabella è utile per ricostruire game vinti/persi con maggiore precisione.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo set. |
| `match_result_id` | Risultato di riferimento. |
| `set_number` | Numero set. |
| `home_games` | Game prima squadra nel set. |
| `away_games` | Game seconda squadra nel set. |
| `tiebreak_home_points` | Punti tie-break opzionali. |
| `tiebreak_away_points` | Punti tie-break opzionali. |
| `created_at` | Data creazione. |

Foreign key:

- `match_result_id` -> `match_results.id`.

Relazioni:

- un risultato ha da 2 a 3 set nel formato attuale.

Indici:

- index su `match_result_id`;
- unique su `match_result_id`, `set_number`.

Vincoli:

- `set_number` positivo;
- game non negativi;
- numero set coerente con il risultato in set.

Nota:

- `home_games_won` e `away_games_won` in `match_results` possono essere denormalizzati per performance, ma devono derivare dai set quando i set sono presenti.
- per semplicità MVP, è accettabile salvare solo i totali game in `match_results` se non si intende mostrare il dettaglio set-by-set;
- se si usa `match_set_scores`, i totali in `match_results` diventano una cache derivata e devono essere aggiornati in modo controllato.

## 9. Tabelle Ranking Domain

## 9.1 `ranking_snapshots`

Snapshot tecnico della classifica per stagione e fase.

Non è fonte di verità.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo snapshot. |
| `season_id` | Stagione. |
| `phase_id` | Fase. |
| `status` | Stato snapshot. |
| `calculated_at` | Data calcolo. |
| `invalidated_at` | Data invalidazione. |
| `source_hash` | Hash o firma dei dati sorgente. |
| `error_message` | Errore ultimo ricalcolo, se presente. |
| `created_at` | Data creazione. |

Foreign key:

- `season_id` -> `seasons.id`;
- `phase_id` -> `season_phases.id`.

Relazioni:

- uno snapshot ha molte righe classifica;
- una fase può avere più snapshot storici, ma al massimo uno valido.

Indici:

- index su `season_id`;
- index su `phase_id`;
- composite index su `season_id`, `phase_id`, `status`;
- unique su `season_id`, `phase_id` per snapshot con `status = valid`;
- index su `calculated_at`.

Vincoli:

- lo snapshot valido deve essere invalidato quando cambia un risultato ufficiale della fase.

Nota scalabilità:

- conservare molti snapshot storici può far crescere rapidamente la tabella;
- in MVP è sufficiente mantenere lo snapshot valido e pochi snapshot recenti per debug;
- snapshot vecchi o falliti possono essere eliminati secondo una policy operativa.

## 9.2 `ranking_snapshot_rows`

Righe dello snapshot classifica.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo riga. |
| `snapshot_id` | Snapshot. |
| `team_id` | Squadra. |
| `position` | Posizione in classifica. |
| `played` | Partite giocate. |
| `won` | Partite vinte. |
| `lost` | Partite perse. |
| `sets_won` | Set vinti. |
| `sets_lost` | Set persi. |
| `set_diff` | Differenza set. |
| `games_won` | Game vinti. |
| `games_lost` | Game persi. |
| `game_diff` | Differenza game. |
| `points` | Punti. |
| `tie_resolution_status` | Stato risoluzione parità. |
| `tie_group_key` | Identificatore gruppo parità, se presente. |
| `created_at` | Data creazione. |

Foreign key:

- `snapshot_id` -> `ranking_snapshots.id`;
- `team_id` -> `teams.id`.

Indici:

- index su `snapshot_id`;
- index su `team_id`;
- unique su `snapshot_id`, `team_id`;
- unique su `snapshot_id`, `position`, salvo posizioni condivise;
- composite index su `snapshot_id`, `position`;
- composite index su `snapshot_id`, `points`;
- index su `tie_group_key`.

Vincoli:

- valori numerici non negativi dove applicabile;
- differenze coerenti con valori vinti/persi;
- righe snapshot non modificabili manualmente.

Nota performance:

- la classifica pubblica legge quasi sempre righe per `snapshot_id` ordinate per `position`;
- l'indice `snapshot_id + position` è il più importante per questa tabella.

## 9.3 `ranking_tiebreak_details`

Dettagli opzionali per spiegare lo spareggio di classifica.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo dettaglio. |
| `snapshot_id` | Snapshot. |
| `team_id` | Squadra. |
| `tie_group_key` | Gruppo parità. |
| `criterion` | Criterio applicato. |
| `criterion_order` | Ordine criterio. |
| `value` | Valore calcolato o descrizione. |
| `resolved` | Indica se il criterio ha risolto la parità. |
| `created_at` | Data creazione. |

Foreign key:

- `snapshot_id` -> `ranking_snapshots.id`;
- `team_id` -> `teams.id`.

Indici:

- index su `snapshot_id`;
- index su `tie_group_key`;
- index su `team_id`;
- index su `criterion_order`.

Nota:

- utile per trasparenza pubblica e debug, non obbligatoria per MVP se il Ranking Engine è testato.
- può essere generata solo per classifiche con parità, evitando volume inutile.

## 10. Tabelle Media Domain

## 10.1 `media_assets`

Metadata dei file caricati su Supabase Storage.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo media. |
| `type` | Tipo media. |
| `status` | Stato media. |
| `visibility` | Visibilità media. |
| `bucket_name` | Bucket Supabase Storage. |
| `storage_path` | Path del file nello storage. |
| `public_url` | URL pubblico, solo se applicabile. |
| `mime_type` | Tipo MIME. |
| `file_size_bytes` | Dimensione file. |
| `width` | Larghezza immagine. |
| `height` | Altezza immagine. |
| `alt_text` | Testo alternativo. |
| `uploaded_by` | Profilo uploader. |
| `uploaded_at` | Data upload. |
| `published_at` | Data pubblicazione. |
| `removed_at` | Data rimozione. |

Foreign key:

- `uploaded_by` -> `profiles.id`, nullable.

Relazioni:

- un media può essere associato a una o più entità tramite `media_links`;
- alcuni media possono essere referenziati direttamente da tabelle principali per accesso rapido.

Indici:

- index su `type`;
- composite index su `visibility`, `status`, `type`;
- index su `uploaded_by`;
- index su `uploaded_at`;
- unique su `bucket_name`, `storage_path`.

Vincoli:

- file pubblici devono avere `visibility = public`;
- file privati non devono essere esposti tramite URL pubblico persistente;
- dimensione e tipo file devono rispettare limiti applicativi.

Nota di normalizzazione:

- `public_url` è una comodità di lettura, non fonte di verità;
- la fonte di verità dello storage è `bucket_name + storage_path`;
- se gli URL sono firmati o temporanei, non salvarli come dato persistente.

## 10.2 `media_links`

Associa media a entità del dominio.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo associazione. |
| `media_id` | Media. |
| `entity_type` | Tipo entità associata. |
| `entity_id` | Identificativo entità associata. |
| `sort_order` | Ordinamento nella gallery o contesto. |
| `caption` | Didascalia opzionale. |
| `is_primary` | Media principale per quel contesto. |
| `created_by` | Profilo autore. |
| `created_at` | Data creazione. |

Foreign key:

- `media_id` -> `media_assets.id`;
- `created_by` -> `profiles.id`, nullable.

Relazioni:

- associa media a torneo, stagione, squadra, giocatore, partita o fase.

Indici:

- index su `media_id`;
- index su `entity_type`, `entity_id`;
- index su `entity_type`, `entity_id`, `sort_order`;
- unique su `entity_type`, `entity_id`, `media_id`;
- unique opzionale su `entity_type`, `entity_id`, `is_primary` quando `is_primary = true`.

Nota:

- `entity_type` + `entity_id` è una relazione polimorfica. Va usata solo per media, dove la flessibilità è utile e il rischio sul dominio competitivo è basso.
- `entity_type` deve usare l'enum `media_entity_type`;
- per logo squadra, foto profilo e cover torneo è preferibile usare FK dirette sulle tabelle principali;
- usare `media_links` soprattutto per gallery e associazioni secondarie.

## 11. Tabelle Publication Domain

## 11.1 `public_season_summaries`

Tabella o vista materializzata per letture pubbliche leggere.

Dato derivato.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo riepilogo. |
| `season_id` | Stagione. |
| `tournament_id` | Torneo. |
| `tournament_name` | Nome torneo denormalizzato. |
| `season_name` | Nome stagione denormalizzato. |
| `teams_count` | Numero squadre. |
| `matches_count` | Numero partite pubbliche. |
| `official_results_count` | Numero risultati ufficiali. |
| `last_result_at` | Data ultimo risultato ufficiale. |
| `ranking_snapshot_id` | Snapshot classifica valido. |
| `updated_at` | Data aggiornamento riepilogo. |

Foreign key:

- `season_id` -> `seasons.id`;
- `tournament_id` -> `tournaments.id`;
- `ranking_snapshot_id` -> `ranking_snapshots.id`, nullable.

Indici:

- unique su `season_id`;
- index su `tournament_id`;
- index su `updated_at`;
- composite index su `tournament_id`, `updated_at`;
- index su `ranking_snapshot_id`.

Nota:

- può essere implementata come vista, vista materializzata o tabella aggiornata da processo controllato.
- per MVP è preferibile iniziare con una vista semplice;
- trasformarla in tabella/materialized view solo quando le letture pubbliche diventano pesanti.

## 12. Tabelle Audit Domain

## 12.1 `audit_events`

Registro delle operazioni rilevanti.

| Campo | Descrizione |
| --- | --- |
| `id` | Identificativo evento. |
| `event_type` | Tipo evento. |
| `actor_profile_id` | Profilo autore. |
| `actor_role` | Ruolo al momento dell'azione. |
| `scope_type` | Ambito dell'evento. |
| `scope_id` | Identificativo ambito. |
| `entity_type` | Tipo entità modificata. |
| `entity_id` | Identificativo entità modificata. |
| `previous_value` | Stato precedente. |
| `new_value` | Stato successivo. |
| `reason` | Motivazione, se richiesta. |
| `result` | Esito operazione. |
| `ip_address` | IP opzionale. |
| `user_agent` | User agent opzionale. |
| `created_at` | Data evento. |

Foreign key:

- `actor_profile_id` -> `profiles.id`, nullable.

Indici:

- index su `event_type`;
- index su `actor_profile_id`;
- index su `scope_type`, `scope_id`;
- index su `entity_type`, `entity_id`;
- index su `created_at`;
- index su `scope_type`, `scope_id`, `created_at`;
- composite index su `entity_type`, `entity_id`, `created_at`;
- composite index su `actor_profile_id`, `created_at`.

Vincoli:

- eventi audit non modificabili dagli utenti ordinari;
- motivazione obbligatoria per rettifiche, annullamenti e override;
- audit obbligatorio per operazioni ad alto impatto.

Nota scalabilità:

- l'audit deve essere paginato sempre;
- valutare retention o archiviazione per eventi molto vecchi;
- se il volume cresce, partizionare logicamente per intervallo temporale o ambito competitivo.

## 13. Relazioni principali

### 13.1 Tornei e stagioni

Relazione:

- `tournaments.id` -> `seasons.tournament_id`.

Cardinalità:

- un torneo ha molte stagioni;
- una stagione appartiene a un solo torneo.

### 13.2 Stagioni e squadre

Relazione:

- `seasons.id` -> `teams.season_id`.

Cardinalità:

- una stagione ha molte squadre;
- una squadra appartiene a una sola stagione.

### 13.3 Squadre e giocatori

Relazione:

- `teams.id` -> `team_memberships.team_id`;
- `players.id` -> `team_memberships.player_id`;
- `seasons.id` -> `team_memberships.season_id`.

Cardinalità:

- una squadra ha massimo 2 giocatori attivi;
- un giocatore può appartenere a una sola squadra attiva nella stessa stagione;
- un giocatore può partecipare a più stagioni.

### 13.4 Stagioni e fasi

Relazione:

- `seasons.id` -> `season_phases.season_id`.

Cardinalità:

- una stagione ha una o più fasi;
- ogni fase appartiene a una sola stagione.

### 13.5 Fasi e partite

Relazione:

- `season_phases.id` -> `matches.phase_id`;
- `seasons.id` -> `matches.season_id`.

Cardinalità:

- una fase ha molte partite;
- una partita appartiene a una sola fase.

### 13.6 Partite e risultati

Relazione:

- `matches.id` -> `match_results.match_id`;
- `match_results.id` -> `match_set_scores.match_result_id`.

Cardinalità:

- una partita può avere più risultati storicizzati;
- una partita può avere un solo risultato corrente;
- un risultato può avere da 2 a 3 set nel formato attuale.

### 13.7 Classifiche

Relazione:

- `seasons.id` -> `ranking_snapshots.season_id`;
- `season_phases.id` -> `ranking_snapshots.phase_id`;
- `ranking_snapshots.id` -> `ranking_snapshot_rows.snapshot_id`;
- `teams.id` -> `ranking_snapshot_rows.team_id`.

Cardinalità:

- una fase può avere più snapshot storici;
- una fase deve avere al massimo uno snapshot valido;
- uno snapshot contiene una riga per ogni squadra classificata.

### 13.8 Media

Relazioni dirette:

- `teams.logo_media_id` -> `media_assets.id`;
- `players.photo_media_id` -> `media_assets.id`;
- `tournaments.cover_media_id` -> `media_assets.id`;
- `profiles.avatar_media_id` -> `media_assets.id`.

Relazioni flessibili:

- `media_assets.id` -> `media_links.media_id`.

## 14. Indici raccomandati per query principali

### 14.1 Query pubbliche

Elenco tornei pubblici:

- `tournaments.visibility`;
- `tournaments.status`;
- `tournaments.slug`.

Stagioni pubbliche di un torneo:

- `seasons.tournament_id`, `seasons.visibility`;
- `seasons.tournament_id`, `seasons.status`;
- unique `seasons.tournament_id`, `seasons.slug`.

Classifica pubblica:

- `ranking_snapshots.season_id`, `ranking_snapshots.phase_id`, `ranking_snapshots.status`;
- `ranking_snapshot_rows.snapshot_id`, `ranking_snapshot_rows.position`.
- partial unique per snapshot valido della coppia stagione/fase.

Calendario e risultati:

- `matches.season_id`, `matches.phase_id`;
- `matches.season_id`, `matches.status`;
- `matches.season_id`, `status`, `scheduled_at`;
- `matches.season_id`, `phase_id`, `scheduled_at`;
- `match_results.match_id`, `match_results.is_current`;
- `match_results.status`.
- partial index per risultato corrente ufficiale.

Gallery:

- `media_links.entity_type`, `media_links.entity_id`, `media_links.sort_order`;
- `media_assets.visibility`, `media_assets.status`, `media_assets.type`;
- `media_assets.uploaded_at`.

### 14.2 Query amministrative

Gestione torneo:

- `user_roles.profile_id`, `user_roles.role`, `user_roles.scope_type`, `user_roles.scope_id`;
- `user_roles.role`, `user_roles.scope_type`, `user_roles.scope_id`, `user_roles.is_active`;
- `seasons.tournament_id`;
- `teams.season_id`;
- `players.display_name`;
- `matches.season_id`, `matches.status`.

Gestione squadra:

- `team_memberships.team_id`, `team_memberships.is_active`;
- `team_memberships.season_id`, `team_memberships.player_id`;
- `team_memberships.season_id`, `team_memberships.team_id`, `team_memberships.is_active`;
- `teams.season_id`, `teams.name`.

Rettifiche risultato:

- `match_results.match_id`;
- `match_results.is_current`;
- `match_results.status`;
- `audit_events.entity_type`, `audit_events.entity_id`.

### 14.3 Query audit

- `audit_events.scope_type`, `audit_events.scope_id`, `audit_events.created_at`;
- `audit_events.actor_profile_id`;
- `audit_events.event_type`;
- `audit_events.entity_type`, `audit_events.entity_id`.

## 15. Vincoli critici

### 15.1 Vincoli applicabili con chiavi e unique

- `profiles.auth_user_id` univoco.
- `tournaments.slug` univoco.
- `seasons.tournament_id + seasons.slug` univoco.
- `teams.season_id + teams.slug` univoco.
- `team_memberships.season_id + team_memberships.player_id` univoco per membership attive.
- `team_memberships.team_id + team_memberships.player_id` univoco per membership attive.
- `team_memberships.team_id + team_memberships.position` univoco per membership attive.
- `matches.home_team_id != matches.away_team_id`.
- `match_results.match_id` con un solo `is_current = true`.
- `ranking_snapshots.season_id + phase_id` con un solo snapshot valido.

### 15.2 Vincoli che richiedono validazione backend

Questi vincoli sono critici e non vanno affidati solo al frontend:

- massimo 2 giocatori attivi per squadra;
- `team_memberships.season_id` coerente con `teams.season_id`;
- squadre della partita appartenenti alla stessa stagione della partita;
- fase della partita appartenente alla stessa stagione della partita;
- `winner_team_id` appartenente a una delle due squadre della partita;
- set e game coerenti con il risultato;
- risultato ufficiale solo se confermato da utente autorizzato;
- `matches.status` coerente con la presenza o assenza di un risultato;
- rettifica risultato con motivazione obbligatoria;
- invalidazione snapshot classifica dopo modifiche a risultati ufficiali;
- override qualificazioni auditato.

### 15.3 Vincoli da non modellare con relazioni polimorfiche

Non usare relazioni polimorfiche per:

- appartenenza giocatori;
- partite;
- risultati;
- classifiche;
- ruoli;
- audit critico.

Le relazioni polimorfiche sono accettabili solo per:

- media secondari;
- gallery;
- associazioni descrittive non competitive.

## 16. RLS e policy dati

### 16.1 Tabelle pubbliche leggibili con filtro

Lettura pubblica consentita solo per record pubblicati:

- `tournaments`;
- `seasons`;
- `teams`;
- `players`, solo campi pubblici tramite vista o policy controllata;
- `matches`;
- `match_results`, solo risultati ufficiali;
- `ranking_snapshots`, solo snapshot validi;
- `ranking_snapshot_rows`;
- `media_assets`, solo media pubblici;
- `media_links`, solo associazioni a media pubblici.

### 16.2 Tabelle riservate

Accesso limitato:

- `profiles`;
- `user_roles`;
- `team_memberships`;
- `audit_events`;
- risultati provvisori;
- media privati;
- dati personali giocatori.

### 16.3 Scritture protette

Scritture da proteggere con ruolo e ambito:

- creazione torneo;
- creazione stagione;
- modifica stagione attiva;
- creazione squadra;
- modifica membership;
- creazione partita;
- inserimento risultato;
- conferma risultato;
- rettifica risultato;
- configurazione fasi;
- pubblicazione media;
- assegnazione ruoli.

### 16.4 Scritture consigliate tramite funzioni backend

- conferma risultato ufficiale;
- rettifica risultato ufficiale;
- annullamento risultato;
- modifica squadra in stagione attiva;
- configurazione playoff/playout;
- archiviazione stagione;
- assegnazione o revoca ruoli;
- override qualificazione;
- rebuild o invalidazione snapshot classifica.

## 17. Viste consigliate

Le viste non sono tabelle fonte di verità, ma migliorano sicurezza e semplicità del frontend.

### 17.1 `public_tournaments_view`

Espone:

- tornei pubblici;
- campi non sensibili;
- cover pubblica;
- conteggio stagioni pubbliche.

### 17.2 `public_seasons_view`

Espone:

- stagioni pubbliche;
- stato;
- riepilogo squadre e partite;
- riferimento a classifica valida.

### 17.3 `public_players_view`

Espone solo:

- id giocatore;
- display name;
- foto pubblica se abilitata;
- dati sportivi non sensibili.

Non espone:

- data nascita;
- email;
- telefono;
- profilo auth.

### 17.4 `public_matches_view`

Espone:

- partite pubbliche;
- squadre;
- data;
- stato pubblico;
- risultato ufficiale corrente.

### 17.5 `public_rankings_view`

Espone:

- snapshot valido;
- righe classifica;
- ordinamento;
- statistiche.

## 18. Tabelle rimandate

Per proteggere l'MVP, non introdurre subito:

- iscrizioni economiche;
- pagamenti;
- notifiche push;
- chat;
- prenotazioni campi;
- statistiche dettagliate per singolo giocatore;
- proposte risultato da giocatori;
- moderazione avanzata;
- log tecnico di ogni query;
- configuratore libero di formule torneo.

Queste aree possono essere aggiunte senza modificare il nucleo se il modello mantiene stabili stagione, squadra, partita, risultato e media.

## 19. Ordine consigliato di implementazione

### 19.1 Fondazione accesso

- `profiles`;
- `user_roles`;
- enum ruoli e ambiti.

### 19.2 Dominio competitivo base

- `tournaments`;
- `seasons`;
- `players`;
- `teams`;
- `team_memberships`;
- `season_phases`.

### 19.3 Partite e risultati

- `matches`;
- `match_results`;
- `match_set_scores`.

### 19.4 Classifiche

- calcolo on demand;
- `ranking_snapshots`;
- `ranking_snapshot_rows`;
- `ranking_tiebreak_details` opzionale.

### 19.5 Media

- `media_assets`;
- `media_links`;
- collegamenti diretti per logo e foto profilo.

### 19.6 Audit e sicurezza avanzata

- `audit_events`;
- policy RLS complete;
- funzioni backend per scritture critiche.

### 19.7 Pubblicazione ottimizzata

- viste pubbliche;
- `public_season_summaries` o vista equivalente;
- indici per query pubbliche.

## 20. Checklist di accettazione database

Il modello dati è accettabile se:

- supporta più tornei;
- supporta più stagioni per torneo;
- impedisce squadre senza stagione;
- impedisce stagioni senza torneo;
- rappresenta squadre come coppie di massimo 2 giocatori;
- impedisce al giocatore di appartenere a più squadre nella stessa stagione;
- rappresenta partite tra due squadre diverse;
- garantisce che le squadre della partita appartengano alla stessa stagione;
- rappresenta risultati ufficiali e provvisori;
- consente rettifiche senza perdere lo storico;
- permette il calcolo di punti, set, game e classifica;
- supporta snapshot classifica come dato derivato;
- distingue regular season, playoff e playout;
- supporta qualificazioni e tabelloni;
- separa media da dati competitivi;
- protegge dati personali;
- supporta ruoli e ambiti;
- consente audit mirato;
- abilita letture pubbliche ottimizzate e sicure.
