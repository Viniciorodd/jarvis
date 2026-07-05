@echo off
REM Helper: run a node script from the repo root and restart it if it ever exits. Used by start-jarvis.cmd.
REM Logs to the repo's logs\ folder — NOT %TEMP%, which is unset in some scheduled-task environments and
REM silently broke the redirect (the loop spun forever without ever starting node = the black screen).
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
node %1 >> "logs\%~n1.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
