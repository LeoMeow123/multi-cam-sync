@echo off
title Camera Settings
cd /d "%~dp0"
python python\camera_settings_app.py
if %errorlevel% neq 0 (
    echo.
    echo Failed to start. Make sure Python and pypylon are installed.
    echo Install with: pip install pypylon numpy Pillow
    pause
)
