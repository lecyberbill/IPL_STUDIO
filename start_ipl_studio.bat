@echo off
title IPL Studio IDE v1.0 - Launching...
cls

echo ===================================================
echo     IPL Studio v1.0 - IDE Atelier d'Intention
echo ===================================================
echo.
echo Lancement du serveur de developpement IPL Studio...
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo [INFO] Premier lancement detecte. Installation des dependances...
    call npm install
    echo.
)

echo [OK] Ouverture de l'IDE IPL Studio dans votre navigateur...
echo.

call npm run dev -- --open

pause
