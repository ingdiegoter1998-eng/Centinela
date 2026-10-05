@echo off
rem Control del bar. Doble clic para abrirlo. La primera vez prepara todo solo (necesita Python 3.10 o mayor).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Primera vez: preparando el programa, tarda un minuto...
  py -3 -m venv .venv 2>nul
  if not exist ".venv\Scripts\python.exe" python -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo No encuentro Python. Instalalo desde https://www.python.org/downloads/ y marca "Add python.exe to PATH".
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
  if errorlevel 1 (
    echo Fallo la instalacion. Revisa que haya internet y vuelve a abrir esto.
    rmdir /s /q .venv
    pause
    exit /b 1
  )
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8000"
".venv\Scripts\python.exe" manage.py servir
pause
