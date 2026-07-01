@echo off
REM Double-click to turn on JARVIS: her brain/voice/UI + the Slack bridge.
cd /d "%~dp0"
REM Free local brain (Ollama) so Jarvis keeps working when Claude tokens run out. Harmless if already running.
start "Ollama" /min cmd /c "ollama serve"
REM Control-plane (event store + command router) — the spine the agents run on.
start "JARVIS Control-Plane" /min cmd /c "node ..\control-plane\server.js"
REM Scheduler — wakes the agents on their cadence (working-hours only, conservative; idle polls rest).
REM This is what makes the AI agents actually RUN the work on their own.
start "JARVIS Scheduler" /min cmd /c "node ..\control-plane\scheduler.mjs"
REM Free local voice (Kokoro) is auto-started by the companion server now (works for the desktop app too).
start "JARVIS Slack Bridge" cmd /c "node slack-bridge.mjs"
REM Telegram bridge — text Jarvis from your phone (needs TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env).
REM NOTE: if OpenClaw also polls the SAME Telegram bot, they conflict (Telegram allows one listener per
REM bot) — give OpenClaw its own separate bot token, or don't run both on the same bot.
start "JARVIS Telegram Bridge" /min cmd /c "node telegram-bridge.mjs"
start "" http://localhost:8095
node server.js
