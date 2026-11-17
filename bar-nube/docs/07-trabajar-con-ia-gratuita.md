# 07 · Trabajar con una IA gratuita (sin agente, copiando y pegando)

Una IA de chat gratis no ve el repositorio, no ejecuta nada y se olvida de todo al cerrar la conversación. Tú eres sus ojos y sus manos. Esta guía asume eso.

## Reglas para no romper el bar

1. **Nunca le pegues claves.** Ni la `service_role`, ni el token de Supabase, ni el `.env` del bot, ni el Client Secret de Spotify, ni las claves de `diego` y `barman`. Si un archivo las tiene, bórralas antes de pegar. La llave `anon` de `config.js` es pública; aun así no hace falta pegarla.
2. **Un cambio chico por vez.** Pídele una cosa, pruébala, súbela, y recién ahí la siguiente.
3. **Ella inventa.** Las IA gratis a veces inventan nombres de columnas, funciones o librerías. Por eso hay que pegarle el archivo real, no describirlo.
4. **Nunca corras en la base real un SQL que no entiendas.** Prohíbe `drop`, `truncate` y `delete from facturas|lineas`. Todo `UPDATE` y `DELETE` con `WHERE` (ver 03).
5. **Los cambios en la base y en las Edge Functions no se arreglan con git.** Un merge no los despliega y un revert no los deshace. Anota qué pegaste en Supabase y cuándo.

## Qué archivos pegarle según el problema

Pega siempre primero [`08-referencia-tecnica.md`](08-referencia-tecnica.md) (es el resumen del sistema, pensado para esto) y luego los archivos de la fila. Los pesos son aproximados: 4 KB ≈ 1.000 tokens; si el chat tiene poco contexto, pega solo la función o el trozo que cambia.

| Problema | Pégale |
|---|---|
| La app de ventas hace algo raro en pantalla (botón, texto, formato) | `bar-nube/app.js` (50 KB; si no cabe, solo el trozo cerca de lo que ves) y `app.css` si es de estilo |
| Un número de dinero, stock, cobro o factura sale mal | `supabase/schema.sql` (24 KB) y la función SQL concreta |
| El panel `/bar/admin/` (reportes, comisión) | `admin/admin.js` (58 KB: pega el trozo de esa pestaña) y `supabase/admin.sql` (la función que alimenta esa pestaña) |
| El bot no entiende algún mensaje o responde mal | `bot/src/logica.js` (12 KB) y `bot/test/logica.test.js` |
| El bot se desconecta o no recibe | NO le pegues código: pégale el log (sin números de teléfono si no quieres) y esta doc [02](02-bot-whatsapp.md) |
| Una regla de puntos o de precio | `supabase/rockola_puntos.sql` (19 KB) y [05](05-decisiones-de-negocio.md) |
| La música no suena o rechaza pedidos | `supabase/functions/rockola-control/tick.mjs` (7 KB), `supabase/rockola_control.sql` (17 KB), el resultado de `select * from rockola_reproductor;` y [04](04-rockola-spotify-y-artistas.md) |
| La búsqueda de canciones o la clasificación de géneros | `functions/rockola-buscar/index.ts` (10 KB) y `clasificar.mjs` (9 KB) |
| La TV | `rockola/tv.js` (11 KB), `tv.css`, `tv.html` |
| La página del cliente (QR) | `rockola/index.html`, `rockola.js`, `comun.js` |
| Agregar un producto, cambiar un precio | Nada de código: hazlo en la app (Catálogo). Después refleja el cambio en `supabase/catalogo.sql` para que un re-aplicado no lo revierta |
| Quiero una función nueva (reporte, botón, aviso) | `08`, la doc de esa pieza (01 a 05), y los archivos de esa pieza |

## Plantillas de prompt

Cópialas, reemplaza lo que va entre `[ ]` y pega los archivos debajo.

**Arreglar algo:**
```
Eres mi ayudante de programación. Tengo una app de un bar (HTML + JavaScript sin build, Supabase Postgres, Edge Functions en Deno, un bot de Node con Baileys). No puedes ver mi repo; te pego lo necesario.
Contexto del sistema: [pega 08-referencia-tecnica.md]
Problema: [qué ves, qué esperabas, qué pasa en realidad, desde cuándo].
Archivo(s) relevante(s): [pega].
Reglas: cambia lo mínimo, no reescribas el archivo entero, no cambies nombres de tablas ni de funciones, no agregues librerías, no uses emojis en textos, responde en español.
Dame: (1) qué crees que pasa y por qué, (2) el cambio exacto en formato «busca este texto -> reemplázalo por este», (3) cómo lo pruebo.
Si te falta información, pregúntame antes de inventar.
```

