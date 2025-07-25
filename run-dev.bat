@echo off
echo Starting Next.js Frontend...
cd /d "%~dp0frontend"

echo.
echo Starting Next.js development server...
echo.
call npm run dev

pause