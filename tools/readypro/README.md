# Collegamento con ReadyPro

ReadyPro non ha un'API, quindi il collegamento passa da file CSV. Il server dei negozi fa tutto da solo, sempre **in uscita** verso l'app via HTTPS: nessuna porta aperta, nessuna cartella condivisa, nessun accesso al database di ReadyPro.

```
 Server dei negozi                                         App (Vercel + Supabase)
 ┌───────────────────────────────┐   HTTPS + chiave   ┌──────────────────────────────┐
 │ ReadyPro ──export──> clienti.csv ─────────────────> │ POST /api/gestionale/clienti │
 │                               │                     │   → importa_soci             │
 │ ReadyPro <──import── nuovi-iscritti.csv <────────── │ GET  /api/gestionale/        │
 │                               │                     │        nuovi-iscritti        │
 │   sincronizza.ps1 (ogni 15')  │                     │                              │
 └───────────────────────────────┘                     └──────────────────────────────┘
```

1. ReadyPro esporta il CSV dei clienti in una cartella locale (procedura pianificata di ReadyPro).
2. `sincronizza.ps1` manda all'app solo i clienti nuovi o modificati dall'ultimo invio, a blocchi di 1.000, e una volta a settimana tutto il file per sicurezza. L'app aggiorna i soci. Così anche decine di migliaia di clienti esportati ogni ora pesano poco: lo script tiene una copia dell'ultimo file inviato (`ultimo-invio.csv`, nella sua cartella protetta) per confrontarlo col nuovo.
3. Lo script scarica le tessere date dall'app (digitali nate in app e fisiche consegnate dal pannello) e le scrive nel file che ReadyPro importa (import pianificato di ReadyPro), poi conferma all'app.
4. Quando il codice di una di queste tessere compare nel CSV dei clienti, la cassa la conosce: in app la tessera passa da "in attivazione" ad "attiva" e mostra il codice a barre.

Ogni socio ha **una tessera sola**: la digitale (`APP000123`) finché non riceve quella di plastica, poi la fisica. Quando lo staff consegna la fisica a chi aveva la digitale, nel file dei nuovi iscritti arriva la fisica con `tessera_precedente` = il codice APP: in ReadyPro va **cambiato il codice a barre di quel cliente**, non creato un cliente nuovo.

## Cosa chiedere al rivenditore ReadyPro

- Un **filtro di esportazione** dei clienti in CSV, con almeno: codice a barre della tessera, nome, cognome, email, cellulare, data di nascita, negozio, consensi privacy/marketing. Una **procedura pianificata** che lo esegue ogni ora e scrive sempre lo stesso file locale (es. `C:\PSC\export\clienti.csv`).
- Un **filtro di importazione** dei clienti dal file `C:\PSC\import\nuovi-iscritti.csv` (colonne qui sotto), che **aggiorna** il cliente se il codice tessera esiste già invece di crearne un doppione, e una procedura pianificata che lo esegue ogni 15–30 minuti. Va bene se dopo l'import ReadyPro sposta o cancella il file.
- Che il codice tessera creato in app (es. `900000000001`, 12 cifre come quelli stampati) venga salvato come **codice a barre del cliente**, così la cassa lo riconosce.
- **Se un cliente può avere più di un codice a barre** (o un codice tessera alternativo) nella stessa anagrafica. Serve per chi ha sia la tessera fisica sia quella digitale:
  - se sì, nel file c'è `altra_tessera` (l'altro codice dello stesso cliente): l'import deve aggiungere `numero_tessera` come secondo codice del cliente che ha `altra_tessera`, e l'export dei clienti deve avere una colonna col secondo codice, da mappare su `altra_tessera`;
  - se no, ReadyPro avrà due clienti per la stessa persona. All'app va bene, perché riconosce la persona da tutti e due i codici; ma se i punti li calcolasse ReadyPro si dividerebbero sui due clienti.

