<#
  Sincronizzazione tra ReadyPro e l'app del Privilege Shopping Club.

  Gira sul server dei negozi come attività pianificata. Fa solo connessioni in
  uscita verso l'app (HTTPS): nessuna porta aperta, nessuna cartella condivisa.

  1. Se ReadyPro ha esportato un nuovo CSV dei clienti o delle vendite, invia
     all'app le righe nuove o modificate (e ogni tanto tutto il file).
  2. Scarica le tessere create in app e le aggiunge al file che ReadyPro importa,
     poi conferma all'app di averle salvate.

  Uso (PowerShell come amministratore, nella cartella dello script):
    .\sincronizza.ps1 -ImpostaChiave   salva la chiave, cifrata, leggibile solo da amministratori e SYSTEM
    .\sincronizza.ps1 -Installa        crea l'attività pianificata
    .\sincronizza.ps1                  una sincronizzazione ora (è quello che esegue l'attività)

  Istruzioni complete: README.md nella stessa cartella.
#>
param(
  [switch]$ImpostaChiave,
  [switch]$Installa,
  [string]$Config = (Join-Path $PSScriptRoot 'config.json')
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Security

$NomeAttivita = 'PSC - Sincronizzazione ReadyPro'
$FileChiave = Join-Path $PSScriptRoot 'chiave.bin'
# Latin-1 legge e riscrive ogni byte così com'è: il file arriva all'app nella sua
# codifica originale (UTF-8 o Windows-1252), che l'app riconosce da sola.
$Latin1 = [Text.Encoding]::GetEncoding(28591)

if (-not (Test-Path $Config)) { throw "Manca $Config : copia config.esempio.json in config.json e compilalo." }
$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$Url = $cfg.UrlApp.TrimEnd('/')
$RighePerInvio = if ($cfg.RighePerInvio) { [int]$cfg.RighePerInvio } else { 1000 }
$GiorniTraInviiCompleti = if ($cfg.GiorniTraInviiCompleti) { [int]$cfg.GiorniTraInviiCompleti } else { 7 }

# Solo amministratori e SYSTEM (per SID, così funziona anche su Windows in italiano).
function Limita-Accesso([string]$Percorso) {
  $eredita = if (Test-Path $Percorso -PathType Container) { '(OI)(CI)' } else { '' }
  & icacls $Percorso /inheritance:r /grant:r "*S-1-5-18:$($eredita)F" "*S-1-5-32-544:$($eredita)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Impossibile limitare l'accesso a $Percorso (serve PowerShell come amministratore)." }
}

# ---------------------------------------------------------------------------
# Configurazione iniziale
# ---------------------------------------------------------------------------

if ($ImpostaChiave) {
  $sicura = Read-Host 'Incolla la chiave del gestionale (inizia con psc_)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicura)
  try { $chiave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $chiave.StartsWith('psc_')) { throw 'La chiave deve iniziare con psc_.' }

  # Cifrata con DPAPI legata a questo computer: copiata altrove non si apre.
  $cifrata = [Security.Cryptography.ProtectedData]::Protect(
    [Text.Encoding]::UTF8.GetBytes($chiave), $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  [IO.File]::WriteAllBytes($FileChiave, $cifrata)
  Limita-Accesso $FileChiave
  Write-Host "Chiave salvata in $FileChiave."
  exit 0
}

if ($Installa) {
  $azione = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$PSCommandPath`"" `
    -WorkingDirectory $PSScriptRoot
  $avvio = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes ([int]$cfg.MinutiTraInvii))
  $utente = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $opzioni = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName $NomeAttivita -Action $azione -Trigger $avvio -Principal $utente `
    -Settings $opzioni -Description 'Invia i clienti di ReadyPro all''app PSC e scarica le tessere create in app.' -Force | Out-Null
  Limita-Accesso $PSScriptRoot
  Write-Host "Attività ""$NomeAttivita"" creata: parte tra un minuto e poi ogni $($cfg.MinutiTraInvii) minuti."
  exit 0
}

# ---------------------------------------------------------------------------
# Sincronizzazione
# ---------------------------------------------------------------------------

New-Item -ItemType Directory -Force -Path $cfg.CartellaLog | Out-Null
$FileLog = Join-Path $cfg.CartellaLog ("sincronizza-{0:yyyyMMdd}.log" -f (Get-Date))

function Scrivi-Log([string]$Messaggio) {
  $riga = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Messaggio
  Add-Content -Path $FileLog -Value $riga -Encoding UTF8
  Write-Host $riga
}

function Leggi-Chiave {
  if (-not (Test-Path $FileChiave)) { throw 'Chiave non impostata: esegui .\sincronizza.ps1 -ImpostaChiave.' }
  $chiaro = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($FileChiave), $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  [Text.Encoding]::UTF8.GetString($chiaro)
}

# Invoke-WebRequest con il messaggio d'errore dell'app nel log, invece di un generico 4xx/5xx.
function Chiama-App([string]$Metodo, [string]$Percorso, [hashtable]$Intestazioni, $Corpo = $null) {
  $parametri = @{
    Uri = "$Url$Percorso"; Method = $Metodo; Headers = $Intestazioni
    UseBasicParsing = $true; TimeoutSec = 120
  }
  if ($null -ne $Corpo) { $parametri.Body = $Corpo; $parametri.ContentType = 'text/csv' }
  try {
    Invoke-WebRequest @parametri
  } catch [Net.WebException] {
    $risposta = $_.Exception.Response
    if ($null -eq $risposta) { throw }
    $testo = (New-Object IO.StreamReader($risposta.GetResponseStream())).ReadToEnd()
    throw "$Metodo $Percorso -> $([int]$risposta.StatusCode): $testo"
  }
}

# Una voce per riga del CSV: un a capo dentro le virgolette (es. nelle note) non spezza il cliente.
function Righe-Csv([string]$Testo) {
  $righe = New-Object Collections.Generic.List[string]
  $aperta = $null
  foreach ($pezzo in $Testo -split "`r?`n") {
    $aperta = if ($null -eq $aperta) { $pezzo } else { "$aperta`r`n$pezzo" }
    if ((($aperta.Length - $aperta.Replace('"', '').Length) % 2) -eq 0) { $righe.Add($aperta); $aperta = $null }
  }
  if ($null -ne $aperta) { $righe.Add($aperta) }
  ,$righe.ToArray()
}

# 1. ReadyPro -> app: un CSV (clienti o vendite), solo le righe cambiate
# dall'ultimo invio riuscito (una riga diversa = nuova o modificata), a blocchi.
# Ogni GiorniTraInviiCompleti giorni, o se cambiano le colonne, si manda tutto.
# $Stato è il prefisso dei file con cui lo script ricorda l'ultimo invio.
function Invia-Csv([string]$Percorso, [string]$Endpoint, [string]$Stato, [string]$Cosa, $Auth) {
  $FileUltimoInvio = Join-Path $PSScriptRoot "$Stato.txt"
  $FileUltimoCsv = Join-Path $PSScriptRoot "$Stato.csv"
  $FileUltimoCompleto = Join-Path $PSScriptRoot "$Stato-completo.txt"

  if (-not (Test-Path $Percorso)) { Scrivi-Log "Nessun file $Cosa in $Percorso."; return }
  $file = Get-Item $Percorso
  if ($file.LastWriteTime -gt (Get-Date).AddMinutes(-1)) { Scrivi-Log "File $Cosa appena scritto: lo invio al prossimo giro."; return }

  $bytes = [IO.File]::ReadAllBytes($file.FullName)
  $impronta = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace('-', '')
  $completo = -not (Test-Path $FileUltimoCompleto) -or
    ((Get-Item $FileUltimoCompleto).LastWriteTime -lt (Get-Date).AddDays(-$GiorniTraInviiCompleti))
  if (-not $completo -and (Test-Path $FileUltimoInvio) -and ((Get-Content $FileUltimoInvio -Raw).Trim() -eq $impronta)) { return }

  $righe = Righe-Csv ($Latin1.GetString($bytes))
  $intestazione = $righe[0]
  $dati = @($righe | Select-Object -Skip 1 | Where-Object { $_.Trim() -ne '' })

  $daInviare = $dati
  if (-not $completo -and (Test-Path $FileUltimoCsv)) {
    $precedenti = Righe-Csv ([IO.File]::ReadAllText($FileUltimoCsv, $Latin1))
    if ($precedenti.Count -gt 0 -and $precedenti[0] -eq $intestazione) {
      $giaInviati = [Collections.Generic.HashSet[string]]::new([string[]]$precedenti)
      $daInviare = @($dati | Where-Object { -not $giaInviati.Contains($_) })
    } else {
      $completo = $true
    }
  }

  $blocchi = [Math]::Ceiling($daInviare.Count / $RighePerInvio)
  for ($b = 0; $b -lt $blocchi; $b++) {
    $da = $b * $RighePerInvio
    $a = [Math]::Min($da + $RighePerInvio, $daInviare.Count) - 1
    $corpo = $Latin1.GetBytes(((@($intestazione) + $daInviare[$da..$a]) -join "`r`n") + "`r`n")
    $nome = if ($blocchi -gt 1) { "$($file.Name) ($($b + 1) di $blocchi)" } else { $file.Name }
    $r = Chiama-App 'POST' $Endpoint ($Auth + @{ 'X-Nome-File' = $nome }) $corpo
    Scrivi-Log "File $Cosa inviato ($nome): $($r.Content)"
  }

  # Solo dopo che tutti i blocchi sono andati: se uno fallisce, al prossimo giro si rimanda tutto il cambiato.
  [IO.File]::WriteAllText($FileUltimoCsv, ((@($intestazione) + $dati) -join "`r`n"), $Latin1)
  Set-Content -Path $FileUltimoInvio -Value $impronta
  if ($completo) { Set-Content -Path $FileUltimoCompleto -Value (Get-Date -Format o) }
  $tipo = if ($completo) { 'invio completo' } else { 'solo cambiate' }
  Scrivi-Log "File ${Cosa}: $($daInviare.Count) righe di $($dati.Count) inviate ($tipo)."
}

function Invia-Clienti($Auth) {
  Invia-Csv $cfg.FileClienti '/api/gestionale/clienti' 'ultimo-invio' 'clienti' $Auth
}

# Le vendite servono per i punti: se FileVendite non è configurato si salta.
function Invia-Vendite($Auth) {
  if (-not $cfg.FileVendite) { return }
  Invia-Csv $cfg.FileVendite '/api/gestionale/vendite' 'ultimo-invio-vendite' 'vendite' $Auth
}

# I prodotti dentro gli scontrini: dopo le vendite, così lo scontrino esiste già.
# Se FileRighe non è configurato si salta.
function Invia-Righe($Auth) {
  if (-not $cfg.FileRighe) { return }
  Invia-Csv $cfg.FileRighe '/api/gestionale/righe' 'ultimo-invio-righe' 'righe scontrini' $Auth
}

# 2. app -> ReadyPro: tessere create in app e recapiti modificati in app.
# ReadyPro importa sempre lo stesso file. Se c'è ancora il file del giro prima
# (ReadyPro non l'ha ancora importato), le righe nuove si aggiungono in fondo;
# una tessera già presente viene sostituita dalla riga nuova, che ha i dati più
# recenti.
function Scarica-NuoviIscritti($Auth) {
  $r = Chiama-App 'GET' '/api/gestionale/nuovi-iscritti' $Auth
  if ($r.StatusCode -eq 204) { return }

  $lotto = $r.Headers['X-Lotto']
  $righe = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()).TrimStart([char]0xFEFF) -split "`r`n" | Where-Object { $_ -ne '' }
  $codifica = [Text.Encoding]::GetEncoding([string]$cfg.CodificaNuoviIscritti)
  $destinazione = $cfg.FileNuoviIscritti
  New-Item -ItemType Directory -Force -Path (Split-Path $destinazione) | Out-Null

  # Intestazione + righe per tessera (prima colonna), nell'ordine in cui sono arrivate.
  $intestazione = $righe[0]
  $perTessera = [ordered]@{}
  if (Test-Path $destinazione) {
    $vecchie = [IO.File]::ReadAllLines($destinazione, $codifica) | Where-Object { $_ -ne '' }
    if ($vecchie) { $intestazione = @($vecchie)[0] }
    foreach ($riga in $vecchie | Select-Object -Skip 1) { $perTessera[$riga.Split(';')[0]] = $riga }
  }
  $aggiunte = 0
  foreach ($riga in $righe | Select-Object -Skip 1) {
    $tessera = $riga.Split(';')[0]
    if ($perTessera.Contains($tessera)) { $perTessera.Remove($tessera) }
    $perTessera[$tessera] = $riga
    $aggiunte++
  }
  $contenuto = New-Object Collections.Generic.List[string]
  $contenuto.Add($intestazione)
  foreach ($riga in $perTessera.Values) { $contenuto.Add($riga) }

  # Scrittura in un file temporaneo e poi rinomina: ReadyPro non legge mai un file a metà.
  $temporaneo = "$destinazione.tmp"
  [IO.File]::WriteAllLines($temporaneo, $contenuto, $codifica)
  Move-Item -Force $temporaneo $destinazione

  Chiama-App 'POST' "/api/gestionale/nuovi-iscritti/conferma?lotto=$lotto" $Auth | Out-Null
  Scrivi-Log "Nuovi iscritti: $aggiunte righe (tessere nuove o recapiti modificati) scritte in $destinazione (lotto $lotto)."
}

try {
  $auth = @{ Authorization = "Bearer $(Leggi-Chiave)" }
  $errori = 0
  foreach ($passo in 'Invia-Clienti', 'Invia-Vendite', 'Invia-Righe', 'Scarica-NuoviIscritti') {
    try { & $passo $auth } catch { $errori++; Scrivi-Log "ERRORE in ${passo}: $($_.Exception.Message)" }
  }
  Get-ChildItem $cfg.CartellaLog -Filter 'sincronizza-*.log' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
  exit $errori
} catch {
  Scrivi-Log "ERRORE: $($_.Exception.Message)"
  exit 1
}
