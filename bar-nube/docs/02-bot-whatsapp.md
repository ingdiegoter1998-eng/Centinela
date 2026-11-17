# 02 · Bot de WhatsApp: operación y arreglos

Complementa a [`../bot/README.md`](../bot/README.md) (instalación completa, vinculación, servidor Linux). Aquí van los comandos de todos los días.

## Qué es y dónde corre

- Programa Node (`bar-nube/bot/`, librería no oficial **Baileys 6.7.x**) que atiende el WhatsApp de la SIM **310 866 0167**. Ese número es además el WhatsApp personal del dueño, por eso el bot **solo atiende mensajes escritos entre comillas** (`"morat"`), y el número suelto `1`, `2` o `3` durante 3 minutos después de una búsqueda. Todo lo demás lo ignora en silencio.
- Corre en un **Android con Termux** (Node 24), enchufado y con WiFi. El código está en `~/Centinela/bar-nube/bot` dentro de Termux. Configuración en el archivo `.env` de esa carpeta (plantilla: `.env.example`; lleva la llave `service_role`, que nunca se comparte).
- La sesión de WhatsApp vive en la carpeta `auth/` (no se sube, no se borra a la ligera). `numeros.json` recuerda números de clientes con identificador interno (LID).
- Una sola copia a la vez. Hay un candado, `auth.lock`, con el número del proceso que está corriendo: si dos copias comparten sesión se rompen las llaves de cifrado (`Bad MAC`).

## Entrar al celular desde el PC (SSH)

Una vez, en Termux (en el celular): `pkg install openssh`, `passwd` (inventa una clave para SSH) y `sshd`. Cada vez que reinicies el celular hay que volver a abrir Termux y correr `sshd`.

Desde el PC, en la misma red WiFi:

```sh
ssh -p 8022 u0_a450@IP_DEL_CELULAR
```

- Puerto **8022**, usuario **u0_a450** (el usuario de Termux en ese celular; si algún día reinstalan Termux, el nombre cambia: en Termux corre `whoami`).
- La IP del celular: en Termux `ifconfig` (busca `wlan0`, la línea `inet`) o en Ajustes de Android → WiFi → la red → IP. Puede cambiar si el router se reinicia.
- Para preguntarle algo al bot sin SSH, abre la app de Termux en el celular.

## Regla número uno: siempre dentro de tmux

Si arrancas el bot directo en una sesión SSH, cuando la conexión se cae (`client_loop: send disconnect: Connection reset`) el bot muere con ella. Así dejó de contestar a todos el 16-nov-2026. Siempre:

```sh
cd ~/Centinela/bar-nube/bot
tmux new -s bot          # crea la sesión «bot» (si ya existe, te dirá "duplicate session": usa attach)
./start.sh               # arranca el bot y lo reinicia solo si se cae
# Para salir sin matarlo:  Ctrl+B y luego D
tmux attach -t bot       # volver a verlo
tmux ls                  # ver sesiones
```

`start.sh` pide el *wake lock* de Termux (que Android no duerma el proceso) y vuelve a lanzar el bot 10 s después de cada caída. Si el bot termina con código 2 se detiene a propósito: falta configuración o WhatsApp cerró la vinculación; lee el mensaje de arriba.

## Reiniciar bien (el procedimiento que casi siempre arregla)

1. `tmux attach -t bot` y mira el log.
2. Detener: `Ctrl+C` dentro de tmux. (Con `start.sh` en primer plano, Ctrl+C también corta el ciclo de reinicio automático; vuelve a lanzar `./start.sh`.)
3. Comprobar que no quedó nada vivo:
   ```sh
   ps aux | grep "src/index.js" | grep -v grep
   ```
   Si aparece algún proceso, mátalo (el número es la segunda columna, el PID):
   ```sh
   kill PID          # primero así
   kill -9 PID       # solo si no se muere
   ```
   O todo de golpe: `pkill -f "src/index.js"`
4. Borrar el candado viejo si el bot dice «Ya hay otro bot corriendo» y estás seguro de que no hay otro:
   ```sh
   cd ~/Centinela/bar-nube/bot && rm -f auth.lock
   ```
