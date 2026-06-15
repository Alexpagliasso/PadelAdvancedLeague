# System Architecture

## 1. Scopo del documento

Questo documento definisce l'architettura migliorata della PWA per la gestione di tornei di padel.

La versione tiene conto delle business rules definite in `docs/01-business-rules.md` e introduce una revisione critica dell'architettura precedente, con particolare attenzione a:

- colli di bottiglia;
- scalabilità;
- sicurezza;
- riduzione della complessità inutile;
- separazione tra MVP e funzionalità evolutive;
- sostenibilità operativa su React, TypeScript, Vite, Supabase e Vercel.

Il documento non contiene codice.

## 2. Sintesi critica dell'architettura precedente

L'architettura precedente copriva correttamente tutti i domini richiesti, ma presentava alcuni rischi.

### 2.1 Colli di bottiglia individuati

Criticità:

- Ranking Engine descritto in modo concettuale, ma senza indicare una strategia chiara tra calcolo on demand, viste aggregate o snapshot.
- Possibile ricalcolo completo della classifica a ogni visualizzazione pubblica.
- Media Management potenzialmente costoso se gallery, loghi e foto profilo vengono caricati senza limiti, trasformazioni o policy di accesso chiare.
- Audit potenzialmente troppo dettagliato già dalla prima versione, con rischio di rallentare operazioni semplici.
- Area pubblica potenzialmente molto letta rispetto all'area amministrativa, ma non distinta a livello architetturale come percorso ottimizzato.

### 2.2 Problemi di scalabilità individuati

Criticità:

- Mancanza di una distinzione esplicita tra dati transazionali e dati di lettura.
- Classifiche dinamiche corrette sul piano del dominio, ma potenzialmente inefficienti se ricalcolate da zero per molte richieste pubbliche.
- Nessuna strategia definita per paginazione, filtri e caricamento progressivo di gallery e calendari.
- Modello autorizzativo molto ampio, ma non ancora tradotto in ambiti minimi stabili.
- Playoff e playout troppo generici: la configurabilità illimitata rende difficile validare, testare e scalare il dominio.

### 2.3 Problemi di sicurezza individuati

Criticità:

- Troppa fiducia implicita nel frontend per validazioni e orchestrazione.
- Necessità di chiarire che le operazioni competitive critiche devono passare da funzioni server-side o percorsi controllati.
- Mancanza di una distinzione netta tra bucket media pubblici e privati.
- Assenza di una strategia esplicita per Row Level Security, ruoli applicativi e ambiti per torneo.
- Audit descritto come utile, ma non obbligatorio per le operazioni ad alto rischio.
- Possibile esposizione eccessiva di dati giocatore nelle viste pubbliche.

### 2.4 Complessità inutili individuate

Criticità:

- Troppi moduli nominati con confini parzialmente sovrapposti.
- Audit completo, proposte risultato, moderazione avanzata e governance granulare rischiano di appesantire l'MVP.
- Playoff e playout descritti come totalmente configurabili, quando è preferibile supportare inizialmente pochi formati validati.
- Distinzione tra molti stati può generare complessità se non tutti sono necessari nella prima versione.
- Area giocatore avanzata può essere rimandata se l'obiettivo iniziale è gestione torneo e consultazione pubblica.

## 3. Obiettivo architetturale migliorato

L'architettura migliorata deve essere:

- semplice nella prima versione;
- sicura per impostazione predefinita;
- scalabile sui percorsi di lettura pubblica;
- rigorosa sui dati competitivi;
- modulare senza frammentare troppo il dominio;
- pronta a evolvere verso funzioni avanzate senza riscrivere il nucleo.

Il sistema deve privilegiare un dominio competitivo forte e una superficie amministrativa controllata.

## 4. Architettura proposta

Il sistema è una PWA React + TypeScript + Vite distribuita su Vercel, con Supabase come backend per:

- autenticazione;
- database relazionale;
- Row Level Security;
- storage media;
- funzioni server-side per operazioni critiche;
- viste o materializzazioni per letture pubbliche ad alto traffico.

### 4.1 Scelta architetturale principale

La logica competitiva critica non deve vivere solo nel frontend.

Regola:

