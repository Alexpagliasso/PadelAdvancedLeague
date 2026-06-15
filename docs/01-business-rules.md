# Business Rules

## 1. Scopo del documento

Questo documento definisce le regole di business della PWA per la gestione di tornei di padel.

Le regole qui descritte rappresentano il riferimento funzionale per:

- progettazione del dominio applicativo;
- modellazione dati;
- validazioni lato applicazione e lato backend;
- calcolo classifiche;
- gestione stagioni, tornei, squadre, partite, playoff e playout;
- definizione dei casi di test funzionali.

Il documento non descrive scelte implementative di dettaglio, componenti UI, codice, query o struttura tecnica delle tabelle.

## 2. Principi generali

La piattaforma deve supportare la gestione di più tornei e più stagioni.

Ogni dato competitivo deve essere sempre contestualizzato almeno rispetto a:

- torneo;
- stagione;
- squadra;
- partita, quando applicabile.

La piattaforma deve preservare la coerenza storica delle stagioni concluse. Eventuali modifiche successive alla conclusione di una stagione devono essere considerate operazioni amministrative straordinarie e devono essere gestite con particolare attenzione.

La classifica non deve essere considerata un dato primario inserito manualmente, ma un risultato derivato dai dati ufficiali delle partite.

## 3. Entità di dominio

### 3.1 Torneo

Un torneo rappresenta una competizione organizzata.

Regole:

- Il sistema deve supportare più tornei.
- Ogni torneo può avere una o più stagioni.
- Un torneo può avere configurazioni proprie, incluse eventuali regole per playoff e playout.
- Un torneo può essere attivo, archiviato o in preparazione.
- Un torneo archiviato deve rimanere consultabile, salvo diversa decisione amministrativa.

### 3.2 Stagione

Una stagione rappresenta una specifica edizione temporale di un torneo.

Regole:

- Il sistema deve supportare più stagioni per lo stesso torneo.
- Una stagione appartiene a un solo torneo.
- Una stagione contiene squadre, partite, classifiche e configurazioni competitive riferite a quella edizione.
- L'appartenenza di un giocatore a una squadra è vincolata alla stagione.
- Una stagione può trovarsi almeno nei seguenti stati logici:
  - in preparazione;
  - attiva;
  - conclusa;
  - archiviata.
- Una stagione conclusa o archiviata non dovrebbe consentire modifiche ordinarie ai risultati, salvo ruolo amministrativo autorizzato.

### 3.3 Squadra

Una squadra corrisponde a una coppia di padel.

Regole:

- Una squadra appartiene a una stagione.
- Una squadra deve essere composta da massimo 2 giocatori.
- Una squadra può avere meno di 2 giocatori solo se la stagione o il torneo sono ancora in preparazione, oppure se il regolamento operativo lo consente per esigenze amministrative.
- Una squadra non può avere più di 2 giocatori nella stessa stagione.
- Una squadra può avere un logo.
- Il logo della squadra è un contenuto multimediale associato alla squadra.
- Il nome della squadra deve essere identificabile all'interno della stagione.
- Il sistema deve impedire duplicazioni ambigue di squadra nella stessa stagione, secondo le regole di unicità definite dal prodotto.

### 3.4 Giocatore

Un giocatore rappresenta una persona fisica che partecipa ai tornei.

Regole:

- Un giocatore può avere una foto profilo.
- Un giocatore può partecipare a più stagioni.
- Un giocatore può partecipare a più tornei, purché nel rispetto dei vincoli della singola stagione.
- Un giocatore può appartenere a una sola squadra nella stessa stagione.
- Lo stesso giocatore non può essere assegnato a due squadre diverse nella medesima stagione.
- Il vincolo di unicità del giocatore nella stagione deve essere applicato indipendentemente dal torneo se la stagione è modellata come contesto competitivo globale; se invece la stagione è interna al torneo, il vincolo si applica alla coppia torneo-stagione.

### 3.5 Partita

Una partita rappresenta l'incontro ufficiale tra due squadre.

Regole:

- Una partita appartiene a una stagione.
- Una partita può appartenere a una fase specifica della competizione, ad esempio regular season, playoff o playout.
- Una partita deve coinvolgere esattamente due squadre.
- Le due squadre di una partita devono essere diverse.
- Le squadre di una partita devono appartenere alla stessa stagione della partita.
- Il risultato della partita deve essere espresso in set vinti dalle due squadre.
- Ai fini del calcolo della classifica, sono validi solo i risultati ufficializzati.
- Una partita non disputata, rinviata, annullata o non omologata non deve incidere sulla classifica ordinaria.
- Il sistema deve distinguere tra risultato inserito, risultato confermato e risultato eventualmente rettificato, se tale workflow viene adottato.

