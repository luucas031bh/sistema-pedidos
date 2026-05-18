@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Configurar Claude + OpenClaw (Ollama)

set "MODELO=qwen2.5:7b"

echo ========================================
echo   Integracoes Ollama no sistema
echo   Claude Code + OpenClaw
echo ========================================
echo.

where ollama >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Ollama nao esta no PATH.
  pause
  exit /b 1
)

echo [1/4] Verificando modelo %MODELO%...
ollama list | findstr /i "qwen2.5" >nul
if errorlevel 1 (
  echo Baixando modelo...
  ollama pull %MODELO%
)

echo.
echo [2/4] Instalando Claude Code (npm)...
call npm install -g @anthropic-ai/claude-code

echo.
echo [3/4] Instalando OpenClaw (npm)...
call npm install -g openclaw@latest

echo.
echo [4/4] Configurando OpenClaw com Ollama...
openclaw onboard --non-interactive --accept-risk --auth-choice ollama --custom-base-url http://localhost:11434 --custom-model-id %MODELO% --skip-channels --skip-skills --skip-health

echo.
echo Variaveis Claude Code (sessao atual):
set "ANTHROPIC_AUTH_TOKEN=ollama"
set "ANTHROPIC_API_KEY="
set "ANTHROPIC_BASE_URL=http://localhost:11434"

echo.
echo ========================================
echo   Pronto!
echo   - LAUNCH_CLAUDE.bat   -> ollama launch claude
echo   - LAUNCH_OPENCLAW.bat -> ollama launch openclaw
echo ========================================
echo.
pause
