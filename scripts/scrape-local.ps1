# Lokal reserv för prisavläsningen (om GitHub Actions blir blockerat av Wolt).
# Kräver git och Node 22+ samt att repot är klonat med push-rätt.
# Kör manuellt:   powershell -ExecutionPolicy Bypass -File scripts\scrape-local.ps1
# Med -IfDue läser skriptet bara av om dagens avläsning efter kl. 16 saknas (bra för schemaläggning).
param([switch]$IfDue)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

git pull --ff-only
if ($LASTEXITCODE) { throw 'git pull misslyckades; kontrollera lokala ändringar.' }

$scrapeArgs = @('scripts/scrape.mjs')
if ($IfDue) { $scrapeArgs += '--if-due' }
node @scrapeArgs
if ($LASTEXITCODE) { throw 'Ingen meny kunde läsas; inget sparat.' }

git add data/history.json data/images.json data/venues.json
if (Test-Path data/discovered.json) { git add data/discovered.json }
if (Test-Path data/ubereats.json) { git add data/ubereats.json }
if (Test-Path data/ubereats-links.json) { git add data/ubereats-links.json }
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host 'Inga ändringar att spara.'; exit 0 }
git commit -m "Prisavläsning $(Get-Date -Format 'yyyy-MM-dd HH:mm') (lokal)"
git push
if ($LASTEXITCODE) { throw 'git push misslyckades.' }