**Cambio de SQL en producción:**
```
Necesito un cambio en una base Postgres de Supabase en producción. Tiene pg_safeupdate: todo UPDATE y DELETE necesita WHERE. Contexto: [pega 08]. El archivo SQL actual: [pega]. Quiero: [cambio].
Entrégame el SQL IDEMPOTENTE (se puede correr dos veces sin daño), sin DROP, sin TRUNCATE, sin borrar datos, que no toque las tablas facturas ni lineas salvo que te lo pida, y con un SELECT de verificación al final. Explícame en 3 líneas qué hace antes del SQL.
```

**Entender un error:**
```
Este es el error que sale [en la consola del navegador / en el log del bot / en los logs de la función]: [pega, quitando claves y números]. Contexto: [pega la sección del doc que aplique]. ¿Qué lo causa y cuáles son las 3 causas más probables, de la más a la menos probable, y cómo compruebo cada una sin romper nada?
```

**Cambiar un precio, regla o texto:** primero mira si se hace sin código (precio en Catálogo; puntos en `rockola_config`; frases en `frases.json`; comisión en panel → Trabajador).

**Que me explique el código:**
```
Explícame este archivo como a alguien que sabe poco de programación: qué hace cada función, en qué orden se llaman y qué tablas toca. [pega]
```

**Revisar lo que me dio otra IA:**
```
Revisa este cambio buscando errores: nombres que no existan, UPDATE o DELETE sin WHERE, SQL que borre datos, claves pegadas, o algo que rompa lo que ya funciona. [pega el cambio y el archivo original]
```

## Cómo probar ANTES de subir a main (no hay CI local)

«Subir a main» publica la web al instante (en 1 a 3 minutos) y es lo que usa el bar esa noche. Prueba así, de menos a más riesgo:

1. **Sintaxis y pruebas automáticas** (en tu PC, con Node 22 instalado):
   ```sh
   cd bar-nube/bot && npm install && node --test              # bot
   cd .. && node --test supabase/functions/rockola-control/*.test.mjs supabase/functions/rockola-buscar/*.test.mjs supabase/sin_where.test.mjs
   ```
   Si tocas un `.js` de la web: `node --check archivo.js` detecta errores de sintaxis.
2. **SQL:** `supabase/probar.sh` levanta un Postgres desechable y corre todo (necesita PostgreSQL instalado: en Linux o WSL `sudo apt install postgresql`). Si no puedes, el PR ejecuta lo mismo en GitHub Actions (siguiente punto). Recuerda que esta prueba NO detecta `UPDATE` sin `WHERE`; `sin_where.test.mjs` sí.
3. **Abrir un Pull Request en vez de subir directo a main.** GitHub corre solo las 3 pruebas (`Bot de WhatsApp`, `Controlador de Spotify`, `Reglas SQL`): en la página del PR sale una marca verde o roja. **No hagas merge con rojo.** Para abrir un PR sin tener git: en github.com abre el archivo → lápiz (editar) → pega el cambio → «Commit changes» → elige «Create a new branch and start a pull request».
4. **Ver la web antes de publicarla** (solo para HTML/JS/CSS): en la carpeta `bar-nube/` corre `python3 -m http.server 8000` y abre `http://localhost:8000/`. OJO: `config.js` apunta a la base REAL, así que lo que hagas ahí (cobrar, pedir) afecta datos reales. Mira pantallas, no hagas ventas de prueba. Para probar escribiendo de verdad, crea un segundo proyecto gratis en Supabase, aplica los SQL en el orden de 03 más `datos_demo.sql`, y cambia `config.js` en tu copia local (nunca subas ese cambio).
5. **Después del merge**, abre la app en un celular y verifica lo que tocaste. Si Pages falló: GitHub → Actions → «Desplegar sitio».
6. **Deshacer:** en GitHub → Pull requests → el PR mergeado → «Revert». Crea otro PR que lo deshace; mergéalo. Esto sirve para la web y el bot. SQL y funciones ya desplegadas hay que volverlas a poner a mano.

## Hábitos que ahorran dolor

- Después de cada sesión con la IA, anota en un archivo (aunque sea en el celular) qué pegaste en Supabase y qué archivos cambiaste.
- Antes de pegar SQL grande en producción, haz un respaldo (CSV de `facturas`, `lineas`, `rockola_puntos`).
- Si la IA propone «recrear la tabla» o «migrar», para y pregunta cuál es la alternativa mínima.
- Si no sabes algo del sistema, busca primero en estos documentos con Ctrl+F.
- Para cosas de operación diaria (reiniciar el bot, conectar Spotify, rotar claves) NO necesitas IA: están los pasos exactos en 02, 03 y 04.
