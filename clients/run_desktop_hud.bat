@echo off
title Yapper Voice HUD
echo ==================================================================
echo  🎙️ Starting Yapper Desktop Floating HUD (Wispr Flow style)
echo ==================================================================
cd /d "%~dp0\.."
python clients\desktop_hud.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Yapper Desktop HUD exited with code %ERRORLEVEL%.
    pause
)
