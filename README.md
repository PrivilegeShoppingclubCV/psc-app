# Privilege Shopping Club — app soci

PWA per i soci del Privilege Shopping Club: tessera digitale con codice a barre, saldo punti, offerte riservate e negozi.

Le schermate leggono i dati da Supabase (`src/lib/dati.ts`). Finché le chiavi di Supabase non sono impostate, l'app usa i dati finti di `src/lib/mock-data.ts`.

## Stack

- **Next.js (App Router) + TypeScript** — il framework nativo di Vercel: deploy automatico a ogni push, anteprima per ogni PR, pagine statiche servite dalla CDN.
- **Supabase** (in arrivo) — database Postgres, login via email e regole di accesso per riga. Client già pronti in `src/lib/supabase/`.
- **Nessun framework CSS**: i colori, gli spazi e i componenti `.psc-*` vengono dal design system del brand.
- **Service worker scritto a mano** (`public/sw.js`): piccolo e leggibile, rende la tessera disponibile anche offline.

## Avvio in locale

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build di produzione (come su Vercel)
```

Il service worker si attiva solo con `npm run build && npm start`, per non servire pagine vecchie durante lo sviluppo.

## Struttura

```
src/app/page.tsx              Benvenuto (Ho già la tessera · Voglio iscrivermi · Accedi)
src/app/collega-tessera|iscriviti|accedi
src/app/(club)/layout.tsx     Guscio con barra in basso: Negozi · Punti · Home · Offerte · Profilo
src/app/(club)/home           Saldo punti + "Apri tessera" a schermo intero con codice a barre
src/app/admin/                Pannello admin: offerte, soci e punti, negozi, premi, staff, gestionale
src/app/manifest.ts           Manifest della PWA
src/components/               TabBar, Tessera, Barcode, SaldoPunti, …
src/styles/tokens.json        Token del design system (fonte)
src/styles/tokens.css         Generato con `npm run tokens`: non modificarlo a mano
src/styles/psc.css            Componenti .psc-* del design system
src/fonts/                    Butler e Sansumi (woff2). Jost arriva da Google Fonts via next/font
public/brand/                 Logo SVG
public/icons/                 Icone dell'app (generate dalla corona)
public/sw.js                  Service worker
supabase/migrations/          Schema del database (tabelle, regole di accesso, bucket immagini)
supabase/seed.sql             Dati di esempio per il database locale
docs/database.md              Come è fatto il database e come si applica
src/app/api/gestionale/        Endpoint per il server dei negozi (CSV clienti in, nuovi iscritti out)
tools/readypro/               Script per il server di ReadyPro e istruzioni di installazione
```

## Supabase

1. Crea il progetto su supabase.com.
2. Applica lo schema del database (`supabase/migrations/`) e crea il primo admin: istruzioni in [docs/database.md](docs/database.md).
3. Copia `.env.example` in `.env.local` e incolla URL e anon key (Project Settings → API).
4. Su Vercel aggiungi le stesse due variabili in Project Settings → Environment Variables (Production, Preview e Development), poi rifai il deploy.

Finché le variabili sono vuote, `createClient()` restituisce `null` e l'app resta sui dati finti.

### Accesso con link via email

I soci entrano con un link che ricevono via email (magic link), niente password. Con il modello standard di Supabase il link vale solo nel browser e dall'indirizzo in cui è stato chiesto, e solo l'ultima email. Il modello `supabase/templates/accesso.html` porta invece direttamente a `/auth/callback` con `{{ .TokenHash }}`, che funziona da qualsiasi browser. Sull'iPhone l'app installata sulla schermata Home ha comunque cookie suoi, quindi il link aperto dalla mail fa entrare in Safari, non nell'app: per questo l'email contiene anche il codice (`{{ .Token }}`), che nell'app si può digitare sotto «Nell'email c'è anche un codice?». Su Supabase:

- **Authentication → URL Configuration**: Site URL = indirizzo di produzione; Redirect URLs = l'indirizzo di produzione con `/**` in fondo, `https://*-privilegeshoppingclubcv-1245.vercel.app/**` (anteprime) e `http://localhost:3000/**`. Se un indirizzo manca, il link riporta alla Site URL: l'app se ne accorge e completa comunque l'accesso.
- **Authentication → Emails → Templates**: funziona anche con i modelli standard, ma è consigliato il nostro: in **Magic Link** e in **Confirm signup** (la riceve chi entra per la prima volta) incolla `supabase/templates/accesso.html`, con oggetto `Entra nel Privilege Shopping Club`. Il logo arriva da `public/brand/psc-lockup-bianco-email.png` tramite `{{ .SiteURL }}`.
- **Authentication → SMTP Settings**: il servizio email incluso in Supabase scrive solo agli indirizzi del team e pochi messaggi l'ora. Per le prove va bene Gmail con una password per le app; prima di aprire l'app ai clienti serve un servizio email vero (Resend, Brevo, Postmark, …).

Flussi (`src/app/accesso/`): «Ho già la tessera» chiede numero ed email, manda il link e all'arrivo su `/auth/callback` chiama `collega_tessera`; «Voglio iscrivermi» fa lo stesso con `iscriviti`; «Accedi» manda il link e porta alla Home, o a collegare la tessera se l'account non ne ha una. I dati del modulo aspettano in un cookie per 30 minuti: se il link si apre in un altro browser, il socio entra ma deve ricompilare il modulo.

## Pannello admin

Il pannello è nella stessa app, all'indirizzo `/admin`, con un layout suo pensato per il computer (funziona anche da telefono). Si entra con lo stesso link via email dei soci: chi apre `/admin` senza aver fatto l'accesso va su `/accedi?dopo=admin`, e il link riporta al pannello. Entra solo chi ha il ruolo `admin` nella tabella `staff`; il primo admin si crea dal SQL Editor (vedi [docs/database.md](docs/database.md)), gli altri dalla sezione Staff.

| Sezione | Cosa si fa |
|---|---|
| Panoramica | Soci, offerte in corso e in bozza, tessere in attesa della cassa, ultimi import |
| Offerte | Crea, modifica, pubblica o rimette in bozza, elimina; immagine, prezzi o etichetta, periodo, livello minimo, negozi |
| Prodotti | Incolla le righe del magazzino dall'Excel, carica le foto per codice EAN (anche tante insieme), vede e rifà la vetrina di oggi |
| Soci | Cerca per tessera, nome o email; modifica la scheda, sospende, registra bonus, rettifiche e riscatti, vede consensi e inviti |
| Negozi, Premi | Anagrafica, orari, immagine, visibilità nell'app |
| Staff | Aggiunge admin e operatori per email, cambia ruolo e negozio |
| Gestionale | Chiavi del server dei negozi, mappatura delle colonne del CSV clienti, esito degli import |

La pagina Offerte dell'app mostra prima le offerte dello staff in corso, poi i prodotti della vetrina del giorno fino a 10 in tutto; «Vedi tutte le offerte» (`/offerte/tutte`) elenca tutti i prodotti con foto. La vetrina la sceglie il database (`vetrina_del_giorno`): valore fermo più alto (pezzi × prezzo tesserati), spinto dalla scadenza vicina, solo prodotti con foto, mai lo stesso prodotto nei 3 giorni dopo un'uscita. Numero di offerte, giorni di pausa e peso della scadenza sono nella tabella `impostazioni` (`vetrina_*`).

Le pagine e le azioni controllano il ruolo (`src/lib/admin/sessione.ts`), ma la protezione vera sono le regole di Supabase: chi non è admin non legge né scrive nulla anche chiamando il database direttamente. Le immagini si caricano dal browser direttamente su Supabase Storage. Il service worker non salva mai le pagine del pannello.

## Da decidere prima del lancio

- **Formato del codice a barre**: provvisorio CODE128 sul numero tessera; va allineato a quello che leggono le casse.
- **Licenza del font Sansumi** per l'uso web: non verificata.
- **Butler** è CC BY-SA 4.0 di Fabian De Smet (Dirtyline Studio): va citato nei crediti.
