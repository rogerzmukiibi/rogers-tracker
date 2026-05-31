@echo off
title Rogers Tracker
cd /d %~dp0
call .venv\Scripts\activate
echo Starting Rogers Tracker...
echo Open http://localhost:8000 in your browser
echo Close this window to stop the server
echo.
start "" http://localhost:8000
python -m uvicorn app.main:app --port 8000
pause