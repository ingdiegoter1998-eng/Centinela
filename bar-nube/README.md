# Control del bar — versión en la nube (gratis, siempre activa)

Mismo bar, mismo modelo y mismas reglas que [`bar/`](../bar/README.md), pero sin PC encendida:

| Pieza | Servicio gratis | Qué hace |
|---|---|---|
| Pantallas (`index.html`, `app.js`) | **GitHub Pages**, en `/bar/` del sitio | Lo que abre el personal en el celular |
| Datos, reglas y tiempo real | **Supabase** (plan gratis) | Postgres + funciones + sincronización en vivo |

No hay servidor propio. El front habla directo con Supabase; las reglas (stock, cobro, numeración
consecutiva, jornada de 6:00 a 6:00) viven en funciones de la base: [`supabase/schema.sql`](supabase/schema.sql).

## Puesta en marcha (una sola vez)

1. **Base de datos**: aplicar `supabase/schema.sql` al proyecto. Sin pegar nada a mano:
   `SUPABASE_ACCESS_TOKEN=... ./supabase/aplicar.sh --catalogo` (carga el catálogo real del bar; `--demo` carga uno de
   ejemplo). A mano: Supabase → SQL Editor → pegar `schema.sql` → Run. Es seguro repetirlo.
   **Usuarios**: `SUPABASE_ACCESS_TOKEN=... ADMIN_CLAVE=... BARMAN_CLAVE=... ./supabase/crear_usuarios.sh`
   (las claves no viven en el repo; repetirlo las cambia).
2. **Llave pública**: poner la llave `anon` (Project Settings → API) en `config.js`. Es pública por diseño.
   Nunca la `service_role`.
3. **Publicar**: activar Pages (Settings → Pages → Source: *GitHub Actions*) y hacer merge a `main`.
   El workflow `pages.yml` publica la app en `https://<usuario>.github.io/Centinela/bar/`.
4. Los celulares abren ese link y lo agregan a la pantalla de inicio.

## Usuarios y permisos

Se entra con usuario y contraseña. Quien no inició sesión no ve ni escribe nada (la llave pública `anon` quedó sin
permisos); lo que cada rol puede lo impone la base (RLS y funciones), no la pantalla.

| Usuario | Rol | Puede |
|---|---|---|
| `diego` | admin (super administrador) | Todo: mesas, inventario (sumar/contar), ventas y ganancias, catálogo y precios |
| `barman` (José Manuel) | barman | Abrir, editar y cobrar cuentas; ver el inventario sin modificarlo; consultar el historial de facturas de cualquier jornada (lo vendido y cómo pagaron, sin costos ni ganancias). No ve el resumen de Ventas ni el catálogo |

Detalle: por dentro el usuario es `<usuario>@bar.local` (Supabase pide un correo). Las claves deben ser **largas (12+ caracteres, mejor
una frase)** y se escriben tal cual: antes la app le sumaba un sufijo fijo `-bar` a una clave corta, y como ese sufijo estaba en el repo público
solo escondía una clave corta. `crear_usuarios.sh` rechaza claves de menos de 12 caracteres. Mientras las claves viejas no se roten, la
pantalla de entrada todavía prueba una segunda vez con el sufijo (`SUFIJO_VIEJO` en `app.js` y `rockola/player.js`); se borra en cuanto se roten.
El registro público está cerrado: usuarios nuevos solo con el script.

**Cerveza artesanal por litros**: la pinta (490 ml) y el vaso (330 ml) descuentan del mismo recipiente («Cerveza
artesanal negra (litros)», se cuenta en ml y se muestra en litros). El administrador lo ajusta con *Mover* en Inventario,
escribiendo litros.

**Combos y cigarrillos**: un combo (ej.: «Combo Poker + Mata Cuchos», $3.800) es un producto con su propio precio
que descuenta del inventario lo que lo compone (tabla `combo_componentes`); su costo se calcula al vender con los costos
vigentes. Un producto con `en_promos = false` (Lucky Strike) no puede entrar a ningún combo: la base lo rechaza.

**Conteos puntuales**: un conteo de inventario dado por el dueño se deja en un archivo (ej.: `conteo_2026-10-31.sql`)
y se corre una vez con `./supabase/aplicar.sh --catalogo conteo_2026-10-31.sql`. Equivale a hacer «Conteo» en Inventario.

## Uso

Igual que la versión local: **Mesas** → tocar la mesa → tocar productos → cobrar (efectivo, transferencia o
tarjeta). **Inventario** (alertas, entradas, conteo), **Ventas** (por jornada, ganancia, cuentas abiertas) y
**Catálogo** (⚙: productos, precios, categorías, mesas; antes era el admin de Django).

Todo se ve al instante en los demás celulares (Supabase Realtime) y, por si el WiFi falla un momento, se
relee solo cada pocos segundos. Si no hay conexión aparece un aviso rojo y se recupera solo.

## Rockola (`rockola/`)

Los clientes piden por WhatsApp (con puntos); la página del QR solo muestra qué suena y la cola, y suena en vivo en el bar por orden de llegada. `rockola_pedir` (la que usaba la web con la llave pública) ya no es pública.

