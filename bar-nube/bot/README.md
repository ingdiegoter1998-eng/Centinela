# Bot de WhatsApp de la rockola

El cliente le escribe a la SIM del bar (**317 046 2345**), pide la canción por texto y la paga con puntos.

```
Cliente:  besos en guerra morat
Bot:      Encontré esto:
          1️⃣ Besos en guerra — Morat · 8 puntos
          2️⃣ …
          Responde con el número. Tienes 16 puntos.
Cliente:  1
Bot:      ✅ Besos en guerra quedó en la cola. Va en el puesto 3. Gastaste 8 puntos, te quedan 8.
```

Otros mensajes: `puntos` (saldo), `cola` (qué suena y qué sigue), `cancelar`, `hola` (ayuda). Quien escribe por primera vez
recibe los puntos de bienvenida. Todas las reglas (precio por género, máx. 2 canciones en cola, lista negra, canciones repetidas)
las impone la base de datos, no el bot (`../supabase/rockola_puntos.sql`).

> **Aviso:** esto usa Baileys, una librería **no oficial**. WhatsApp puede banear el número. Por eso: SIM solo para la rockola,
> el bot responde con pausas de «persona escribiendo» y atiende un máximo de mensajes por minuto por cliente.
> Las 10 pruebas de `npm test` cubren la conversación; la conexión real con WhatsApp **no se pudo probar fuera de un celular**:
> sigue la lista «Primera vez» de abajo.

## Dónde puede correr

El bot es un programa de Node que tiene que estar prendido todo el tiempo. Sirve cualquiera de estos lugares (el código es el mismo):

| Lugar | Cuándo conviene |
|---|---|
| **Android con Termux** | Ya lo tienes, es gratis y se puede arrancar hoy. Depende de que el celular siga enchufado y con WiFi. |
| **Servidor Linux (Oracle Cloud Always Free)** | Más estable: no se duerme ni depende del WiFi del bar. Ver «En un servidor Linux». |
| Un PC | Igual que el servidor Linux, o en Windows con Node 22 y `npm start`. |

**Una sola copia a la vez.** Si pasas el bot de un sitio a otro, apaga el anterior (si dos copias usan la misma sesión de WhatsApp se pelean y WhatsApp puede cerrar la vinculación).

## Qué necesitas

- Un lugar donde correrlo (arriba). Para Termux: el Android con **Termux** instalado desde **F-Droid** (la versión de Play Store está vieja y no sirve), enchufado y con WiFi.
- La SIM 317 046 2345 con WhatsApp ya activado en algún celular; el bot se vincula como «dispositivo vinculado», así que ese celular no tiene que ser el que corre el bot.
- Antes de arrancar, en Supabase deben estar aplicados `rockola.sql` y `rockola_puntos.sql`, y desplegada la función `rockola-buscar` con sus secretos de Spotify.
- La llave **service_role** de Supabase (Project Settings → API). Es secreta: da acceso total a la base. Solo va en el `.env` de este celular.

## Instalación en Termux (paso a paso)

En un servidor Linux salta a la sección «En un servidor Linux»; la vinculación del número (siguiente sección) es igual en los dos.

```sh
# 1. Programas
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git tmux

# 2. El código (solo esta carpeta)
git clone --depth 1 --filter=blob:none --sparse https://github.com/ingdiegoter1998-eng/Centinela
cd Centinela
git sparse-checkout set bar-nube/bot
cd bar-nube/bot

# 3. Dependencias
npm install

# 4. Configuración
cp .env.example .env
nano .env          # pega la llave service_role en SUPABASE_SERVICE_KEY (Ctrl+O, Enter, Ctrl+X para guardar)
```

Si el repositorio es privado, `git clone` pide usuario y, como contraseña, un *Personal Access Token* de GitHub con permiso de solo lectura.

## Primera vez (vincular el número)

(En el servidor se hace igual: entra por SSH, ve a la carpeta del bot y ejecuta `npm start`.)

1. `npm start`. A los pocos segundos imprime **«CÓDIGO DE VINCULACIÓN: XXXX-XXXX»**.
2. En WhatsApp del celular de la SIM: **Ajustes → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono**, y escribe el código.
3. El bot imprime «Conectado a WhatsApp ✅». Desde **otro celular**, escríbele `hola` a 317 046 2345. Debe responder con la bienvenida.
4. Prueba: `morat` → elige `1` → `cola`. (Comprueba en `rockola/player.html` o en el TV que la canción entró.)
5. Corta con `Ctrl+C`: ya quedó vinculado (la sesión vive en la carpeta `auth/`, no la borres ni la subas).

