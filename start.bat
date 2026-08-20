@echo off
chcp 65001 > nul
title Reading Log Platform Server
cd /d "%~dp0"
python run_server.py
if errorlevel 1 (
    echo.
    echo [Error] Failed to start server. Please check if Python is installed.
    pause
)
