@echo off
rem Starts the local development services: PostgreSQL, Redis and Mailpit.
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop and try again.
  pause
  exit /b 1
)

docker compose up -d --wait postgres redis mailpit
if errorlevel 1 (
  echo Failed to start the Docker services.
  pause
  exit /b 1
)

echo.
echo Services are up:
echo   PostgreSQL  localhost:5433
echo   Redis       localhost:6380
echo   Mailpit     http://localhost:8025
pause
