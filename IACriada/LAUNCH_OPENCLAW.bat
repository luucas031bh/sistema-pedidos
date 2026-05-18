@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenClaw + Ollama

set "MODELO=qwen2.5:7b"

where ollama >nul 2>&1
if errorlevel 1 (
  echo Ollama nao encontrado. Instale em https://ollama.com
  pause
  exit /b 1
)

where openclaw >nul 2>&1
if errorlevel 1 (
  echo OpenClaw nao encontrado. Instalando...
  call npm install -g openclaw@latest
)

echo ========================================
echo   OpenClaw via Ollama local
echo   Modelo: %MODELO%
echo ========================================
echo.

ollama launch openclaw --model %MODELO% --yes
if errorlevel 1 (
  echo.
  echo Fallback: openclaw com Ollama ja configurado em %%USERPROFILE%%\.openclaw
  openclaw
)
pause
