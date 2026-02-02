@echo off
echo Starting Geo Racer Server...
echo Please open your browser and visit: http://localhost:8000
echo (Keep this window open while playing)
echo.
python -m http.server 8000
pause
