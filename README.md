# Seconda Pagina — GitHub Pages + Supabase

Frontend statico responsive per vendere libri scolastici usati senza pagamenti online.

## File da pubblicare

Per GitHub Pages servono solo questi file/cartelle:

- `index.html`
- `admin.html`
- `app.js`
- `admin.js`
- `condizioni.js`
- `push.js`, `sw.js`, `install.js`, `manifest.webmanifest` e `icons/`, per installazione e notifiche sul telefono
- `richiesta.html`
- `richiesta.js`
- `richieste-common.js`
- `background.css`
- `background.js`
- `supabase-config.js`
- `.nojekyll`
- `README.md`
- `supabase/schema.sql`, utile come riferimento per ricreare il database
- `supabase/messaggi.sql`, aggiornamento per richieste e messaggi
- `supabase/migrations/`, aggiornamenti incrementali del database
- `supabase/functions/push-notifications/`, sorgente della funzione da distribuire su Supabase (non viene eseguita da GitHub Pages)

Non serve fare build e non serve caricare `node_modules`. Il sito usa HTML, Tailwind via CDN, JavaScript puro e Supabase dal browser.

## 1. Configura Supabase

1. Crea un progetto Supabase.
2. Apri **SQL Editor → New query**.
3. Nel file `supabase/schema.sql` sostituisci `proprietario@example.com` con l'email che userai in **Supabase Auth**.
4. Incolla lo script completo nell'editor SQL e premi **Run**. Poi esegui anche tutto `supabase/messaggi.sql` in una nuova query.
5. In **Project Settings → API** copia il **Project URL** e la chiave pubblica **Anon / Publishable**.
6. Incollali in `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://tuo-progetto.supabase.co",
  anonKey: "la-tua-chiave-anon-pubblica",
  ownerEmail: "la-tua-email@example.com"
};
```

La Anon Key è progettata per essere pubblica nel browser. La sicurezza è affidata alle policy RLS. Non inserire mai la chiave `service_role` nel repository o nel frontend.

## 2. Crea l'utente admin

1. Vai in **Supabase → Authentication → Users**.
2. Crea un utente con la stessa email inserita nello script SQL e in `ownerEmail`.
3. Imposta una password.
4. Usa questa email e password su `admin.html`.

Se attivi conferme email o magic link, dopo il deploy aggiungi l'URL GitHub Pages in **Authentication → URL Configuration**.

## 3. Come funzionano le RLS

Gli script SQL abilitano RLS e impostano queste regole:

- chiunque (`anon` e `authenticated`) può leggere `Libri`;
- chiunque può creare un'offerta con la funzione `crea_richiesta`, solo con stato `In attesa` e per un libro disponibile; l'inserimento diretto nella tabella viene disabilitato;
- nessun visitatore può leggere le offerte e i relativi contatti;
- solo un utente autenticato con la tua email può inserire, modificare o eliminare libri e gestire le offerte;
- l'acquirente accede alla propria conversazione tramite codice e chiave privata, verificati dalle funzioni SQL; il codice da solo non dà accesso;
- i messaggi sono protetti da RLS; solo l'admin può leggerli direttamente e inserire risposte come `Venditore`;
- `Accessi_Richieste` conserva solo l'hash SHA-256 della chiave privata; il frontend non può leggere le chiavi degli altri acquirenti;
- il Table Editor di Supabase resta utilizzabile dal proprietario del progetto.

Per usare il pannello proprietario, crea il tuo utente in **Authentication → Users** con la stessa email inserita nello script. Il login è disponibile soltanto nella pagina amministrativa separata.

## 4. Pannello amministratore

Apri `admin.html` e accedi con email e password dell'utente creato in **Supabase → Authentication → Users**. L'email deve coincidere in questi due punti:

- `proprietario@example.com` nello script `supabase/schema.sql`;
- `ownerEmail` in `supabase-config.js`.

Il pannello consente di aggiungere, modificare, vendere o eliminare libri e di accettare o rifiutare offerte. Premi **Modifica** accanto a un libro, aggiorna i campi e premi **Salva modifiche**. **Annulla modifica** torna al modulo di inserimento senza salvare. Puoi modificare anche un libro venduto: rimane venduto finché non cambi il suo interruttore. ID, data di inserimento, richieste e messaggi vengono conservati; il prezzo delle offerte già ricevute e il titolo storico nelle ricevute non cambiano.

