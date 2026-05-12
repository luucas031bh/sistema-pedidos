@echo off
setlocal
title BOT-tipoCS
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm.cmd nao encontrado. Instale o Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] node nao encontrado no PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [ERRO] Pasta node_modules nao existe. Rode install.bat ou: npm.cmd install
  pause
  exit /b 1
)

if not exist ".env" (
  echo [AVISO] Arquivo .env nao encontrado. Copie .env.example para .env e preencha APPS_SCRIPT_URL
  echo.
)

echo Iniciando bot ^(Ctrl+C para parar^)...
echo.
call npm.cmd start
echo.
pause