- il frontend gestisce esperienza utente e validazioni immediate;
- Supabase protegge accesso, integrità e autorizzazioni;
- le operazioni competitive sensibili passano da percorsi backend controllati;
- le viste pubbliche leggono dati già autorizzati e, dove utile, pre-aggregati.

## 5. Principi guida

### 5.1 Dominio competitivo al centro

Il nucleo del sistema è composto da:

- torneo;
- stagione;
- squadra;
- giocatore;
- partita;
- risultato;
- fase;
- classifica.

Tutto il resto, inclusi media, PWA e ruoli, deve sostenere questo nucleo senza contaminarlo.

### 5.2 Dati primari separati dai dati derivati

Dati primari:

- tornei;
- stagioni;
- squadre;
- giocatori;
- appartenenze;
- partite;
- risultati;
- configurazioni fase;
- media;
- ruoli.

Dati derivati:

- punti;
- statistiche;
- classifica;
- qualificazioni playoff;
- qualificazioni playout;
- piazzamenti finali.

I dati derivati devono essere sempre ricostruibili dai dati primari.

### 5.3 Letture pubbliche ottimizzate

Le viste pubbliche saranno probabilmente più lette delle aree amministrative.

Per questo il sistema deve distinguere:

- percorso di scrittura amministrativa;
- percorso di lettura pubblica;
- percorso di lettura autenticata.

La classifica resta concettualmente dinamica, ma può essere esposta tramite viste ottimizzate o snapshot ricalcolabili.

### 5.4 Sicurezza backend-first

Ogni dato competitivo deve essere protetto da:

- vincoli dati;
- policy di accesso;
- validazioni backend;
- audit per operazioni critiche.

La UI non deve essere considerata una protezione sufficiente.

### 5.5 Configurabilità limitata e validabile

Playoff e playout devono essere configurabili, ma non arbitrari.

Prima versione consigliata:

- abilitato o disabilitato;
- numero squadre coinvolte;
- formato tra un set limitato di modelli supportati;
- criteri basati sulla classifica regular season.

La configurabilità avanzata va introdotta solo quando esistono casi reali.

## 6. Domini applicativi migliorati

Per ridurre complessità, i domini vengono accorpati in aree più stabili.

### 6.1 Access Domain

Gestisce:

- autenticazione;
- profili utente;
- ruoli;
- permessi;
- ambiti.

Ruoli iniziali:

- visitatore;
- giocatore;
- gestore torneo;
- amministratore.

Ambiti:

- globale;
- torneo;
- stagione;
- profilo personale;
- pubblico.

Responsabilità:

- determinare identità dell'utente;
- determinare ruolo applicativo;
- verificare ambito di accesso;
- impedire modifiche fuori ambito;
- proteggere dati personali.

### 6.2 Competition Domain

Dominio centrale del sistema.

Gestisce:

- tornei;
- stagioni;
- squadre;
- giocatori;
- appartenenze;
- partite;
- risultati.

Responsabilità:

- applicare vincoli competitivi;
- garantire coerenza tra torneo e stagione;
- garantire massimo 2 giocatori per squadra;
- garantire giocatore unico per stagione;
- garantire validità delle partite;
- garantire validità dei risultati;
- preservare storico competitivo.

### 6.3 Ranking Domain

Gestisce classifica e statistiche derivate.

Responsabilità:

- calcolare punti;
- calcolare statistiche;
- applicare ordinamento;
- risolvere parità;
- esporre classifica per stagione e fase;
- supportare ricalcolo dopo rettifica.

Decisione:

- la classifica non è inserita manualmente;
- la classifica può essere materializzata come snapshot tecnico, purché resti derivata e ricalcolabile.

### 6.4 Phase Domain

Gestisce:

- regular season;
- playoff;
- playout;
- qualificazioni;
- tabelloni;
- piazzamenti finali.

Responsabilità:

- separare le partite per fase;
- configurare formati supportati;
- determinare qualificate;
- impedire configurazioni non validabili;
- mantenere separata la classifica regular season dagli esiti playoff/playout.

### 6.5 Media Domain

Gestisce:

- loghi squadra;
- foto profilo;
- gallery;
- immagini torneo o stagione.

