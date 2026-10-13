# SkillForge Launcher
$pythonPath = "C:\Users\johnc\AppData\Local\Python\bin\python.exe"
if (-not (Test-Path $pythonPath)) {
    $pythonPath = "python"
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Launching SkillForge (Skill Tree & Mastery) " -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Server running at: http://127.0.0.1:5173" -ForegroundColor Yellow

Start-Process "http://127.0.0.1:5173"
& $pythonPath backend/server.py
