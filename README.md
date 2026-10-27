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
```

## Supabase

1. Crea il progetto su supabase.com.
2. Applica lo schema del database (`supabase/migrations/`) e crea il primo admin: istruzioni in [docs/database.md](docs/database.md).
3. Copia `.env.example` in `.env.local` e incolla URL e anon key (Project Settings → API).
4. Su Vercel aggiungi le stesse due variabili in Project Settings → Environment Variables (Production, Preview e Development), poi rifai il deploy.

Finché le variabili sono vuote, `createClient()` restituisce `null` e l'app resta sui dati finti.

### Accesso con codice via email

I soci entrano con un codice che ricevono via email e digitano nell'app. Si usa il codice e non il link perché sul telefono il link si aprirebbe nel browser, fuori dall'app installata. Su Supabase:

- **Authentication → Email Templates → Magic Link**: il testo deve contenere il codice, `{{ .Token }}`. Esempio: «Il tuo codice per entrare nel Privilege Shopping Club è {{ .Token }}». Il link `{{ .ConfirmationURL }}` può restare: funziona se aperto nello stesso browser.
- **Authentication → URL Configuration**: Site URL = indirizzo di produzione; Redirect URLs = `https://*-privilegeshoppingclubcv-1245.vercel.app/**` e `http://localhost:3000/**`.
- **Authentication → SMTP Settings**: il servizio email incluso in Supabase scrive solo agli indirizzi del team e pochi messaggi l'ora. Prima di aprire l'app ai clienti serve un servizio email vero (Resend, Brevo, Postmark, …).

Flussi (`src/app/accesso/`): «Ho già la tessera» chiede numero ed email, manda il codice e dopo la conferma chiama `collega_tessera`; «Voglio iscrivermi» fa lo stesso con `iscriviti`; «Accedi» manda il codice e porta alla Home, o a collegare la tessera se l'account non ne ha una.

## Da decidere prima del lancio

- **Formato del codice a barre**: provvisorio CODE128 sul numero tessera; va allineato a quello che leggono le casse.
- **Licenza del font Sansumi** per l'uso web: non verificata.
- **Butler** è CC BY-SA 4.0 di Fabian De Smet (Dirtyline Studio): va citato nei crediti.