Le condizioni disponibili sono: Nuovo, Come Nuovo, Ottimo, Buono, Discreto, Segnato, Sottolineato, Evidenziato, Con appunti e Copertina usurata. Le stesse opzioni sono disponibili nel filtro pubblico.

L'accettazione usa la funzione SQL `gestisci_offerta`, che aggiorna offerta e disponibilità del libro nella stessa transazione.

Dal Centro offerte puoi cercare per codice, libro o nome e aprire **Messaggi** per rispondere. Le conversazioni restano disponibili dopo l'accettazione e dopo l'eliminazione del libro dal catalogo. L'eliminazione della richiesta stessa dal database, invece, elimina anche messaggi e accesso associati.

## Nuove condizioni: aggiornamento di un sito esistente

In **Supabase → SQL Editor → New query**, esegui il contenuto di `supabase/migrations/20260917142344_amplia_condizioni_libri.sql` prima di pubblicare il frontend aggiornato. Lo script amplia soltanto le condizioni ammesse, senza modificare libri, richieste, messaggi o RLS. Non servono nuove chiavi. Se la migrazione è già stata applicata al tuo progetto, non occorre ripeterla. Per nuove installazioni le condizioni sono già incluse in `schema.sql`.

## Richieste e messaggi: aggiornamento di un sito esistente

1. Apri **Supabase → SQL Editor → New query**.
2. Incolla tutto `supabase/messaggi.sql` e premi **Run**. Non serve reinserire l'email: le nuove policy usano i permessi admin già configurati sulle offerte.
3. Pubblica i file aggiornati insieme ai nuovi `richiesta.html`, `richiesta.js` e `richieste-common.js`. Esegui prima la migrazione: il nuovo frontend usa le nuove funzioni SQL.

Lo script è ri-eseguibile e assegna un codice anche alle offerte esistenti. Non rieseguire `schema.sql` da solo su un database aggiornato: ricreerebbe la vecchia policy di inserimento. Per una nuova installazione usa sempre prima `schema.sql`, poi `messaggi.sql`.

Dopo l'invio, l'acquirente riceve un codice casuale come `SEC-7A3F92C1D4E8` e un link privato. Il codice è generato dal database ed è univoco; il browser genera la chiave di accesso con 32 byte crittograficamente casuali. Offerta e hash della chiave vengono salvati nella stessa transazione. I retry con lo stesso identificativo non duplicano offerte o messaggi.

Il link viene salvato nelle **Le mie richieste** del browser e può essere copiato per usarlo su un altro dispositivo. Include la chiave nel frammento `#`, che non viene inviato nella richiesta HTTP della pagina. La pagina rimuove poi il frammento dalla barra degli indirizzi. Il link è una credenziale: chi lo possiede può leggere e inviare messaggi per quella richiesta. Su dispositivi condivisi usare **Rimuovi** per cancellare il link dalla lista locale; questo non elimina la richiesta dal database. Se il browser impedisce il salvataggio, la ricevuta invita a copiare il link manualmente.

Se il link viene perso, l'admin apre **Messaggi → Recupero accesso acquirente → Genera nuovo link privato**. Verifica prima il contatto dell'acquirente e invia il nuovo link tramite il contatto già fornito. La rigenerazione invalida il link precedente; è anche il modo per attivare l'accesso alle offerte create prima dell'aggiornamento. Nessuna email o notifica WhatsApp viene inviata automaticamente.

I messaggi dell'acquirente vengono aggiornati ogni 10 secondi mentre la pagina è visibile. L'admin riceve anche gli eventi Supabase Realtime; la conversazione aperta usa il controllo periodico come alternativa. Lo storico viene caricato a gruppi di 50 con **Carica messaggi precedenti**. Ogni messaggio può contenere al massimo 2.000 caratteri; per l'acquirente è previsto un intervallo minimo di 3 secondi tra invii.

