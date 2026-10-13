@echo off
echo ========================================================
echo Building SkillForge Desktop Application (.exe)
echo ========================================================

python -m PyInstaller --noconsole --onefile --name "SkillForge" --icon "app_icon.ico" --add-data "frontend;frontend" --add-data "backend;backend" desktop_app.py

echo.
echo ========================================================
echo Build complete! Your standalone executable is in:
echo   dist\SkillForge.exe
echo ========================================================
pause
