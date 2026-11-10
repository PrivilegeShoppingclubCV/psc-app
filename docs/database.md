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

Da lì in poi il pannello `/admin` è aperto a quell'account, e gli altri admin e operatori si aggiungono dalla sezione Staff. Resta sempre almeno un admin: il database rifiuta di togliere o declassare l'ultimo.

## Tabelle

| Tabella | Cosa contiene |
|---|---|
| `soci` | La persona: anagrafica, livello, punti, consensi. `user_id` si riempie quando collega l'app; chi ha solo la tessera fisica può non averlo mai. |
| `tessere` | I codici che la cassa legge, legati al socio, **una sola attiva per socio**: la `digitale` (`APP000123`, creata dall'app) finché non riceve quella di plastica, poi la `fisica` (stampata, consegnata in negozio), che l'app mostra al posto della digitale. `sostituisce_id` è la tessera di cui ha preso il posto. Stato: `da_consegnare` (fisica nel magazzino, senza socio), `attiva`, `bloccata` (persa, sostituita: non torna attiva). `stato_cassa`: `in_attivazione` finché ReadyPro non la esporta, poi `attiva`. Il codice è testo, unico, senza spazi, e non si modifica mai (un trigger lo blocca). |
| `codici_collegamento` | Codici di 6 caratteri, validi 15 minuti, che l'app mostra a chi deve farsi collegare la tessera in negozio. |
| `livelli` | Classic, Gold, … Il livello è un campo del socio; la regola per passare di livello è da decidere. |
| `movimenti_punti` | Registro dei punti, in sola aggiunta: saldo iniziale dall'import, acquisti, riscatti, bonus, rettifiche. Il saldo è la somma (vista `saldi_punti`). Un riscatto non può portare il saldo sotto zero. |
| `premi` | Catalogo punti (buoni da 10, 15, 30 €). |
| `offerte`, `offerte_negozi` | Offerte con prezzo soci/listino o etichetta ("-30%"), periodo di validità, bozza/pubblicata, solo tesserati, livello minimo, negozi in cui valgono (nessuno = tutti). |
| `prodotti` | Magazzino incollato dall'Excel di ReadyPro, uno per codice EAN: pezzi, prezzi, scadenze, categoria, foto. `valore_fermo` = pezzi × prezzo tesserati, calcolato dal database. |
| `vetrina`, vista `prodotti_in_offerta` | I prodotti usciti nella pagina Offerte giorno per giorno; la vista elenca quelli che possono uscire (con foto, disponibili, con prezzo, non scaduti né nascosti) con il punteggio. |
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

- `collega_tessera(numero)` — "Ho già la tessera": collega l'account se il codice è di una tessera attiva (fisica o digitale) e l'email del login è quella del socio.
- `crea_codice_collegamento()` — per chi in negozio non ha lasciato un'email (o ne ha lasciata un'altra): codice da mostrare alla cassa; lo staff lo usa con `staff_collega_account(socio, codice)`.
- `iscriviti(nome, cognome, accetta_privacy, consenso_marketing, telefono, codice_invito, user_agent)` — "Voglio iscrivermi": crea il socio con la tessera digitale (900000000001, 900000000002, …: 12 cifre come quelle stampate; le prime create in prova erano APP000001…), registra i consensi e l'invito.
- `attiva_tessera_digitale()` — chi ha solo la fisica e ha collegato l'app aggiunge la digitale.
- `aggiorna_profilo(...)` — recapiti del socio.
- `importa_soci(batch)`, `importa_movimenti_punti(batch)` — solo admin.
- Tessere fisiche, per lo staff (il pannello le usa da admin): `staff_carica_tessere_fisiche(codici)` e `staff_togli_dal_magazzino(codice)` (solo admin), `staff_nuovo_socio_fisica(codice, nome, cognome, privacy_firmata, …)` per il cliente che si iscrive in negozio senza app, `staff_assegna_tessera_fisica(socio, codice, motivo)` (prende il posto della digitale; per sostituire una fisica serve il motivo; la vecchia si blocca), `staff_blocca_tessera(tessera, motivo)`.
- `admin_unisci_soci(tieni, togli)` — due schede per la stessa persona: tessere, punti, consensi e inviti passano a `tieni`, l'altra sparisce. Se una scheda ha la fisica e l'altra la digitale, resta la fisica. Rifiuta se tutti e due hanno l'app o due tessere attive dello stesso tipo.
- Regole in `impostazioni`: `tessera_fisica_formato` (espressione regolare dei codici stampati, vuota = qualsiasi) e `tessere_fisiche_solo_magazzino` (true = si consegnano solo codici caricati). Si cambiano dalla sezione Tessere del pannello.
- `vetrina_del_giorno()` — i prodotti di oggi per la pagina Offerte; li sceglie al primo socio che la apre nella giornata. `vetrina_rigenera()` rifà la scelta (solo admin).
- `importa_prodotti(import, righe)`, `chiudi_import_prodotti(import)` — salvano le righe del magazzino (per EAN, senza toccare foto e "nascosto") e, se l'elenco era completo, segnano come esauriti i prodotti che mancavano. Solo admin; serviranno anche all'invio automatico da ReadyPro.
- `admin_elenco_staff()`, `admin_aggiungi_staff(email, ruolo, negozio, nome)` — per la sezione Staff del pannello: mostrano le email degli account e aggiungono allo staff chi ha già fatto almeno un accesso all'app. Solo admin.

