# JARVIS Companion auto-start — launches her server HIDDEN at logon so she's always on.
# Registered as the "JARVIS Companion" scheduled task. To remove auto-start:
#   Unregister-ScheduledTask -TaskName "JARVIS Companion" -Confirm:$false
$here = $PSScriptRoot
Set-Location $here
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'node' }
# Don't start a second copy if she's already listening on 8095.
$busy = $false
try { $busy = (Test-NetConnection -ComputerName 127.0.0.1 -Port 8095 -WarningAction SilentlyContinue -InformationLevel Quiet) } catch {}
if (-not $busy) {
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $here -WindowStyle Hidden
}