## 4. Regole di composizione squadra

Una squadra è una coppia di padel.

Regole obbligatorie:

- Numero massimo di giocatori per squadra: 2.
- Un giocatore può appartenere a una sola squadra nella stessa stagione.
- Non è ammesso inserire lo stesso giocatore due volte nella stessa squadra.
- Non è ammesso trasferire liberamente un giocatore tra squadre nella stessa stagione se ciò altera risultati già disputati, salvo operazione amministrativa esplicita.

Regole consigliate:

- Durante la fase di preparazione della stagione può essere consentita la modifica della composizione squadra.
- Dopo l'inizio della stagione, la modifica della composizione squadra dovrebbe essere limitata ad amministratori autorizzati.
- Le modifiche alla composizione squadra dovrebbero essere tracciabili quando incidono su dati già pubblicati.

## 5. Sistema punti

Il sistema punti della regular season è calcolato in base al risultato in set della partita.

| Risultato | Punti squadra vincente | Punti squadra perdente |
| --- | ---: | ---: |
| 2-0 | 3 | 0 |
| 2-1 | 2 | 1 |
| 1-2 | 1 | 2 |
| 0-2 | 0 | 3 |

Regole:

- Una vittoria per 2-0 assegna 3 punti alla squadra vincente e 0 alla squadra perdente.
- Una vittoria per 2-1 assegna 2 punti alla squadra vincente e 1 alla squadra perdente.
- Una sconfitta per 1-2 assegna 1 punto alla squadra perdente.
- Una sconfitta per 0-2 assegna 0 punti alla squadra perdente.
- Il totale punti di una squadra è la somma dei punti ottenuti in tutte le partite ufficiali valide della stagione e della fase considerate.
- I punti non devono essere inseriti manualmente per singola squadra, salvo eventuali rettifiche amministrative esplicitamente previste.

## 6. Risultati e validità delle partite

Una partita produce effetti competitivi solo quando il risultato è valido e ufficiale.

Regole:

- Il risultato deve essere coerente con il formato previsto dal torneo.
- Per il sistema punti attuale, una partita deve terminare con una squadra a 2 set vinti.
- I risultati ammessi ai fini del punteggio sono:
  - 2-0;
  - 2-1;
  - 1-2;
  - 0-2.
- I game vinti e persi devono essere registrati quando necessari per la differenza game.
- La differenza set e la differenza game devono essere calcolabili a partire dai risultati delle partite ufficiali.
- Una partita senza risultato ufficiale non deve alterare classifica, statistiche competitive o criteri di qualificazione.

## 7. Classifica

La classifica deve essere calcolata dinamicamente.

Regole:

- La classifica non deve essere mantenuta come dato statico primario.
- La classifica deve essere derivata dalle partite ufficiali della stagione e della fase competitiva rilevante.
- Ogni aggiornamento, inserimento, rettifica o annullamento di un risultato ufficiale deve riflettersi nella classifica.
- La classifica deve essere consultabile per torneo e stagione.
- La classifica deve includere almeno:
  - posizione;
  - squadra;
  - partite giocate;
  - partite vinte;
  - partite perse;
  - set vinti;
  - set persi;
  - differenza set;
  - game vinti;
  - game persi;
  - differenza game;
  - punti.

## 8. Ordinamento classifica

L'ordinamento della classifica deve seguire i criteri sotto indicati, in ordine di priorità.

1. Punti
2. Scontro diretto
3. Differenza set
4. Differenza game

### 8.1 Punti

Regole:

- La squadra con più punti precede la squadra con meno punti.
- I punti sono calcolati secondo il sistema punti definito in questo documento.

### 8.2 Scontro diretto

Regole:

- In caso di parità di punti tra due squadre, prevale la squadra con il miglior risultato nello scontro diretto.
- Se le due squadre hanno disputato più scontri diretti nella stessa stagione o fase, il criterio deve essere applicato considerando l'insieme degli scontri diretti validi.
- In caso di parità tra più di due squadre, il criterio dello scontro diretto deve essere applicato alla classifica avulsa tra le sole squadre coinvolte, se il regolamento del torneo lo prevede.
- Se lo scontro diretto non è disponibile, non è stato disputato o non risolve la parità, si passa al criterio successivo.

### 8.3 Differenza set

Regole:

- La differenza set è calcolata come set vinti meno set persi.
- La squadra con migliore differenza set precede la squadra con peggiore differenza set.
- Devono essere considerate solo le partite ufficiali valide per la classifica della fase interessata.

### 8.4 Differenza game

Regole:

