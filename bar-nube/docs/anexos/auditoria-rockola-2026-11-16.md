# Auditoría de la rockola y el bot (16-nov-2026)

Alcance: bar-nube/rockola (cliente, TV, reproductor), supabase/rockola*.sql, función rockola-buscar, bot de WhatsApp y su conexión con la app del bar. Leí el código en main (commit f9386db), corrí las 31 pruebas del bot (todas pasan) y contrasté con los requisitos que acordamos. No toqué la base real ni probé nada contra Supabase: lo de la base sale de leer el SQL, no de ejecutarlo.

Veredicto corto: la lógica de puntos, precios y cola está bien pensada y bien blindada (candados, libro de movimientos inmutable, reembolso al quitar). Los huecos están en las orillas: la puerta web del cliente se salta toda la economía de puntos, el reproductor es un punto único de falla sin que nadie se entere, y la operación diaria (clasificar artistas, dar puntos) depende de SQL o de que el barman se acuerde.

## Lo que sí cumple lo esperado

- Canción base 8 puntos, ranchera x3, bienvenida 16, máx. 2 en cola por persona, cola de 30, sin repetidas (cooldown 60 min): todo en la base, no en la pantalla.
- Saldo = suma de un libro que solo recibe filas; una factura da puntos una sola vez; quitar una pendiente devuelve los puntos.
- Candado (advisory lock) en pedir y en siguiente: no hay carreras con toques simultáneos.
- Permisos: el anónimo solo llama funciones; el bot gasta puntos con service_role; cortesías solo admin.
- Textos del cliente sin innerHTML (títulos externos van como texto). Sin emojis en el bot.

## Fallas y huecos, por prioridad

### Alta

1. **La web del cliente regala canciones.** rockola_pedir (la que usa /rockola/?mesa=N, y el QR del TV apunta ahí) no cobra puntos, no mira la lista negra y no registra al artista para clasificarlo. El límite de 2 se guarda en un UUID de localStorage: con ventana de incógnito cada cliente tiene 2 más. Resultado: quien no quiere pagar usa el QR, y los puntos y el x3 de ranchera quedan de adorno. El README lo reconoce como pendiente; es el hueco número uno. Opciones: (a) apagar los pedidos de la web y dejar solo WhatsApp (la más simple y coherente con la economía), (b) que la web pida el número y verifique con un código por WhatsApp.
2. **Cualquiera puede escribir lo que quiera en la TV.** La llave anon es pública (está en config.js) y rockola_pedir acepta título, artista y portada arbitrarios sin comprobar que la canción exista en Spotify. Con una llamada directa a la API alguien puede poner un texto ofensivo en el TV del bar, llenar la cola de 30 con basura (con varios cliente distintos) o meter pistas falsas que el reproductor intenta tocar y falla. Se arregla con lo mismo del punto 1: o se cierra la puerta anónima, o el pedido pasa por una Edge Function que valide la pista contra Spotify y no confíe en lo que manda el navegador. También conviene rechazar proveedor distinto de 'spotify' fuera del modo demo.
3. **El reproductor es un punto único de falla y nadie se entera.** Si se cierra la pestaña, el PC se duerme, se cae el WiFi o Spotify pierde la sesión: la cola sigue aceptando pedidos y cobrando puntos, el TV muestra la canción "sonando" para siempre y el barman no ve alarma. No hay latido (heartbeat). Propuesta: el reproductor escribe cada ~10 s una marca de vida; si pasa de 60 s sin ella, la TV y la pestaña Rockola muestran "reproductor desconectado" y los pedidos se pausan solos (o al menos avisan). Mismo problema con el reproductor en segundo plano: el sondeo se salta con document.hidden, así que si la pestaña queda oculta o minimizada no sigue los saltos del barman ni los temporizadores confiables.
4. **Si Spotify falla al tocar una canción, el cliente pierde sus puntos.** En el reproductor, un error al poner la canción llama rockola_saltar, que la marca 'saltada' sin reembolso (el reembolso solo existe en rockola_quitar de pendientes). Caso típico: canción no disponible en CO, token vencido, SDK desconectado. Hay que reembolsar automáticamente cuando la falla es del sistema y no de una decisión del barman (una función aparte, rockola_fallo, o un parámetro en saltar).

### Media

