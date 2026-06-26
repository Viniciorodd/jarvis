@echo off
REM Jarvis — absorb NEW videos from your unlisted "To Absorb" YouTube playlist into the Obsidian vault.
REM Reads ABSORB_PLAYLIST from .env; skips videos already absorbed; hard $1 budget stop per run.
REM Schedule it (run once, in a terminal) with:
REM   schtasks /create /tn "Jarvis Absorb" /tr "\"%~f0\"" /sc daily /st 07:00 /f
cd /d "%~dp0.."
node "scripts\absorb.mjs" --playlist --budget 1 >> "%TEMP%\jarvis-absorb.log" 2>&1
