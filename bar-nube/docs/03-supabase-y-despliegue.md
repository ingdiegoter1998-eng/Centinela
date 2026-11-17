# 03 · Supabase y despliegue: SQL, funciones, claves

Proyecto: `xesmbhfgiosrhctjamru`. Panel: https://supabase.com/dashboard/project/xesmbhfgiosrhctjamru

## A. Pegar SQL en el SQL Editor

Supabase → SQL Editor → New query → pegas el archivo COMPLETO → Run. Todos los archivos son **idempotentes**: repetirlos no borra ni duplica datos. Los archivos viven en `bar-nube/supabase/` (en GitHub: Centinela → bar-nube → supabase → abrir el archivo → botón «Raw» → copiar todo).

### Orden correcto (instalación desde cero, o reconstruir todo)

| # | Archivo | Qué hace | Notas |
|---|---|---|---|
| 1 | `schema.sql` | Tablas, reglas de ventas, stock, cobro, roles (`es_admin`, `es_personal`) | Al final le QUITA permisos a `anon`; si lo vuelves a correr hay que repetir los pasos 3 a 6 |
| 2 | `catalogo.sql` | Productos, precios y costos reales del bar, combos | Es un upsert de precios: ver advertencia abajo |
| 3 | `rockola.sql` | Cola de la rockola, configuración, reglas básicas | |
| 4 | `rockola_puntos.sql` | Puntos, precio por género, lista negra, funciones del bot | Va después de 3 |
| 5 | `admin.sql` | Panel de control: reportes, comisión, trazabilidad (quién cobró/anuló) | Después de 1, 3 y 4 |
| 6 | `rockola_control.sql` | DJ de Spotify: latido, reembolso por falla, rechazo si el bafle no responde, cron `rockola-tick` | Si corriste 4 otra vez, corre este de nuevo (redefine `rockola_estado`). Si avisa que no pudo activar `pg_cron` o `pg_net`: Database → Extensions, actívalos y córrelo otra vez |
| 7 | `generos.sql` | ~158 géneros con su multiplicador | |
| 8 | `artistas_catalogo.sql` | 424 artistas latinos ya clasificados | Requiere 4 y 7 |
| 9 | `artistas_catalogo_2.sql` | Artistas de cantina y tropical | Aún NO existe: se genera (ver 04) |

Ese es el mismo orden que usa `probar.sh` (la prueba en Postgres desechable), salvo `datos_demo.sql`, que **nunca** se corre en producción (son datos de ejemplo).

**Conteos de inventario:** `conteo_AAAA-MM-DD.sql` (ej.: `conteo_2026-10-31.sql`) se corre UNA sola vez, antes de vender esa noche. Si ya se vendió algo después de contar, no lo repitas: pisaría esas ventas.

### Advertencias que ya costaron caro

1. **`catalogo.sql` hace upsert de precios.** Si lo vuelves a correr, revierte cualquier precio que hayas cambiado desde la app. Desde el 17-nov-2026 el archivo coincide con la base (Poker y Águila Light $4.000, Club Colombia $6.000), pero cada vez que cambies un precio o producto en la app, refleja el cambio también en `catalogo.sql` y en `pruebas_roles.sql` (que comprueba esos precios); si no, el próximo re-aplicado lo deshace.
2. **`pg_safeupdate`:** el Postgres de producción de Supabase rechaza todo `UPDATE` o `DELETE` sin `WHERE` («UPDATE requires a WHERE clause»), aunque la tabla tenga una sola fila (se escribe `where id`). El Postgres de las pruebas NO lo tiene, así que no lo detecta; por eso existe `supabase/sin_where.test.mjs`, que revisa los archivos. Una vez esto dejó el latido de la rockola sin registrarse.
3. **Nunca pegues SQL de internet o de una IA sin leerlo.** Y nunca uses `drop table`, `truncate` ni `delete from facturas`.

### Leer sin riesgo (consultas útiles)

```sql
-- ventas por noche de servicio (corte 6 AM Bogotá), últimas 14
select (coalesce(cerrada_en, abierta_en) at time zone 'America/Bogota' - interval '6 hours')::date as noche,
       count(*) as facturas, sum(l.total) as ventas
  from facturas f
  join (select factura_id, sum(cantidad * precio) as total from lineas group by 1) l on l.factura_id = f.id
 where f.estado = 'pagada'
 group by 1 order by 1 desc limit 14;

-- ¿suena la rockola? latido del controlador
select * from rockola_reproductor;

-- ¿está programado el cron?
select jobname, schedule, active from cron.job;

-- cola actual
select id, titulo, artista, estado, celular, costo_puntos from rockola_cola where estado in ('sonando','pendiente') order by estado, id;

-- saldo de puntos de un celular
select coalesce(sum(delta),0) from rockola_puntos where celular = '573001234567';
```
(Si una consulta falla por nombre de columna, mira `08-referencia-tecnica.md` o el `create table` en el archivo SQL.)

## B. Aplicar SQL desde la terminal (alternativa al editor)

Necesita un token personal de Supabase (Account → Access Tokens → Generate). Se usa y se borra.

