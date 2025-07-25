@echo off
echo Starting frontend initialization...
cd /d "%~dp0frontend"

echo .
echo Initializing frontend dependencies...
call npm install