Colonne di `nuovi-iscritti.csv` (separatore `;`, codifica configurabile, Windows-1252 di default):

`numero_tessera;tipo_tessera;tessera_precedente;cognome;nome;email;telefono;data_nascita;cap;citta;negozio;iscritto_il;consenso_privacy;consenso_marketing;ragione_sociale;indirizzo`

`ragione_sociale` è "COGNOME NOME" in maiuscolo, per il campo "Ragione sociale oppure cognome e nome" di ReadyPro, che non ha cognome e nome separati in importazione. ReadyPro legge le colonne per posizione: nel filtro di importazione le colonne che non servono vanno messe come "Ignora campo". `indirizzo` (via e numero civico, dal 2026-11-21) è in fondo per non spostare le altre: va aggiunta al filtro come campo Indirizzo.

Una riga per tessera. `tipo_tessera` è `fisica` o `digitale`; `tessera_precedente` è il codice che questa tessera sostituisce sullo stesso cliente, vuoto per un cliente nuovo. Le date sono `GG/MM/AAAA`, i consensi `SI`/`NO`, `negozio` è il codice del negozio nel gestionale.

Nello stesso file arrivano anche i **recapiti modificati dal socio in app** (cellulare, data di nascita, CAP, città): una riga con la tessera attuale del socio e `tessera_precedente` vuota. Con la chiave Email il filtro di importazione la vede come "Aggiornamento" del cliente esistente. Se nel file c'è già una riga della stessa tessera non ancora importata, lo script la sostituisce con quella nuova.

Vince l'ultima modifica: l'export clienti arriva una volta l'ora e può avere ancora i recapiti di prima, quindi per 20 minuti dopo che la modifica è partita verso ReadyPro l'import clienti tiene quelli dell'app (con un avviso sulla riga). Dopo, vale quello che c'è in ReadyPro: una correzione fatta in negozio arriva con l'export successivo.

## Installazione sul server

Serve Windows con PowerShell 5.1 o successivo, sempre acceso (lo stesso PC dove gira lo Schedulatore di ReadyPro va bene).

1. **Crea la chiave.** Nel SQL Editor di Supabase:
   ```sql
   select public.gestionale_crea_chiave('Server negozi');
   ```
   Copia il risultato (inizia con `psc_`): non si potrà più rivedere, nel database resta solo la sua impronta.
2. **Copia la cartella** `tools/readypro` sul server, per esempio in `C:\PSC\sincronizzazione`.
3. **Configura.** Copia `config.esempio.json` in `config.json` e imposta:
   - `UrlApp`: l'indirizzo di produzione dell'app;
   - `FileClienti`: dove ReadyPro scrive l'export dei clienti;
   - `FileNuoviIscritti`: il file che ReadyPro importa;
   - `CodificaNuoviIscritti`: `windows-1252` o `utf-8`, come vuole il filtro di import di ReadyPro.
   - `RighePerInvio` (1000) e `GiorniTraInviiCompleti` (7): di solito non si toccano. Per rimandare subito tutto il file, cancella `ultimo-invio-completo.txt`.

   Usa cartelle locali: l'attività gira come SYSTEM, che non vede le cartelle di rete.
4. **Salva la chiave e installa**, da PowerShell aperto come amministratore nella cartella:
   ```powershell
   .\sincronizza.ps1 -ImpostaChiave   # incolla la chiave
   .\sincronizza.ps1                  # prova a mano: guarda il messaggio e il log
   .\sincronizza.ps1 -Installa        # attività pianificata ogni 15 minuti
   ```

La chiave è cifrata con DPAPI di Windows (si apre solo su quel computer) e la cartella è leggibile solo da amministratori e SYSTEM. Il log è in `C:\PSC\log`, un file al giorno, tenuto 30 giorni.

## La prima volta: la mappatura delle colonne

Finché la mappatura non è impostata, i file arrivano ma non vengono elaborati (risposta `"esito": "da_mappare"` nel log, con le intestazioni del file). Per impostarla, nel SQL Editor:

