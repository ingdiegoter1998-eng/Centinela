// Cuidado MANUAL de la sesión de WhatsApp (la carpeta auth/): `npm run reparar`. Disco puro, sin red ni Baileys.
//
// Lección (2026-11-16): el bot llegó a borrar esto solo al ver «Bad MAC», y eso le dañó una sesión que estaba sana. Los
// «Bad MAC» y «No matching sessions found» aparecen en los primeros minutos después de vincular y con mensajes viejos, y Baileys
// los resuelve por su cuenta pidiéndole al celular que reenvíe. Por eso aquí NADA se borra sin que una persona lo pida.
import fs from 'node:fs';
import path from 'node:path';

const LLAVES_DE_CONVERSACION = /^(session-|sender-key)/;     // lo que se renegocia solo; creds.json y pre-key-* NO se tocan

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
