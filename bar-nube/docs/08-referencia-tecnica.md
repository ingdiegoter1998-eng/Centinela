# 08 · Referencia técnica (pégasela a una IA como contexto)

Resumen compacto del sistema para dar contexto a una IA que no ve el repo. Actualizado el 17-nov-2026.

## Stack

- Front: HTML + JS puro sin build, `bar-nube/`. Cliente Supabase en `vendor/supabase.js`. Estilos en `app.css`. Se publica con GitHub Pages en `/bar/`.
- Backend: Supabase (Postgres 15+, Auth, Realtime, Edge Functions en Deno/TypeScript, `pg_cron`, `pg_net`). Proyecto `xesmbhfgiosrhctjamru`.
- Bot: Node 22+ (Termux usa 24), ESM, `@whiskeysockets/baileys` 6.7.x, `@supabase/supabase-js`, `pino`, `qrcode-terminal`. Pruebas con `node --test`.
- Seguridad: la llave pública `anon` solo puede llamar funciones explícitamente autorizadas. Los permisos reales se imponen con RLS y con funciones `security definer` que llaman a `es_personal()` / `es_admin()`. El bot usa `service_role`.
- Zona horaria de negocio: `America/Bogota`. Jornada = noche de servicio, corte 6:00 AM.
- Dinero: pesos colombianos enteros (sin decimales).

## Archivos

```
bar-nube/
  index.html app.js app.css config.js logo.png vendor/       app de ventas e inventario
  admin/ (index.html admin.js admin.css)                       panel del administrador
  rockola/ index.html rockola.js rockola.css comun.js          página del cliente (QR)
           tv.html tv.js tv.css frases.json fondos/            TV
           player.html player.js                               panel del bafle (Spotify Connect)
  bot/ src/{index,logica,api,sesion,bloqueo,vigilante,numero,eco,reparar}.js  start.sh .env.example deploy/rockola-bot.service
       test/{logica,sesion}.test.js
  supabase/
    schema.sql catalogo.sql datos_demo.sql conteo_*.sql          ventas, stock, catálogo
    rockola.sql rockola_puntos.sql rockola_control.sql           rockola
    generos.sql artistas_catalogo.sql catalogo_artistas/         géneros y artistas
    admin.sql                                                    panel admin
    pruebas*.sql probar.sh sin_where.test.mjs                    pruebas
    aplicar.sh crear_usuarios.sh                                 operación
    functions/{rockola-buscar,rockola-control,rockola-artista-id}/
  docs/                                                          esta documentación
.github/workflows/{pages.yml,pruebas.yml}
```

## Tablas (resumen)

**Ventas e inventario:** `categorias(id,nombre,orden)`, `productos(id,categoria_id,nombre,precio,costo,controla_stock,stock,stock_minimo,activo, en_promos…)`, `combo_componentes(combo_id,producto_id,cantidad)`, `mesas(id,nombre,orden,activa)`, `clientes(id,nombre,telefono)`, `facturas(id,numero,mesa_id,cliente_id,estado[abierta|pagada|anulada],metodo_pago,abierta_en,cerrada_en,cobrada_por,anulada_por)`, `lineas(id,factura_id,producto_id,cantidad,precio,costo)` (precio y costo congelados), `movimientos(id,producto_id,motivo[compra|ajuste],cantidad,costo_unitario,nota,fecha)`, `perfiles(id uuid→auth.users, nombre, rol[admin|barman])`, `comision_reglas(categoria_id,pct,base[ganancia|venta|unidad],monto,nota)`.

**Rockola:** `rockola_config` (una fila: `activa, max_pendientes, max_cola, cooldown_min, punto_pesos, precio_base_puntos, puntos_bienvenida`), `rockola_cola(id,proveedor,pista_id,titulo,artista,portada,duracion_ms,mesa,cliente,celular,nombre,artista_id,costo_puntos,puntos,estado[pendiente|sonando|sonada|saltada|quitada|fallida],creado_en,empezo_en)`, `rockola_personas(celular,nombre,creado_en)`, `rockola_puntos(id,celular,delta,motivo[bienvenida|consumo|cortesia|pedido|reembolso],factura_id,cola_id,nota,creado_en)` (libro; saldo = suma de `delta`), `rockola_generos(genero,multiplicador,nota)`, `rockola_artistas(proveedor,artista_id,nombre,genero,origen[manual|auto|null],etiquetas[])`, `rockola_prohibidas(proveedor,pista_id,titulo,motivo)`, `rockola_spotify` (refresh token; sin acceso por API), `rockola_reproductor` (latido: `verificado_en,dispositivo,dispositivo_id,reproduciendo,error,pausada,preferido_id,tick_hasta`), `rockola_ctl_ajustes` (url y secreto del cron).

