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

Un socio può avere una tessera fisica (codice stampato) e una digitale (`APP000123`), **tutte e due valide in cassa** e con gli stessi punti. Nell'app i punti stanno sulla persona, quindi un acquisto fatto con l'una o con l'altra finisce sullo stesso saldo.

## Cosa chiedere al rivenditore ReadyPro

- Un **filtro di esportazione** dei clienti in CSV, con almeno: codice a barre della tessera, nome, cognome, email, cellulare, data di nascita, negozio, consensi privacy/marketing. Una **procedura pianificata** che lo esegue ogni ora e scrive sempre lo stesso file locale (es. `C:\PSC\export\clienti.csv`).
- Un **filtro di importazione** dei clienti dal file `C:\PSC\import\nuovi-iscritti.csv` (colonne qui sotto), che **aggiorna** il cliente se il codice tessera esiste già invece di crearne un doppione, e una procedura pianificata che lo esegue ogni 15–30 minuti. Va bene se dopo l'import ReadyPro sposta o cancella il file.
- Che il codice tessera creato in app (es. `900000000001`, 12 cifre come quelli stampati) venga salvato come **codice a barre del cliente**, così la cassa lo riconosce.
- **Se un cliente può avere più di un codice a barre** (o un codice tessera alternativo) nella stessa anagrafica. Serve per chi ha sia la tessera fisica sia quella digitale:
  - se sì, nel file c'è `altra_tessera` (l'altro codice dello stesso cliente): l'import deve aggiungere `numero_tessera` come secondo codice del cliente che ha `altra_tessera`, e l'export dei clienti deve avere una colonna col secondo codice, da mappare su `altra_tessera`;
  - se no, ReadyPro avrà due clienti per la stessa persona. All'app va bene, perché riconosce la persona da tutti e due i codici; ma se i punti li calcolasse ReadyPro si dividerebbero sui due clienti.

Colonne di `nuovi-iscritti.csv` (separatore `;`, codifica configurabile, Windows-1252 di default):

`numero_tessera;tipo_tessera;altra_tessera;cognome;nome;email;telefono;data_nascita;cap;citta;negozio;iscritto_il;consenso_privacy;consenso_marketing`

Una riga per tessera. `tipo_tessera` è `fisica` o `digitale`; `altra_tessera` è l'altro codice attivo dello stesso socio, vuoto se ne ha uno solo. Le date sono `GG/MM/AAAA`, i consensi `SI`/`NO`, `negozio` è il codice del negozio nel gestionale.

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

A sinistra i campi dell'app (elenco in `docs/database.md`, sezione Import), a destra le intestazioni esatte del CSV di ReadyPro. Se ReadyPro esporta un secondo codice per cliente, mappalo su `altra_tessera`. Dal giro successivo i file vengono importati.

## Se qualcosa va storto

- **Una tessera resta "in attivazione".** La vista `tessere_in_attesa_cassa` (o la Panoramica del pannello) mostra da quante ore aspetta, quando è stata mandata e quando il server l'ha ritirata. Ritirata ma non attiva = ReadyPro non l'ha importata o non la esporta col codice giusto.
- **Chiave persa o compromessa.** `select public.gestionale_revoca_chiave('<id>');` (gli id sono in `gestionale_chiavi`), poi creane una nuova e rifai `-ImpostaChiave`.
- **Errori dell'app** finiscono nel log con il messaggio completo, es. `POST /api/gestionale/clienti -> 401: {"errore":"Chiave del gestionale non valida."}`.
