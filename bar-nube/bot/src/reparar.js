// `npm run reparar`: borra las llaves de conversación de la sesión (session-*, sender-key-*) y deja la vinculación como está.
// Úsalo si el bot conecta pero no lee ningún mensaje (en el log: «Bad MAC», «No matching sessions found for message»).
// El bot hace lo mismo solo cuando detecta el problema; esto es para forzarlo a mano. Con el bot apagado.
import { limpiarSesiones } from './sesion.js';
import { tomarBloqueo } from './bloqueo.js';

const bloqueo = tomarBloqueo('auth.lock');
if (!bloqueo.ok) {
  console.error(`El bot está corriendo (proceso ${bloqueo.pid}). Apágalo primero (Ctrl+C, o cierra Termux del todo) y vuelve a correr esto.`);
  process.exit(2);
}
const n = limpiarSesiones('auth');
bloqueo.soltar();
console.log(`Listo: borré ${n} archivos de llaves de conversación. La vinculación (creds.json) y el .env quedan intactos.\nArranca el bot con: npm start`);
