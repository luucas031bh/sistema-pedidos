@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm.cmd nao encontrado. Instale o Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
echo Instalando dependencias em %cd% ...
call npm.cmd install
if errorlevel 1 (
  echo [ERRO] npm install falhou.
  pause
  exit /b 1
)
echo.
echo Pronto. Copie .env.example para .env se ainda nao tiver, depois: start.bat ou npm.cmd start
pause
