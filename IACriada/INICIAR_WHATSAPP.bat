@echo off
chcp 65001 >nul
title Adonay - Bot WhatsApp
cd /d "%~dp0"

echo ========================================
echo   Assistente Adonay - Bot WhatsApp
echo ========================================
echo.
echo 1) Certifique-se que INICIAR.bat (Python) esta rodando na porta 8765
echo 2) Na primeira vez: copie whatsapp-bot\.env.example para whatsapp-bot\.env
echo 3) Edite ALLOWED_ADMIN_NUMBERS no .env
echo 4) Na 1a conexao: sera gerado whatsapp-qr.png na pasta do projeto
echo    Abra a imagem e escaneie no celular (Aparelhos conectados)
echo    Sem API Meta — conexao tipo WhatsApp Web via Baileys
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org/
  pause
  exit /b 1
)

cd whatsapp-bot
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha no npm install
    pause
    exit /b 1
  )
)

if not exist .env (
  if exist .env.example copy .env.example .env >nul
  echo Arquivo .env criado. Ajuste ALLOWED_ADMIN_NUMBERS.
)

echo.
echo Iniciando bot...
echo Aguarde o arquivo: %~dp0whatsapp-qr.png
echo (abre sozinho se QR_AUTO_OPEN=true no .env)
echo.
node bot.js
pause
