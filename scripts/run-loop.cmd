@echo off
REM Helper: run a node script from the repo root and restart it if it ever exits. Used by start-jarvis.cmd.
REM Logs to the repo's logs\ folder — NOT %TEMP%, which is unset in some scheduled-task environments and
REM silently broke the redirect (the loop spun forever without ever starting node = the black screen).
REM
REM ── 2026-08-06: BACKOFF ADDED, and it is not cosmetic ────────────────────────────────────────────────
REM server.log had reached 20.5 MB containing 40,118 EADDRINUSE crashes. Two startup shortcuts were both
REM launching a companion; the loser could never bind 8095, exited instantly, and this loop restarted it
REM five seconds later — forever. A restart loop with a fixed delay turns one bad condition into a
REM permanent hot spin that burns CPU, floods the disk, and hides the real error inside 40,000 copies of
REM itself.
REM
REM So: a service that dies FAST gets progressively longer delays (5s, 10s, 20s, 40s, 80s, 160s, 300s cap)
REM and says so in the log. A service that ran for a while resets to 5s, because that is an ordinary crash
REM and should recover quickly. The distinction is elapsed time, measured by node since cmd has no clock
REM arithmetic worth trusting.
cd /d "%~dp0.."
if not exist logs mkdir logs
set "DELAY=5"
set "FAILS=0"

:loop
for /f %%T in ('node -e "process.stdout.write(String(Date.now()))"') do set "T0=%%T"
node %1 >> "logs\%~n1.log" 2>&1
for /f %%T in ('node -e "process.stdout.write(String(Date.now()))"') do set "T1=%%T"

REM Ran for 60s or more? Treat it as a real crash, not a failure to start. Reset the backoff.
for /f %%R in ('node -e "process.stdout.write((%T1%-%T0%)>=60000?'1':'0')"') do set "LONG=%%R"
if "%LONG%"=="1" (
  set "DELAY=5"
  set "FAILS=0"
) else (
  set /a FAILS+=1
  for /f %%D in ('node -e "process.stdout.write(String(Math.min(300,5*Math.pow(2,%FAILS%))))"') do set "DELAY=%%D"
  echo [run-loop] %~n1 exited after less than 60s ^(fail #%FAILS%^) — waiting %DELAY%s before retry >> "logs\%~n1.log"
  if %FAILS% GEQ 5 echo [run-loop] %~n1 has failed to stay up %FAILS% times. Something is wrong — check the error above, not this loop. >> "logs\%~n1.log"
)

timeout /t %DELAY% /nobreak >nul
goto loop
