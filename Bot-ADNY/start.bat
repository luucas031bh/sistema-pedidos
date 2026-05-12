@echo off
setlocal
title Bot-ADNY
cd /d "%~dp0"

echo Pasta: %cd%
echo.

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm.cmd nao encontrado no PATH.
  echo Instale o Node.js LTS: https://nodejs.org/
  echo Depois feche e abra o CMD de novo.
  goto :fim
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] node nao encontrado no PATH.
  goto :fim
)

if not exist "node_modules\" (
  echo [ERRO] Pasta node_modules nao existe.
  echo Rode install.bat ou: npm.cmd install
  goto :fim
)

if not exist ".env" (
  echo [AVISO] Arquivo .env nao encontrado. Copie .env.example para .env
  echo.
)

REM Evita PORT errado herdado do Windows; o valor final vem do .env ao iniciar o Node
set "PORT=3000"

echo Porta: o servidor usa o que estiver em .env ^(padrao do projeto: 3000^).
echo Iniciando servidor ^(Ctrl+C para parar^)...
echo.
call npm.cmd start
echo.
echo Servidor encerrado. Codigo de saida: %errorlevel%
goto :fim

:fim
echo.
pause
