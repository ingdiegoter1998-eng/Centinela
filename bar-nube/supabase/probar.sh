#!/usr/bin/env bash
# Prueba el esquema contra un Postgres desechable (no toca Supabase ni ninguna base real).
#   ./probar.sh              levanta Postgres temporal, aplica schema.sql, corre pruebas.sql y lo borra
# Necesita los binarios de PostgreSQL (initdb, pg_ctl, psql). Como root usa el usuario `postgres`.
set -euo pipefail
cd "$(dirname "$0")"
AQUI=$(pwd)
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
[ -n "$BIN" ] || BIN=$(dirname "$(command -v initdb)")
DIR=$(mktemp -d /tmp/pgbar.XXXXXX); PUERTO=${PUERTO:-54329}
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; chmod a+rx "$AQUI/../.." "$AQUI/.." "$AQUI" 2>/dev/null || true; COMO="su postgres -c"; else COMO="bash -c"; fi
trap '$COMO "$BIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
$COMO "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
$COMO "$BIN/pg_ctl -D $DIR/data -o '-p $PUERTO -k $DIR -c listen_addresses=' -l $DIR/log -w start" >/dev/null
PSQL="psql -h $DIR -p $PUERTO -U postgres -v ON_ERROR_STOP=1 -q"
# Lo que Supabase ya trae y el esquema da por hecho:
$PSQL -d postgres -c "create role anon nologin; create role authenticated nologin; create publication supabase_realtime;" >/dev/null
$PSQL -d postgres -c "create database bar" >/dev/null
export PGHOST=$DIR PGPORT=$PUERTO PGUSER=postgres PGDATABASE=bar
# Lo que Supabase Auth trae: tabla de usuarios y auth.uid() (lee el «sub» del token de la sesión).
$PSQL -c "create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  grant usage on schema auth to anon, authenticated;" >/dev/null
$PSQL -f schema.sql
$PSQL -f schema.sql                  # idempotente: una segunda vez no debe fallar
$PSQL -f datos_demo.sql
$PSQL -f datos_demo.sql              # ni duplicar datos
$PSQL -f pruebas.sql
$PSQL -f catalogo.sql                # catálogo real encima del demo; repetirlo no duplica
$PSQL -f catalogo.sql
$PSQL -f pruebas_roles.sql
echo "== concurrencia: 8 sesiones × 25 toques sobre el mismo producto"
PROD=$($PSQL -At -c "select id from productos where nombre='Poker'")
MESA=$($PSQL -At -c "select id from mesas where nombre='Mesa 3'")
STOCK0=$($PSQL -At -c "select stock from productos where id=$PROD")
for i in 1 2 3 4 5 6 7 8; do
  ( for j in $(seq 25); do echo "select agregar($MESA,$PROD);"; done | psql -q -At >/dev/null ) &
done; wait
$PSQL -At -c "select 'cantidad en la cuenta: ' || l.cantidad || ' (esperado 200)' from lineas l join facturas f on f.id=l.factura_id where f.mesa_id=$MESA and f.estado='abierta' and l.producto_id=$PROD"
$PSQL -At -c "select 'stock: $STOCK0 -> ' || stock || ' (esperado ' || ($STOCK0 - 200) || ')' from productos where id=$PROD"
OK=$($PSQL -At -c "select (select cantidad from lineas l join facturas f on f.id=l.factura_id where f.mesa_id=$MESA and f.estado='abierta' and l.producto_id=$PROD) = 200 and (select stock from productos where id=$PROD) = $STOCK0 - 200")
[ "$OK" = t ] || { echo "FALLO de concurrencia"; exit 1; }
echo "== concurrencia: 6 cobros a la vez en mesas distintas → números consecutivos sin repetir"
for m in $($PSQL -At -c "select id from mesas where nombre in ('Mesa 4','Mesa 5','Mesa 6','Mesa 7','Mesa 8','Mesa 1') order by id"); do
  $PSQL -c "select agregar($m, $PROD)" >/dev/null
done
for m in $($PSQL -At -c "select id from mesas where nombre in ('Mesa 4','Mesa 5','Mesa 6','Mesa 7','Mesa 8','Mesa 1') order by id"); do
  ( psql -q -At -c "select cobrar($m,'efectivo')" >/dev/null ) &
done; wait
$PSQL -At -c "select 'numeros: ' || string_agg(numero::text, ',' order by numero) from facturas where estado='pagada'"
OK=$($PSQL -At -c "select count(*) = count(distinct numero) and max(numero) = count(*) from facturas where estado='pagada'")
[ "$OK" = t ] || { echo "FALLO de numeración"; exit 1; }
echo "TODO BIEN"