5. `./start.sh` (dentro de tmux).
6. Pruébalo desde **otro número**: `"hola"`. Debe contestar con la bienvenida.

Si sospechas que Android mató Termux: cierra Termux del todo (en la notificación de Termux, toca **EXIT**), ábrelo, `sshd` si lo usas, `tmux ls` (si la sesión sigue, `tmux attach -t bot`; si no, `tmux new -s bot` y `./start.sh`).

## Ctrl+C contra Ctrl+Z

- **Ctrl+C** detiene el programa. Es lo que quieres.
- **Ctrl+Z** NO lo detiene: lo **congela** y lo manda a segundo plano («Stopped»). El proceso sigue existiendo, sigue agarrando el candado `auth.lock` y el bot parece muerto pero no deja arrancar otro («Ya hay otro bot corriendo»). Si lo hiciste por error: `fg` lo trae de vuelta y luego Ctrl+C, o `ps aux | grep src/index.js` y `kill -9 PID`, y `rm -f auth.lock`.

## Cuándo SÍ revincular y cuándo NO

**NO revincules (no hace falta y a veces empeora)** si ves esto, sobre todo en los primeros minutos después de vincular:
`Bad MAC`, `No matching sessions found for message`, `failed to decrypt message`, `error in handling message`, `Timed Out` 408 en `init queries`. Es el cifrado acordando llaves; se arregla solo. Espera 15 minutos y prueba desde otro número.

También NO revincules si solo falla el chat contigo mismo (el chat «Tú»): ese camino es frágil por naturaleza (WhatsApp lo direcciona con número y con LID a la vez y Baileys 6 se confunde). Prueba siempre con otro número, que es lo que usan los clientes.

**Escalera de arreglos, en este orden y parando apenas funcione:**
1. Reiniciar bien (sección anterior).
2. `npm run reparar` con el bot apagado: borra solo las llaves de conversación (`session-*`, `sender-key-*`) y deja la vinculación. Luego `./start.sh`.
3. **Revincular (último recurso):** en el celular de la SIM, WhatsApp → Dispositivos vinculados → cierra la sesión de cada dispositivo del bot (también los de intentos viejos). En Termux: `cd ~/Centinela/bar-nube/bot && rm -rf auth && ./start.sh`, escanea el QR (si se ve cortado, achica la letra pellizcando la pantalla) y **no lo cortes** en un buen rato.

**SÍ revincular** cuando el bot dice «WhatsApp cerró la sesión» y en Dispositivos vinculados ya no aparece.

Historia que explica la regla: una versión anterior del bot borraba las llaves sola ante los primeros `Bad MAC` y le dañó una sesión sana (16-nov, ~2:20 p. m.); por eso ahora el bot solo avisa y nunca borra nada por su cuenta.

## El bot no contesta: diagnóstico

Mira el log (`tmux attach -t bot`) y escribe `"hola"` desde otro número. Cada mensaje uno a uno deja una línea «mensaje recibido: lo atiendo» o «lo ignoro». Cada 10 min sale «sigo vivo» con el estado de la conexión.

| Qué ves | Qué pasa | Qué hacer |
|---|---|---|
| Termux vacío / «Process completed» / la app no está | Android mató el proceso | EXIT en la notificación, abrir Termux, tmux y `./start.sh`. Revisar batería |
| Se cayó el SSH y el bot murió | Corría dentro de la sesión SSH | Siempre en `tmux` (ver arriba) |
| «WhatsApp cerró la sesión» | WhatsApp desvinculó el dispositivo | Revincular |
| «sigo vivo» con `conexion: cerrada` repetido | Sin internet o WhatsApp rechaza | Revisar WiFi; reiniciar |
| «sigo vivo», abierta, y al escribir NO sale «mensaje recibido» | WhatsApp no entrega el mensaje (busca `Bad MAC`) | Reiniciar, esperar 5 min, probar desde otro número |
| «mensaje recibido: lo ignoro» | Faltan las comillas | Escribir `"puntos"` |
| «lo atiendo» pero no contesta | Falló al responder | Buscar «algo falló atendiendo un mensaje» o «no se pudo enviar»: dice la causa (Supabase, Spotify, envío) |
| El bot dice «La búsqueda de canciones está caída por ahora» | Spotify dio 429 | No reiniciar. Se arregla solo (ver 04). Puntos, cola y cancelar siguen funcionando |

