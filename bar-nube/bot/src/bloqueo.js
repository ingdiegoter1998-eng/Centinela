// Una sola copia del bot a la vez. Dos procesos con la misma carpeta auth/ se pisan las llaves de cifrado y todo
// termina en «Bad MAC». El archivo `auth.lock` guarda el pid del bot que está corriendo.
import fs from 'node:fs';

// ¿Ese pid es un proceso nuestro y vivo? Android/Linux: kill(pid, 0) no mata, solo pregunta; si es de otro usuario
// da EPERM (no es el bot). Si /proc se deja leer, además debe ser un proceso de node (por si el pid se reutilizó).
export function procesoVivo(pid) {
  try { process.kill(pid, 0); } catch { return false; }
  try { return /node/.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch { return true; }
}

export function tomarBloqueo(archivo = 'auth.lock', { pid = process.pid, vivo = procesoVivo } = {}) {
  let otro = 0;
  try { otro = Number(fs.readFileSync(archivo, 'utf8').trim()) || 0; } catch { /* no hay archivo */ }
  if (otro && otro !== pid && vivo(otro)) return { ok: false, pid: otro };
  try { fs.writeFileSync(archivo, String(pid)); } catch { /* sin disco: se sigue sin candado */ }
  return {
    ok: true,
    soltar() { try { if (Number(fs.readFileSync(archivo, 'utf8')) === pid) fs.rmSync(archivo, { force: true }); } catch { /* ya no está */ } },
  };
}
