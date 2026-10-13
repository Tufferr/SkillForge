@echo off
title SkillForge — Skill Tree & Mastery Tracker
echo Starting SkillForge Server...
start http://127.0.0.1:5173
if exist "C:\Users\johnc\AppData\Local\Python\bin\python.exe" (
    "C:\Users\johnc\AppData\Local\Python\bin\python.exe" backend/server.py
) else (
    python backend/server.py
)
pause
