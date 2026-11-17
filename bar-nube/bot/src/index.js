// Bot de WhatsApp de la rockola. Se vincula como «dispositivo vinculado» a la SIM del bar: con un QR en la terminal
// (por defecto) o con un código de 8 caracteres (`--codigo`).
// Ojo: Baileys no es oficial; WhatsApp puede banear el número. Por eso: número solo para esto, pocas respuestas,
// pausas cortas «de humano» y límite de mensajes por persona.
import makeWASocketMod, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { crearApi } from './api.js';
import { crearBot, textoParaElBot } from './logica.js';
import { crearEco } from './eco.js';
import { crearResolvedor, normalizarCelular } from './numero.js';
import { crearVigilante, esFalloDeDescifrado, seLeyoBien } from './vigilante.js';
import { tomarBloqueo } from './bloqueo.js';

const makeWASocket = makeWASocketMod.default || makeWASocketMod;
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, BOT_NUMBER } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BOT_NUMBER) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o BOT_NUMBER en el archivo .env (mira .env.example).');
  process.exit(2);          // 2 = no reiniciar (start.sh se detiene)
}

// Una sola copia del bot: dos procesos con la misma carpeta auth/ se pisan las llaves de cifrado («Bad MAC»).
const bloqueo = tomarBloqueo('auth.lock');
if (!bloqueo.ok) {
  console.error(`Ya hay otro bot corriendo con esta misma sesión (proceso ${bloqueo.pid}). Dos a la vez dañan el cifrado de WhatsApp.\nCierra Termux del todo (en la notificación toca EXIT) o termina ese proceso, y vuelve a arrancar. Si estás seguro de que no hay otro: rm auth.lock`);
  process.exit(2);
}
process.on('exit', () => bloqueo.soltar());
// Ctrl+C / cierre de Termux: suelta el candado y muere por la misma señal (así start.sh también se detiene).
for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(senal, () => { bloqueo.soltar(); process.removeAllListeners(senal); process.kill(process.pid, senal); });

// Cómo vincular el número la primera vez: «qr» (por defecto: se dibuja un QR en la terminal y se escanea desde
// WhatsApp → Dispositivos vinculados → Vincular un dispositivo) o «codigo» (código de 8 caracteres por número de teléfono).
const MODO = process.argv.includes('--codigo') ? 'codigo' : process.argv.includes('--qr') ? 'qr' : String(process.env.LINK_MODE || 'qr').toLowerCase();

// Solo entre comillas (SOLO_COMILLAS, activo por defecto; =0 para apagarlo): el bot únicamente atiende mensajes escritos
// entre comillas, "besos en guerra morat". Así el número puede ser también un WhatsApp personal: lo que la gente escribe
// normalmente se ignora en silencio.
const SOLO_COMILLAS = process.env.SOLO_COMILLAS !== '0';
// Chat contigo mismo (ACEPTAR_PROPIO, activo por defecto; =0 para apagarlo; PRUEBA_PROPIO=1 es el nombre antiguo): atiende lo que
// tú mismo escribes en el chat contigo mismo («Tú» / «Mensajéate»). Lo que escribes a otras personas nunca se atiende.
const ACEPTAR_PROPIO = process.env.ACEPTAR_PROPIO !== '0' || process.env.PRUEBA_PROPIO === '1';
const digitos = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

// Vigilante del descifrado: solo AVISA. Tras vincular, y con mensajes viejos, es normal ver «Bad MAC» y «No matching sessions found»
// durante minutos: Baileys le pide al celular que reenvíe y se arregla solo. NO se borra ni se reinicia nada automáticamente (una
// versión anterior lo hacía y dañó una sesión sana). Si de verdad llevan muchos y largo rato, se dice qué hacer, una vez.
const AUTH = 'auth';
const vigilante = crearVigilante();
function avisoDeDescifrado() {
  console.error(`\nLlevo muchos mensajes seguidos que no puedo descifrar y ninguno bien leído. Casi siempre se arregla solo: dale unos minutos.
Si pasan 15 minutos más sin que lea nada, en este orden (parando en cuanto funcione):
  1. Reiniciar el bot: Ctrl+C y ./start.sh   (si hay otra copia en otro Termux o tmux, ciérrala: dos copias se pisan).
  2. npm run reparar   (borra solo las llaves de conversación; apaga el bot antes) y ./start.sh
  3. Último recurso, vincular de nuevo: WhatsApp > Dispositivos vinculados > cerrar sesión del bot, y rm -rf auth && ./start.sh\n`);
}
const logBaileys = pino({
  level: 'warn',
  hooks: { logMethod(args, method) { if (esFalloDeDescifrado(args) && vigilante.fallo()) avisoDeDescifrado(); return method.apply(this, args); } },
});
const api = crearApi({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY });
const resolvedor = crearResolvedor({});
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const alAzar = (a, b) => a + Math.random() * (b - a);

