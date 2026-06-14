@echo off
REM Double-click to turn on JARVIS: her brain/voice/UI + the Slack bridge.
cd /d "%~dp0"
start "JARVIS Slack Bridge" cmd /c "node slack-bridge.mjs"
start "" http://localhost:8095
node server.js
