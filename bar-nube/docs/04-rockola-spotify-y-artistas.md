# 04 · Rockola: Spotify, el celular del bafle y los artistas

## Cómo suena una canción (el flujo completo)

1. El cliente escribe al bot `"besos en guerra morat"`. El bot llama a la función `rockola-buscar`, que busca en Spotify y devuelve hasta 3 opciones con precio en puntos.
2. El cliente responde `1`. El bot llama a `rockola_pedir_puntos` (SQL): valida reglas, descuenta puntos y mete la canción en `rockola_cola` como `pendiente`.
3. `pg_cron` (job `rockola-tick`, cada 5 s) llama a `rockola_ctl_disparar()`, que solo despierta a la función `rockola-control` si hay cola, canción sonando o toca el latido.
4. `rockola-control` pregunta a Spotify qué está tocando, y si no hay nada pone la primera pendiente en el dispositivo elegido. Unos ~20 s antes de que acabe la actual deja encolada la siguiente (sin silencios). Anota el latido en `rockola_reproductor`.
5. La TV y la página del cliente leen `rockola_estado` cada pocos segundos.

La música NO sale del navegador. Sale del celular del bafle (Spotify Connect), por Bluetooth.

## Conectar la cuenta de Spotify (una vez, o si se desconecta)

Requisitos: cuenta Spotify **Premium** (la del bar), la app creada en developer.spotify.com («Callejon gato») con Redirect URI exacta:
`https://ingdiegoter1998-eng.github.io/Centinela/bar/rockola/player.html`
y su Client ID en `config.js` (`SPOTIFY_CLIENT_ID`, ya está).

1. Abrir `https://ingdiegoter1998-eng.github.io/Centinela/bar/rockola/player.html`.
2. Entrar como **diego** (admin).
3. Tocar **Conectar Spotify**, iniciar sesión en Spotify y aceptar. Vuelve al panel mostrando la cuenta conectada.
4. Permisos que pide: `user-read-playback-state user-modify-playback-state user-read-private`. El refresh token queda en la tabla `rockola_spotify` (inaccesible por la API pública).

Si el panel dice que Spotify no está conectado después de haber funcionado, repite estos pasos (el token puede haberse revocado, por ejemplo al cambiar la clave de Spotify).

## Preparar el celular del bafle

1. Instalar Spotify e iniciar sesión con la cuenta Premium del bar.
2. Emparejar el bafle por Bluetooth y dejarlo conectado.
3. Ajustes de Android → Apps → Spotify → Batería → **Sin restricciones** (si Android lo mata, se corta la música).
4. Dejarlo enchufado, con WiFi, y con la pantalla apagada si quiere. No hace falta tener ninguna página abierta.
5. Si el panel del bafle dice «El bafle no responde»: abrir Spotify en ese celular y dar play/pausa a cualquier cosa una vez para que aparezca como dispositivo disponible. En el panel (`player.html`) puedes elegir el celular en la lista de dispositivos.
6. Si al reproducir no hay audio aunque el panel diga «suena»: puede ser la trampa de la pausa fantasma (abajo).

Un celular cualquiera de la cuenta sirve: no tiene que ser siempre el mismo (el panel recuerda el elegido).

## Qué hace la rockola cuando algo falla

| Situación | Qué pasa | Por qué |
|---|---|---|
| El celular del bafle no responde más de 3 minutos (con Spotify conectado) | La base **rechaza pedidos nuevos**; la TV, la página del QR y el bot avisan | Nadie debe pagar puntos por algo que no va a sonar |
| Spotify no puede tocar una canción (no existe, no disponible) | El pedido queda `fallida` y se **devuelven los puntos** | Falla del sistema, no del cliente |
| El problema es el dispositivo o la red | La canción **vuelve a la cola** con su puesto y sus puntos | No es culpa de nadie |
| El barman quita una pendiente | Se devuelven los puntos | Decisión del bar |
| Saltar la que está sonando | No devuelve puntos | Ya se consumió |
| Spotify queda en pausa solo (la pausa fantasma) | El DJ reanuda solo (espera 8 s, insiste cada 15 s como máximo); **la pausa hecha a propósito desde el panel gana** | Tras tocar, Spotify a veces reporta `is_playing=false` con la canción cargada |
| Cola vacía | No toca nada ni interrumpe lo que esté sonando en Spotify | El barman puede poner su propia música |
| El barman cambia de canción desde la app de Spotify | La base lo reconoce | |

Pausar pedidos (botón del panel) solo cierra la puerta a pedidos nuevos; no para la música. Para la música usa pausar en el panel del bafle.

