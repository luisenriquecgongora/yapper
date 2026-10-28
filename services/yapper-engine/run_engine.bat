@echo off
chcp 65001 >nul
title Yapper Engine Service
echo ==================================================================
echo  ⚡ Starting Yapper Speech-to-Text Engine (Port 8000)
echo ==================================================================
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe -m src.main
) else (
    python -m src.main
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Yapper Engine exited with code %ERRORLEVEL%.
    pause
)
