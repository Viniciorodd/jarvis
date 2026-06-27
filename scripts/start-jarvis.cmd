@echo off
REM Jarvis — keep the Companion server running (and the Telegram bridge, if a bot token is set in .env),
REM restarting either if it crashes. This is what makes Jarvis "always on" on your phone (via Tailscale).
REM Run it at logon (run ONCE in a terminal to register):
REM   schtasks /create /tn "Jarvis Server" /tr "\"%~f0\"" /sc onlogon /f
cd /d "%~dp0.."
start "Jarvis Companion" /min "%~dp0run-loop.cmd" "companion\server.js"
findstr /b /c:"TELEGRAM_BOT_TOKEN=" .env >nul 2>&1 && start "Jarvis Telegram" /min "%~dp0run-loop.cmd" "companion\telegram-bridge.mjs"
