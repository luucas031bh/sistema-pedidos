@echo off
setlocal
title ngrok -> localhost:3000 (ajuste se PORT no .env for outro)
where ngrok >nul 2>&1
if errorlevel 1 (
  echo [ERRO] ngrok nao encontrado. Reinicie o terminal apos instalar: winget install Ngrok.Ngrok
  echo Depois registre: ngrok config add-authtoken SEU_TOKEN
  pause
  exit /b 1
)
echo Ligando tunel. Deixe o bot rodando em outra janela (start.bat). URL use na Meta + /webhook/whatsapp
ngrok http 3000