Le funzioni pubbliche controllano sempre la chiave privata, usano un `search_path` vuoto e permessi `EXECUTE` espliciti, secondo la [documentazione Supabase sulle funzioni](https://supabase.com/docs/guides/database/functions). Le policy admin rispettano la [Row Level Security di Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). Il codice richiesta non è una password e non va usato come unico controllo di accesso.

## 5. Pubblica su GitHub Pages

### Notifiche push sul telefono (senza email)

Il sistema invia all'admin gli avvisi per nuove offerte e messaggi degli acquirenti; invia al compratore gli avvisi per le risposte del venditore alla propria richiesta. Non invia email né SMS e non richiede account presso servizi di notifiche esterni.

**Sul telefono:**

Il sito propone automaticamente un piccolo invito **Aggiungi Seconda alla Home** su Android e iPhone/iPad. Su Android il pulsante apre la richiesta nativa quando il browser la rende disponibile; altrimenti mostra le istruzioni dal menu. Su iPhone non esiste un prompt JavaScript nativo: viene mostrata la guida per Safari. **Non ora** nasconde l'invito per sette giorni; il collegamento in fondo alla pagina resta disponibile. Nell'app aperta dalla Home l'invito non compare. L'installazione non concede automaticamente il permesso alle notifiche: occorre premere anche **Attiva notifiche**.

- **Admin:** apri `admin.html`, accedi e premi **Attiva notifiche**. Consenti le notifiche quando lo chiede il browser.
- **Compratore:** apri il link privato della richiesta, poi premi **Attiva notifiche** nella conversazione. L'attivazione vale per quella richiesta su quel dispositivo.
- **iPhone/iPad:** richiede iOS/iPadOS 16.4 o successivo. Apri il sito in Safari, scegli **Condividi → Aggiungi alla schermata Home**, quindi aprilo dall'icona e attiva le notifiche. Se le richieste salvate nel browser non compaiono nell'app, incolla nuovamente il link privato originale. Non perderlo durante l'installazione.
- **Android:** usa un browser aggiornato che supporti Web Push (per esempio Chrome) e consenti le notifiche. Puoi aggiungere il sito alla schermata Home; non è obbligatorio per Chrome.
- Premi **Invia una prova** e attendi circa un minuto. Una prova al minuto per dispositivo; la coda ritenta gli errori temporanei. Rete, modalità Non disturbare, risparmio energetico e impostazioni del sistema possono ritardare o impedire gli avvisi: controlla anche la conversazione.
- **Disattiva notifiche** rimuove solo l'iscrizione dell'area/richiesta corrente. Uscire dall'account admin disattiva gli avvisi admin su quel browser; rimuovere una richiesta salvata disattiva i suoi avvisi. Le altre richieste sullo stesso dispositivo restano attive. Se una di queste operazioni fallisce per problemi di rete, il sito lo segnala senza cancellare l'accesso locale.

**Configurazione server per una nuova installazione:**

1. Esegui prima `schema.sql` e `messaggi.sql`. Apri `supabase/migrations/20260917161413_notifiche_push.sql`: imposta `admin_email` (stessa email dell'admin), `site_url` (URL Pages con `/` finale) e `function_url` (URL del progetto Supabase + `/functions/v1/push-notifications`). Esegui la migrazione una sola volta. Le chiavi sono generate sul server; non copiarle in `supabase-config.js`.
2. Distribuisci la funzione nella cartella `supabase/functions/push-notifications` con nome **push-notifications**, includendo `deno.json` e `deno.lock`. La verifica JWT del gateway va disabilitata per questa funzione: il codice verifica autonomamente il JWT dell'admin, la chiave privata dell'acquirente oppure il segreto del processo di invio. Non disabilitarla su altre funzioni.
3. Il primo accesso alla funzione genera la coppia VAPID. La chiave privata e il segreto del processo di invio sono conservati in **Supabase Vault**; al browser viene restituita solo la chiave pubblica. Non rigenerare/eliminare questi segreti: le iscrizioni esistenti smetterebbero di funzionare.
4. La migrazione attiva il processo Cron **seconda-push-delivery**, ogni minuto. Gli eventi inseriscono notifiche in una coda transazionale; il processo chiama la funzione solo se ci sono invii da elaborare. Non dipende da pagine aperte. Si applicano le normali quote Supabase di funzioni e database.
5. Pubblica `push.js`, `sw.js`, `install.js`, `manifest.webmanifest`, `icons/` e le pagine aggiornate su Pages. Lascia il service worker nella stessa cartella delle pagine: il percorso funziona anche sotto `/BookSelling/`.

Nel progetto esistente la migrazione è già applicata e la funzione è distribuita: occorre soltanto attivare gli avvisi sul dispositivo. La migrazione `20260917162530_push_extension_schema.sql` corregge l'installazione iniziale di `pg_net`; su una nuova installazione corretta non modifica nulla. Non rieseguire la migrazione principale su tabelle già presenti.

**Sicurezza e limiti:** le nuove tabelle `push_settings`, `push_subscriptions` e `push_jobs` hanno RLS e nessun accesso dal browser; solo la funzione server può accedervi. L'assenza di policy client su queste tabelle è intenzionale ([documentazione del controllo RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Le funzioni di coda e configurazione sono riservate a `service_role`. Il codice della richiesta da solo non permette di attivare notifiche. Rigenerare il link privato revoca anche le vecchie iscrizioni del compratore. Le notifiche mostrano soltanto un avviso generico, mai contatti, testo dei messaggi o chiavi private. Aprirle richiede comunque la sessione admin o il link salvato dell'acquirente.

Gli invii scadono dopo un'ora presso il servizio push; gli errori temporanei vengono ritentati fino a cinque volte, gli endpoint scaduti vengono rimossi e la coda viene ripulita dopo sette giorni. In rari retry un avviso può essere ripresentato, con lo stesso identificativo per limitarne i duplicati. Il service worker non memorizza pagine o conversazioni offline. La ricezione sul telefono va verificata con il pulsante di prova: un invio accettato dal servizio push non garantisce che il sistema mostri immediatamente l'avviso.

Riferimenti: [Supabase: funzioni pianificate](https://supabase.com/docs/guides/functions/schedule-functions), [Apple: Web Push su iPhone/iPad](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Metodo consigliato con Git:

```bash
git init
git add index.html admin.html app.js admin.js condizioni.js richiesta.html richiesta.js richieste-common.js push.js sw.js install.js manifest.webmanifest icons background.css background.js supabase-config.js supabase/schema.sql supabase/messaggi.sql supabase/migrations supabase/functions README.md .nojekyll .gitignore
git commit -m "Deploy mercatino libri"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/NOME-REPO.git
git push -u origin main
```

Poi su GitHub:

1. Apri il repository.
2. Vai in **Settings → Pages**.
3. In **Build and deployment**, scegli **Deploy from a branch**.
4. Seleziona branch `main` e cartella `/(root)`.
5. Salva e aspetta il link pubblico.

Il file `.nojekyll` è già incluso: aiuta GitHub Pages a servire correttamente file statici senza passare da Jekyll.

Metodo senza terminale:

1. Crea un nuovo repository GitHub.
2. Carica solo i file elencati nella sezione "File da pubblicare".
3. Attiva Pages da **Settings → Pages → Deploy from a branch → main → /(root)**.

## 6. Test finale

Apri il sito pubblicato e controlla:

- la home mostra i libri reali di Supabase;
- la ricerca filtra per ISBN, titolo e materia;
- il bottone offerta crea una riga in `Offerte_Scambi`;
- `admin.html` fa login con l'utente admin;
- "Modifica" aggiorna un annuncio senza cambiarne disponibilità, richieste o messaggi;
- tutte e dieci le condizioni possono essere salvate e filtrate nel catalogo;
- "Accetta" segna l'offerta come accettata e il libro come venduto.
- inviare un'offerta mostra il codice e il link privato; il link apre solo quella richiesta;
- inviare un messaggio dall'acquirente lo rende leggibile dall'admin e viceversa, anche dopo "Accetta";
- il solo codice o una chiave errata non consentono l'accesso;
- eliminare il libro mantiene la richiesta e i messaggi;
- rigenerare un link dall'admin invalida quello precedente;
- un utente autenticato con un'altra email non può leggere offerte o messaggi.

Senza chiavi Supabase valide il sito mostra dati demo e non salva offerte.