## Import dal gestionale

Il formato del gestionale non è ancora noto, quindi l'import funziona con qualsiasi intestazione di colonna:

1. il pannello admin legge il CSV/Excel nel browser **con tutte le colonne come testo** e carica il file originale nel bucket `import`;
2. crea un `import_batch` con la mappatura, es. `{"numero_tessera": "Codice cliente", "nome": "Nome", "punti": "Saldo"}`, e una riga di `import_righe` per ogni riga del file (campo facoltativo `altra_tessera`: un vecchio codice dello stesso cliente, usato solo per riconoscerlo);
3. chiama `importa_soci(batch)`.

Regole:

- il socio si trova da qualunque sua tessera (`numero_tessera`, poi `altra_tessera`): reimportare aggiorna, non duplica; una cella vuota non cancella il dato salvato. 
- un codice che non esiste ancora diventa una tessera del socio (digitale se ha il prefisso `APP`, fisica altrimenti); se il socio aveva già una tessera attiva, quella vecchia si blocca come "sostituita nel gestionale";
- se il numero tessera arriva come numero invece che testo la riga va in errore, perché gli zeri iniziali sarebbero già persi;
- il saldo punti del file diventa il movimento `saldo_iniziale` solo al primo import; ai successivi viene segnalato ma non applicato;
- i consensi del file si importano solo se il socio non ne ha già per quel tipo: una scelta fatta in app non viene mai sovrascritta;
- date `27/10/2026` o `2026-10-27`, numeri all'italiana (`1.500`, `12,50`);
- le colonne non mappate finiscono in `soci.dati_gestionale`, così non si perde nulla.

`importa_movimenti_punti` serve se il gestionale esporta scontrini o accrediti (il socio si trova da qualunque sua tessera, anche bloccata): il campo `riferimento` (id scontrino) impedisce di contare due volte lo stesso movimento. Senza la colonna `punti` li calcola dall'`importo`: importo × `impostazioni.punti_per_euro`, per difetto (un reso, importo negativo, li toglie come `storno`); le vendite senza tessera o sotto il primo punto si saltano.

## Sincronizzazione con ReadyPro

Il gestionale dei negozi è ReadyPro. Il server dei negozi invia il CSV dei clienti e scarica le tessere create in app con lo script di `tools/readypro/` (istruzioni complete nel suo README). Nel database:

| Oggetto | A cosa serve |
|---|---|
| `gestionale_chiavi` | Chiavi del server dei negozi: solo l'impronta SHA-256. Si creano con `gestionale_crea_chiave(nome)` e si revocano con `gestionale_revoca_chiave(id)`. |
| `gestionale_ricevi_soci(chiave, …)` | Riceve il CSV dei clienti e lo passa a `importa_soci` con la mappatura salvata in `impostazioni.gestionale_mappatura_soci`. Lo stesso file mandato due volte non si rielabora. |
| `gestionale_ricevi_vendite(chiave, …)` | Lo stesso per il CSV delle vendite: lo passa a `importa_movimenti_punti` con `impostazioni.gestionale_mappatura_vendite` (servono `numero_tessera` e `importo` o `punti`). |
| `tessere.stato_cassa` | `attiva` per le tessere arrivate dal gestionale, `in_attivazione` per quelle date dall'app (digitali nate in app, fisiche consegnate dal pannello). Diventa `attiva` quando il codice compare in un import del gestionale: finché non succede l'app nasconde il codice a barre. |
| `gestionale_lotti`, `gestionale_nuovi_iscritti(chiave)`, `gestionale_conferma_lotto(chiave, lotto)` | Le tessere in attivazione vanno al server a lotti, una riga per tessera con `tipo_tessera` e `tessera_precedente` (il codice che sostituisce sullo stesso cliente). Un lotto non confermato si rimanda al giro dopo. |
| vista `tessere_in_attesa_cassa` | Tessere che la cassa non conosce ancora, con le ore di attesa. |
| vista `soci_con_tessere` | I soci con i codici delle tessere attive, per cercarli da qualunque codice nel pannello. |

Le funzioni con la chiave sono aperte ad `anon`: senza una chiave valida non fanno nulla. Le righe degli invii automatici riusciti si cancellano dopo `gestionale_giorni_righe` giorni (30); quelle in errore restano.

## Immagini

Vanno su **Supabase Storage**, nello stesso progetto del database:

| Bucket | Visibilità | Per cosa |
|---|---|---|
| `offerte` | pubblico | foto delle offerte |
| `negozi` | pubblico | foto dei negozi |
| `premi` | pubblico | immagini del catalogo punti |
| `prodotti` | pubblico | foto dei prodotti del magazzino, in una cartella per EAN |
| `import` | privato, solo admin | file CSV/Excel del gestionale |

I bucket pubblici accettano JPEG, PNG, WebP e AVIF fino a 5 MB; solo gli admin caricano o cancellano. Nelle tabelle si salva il percorso dentro il bucket (`immagine_path`), e l'app costruisce l'URL pubblico. Logo, icone e font restano nel repository, in `public/`.

## Da decidere

- Chi calcola i punti degli acquisti: il gestionale (e noi importiamo i movimenti) o l'app in cassa.
- Regola dei livelli e degli inviti (quando si premia, quanti punti).
