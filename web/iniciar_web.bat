@echo off
rem Registro de campo de Centinela (Django). Doble clic para abrirlo en el navegador.
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  echo No encuentro .venv. Ver docs\modelo-datos.md
  pause
  exit /b 1
)
".venv\Scripts\python.exe" web\manage.py migrate -v 0
echo Abriendo http://127.0.0.1:8000  (Ctrl+C para cerrar)
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
".venv\Scripts\python.exe" web\manage.py runserver 127.0.0.1:8000
pause
