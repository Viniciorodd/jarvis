@echo off
REM Jarvis — keep the Companion server + Telegram bridge + GOV INBOX WATCHER running, restarting any
REM of them if they crash. This is what makes Jarvis "always on" (phone via Tailscale, alerts via
REM Telegram). Register at logon (run ONCE):
REM   schtasks /create /tn "Jarvis Server" /tr "\"%~f0\"" /sc onlogon /f
REM
REM NOTE the invocation form: cmd /c ""script" arg" — the old `start "" /min "script.cmd" "arg"` hit
REM cmd.exe's two-quoted-strings rule, which strips quotes wrong and leaves a shell wedged at a prompt
REM with NOTHING running (the recurring black screen). Do not "simplify" these lines back.
cd /d "%~dp0.."
start "Jarvis Companion" /min cmd /c ""%~dp0run-loop.cmd" companion\server.js"
findstr /b /c:"TELEGRAM_BOT_TOKEN=" .env >nul 2>&1 && start "Jarvis Telegram" /min cmd /c ""%~dp0run-loop.cmd" companion\telegram-bridge.mjs"
findstr /b /c:"RODGATE_GMAIL_USER=" .env >nul 2>&1 && start "Jarvis GovWatch" /min cmd /c ""%~dp0run-loop.cmd" pods\gov\inbox-watch.mjs"