| Pantalla | URL (tras publicar) | Quién |
|---|---|---|
| Cliente | `/bar/rockola/?mesa=5` (un QR por mesa) | Cualquiera: ve la cola y qué suena; para pedir lo manda al WhatsApp del bot (`ROCKOLA_WHATSAPP` en `config.js`) |
| Pantalla del TV | `/bar/rockola/tv.html` | Sin login: se deja abierta en el PC del TV (pantalla completa, F11). Muestra lo que suena, la cola y un QR para pedir |
| Reproductor | `/bar/rockola/player.html` | Personal (mismo usuario y clave de la app), en el PC/tablet del bar con la pestaña abierta |

Puesta en marcha (una vez):
1. `./supabase/aplicar.sh rockola.sql` (después de `schema.sql`; si vuelves a correr `schema.sql`, corre este otra vez).
2. **Spotify** (necesita una cuenta **Premium** en el PC del bar): crear una app en developer.spotify.com, agregar como Redirect URI
   `https://<usuario>.github.io/Centinela/bar/rockola/player.html`, y poner su Client ID en `config.js` (`SPOTIFY_CLIENT_ID`, público).
3. Búsqueda para los clientes: `supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...` y
   `supabase functions deploy rockola-buscar --no-verify-jwt` (el secreto vive solo en Supabase).
4. En el PC del bar: abrir el reproductor, entrar, *Conectar Spotify* y *Arrancar rockola* (el navegador exige ese clic para dejar sonar).

Probar sin Spotify: agregar `?demo` a ambas URLs (canciones de mentira de 15 s).

Reglas (las impone la base, no la pantalla): máx. 2 pedidos en cola por celular, cola de 30, una canción no se repite si
está en cola o sonó hace menos de 60 min, y el personal puede saltar, quitar o pausar los pedidos. Los ajustes viven en `rockola_config`.
La cola ordena por `puntos` y luego por llegada; hoy `puntos` es siempre 0, así que el futuro sistema de puntos solo tiene que llenarlo.

### Puntos y precio por género (`supabase/rockola_puntos.sql`)

Se aplica después de `rockola.sql` (`./supabase/aplicar.sh rockola_puntos.sql`). Reglas, todas ajustables en `rockola_config`:
**1 punto = $1.000 consumidos** (`punto_pesos`), una canción normal cuesta **8 puntos** (`precio_base_puntos`, dos cervezas) y quien se
registra recibe **16** (`puntos_bienvenida`, dos canciones). El género del artista multiplica el precio (`rockola_generos`: ranchera ×3);
un artista sin género cuesta el base y queda en `rockola_artistas` para clasificarlo con `rockola_clasificar`. El saldo es la suma del libro
`rockola_puntos` (solo se agregan filas). Quitar una canción pendiente devuelve sus puntos. `rockola_prohibidas` es la lista negra.

- **Personal** (app): `rockola_dar_puntos_factura(factura, celular, nombre)` da `total ÷ 1.000` puntos por una factura pagada (una sola vez por factura);
  `rockola_cortesia` solo el administrador.
- **Bot de WhatsApp** (llave `service_role`, que nunca sale del servidor del bot): `rockola_registrar`, `rockola_mi_estado`, `rockola_pedir_puntos`.
  El celular lo prueba WhatsApp, por eso solo el bot gasta puntos.
- **En la app del bar:** la pestaña **Rockola** muestra la cola con *Quitar* (devuelve los puntos), *Saltar*, pausar pedidos y consultar los puntos de un celular
  (el administrador además da cortesías). En cada **factura pagada** aparece «Puntos de la rockola»: se escribe el celular del cliente y se le dan
  los puntos de esa factura. Si el barman salta o quita desde el celular, el reproductor del PC lo sigue solo (relee cada 4 s).
- La pantalla web del cliente todavía pide sin puntos (límite de 2 por celular); falta decidir cómo identificar al cliente ahí.

### Bot de WhatsApp (`bot/`)

Pedir canciones con puntos por WhatsApp (Baileys, no oficial) desde un Android con Termux. Instalación paso a paso, vinculación del número y cómo
dejarlo 24/7 en [`bot/README.md`](bot/README.md). No se publica en Pages: corre en el celular del bot.

## Qué conviene saber

- **Costos visibles por la API**: la pantalla del barman esconde costos y ganancias, pero técnicamente puede leer la
  columna `costo` de `productos` si consulta la API a mano. Si importa, hay que mover el costo a otra tabla.
- **Supabase gratis pausa el proyecto tras 7 días sin uso**. Un bar abre a diario; si cierras una semana, se
  reactiva con un clic en el panel de Supabase.
- **Respaldo**: Supabase → Database → Backups (el plan gratis no hace copias descargables automáticas);
  conviene exportar de vez en cuando. Los datos viven en Supabase, no en el repo.
- Stock: se descuenta al pedir y puede quedar negativo (no se frena una venta por conteo desactualizado).

## Probar sin tocar Supabase

`supabase/probar.sh` levanta un Postgres desechable, aplica el esquema dos veces, corre `pruebas.sql`
(las mismas reglas que las pruebas de Django) y lanza 200 toques simultáneos y 6 cobros a la vez:
comprueba que no se pierde ninguno y que la numeración sale 1…6 sin repetir. Necesita los binarios de PostgreSQL.