let sock = null;
// Lo que el propio bot envió (en el chat contigo mismo sus respuestas vuelven como «fromMe»; ver eco.js).
const eco = crearEco();
const enviados = new Map();       // id → contenido de lo que el bot envió: WhatsApp lo pide de vuelta si un celular no pudo abrirlo (getMessage)
const recordarEnvio = (resultado, texto) => {
  eco.registrar(resultado, texto);
  if (resultado?.key?.id && resultado.message) {
    enviados.set(resultado.key.id, resultado.message);
    if (enviados.size > 300) enviados.delete(enviados.keys().next().value);
  }
};
const esEco = (m, texto) => eco.esEco(m, texto);
const esChatPropio = (jid) => {
  const d = digitos(jid);
  return d !== '' && [digitos(sock?.user?.id), digitos(sock?.user?.lid), digitos(BOT_NUMBER)].includes(d);
};
// Para el log: cuándo llegó lo último desde WhatsApp y cómo está la conexión (así se ve si el bot «está mudo» porque no le llega nada,
// porque lo ignora o porque se cayó).
let conexion = 'conectando';
let ultimoMensaje = null;
const jids = new Map();           // celular → jid al que se le responde (el mismo por el que escribió)
const esperandoNumero = new Set(); // jids (LID) a los que ya se les pidió su número

const bot = crearBot({
  api,
  comillas: SOLO_COMILLAS,
  limitePorMinuto: Number(process.env.LIMITE_MENSAJES_POR_MINUTO || 12),
  alFallar: (e, donde) => log.warn({ err: String(e?.message || e), donde }, 'algo falló atendiendo un mensaje (al cliente le llegó un aviso amable)'),
  enviar: async (celular, texto) => {
    const jid = jids.get(celular);
    if (!jid) return;
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await pausa(alAzar(900, 2200));                     // «escribiendo…» como una persona
      recordarEnvio(await sock.sendMessage(jid, { text: texto }), texto);
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { log.error({ err: e.message }, 'no se pudo enviar'); }
  },
});

const textoDe = (m) => m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.ephemeralMessage?.message?.extendedTextMessage?.text || '';