Responsabilità:

- caricare media;
- associare media a entità;
- applicare visibilità;
- proteggere immagini personali;
- separare media da dati competitivi.

### 6.6 Publication Domain

Gestisce i dati esposti pubblicamente.

Responsabilità:

- mostrare solo tornei e stagioni pubblicati;
- esporre classifiche pubbliche;
- esporre risultati ufficiali;
- nascondere dati in preparazione;
- filtrare dati personali non pubblici;
- ottimizzare letture pubbliche.

### 6.7 Audit Domain

Gestisce tracciabilità delle operazioni rilevanti.

Nella prima versione deve essere obbligatorio per:

- conferma risultato;
- rettifica risultato;
- annullamento risultato;
- modifica composizione squadra dopo avvio stagione;
- configurazione playoff;
- configurazione playout;
- cambio ruoli;
- archiviazione stagione.

Operazioni minori possono essere escluse dall'audit dettagliato nella prima versione.

## 7. Moduli applicativi

### 7.1 Frontend App Shell

Responsabilità:

- layout;
- routing;
- sessione utente;
- navigazione responsive;
- gestione stati di caricamento;
- gestione errori;
- esperienza installabile PWA.

### 7.2 Public Module

Responsabilità:

- lista tornei pubblici;
- dettaglio torneo;
- dettaglio stagione;
- squadre;
- calendario;
- risultati ufficiali;
- classifica;
- playoff e playout pubblicati;
- gallery pubblica.

Priorità:

- deve essere veloce;
- deve caricare dati in modo progressivo;
- deve evitare richieste non necessarie;
- deve leggere solo dati pubblicabili.

### 7.3 Management Module

Modulo per gestori torneo.

Responsabilità:

- gestione stagioni;
- gestione squadre;
- gestione giocatori;
- gestione partite;
- inserimento risultati;
- conferma risultati;
- configurazione playoff/playout;
- gestione media del torneo.

### 7.4 Admin Module

Modulo per amministratori.

Responsabilità:

- gestione tornei;
- gestione ruoli;
- operazioni straordinarie;
- audit globale;
- moderazione media;
- rettifiche storiche.

### 7.5 Player Module

Modulo leggero nella prima versione.

Responsabilità iniziali:

- visualizzare profilo;
- visualizzare squadra;
- visualizzare calendario;
- visualizzare risultati;
- aggiornare foto profilo se abilitato.

Funzioni da rimandare:

- proposta risultato;
- chat;
- notifiche avanzate;
- gestione iscrizioni.

### 7.6 Data Access Module

Responsabilità:

- isolare accesso a Supabase;
- evitare query disperse nelle viste;
- applicare convenzioni di caricamento dati;
- distinguere letture pubbliche, letture autenticate e scritture amministrative;
- normalizzare gestione errori.

### 7.7 Domain Services Module

Responsabilità:

- validazioni di dominio lato frontend;
- presentazione coerente di stati e risultati;
- funzioni pure di supporto non critiche;
- allineamento con regole backend.

Nota:

- le validazioni frontend migliorano UX, ma non sostituiscono quelle backend.

## 8. Ruoli e autorizzazioni

### 8.1 Visitatore

Può:

- consultare dati pubblici;
- visualizzare classifiche pubbliche;
- visualizzare risultati ufficiali pubblici;
- visualizzare gallery pubblica.

Non può:

- accedere a dati privati;
- modificare dati;
- caricare media;
- inserire risultati.

### 8.2 Giocatore

Può:

- consultare dati pubblici;
- consultare il proprio profilo;
- consultare la propria squadra;
- aggiornare dati personali consentiti;
- aggiornare foto profilo se abilitato.

Non può:

- modificare dati competitivi;
- confermare risultati;
- configurare fasi;
- vedere audit.

### 8.3 Gestore Torneo

Può, nel proprio ambito:

- gestire stagioni;
- gestire squadre;
- gestire giocatori;
- gestire partite;
- inserire e confermare risultati;
- configurare playoff e playout;
- gestire media;
- pubblicare dati;
- consultare audit del proprio torneo.

Non può:

- gestire tornei non assegnati;
- cambiare ruoli globali;
- eseguire rettifiche storiche fuori policy.