- La differenza game è calcolata come game vinti meno game persi.
- La squadra con migliore differenza game precede la squadra con peggiore differenza game.
- Devono essere considerate solo le partite ufficiali valide per la classifica della fase interessata.

### 8.5 Persistenza della parità

Se tutti i criteri previsti non risolvono la parità, il sistema deve applicare una regola esplicita definita dal torneo, ad esempio:

- posizione condivisa;
- sorteggio amministrativo;
- spareggio;
- ordinamento manuale autorizzato;
- criterio aggiuntivo configurabile.

La regola di risoluzione finale deve essere definita prima della pubblicazione ufficiale della classifica finale.

## 9. Playoff

I playoff sono configurabili.

Regole:

- Un torneo o una stagione può prevedere una fase playoff.
- I playoff possono essere abilitati o disabilitati.
- Il numero di squadre qualificate ai playoff deve essere configurabile.
- I criteri di qualificazione devono basarsi sulla classifica della fase precedente, salvo diversa configurazione.
- La struttura dei playoff deve essere configurabile, ad esempio:
  - semifinale e finale;
  - quarti, semifinale e finale;
  - tabellone a eliminazione diretta;
  - altra formula definita dal regolamento.
- Le partite playoff devono essere distinguibili dalle partite di regular season.
- I risultati playoff non devono modificare la classifica della regular season, salvo regola esplicita contraria.
- Il vincitore dei playoff può determinare il vincitore finale della stagione se previsto dal regolamento.

## 10. Playout

I playout sono configurabili.

Regole:

- Un torneo o una stagione può prevedere una fase playout.
- I playout possono essere abilitati o disabilitati.
- Il numero di squadre coinvolte nei playout deve essere configurabile.
- I criteri di accesso ai playout devono basarsi sulla classifica della fase precedente, salvo diversa configurazione.
- La struttura dei playout deve essere configurabile.
- Le partite playout devono essere distinguibili dalle partite di regular season e playoff.
- I risultati playout non devono modificare la classifica della regular season, salvo regola esplicita contraria.
- L'esito dei playout può determinare salvezza, retrocessione, piazzamento finale o altra conseguenza competitiva prevista dal regolamento.

## 11. Gallery fotografica

La piattaforma deve supportare una gallery fotografica.

Regole:

- Le fotografie possono essere associate a torneo, stagione, squadra, partita o evento, secondo le esigenze del prodotto.
- Le fotografie devono poter essere pubblicate o nascoste.
- Le fotografie pubbliche devono essere visibili agli utenti autorizzati o al pubblico, in base alle impostazioni della piattaforma.
- Le fotografie devono rispettare eventuali vincoli di privacy e consenso dei soggetti ritratti.
- La rimozione di una fotografia dalla gallery non deve compromettere dati competitivi come classifiche, partite o squadre.

## 12. Loghi squadra

La piattaforma deve supportare i loghi delle squadre.

Regole:

- Ogni squadra può avere un logo.
- Il logo deve essere associato alla squadra e alla relativa stagione.
- La modifica del logo non deve modificare risultati, classifica o statistiche.
- In assenza di logo, il sistema deve prevedere una rappresentazione alternativa coerente.
- Il logo deve essere gestito come contenuto multimediale e soggetto alle regole di visibilità previste dalla piattaforma.

## 13. Foto profilo giocatori

La piattaforma deve supportare le foto profilo dei giocatori.

Regole:

- Ogni giocatore può avere una foto profilo.
- La foto profilo identifica visivamente il giocatore nelle viste pubbliche o amministrative.
- La modifica della foto profilo non deve alterare dati competitivi.
- In assenza di foto profilo, il sistema deve prevedere una rappresentazione alternativa coerente.
- La pubblicazione della foto profilo deve rispettare eventuali vincoli di privacy e consenso.

## 14. PWA installabile

La piattaforma deve essere una Progressive Web App installabile.

Regole:

- L'app deve poter essere installata sui dispositivi compatibili.
- L'app deve fornire un'esperienza coerente su desktop e mobile.
- Le funzionalità critiche di consultazione devono essere pensate per uso mobile.
- La PWA deve presentare nome, icone e configurazioni necessarie all'installazione.
- L'app deve gestire in modo chiaro gli stati di rete assente, rete lenta o dati non disponibili.
- L'eventuale disponibilità offline deve essere definita per area funzionale, distinguendo tra consultazione e modifica dati.

## 15. Ruoli e autorizzazioni

Le regole di autorizzazione devono proteggere le operazioni che modificano dati competitivi o contenuti pubblici.

Ruoli minimi consigliati:

- amministratore;
- gestore torneo;
- giocatore;
- visitatore.

Regole:

