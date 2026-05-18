@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Assistente Adonay

python --version >nul 2>&1
if errorlevel 1 (
  echo Instale Python 3.10+
  pause
  exit /b 1
)

pip install -r requirements.txt -q 2>nul

python -c "from agente import diagnostico_ollama; d=diagnostico_ollama(); print(d.get('mensagem','')); import sys; sys.exit(0 if d.get('estado')=='ok' else 1)" 2>nul
if errorlevel 1 (
  echo.
  echo [!] Ollama: abra o app e rode ollama pull qwen2.5:7b
  echo.
)

python server.py
pause
