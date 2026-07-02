@echo off
REM install-autostart.cmd — register Jarvis to launch itself at every logon, so a reboot or crash
REM can't leave you with a dead app ("not working again"). Run this ONCE (double-click is fine).
REM It creates a Scheduled Task that runs scripts/start-jarvis.cmd, which itself relaunches the
REM Companion (+ Telegram bridge) via run-loop.cmd and restarts them if they crash.
REM
REM To undo:  schtasks /delete /tn "Jarvis Server" /f
setlocal
set "TASK=Jarvis Server"
set "TARGET=%~dp0start-jarvis.cmd"

echo.
echo Registering "%TASK%" to run at logon:
echo   %TARGET%
echo.
schtasks /create /tn "%TASK%" /tr "\"%TARGET%\"" /sc onlogon /rl limited /f
if %errorlevel% neq 0 (
  echo.
  echo Could not register the task. If it says "Access is denied", right-click this file
  echo and choose "Run as administrator", then run it again.
  pause
  exit /b 1
)
echo.
echo Done. Jarvis will start automatically each time you log in.
echo Starting it now so you don't have to wait for the next logon...
start "" "%TARGET%"
echo.
echo   - To check it's registered:  schtasks /query /tn "Jarvis Server"
echo   - To remove autostart:       schtasks /delete /tn "Jarvis Server" /f
echo.
pause
