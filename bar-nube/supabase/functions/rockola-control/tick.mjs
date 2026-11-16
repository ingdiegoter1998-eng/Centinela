// El DJ de la rockola. Cada pocos segundos mira qué hace Spotify y qué dice la base, y decide: tocar la siguiente,
// dejarla encolada antes de que acabe la actual (sin silencios), o reconocer que alguien cambió de canción a mano.
// Es una función pura de sus dependencias: `db` (la base) y `sp` (Spotify) llegan por parámetro, así se prueba
// entera con `node --test` sin red. La función de borde (index.ts) solo las conecta a las de verdad.
import { clasificar } from './spotify.mjs';

export const VENTANA_ENCOLAR_MS = 20_000;   // cuánto antes del final se deja encolada la siguiente (el cron late cada ~5 s)
export const GRACIA_MS = 8_000;             // tras arrancar una canción, Spotify tarda en reflejarlo: no se la contradice
export const MIN_SONANDO_MS = 5_000;        // antes de esto, «detenida en 0» es el arranque, no el final
export const MARGEN_FINAL_MS = 15_000;      // «detenida en 0» a más de esto del final no es que terminó: nunca arrancó
export const REANUDAR_CADA_MS = 15_000;     // si Spotify sigue en pausa, se le insiste a este ritmo (no cada tick)

export function elegirDispositivo(lista, preferidoId) {
  const libres = (lista || []).filter((d) => !d.is_restricted);
  return libres.find((d) => d.id === preferidoId) || libres.find((d) => d.is_active)
    || libres.find((d) => /smartphone|tablet/i.test(d.type || '')) || libres[0] || null;
}

const MENSAJES = {
  dispositivo: 'Spotify no encuentra el celular del bafle. Ábrelo en Spotify (con la pantalla encendida un momento).',
  cuenta: 'La cuenta de Spotify no es Premium o hay que volver a conectarla desde el panel del reproductor.',
  espera: 'Spotify no responde ahora (red o límite). Reintento solo.',
};
// Solo para errores de Spotify (los demás, p. ej. de la base, se dejan con su propio mensaje).
export const textoError = (err) => (err && err.status !== undefined ? MENSAJES[clasificar(err)] || null : null);

