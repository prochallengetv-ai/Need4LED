<#
.SYNOPSIS
    Script di Rollback Automatico per Need4Led
.DESCRIPTION
    Consente di ripristinare istantaneamente una versione precedente del progetto:
    v1.0-classic, v2.0-cockpit, v2.1-autoconnect-colors, v2.2-clean-ui o v2.3-ultimate,
    aggiornando in modo deterministico la cache del Service Worker per forzare il refresh
    immediato su iPhone (Bluefy) e pubblicando le modifiche su GitHub Pages.
.EXAMPLE
    .\rollback.ps1
    .\rollback.ps1 v2.2-clean-ui
#>

param(
    [string]$TargetVersion = ""
)

$repoDir = $PSScriptRoot
Set-Location $repoDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "       NEED4LED - SISTEMA DI ROLLBACK AUTOMATICO       " -ForegroundColor Yellow
Write-Host "========================================================`n" -ForegroundColor Cyan

# Elenco versioni canoniche e tag storici disponibili
$canonicalVersions = @(
    @{ Tag = "v2.3-ultimate";           Desc = "Release v2.3 - Wake Lock, Loop Deterministico, Cache GIF Offline" },
    @{ Tag = "v2.2-clean-ui";           Desc = "Release v2.2 - Design Liquid Glass, Sfondo Fluido, Template Presets" },
    @{ Tag = "v2.1-autoconnect-colors"; Desc = "Release v2.1 - Auto-associazione BLE, Watchdog e Calibrazione Pinout" },
    @{ Tag = "v2.0-cockpit";            Desc = "Release v2.0 - Cruscotto Cockpit e Modalita Dinamiche" },
    @{ Tag = "v1.0-classic";            Desc = "Release v1.0 - Interfaccia Base Classica" }
)

# Rileva tutti i tag effettivi presenti nel repository git
$gitTags = git tag -l
if (-not $gitTags) {
    Write-Host "Nessun tag git trovato nel repository locale." -ForegroundColor Red
    exit 1
}

# Costruisci l'elenco integrato delle opzioni
$availableOptions = @()
foreach ($item in $canonicalVersions) {
    if ($gitTags -contains $item.Tag) {
        $availableOptions += $item
    }
}
# Aggiungi eventuali tag aggiuntivi non censiti nella lista canonica
foreach ($t in $gitTags) {
    if (-not ($availableOptions | Where-Object { $_.Tag -eq $t })) {
        $tagMsg = git tag -l --format='%(contents:subject)' $t
        $availableOptions += @{ Tag = $t; Desc = $tagMsg }
    }
}

if (-not $TargetVersion) {
    Write-Host "Versioni storiche disponibili per il rollback immediato:" -ForegroundColor Green
    for ($i = 0; $i -lt $availableOptions.Count; $i++) {
        $opt = $availableOptions[$i]
        Write-Host "  [$($i + 1)] $($opt.Tag.PadRight(24)) - $($opt.Desc)" -ForegroundColor White
    }
    Write-Host ""
    $choice = Read-Host "Seleziona il numero della versione a cui vuoi tornare (o premi Invio per annullare)"
    if (-not $choice -or -not ($choice -as [int]) -or [int]$choice -lt 1 -or [int]$choice -gt $availableOptions.Count) {
        Write-Host "Operazione annullata. Nessuna modifica effettuata." -ForegroundColor DarkGray
        exit 0
    }
    $TargetVersion = $availableOptions[[int]$choice - 1].Tag
}

Write-Host "`nRipristino dei file alla versione target: $TargetVersion in corso..." -ForegroundColor Cyan

# Ripristina l'albero di lavoro al tag selezionato
git checkout $TargetVersion -- .

# Aggiorna il timestamp e la versione della cache del Service Worker per forzare l'aggiornamento su iOS Bluefy
$swPath = Join-Path $repoDir "sw.js"
$timestamp = (Get-Date).ToString("yyyyMMddHHmmss")
if (Test-Path $swPath) {
    $swContent = Get-Content $swPath -Raw
    $swContent = $swContent -replace "(const CACHE_NAME = .*;|const CACHE_VERSION = .*;)", "const CACHE_NAME = 'need4led-$TargetVersion-rollback-$timestamp';"
    Set-Content -Path $swPath -Value $swContent -NoNewline
    Write-Host "Aggiornata cache Service Worker: need4led-$TargetVersion-rollback-$timestamp" -ForegroundColor DarkGray
}

# Esegui commit delle modifiche
git add .
$commitMsg = "rollback: ripristino alla versione $TargetVersion (Cache ref: $timestamp)"
git commit -m $commitMsg

Write-Host "Pubblicazione del rollback su GitHub (origin/main) con --force..." -ForegroundColor Cyan
git push origin main --force

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  ROLLBACK COMPLETATO CON SUCCESSO!                   " -ForegroundColor Green
Write-Host "  Versione attiva ora: $TargetVersion                " -ForegroundColor Yellow
Write-Host "  GitHub Pages si aggiornera entro 60 secondi.       " -ForegroundColor White
Write-Host "  Ricarica l'app su Bluefy per visualizzare la release." -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Green
