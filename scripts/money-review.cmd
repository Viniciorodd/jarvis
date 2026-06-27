@echo off
REM Jarvis — WEEKLY money review on your Claude subscription (NOT the API). Updates 💰 Money Moves.md +
REM appends a dated review (income vs $10k, the one move, a fresh idea). LEAST PRIVILEGE: may only run the
REM income CLI + read/edit vault notes. Schedule weekly with, in a terminal:
REM   schtasks /create /tn "Jarvis Money Review" /tr "\"%~f0\"" /sc weekly /d MON /st 06:00 /f
cd /d "%~dp0.."
set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if not exist "%CLAUDE%" set "CLAUDE=claude"
"%CLAUDE%" -p "Read scripts/money-review.md and follow it exactly. Then stop." --permission-mode acceptEdits --allowedTools "Bash(node control-plane/money.mjs:*) Read Glob Edit Write" >> "%TEMP%\jarvis-money-review.log" 2>&1