async function alMensaje(m) {
  const jid = m.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return;   // solo chats uno a uno
  const crudo = textoDe(m).trim();
  const propio = esChatPropio(jid);
  if (m.key.fromMe && esEco(m, crudo)) return;                       // eco de una respuesta del bot
  // ¿es para el bot? Sin comillas (si SOLO_COMILLAS) o escrito por mí a otra persona → se ignora (queda una línea en el log).
  // Excepción a las comillas: un «1», «2» o «3» suelto vale si esa persona acaba de recibir opciones de una búsqueda (últimos 3 min).
  const texto = await textoParaElBot(
    { texto: crudo, fromMe: !!m.key.fromMe, propio, soloComillas: SOLO_COMILLAS, aceptarPropio: ACEPTAR_PROPIO },
    async () => { const c = propio ? digitos(BOT_NUMBER) : (await resolvedor.de(m)).celular; return !!c && bot.tieneBusqueda(c); });
  log.info({ de: `…${digitos(jid).slice(-4)}`, propio, fromMe: !!m.key.fromMe }, texto === null ? 'mensaje recibido: lo ignoro (no viene entre comillas, o es tuyo hacia otra persona)' : 'mensaje recibido: lo atiendo');
  if (texto === null) return;
  const nombre = (m.pushName || '').slice(0, 60);

  if (ACEPTAR_PROPIO && propio) {                                     // chat contigo mismo: tu celular es el de la SIM
    const celular = digitos(BOT_NUMBER);
    jids.set(celular, jid);
    await bot.manejar({ celular, nombre, texto });
    return;
  }
  const quien = await resolvedor.de(m);

  let celular = quien.celular;
  if (!celular) {   // identificador interno sin número: se le pide una sola vez
    const dicho = normalizarCelular(texto);
    if (dicho && esperandoNumero.has(jid)) { resolvedor.recordar(jid, dicho); esperandoNumero.delete(jid); celular = dicho; }
    else {
      esperandoNumero.add(jid);
      const aviso = `Hola. No alcanzo a ver tu número de celular. Escríbelo aquí${SOLO_COMILLAS ? ' entre comillas' : ''} (ej: *${SOLO_COMILLAS ? '"3001234567"' : '3001234567'}*) para guardarte los puntos.`;
      recordarEnvio(await sock.sendMessage(jid, { text: aviso }), aviso);
      return;
    }
    if (dicho) { jids.set(celular, jid); await bot.manejar({ celular, nombre, texto: 'hola' }); return; }
  }
  jids.set(celular, jid);
  try { await sock.readMessages([m.key]); } catch { /* no es crítico */ }
  await bot.manejar({ celular, nombre, texto });
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa la que trae la librería */ }
  const s = makeWASocket({
    auth: state, version, logger: logBaileys, printQRInTerminal: false, browser: ['Rockola', 'Chrome', '1.0'], markOnlineOnConnect: false,
    getMessage: async (key) => enviados.get(key?.id),     // si un celular no pudo abrir una respuesta nuestra, WhatsApp la pide de vuelta
  });
  sock = s;
  resolvedor.ponerSock(s);

  if (!s.authState.creds.registered && MODO === 'codigo') {
    setTimeout(async () => {
      try {
        const codigo = await s.requestPairingCode(BOT_NUMBER);
        console.log(`\n=== CÓDIGO DE VINCULACIÓN: ${codigo} ===\nEn WhatsApp del celular de la SIM: Ajustes → Dispositivos vinculados → Vincular un dispositivo → «Vincular con número de teléfono» y escribe ese código.\n`);
      } catch (e) { log.error({ err: e.message }, 'no pude pedir el código de vinculación'); }
    }, 3000);
  }

  s.ev.on('creds.update', saveCreds);
  s.ev.on('connection.update', ({ connection, lastDisconnect, qr, isNewLogin }) => {
    if (s !== sock) return;                    // eventos de una conexión vieja: se ignoran (dos conexiones a la vez dañan el cifrado)
    if (qr && MODO === 'qr') {
      console.log('\n=== ESCANEA ESTE QR (se renueva solo cada ~20 s) ===\nEn WhatsApp del celular de la SIM: Ajustes → Dispositivos vinculados → Vincular un dispositivo, y apunta la cámara a la pantalla.\nSi el dibujo se ve cortado, achica la letra (en Termux: pellizca la pantalla) o ensancha la ventana.\n');
      qrcode.generate(qr, { small: true });
    }
    if (isNewLogin) console.log('\nVinculado. NO lo cortes ni lo reinicies: es normal ver errores de cifrado (Bad MAC, Timed Out) durante varios minutos; déjalo prendido.\n');
    if (connection === 'open') { conexion = 'abierta'; log.info('Conectado a WhatsApp'); }
    if (connection === 'close') {
      conexion = 'cerrada';
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        log.error('WhatsApp cerró la sesión (o la vinculación se borró). Borra la carpeta auth/ y vuelve a vincular.');
        process.exit(2);
      }
      // Justo después de vincular, WhatsApp pide reiniciar la conexión: es normal y se hace de inmediato.
      const espera = codigo === DisconnectReason.restartRequired ? 0 : 5000;
      log.warn({ codigo }, espera ? 'Conexión cerrada, reintentando en 5 s…' : 'Reiniciando conexión (normal tras vincular)…');
      setTimeout(conectar, espera);
    }
  });
  s.ev.on('messages.upsert', ({ messages, type }) => {
    if (s !== sock) return;
    ultimoMensaje = Date.now();
    if (messages.some(seLeyoBien)) vigilante.ok();   // se están leyendo bien: la sesión está sana
    if (type !== 'notify') return;
    for (const m of messages) alMensaje(m).catch((e) => log.error({ err: e.message }, 'error atendiendo mensaje'));
  });
}

log.info({ SOLO_COMILLAS, ACEPTAR_PROPIO }, SOLO_COMILLAS ? 'Solo atiendo mensajes entre comillas.' : 'Atiendo todos los mensajes (SOLO_COMILLAS=0).');
// Latido: una línea cada 10 min para ver en Termux que el proceso sigue vivo y qué le llega.
setInterval(() => {
  const hace = ultimoMensaje ? `${Math.round((Date.now() - ultimoMensaje) / 60_000)} min` : 'nada desde que arrancó';
  log.info({ conexion, ultimoMensajeDeWhatsApp: hace }, 'sigo vivo');
}, 10 * 60_000).unref();
process.on('unhandledRejection', (e) => log.error({ err: String(e) }, 'promesa sin atender'));
conectar();
