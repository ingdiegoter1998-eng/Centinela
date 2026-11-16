// Vigila el descifrado: si muchos mensajes seguidos de chats uno a uno no se pueden leer y ninguno se lee bien, la
// sesión de cifrado está dañada (ver sesion.js). Los fallos de estados y grupos son normales y no cuentan.

const CHAT_UNO_A_UNO = /@(s\.whatsapp\.net|lid)$/;

// ¿Esta llamada al logger de Baileys es «no pude descifrar un mensaje de un chat uno a uno»?
// `args` son los argumentos de logger.error(objeto, 'mensaje').
export function esFalloDeDescifrado(args) {
  const [a, b] = args || [];
  const msg = typeof a === 'string' ? a : b;
  return msg === 'failed to decrypt message' && CHAT_UNO_A_UNO.test(String(a?.key?.remoteJid || ''));
}

// ¿Este mensaje de messages.upsert se pudo leer bien? (los que no se pudieron llegan sin contenido)
export function seLeyoBien(m) {
  return !!m?.message && CHAT_UNO_A_UNO.test(String(m?.key?.remoteJid || ''));
}

// fallo() devuelve true cuando ya son demasiados seguidos (`umbral` dentro de `ventanaMs`, sin ningún mensaje bien leído en medio).
export function crearVigilante({ ahora = () => Date.now(), umbral = 6, ventanaMs = 120_000 } = {}) {
  let fallos = [];
  return {
    fallo() {
      const t = ahora();
      fallos = fallos.filter((x) => t - x <= ventanaMs);
      fallos.push(t);
      return fallos.length >= umbral;
    },
    ok() { fallos = []; },
    get seguidos() { return fallos.length; },
  };
}
