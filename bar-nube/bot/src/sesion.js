// Cuidado de la sesión de WhatsApp (la carpeta auth/). Todo aquí es de disco y de reglas simples, sin red ni Baileys,
// para poder probarlo con `node --test`.
//
// El problema que atiende: a veces WhatsApp y el bot quedan con «llaves de cifrado» distintas para hablar entre
// ellos y TODO mensaje falla con «Bad MAC» / «No matching sessions found for message» (el bot nunca llega a leer nada).
// Es la parte de Signal de la vinculación, no de la rockola. La salida, de menos a más drástica:
//   1) borrar las llaves de conversación (session-*.json y sender-key-*) y dejar que se renegocien solas, o
//   2) desvincular el dispositivo en el celular, `rm -rf auth` y vincular otra vez.
import fs from 'node:fs';
import path from 'node:path';

const LLAVES_DE_CONVERSACION = /^(session-|sender-key)/;     // lo que se renegocia solo; creds.json y pre-key-* NO se tocan
const MARCA = 'reparado.json';
export const ESPERA_ENTRE_REPARACIONES_MS = 30 * 60 * 1000;

// Borra las llaves de conversación; conserva creds.json (la identidad del bot: sin ella habría que re-vincular).
export function limpiarSesiones(dir = 'auth') {
  let borrados = 0;
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch { return 0; }
  for (const n of nombres) {
    if (!LLAVES_DE_CONVERSACION.test(n)) continue;
    try { fs.rmSync(path.join(dir, n), { force: true }); borrados++; } catch { /* ya no estaba */ }
  }
  return borrados;
}

export function marcarReparacion(dir = 'auth', ahora = Date.now()) {
  try { fs.writeFileSync(path.join(dir, MARCA), JSON.stringify({ en: ahora })); } catch { /* sin disco: se pierde la marca */ }
}
export function ultimaReparacion(dir = 'auth') {
  try { return Number(JSON.parse(fs.readFileSync(path.join(dir, MARCA), 'utf8')).en) || 0; } catch { return 0; }
}
export function olvidarReparacion(dir = 'auth') {
  try { fs.rmSync(path.join(dir, MARCA), { force: true }); } catch { /* da igual */ }
}

// ¿Qué hacer cuando el descifrado falla en bloque? Primero se limpian las llaves de conversación; si ya se hizo hace poco y
// siguió fallando, limpiar otra vez no sirve: hay que desvincular y vincular de nuevo.
export function decidirReparacion({ ultima, ahora = Date.now(), espera = ESPERA_ENTRE_REPARACIONES_MS }) {
  return !ultima || ahora - ultima > espera ? 'limpiar' : 'revincular';
}
