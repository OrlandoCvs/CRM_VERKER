@echo off
title LeadCRM - Iniciando
color 0A
cls

echo.
echo  ================================================
echo       LeadCRM  ^|  Google Places CRM
echo  ================================================
echo.

cd /d "%~dp0crm-app"

REM Si ya hay un servidor corriendo, solo abre el navegador
curl -s --max-time 1 http://localhost:3000 >nul 2>&1
if not errorlevel 1 (
    echo  El servidor ya esta corriendo.
    echo  Abriendo LeadCRM en el navegador...
    start http://localhost:3000/dashboard
    timeout /t 2 /nobreak >nul
    exit
)

echo  Iniciando servidor... (puede tardar ~15 segundos)
echo.

REM Inicia el servidor en ventana minimizada al fondo
start "LeadCRM Server" /min cmd /k "title LeadCRM Server && npm run dev"

REM Espera hasta que el servidor responda
:wait
<nul set /p ".=."
timeout /t 2 /nobreak >nul
curl -s --max-time 2 http://localhost:3000 >nul 2>&1
if errorlevel 1 goto wait

echo.
echo.
echo  Listo! Abriendo LeadCRM en el navegador...
start http://localhost:3000/dashboard

title LeadCRM - Corriendo
cls
echo.
echo  ================================================
echo       LeadCRM esta corriendo
echo.
echo   Acceso: http://localhost:3000
echo.
echo   IMPORTANTE: Deja abierta la ventana minimizada
echo   llamada "LeadCRM Server" mientras usas el CRM.
echo.
echo   Presiona cualquier tecla para cerrar este aviso.
echo  ================================================
echo.
pause >nul
