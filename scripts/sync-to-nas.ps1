# Push the JARVIS repo from this Windows PC to the NAS over SMB (no git remote needed).
# After it copies, SSH into the NAS (or use the UGOS terminal) and run ./scripts/deploy-nas.sh there.
#
# Usage (from the repo root):
#   pwsh scripts/sync-to-nas.ps1 -Dest '\\192.168.6.121\docker\jarvis'
#   pwsh scripts/sync-to-nas.ps1 -Dest '\\192.168.6.121\docker\jarvis' -IncludeEnv   # FIRST deploy only
# Point -Dest at the folder on the NAS where the stack lives (the one with docker-compose.yml). If you
# haven't deployed before, create an empty folder on a NAS share and use that path.
#
# ⚠ .env IS EXCLUDED BY DEFAULT (fixed 2026-07-17). The PC .env and the NAS .env legitimately DIVERGE —
# the NAS had FINANCE_AUTO_INVOICE the PC doesn't, and the PC has 17 keys that are wrong or harmful on the
# NAS (LOCAL_MODEL/OLLAMA_AUTOSTART — Ollama runs on the PC; JARVIS_ROOTS — Windows paths; CONTROL_PLANE_URL
# — points AT the NAS). Copying it with /PURGE would have silently DESTROYED the NAS-only key and broken
# config that was working. The NAS .env is its own source of truth; edit it there.
# Use -IncludeEnv ONLY for a first-ever deploy to a NAS folder that has no .env yet.
param(
  [Parameter(Mandatory = $true)] [string]$Dest,
  [switch]$IncludeEnv
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

# Copy code + prompts (the NAS needs them). Skip build junk, local state, and work product.
# NOTE: prompts/ is gitignored but REQUIRED on the NAS, so robocopy (not git) is the right tool.
# The excluded dirs are the NAS's OWN state (volumes/) or per-machine ledgers that must never be
# cross-copied — /XD also protects them from /PURGE, so the NAS keeps its data.
$exclDirs = @('node_modules', 'dist', 'dev-dist', '.git', 'volumes', '.netlify', '.claude', 'fiverr-assets',
  'gov-drafts', 'tax-inbox', 'tax-docs', 'tax-ledger', 'finance-credit', 'ideas-vault', 'reports')
$exclFiles = @('*.log', '.commitmsg.tmp')
if (-not $IncludeEnv) { $exclFiles += '.env' }   # see the header: PC .env != NAS .env; /PURGE would clobber it
else { Write-Host "-IncludeEnv: the NAS .env WILL be overwritten by this PC's .env." -ForegroundColor Yellow }
robocopy $src $Dest /E /PURGE /XD $exclDirs /XF $exclFiles /R:1 /W:1 /NFL /NDL /NJH /NP | Out-Null
$rc = $LASTEXITCODE  # robocopy: 0-7 = success, >=8 = error

if ($rc -ge 8) { Write-Host "robocopy reported errors (code $rc)." -ForegroundColor Red; exit $rc }

Write-Host "`n✅ Code synced to the NAS." -ForegroundColor Green
Write-Host "Next, on the NAS (SSH or UGOS terminal):" -ForegroundColor Green
Write-Host "  cd <the folder you synced to>"
Write-Host "  # confirm .env and prompts/gov/entity-profile.md are present"
Write-Host "  ./scripts/deploy-nas.sh"
Write-Host "`nThen open  http://jarvis-nas:8095  (Jarvis World) and  :8099  (HQ) on your devices."
