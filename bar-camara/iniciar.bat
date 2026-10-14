@echo off
rem Vigia de la camara del bar. Doble clic para arrancarlo y dejar la ventana abierta mientras el bar esta abierto.
rem La primera vez prepara todo solo (necesita Python 3.10 o mayor) y pide dibujar las zonas.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Primera vez: preparando el programa, tarda unos minutos...
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
if not exist ".env" (
  copy .env.ejemplo .env >nul
  echo Llena los datos de la camara y la clave en el archivo .env que se abre, guardalo y vuelve a abrir esto.
  notepad .env
  exit /b 0
)
if not exist "zonas.yaml" ".venv\Scripts\python.exe" calibrar.py
".venv\Scripts\python.exe" vigia.py %*
pause
