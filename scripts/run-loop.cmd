@echo off
REM Helper: run a node script from the repo root and restart it if it ever exits. Used by start-jarvis.cmd.
cd /d "%~dp0.."
:loop
node %1 >> "%TEMP%\jarvis-%~n1.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
