@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Verker CRM - En ejecucion (no cerrar)

echo ============================================
echo    VERKER CRM
echo ============================================
echo.
echo El CRM se esta iniciando...
echo El navegador se abrira solo en unos segundos.
echo.
echo  * Para APAGAR el CRM: cierra esta ventana.
echo  * Si el navegador no abre: entra a
echo    http://localhost:3000
echo.

REM Abre el navegador tras una breve espera, en paralelo al servidor.
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

REM Arranca el servidor (queda corriendo en esta ventana).
call npm start

REM Si npm start termina o falla, se avisa antes de cerrar.
echo.
echo El servidor se ha detenido.
pause
