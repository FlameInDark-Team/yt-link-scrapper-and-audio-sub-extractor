@echo off
title YT Link Harvester — Download Studio Pro
color 0A

echo.
echo  ========================================================
echo   YT Link Harvester — Download ^& Transcription Studio
echo  ========================================================
echo.

:: ─── Check Python ────────────────────────────────────────────
where python >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Python 3 is not installed or not on PATH.
    echo          Download it from: https://www.python.org/downloads/
    echo          Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

:: Add user Python Scripts folder to PATH if present
for /f "delims=" %%D in ('python -c "import site; print(site.getusersitepackages().replace('site-packages','Scripts'))" 2^>nul') do (
    if exist "%%D" set "PATH=%%D;%PATH%"
)

:: ─── Check yt-dlp ────────────────────────────────────────────
where yt-dlp >nul 2>nul
if errorlevel 1 (
    python -m yt_dlp --version >nul 2>nul
    if errorlevel 1 (
        echo  [INFO] yt-dlp is not installed. Installing via pip...
        python -m pip install -r "%~dp0requirements.txt"
    )
)

:: ─── Launch Server ───────────────────────────────────────────
echo  Starting Astra Harvester Studio...
echo  The UI will open in your browser automatically.
echo.
echo  Press Ctrl+C in this window to stop the server.
echo  ========================================================
echo.

python "%~dp0server.py" %*

pause
