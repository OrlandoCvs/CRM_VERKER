@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Verker CRM - Instalacion

echo ============================================
echo    VERKER CRM - Instalacion
echo ============================================
echo.
echo Este proceso solo se hace UNA VEZ.
echo Puede tardar varios minutos. No cierres la ventana.
echo.

echo [1 de 4] Instalando dependencias...
call npm install
if errorlevel 1 goto error

echo.
echo [2 de 4] Generando cliente de base de datos...
call npx prisma generate
if errorlevel 1 goto error

echo.
echo [3 de 4] Preparando la base de datos...
call npx prisma migrate deploy
if errorlevel 1 goto error

echo.
echo [4 de 4] Compilando la aplicacion...
call npm run build
if errorlevel 1 goto error

echo.
echo ============================================
echo    Instalacion COMPLETADA con exito.
echo    Ahora abre "iniciar.bat" para usar el CRM.
echo ============================================
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo    OCURRIO UN ERROR durante la instalacion.
echo    Revisa el mensaje de arriba en rojo.
echo    Comprueba que Node.js este instalado y que
echo    existan los archivos .env y .env.local
echo ============================================
echo.
pause
exit /b 1
