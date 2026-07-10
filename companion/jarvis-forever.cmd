@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  jarvis-forever.cmd — Florida-proof companion launcher.
REM  Runs ONLY the companion (the cockpit UI on :8095). The NAS already runs the
REM  control-plane, scheduler, and Telegram bridge 24/7 in Docker — do NOT start a
REM  second telegram-bridge here (Telegram allows one listener per bot; two conflict).
REM  Self-healing: if the companion ever exits/crashes, it restarts in 5s. Registered
REM  to run at logon by the "JarvisCompanion" scheduled task so a reboot brings it back.
REM ─────────────────────────────────────────────────────────────────────────────
cd /d "%~dp0"
set PORT=8095
:loop
echo [%date% %time%] starting JARVIS companion on :%PORT% ...
node server.js
echo [%date% %time%] companion exited (code %errorlevel%) — restarting in 5s ...
timeout /t 5 /nobreak >nul
goto loop
