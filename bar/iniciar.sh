#!/usr/bin/env bash
# Control del bar (Linux / macOS). La primera vez prepara todo solo (necesita Python 3.10 o mayor).
# Opciones extra van a `manage.py servir`, p. ej.: ./iniciar.sh --puerto 8080
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Primera vez: preparando el programa, tarda un minuto..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt || { rm -rf .venv; echo "Falló la instalación: revisa el internet."; exit 1; }
fi
exec .venv/bin/python manage.py servir "$@"
