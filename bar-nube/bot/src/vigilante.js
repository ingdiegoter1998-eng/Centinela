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

// Ruido conocido del logger de Baileys: líneas que salen siempre y asustan sin avisar de nada. No se imprimen:
//  · «failed to decrypt message» de estados (status@broadcast), grupos y canales: el bot solo atiende chats uno a uno.
//  · el 408 «Timed Out» de 'init queries': al conectar, Baileys pide a WhatsApp datos de ajustes y a veces no contesta a tiempo; los
//    mensajes no dependen de eso (en un arranque normal que respondió bien también salió).
// Cualquier otro error (un chat uno a uno que no se descifra, otro código en init queries, desconexiones) sigue saliendo.
const CHAT_QUE_NO_SE_ATIENDE = /^status@broadcast$|@g\.us$|@newsletter$/;
export function esRuidoConocido(args) {
  const [a, b] = args || [];
  const msg = typeof a === 'string' ? a : b;
  if (msg === 'failed to decrypt message') return CHAT_QUE_NO_SE_ATIENDE.test(String(a?.key?.remoteJid || ''));
  if (msg === "unexpected error in 'init queries'") return (a?.err?.output || a?.output)?.statusCode === 408;
  return false;
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