### 8.4 Amministratore

Può:

- gestire tutto il sistema;
- assegnare ruoli;
- rettificare dati storici;
- consultare audit globali;
- moderare media;
- archiviare tornei e stagioni.

Le operazioni ad alto impatto devono essere tracciate anche se eseguite da amministratore.

## 9. Matrice permessi migliorata

| Funzione | Visitatore | Giocatore | Gestore Torneo | Amministratore |
| --- | --- | --- | --- | --- |
| Consultare dati pubblici | Si | Si | Si | Si |
| Consultare profilo personale | No | Si | Si | Si |
| Aggiornare profilo personale | No | Limitato | Si | Si |
| Creare torneo | No | No | No | Si |
| Gestire torneo assegnato | No | No | Si | Si |
| Creare stagione | No | No | Si | Si |
| Modificare stagione attiva | No | No | Limitato | Si |
| Archiviare stagione | No | No | No | Si |
| Creare squadra | No | No | Si | Si |
| Modificare composizione squadra in preparazione | No | No | Si | Si |
| Modificare composizione squadra attiva | No | No | Limitato e auditato | Si, auditato |
| Creare partita | No | No | Si | Si |
| Inserire risultato provvisorio | No | No | Si | Si |
| Confermare risultato ufficiale | No | No | Si, auditato | Si, auditato |
| Rettificare risultato ufficiale | No | No | Limitato e auditato | Si, auditato |
| Configurare playoff/playout | No | No | Si, auditato | Si, auditato |
| Caricare media | No | Limitato | Si | Si |
| Pubblicare media | No | No | Si | Si |
| Moderare media | No | No | Limitato | Si |
| Consultare audit | No | No | Ambito assegnato | Globale |

## 10. Flussi principali migliorati

### 10.1 Setup torneo

Attore: Amministratore.

Flusso:

1. Crea torneo.
2. Imposta stato iniziale.
3. Imposta visibilità.
4. Assegna gestori torneo.
5. Salva configurazione minima.

Controlli:

- solo amministratore;
- nome torneo coerente;
- gestori validi;
- audit per assegnazione ruoli.

### 10.2 Setup stagione

Attore: Gestore Torneo o Amministratore.

Flusso:

1. Seleziona torneo.
2. Crea stagione in stato in preparazione.
3. Definisce regole base.
4. Configura eventuali fasi supportate.
5. Prepara squadre, giocatori e calendario.

Controlli:

- stagione sempre collegata a torneo;
- configurazione fasi validabile;
- nessuna pubblicazione automatica.

### 10.3 Gestione squadra

Attore: Gestore Torneo o Amministratore.

Flusso:

1. Crea squadra nella stagione.
2. Associa massimo 2 giocatori.
3. Verifica unicità del giocatore nella stagione.
4. Associa eventuale logo.
5. Salva.

Controlli:

- massimo 2 giocatori;
- nessun giocatore duplicato;
- nessun giocatore in altra squadra della stessa stagione;
- modifiche in stagione attiva limitate e auditabili.

### 10.4 Inserimento e conferma risultato

Attore: Gestore Torneo o Amministratore.

Flusso:

1. Seleziona partita.
2. Inserisce risultato.
3. Il sistema valida set e game.
4. Il risultato viene salvato come provvisorio.
5. Utente autorizzato conferma il risultato.
6. Il risultato diventa ufficiale.
7. Il Ranking Domain marca la classifica come da aggiornare o ricalcolabile.
8. Audit registra la conferma.

Controlli:

- partita esistente;
- squadre coerenti;
- risultato ammesso;
- operazione autorizzata;
- risultato ufficiale auditato.

### 10.5 Rettifica risultato

Attore: Amministratore o Gestore Torneo autorizzato.

Flusso:

1. Seleziona risultato ufficiale.
2. Inserisce nuovo risultato.
3. Inserisce motivazione obbligatoria.
4. Il sistema valida la rettifica.
5. Il valore precedente viene conservato.
6. La classifica viene ricalcolata o invalidata per ricalcolo.
7. Audit registra la rettifica.

Controlli:

- motivazione obbligatoria;
- audit obbligatorio;
- autorizzazione più restrittiva rispetto alla conferma ordinaria.