## Dejarlo prendido 24/7 (en Termux)

Android mata las apps en segundo plano para ahorrar batería; esto es lo que lo evita:

1. En Termux: `tmux new -s bot` y dentro `./start.sh` (adquiere el *wake lock* y reinicia el bot si se cae). Sal de tmux con `Ctrl+B` y luego `D`; para volver, `tmux attach -t bot`.
2. Ajustes de Android → Apps → **Termux → Batería → Sin restricciones** (en Samsung: «No optimizar»/«Nunca en suspensión»; en Xiaomi: «Sin restricciones» y activar «Inicio automático»).
3. Deja el celular **enchufado**, con el WiFi siempre activo en suspensión, y fija Termux en las apps recientes (candado).
4. Para que arranque solo cuando se reinicie el celular: instala **Termux:Boot** desde F-Droid, ábrelo una vez y crea el archivo `~/.termux/boot/rockola.sh`:
   ```sh
   mkdir -p ~/.termux/boot
   printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\ncd ~/Centinela/bar-nube/bot && tmux new -d -s bot ./start.sh\n' > ~/.termux/boot/rockola.sh
   chmod +x ~/.termux/boot/rockola.sh
   ```

## En un servidor Linux (Oracle Cloud Always Free u otro)

Probado en papel con Ubuntu 22.04/24.04; sirve la máquina ARM (Ampere A1) o la AMD pequeña, ambas gratis. El bot gasta muy poco.

```sh
# 1. Node 22 y git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. El código (solo esta carpeta)
git clone --depth 1 --filter=blob:none --sparse https://github.com/ingdiegoter1998-eng/Centinela
cd Centinela && git sparse-checkout set bar-nube/bot && cd bar-nube/bot
npm install
cp .env.example .env && nano .env     # llave service_role en SUPABASE_SERVICE_KEY

# 3. Vincular el número (una vez): npm start, escribir el código en WhatsApp, Ctrl+C al ver «Conectado»
npm start

# 4. Dejarlo como servicio: arranca con la máquina y se reinicia solo si se cae
sudo cp deploy/rockola-bot.service /etc/systemd/system/
sudo nano /etc/systemd/system/rockola-bot.service    # ajusta User= y las rutas si no usas «ubuntu»
sudo systemctl daemon-reload && sudo systemctl enable --now rockola-bot
journalctl -u rockola-bot -f                           # ver qué pasa
```

El servidor no necesita abrir ningún puerto: el bot solo hace conexiones hacia afuera.

**Ojo con las IP de servidores:** WhatsApp mira con más sospecha a las cuentas que se conectan desde una IP de centro de datos (como la de Oracle) que desde un celular en un WiFi normal. Si la vinculación falla o el número termina limitado, hay una salida: vincular **primero desde Termux o un PC** en el bar y copiar la carpeta `auth/` al servidor, y apagar la copia de origen. Mejor aún, empezar con Termux y pasarlo al servidor cuando ya esté funcionando y el número tenga historial.

## Actualizar y mantener

- Actualizar: `cd ~/Centinela && git pull && cd bar-nube/bot && npm install`, y reiniciar (Termux: `tmux attach -t bot`, `Ctrl+C`; `start.sh` lo vuelve a levantar solo. Servidor: `sudo systemctl restart rockola-bot`).
- Pasar de un sitio a otro: apaga el viejo, copia la carpeta `auth/` y el `.env` al nuevo y arráncalo. No tengas los dos prendidos.
- Si WhatsApp cierra la sesión («cerró la sesión»): `rm -r auth` y repetir «Primera vez».
- Ver qué pasa: `tmux attach -t bot`. Más detalle: `LOG_LEVEL=debug ./start.sh`.

## Cosas a tener en cuenta

- **Números «LID».** WhatsApp está cambiando a identificadores internos que no muestran el celular. Si el bot no puede ver el número de quien escribe, le pide que lo escriba una vez (`3001234567`) y lo recuerda en `numeros.json`. Ese número no se puede verificar: alguien podría escribir el de otra persona. Es un riesgo aceptado para un bar; si molesta, se cambia por un código de verificación.
- Los puntos por consumo los da el barman al cobrar, con ese mismo celular (`57` + número). Si el cliente escribe desde otro número, no verá sus puntos.
- El bot solo atiende chats uno a uno; ignora grupos, estados y canales.
