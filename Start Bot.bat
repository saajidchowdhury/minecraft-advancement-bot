@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js from https://nodejs.org first, then try again. & pause & exit /b 1)
if not exist node_modules (
    echo First run: downloading what the bot needs, about a minute...
    call npm ci --no-audit --no-fund || (echo Setup failed. Check your internet connection and try again. & pause & exit /b 1)
)
if not exist .env copy .env.example .env >nul
set /p MC_PORT=Type the port number from Minecraft chat, then press Enter: 
echo Starting the bot. Close this window to stop it.
node --env-file-if-exists=.env src/index.js
pause
