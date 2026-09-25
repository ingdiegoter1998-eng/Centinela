@echo off
rem Publica el registro de campo en internet desde este PC (Tailscale Funnel).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1"
pause