### Si «suena» pero no hay audio

```sql
select * from rockola_reproductor;     -- mira reproduciendo, error, dispositivo, verificado_en
```
Si `reproduciendo = false` y hay canción «sonando», pulsa «Reanudar música» en el panel del bafle. Si el latido (`verificado_en`) tiene más de un minuto, el cron o la función están caídos: mira Supabase → Edge Functions → `rockola-control` → Logs, y `select jobname, active from cron.job;` (debe haber un job `rockola-tick` activo). Si no está, vuelve a correr `rockola_control.sql`.

## Qué hacer ante un 429 de Spotify

El 429 es «demasiadas peticiones». No se arregla con reinicios: hay que **esperar** a que pase el `Retry-After`, y seguir insistiendo lo alarga.

- Efecto: la búsqueda de canciones cae (`rockola-buscar` responde 503 con `reintentar_en_s`; el bot avisa «La búsqueda de canciones está caída por ahora»). Puntos, cola y cancelar siguen. El límite es por app de Spotify (el mismo Client ID de la búsqueda y del DJ), así que el DJ también puede notar problemas; el 16-nov el bar estaba cerrado y casi no hubo impacto, no se comprobó qué pasa con canciones en cola.
- `rockola-buscar` ya deja de llamar a Spotify mientras dure el castigo (PR 45).
- Sucedió el 16-nov-2026 ~8:20 p. m. (hora Bogotá): se resolvieron ~1.200 artistas de golpe y Spotify devolvió `Retry-After` de 60329 s (~16,8 h). Ese se levantó ~12:50 p. m. del 17-nov-2026; ese mismo día un segundo bloqueo (~24 h) llegó ~1:10 p. m. y dura hasta ~1 p. m. del 18-nov.
- Cómo ver cuánto falta: llama a la búsqueda y mira `reintentar_en_s`:
  ```sh
  curl -s "https://xesmbhfgiosrhctjamru.supabase.co/functions/v1/rockola-buscar?q=morat" \
    -H "apikey: LLAVE_ANON" -H "Authorization: Bearer LLAVE_ANON"
  ```
  (la llave anon está en `config.js`). Mientras haya castigo, la función suele responder 503 sin tocar Spotify (la memoria del castigo se pierde si la función se reinicia en frío, y entonces hace un intento nuevo: no insistas).
- Regla de oro para cargar artistas en masa: lotes pequeños (8), pausa mayor o igual a 1,5 s y **parar al primer error**. `catalogo_artistas/resolver.py` ya lo hace.

## Clasificar artistas (género = precio)

El precio de una canción es `precio_base_puntos (8) × multiplicador del género del artista`. Spotify ya no entrega géneros de artistas (verificado 17-nov-2026), así que hay tres caminos, de más fuerte a más débil:

1. **Manual (`origen = 'manual'`)**: nunca se pisa. Panel `/bar/admin/` → pestaña **Rockola** → lista «por clasificar» → elegir género. También con `rockola_clasificar(proveedor, artista_id, nombre, genero)`. Lo precargado del catálogo también es manual.
2. **Automático por MusicBrainz (`origen = 'auto'`)**: al buscar, `rockola-buscar` consulta MusicBrainz (gratis, 1 consulta por segundo, hasta 3,5 s por búsqueda) por cada artista nuevo y traduce sus etiquetas a uno de nuestros géneros (`functions/rockola-buscar/clasificar.mjs`). Gana el multiplicador con más etiquetas; en empate, el más caro. Una búsqueda con artista nuevo tarda ~5 s la primera vez. Para música regional las etiquetas son flojas: **revisa** lo que quede mal y corrígelo a mano.
3. **Sin clasificar (`genero null`)**: precio base. Aparece en «por clasificar». El botón **«Clasificar pendientes»** del panel procesa hasta 40 por toque.

Cambiar una regla de etiquetas o `generos.sql` implica redesplegar `rockola-buscar`. Para reintentar los automáticos:
```sql
update rockola_artistas set genero = null, origen = null, etiquetas = '{}' where origen = 'auto';
```

### Géneros y multiplicadores (`generos.sql`, 158 géneros)

Al 17-nov: 57 géneros a ×1, 68 a ×1,5, 15 a ×2 y 18 a ×3. Los ×3 son música de cantina (ranchera, y similares) que no va con el bar: sale cara a propósito para desanimarla. Para ver o editar: panel → Rockola → Géneros, o:
```sql
select genero, multiplicador from rockola_generos order by multiplicador desc, genero;
```

