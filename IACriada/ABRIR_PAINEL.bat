@echo off
cd /d "%~dp0"
if exist "AdonayPainel.exe" (
  start "" "AdonayPainel.exe"
  exit /b 0
)
if exist "dist\AdonayPainel.exe" (
  start "" "dist\AdonayPainel.exe"
  exit /b 0
)
where pythonw >nul 2>&1 && (start "" pythonw painel_controle.py & exit /b 0)
where python >nul 2>&1 && (start "" python painel_controle.py & exit /b 0)
echo Instale Python ou rode GERAR_EXECUTAVEL.bat
pause