```sql
update public.impostazioni
set valore = '{"numero_tessera": "Codice a barre", "nome": "Nome", "cognome": "Cognome", "email": "E-mail"}'
where chiave = 'gestionale_mappatura_soci';
```

A sinistra i campi dell'app (elenco in `docs/database.md`, sezione Import), a destra le intestazioni esatte del CSV di ReadyPro. Dal giro successivo i file vengono importati. La mappatura si può incollare anche dal pannello (Gestionale → Colonne del CSV clienti).

Un valore che inizia con `=` non è una colonna ma un valore uguale per tutte le righe, per i dati che il file non ha. Es. i consensi firmati sul modulo cartaceo della tessera: `"consenso_privacy": "=si", "consenso_marketing": "=si"`. I consensi importati restano registrati con canale `import` e versione `impostazioni.versione_consensi_import` ("modulo cartaceo della tessera").

## Punti dalle vendite

Le casse sono ReadyPro: quando il commesso scansiona la tessera, la vendita resta attaccata al cliente. Per dare i punti:

1. In ReadyPro crea un filtro di esportazione delle **vendite** (scontrini), con almeno: codice a barre del cliente, totale pagato, un identificativo univoco della vendita (es. ID o numero + data), data, negozio. Pianificalo come quello dei clienti, sempre nello stesso file (es. `C:\PSC\export\vendite.csv`). Bastano le vendite degli ultimi giorni: lo script manda solo le righe nuove e l'app scarta quelle già contate grazie all'identificativo.
2. In `config.json` imposta `FileVendite` con quel percorso. Vuoto = le vendite non si mandano.
3. Al primo invio, nel pannello (Gestionale → Colonne del CSV vendite) abbina le colonne: `numero_tessera`, `importo`, `riferimento`, `data`, `negozio`. Lì imposti anche quanti euro servono per 1 punto (5) e da che giorno le vendite danno punti (il lancio).

Le vendite senza tessera e quelle sotto il primo punto si saltano; un reso (totale negativo) toglie i punti. Gli invii arrivano dopo quelli dei clienti, così una tessera appena creata è già conosciuta.

## Prodotti negli scontrini

1. In ReadyPro, UTIL → Esportazione dati → **Aggiungi**, procedura **Documenti di magazzino - Righe**, stesso tipo documento e periodo del filtro vendite (RICEVUTA DI CASSA, ultimi 7 giorni), stesse impostazioni CSV. Campi: *Dettaglio testata documento : Numero del documento*, *Riga documento : Codice progressivo linea (ID dettaglio)*, *Riga documento : Descrizione*, *Quantita' (unita' di misura documento)*, *Totale SCONTATO ed IVA compresa (Prz * Quant.)*, facoltativi *Codice a barre* e *Ordinamento linee*. File: `C:\PSC\export\righe.csv`, nella stessa procedura pianificata delle vendite.
2. In `config.json` imposta `FileRighe` con quel percorso.
3. L'app riconosce le colonne dal nome; se non ci riesce, il log dello script lo dice e la mappatura si scrive nel pannello (Gestionale → Colonne del CSV righe).

Le righe di vendite senza tessera si cancellano dopo un giorno.

## Se qualcosa va storto

- **Una tessera resta "in attivazione".** La vista `tessere_in_attesa_cassa` (o la Panoramica del pannello) mostra da quante ore aspetta, quando è stata mandata e quando il server l'ha ritirata. Ritirata ma non attiva = ReadyPro non l'ha importata o non la esporta col codice giusto.
- **Chiave persa o compromessa.** `select public.gestionale_revoca_chiave('<id>');` (gli id sono in `gestionale_chiavi`), poi creane una nuova e rifai `-ImpostaChiave`.
- **Errori dell'app** finiscono nel log con il messaggio completo, es. `POST /api/gestionale/clienti -> 401: {"errore":"Chiave del gestionale non valida."}`.