### Catálogo de artistas cargado de antemano

- Cargados desde antes: 424 artistas latinos populares (`artistas_catalogo.sql`, ya aplicado): reggaetón, urbano, pop latino, balada, rock en español, reggae, salsa (parte).
- **17-nov-2026, tarde:** se resolvieron 516 artistas más (cantina y tropical: vallenato, cumbia, merengue, ranchera, bachata, salsa, norteño, corridos, son cubano, bolero, grupera, tango...). Están en `supabase/artistas_catalogo_2.sql`, **pendiente de pegar en el SQL Editor** (después de `generos.sql`; es idempotente).
- Faltan ~390 nombres de `latinos.json`. Muchos probablemente no coinciden exacto en Spotify (por ejemplo «Tito El Bambino» figura como `Tito "El Bambino"`) y quedarán sin resolver: está bien. Spotify volvió a dar **429 con `Retry-After` de 85842 s (~24 h)** el 17-nov a las ~18:10 UTC (1:10 p. m. Bogotá) tras ~850 consultas seguidas: no se levanta antes de ~1:00 p. m. del 18-nov. Lección: ~850 consultas en una corrida son demasiadas; `resolver.py` ahora hace máximo 160 nombres por corrida con 3 s de pausa. Corre otra corrida solo con la búsqueda sana y otro día.

Cómo terminarlo (después de ~1 p. m. del 18-nov-2026, y siempre con la búsqueda sana):

```sh
cd bar-nube/supabase/catalogo_artistas
curl -s "https://xesmbhfgiosrhctjamru.supabase.co/functions/v1/rockola-artista-id" -X POST \
  -H "Content-Type: application/json" -d '{"nombres":["Morat"]}'     # prueba: debe devolver {"Morat":{"id":...}} y NO un error
python3 resolver.py      # de a 8, 3 s de pausa, máx. 160 por corrida, guarda avance en resueltos.json, para al primer error
python3 generar_sql.py   # crea ../artistas_catalogo_2.sql con los nuevos
```
Luego pega el `artistas_catalogo_2.sql` regenerado en el SQL Editor (requiere `generos.sql` ya aplicado). Si `resolver.py` se detiene con error, **espera** lo que diga `reintentar_en_s` y vuelve a correrlo: retoma donde quedó. Cada corrida tarda unos 3 a 4 minutos. El script solo acepta un artista si el nombre coincide exacto (sin tildes ni mayúsculas) y entre varios toma el más popular, así que algunos nombres quedarán sin resolver: está bien, se clasificarán solos o a mano cuando alguien los pida.

Si un género de `lista.txt` no existe en `rockola_generos`, esa fila se salta sola (el SQL tiene un `where exists`). Para crear un género: panel → Rockola → Géneros, o `insert into rockola_generos (genero, multiplicador, nota) values ('nuevo', 1.5, '') on conflict do nothing;`.

## Puntos: cómo se dan y se gastan

- **Dar por consumo:** el barman, en una factura pagada, escribe el celular del cliente (`57` + número) en «Puntos de la rockola»: se dan `total ÷ 1.000` puntos, una sola vez por factura (`rockola_dar_puntos_factura`). El riesgo conocido es teclear mal el número (no hay deshacer; el admin puede corregir con una cortesía negativa).
- **Cortesías:** solo el admin (pestaña Puntos, con motivo; queda anotado quién). El dueño tiene 10.000 puntos de cortesía.
- **Bienvenida:** 16 puntos al primer mensaje.
- El saldo no se guarda: es la suma del libro `rockola_puntos` (solo se agregan filas; motivos: bienvenida, consumo, cortesia, pedido, reembolso).
- Parámetros en `rockola_config`: `punto_pesos` 1000, `precio_base_puntos` 8, `puntos_bienvenida` 16, `max_pendientes` 2, `max_cola` 30, `cooldown_min` 60, `activa`. Se cambian con un `update rockola_config set ... where id;` (con WHERE, ver 03).

## Lista negra

Panel → Rockola → Lista negra, o la tabla `rockola_prohibidas` (hoy vacía). Una canción prohibida se rechaza antes de cobrar.

## Tareas del TV

Frases: `bar-nube/rockola/frases.json` (`[{"texto","autor","anio"}]`). El usuario no quiere emojis ni frases «muy de IA». Para agregar una, edita el JSON (cuidado con comas y comillas), PR a `main`. Fondos: carpeta `rockola/fondos/` (video `.mp4` + `.webp` de poster). Un video nuevo debe pesar poco (el sitio lo descarga cada vez que se abre la TV).
