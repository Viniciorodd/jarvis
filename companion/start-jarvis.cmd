@echo off
REM Double-click to turn on JARVIS: her brain/voice/UI + the Slack bridge.
cd /d "%~dp0"
REM Free local brain (Ollama) so Jarvis keeps working when Claude tokens run out. Harmless if already running.
start "Ollama" /min cmd /c "ollama serve"
start "JARVIS Slack Bridge" cmd /c "node slack-bridge.mjs"
start "" http://localhost:8095
node server.js