Para ver también el estado desde la base (sin tocar el celular): en Supabase → Logs → Edge Logs, la actividad del bot se ve como llamadas a `rockola_mi_estado`. Si llevan horas sin aparecer, el bot no está hablando con la base.

## Qué es ruido en los logs (ignóralo)

- `failed to decrypt message` de `status@broadcast` o de grupos (el bot solo atiende chats uno a uno; desde el PR 44 ya ni se imprimen).
- `Timed Out` (408) en `init queries` al conectar.
- Una racha de `Bad MAC` / `No matching sessions` justo después de vincular o en el chat contigo mismo.
- «Reiniciando conexión» justo al vincular.

Sí importan: «WhatsApp cerró la sesión», «Ya hay otro bot corriendo», «algo falló atendiendo un mensaje», «no se pudo enviar», `conexion: cerrada` repetido, y el aviso del vigilante (30 fallos de descifrado de chats uno a uno en 15 minutos).

## Batería y que no se duerma

1. Ajustes de Android → Apps → **Termux → Batería → Sin restricciones** (Samsung: «Nunca en suspensión»; Xiaomi: «Sin restricciones» + «Inicio automático»). También para Termux:Boot si lo usas.
2. Celular enchufado siempre; WiFi activo en suspensión; Termux fijado (candado) en apps recientes.
3. `./start.sh` ya pide `termux-wake-lock`.
4. Arranque automático tras reiniciar el celular: Termux:Boot (F-Droid), abrirlo una vez, y el script `~/.termux/boot/rockola.sh` descrito en el README del bot.

## Actualizar el bot

```sh
cd ~/Centinela && git pull
cd bar-nube/bot && npm install
tmux attach -t bot   # Ctrl+C y ./start.sh
```
Si `git pull` se queja de sparse-checkout: el clon solo trae `bar-nube/bot` (ver README del bot). Si el repo es privado pide usuario y, de clave, un Personal Access Token de GitHub de solo lectura.

## Variables del `.env` (sin valores)

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secreta), `BOT_NUMBER` (573108660167), `LIMITE_MENSAJES_POR_MINUTO` (12), `LINK_MODE` (qr o codigo), `SOLO_COMILLAS` (1; con 0 atiende todo), `ACEPTAR_PROPIO` (1; con 0 ignora el chat contigo mismo). Después de cambiar el `.env`, reinicia el bot.

## Qué contesta el bot

`"hola"` (ayuda/bienvenida con puntos), `"<canción y artista>"` (3 opciones con precio en puntos), `1`/`2`/`3` (elige), `"puntos"` (saldo), `"cola"` (qué suena y qué sigue), `"cancelar"` (borra la búsqueda en curso; NO quita canciones ya en cola: eso lo hace el barman o el admin desde la app y devuelve los puntos). Quien escribe por primera vez recibe 16 puntos. Orden de validaciones al pedir (importa para entender mensajes raros): rockola activa, canción prohibida, cola llena, máximo 2 pendientes por persona, canción repetida (en cola o sonada hace menos de 60 min) y por último puntos. Por eso con 0 puntos y una canción repetida el mensaje es «ya está en la cola», no «te faltan puntos».

Los textos del bot están en `bot/src/logica.js` (lema en la constante `LEMA`). Pruebas: `cd bot && npm install && node --test`.

## Plan B si Termux no da más

Pasar el bot a un servidor Linux con systemd (Oracle Always Free, pero Bogotá no tiene cupo ARM por ahora; cualquier VPS barato o un PC sirve). Instrucciones en el README del bot. Recomendación: vincular primero desde Termux o un PC y copiar `auth/` al servidor, porque WhatsApp mira con sospecha las IP de centros de datos. Apaga la copia vieja antes de prender la nueva.

## Riesgo aceptado

Baileys es no oficial: WhatsApp puede banear el número, y es el número personal del dueño. El plan B natural es la web con verificación por WhatsApp (ver pendientes) o un número dedicado.
