@echo off
title YT Link Harvester — Portable Environment Setup / Repair
color 0B

echo.
echo  ========================================================
echo   Portable Environment Setup ^& Verification Utility
echo  ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%bin"
set "PY_DIR=%SCRIPT_DIR%python"
set "PY_ZIP=%TEMP%\python-3.12.9-embed-amd64.zip"
set "GET_PIP=%TEMP%\get-pip.py"

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"
if not exist "%PY_DIR%" mkdir "%PY_DIR%"

:: ─── 1. Portable Python ──────────────────────────────────────
if exist "%PY_DIR%\python.exe" (
    echo  [OK] Portable Python is already present in python\
) else (
    echo  [1/4] Downloading Python 3.12.9 embeddable...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip' -OutFile '%PY_ZIP%'"
    echo  [2/4] Extracting Python to python\...
    powershell -NoProfile -Command "Expand-Archive -Path '%PY_ZIP%' -DestinationPath '%PY_DIR%' -Force"
    if exist "%PY_ZIP%" del "%PY_ZIP%"
    
    :: Configure ._pth
    echo python312.zip> "%PY_DIR%\python312._pth"
    echo .>> "%PY_DIR%\python312._pth"
    echo ..>> "%PY_DIR%\python312._pth"
    echo Lib>> "%PY_DIR%\python312._pth"
    echo Lib\site-packages>> "%PY_DIR%\python312._pth"
    echo import site>> "%PY_DIR%\python312._pth"
    echo  [OK] Portable Python configured.
)

:: ─── 2. Pip & Dependencies ───────────────────────────────────
if not exist "%PY_DIR%\Lib\site-packages\pip" (
    echo  [3/4] Installing pip in portable environment...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%GET_PIP%'"
    "%PY_DIR%\python.exe" "%GET_PIP%" --no-warn-script-location
    if exist "%GET_PIP%" del "%GET_PIP%"
)

echo  Installing/Updating yt-dlp...
"%PY_DIR%\python.exe" -m pip install -r "%SCRIPT_DIR%requirements.txt" --no-warn-script-location

:: ─── 3. Check / Setup Binaries in bin\ ───────────────────────
if exist "%BIN_DIR%\ffmpeg.exe" (
    echo  [OK] FFmpeg binary verified: bin\ffmpeg.exe
) else (
    where ffmpeg >nul 2>nul
    if not errorlevel 1 (
        for /f "delims=" %%F in ('where ffmpeg') do (
            if not exist "%BIN_DIR%\ffmpeg.exe" copy "%%F" "%BIN_DIR%\ffmpeg.exe" >nul
        )
        echo  [OK] Copied system FFmpeg to bin\ffmpeg.exe
    ) else (
        echo  [INFO] Downloading standalone FFmpeg to bin\...
        powershell -NoProfile -Command "$url = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'; $tmp = \"$env:TEMP\ffmpeg.zip\"; Invoke-WebRequest -Uri $url -OutFile $tmp; Expand-Archive -Path $tmp -DestinationPath \"$env:TEMP\ffmpeg_ext\" -Force; Copy-Item \"$env:TEMP\ffmpeg_ext\*\bin\ffmpeg.exe\" -Destination '%BIN_DIR%\ffmpeg.exe'; Copy-Item \"$env:TEMP\ffmpeg_ext\*\bin\ffprobe.exe\" -Destination '%BIN_DIR%\ffprobe.exe'; Remove-Item -Recurse -Force \"$env:TEMP\ffmpeg*\""
    )
)

if exist "%BIN_DIR%\yt-dlp.exe" (
    echo  [OK] yt-dlp binary verified: bin\yt-dlp.exe
) else (
    if exist "%PY_DIR%\Scripts\yt-dlp.exe" (
        copy "%PY_DIR%\Scripts\yt-dlp.exe" "%BIN_DIR%\yt-dlp.exe" >nul
        echo  [OK] Copied yt-dlp to bin\yt-dlp.exe
    )
)

echo.
echo  ========================================================
echo   Portable Environment is Ready!
echo   Run start.bat to launch the Studio.
echo  ========================================================
echo.
pause
