@echo off
setlocal enabledelayedexpansion

:: ================================================================
::  YT Link Harvester — Terminal Batch Downloader
::  Downloads audio + subtitles for each URL in links.txt
:: ================================================================

:: ─── Configuration ───────────────────────────────────────────
set "SUB_LANG=bn,bn-BD,bn-IN,en,.*"
set "OUT_DIR=downloads"

:: ─── Preflight checks ───────────────────────────────────────
for /f "delims=" %%D in ('python -c "import site; print(site.getusersitepackages().replace('site-packages','Scripts'))" 2^>nul') do (
    if exist "%%D" set "PATH=%%D;%PATH%"
)

where yt-dlp >nul 2>nul
if errorlevel 1 (
    echo [ERROR] yt-dlp is not installed or not on PATH.
    echo         Run: pip install yt-dlp
    pause
    exit /b 1
)

if not exist "links.txt" (
    echo [ERROR] links.txt not found!
    echo         Create links.txt in this folder with YouTube URLs.
    pause
    exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

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
for /f "usebackq delims=" %%T in (`yt-dlp --print "%%(title)s" --no-warnings "!url!" 2^>nul`) do (
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
yt-dlp -x -f bestaudio --no-warnings -o "%template%" "%~1"

echo [2/2] Fetching subtitles (%SUB_LANG%)...
yt-dlp --skip-download --write-subs --write-auto-subs --sub-lang "%SUB_LANG%" --no-warnings -o "%template%" "%~1" 2>nul

:: Trigger transcript cleanup if python is available
python -c "from server import generate_transcripts_in_dir; import os; generate_transcripts_in_dir(os.path.join(r'%OUT_DIR%', r'!title!'))" 2>nul

goto :eof