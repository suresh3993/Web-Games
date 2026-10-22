@echo off
rem Stops the Docker services. Data is kept in the volumes.
cd /d "%~dp0"

docker compose down
if errorlevel 1 (
  echo Failed to stop the Docker services.
  pause
  exit /b 1
)

echo.
echo Docker services stopped. Your data is kept.
pause
