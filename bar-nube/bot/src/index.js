// Bot de WhatsApp de la rockola. Se vincula como «dispositivo vinculado» a la SIM del bar con un código de
// 8 caracteres (no hay QR que escanear: el celular del bot es el mismo que tiene la SIM).
// Ojo: Baileys no es oficial; WhatsApp puede banear el número. Por eso: número solo para esto, pocas respuestas,
// pausas cortas «de humano» y límite de mensajes por persona.
import makeWASocketMod, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { crearApi } from './api.js';
import { crearBot } from './logica.js';
import { crearResolvedor, normalizarCelular } from './numero.js';

const makeWASocket = makeWASocketMod.default || makeWASocketMod;
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, BOT_NUMBER } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BOT_NUMBER) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o BOT_NUMBER en el archivo .env (mira .env.example).');
  process.exit(2);          // 2 = no reiniciar (start.sh se detiene)
}

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const api = crearApi({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY });
const resolvedor = crearResolvedor({});
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const alAzar = (a, b) => a + Math.random() * (b - a);

let sock = null;
const jids = new Map();           // celular → jid al que se le responde (el mismo por el que escribió)
const esperandoNumero = new Set(); // jids (LID) a los que ya se les pidió su número

const bot = crearBot({
  api,
  limitePorMinuto: Number(process.env.LIMITE_MENSAJES_POR_MINUTO || 12),
  enviar: async (celular, texto) => {
    const jid = jids.get(celular);
    if (!jid) return;
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await pausa(alAzar(900, 2200));                     // «escribiendo…» como una persona
      await sock.sendMessage(jid, { text: texto });
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { log.error({ err: e.message }, 'no se pudo enviar'); }
  },
});

const textoDe = (m) => m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.ephemeralMessage?.message?.extendedTextMessage?.text || '';

async function alMensaje(m) {
  const jid = m.key.remoteJid;
  if (!jid || m.key.fromMe || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return;   // solo chats uno a uno
  const texto = textoDe(m).trim();
  if (!texto) return;
  const quien = await resolvedor.de(m);
  const nombre = (m.pushName || '').slice(0, 60);

  let celular = quien.celular;
  if (!celular) {   // identificador interno sin número: se le pide una sola vez
    const dicho = normalizarCelular(texto);
    if (dicho && esperandoNumero.has(jid)) { resolvedor.recordar(jid, dicho); esperandoNumero.delete(jid); celular = dicho; }
    else {
      esperandoNumero.add(jid);
      await sock.sendMessage(jid, { text: 'Hola 👋 No alcanzo a ver tu número de celular. Escríbelo aquí (ej: *3001234567*) para guardarte los puntos.' });
      return;
    }
    if (dicho) { jids.set(celular, jid); await bot.manejar({ celular, nombre, texto: 'hola' }); return; }
  }
  jids.set(celular, jid);
  try { await sock.readMessages([m.key]); } catch { /* no es crítico */ }
  await bot.manejar({ celular, nombre, texto });
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa la que trae la librería */ }
  sock = makeWASocket({ auth: state, version, logger: pino({ level: 'warn' }), printQRInTerminal: false, browser: ['Rockola', 'Chrome', '1.0'], markOnlineOnConnect: false });
  resolvedor.ponerSock(sock);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const codigo = await sock.requestPairingCode(BOT_NUMBER);
        console.log(`\n=== CÓDIGO DE VINCULACIÓN: ${codigo} ===\nEn WhatsApp del celular de la SIM: Ajustes → Dispositivos vinculados → Vincular un dispositivo → «Vincular con número de teléfono» y escribe ese código.\n`);
      } catch (e) { log.error({ err: e.message }, 'no pude pedir el código de vinculación'); }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') log.info('Conectado a WhatsApp ✅');
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        log.error('WhatsApp cerró la sesión (o la vinculación se borró). Borra la carpeta auth/ y vuelve a vincular.');
        process.exit(2);
      }
      log.warn({ codigo }, 'Conexión cerrada, reintentando en 5 s…');
      setTimeout(conectar, 5000);
    }
  });
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) alMensaje(m).catch((e) => log.error({ err: e.message }, 'error atendiendo mensaje'));
  });
}

process.on('unhandledRejection', (e) => log.error({ err: String(e) }, 'promesa sin atender'));
conectar();
