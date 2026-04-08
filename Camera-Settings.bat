@echo off
title Camera Settings
cd /d "%~dp0"
python -m pip install pypylon numpy Pillow --quiet 2>nul
python python\camera_settings_app.py
if %errorlevel% neq 0 (
    echo.
    echo Failed to start. Make sure Python is installed.
    pause
)