```sh
cd bar-nube/supabase
SUPABASE_ACCESS_TOKEN=sbp_xxx ./aplicar.sh rockola_control.sql        # corre schema.sql primero y luego los archivos que pases
SUPABASE_ACCESS_TOKEN=sbp_xxx ./aplicar.sh --catalogo conteo_2026-10-31.sql
```
OJO: `aplicar.sh` SIEMPRE corre `schema.sql` primero (que quita permisos a `anon`); para un solo archivo, el SQL Editor es más directo y más seguro.

## C. Desplegar Edge Functions

Las funciones están en `bar-nube/supabase/functions/<nombre>/`. Merge a `main` NO las despliega. Con el CLI de Supabase (necesita Node):

```sh
npx supabase login                                     # abre el navegador, una vez
cd bar-nube                                            # carpeta que contiene supabase/
npx supabase functions deploy rockola-buscar     --no-verify-jwt --project-ref xesmbhfgiosrhctjamru
npx supabase functions deploy rockola-control    --no-verify-jwt --project-ref xesmbhfgiosrhctjamru
npx supabase functions deploy rockola-artista-id --no-verify-jwt --project-ref xesmbhfgiosrhctjamru
```
`--no-verify-jwt` es a propósito: las funciones se llaman con la llave pública (búsqueda) o con un secreto propio (cron) y validan por dentro. Versiones al 17-nov: `rockola-buscar` v14, `rockola-control` v2, `rockola-artista-id` v2 (Supabase → Edge Functions las muestra).

Sin CLI: Supabase → Edge Functions → la función → editor de código → pegar el `index.ts`. Ojo: `rockola-control` y `rockola-buscar` importan archivos hermanos (`spotify.mjs`, `tick.mjs`, `clasificar.mjs`), que en el editor web hay que crear como archivos aparte con el mismo nombre. Con el CLI es automático; úsalo.

### Secretos de las funciones (Spotify)

```sh
npx supabase secrets set SPOTIFY_CLIENT_ID=xxxx SPOTIFY_CLIENT_SECRET=yyyy --project-ref xesmbhfgiosrhctjamru
```
O en el panel: Edge Functions → Secrets. Ya están puestos. `rockola-control` solo necesita el Client ID (el login es PKCE); el secreto lo usan `rockola-buscar` y `rockola-artista-id`. Para ver cuáles existen: `npx supabase secrets list --project-ref xesmbhfgiosrhctjamru` (muestra nombres, no valores). Después de cambiar un secreto no hace falta redesplegar.

### Ver errores de una función

Supabase → Edge Functions → la función → Logs. O Logs → Edge Logs filtrando por la ruta (`rockola-control`, `rockola-buscar`).

## D. Cambiar o rotar claves de usuarios (`crear_usuarios.sh`)

```sh
cd bar-nube/supabase
SUPABASE_ACCESS_TOKEN=sbp_xxx \
ADMIN_CLAVE='una frase larga para diego' \
BARMAN_CLAVE='otra frase larga distinta para el barman' \
./crear_usuarios.sh
```
- Las claves deben tener **12 o más caracteres** (una frase de 3 o 4 palabras sirve) y ser distintas entre sí. El script rechaza las cortas.
- Repetirlo cambia la clave y el nombre, no duplica usuarios. También cierra el registro público y exige mínimo 12 caracteres a futuro. Intenta activar «claves filtradas» (HaveIBeenPwned), que solo existe en planes de pago: si avisa que no pudo, es normal.
- Cuando las claves ya sean largas, borra el parche temporal `SUFIJO_VIEJO` (`'-bar'`) de `bar-nube/app.js` (línea ~43 y ~750) y de `bar-nube/rockola/player.js` (línea ~10 y ~148). Ese parche hace que la pantalla de entrada pruebe una segunda vez con `-bar` pegado a la clave, para las claves viejas. Mientras existan claves viejas cortas, no lo quites.
- Usuarios con otro nombre o un tercer usuario: edita la lista `USUARIOS` dentro del script (usuario, nombre, rol: `admin` o `barman`) y agrega una variable de clave.
- Rotar la llave `service_role` (si se filtró): Supabase → Project Settings → API → regenerar, y actualizar `SUPABASE_SERVICE_KEY` en el `.env` del bot. Las funciones de Supabase usan la nueva sola.

## E. Publicar la web (GitHub Pages)

Merge a `main` y esperar. Verlo: GitHub → pestaña Actions → «Desplegar sitio». Si se pone roja, abre el job y lee el error. Pages debe tener Source = GitHub Actions (Settings → Pages). Se puede relanzar a mano: Actions → Desplegar sitio → Run workflow.

La web copia a `/bar/` solo lo que lista `pages.yml` (`index.html`, `app.css`, `app.js`, `config.js`, `logo.png`, `vendor`, `rockola/`, `admin/`). Un archivo nuevo en otra ruta no se publica hasta agregarlo ahí.

## F. Cosas del plan gratis de Supabase

- Pausa el proyecto tras 7 días sin uso. Si el bar cierra una semana (vacaciones), entra al panel y pulsa Restore/Resume.
- No hay copias automáticas descargables. Haz un respaldo de vez en cuando: Database → Backups, o desde el SQL Editor exporta a CSV las tablas `facturas`, `lineas`, `productos`, `movimientos`, `rockola_puntos`.
- `pg_cron` y `pg_net` deben estar activas (Database → Extensions) para la rockola.
