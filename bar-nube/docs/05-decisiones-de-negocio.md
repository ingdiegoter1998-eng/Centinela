# 05 · Decisiones de negocio y por qué se tomaron

Todo lo de abajo lo decidió el dueño (Diego) o salió de una conversación con él. Si algo te parece raro, busca aquí el porqué antes de «arreglarlo».

## El bar

- **Horario:** el bar **descansa lunes y martes**. Los días en cero de lunes y martes no son «malos». Abre de miércoles a domingo hasta la madrugada.
- **Noche de servicio:** las ventas se agrupan por noche, no por día calendario. La madrugada pertenece a la noche anterior (la madrugada del 1-nov es de la noche del 31-oct). **Corte a las 6:00 AM, hora de Bogotá.** En SQL: `(coalesce(cerrada_en, abierta_en) at time zone 'America/Bogota' - interval '6 hours')::date`. Porqué: el primer resumen de noviembre agrupó por día calendario, metió 8 facturas del 31-oct en noviembre y concluyó que «7 de 12 días no tenían ventas». Las facturas diurnas raras (ej. 10:40 AM) suelen ser pruebas.
- **Las ventas en la app están completas.** Lo atrasado es el **inventario**: compras sin cargar. Por eso un stock negativo significa «compras pendientes de registrar», no «ventas que faltan». El stock se descuenta al pedir y puede quedar negativo a propósito: no se frena una venta por un conteo desactualizado.
- **Costos del bar:** arriendo y servicios en $0 (no se descuentan).
- **Precios vigentes (verificados en la base el 17-nov-2026):** Poker $4.000, Águila Light $4.000 (subieron a $4.500 el 13-nov, pero se venden a $4.000 desde el sábado 14-nov; el viernes 13 se cobraron a $3.500), Club Colombia $6.000, Corona $5.000, Redd's $5.000, Soda $4.000, Maní $2.800, Mata Cuchos $1.000 (costo $250), Lucky Strike $1.500, Combo Poker + Mata Cuchos $4.800 (costo $2.650). Cerveza artesanal: vaso negra 330 ml $15.000, pinta negra 490 ml $20.000, Jirafa Red Ale $60.000. Costo de Poker y Águila: $2.400 c/u.
  - El precio queda **congelado en cada línea** de la factura: cambiar un precio solo afecta ventas futuras.
- **Cigarrillos:** Lucky Strike nunca entra en combos ni promociones (`en_promos = false`, y un trigger de la base lo impone). El combo Poker + Mata Cuchos descuenta del inventario 1 Poker y 1 Mata Cuchos (tabla `combo_componentes`); su costo se calcula al vender con los costos vigentes.
- **Cerveza artesanal por litros:** vaso (330 ml) y pinta (490 ml) descuentan del mismo recipiente («Cerveza artesanal negra (litros)»), que se cuenta en ml y se muestra en litros. El admin lo ajusta con «Mover» en Inventario, escribiendo litros. Costo estimado de la artesanal: $2,2 por ml.
- **Facturas:** numeración consecutiva sin huecos ni repetidos (candado en la base). Se puede anular, nunca borrar. Cada cobro y anulación guarda quién lo hizo (`cobrada_por`, `anulada_por`); lo anterior al panel aparece como «Sin registro».
- **El barman no ve costos ni ganancias** en pantalla. Ojo: técnicamente podría leer la columna `costo` llamando a la API a mano; si eso importa, mover el costo a otra tabla.

## Comisión del trabajador

- **50 % de la ganancia de la cerveza no artesanal**, más **$4.000 fijos por cada cerveza artesanal vendida, en cualquier presentación** (vaso, pinta, jirafa; no depende del precio).
- Idea de fondo: la comercial se reparte a medias lo que realmente deja; la artesanal paga un fijo por unidad en vez de porcentaje (el costo exacto de la artesanal es difícil de fijar, ver costo estimado abajo).
- Es editable sin tocar código: panel → pestaña **Trabajador** (tabla `comision_reglas`: por categoría, `pct`, `base` = ganancia, venta o unidad, y `monto` fijo).
- Referencia de octubre 2026 (1-31): ventas $2.226.700, ganancia $1.636.776, trabajador $525.750, dueño $1.111.026. (Con las reglas de ese momento: ahí el fijo de la jirafa era $10.000.)

## La rockola: economía de puntos

