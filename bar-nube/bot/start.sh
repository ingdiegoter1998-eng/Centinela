#!/usr/bin/env sh
# Arranca el bot y lo reinicia solo si se cae. Se detiene si el bot sale con código 2
# (falta configuración o WhatsApp cerró la vinculación: hay que intervenir).
cd "$(dirname "$0")" || exit 1
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock    # en Termux: que Android no duerma el proceso
while true; do
  node --env-file=.env src/index.js
  codigo=$?
  [ "$codigo" = 2 ] && { echo "El bot pide intervención (código 2). Revisa el mensaje de arriba."; exit 2; }
  echo "El bot se cerró (código $codigo). Reinicio en 10 s…"
  sleep 10
done