### 10.6 Calcolo classifica

Attore: Sistema.

Flusso logico:

1. Seleziona stagione e fase.
2. Recupera squadre valide.
3. Recupera partite ufficiali valide.
4. Calcola statistiche.
5. Applica punti.
6. Applica scontro diretto.
7. Applica differenza set.
8. Applica differenza game.
9. Identifica parità persistenti.
10. Espone risultato alla UI.

Strategia tecnica consigliata:

- calcolo on demand per gestioni amministrative e stagioni piccole;
- snapshot derivato per viste pubbliche molto consultate;
- invalidazione snapshot su conferma, rettifica o annullamento risultato;
- mai modifica manuale diretta della classifica.

### 10.7 Pubblicazione dati

Attore: Gestore Torneo o Amministratore.

Flusso:

1. Verifica dati minimi.
2. Imposta torneo o stagione come pubblicabile.
3. Il Publication Domain espone solo campi consentiti.
4. Le viste pubbliche usano dati filtrati.

Controlli:

- nessun dato privato pubblicato per errore;
- risultati non ufficiali nascosti salvo scelta esplicita;
- media pubblici separati dai media privati.

### 10.8 Gestione media

Attore: Gestore Torneo, Giocatore autorizzato o Amministratore.

Flusso:

1. Carica media.
2. Associa contesto.
3. Imposta visibilità.
4. Pubblica se autorizzato.

Controlli:

- limiti su dimensione e formato;
- bucket separati per pubblico e privato;
- metadati obbligatori;
- rimozione media senza cancellazione dati competitivi.

## 11. Strategia Ranking e Performance

### 11.1 Problema

La classifica deve essere dinamica, ma un ricalcolo completo a ogni richiesta può diventare un collo di bottiglia.

Il rischio cresce con:

- molte squadre;
- molte stagioni;
- molti visitatori pubblici;
- frequenti aggiornamenti risultati;
- gallery e classifiche caricate insieme.

### 11.2 Soluzione proposta

Usare una strategia ibrida:

- dati primari sempre autorevoli;
- calcolo classifica sempre ricostruibile;
- snapshot tecnico opzionale per letture pubbliche;
- invalidazione snapshot quando cambia un risultato ufficiale;
- ricalcolo controllato dopo operazioni competitive.

### 11.3 Regole

- La classifica non può essere editata manualmente.
- Lo snapshot non è fonte di verità.
- Lo snapshot può essere eliminato e ricreato.
- Le viste amministrative possono mostrare dati ricalcolati in tempo reale.
- Le viste pubbliche possono usare snapshot validi per ridurre carico.
- Ogni snapshot deve essere riconducibile a stagione, fase e timestamp di calcolo.

## 12. Strategia Dati

### 12.1 Dati transazionali

Rappresentano la fonte di verità.

Includono:

- tornei;
- stagioni;
- squadre;
- giocatori;
- appartenenze;
- partite;
- risultati;
- configurazioni fase;
- ruoli;
- media metadata;
- audit.

### 12.2 Dati derivati

Possono essere calcolati o materializzati.

Includono:

- classifiche;
- statistiche squadra;
- qualificazioni;
- stato tabellone;
- riepiloghi pubblici.

### 12.3 Vincoli obbligatori

Devono essere protetti lato dati o backend:

- stagione collegata a torneo;
- squadra collegata a stagione;
- giocatore unico per stagione;
- massimo 2 giocatori per squadra;
- partita tra due squadre diverse;
- partita tra squadre della stessa stagione;
- risultato ufficiale valido;
- modifica dati storici solo autorizzata;
- media con proprietario o contesto.

## 13. Supabase Architecture

### 13.1 Responsabilità Supabase

Supabase deve gestire:

- autenticazione;
- profili applicativi;
- persistenza;
- policy di sicurezza;
- storage media;
- funzioni backend per operazioni critiche;
- viste di lettura pubblica;
- audit.

### 13.2 Row Level Security

RLS deve essere attiva sulle tabelle sensibili.

Policy minime:

- visitatore legge solo dati pubblici;
- giocatore legge dati pubblici e dati personali consentiti;
- gestore torneo legge e modifica solo tornei assegnati;
- amministratore ha accesso globale;
- scritture competitive richiedono ruolo esplicito;
- audit non modificabile dagli utenti ordinari.

### 13.3 Funzioni backend controllate

Operazioni da preferire tramite funzioni o percorsi server-side controllati:

- conferma risultato;
- rettifica risultato;
- annullamento risultato;
- cambio composizione squadra in stagione attiva;
- configurazione playoff/playout;
- archiviazione stagione;
- assegnazione ruoli.

Motivo:

- ridurre duplicazione logica;
- garantire transazionalità;
- registrare audit;
- invalidare snapshot classifica;
- impedire bypass dal client.

### 13.4 Storage media

Strategia:

- bucket pubblico per asset realmente pubblici;
- bucket privato per immagini personali o non pubblicate;
- metadati nel database;
- policy coerenti tra record media e file storage;
- limiti su dimensione e tipo file;
- rimozione logica prima della rimozione fisica quando serve audit.

## 14. Frontend Architecture

### 14.1 Responsabilità frontend

Il frontend deve:

- presentare dati;
- guidare flussi utente;
- fare validazioni immediate;
- gestire stato UI;
- distinguere aree pubbliche e riservate;
- chiamare servizi dati centralizzati;
- non contenere l'unica copia della logica critica.

### 14.2 Organizzazione consigliata

Struttura logica:

- app shell;
- routing;
- public module;
- auth module;
- management module;
- admin module;
- player module;
- shared UI;
- data access;
- domain services;
- PWA support.

### 14.3 Stato applicativo

Regole:

- stato server separato dallo stato UI;
- dati remoti caricati tramite servizi dedicati;
- evitare cache client usata come fonte autorevole;
- invalidare viste dopo operazioni competitive;
- non mostrare conferme definitive prima della conferma backend.

## 15. PWA Architecture

### 15.1 Obiettivo

La PWA deve essere installabile e affidabile nella consultazione, soprattutto mobile.

### 15.2 Strategia offline

Prima versione:

- offline limitato alla shell e a dati pubblici recentemente consultati;
- nessuna modifica competitiva offline;
- nessun risultato salvato localmente come se fosse ufficiale;
- messaggi chiari quando un'operazione richiede rete.

### 15.3 Caching

Cache consigliata:

- asset statici;
- shell applicativa;
- dati pubblici a bassa volatilità;
- immagini ottimizzate.

Da non cacheare in modo aggressivo:

- sessioni;
- dati amministrativi;
- risultati appena modificati;
- viste con permessi sensibili.

## 16. Media Architecture

### 16.1 Colli di bottiglia media

Rischi:

- gallery troppo pesanti;
- immagini originali servite direttamente;
- troppe immagini in una vista;
- media privati accidentalmente pubblici;
- cancellazione fisica senza audit.

### 16.2 Regole migliorate

- usare paginazione o caricamento progressivo;
- separare media pubblici e privati;
- salvare metadati applicativi;
- associare media a contesto;
- non usare file path come identità di dominio;
- prevedere placeholder per immagini mancanti;
- limitare formati e dimensioni;
- non bloccare il dominio competitivo se un media fallisce.

## 17. Phase Architecture

### 17.1 Scelta migliorata

Playoff e playout devono partire con un set limitato di formati.

Formati iniziali consigliati:

- nessuna fase;
- finale secca;
- semifinali e finale;
- quarti, semifinali e finale;
- playout a eliminazione diretta semplice.

### 17.2 Regole

- ogni fase appartiene a una stagione;
- ogni partita appartiene a una fase;
- le fasi non devono alterare la classifica regular season;
- la qualificazione usa la classifica regular season salvo override amministrativo auditato;
- override manuali devono essere eccezioni, non flusso ordinario.

### 17.3 Scalabilità funzionale

Nuovi formati devono essere aggiunti solo quando:

- esiste una regola documentata;
- il formato è validabile;
- il formato è testabile;
- il formato non rompe classifiche storiche.

## 18. Security Architecture

### 18.1 Superficie di attacco

Punti sensibili:

- risultati ufficiali;
- rettifiche;
- composizione squadre;
- ruoli;
- media personali;
- dati non pubblici;
- audit;
- bucket storage.

