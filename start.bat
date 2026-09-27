@echo off
title YT Link Harvester — Download Studio Pro (Portable)
color 0A

echo.
echo  ========================================================
echo   YT Link Harvester — Download ^& Transcription Studio
echo                 [PORTABLE EDITION]
echo  ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%bin"
set "PORTABLE_PY=%SCRIPT_DIR%python\python.exe"

:: ─── Configure Portable PATH ─────────────────────────────────
if exist "%BIN_DIR%" (
    set "PATH=%BIN_DIR%;%PATH%"
)
if exist "%SCRIPT_DIR%python" (
    set "PATH=%SCRIPT_DIR%python;%SCRIPT_DIR%python\Scripts;%PATH%"
)

:: ─── Check Python ────────────────────────────────────────────
if exist "%PORTABLE_PY%" (
    set "PYTHON_EXE=%PORTABLE_PY%"
    echo  [OK] Portable Python detected: python\python.exe
) else (
    where python >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_EXE=python"
        echo  [OK] System Python detected on PATH.
    ) else (
        echo  [ERROR] Python is not installed and no portable python\ was found.
        echo          Download it from: https://www.python.org/downloads/
        echo          Make sure to check "Add Python to PATH" during install.
        echo.
        pause
        exit /b 1
    )
)

:: Add user Python Scripts folder to PATH if present
for /f "delims=" %%D in ('"%PYTHON_EXE%" -c "import site; print(site.getusersitepackages().replace('site-packages','Scripts'))" 2^>nul') do (
    if exist "%%D" set "PATH=%%D;%PATH%"
)

:: ─── Check yt-dlp ────────────────────────────────────────────
if exist "%BIN_DIR%\yt-dlp.exe" (
    echo  [OK] Portable yt-dlp detected in bin\
) else if exist "%SCRIPT_DIR%python\Scripts\yt-dlp.exe" (
    echo  [OK] Portable yt-dlp detected in python\Scripts\
) else (
    where yt-dlp >nul 2>nul
    if errorlevel 1 (
        "%PYTHON_EXE%" -m yt_dlp --version >nul 2>nul
        if errorlevel 1 (
            echo  [INFO] yt-dlp is not installed. Installing via pip...
            "%PYTHON_EXE%" -m pip install -r "%SCRIPT_DIR%requirements.txt"
        )
    ) else (
        echo  [OK] System yt-dlp detected on PATH.
    )
)

:: ─── Check FFmpeg ────────────────────────────────────────────
if exist "%BIN_DIR%\ffmpeg.exe" (
    echo  [OK] Portable FFmpeg detected in bin\
) else (
    where ffmpeg >nul 2>nul
    if not errorlevel 1 (
        echo  [OK] System FFmpeg detected on PATH.
    ) else (
        echo  [WARN] FFmpeg was not detected. Audio conversion may be limited.
    )
)

:: ─── Launch Server ───────────────────────────────────────────
echo.
echo  Starting Astra Harvester Studio...
echo  The UI will open in your browser automatically.
echo.
echo  Press Ctrl+C in this window to stop the server.
echo  ========================================================
echo.

"%PYTHON_EXE%" "%SCRIPT_DIR%server.py" %*

pause