## Funciones SQL por tema

- **Ventas:** `agregar, quitar, cobrar, anular, comprar, contar, asignar_cliente, crear_cliente, resumen, jornada_actual` (+ internas con `_`).
- **Roles:** `es_admin(), es_personal()`.
- **Rockola, personal (authenticated):** `rockola_estado, rockola_activar, rockola_siguiente, rockola_saltar, rockola_quitar, rockola_clasificar, rockola_dar_puntos_factura, rockola_cortesia (solo admin), rockola_prohibir, rockola_perdonar, rockola_genero_guardar, rockola_genero_borrar, rockola_panel_permiso`.
- **Rockola, solo bot (service_role):** `rockola_registrar, rockola_mi_estado, rockola_saldo, rockola_pedir_puntos, rockola_precio`.
- **DJ (`rockola_ctl_*`):** `trabajo, disparar, tomar, soltar, latido, verificar, avanzar, confirmar, encolada, devolver, fallo, estado, pausa, preferido`.
- **Panel admin (solo admin):** `admin_serie, admin_detalle, admin_facturas, admin_comision, admin_rockola`.

Si necesitas el cuerpo exacto de una función, está en el `.sql` de su tema (`grep` por el nombre).

## Edge Functions

| Función | Entrada | Hace |
|---|---|---|
| `rockola-buscar` | GET `?q=texto` (con `apikey` anon); POST para «clasificar pendientes» (personal) | Spotify client credentials → canciones con precio; MusicBrainz → género de artistas nuevos. 429 de Spotify → 503 con `reintentar_en_s` |
| `rockola-control` | POST `{accion}` con el secreto del cron (`tick`) o con sesión de usuario (estado, dispositivos, pausa, volumen, saltar, `reanudar`; `conectar`/`desconectar` solo admin) | El DJ sobre Spotify Connect; lee y escribe `rockola_*` con `service_role` |
| `rockola-artista-id` | POST `{nombres:[…hasta 25]}` | Nombre → id de Spotify (coincidencia exacta, el más popular). Respuesta `{nombre: {id,nombre}|null}` o `{error, reintentar_en_s}` |

Secretos de funciones: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`; Supabase inyecta `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Convenciones del código

- Español en nombres de tablas, funciones y textos. Sin emojis en la rockola.
- SQL siempre idempotente (`create … if not exists`, `create or replace`, `on conflict`). `UPDATE`/`DELETE` siempre con `WHERE`.
- Las reglas de negocio van en la base, no en el JS. Las pantallas solo muestran y llaman funciones.
- Texto externo (títulos de Spotify) se inserta como texto, nunca con `innerHTML`.
- El `window.Rockola` (`comun.js`) comparte el cliente Supabase y utilidades entre las páginas de la rockola.
- `config.js` define `window.BAR_CONFIG` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ROCKOLA_WHATSAPP`, `SPOTIFY_CLIENT_ID`, y opcionales `TV_FONDOS`, `TV_FONDO_ROTAR_S`, `TV_FRASES_CADA_S`).
- Pruebas SQL: `pruebas*.sql` usan `do $$ … assert … $$`; `probar.sh` las corre en orden contra Postgres desechable e incluye pruebas de concurrencia (200 toques simultáneos, 6 cobros a la vez).
- CI (`pruebas.yml`): bot (`node --test`), controlador (`node --test` de funciones y `sin_where`), SQL (`probar.sh`).

## Datos de contexto

- Bot: SIM 573108660167, solo comillas, Termux (puerto SSH 8022, usuario u0_a450), `tmux` sesión `bot`.
- Rockola: bar «Callejón del Gato», lema «Pon tu música, tu caos». 1 punto = $1.000, canción 8 pts, bienvenida 16, máx. 2 en cola por persona, cola 30, cooldown 60 min.
- Spotify: app «Callejon gato», Redirect URI `https://ingdiegoter1998-eng.github.io/Centinela/bar/rockola/player.html`, scopes `user-read-playback-state user-modify-playback-state user-read-private`.
