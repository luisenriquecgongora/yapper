@echo off
chcp 65001 >nul
title Yapper Voice HUD
echo ==================================================================
echo  🎙️ Starting Yapper Desktop Floating Voice HUD
echo ==================================================================
cd /d "%~dp0\.."

set "PY_EXE=python"
if exist "services\yapper-engine\.venv\Scripts\python.exe" (
    set "PY_EXE=services\yapper-engine\.venv\Scripts\python.exe"
)

"%PY_EXE%" clients\desktop_hud.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Yapper Desktop HUD exited with code %ERRORLEVEL%.
    pause
)
