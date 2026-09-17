# Seconda Pagina — GitHub Pages + Supabase

Frontend statico responsive per vendere libri scolastici usati senza pagamenti online.

## File da pubblicare

Per GitHub Pages servono solo questi file/cartelle:

- `index.html`
- `admin.html`
- `app.js`
- `admin.js`
- `condizioni.js`
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

Metodo consigliato con Git:

```bash
git init
git add index.html admin.html app.js admin.js condizioni.js richiesta.html richiesta.js richieste-common.js background.css background.js supabase-config.js supabase/schema.sql supabase/messaggi.sql supabase/migrations README.md .nojekyll .gitignore
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
