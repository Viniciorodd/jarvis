@echo off
REM Jarvis — absorb new valuable videos OVERNIGHT using your Claude subscription (NOT the API).
REM Runs Claude Code headless: it stages transcripts (free) then summarizes them on your subscription.
REM LEAST PRIVILEGE: the run may ONLY execute the absorb script + read/edit notes — not arbitrary commands.
REM Schedule it for the 12am-7am window (runs hourly in that window) with, in a terminal:
REM   schtasks /create /tn "Jarvis Absorb" /tr "\"%~f0\"" /sc hourly /st 00:00 /et 07:00 /f
cd /d "%~dp0.."
set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if not exist "%CLAUDE%" set "CLAUDE=claude"
"%CLAUDE%" -p "Read scripts/absorb-overnight.md and follow it exactly. Do one batch, then stop." --permission-mode acceptEdits --allowedTools "Bash(node scripts/absorb.mjs:*) Read Glob Edit Write" >> "%TEMP%\jarvis-absorb-overnight.log" 2>&1
