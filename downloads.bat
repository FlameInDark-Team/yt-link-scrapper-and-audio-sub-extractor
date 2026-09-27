@echo off
setlocal enabledelayedexpansion

:: ================================================================
::  YT Link Harvester — Terminal Batch Downloader (Portable)
::  Downloads audio + subtitles for each URL in links.txt
:: ================================================================

:: ─── Configuration ───────────────────────────────────────────
set "SUB_LANG=bn,bn-BD,bn-IN,en,.*"
set "OUT_DIR=downloads"
set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%bin"

:: ─── Prepend portable directories to PATH ─────────────────────
if exist "%BIN_DIR%" (
    set "PATH=%BIN_DIR%;%PATH%"
)
if exist "%SCRIPT_DIR%python" (
    set "PATH=%SCRIPT_DIR%python;%SCRIPT_DIR%python\Scripts;%PATH%"
)

:: ─── Resolve Python ──────────────────────────────────────────
if exist "%SCRIPT_DIR%python\python.exe" (
    set "PYTHON_CMD=%SCRIPT_DIR%python\python.exe"
) else (
    set "PYTHON_CMD=python"
)

:: Add user Python Scripts folder to PATH if present
for /f "delims=" %%D in ('"%PYTHON_CMD%" -c "import site; print(site.getusersitepackages().replace('site-packages','Scripts'))" 2^>nul') do (
    if exist "%%D" set "PATH=%%D;%PATH%"
)

:: ─── Resolve yt-dlp ──────────────────────────────────────────
set "YTDLP_CMD="
if exist "%BIN_DIR%\yt-dlp.exe" (
    set "YTDLP_CMD=%BIN_DIR%\yt-dlp.exe"
) else if exist "%SCRIPT_DIR%python\Scripts\yt-dlp.exe" (
    set "YTDLP_CMD=%SCRIPT_DIR%python\Scripts\yt-dlp.exe"
) else (
    where yt-dlp >nul 2>nul
    if not errorlevel 1 set "YTDLP_CMD=yt-dlp"
)

if not defined YTDLP_CMD (
    echo [ERROR] yt-dlp is not installed or not found.
    echo         Run start.bat first or install yt-dlp.
    pause
    exit /b 1
)

:: ─── Resolve FFmpeg location ─────────────────────────────────
set "FFMPEG_OPT="
if exist "%BIN_DIR%\ffmpeg.exe" (
    set "FFMPEG_OPT=--ffmpeg-location %BIN_DIR%"
)

if not exist "links.txt" (
    echo [ERROR] links.txt not found!
    echo         Create links.txt in this folder with YouTube URLs.
    pause
    exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo [OK] Using yt-dlp : !YTDLP_CMD!
echo [OK] Using Python : %PYTHON_CMD%
if defined FFMPEG_OPT echo [OK] Using FFmpeg : %BIN_DIR%\ffmpeg.exe
echo.

:: ─── Process each URL ────────────────────────────────────────
set "count=0"
set "errors=0"

for /f "usebackq tokens=* delims=" %%A in ("links.txt") do (
    call :HandleLine "%%A"
)

echo.
echo ========================================================
echo Finished: !count! completed, !errors! failed.
echo Files saved to: %cd%\%OUT_DIR%
echo ========================================================
pause
goto :eof


:: ─── Per-line handler ────────────────────────────────────────
:HandleLine
set "url=%~1"

:: Skip comment lines
echo !url! | findstr /b /c:"#" >nul
if not errorlevel 1 goto :eof

echo.
echo --------------------------------------------------------
echo Processing: !url!
echo --------------------------------------------------------

set "title="
for /f "usebackq delims=" %%T in (`"!YTDLP_CMD!" --print "%%(title)s" --no-warnings "!url!" 2^>nul`) do (
    if not defined title set "title=%%T"
)

if defined title (
    echo Title: !title!
    call :ProcessDownload "!url!"
    set /a "count+=1"
) else (
    echo [WARN] Failed to retrieve video title for: !url!
    set /a "errors+=1"
)

goto :eof


:: ─── Download worker ─────────────────────────────────────────
:ProcessDownload
set "template=%OUT_DIR%/%%(title)s/%%(title)s.%%(ext)s"

echo [1/2] Extracting audio...
"!YTDLP_CMD!" %FFMPEG_OPT% -x -f bestaudio --no-warnings -o "%template%" "%~1"

echo [2/2] Fetching subtitles (%SUB_LANG%)...
"!YTDLP_CMD!" %FFMPEG_OPT% --skip-download --write-subs --write-auto-subs --sub-lang "%SUB_LANG%" --no-warnings -o "%template%" "%~1" 2>nul

:: Trigger transcript cleanup if python is available
"%PYTHON_CMD%" -c "from server import generate_transcripts_in_dir; import os; generate_transcripts_in_dir(os.path.join(r'%OUT_DIR%', r'!title!'))" 2>nul

goto :eof