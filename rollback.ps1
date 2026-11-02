<#
.SYNOPSIS
    Script di Rollback Automatico per Need4Led
.DESCRIPTION
    Consente di ripristinare istantaneamente una versione precedente (es. v1.0-classic o v2.0-cockpit)
    e pubblicarla automaticamente su GitHub Pages senza toccare file manualmente.
.EXAMPLE
    .\rollback.ps1
    .\rollback.ps1 v1.0-classic
#>

param(
    [string]$TargetVersion = ""
)

$repoDir = $PSScriptRoot
Set-Location $repoDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "       NEED4LED — SISTEMA DI ROLLBACK AUTOMATICO       " -ForegroundColor Yellow
Write-Host "========================================================`n" -ForegroundColor Cyan

# Ottieni i tag disponibili
$tags = git tag -l
if (-not $tags) {
    Write-Host "Nessuna versione taggata trovata nel repository." -ForegroundColor Red
    exit 1
}

$tagList = @($tags)

if (-not $TargetVersion) {
    Write-Host "Versioni storiche disponibili per il rollback:" -ForegroundColor Green
    for ($i = 0; $i -lt $tagList.Count; $i++) {
        $tag = $tagList[$i]
        $tagMsg = git tag -l --format='%(contents:subject)' $tag
        Write-Host "  [$($i + 1)] $tag - $tagMsg" -ForegroundColor White
    }
    Write-Host ""
    $choice = Read-Host "Seleziona il numero della versione a cui vuoi tornare (o premi Invio per annullare)"
    if (-not $choice -or -not ($choice -as [int]) -or [int]$choice -lt 1 -or [int]$choice -gt $tagList.Count) {
        Write-Host "Operazione annullata. Nessuna modifica effettuata." -ForegroundColor DarkGray
        exit 0
    }
    $TargetVersion = $tagList[[int]$choice - 1]
}

Write-Host "`nRipristino dei file alla versione: $TargetVersion in corso..." -ForegroundColor Cyan

# Ripristina l'albero di lavoro al tag selezionato
git checkout $TargetVersion -- .

# Aggiorna il timestamp del Service Worker per forzare il refresh su iPhone Bluefy
$swPath = Join-Path $repoDir "sw.js"
if (Test-Path $swPath) {
    $timestamp = (Get-Date).ToString("yyyyMMddHHmmss")
    $swContent = Get-Content $swPath -Raw
    $swContent = $swContent -replace "const CACHE_NAME = '.*?';", "const CACHE_NAME = 'need4led-$TargetVersion-$timestamp';"
    Set-Content -Path $swPath -Value $swContent -NoNewline
}

# Esegui commit e push del rollback su main
git add .
$commitMsg = "rollback: ripristino alla versione $TargetVersion (Cache ref: $timestamp)"
git commit -m $commitMsg

Write-Host "Pubblicazione del rollback su GitHub (origin/main)..." -ForegroundColor Cyan
git push origin main

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  ROLLBACK COMPLETATO CON SUCCESSO!                   " -ForegroundColor Green
Write-Host "  Versione attiva ora: $TargetVersion                " -ForegroundColor Yellow
Write-Host "  GitHub Pages si aggiornerà entro 60 secondi.       " -ForegroundColor White
Write-Host "  Ricarica l'app su Bluefy per vedere la versione.    " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Green