### 18.2 Controlli obbligatori

- RLS sulle tabelle sensibili.
- Policy storage coerenti con policy dati.
- Funzioni backend per operazioni critiche.
- Audit obbligatorio per operazioni ad alto rischio.
- Separazione tra ruolo applicativo e dati profilo.
- Nessun dato sensibile affidato solo a filtri frontend.
- Validazione backend di ogni vincolo competitivo.
- Principle of least privilege per gestori torneo.

### 18.3 Privacy giocatori

Regole:

- dati personali minimi nelle viste pubbliche;
- foto profilo pubbliche solo se abilitate;
- gallery pubblica solo con visibilità esplicita;
- possibilità di nascondere o rimuovere media;
- nessuna esposizione pubblica di informazioni non necessarie.

## 19. Audit Architecture

### 19.1 Strategia migliorata

L'audit deve essere mirato, non onnipresente.

Audit obbligatorio:

- conferma risultato;
- rettifica risultato;
- annullamento risultato;
- cambio composizione squadra dopo avvio stagione;
- configurazione playoff;
- configurazione playout;
- cambio ruolo;
- archiviazione stagione;
- override qualificazione o piazzamento.

Audit opzionale:

- modifica descrizioni;
- aggiornamento logo;
- aggiornamento foto profilo;
- modifica media non pubblici.

### 19.2 Contenuto evento audit

Ogni evento rilevante deve avere:

- tipo evento;
- autore;
- ruolo autore;
- timestamp;
- contesto;
- valore precedente;
- valore nuovo;
- motivazione se richiesta;
- esito operazione.

## 20. Scalability Architecture

### 20.1 Percorsi ad alto traffico

Percorsi probabili:

- classifica pubblica;
- calendario pubblico;
- risultati pubblici;
- gallery pubblica;
- dettaglio squadra;
- dettaglio stagione.

Strategie:

- dati pubblici filtrati e leggeri;
- paginazione gallery;
- snapshot classifica;
- caricamento progressivo;
- separazione query pubbliche da query amministrative;
- indici coerenti con filtri torneo, stagione e fase.

### 20.2 Percorsi a bassa frequenza ma alto rischio

Percorsi:

- conferma risultato;
- rettifica risultato;
- cambio ruoli;
- archiviazione;
- modifica configurazioni fase.

Strategie:

- transazioni;
- validazioni server-side;
- audit;
- invalidazione dati derivati;
- feedback esplicito in UI.

## 21. Complessità da rimandare

Per proteggere l'MVP, rimandare:

- proposta risultato da parte dei giocatori;
- notifiche push;
- chat;
- pagamenti;
- iscrizioni economiche;
- moderazione avanzata;
- configuratore playoff completamente libero;
- offline editing;
- reportistica avanzata;
- statistiche dettagliate giocatore;
- gestione prenotazione campi.

Queste funzioni non devono condizionare il design del dominio competitivo di base.

## 22. Struttura di navigazione

### 22.1 Pubblica

- tornei;
- dettaglio torneo;
- stagione;
- squadre;
- calendario;
- risultati;
- classifica;
- playoff/playout pubblicati;
- gallery.

### 22.2 Gestione torneo

- dashboard torneo;
- stagioni;
- squadre;
- giocatori;
- partite;
- risultati;
- fasi;
- media;
- pubblicazione;
- audit ambito torneo.

### 22.3 Amministrazione

- tornei;
- utenti e ruoli;
- audit globale;
- media;
- impostazioni;
- operazioni straordinarie.

### 22.4 Giocatore

- profilo;
- squadra;
- calendario;
- risultati;
- classifica.

## 23. Stati principali

### 23.1 Torneo

- in preparazione;
- attivo;
- archiviato.

### 23.2 Stagione

- in preparazione;
- attiva;
- conclusa;
- archiviata.

### 23.3 Partita

- programmata;
- rinviata;
- risultato provvisorio;
- risultato ufficiale;
- annullata;
- non omologata.

### 23.4 Media

- bozza;
- pubblicato;
- nascosto;
- rimosso.

Nota:

- evitare stati aggiuntivi finché non servono a un flusso reale.

