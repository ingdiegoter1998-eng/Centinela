# 01 · Mapa del sistema, URLs y accesos

## Vista de pájaro

```
 Celulares del personal ──► GitHub Pages (páginas estáticas) ──┐
 Clientes (QR de mesa) ───► GitHub Pages (rockola/)            ├──► Supabase (Postgres + Auth + Edge Functions + pg_cron)
 TV del bar ──────────────► GitHub Pages (rockola/tv.html)     ┘            ▲            │
                                                                            │            ▼
 Clientes por WhatsApp ──► Bot (Baileys, Node, en un Android con Termux) ───┘      Spotify (API + Connect)
                                                                                         │
                                                                         Celular del bafle (Spotify) ──Bluetooth──► bafle
```

No hay servidor propio. Las páginas son HTML y JS puro (sin build) que hablan directo con Supabase. Las reglas de dinero, stock y puntos viven en la base de datos (funciones SQL y permisos por fila), no en las pantallas: aunque alguien manipule la página, la base manda.

## Repositorio

- GitHub: `ingdiegoter1998-eng/Centinela` (el repo mezcla otros proyectos viejos de agronomía: `centinela_core/`, `web/`, `demo/`, `landing/`. Ignóralos. Lo del bar es `bar-nube/`, y `bar/` es una versión vieja en Django que corre en un PC y ya no se usa).
- Todo cambio va por Pull Request a `main`. Al hacer merge a `main`, el workflow `.github/workflows/pages.yml` publica solo (1 a 3 minutos). El workflow `pruebas.yml` corre las pruebas en cada PR.
- Proyecto Supabase: referencia `xesmbhfgiosrhctjamru`. Panel: https://supabase.com/dashboard/project/xesmbhfgiosrhctjamru

## URLs públicas (GitHub Pages)

Base: `https://ingdiegoter1998-eng.github.io/Centinela/`

| URL | Qué es | Quién entra |
|---|---|---|
| `/bar/` | App del bar: Mesas, Inventario, Ventas, Catálogo, Facturas, pestaña Rockola | Personal con usuario y clave. Se agrega a la pantalla de inicio del celular |
| `/bar/admin/` | Panel de control (7 pestañas: Resumen, Reportes, Facturas, Inventario, Rockola, Puntos, Trabajador) | Solo el administrador (`diego`). El barman no entra |
| `/bar/rockola/?mesa=N` | Página del cliente: ve qué suena y la cola, y la manda al WhatsApp del bot para pedir. Un QR por mesa con `N` = número de mesa | Cualquiera, sin login |
| `/bar/rockola/tv.html` | Pantalla de la TV: lo que suena, la cola, frases en el silencio, fondos en video, QR | Sin login. Se deja abierta en pantalla completa (F11) |
| `/bar/rockola/player.html` | Panel del bafle: conectar Spotify, estado del celular del bafle, pausar, saltar, volumen, pausar pedidos | Personal; conectar Spotify solo el admin. La música NO sale de esta página |
| `/` | Landing del proyecto Centinela (agronomía), no tiene que ver con el bar | |

## Usuarios y roles

Se entra con usuario y clave. Por dentro Supabase Auth guarda el usuario como `<usuario>@bar.local` (la app agrega el dominio sola).

| Usuario | Rol | Qué puede |
|---|---|---|
| `diego` | `admin` | Todo: mesas, inventario (sumar/contar), ventas y ganancias, catálogo y precios, panel `/bar/admin/`, dar puntos de cortesía, conectar Spotify |
| `barman` (José Manuel) | `barman` | Abrir, editar y cobrar cuentas; ver inventario sin modificarlo; ver historial de facturas; dar puntos de rockola a una factura pagada; saltar o quitar canciones. No ve ganancias, costos ni catálogo |

Las claves NO están en el repo ni en estos documentos. Se pusieron con `supabase/crear_usuarios.sh` (ver [03](03-supabase-y-despliegue.md)). Si se olvidan, se vuelven a fijar con el mismo script; repetirlo no duplica nada. El registro público está cerrado: no se pueden crear usuarios desde la web.

Estado de las claves: ver [06-pendientes](06-pendientes.md) (siguen sin rotar a claves largas).

## Dónde vive cada secreto (ninguno está en el repo)

