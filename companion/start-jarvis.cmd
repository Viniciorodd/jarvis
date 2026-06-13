@echo off
REM Double-click to open JARVIS. Starts her server and opens the orb in your browser.
cd /d "%~dp0"
start "" http://localhost:8095
node server.js
