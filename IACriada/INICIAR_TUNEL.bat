@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ADNY - Tunel HTTPS (Cloudflare)

echo.
echo ========================================
echo   Tunel HTTPS para ADNY (porta 8765)
echo ========================================
echo.
echo Requisito: cloudflared instalado
echo   winget install Cloudflare.cloudflared
echo   ou https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
echo.
echo Mantenha esta janela ABERTA enquanto usar o ADNY remoto.
echo Copie a URL https://... que aparecer abaixo e rode:
echo   python configurar_acesso_remoto.py
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERRO] cloudflared nao encontrado no PATH.
  pause
  exit /b 1
)

cloudflared tunnel --url http://127.0.0.1:8765
pause
