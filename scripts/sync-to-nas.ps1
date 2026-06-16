# Push the JARVIS repo from this Windows PC to the NAS over SMB (no git remote needed).
# After it copies, SSH into the NAS (or use the UGOS terminal) and run ./scripts/deploy-nas.sh there.
#
# Usage (from the repo root):
#   pwsh scripts/sync-to-nas.ps1 -Dest '\\192.168.6.121\docker\jarvis'
# Point -Dest at the folder on the NAS where the stack lives (the one with docker-compose.yml). If you
# haven't deployed before, create an empty folder on a NAS share and use that path.
param(
  [Parameter(Mandatory = $true)] [string]$Dest
)
$ErrorActionPreference = 'Stop'
$src = (Resolve-Path "$PSScriptRoot\..").Path
Write-Host "Syncing  $src" -ForegroundColor Cyan
Write-Host "    →    $Dest" -ForegroundColor Cyan

if (-not (Test-Path $Dest)) {
  Write-Host "Destination not reachable. Check the share is mounted and the path exists:" -ForegroundColor Yellow
  Write-Host "  $Dest"
  Write-Host "Tip: in Explorer, open \\192.168.6.121 and confirm the share + folder, then re-run."
  exit 1
}

# Copy code + .env + prompts (the NAS needs them). Skip build junk, local state, and work product.
# NOTE: .env and prompts/ are gitignored but REQUIRED on the NAS, so robocopy (not git) is the right tool.
$exclDirs = @('node_modules', 'dist', 'dev-dist', '.git', 'volumes', '.netlify', '.claude', 'fiverr-assets', 'gov-drafts')
$exclFiles = @('*.log', '.commitmsg.tmp')
robocopy $src $Dest /E /PURGE /XD $exclDirs /XF $exclFiles /R:1 /W:1 /NFL /NDL /NJH /NP | Out-Null
$rc = $LASTEXITCODE  # robocopy: 0-7 = success, >=8 = error

if ($rc -ge 8) { Write-Host "robocopy reported errors (code $rc)." -ForegroundColor Red; exit $rc }

Write-Host "`n✅ Code synced to the NAS." -ForegroundColor Green
Write-Host "Next, on the NAS (SSH or UGOS terminal):" -ForegroundColor Green
Write-Host "  cd <the folder you synced to>"
Write-Host "  # confirm .env and prompts/gov/entity-profile.md are present"
Write-Host "  ./scripts/deploy-nas.sh"
Write-Host "`nThen open  http://jarvis-nas:8095  (Jarvis World) and  :8099  (HQ) on your devices."
