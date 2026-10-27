# Privilege Shopping Club — app soci

PWA per i soci del Privilege Shopping Club: tessera digitale con codice a barre, saldo punti, offerte riservate e negozi.

Questo è lo **scheletro**: tutte le schermate usano dati finti (`src/lib/mock-data.ts`). Supabase è predisposto ma non ancora collegato.

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
4. Su Vercel aggiungi le stesse due variabili in Project Settings → Environment Variables.

Finché le variabili sono vuote, `createClient()` restituisce `null` e l'app resta sui dati finti.

## Da decidere prima del lancio

- **Formato del codice a barre**: provvisorio CODE128 sul numero tessera; va allineato a quello che leggono le casse.
- **Licenza del font Sansumi** per l'uso web: non verificata.
- **Butler** è CC BY-SA 4.0 di Fabian De Smet (Dirtyline Studio): va citato nei crediti.