5. **Dar puntos depende de que el barman se acuerde y teclee bien el número.** Hoy se escribe el celular a mano en cada factura; un error de dígito le da los puntos a otra persona y no hay deshacer (solo una cortesía negativa del admin). Mejor idea: que la cuenta impresa o el cobro muestre un código corto y el cliente lo canjee solo en el bot ("canjear 4831"). Así el número lo prueba WhatsApp, no se teclea, no se olvida, y además registra clientes nuevos sin esfuerzo. Es la mejora de más retorno para el negocio.
6. **No hay pantalla para clasificar artistas, géneros ni lista negra.** rockola_clasificar, rockola_generos y rockola_prohibidas solo se tocan por SQL. Los artistas nuevos entran sin género y cuestan el precio base, o sea que una ranchera de un artista desconocido sale al precio de una pop hasta que alguien la clasifique. Falta una vista "por clasificar" en la pestaña Rockola (artista, cuántas veces lo pidieron, selector de género) y un botón "prohibir esta canción". Hay un generos.sql en la carpeta de proyecto que trabaja un hilo aparte: conviene unirlo con esto.
7. **El cliente no puede cancelar su propio pedido** (y recuperar puntos) ni se entera de nada después de pedir: el bot no avisa "tu canción suena ahora", ni "el barman quitó tu canción, te devolví X puntos". Los reembolsos son silenciosos.
8. **Pausar pedidos no pausa la música.** El botón "Pausar pedidos" solo cierra la puerta; la canción actual y la cola siguen. Tampoco hay volumen ni pausa/continuar desde la app del barman (el volumen vive solo en la pestaña del reproductor, en el PC). Para cerrar el bar o bajar el volumen cuando hay una pelea, hay que caminar hasta el PC.
9. **No hay CI en los PR.** El único workflow es pages.yml (publica). Las 31 pruebas del bot y probar.sh (SQL contra un Postgres desechable) no corren solas. Y por la memoria del proyecto, pruebas_roles.sql ya falla en main por la aserción del Águila Light desde el cambio de precio: una suite roja que nadie vio es justo para lo que sirve un CI. Un workflow chiquito que corra node --test y probar.sh en cada PR cuesta poco.
10. **Punto único de falla en el bot.** Un solo celular con Termux, un número que además es el personal del dueño, y modo "solo entre comillas" que el cliente promedio no va a adivinar (mucha gente escribirá sin comillas y sentirá que el bot está muerto: el silencio es indistinguible de una caída). Ayudaría un cartel/QR en el bar que diga el formato exacto, y a mediano plazo un número dedicado. Baileys no es oficial: el riesgo de baneo ya está aceptado, pero no hay plan B si pasa. El plan B natural es la web con login por WhatsApp o un código de mesa.

### Baja

11. El cooldown de repetidas cuenta desde que se pidió, no desde que sonó: una canción pedida a las 10:00 que suena a las 10:50 se puede volver a pedir a las 11:00.
12. Sin tope de cortesías: el admin puede dar o quitar puntos sin límite ni auditoría visible (el libro guarda creado_por, pero no hay pantalla para revisarlo).
13. Sin métricas: canciones más pedidas, puntos emitidos vs gastados, horas pico, ingresos de la rockola. Los datos ya están en el libro; falta una vista para el dueño.
14. rockola_cola crece sin límite (se puede archivar cada tanto; con el volumen de un bar pasan años antes de que moleste).
15. La portada acepta cualquier URL https del cliente anónimo: sirve de rastreador (el TV carga la imagen de un tercero). Se resuelve junto al punto 2.
16. El respaldo: datos de puntos viven solo en Supabase gratis, sin copias descargables. Un libro de dinero (puntos pagados con consumo) merece un volcado semanal.

### Fuera del código, pero toca decirlo

Spotify Premium personal no incluye uso comercial público, y en Colombia un bar que pone música en vivo para clientes normalmente debe tener los permisos de comunicación pública (SAYCO / ACINPRO). Lo digo sin dramatismo: no es un bug, es la visita que no avisa. Con una rockola pagada por los clientes, la exposición es más visible que con una lista de fondo.

## Orden sugerido

1. Cerrar la puerta web anónima (puntos 1 y 2) o convertirla en pedido verificado.
2. Latido del reproductor + reembolso por falla (3 y 4).
3. Canje de puntos por código en la factura (5).
4. Vista del barman para clasificar y prohibir, y controles de música (6 y 8).
5. CI en los PR y arreglar la prueba que ya está roja (9).
6. Avisos del bot al cliente (7), métricas (13).

Nada de esto lo he construido: es el mapa, no el trabajo. Decide qué entra y lo hago por PR.
