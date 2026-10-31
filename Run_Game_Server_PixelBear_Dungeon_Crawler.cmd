@echo off
title PixelBear Dungeon Crawler - NETWORK SERVER
color 4F
cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    WARNING: THIS STARTS A NETWORK-ACCESSIBLE SERVER
echo  ============================================================
echo.
echo    Game:     PixelBear Dungeon Crawler (multiplayer edition)
echo    Port:     8080  (moves to 8081, 8082... if 8080 is busy)
echo    Reach:    ANY device on your network (Wi-Fi / LAN) will be
echo              able to open the game and join as a player.
echo.
echo    Windows Firewall may ask you to allow Node.js. Only allow
echo    it on PRIVATE networks that you trust, never on public Wi-Fi.
echo.
echo    Close this window at any time to stop the server.
echo.
echo    If you only want to play alone, do NOT run this file.
echo    Use the single-file edition instead:
echo      Ascii_Dungeon_Crawler\Run_Game_Ascii_Dungeon_Crawler.cmd
echo.
echo  ============================================================
echo.
set /p CONFIRM=  Type YES to start the server, anything else cancels: 
if /i not "%CONFIRM%"=="YES" (
    echo.
    echo  Cancelled. No server was started.
    timeout /t 3 >nul
    exit /b
)
color 07
cls
echo Starting PixelBear Dungeon Crawler server...
echo (keep this window open while you play; close it to stop the server)
echo.
if not exist node_modules (
    echo First run: installing dependencies...
    call npm install --silent
)
start "" http://localhost:8080/crawler.html
node stamp-version.cjs
node server.js
pause
