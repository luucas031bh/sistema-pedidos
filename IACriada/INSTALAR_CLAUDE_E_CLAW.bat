@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Instalando Claude Code e OpenClaw (npm global)...
echo.

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js / npm.cmd nao encontrado.
  echo Instale Node.js LTS: https://nodejs.org
  pause
  exit /b 1
)

call npm.cmd install -g @anthropic-ai/claude-code openclaw@latest
if errorlevel 1 (
  echo.
  echo [ERRO] Falha na instalacao.
  pause
  exit /b 1
)

echo.
echo OK. Feche e reabra o terminal (ou o AdonayPainel.exe).
where claude 2>nul
where openclaw 2>nul
echo.
pause
