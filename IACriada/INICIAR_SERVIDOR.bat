@echo off
cd /d "%~dp0"
title Adonay Servidor
set ADONAY_NO_BROWSER=1
python "%~dp0server.py"
if errorlevel 1 pause
