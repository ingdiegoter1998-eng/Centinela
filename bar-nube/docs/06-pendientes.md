# 06 · Pendientes e ideas (estado al 17-nov-2026)

## Para hacer pronto

| # | Pendiente | Detalle y cómo |
|---|---|---|
| 1 | **Rotar las claves de los usuarios** | Siguen las claves viejas cortas, que se aceptan con un parche (`SUFIJO_VIEJO = '-bar'` en `app.js` y `rockola/player.js`). Pasos en 03, sección D. Después, borrar el parche en un PR |
| 2 | **Activar «Leaked password protection»** | Supabase → Authentication → Providers/Policies. Solo existe en planes de pago: si no hay, ignorar |
| 3 | **Pegar `artistas_catalogo_2.sql` y terminar la carga de artistas** | 516 artistas de cantina y tropical ya están resueltos en `supabase/artistas_catalogo_2.sql`: pegarlo en el SQL Editor (después de `generos.sql`). Faltan ~390 nombres: Spotify volvió a dar 429 (~24 h, hasta ~1 p. m. del 18-nov). Cuando pase, correr `resolver.py` (máx. 160 por corrida) y `generar_sql.py`; detalle en 04 |
| 4 | **Inventario atrasado** | Hay compras sin cargar: por eso hay stock negativo. En la app → Inventario → «Entrada»/«Conteo» (o un `conteo_AAAA-MM-DD.sql`, ver 03). Las ventas están completas |
| 5 | **Batería del celular del bafle y del bot** | Quitar la optimización de batería de Spotify (celular del bafle) y de Termux (celular del bot). Ver 02 y 04 |
| 6 | **Cartel con el formato del bot** | Un cartel/QR en el bar: «Escríbele al 310 866 0167: "nombre de la canción artista"». Mucha gente no pondrá comillas |
| 7 | **Respaldo de datos** | El plan gratis no hace copias descargables. Exportar a CSV de vez en cuando `facturas`, `lineas`, `productos`, `rockola_puntos`. El libro de puntos es dinero |
| 8 | **Revisar géneros automáticos** | Las etiquetas de MusicBrainz son flojas para música regional. Panel → Rockola → «por clasificar» y revisar los `auto` |

## Infraestructura

- **Claves y secretos sin rotar**: el Client Secret de Spotify se compartió por chat y por un commit (ya fuera del repo). Decisión del dueño del 16-nov: no rotarlo. Si algún día hay duda, rotarlo (ver 01).
- **Bot en un solo celular con Termux**: sin plan B. Si el celular muere o WhatsApp banea el número, la rockola por WhatsApp se cae. Alternativas: servidor Linux (README del bot), número dedicado, o pedidos web verificados.
- **Oracle Cloud sin cupo en Bogotá**: se intentó crear una VM gratis (`VM.Standard.A1.Flex`, 1 OCPU/6 GB, Ubuntu 22.04) en `sa-bogota-1` y respondió «Out of capacity». La red `rockola-vcn` (subred pública) ya está creada; falta reintentar la instancia cuando haya cupo. El par de llaves SSH se descargó pero la instancia no se creó, probablemente toque generar otro. No crear shapes que cobren. No pegar llaves privadas en ningún chat.
- **Número del bot = número personal del dueño.** Riesgo de baneo aceptado.
- **El chat «contigo mismo» del bot es intermitente** (causa sin confirmar). Probar siempre desde otro número. No subir a Baileys 7 a ciegas: antes copiar `auth/`, tener plan de vuelta a 6.7.24 y mirar `npm view @whiskeysockets/baileys dist-tags` (antes de rc12 hay un CVE).
- **Spotify y derechos de autor (SAYCO/ACINPRO)**: ver 05.
- **`pg_safeupdate`** hace que cualquier `UPDATE`/`DELETE` sin `WHERE` falle en producción sin que las pruebas lo noten (ver 03).

## Ideas propuestas y NO construidas

1. **Aviso «tu canción suena ahora»** (y «el barman quitó tu canción, te devolví X puntos») por WhatsApp. Hoy los reembolsos son silenciosos.
2. **Canje de puntos con código en la factura.** En vez de que el barman teclee el celular del cliente (error humano, olvidos), la cuenta trae un código corto y el cliente escribe `"canjear 4831"` al bot. El número lo prueba WhatsApp, no se teclea, y además registra clientes nuevos. Es la mejora de más retorno para el negocio según la auditoría.
3. **Pedidos web verificados por WhatsApp.** Que la página del QR vuelva a poder pedir, pero identificando al cliente con un código enviado por WhatsApp (o código de mesa). Sería también el plan B si el bot cae.
4. **Cámara y caudalímetro.** Detectar sacadas de cerveza no registradas (caudalímetro Swissflow SF800 + ESP32 por grifo, cruzado contra ventas) y aforo (cámara Tapo con Frigate en un Raspberry). Ver `anexos/planteamiento-camara.md` y `anexos/lista-piezas-caudalimetro.md`. Hay un borrador de código en el PR #8 (`bar-camara/`, sin mergear). Idea mayor del dueño: autoservicio de cerveza con 4 grifos (RFID + solenoide + caudalímetro + ESP32 por grifo, ~2,5 M COP de electrónica), probarlo 3 a 6 meses en el bar antes de venderlo a otros.
5. **Pausar la música desde la app del barman** (hoy el botón «pausar pedidos» no pausa la música; el volumen y la pausa viven en `player.html`).
6. **Cancelar el cliente su propio pedido** y recuperar puntos.
7. **Métricas de la rockola para el dueño**: más pedidas, puntos emitidos contra gastados, horas pico (el panel ya tiene una parte).
8. **Archivar `rockola_cola`** cada cierto tiempo (crece sin límite; con el volumen de un bar tarda años en molestar).
9. **Cooldown desde que sonó, no desde que se pidió** (hoy se cuenta desde el pedido).
10. **Prohibir una canción con un botón** en la pestaña Rockola.

Las demás observaciones de la auditoría (`anexos/auditoria-rockola-2026-11-16.md`) están en su mayoría resueltas (puerta anónima cerrada, latido, reembolso por falla, CI, clasificación de artistas, panel de puntos). Lee el anexo con la lente «esto era el estado del 16-nov».

## Hecho (para que no lo repitas)

CI en cada PR (bot, controlador, reglas SQL); rockola con Spotify Connect, DJ y latido; puntos y géneros (158); 424 artistas precargados; clasificación automática con MusicBrainz; panel admin de 7 pestañas; pausa fantasma resuelta; búsqueda que respeta el 429; bot con candado de sesión, vigilante, logs de diagnóstico, «sigo vivo» cada 10 min.
