// Saber el celular real de quien escribe. WhatsApp está cambiando a identificadores internos («LID», xxx@lid)
// que no muestran el número; según la versión de Baileys llega o no el número verdadero.
import fs from 'node:fs';

const soloDigitos = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const esNumero = (jid) => /@s\.whatsapp\.net$/.test(String(jid || ''));

export function crearResolvedor({ archivo = 'numeros.json', sock = null } = {}) {
  let guardado = {};
  try { guardado = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { /* primera vez */ }
  const persistir = () => { try { fs.writeFileSync(archivo, JSON.stringify(guardado, null, 1)); } catch { /* sin disco: se pierde al reiniciar */ } };

  return {
    // → { celular } si se sabe, o { lid } si hay que preguntárselo a la persona
    async de(msg) {
      const jid = msg.key.remoteJid;
      if (esNumero(jid)) return { celular: soloDigitos(jid) };
      const alterno = msg.key.remoteJidAlt || msg.key.senderPn || msg.key.participantPn;
      if (esNumero(alterno)) return { celular: soloDigitos(alterno) };
      try {
        const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
        if (esNumero(pn)) return { celular: soloDigitos(pn) };
      } catch { /* esta versión no trae el mapeo */ }
      if (guardado[jid]) return { celular: guardado[jid] };
      return { lid: jid };
    },
    // La persona escribió su número a mano: se le cree (no hay forma de verificarlo con LID), se recuerda.
    recordar(lid, celular) { guardado[lid] = celular; persistir(); },
    ponerSock(s) { sock = s; },
  };
}

// «300 123 4567», «+57 300 123 4567», «573001234567» → «573001234567» (o null)
export function normalizarCelular(texto) {
  const d = String(texto || '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}
