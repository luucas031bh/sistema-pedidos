@echo off
cd /d "%~dp0"
echo Gerando AdonayPainel.exe (pode demorar alguns minutos)...
python -m pip install pyinstaller -q
python -m PyInstaller --onefile --windowed --name AdonayPainel --clean painel_controle.py
if exist "dist\AdonayPainel.exe" (
  echo OK: dist\AdonayPainel.exe
  copy /Y "dist\AdonayPainel.exe" "AdonayPainel.exe" >nul
  echo Copiado para AdonayPainel.exe na pasta do projeto.
) else (
  echo Falha na compilacao.
)
pause
