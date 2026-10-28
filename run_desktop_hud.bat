@echo off
title Yapper Desktop Voice HUD
echo ==================================================================
echo  🎙️ Starting Yapper Desktop Voice HUD (Wispr Flow Style)
echo ==================================================================
echo  - A floating widget will appear on top of your screen.
echo  - Click into ANY application (VS Code, Word, Slack, Notion, Chrome).
echo  - Press Alt+Space anywhere to speak, then Alt+Space to type!
echo ==================================================================
python clients/desktop_hud.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Error starting HUD. Make sure Python dependencies are installed:
    echo pip install sounddevice pynput requests numpy
    pause
)