## 24. Roadmap migliorata

### 24.1 MVP competitivo

Obiettivo:

- rendere gestibile una stagione reale con classifica corretta.

Include:

- autenticazione base;
- ruoli visitatore, gestore torneo, amministratore;
- torneo;
- stagione;
- squadre;
- giocatori;
- partite;
- risultati ufficiali;
- classifica;
- pubblicazione dati pubblici;
- loghi squadra base.

### 24.2 Stabilizzazione dominio

Include:

- audit mirato;
- rettifiche risultati;
- foto profilo;
- gallery base;
- snapshot classifica per letture pubbliche;
- controlli sicurezza completi.

### 24.3 Fasi avanzate

Include:

- playoff supportati;
- playout supportati;
- qualificazioni automatiche;
- override auditati;
- piazzamenti finali.

### 24.4 Esperienza PWA

Include:

- installabilità;
- cache asset statici;
- fallback offline consultazione;
- ottimizzazione mobile;
- caricamento progressivo media.

### 24.5 Funzioni evolutive

Include:

- area giocatore avanzata;
- notifiche;
- proposte risultato;
- report;
- statistiche avanzate;
- integrazioni esterne.

## 25. Decisioni architetturali finali

Decisioni:

- La stagione è il confine competitivo principale.
- Il torneo è il contenitore organizzativo.
- La squadra è una coppia di massimo 2 giocatori.
- Il giocatore può appartenere a una sola squadra nella stessa stagione.
- La classifica è derivata dai risultati ufficiali.
- Lo snapshot classifica è ammesso solo come ottimizzazione tecnica.
- Le operazioni competitive critiche devono essere protette lato backend.
- Le letture pubbliche devono essere ottimizzate e filtrate.
- Playoff e playout sono configurabili tramite modelli supportati, non tramite regole arbitrarie.
- Media e dati competitivi devono restare separati.
- Le immagini personali devono avere visibilità esplicita.
- L'audit deve essere obbligatorio solo per operazioni ad alto impatto.
- L'MVP deve evitare funzioni collaborative avanzate non necessarie alla gestione torneo.

## 26. Criteri di accettazione architetturale

L'architettura è accettabile se:

- impedisce modifiche competitive non autorizzate;
- protegge i dati con policy backend;
- consente di calcolare la classifica dai risultati ufficiali;
- permette di ottimizzare le classifiche pubbliche senza renderle fonte di verità;
- mantiene separati dati competitivi e media;
- limita playoff e playout a configurazioni validabili;
- supporta multi torneo e multi stagione;
- preserva lo storico delle stagioni concluse;
- consente un MVP semplice ma estendibile;
- riduce ricalcoli inutili nelle aree pubbliche;
- evita offline editing per operazioni competitive;
- espone ai visitatori solo dati pubblicabili.

## 27. Rischi residui

### 27.1 Ranking complesso con molte parità

Rischio:

- lo scontro diretto tra più squadre può generare casi difficili.

Mitigazione:

- definire test specifici;
- documentare regole di classifica avulsa;
- prevedere parità persistente o override auditato.

### 27.2 Policy Supabase troppo permissive

Rischio:

- una policy errata può esporre dati o consentire modifiche.

Mitigazione:

- test di autorizzazione;
- revisione policy;
- principio del privilegio minimo;
- funzioni backend per scritture critiche.

### 27.3 Snapshot non aggiornati

Rischio:

- classifica pubblica non allineata dopo una rettifica.

Mitigazione:

- invalidazione obbligatoria;
- timestamp snapshot;
- fallback a ricalcolo;
- controlli in fase di conferma risultato.

### 27.4 Media storage fuori controllo

Rischio:

- crescita eccessiva di immagini e costi.

Mitigazione:

- limiti file;
- compressione o trasformazioni;
- paginazione;
- policy di rimozione;
- monitoraggio utilizzo storage.

### 27.5 MVP troppo grande

Rischio:

- troppe funzioni rallentano la consegna.

Mitigazione:

- implementare prima il nucleo competitivo;
- rimandare area giocatore avanzata;
- rimandare notifiche e pagamenti;
- supportare pochi formati fase all'inizio.

