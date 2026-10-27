# Database (Supabase)

Lo schema vive in `supabase/migrations/` come file SQL numerati: ogni modifica futura sarà un file nuovo, mai una modifica a uno già applicato. `supabase/seed.sql` contiene i dati di esempio per il database locale.

## Applicare le migrazioni

Quando il progetto Supabase esiste:

```bash
npx supabase login
npx supabase link --project-ref <ref del progetto>   # Project Settings → General
npx supabase db push                                  # applica i file non ancora applicati
```

In alternativa, senza riga di comando: SQL Editor di Supabase, incolla ed esegui i file di `supabase/migrations/` uno alla volta, in ordine di nome.

Poi crea il primo admin. L'utente deve esistere in Supabase: accedi una volta all'app con la tua email, oppure crealo da Authentication → Users → Add user → Create new user (spunta "Auto Confirm User"). Poi dal SQL Editor esegui

```sql
insert into public.staff (user_id, ruolo)
select id, 'admin' from auth.users where lower(email) = lower('tua@email.it');
```

Deve rispondere `INSERT 0 1`; `INSERT 0 0` vuol dire che l'utente con quell'email non esiste ancora.

## Tabelle

| Tabella | Cosa contiene |
|---|---|
| `soci` | Un socio = una tessera. `numero_tessera` è testo, unico, e non si modifica mai (un trigger lo blocca). `user_id` si riempie quando il socio collega la tessera all'app. |
| `livelli` | Classic, Gold, … Il livello è un campo del socio; la regola per passare di livello è da decidere. |
| `movimenti_punti` | Registro dei punti, in sola aggiunta: saldo iniziale dall'import, acquisti, riscatti, bonus, rettifiche. Il saldo è la somma (vista `saldi_punti`). Un riscatto non può portare il saldo sotto zero. |
| `premi` | Catalogo punti (buoni da 10, 15, 30 €). |
| `offerte`, `offerte_negozi` | Offerte con prezzo soci/listino o etichetta ("-30%"), periodo di validità, bozza/pubblicata, solo tesserati, livello minimo, negozi in cui valgono (nessuno = tutti). |
| `negozi` | Anagrafica, orari, coordinate, `codice_gestionale` per abbinare import e scontrini. |
| `inviti` | Chi ha invitato chi. Quando un invito si "qualifica" e quanti punti vale è da decidere. |
| `consensi`, vista `consensi_attuali` | Registro GDPR in sola aggiunta: privacy, regolamento, marketing, profilazione, ognuno separato, con versione del testo e canale (app, negozio, import). |
| `notifiche_dispositivi` | Iscrizioni Web Push della PWA. Offerte via notifica solo a chi ha il consenso marketing. |
| `import_batch`, `import_righe` | Ogni import dal gestionale, riga per riga, con esito ed errori. |
| `staff` | Ruoli: `admin` (tutto) e `operatore` (cassa: vede i soci, registra punti nel suo negozio). |
| `impostazioni` | Valori modificabili senza codice: prefisso tessere create in app, versioni dei testi legali, punti per gli inviti. |

## Chi vede cosa (RLS)

- **Chiunque, anche senza accesso**: negozi attivi, premi attivi, offerte pubblicate non riservate ai tesserati.
- **Socio**: la propria scheda, i propri movimenti e saldo, i propri consensi e inviti, tutte le offerte in corso per il suo livello. Modifica solo i recapiti, con `aggiorna_profilo()`.
- **Operatore**: legge tutti i soci e i movimenti; registra acquisti, riscatti e bonus solo nel proprio negozio.
- **Admin**: tutto, compresi import e caricamento immagini.

Nessuno, admin compresi, può modificare o cancellare un movimento punti o un consenso: si aggiunge una riga nuova.

## Funzioni per l'app

- `collega_tessera(numero)` — "Ho già la tessera": collega l'account se numero ed email del login corrispondono a quelli del gestionale.
- `iscriviti(nome, cognome, accetta_privacy, consenso_marketing, telefono, codice_invito, user_agent)` — "Voglio iscrivermi": crea la tessera (APP000001, APP000002, …), registra i consensi e l'invito.
- `aggiorna_profilo(...)` — recapiti del socio.
- `importa_soci(batch)`, `importa_movimenti_punti(batch)` — solo admin.

## Import dal gestionale

Il formato del gestionale non è ancora noto, quindi l'import funziona con qualsiasi intestazione di colonna:

1. il pannello admin legge il CSV/Excel nel browser **con tutte le colonne come testo** e carica il file originale nel bucket `import`;
2. crea un `import_batch` con la mappatura, es. `{"numero_tessera": "Codice cliente", "nome": "Nome", "punti": "Saldo"}`, e una riga di `import_righe` per ogni riga del file;
3. chiama `importa_soci(batch)`.

Regole:

- i soci si abbinano per numero tessera: reimportare aggiorna, non duplica; una cella vuota non cancella il dato salvato;
- se il numero tessera arriva come numero invece che testo la riga va in errore, perché gli zeri iniziali sarebbero già persi;
- il saldo punti del file diventa il movimento `saldo_iniziale` solo al primo import; ai successivi viene segnalato ma non applicato;
- i consensi del file si importano solo se il socio non ne ha già per quel tipo: una scelta fatta in app non viene mai sovrascritta;
- date `27/10/2026` o `2026-10-27`, numeri all'italiana (`1.500`, `12,50`);
- le colonne non mappate finiscono in `soci.dati_gestionale`, così non si perde nulla.

`importa_movimenti_punti` serve se il gestionale esporta scontrini o accrediti: il campo `riferimento` (id scontrino) impedisce di contare due volte lo stesso movimento.

## Immagini

Vanno su **Supabase Storage**, nello stesso progetto del database:

| Bucket | Visibilità | Per cosa |
|---|---|---|
| `offerte` | pubblico | foto delle offerte |
| `negozi` | pubblico | foto dei negozi |
| `premi` | pubblico | immagini del catalogo punti |
| `import` | privato, solo admin | file CSV/Excel del gestionale |

I bucket pubblici accettano JPEG, PNG, WebP e AVIF fino a 5 MB; solo gli admin caricano o cancellano. Nelle tabelle si salva il percorso dentro il bucket (`immagine_path`), e l'app costruisce l'URL pubblico. Logo, icone e font restano nel repository, in `public/`.

## Da decidere

- Chi calcola i punti degli acquisti: il gestionale (e noi importiamo i movimenti) o l'app in cassa.
- Regola dei livelli e degli inviti (quando si premia, quanti punti).
- Se le tessere create in app devono poi essere registrate anche nel gestionale.
