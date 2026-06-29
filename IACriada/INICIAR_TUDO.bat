@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

title Adonay - Iniciar tudo
set "ROOT=%~dp0"
set "PORTA=8765"
set "URL=http://127.0.0.1:%PORTA%"
set "COM_WHATSAPP=1"

if /i "%~1"=="web" set "COM_WHATSAPP=0"
if /i "%~1"=="sem-whatsapp" set "COM_WHATSAPP=0"

echo.
echo ========================================
echo   Assistente Adonay - Iniciar tudo
echo ========================================
echo   Ordem: Ollama ^> Servidor web ^> WhatsApp
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Python nao encontrado.
  pause
  exit /b 1
)

where ollama >nul 2>&1
if errorlevel 1 (
  echo [AVISO] Ollama nao esta no PATH. Continuando...
)

if "%COM_WHATSAPP%"=="1" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo [AVISO] Node.js nao encontrado. WhatsApp sera ignorado.
    set "COM_WHATSAPP=0"
  )
)

echo [1/4] Ollama...
call :ollama_pronto
if errorlevel 1 (
  echo [ERRO] Ollama nao respondeu. Abra o app Ollama e tente de novo.
  pause
  exit /b 1
)
echo       Ollama OK.

echo [2/4] Servidor web (porta %PORTA%)...
call :ping_servidor
if not errorlevel 1 (
  echo       Servidor ja estava online.
  goto :servidor_ok
)

netstat -ano | findstr ":%PORTA% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo       Porta %PORTA% ocupada sem resposta. Encerrando processos antigos...
  call :liberar_porta %PORTA%
  timeout /t 2 /nobreak >nul
)

set "ADONAY_NO_BROWSER=1"
start "Adonay - Servidor" /D "%ROOT%" cmd /k ""%ROOT%INICIAR_SERVIDOR.bat""
call :aguardar_servidor 60
if errorlevel 1 (
  echo [ERRO] Servidor nao subiu na porta %PORTA%.
  echo        Veja a janela "Adonay - Servidor" para a mensagem de erro.
  pause
  exit /b 1
)

:servidor_ok
echo       Servidor OK: %URL%

echo [3/4] Abrindo navegador...
start "" "%URL%"
timeout /t 1 /nobreak >nul

if "%COM_WHATSAPP%"=="1" (
  echo [4/4] Bot WhatsApp...
  if not exist "%ROOT%whatsapp-bot\node_modules" (
    echo       npm install...
    pushd "%ROOT%whatsapp-bot"
    call npm.cmd install
    popd
  )
  if not exist "%ROOT%whatsapp-bot\.env" (
    if exist "%ROOT%whatsapp-bot\.env.example" (
      copy /y "%ROOT%whatsapp-bot\.env.example" "%ROOT%whatsapp-bot\.env" >nul
    )
  )
  start "" /D "%ROOT%" python -c "import servicos_launcher as s; s.iniciar_whatsapp()"
  echo       WhatsApp iniciado.
) else (
  echo [4/4] WhatsApp ignorado. Use: INICIAR_TUDO.bat whatsapp
)

echo.
echo ========================================
echo   Tudo online
echo   Chat: %URL%
echo ========================================
echo.
pause
exit /b 0

:ping_servidor
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORTA%/api/ping' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %ERRORLEVEL%

:aguardar_servidor
set "MAX=%~1"
if "%MAX%"=="" set "MAX=60"
set /a N=0
:wait_loop
set /a N+=1
if !N! gtr %MAX% exit /b 1
call :ping_servidor
if not errorlevel 1 exit /b 0
timeout /t 1 /nobreak >nul
goto :wait_loop

:liberar_porta
set "P=%~1"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%P% " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)
exit /b 0

:ollama_pronto
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
echo       Iniciando Ollama...
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
  start "" /min "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
) else (
  start "Ollama" /min cmd /c "ollama serve"
)
set /a TENT=0
:ollama_loop
set /a TENT+=1
if !TENT! gtr 30 exit /b 1
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 3).StatusCode } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
goto :ollama_loop