- Solo utenti autorizzati possono creare o modificare tornei, stagioni, squadre e partite.
- Solo utenti autorizzati possono inserire, confermare, rettificare o annullare risultati.
- Solo utenti autorizzati possono configurare playoff e playout.
- Solo utenti autorizzati possono caricare, modificare o rimuovere contenuti multimediali.
- I visitatori possono consultare solo i dati resi pubblici.

## 16. Stati e pubblicazione

I dati competitivi possono avere stati diversi in base al loro ciclo di vita.

Regole:

- Un torneo in preparazione può essere non visibile pubblicamente.
- Una stagione in preparazione può consentire modifiche più ampie.
- Una stagione attiva deve applicare vincoli più restrittivi sulle modifiche che incidono sulla competizione.
- Una stagione conclusa deve impedire modifiche ordinarie.
- I risultati possono essere considerati provvisori prima della conferma ufficiale.
- La classifica pubblica dovrebbe basarsi solo su risultati ufficiali, salvo scelta esplicita di mostrare risultati provvisori.

## 17. Integrità dei dati

Il sistema deve impedire stati incoerenti.

Regole:

- Non può esistere una squadra senza stagione di riferimento.
- Non può esistere una stagione senza torneo di riferimento.
- Non può esistere una partita valida tra squadre appartenenti a stagioni diverse.
- Non può esistere una partita valida con la stessa squadra su entrambi i lati.
- Non può essere assegnato un giocatore a più di una squadra nella stessa stagione.
- Non può essere superato il limite massimo di 2 giocatori per squadra.
- Non possono essere calcolati punti da risultati incompleti, non validi o non ufficiali.
- Non devono essere persi i dati storici necessari a ricostruire classifiche e risultati di stagioni precedenti.

## 18. Regole di audit e tracciabilità

Per le operazioni che incidono sul valore sportivo della competizione, è consigliata la tracciabilità.

Operazioni da tracciare:

- creazione o modifica di una stagione;
- creazione o modifica di una squadra;
- modifica della composizione squadra;
- inserimento risultato;
- conferma risultato;
- rettifica risultato;
- annullamento risultato;
- configurazione playoff;
- configurazione playout;
- modifica manuale di criteri o piazzamenti finali.

Regole:

- Ogni modifica rilevante dovrebbe conservare autore, data e motivazione.
- Le rettifiche ai risultati dovrebbero mantenere evidenza del valore precedente.
- L'audit deve essere consultabile dagli utenti autorizzati.

## 19. Regole di privacy e contenuti media

La piattaforma gestisce contenuti potenzialmente personali, come foto profilo e fotografie della gallery.

Regole:

- Le immagini dei giocatori devono essere trattate come dati personali.
- La pubblicazione di foto profilo e gallery deve rispettare i consensi richiesti.
- Gli amministratori devono poter rimuovere contenuti non appropriati o non autorizzati.
- La rimozione o sostituzione di un'immagine non deve cancellare il giocatore, la squadra o i risultati associati.
- I contenuti media devono essere distinguibili dai dati competitivi primari.

## 20. Regole fuori ambito

Le seguenti aree non sono definite da questo documento e richiedono decisioni successive:

- formato dettagliato dei set e dei game;
- gestione ritiri, walkover, penalità e vittorie a tavolino;
- criteri aggiuntivi in caso di parità persistente;
- regole di mercato, sostituzioni o infortuni;
- gestione pagamenti o iscrizioni;
- notifiche push;
- moderazione avanzata dei contenuti;
- granularità esatta dei permessi utente;
- visibilità pubblica o privata dei singoli tornei.

## 21. Assunzioni correnti

Le regole contenute in questo documento assumono che:

- la regular season produca una classifica ordinata;
- playoff e playout siano fasi successive e configurabili;
- la classifica della regular season sia separata dagli esiti di playoff e playout;
- la squadra rappresenti sempre una coppia di padel;
- il limite massimo di giocatori per squadra sia sempre pari a 2;
- i punti siano derivati dal risultato in set;
- i game siano necessari almeno per il criterio di differenza game.

## 22. Criteri di accettazione funzionale

Il sistema rispetta le business rules se:

- consente di gestire più tornei;
- consente di gestire più stagioni per torneo;
- impedisce squadre con più di 2 giocatori;
- impedisce a un giocatore di appartenere a più squadre nella stessa stagione;
- calcola automaticamente i punti in base al risultato della partita;
- calcola dinamicamente la classifica;
- ordina la classifica secondo punti, scontro diretto, differenza set e differenza game;
- consente la configurazione di playoff;
- consente la configurazione di playout;
- supporta gallery fotografica;
- supporta loghi squadra;
- supporta foto profilo giocatori;
- fornisce un'esperienza PWA installabile.

