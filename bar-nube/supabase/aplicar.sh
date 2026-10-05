#!/usr/bin/env bash
# Aplica schema.sql (y opcionalmente los datos de ejemplo) a tu proyecto de Supabase, sin pegar nada a mano.
#   SUPABASE_ACCESS_TOKEN=... ./aplicar.sh [--demo]
# El token se crea en Supabase → Account → Access Tokens. Dura hasta que lo borres: bórralo al terminar.
# Es seguro repetirlo: el esquema no borra ni duplica datos.
set -euo pipefail
cd "$(dirname "$0")"
REF=${SUPABASE_PROJECT_REF:-xesmbhfgiosrhctjamru}
: "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens)}"

ejecutar() {   # $1 = archivo .sql
  local cuerpo respuesta
  cuerpo=$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1")
  respuesta=$(curl -sS -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' -d "$cuerpo")
  if [ "${respuesta##*$'\n'}" != 201 ] && [ "${respuesta##*$'\n'}" != 200 ]; then
    echo "Falló $1:"; echo "${respuesta%$'\n'*}"; exit 1
  fi
  echo "OK  $1"
}

ejecutar schema.sql
[ "${1:-}" = "--demo" ] && ejecutar datos_demo.sql
echo "Listo. Llave pública (anon) de tu proyecto:"
curl -sS "https://api.supabase.com/v1/projects/$REF/api-keys" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c 'import json,sys; [print("  ", k["name"], k["api_key"]) for k in json.load(sys.stdin) if k["name"]=="anon"]'