// `memoria` (opcional) es un objeto que el llamador conserva entre ticks: sirve para no insistir con «reanudar» cada 5 s.
export async function tick({ db, sp, ahora = Date.now, log = () => {}, memoria = {} }) {
  const e = await db.estado();
  if (!e.reproductor?.conectado) return { accion: 'sin_cuenta' };

  // 1) ¿Qué ve Spotify, y en qué dispositivo se puede tocar?
  let st, disp;
  try {
    st = await sp.estado();
    disp = st.dispositivo;
    if (!disp) disp = elegirDispositivo(await sp.dispositivos(), e.reproductor.preferido_id);
  } catch (err) {
    await db.latido({ error: textoError(err) || String(err.message || err) });
    return { accion: 'error_spotify', tipo: clasificar(err) };
  }
  if (!disp) {
    await db.latido({ error: 'No hay ningún dispositivo con Spotify abierto. Abre Spotify en el celular del bafle.' });
    return { accion: 'sin_dispositivo' };
  }
  await db.latido({ dispositivo: disp.name, dispositivo_id: disp.id, reproduciendo: !!st.reproduciendo, error: null });

  // 2) Pausa del panel: no se toca nada (si alguien reanuda desde la app de Spotify, se entiende y se sigue).
  if (e.reproductor.pausada) {
    if (!st.reproduciendo) return { accion: 'pausada' };
    await db.pausa(false);
  }

  const s = e.sonando, sig = e.siguiente;

  // Poner a sonar `c` (ya marcada «sonando» en la base). Si no se puede, la base queda coherente.
  async function arrancar(c) {
    try {
      await sp.tocar(c.pista_id, disp.id);
      await db.confirmar(c.id);
      return { accion: 'tocar', id: c.id };
    } catch (err) {
      const tipo = clasificar(err);
      log('no pude tocar', c.titulo, tipo, err.message);
      if (tipo === 'pista') { await db.fallo(c.id, err.message || 'Spotify no pudo tocarla'); return { accion: 'fallo', id: c.id }; }
      await db.devolver(c.id);                                   // el problema no es de la canción: vuelve a su puesto
      await db.latido({ dispositivo: disp.name, dispositivo_id: disp.id, error: textoError(err) || String(err.message || err) });
      return { accion: 'devuelta', id: c.id, tipo };
    }
  }
  // Cierra la actual (si hay) y arranca la siguiente de la cola.
  async function pasarALaSiguiente(final, id, confirmada) {
    const nueva = await db.avanzar(final, id ?? null, !!confirmada);
    if (!nueva) return { accion: 'cola_vacia' };
    if (nueva.confirmada) return { accion: 'siguio_sola', id: nueva.id };
    return arrancar(nueva);
  }

  // 3) Nada sonando en la base: si hay pedidos, empieza la cola.
  if (!s) return sig ? pasarALaSiguiente('sonada') : { accion: 'inactivo' };

  // 4) La base dice «sonando» pero Spotify no lo sabe (la puso el botón Saltar, o se recargó todo): se toca ahora.
  if (!s.confirmada) return arrancar(s);

  // 5) Sonando y confirmada: ¿sigue siendo esa la que toca Spotify?
  const transcurrido = ahora() - Date.parse(s.empezo_en);
  if (st.item_id === s.pista_id) {
    const dur = st.item_duracion || s.duracion_ms || 0;
    // Detenida en 0 y lejos del final: el celular nunca la arrancó (dormido, Bluetooth), no es que haya terminado.
    const nuncaArranco = st.progreso_ms === 0 && dur > 0 && transcurrido < dur - MARGEN_FINAL_MS;
    const termino = !st.reproduciendo && !nuncaArranco && (st.progreso_ms === 0 || (dur > 0 && st.progreso_ms >= dur - 1500)) && transcurrido > MIN_SONANDO_MS;
    if (termino) return pasarALaSiguiente('sonada');
    // Spotify en pausa sin que nadie la pausara desde el panel (la pausa del panel ya salió arriba): el DJ la reanuda.
    if (!st.reproduciendo && transcurrido > GRACIA_MS) {
      if (ahora() - (memoria.reanudo_en || 0) < REANUDAR_CADA_MS) return { accion: 'sonando' };
      memoria.reanudo_en = ahora();
      try { await sp.reanudar(disp.id); return { accion: 'reanudo', id: s.id }; }
      catch (err) {
        log('no pude reanudar', err.message);
        await db.latido({ dispositivo: disp.name, dispositivo_id: disp.id, reproduciendo: false, error: textoError(err) || String(err.message || err) });
        return { accion: 'reanudar_fallo', id: s.id, tipo: clasificar(err) };
      }
    }
    if (st.reproduciendo && sig && !e.encolada && dur > 0 && dur - st.progreso_ms <= VENTANA_ENCOLAR_MS) {
      try { await sp.encolar(sig.pista_id, disp.id); await db.encolada(sig.id); return { accion: 'encolar', id: sig.id }; }
      catch (err) { log('no pude encolar', sig.titulo, err.message); return { accion: 'encolar_fallo', id: sig.id }; }
    }
    return { accion: 'sonando' };
  }

  // Suena otra cosa. Si es la que dejamos encolada, Spotify siguió solo: la base la alcanza sin volver a tocarla.
  if (e.encolada && st.item_id === e.encolada.pista_id) return pasarALaSiguiente('sonada', e.encolada.id, true);
  if (transcurrido < GRACIA_MS) return { accion: 'esperando' };

  const acabo = transcurrido >= (s.duracion_ms || 0);
  // Spotify no tiene nada cargado y la canción no había terminado: se cayó el dispositivo; se retoma la misma.
  if (!st.item_id && !acabo) return arrancar(s);
  // Alguien cambió de canción desde Spotify (o terminó y siguió con otra cosa): la base lo reconoce y la rockola retoma.
  return pasarALaSiguiente(acabo ? 'sonada' : 'saltada');
}