| Decisión | Valor | Por qué |
|---|---|---|
| 1 punto | $1.000 consumidos (`punto_pesos`) | Simple: $20.000 de cuenta = 20 puntos |
| Canción normal | 8 puntos (`precio_base_puntos`) = $8.000 = dos cervezas | El dueño quiere que una canción cueste «como dos cervezas»: que no sea gratis ni se regale |
| Multiplicador por género | ×1, ×1,5, ×2, ×3 según el género del artista | Que la música que el bar no quiere (cantina, ranchera) cueste el triple y desanime. Es una barrera de precio, no censura |
| Cantina/ranchera ×3 | 24 puntos | La música de cantina «no va con el bar» |
| Bienvenida | 16 puntos (`puntos_bienvenida`) = dos canciones gratis | Que probar la rockola no cueste nada |
| Cortesía del dueño | 10.000 puntos | Para pedir sin límite el dueño y regalar |
| Puntos sin vencimiento | Sí | Más simple, nadie reclama |
| Máximo en cola por persona | 2 (`max_pendientes`) | Que una sola persona no se apropie de la noche |
| Cola total | 30 (`max_cola`) | Tope de la pantalla y de la espera |
| No repetir una canción | 60 min (`cooldown_min`), contados desde que se pidió | Evitar que alguien ponga 5 veces la misma |
| Lista negra | `rockola_prohibidas`, hoy vacía | Para lo que el barman no quiera oír |
| Saldo | Suma de un libro (`rockola_puntos`) que solo recibe filas | Auditable, no se puede «corregir» el pasado; los errores se corrigen con otra fila |
| Reembolsos | Al quitar una pendiente, al fallar Spotify, o devolverse a la cola | El cliente no paga por algo que no sonó |

Todo esto lo impone la base de datos (`rockola_puntos.sql`), no el bot ni las pantallas. Ajustar un valor: `update rockola_config set precio_base_puntos = 10 where id;` (el bot muestra el precio que calcula la base).

### Por qué solo por WhatsApp y se cerró la puerta web anónima

La página del QR (`/rockola/?mesa=N`) antes pedía canciones directo con la llave pública. La auditoría del 16-nov-2026 (ver `anexos/auditoria-rockola-2026-11-16.md`) halló que:
1. **Regalaba canciones**: no cobraba puntos ni miraba la lista negra; el límite de 2 se guardaba en el celular (con una ventana de incógnito, 2 más). Quien no quería pagar usaba el QR y el sistema de puntos quedaba de adorno.
2. **Cualquiera podía escribir lo que quisiera en la TV**: título, artista y portada arbitrarios, sin comprobar que la canción existiera, con la llave pública.
Decisión: `rockola_pedir` quedó cerrada al público. La web solo muestra qué suena y la cola, y manda al WhatsApp del bot. El pedido pasa por el bot (que usa la llave `service_role` en el celular), donde el número lo prueba WhatsApp.
Idea pendiente: pedidos web verificados por WhatsApp (ver pendientes).

### Por qué «solo mensajes entre comillas»

El número del bot (310 866 0167) es también el WhatsApp personal del dueño. Sin esa regla el bot contestaría las conversaciones de la vida real. Con comillas, el mismo número sirve para las dos cosas. Costo: la gente no adivina el formato, y el silencio de «sin comillas» se parece a un bot caído. Mitigación: un cartel en el bar con el formato (`"nombre de la canción"`), y a mediano plazo un número dedicado. Se apaga con `SOLO_COMILLAS=0` en el `.env` del bot.

### Bafle caído y reanudación automática

Si el celular del bafle no responde más de 3 minutos, la base rechaza pedidos nuevos (nadie paga por algo que no va a sonar) y se avisa en TV, QR y bot. Si Spotify queda en pausa sin que el barman haya pausado, el DJ reanuda solo. Si el barman pausa desde el panel, esa pausa gana. Ver 04.

### Por qué Spotify Connect y no un navegador

Primero se hizo un reproductor en el navegador (Spotify Web Playback SDK, PC con `player.html` abierto). Se descartó: en celular no funciona en segundo plano, es un punto único de falla y nadie se enteraba si se caía. Con Connect, cualquier celular de la cuenta Premium suena aunque tenga la pantalla apagada, y no hay pestaña que mantener abierta. Se agregó un latido para saber si el bafle responde.

### TV

Sin audio; solo pantalla. Muestra primer nombre y mesa de quien pidió. Fondos en video (Witcher/caballero, noche en la colina) y frases cínicas rotativas en `frases.json` mientras no suena nada. El dueño no quiere emojis ni frases «muy de IA».

### Marca

Bar: «Callejón del Gato». Lema: «Pon tu música, tu caos» (sin coma tras «Pon»).

## Cómo trabajamos con el código

- Todo cambio va por Pull Request a `main`. El dueño pidió que los PR se mergeen sin esperar su revisión (le da pereza entrar a GitHub), siempre con las pruebas en verde.
- Para tocar la base real (SQL, funciones, secretos) siempre se pidió su OK. Hazlo con cuidado: ver 03.
- Sin emojis en los textos de la rockola (hay una prueba que lo vigila en el bot).
- El dueño valora respuestas directas, con humor ácido sin ser idiota.

## Fuera del código, pero toca decirlo

Spotify Premium personal no incluye uso comercial público, y en Colombia un bar que pone música para clientes normalmente debe tener los permisos de comunicación pública (SAYCO / ACINPRO). Con una rockola pagada por los clientes, la exposición es más visible que con una lista de fondo. No es un bug, es la visita que no avisa.
