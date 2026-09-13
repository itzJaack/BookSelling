# Seconda Pagina — GitHub Pages + Supabase

Frontend statico responsive per vendere libri scolastici usati senza pagamenti online.

## File da pubblicare

Per GitHub Pages servono solo questi file/cartelle:

- `index.html`
- `admin.html`
- `app.js`
- `admin.js`
- `supabase-config.js`
- `.nojekyll`
- `README.md`
- `supabase/schema.sql`, utile come riferimento per ricreare il database

Non serve fare build e non serve caricare `node_modules`. Il sito usa HTML, Tailwind via CDN, JavaScript puro e Supabase dal browser.

## 1. Configura Supabase

1. Crea un progetto Supabase.
2. Apri **SQL Editor → New query**.
3. Nel file `supabase/schema.sql` sostituisci `proprietario@example.com` con l'email che userai in **Supabase Auth**.
4. Incolla lo script completo nell'editor SQL e premi **Run**.
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

Lo script SQL abilita RLS su entrambe le tabelle e imposta queste regole:

- chiunque (`anon` e `authenticated`) può leggere `Libri`;
- chiunque può inserire una riga in `Offerte_Scambi`, solo con stato `In attesa`;
- nessun visitatore può leggere le offerte e i relativi contatti;
- solo un utente autenticato con la tua email può inserire, modificare o eliminare libri e gestire le offerte;
- il Table Editor di Supabase resta utilizzabile dal proprietario del progetto.

Per usare il pannello proprietario, crea il tuo utente in **Authentication → Users** con la stessa email inserita nello script. Il login è disponibile soltanto nella pagina amministrativa separata.

## 4. Pannello amministratore

Apri `admin.html` e accedi con email e password dell'utente creato in **Supabase → Authentication → Users**. L'email deve coincidere in questi due punti:

- `proprietario@example.com` nello script `supabase/schema.sql`;
- `ownerEmail` in `supabase-config.js`.

Il pannello consente di aggiungere, vendere o eliminare libri e di accettare o rifiutare offerte. L'accettazione usa la funzione SQL `gestisci_offerta`, che aggiorna offerta e disponibilità del libro nella stessa transazione.

## 5. Pubblica su GitHub Pages

Metodo consigliato con Git:

```bash
git init
git add index.html admin.html app.js admin.js supabase-config.js supabase/schema.sql README.md .nojekyll .gitignore
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
- "Accetta" segna l'offerta come accettata e il libro come venduto.

Senza chiavi Supabase valide il sito mostra dati demo e non salva offerte.
