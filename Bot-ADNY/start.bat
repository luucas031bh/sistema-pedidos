@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm.cmd nao encontrado. Instale o Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
call npm.cmd start
