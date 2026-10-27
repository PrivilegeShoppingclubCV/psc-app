<#
  Sincronizzazione tra ReadyPro e l'app del Privilege Shopping Club.

  Gira sul server dei negozi come attività pianificata. Fa solo connessioni in
  uscita verso l'app (HTTPS): nessuna porta aperta, nessuna cartella condivisa.

  1. Se ReadyPro ha esportato un nuovo CSV dei clienti, lo invia all'app.
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
$FileUltimoInvio = Join-Path $PSScriptRoot 'ultimo-invio.txt'

if (-not (Test-Path $Config)) { throw "Manca $Config : copia config.esempio.json in config.json e compilalo." }
$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$Url = $cfg.UrlApp.TrimEnd('/')

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

# 1. ReadyPro -> app: CSV dei clienti, solo se è cambiato dall'ultimo invio riuscito.
function Invia-Clienti($Auth) {
  if (-not (Test-Path $cfg.FileClienti)) { Scrivi-Log "Nessun file clienti in $($cfg.FileClienti)."; return }
  $file = Get-Item $cfg.FileClienti
  if ($file.LastWriteTime -gt (Get-Date).AddMinutes(-1)) { Scrivi-Log 'File clienti appena scritto: lo invio al prossimo giro.'; return }

  $impronta = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
  if ((Test-Path $FileUltimoInvio) -and ((Get-Content $FileUltimoInvio -Raw).Trim() -eq $impronta)) { return }

  $r = Chiama-App 'POST' '/api/gestionale/clienti' ($Auth + @{ 'X-Nome-File' = $file.Name }) ([IO.File]::ReadAllBytes($file.FullName))
  Set-Content -Path $FileUltimoInvio -Value $impronta
  Scrivi-Log "Clienti inviati: $($r.Content)"
}

# 2. app -> ReadyPro: tessere create in app.
# ReadyPro importa sempre lo stesso file. Se c'è ancora il file del giro prima
# (ReadyPro non l'ha ancora importato), le righe nuove si aggiungono in fondo
# senza ripetere le tessere già presenti.
function Scarica-NuoviIscritti($Auth) {
  $r = Chiama-App 'GET' '/api/gestionale/nuovi-iscritti' $Auth
  if ($r.StatusCode -eq 204) { return }

  $lotto = $r.Headers['X-Lotto']
  $righe = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()).TrimStart([char]0xFEFF) -split "`r`n" | Where-Object { $_ -ne '' }
  $codifica = [Text.Encoding]::GetEncoding([string]$cfg.CodificaNuoviIscritti)
  $destinazione = $cfg.FileNuoviIscritti
  New-Item -ItemType Directory -Force -Path (Split-Path $destinazione) | Out-Null

  $contenuto = New-Object Collections.Generic.List[string]
  $presenti = @{}
  if (Test-Path $destinazione) {
    foreach ($riga in [IO.File]::ReadAllLines($destinazione, $codifica)) {
      if ($riga -eq '') { continue }
      $contenuto.Add($riga)
      $presenti[$riga.Split(';')[0]] = $true
    }
  } else {
    $contenuto.Add($righe[0])
  }
  $aggiunte = 0
  foreach ($riga in $righe | Select-Object -Skip 1) {
    if (-not $presenti.ContainsKey($riga.Split(';')[0])) { $contenuto.Add($riga); $aggiunte++ }
  }

  # Scrittura in un file temporaneo e poi rinomina: ReadyPro non legge mai un file a metà.
  $temporaneo = "$destinazione.tmp"
  [IO.File]::WriteAllLines($temporaneo, $contenuto, $codifica)
  Move-Item -Force $temporaneo $destinazione

  Chiama-App 'POST' "/api/gestionale/nuovi-iscritti/conferma?lotto=$lotto" $Auth | Out-Null
  Scrivi-Log "Nuovi iscritti: $aggiunte tessere aggiunte a $destinazione (lotto $lotto)."
}

try {
  $auth = @{ Authorization = "Bearer $(Leggi-Chiave)" }
  $errori = 0
  foreach ($passo in 'Invia-Clienti', 'Scarica-NuoviIscritti') {
    try { & $passo $auth } catch { $errori++; Scrivi-Log "ERRORE in ${passo}: $($_.Exception.Message)" }
  }
  Get-ChildItem $cfg.CartellaLog -Filter 'sincronizza-*.log' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
  exit $errori
} catch {
  Scrivi-Log "ERRORE: $($_.Exception.Message)"
  exit 1
}