| Secreto | Dónde está | Para qué |
|---|---|---|
| Llave `anon` de Supabase | En `bar-nube/config.js` (es pública a propósito: sin login no abre nada) | Que las páginas hablen con Supabase |
| Llave `service_role` de Supabase | Supabase → Project Settings → API. En el celular del bot, archivo `.env` (`SUPABASE_SERVICE_KEY`). NUNCA en el repo ni en `config.js` | El bot gasta puntos y registra gente |
| Token de acceso de Supabase (`SUPABASE_ACCESS_TOKEN`) | Supabase → Account → Access Tokens. Lo creas, lo usas en la terminal y lo borras | Correr `aplicar.sh` y `crear_usuarios.sh` |
| `SPOTIFY_CLIENT_ID` | Público, en `config.js`, y como secreto de las Edge Functions | Login PKCE y búsquedas |
| `SPOTIFY_CLIENT_SECRET` | Solo en Supabase → Edge Functions → Secrets | Búsqueda de canciones y artistas (client credentials) |
| Refresh token de la cuenta Spotify del bar | Tabla `rockola_spotify` (ni anon ni personal pueden leerla por la API) | El DJ toca canciones |
| Secreto del cron | Tabla `rockola_ctl_ajustes` | Que solo la base pueda disparar al DJ |
| Sesión de WhatsApp del bot | Carpeta `auth/` del bot en el celular. No subir, no borrar a la ligera | Que el bot siga vinculado |

El Client Secret de Spotify se pegó una vez por chat y por un commit (ya se sacó del repo). El dueño decidió el 16-nov-2026 no rotarlo. Si algún día quieres rotarlo: developer.spotify.com → tu app → Settings → View client secret → Reset, y actualiza el secreto en Supabase (ver 03).

## Piezas, una por una

### 1. App de ventas e inventario (`bar-nube/index.html`, `app.js`, `app.css`)
Mesas con cuentas, productos, cobro (efectivo, transferencia, tarjeta), inventario con alertas y conteo, ventas por jornada, catálogo editable (solo admin). Sincroniza en vivo entre celulares (Supabase Realtime) y relee cada pocos segundos si el WiFi falla. Reglas en `supabase/schema.sql`. Combos, cigarrillos y cerveza artesanal por litros: ver [05](05-decisiones-de-negocio.md).

### 2. Panel de control (`bar-nube/admin/`)
Siete pestañas descritas en el README principal. Todo lo que muestra lo valida la base con `es_admin()`. Funciones SQL en `supabase/admin.sql`.

### 3. Rockola
Los clientes piden canciones por WhatsApp y las pagan con puntos. Piezas:
- **Bot de WhatsApp** (`bot/`): Node + Baileys, corre en Termux. Ver [02](02-bot-whatsapp.md).
- **Edge Functions** (`supabase/functions/`):
  - `rockola-buscar`: busca canciones en Spotify (client credentials) y clasifica artistas nuevos con MusicBrainz. Si Spotify da 429 deja de llamar hasta que pase el `Retry-After`.
  - `rockola-control`: el DJ. Toca, encola ~20 s antes del final, reanuda, reconoce cambios manuales, registra el latido. Lo llama el cron y el panel del bafle.
  - `rockola-artista-id`: traduce nombres de artista a ids de Spotify (solo para cargar el catálogo de artistas).
- **Cron `rockola-tick`** (pg_cron, cada 5 s): despierta a `rockola-control` solo si hay cola, canción sonando o toca el latido (~1 por minuto).
- **Spotify Connect**: un celular con la app de Spotify (cuenta Premium del bar) conectado por Bluetooth al bafle. Ver [04](04-rockola-spotify-y-artistas.md).
- **Páginas**: cliente, TV, panel del bafle (tabla de URLs arriba).
- **TV** (`rockola/tv.html`, `tv.js`, `tv.css`, `frases.json`, `fondos/`): solo lee `rockola_estado` y se refresca cada 3 s. Cuando no suena nada muestra frases de canciones cínicas (una por minuto, barajadas, sin repetir hasta vistas todas). Fondos en video que rotan cada 4 min. Se configura en `config.js` (`TV_FONDOS`, `TV_FONDO_ROTAR_S`, `TV_FRASES_CADA_S`) o por URL (`?fondo=...&tema=dorado`, `?frases=30`).
- **Puntos y géneros**: `supabase/rockola_puntos.sql`, `generos.sql`, `artistas_catalogo.sql`. Detalle en 04 y 05.

Identidad del bar en la rockola: «Callejón del Gato», lema «Pon tu música, tu caos». Sin emojis en ningún texto de la rockola (el bot tiene una prueba que falla si una respuesta lleva emojis).

### 4. Cámara y caudalímetro (idea, no construido)
Solo hay planteamiento y lista de piezas en `docs/anexos/`. Hubo un borrador (`bar-camara/`, PR #8) que no está en `main`.

## Cómo se publica cada cosa

| Cambio | Cómo llega a producción |
|---|---|
| HTML/JS/CSS de `bar-nube/` | PR a `main` → merge → Pages publica sola |
| Bot (`bar-nube/bot/`) | Merge a `main`, y luego `git pull` en el celular del bot y reiniciar (no se publica en Pages) |
| SQL (`supabase/*.sql`) | Se pega a mano en el SQL Editor de Supabase (o `aplicar.sh`). Merge a `main` NO toca la base |
| Edge Functions | Se despliegan aparte: `supabase functions deploy ...` (ver 03). Merge a `main` NO las despliega |
| Usuarios y claves | `crear_usuarios.sh` |
