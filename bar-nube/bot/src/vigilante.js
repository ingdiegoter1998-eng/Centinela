// Vigila el descifrado para AVISAR (nunca actúa): si muchísimos mensajes seguidos de chats uno a uno no se pueden leer durante
// un buen rato y ninguno se lee bien, probablemente la sesión de cifrado está dañada. Los fallos de estados y grupos son normales y no cuentan.

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

// fallo() devuelve true cuando ya son MUCHOS seguidos (`umbral` dentro de `ventanaMs`, sin ningún mensaje bien leído en medio) y
// vuelve a empezar la cuenta: sirve para avisar, nunca para actuar. Tras vincular es normal ver decenas de fallos durante minutos.
export function crearVigilante({ ahora = () => Date.now(), umbral = 30, ventanaMs = 15 * 60_000 } = {}) {
  let fallos = [];
  return {
    fallo() {
      const t = ahora();
      fallos = fallos.filter((x) => t - x <= ventanaMs);
      fallos.push(t);
      if (fallos.length < umbral) return false;
      fallos = [];
      return true;
    },
    ok() { fallos = []; },
    get seguidos() { return fallos.length; },
  };
}
