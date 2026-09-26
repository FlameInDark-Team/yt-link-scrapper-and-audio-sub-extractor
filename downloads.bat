@echo off
setlocal enabledelayedexpansion

:: Check if links.txt exists
if not exist "links.txt" (
    echo Error: links.txt file not found! Please create it in the same folder as this script.
    pause
    exit /b
)

:: Loop through each line in links.txt
for /f "usebackq tokens=* delims=" %%A in ("links.txt") do (
    set "url=%%A"
    
    if defined url (
        echo !url! | findstr /b /c:"#" >nul
        if errorlevel 1 (
            echo.
            echo ========================================================
            echo Processing: !url!
            echo ========================================================
            
            set "title="
            
            :: Safely extract the title
            for /f "usebackq delims=" %%T in (`yt-dlp --print "%%(title)s" --no-warnings "!url!" 2^>nul`) do (
                if not defined title set "title=%%T"
            )
            
            if defined title (
                echo Creating folder...
                
                :: Call a subroutine to safely handle folder creation and yt-dlp execution
                call :ProcessDownload "!url!"
                
            ) else (
                echo Failed to retrieve title for: !url!
            )
        )
    )
)

echo.
echo ========================================================
echo All tasks completed!
echo ========================================================
pause
goto :eof


:ProcessDownload
:: %1 is the URL parameter safely quoted
:: STEP 1: Download Audio First into folder named after video title
echo [1/2] Downloading audio...
yt-dlp -x -f bestaudio --no-warnings -o "%%(title)s/%%(title)s.%%(ext)s" %1

:: STEP 2: Download Subtitles Second (Bengali preferred, then any available)
echo [2/2] Fetching subtitles (Bengali preferred)...
yt-dlp --skip-download --write-subs --write-auto-subs --sub-lang "bn,bn-BD,bn-IN,.*" --no-warnings -o "%%(title)s/%%(title)s.%%(ext)s" %1 2>nul

exit /b