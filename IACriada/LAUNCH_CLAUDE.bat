@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Claude Code + Ollama

set "ANTHROPIC_AUTH_TOKEN=ollama"
set "ANTHROPIC_API_KEY="
set "ANTHROPIC_BASE_URL=http://localhost:11434"
set "MODELO=qwen2.5:7b"

where ollama >nul 2>&1
if errorlevel 1 (
  echo Ollama nao encontrado. Instale em https://ollama.com
  pause
  exit /b 1
)

where claude >nul 2>&1
if errorlevel 1 (
  echo Claude Code nao encontrado. Instalando...
  call npm install -g @anthropic-ai/claude-code
)

echo ========================================
echo   Claude Code via Ollama local
echo   Modelo: %MODELO%
echo ========================================
echo.

ollama launch claude --model %MODELO%
if errorlevel 1 (
  echo.
  echo Fallback: claude --model %MODELO%
  claude --model %MODELO%
)
pause
