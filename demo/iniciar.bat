@echo off
rem Demo en vivo de Centinela. Doble clic para abrir en el navegador.
rem Requiere haber hecho una vez:  pip install -e ".[dev,demo]"
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  echo No encuentro .venv. Crea el entorno primero:
  echo   python -m venv .venv
  echo   .venv\Scripts\python -m pip install -e ".[dev,demo]"
  pause
  exit /b 1
)
echo Abriendo http://localhost:8501 en unos segundos. Ctrl+C para cerrar.
start "" cmd /c "timeout /t 5 >/dev/null & start http://localhost:8501"
".venv\Scripts\python.exe" -m streamlit run demo\app.py --server.headless true --server.port 8501 --browser.gatherUsageStats false --theme.base dark
pause
