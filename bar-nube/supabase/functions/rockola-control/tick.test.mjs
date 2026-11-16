// node --test supabase/functions/rockola-control   (sin red: base y Spotify de mentira, con reloj controlado)
import test from 'node:test';
import assert from 'node:assert/strict';
import { tick, elegirDispositivo, VENTANA_ENCOLAR_MS, GRACIA_MS } from './tick.mjs';
import { SpotifyError } from './spotify.mjs';

// ── Base de mentira: misma lógica que rockola_ctl_* en SQL (la cola en memoria) ──
function crearMundo({ cola = [], conectado = true, dispositivos = [{ id: 'cel', name: 'Celular del bafle', type: 'Smartphone', is_active: true }], activo = true } = {}) {
  const m = {
    t: 1_000_000, cola: cola.map((c, i) => ({ id: i + 1, estado: 'pendiente', en_spotify: false, confirmada: false, duracion_ms: 180_000, titulo: c, pista_id: c })),
    reproductor: { conectado, pausada: false, preferido_id: null }, latidos: [], reembolsos: [], llamadas: [],
    sp: { dispositivos, activo, reproduciendo: false, item: null, progreso: 0, cola: [], falla: null, fallaTocar: null },
  };
  const top = () => m.cola.filter((c) => c.estado === 'pendiente')[0] || null;
  const pub = (c) => c && { id: c.id, pista_id: c.pista_id, titulo: c.titulo, duracion_ms: c.duracion_ms, empezo_en: c.empezo ? new Date(c.empezo).toISOString() : null, confirmada: c.confirmada, en_spotify: c.en_spotify };
  m.db = {
    async estado() {
      const s = m.cola.find((c) => c.estado === 'sonando');
      return { sonando: pub(s) || null, siguiente: pub(top()) || null, encolada: pub(m.cola.find((c) => c.estado === 'pendiente' && c.en_spotify)) || null, reproductor: m.reproductor, ahora: new Date(m.t).toISOString() };
    },
    async avanzar(final, id, confirmada) {
      m.llamadas.push(['avanzar', final, id, confirmada]);
      const s = m.cola.find((c) => c.estado === 'sonando'); if (s) s.estado = final;
      let c = id != null ? m.cola.find((x) => x.id === id && x.estado === 'pendiente') : null;
      const conf = !!c && confirmada;
      c = c || top(); if (!c) return null;
      Object.assign(c, { estado: 'sonando', empezo: m.t, confirmada: conf });
      return pub(c);
    },
    async confirmar(id) { const c = m.cola.find((x) => x.id === id); c.confirmada = true; c.empezo = m.t; },
    async devolver(id) { const c = m.cola.find((x) => x.id === id); Object.assign(c, { estado: 'pendiente', confirmada: false }); m.llamadas.push(['devolver', id]); },
    async fallo(id, motivo) { const c = m.cola.find((x) => x.id === id); c.estado = 'fallida'; m.reembolsos.push(id); m.llamadas.push(['fallo', id, motivo]); },
    async encolada(id) { m.cola.find((x) => x.id === id).en_spotify = true; },
    async latido(l) { m.latidos.push(l); },
    async pausa(v) { m.reproductor.pausada = v; },
  };
  const sp = m.sp;
  m.spotify = {
    async estado() {
      if (sp.falla) throw sp.falla;
      const disp = sp.activo ? sp.dispositivos[0] : null;
      return { dispositivo: disp, reproduciendo: sp.reproduciendo, progreso_ms: sp.progreso, item_id: sp.item, item_duracion: sp.item ? (m.cola.find((c) => c.pista_id === sp.item)?.duracion_ms ?? 180_000) : 0 };
    },
    async dispositivos() { return sp.dispositivos; },
    async tocar(id, dev) { m.llamadas.push(['tocar', id, dev]); if (sp.fallaTocar) throw sp.fallaTocar; Object.assign(sp, { item: id, progreso: 0, reproduciendo: true, activo: true }); },
    async encolar(id, dev) { m.llamadas.push(['encolar', id, dev]); sp.cola.push(id); },
  };
  m.tick = () => tick({ db: m.db, sp: m.spotify, ahora: () => m.t });
  // El tiempo pasa y Spotify avanza como avanzaría: sigue su cola o se detiene al final.
  m.pasar = (ms) => {
    m.t += ms;
    if (sp.reproduciendo && sp.item) {
      sp.progreso += ms;
      const dur = m.cola.find((c) => c.pista_id === sp.item)?.duracion_ms ?? 180_000;
      if (sp.progreso >= dur) {
        if (sp.cola.length) { sp.item = sp.cola.shift(); sp.progreso = sp.progreso - dur; } else { sp.reproduciendo = false; sp.progreso = 0; }
      }
    }
  };
  m.estado = (id) => m.cola.find((c) => c.id === id)?.estado;
  return m;
}
const e = (a, b) => assert.equal(a, b);

test('sin cuenta de Spotify no hace nada', async () => {
  const m = crearMundo({ conectado: false, cola: ['a'] });
  e((await m.tick()).accion, 'sin_cuenta'); assert.equal(m.latidos.length, 0);
});

test('cola vacía: inactivo, pero anota el latido', async () => {
  const m = crearMundo();
  e((await m.tick()).accion, 'inactivo');
  assert.deepEqual(m.latidos[0], { dispositivo: 'Celular del bafle', dispositivo_id: 'cel', reproduciendo: false, error: null });
});

test('primer pedido: arranca en el dispositivo activo y queda confirmado', async () => {
  const m = crearMundo({ cola: ['a'] });
  const r = await m.tick();
  e(r.accion, 'tocar'); e(m.estado(1), 'sonando'); assert.deepEqual(m.llamadas.at(-1), ['tocar', 'a', 'cel']);
  assert.equal(m.cola[0].confirmada, true);
});

test('sin dispositivo activo pero con celulares disponibles: lo despierta por id', async () => {
  const m = crearMundo({ cola: ['a'], activo: false, dispositivos: [{ id: 'pc', name: 'PC', type: 'Computer' }, { id: 'cel', name: 'Celular', type: 'Smartphone' }] });
  await m.tick();
  assert.deepEqual(m.llamadas.at(-1), ['tocar', 'a', 'cel']);
});

test('sin ningún dispositivo: la canción espera en la cola y el latido avisa', async () => {
  const m = crearMundo({ cola: ['a'], activo: false, dispositivos: [] });
  e((await m.tick()).accion, 'sin_dispositivo');
  e(m.estado(1), 'pendiente'); assert.match(m.latidos.at(-1).error, /dispositivo/i);
});

test('falla de dispositivo al tocar: vuelve a la cola, sin reembolso', async () => {
  const m = crearMundo({ cola: ['a'] });
  m.sp.fallaTocar = new SpotifyError(404, 'NO_ACTIVE_DEVICE', 'Player command failed: No active device found');
  const r = await m.tick();
  e(r.accion, 'devuelta'); e(m.estado(1), 'pendiente'); assert.equal(m.reembolsos.length, 0);
  assert.match(m.latidos.at(-1).error, /celular del bafle/i);
});

test('canción que Spotify no puede tocar: fallida y con reembolso, y la siguiente arranca después', async () => {
  const m = crearMundo({ cola: ['mala', 'buena'] });
  m.sp.fallaTocar = new SpotifyError(400, '', 'Invalid track uri');
  e((await m.tick()).accion, 'fallo');
  e(m.estado(1), 'fallida'); assert.deepEqual(m.reembolsos, [1]);
  m.sp.fallaTocar = null;
  e((await m.tick()).accion, 'tocar'); e(m.estado(2), 'sonando');
});

test('cuenta sin Premium o con permiso revocado: no se pierde el pedido y el mensaje lo dice', async () => {
  const m = crearMundo({ cola: ['a'] });
  m.sp.fallaTocar = new SpotifyError(403, 'PREMIUM_REQUIRED', 'Premium required');
  e((await m.tick()).tipo, 'cuenta'); e(m.estado(1), 'pendiente'); assert.match(m.latidos.at(-1).error, /Premium|conectarla/);
});

test('Spotify caído o sin red: error en el latido y nada se mueve', async () => {
  const m = crearMundo({ cola: ['a'] });
  m.sp.falla = new SpotifyError(0, 'RED', 'sin red');
  e((await m.tick()).accion, 'error_spotify'); e(m.estado(1), 'pendiente'); assert.match(m.latidos.at(-1).error, /no responde/i);
});

test('sonando normal: no hace nada hasta la ventana final; ahí encola la siguiente, una sola vez', async () => {
  const m = crearMundo({ cola: ['a', 'b'] });
  await m.tick();                                   // arranca a
  m.pasar(60_000); e((await m.tick()).accion, 'sonando'); assert.equal(m.sp.cola.length, 0);
  m.pasar(180_000 - 60_000 - VENTANA_ENCOLAR_MS + 1_000 - 1_000);   // faltan exactamente VENTANA
  e((await m.tick()).accion, 'encolar'); assert.deepEqual(m.sp.cola, ['b']);
  m.pasar(5_000); e((await m.tick()).accion, 'sonando'); assert.deepEqual(m.sp.cola, ['b'], 'no se encola dos veces');
});

test('sin silencio: cuando Spotify pasa a la encolada, la base la alcanza sin volver a tocarla', async () => {
  const m = crearMundo({ cola: ['a', 'b', 'c'] });
  await m.tick(); m.pasar(180_000 - VENTANA_ENCOLAR_MS); await m.tick();            // encola b
  m.pasar(VENTANA_ENCOLAR_MS + 2_000);                                               // a terminó, suena b
  const toques = m.llamadas.filter((l) => l[0] === 'tocar').length;
  e((await m.tick()).accion, 'siguio_sola');
  e(m.estado(1), 'sonada'); e(m.estado(2), 'sonando'); assert.equal(m.cola[1].confirmada, true);
  e(m.llamadas.filter((l) => l[0] === 'tocar').length, toques, 'no se retoca b');
  // y el ciclo sigue: más tarde se encola c
  m.pasar(180_000 - 2_000 - VENTANA_ENCOLAR_MS); e((await m.tick()).accion, 'encolar'); assert.deepEqual(m.sp.cola, ['c']);
});

test('termina la última canción y la cola está vacía: se cierra y queda en silencio', async () => {
  const m = crearMundo({ cola: ['a'] });
  await m.tick(); m.pasar(181_000);
  e((await m.tick()).accion, 'cola_vacia'); e(m.estado(1), 'sonada');
  e((await m.tick()).accion, 'inactivo');
});

test('un pedido que llega con la cola vacía arranca solo', async () => {
  const m = crearMundo({ cola: ['a'] });
  await m.tick(); m.pasar(181_000); await m.tick();
  m.cola.push({ id: 2, estado: 'pendiente', en_spotify: false, confirmada: false, duracion_ms: 100_000, titulo: 'b', pista_id: 'b' });
  e((await m.tick()).accion, 'tocar'); e(m.estado(2), 'sonando');
});

test('Saltar del barman (la base pone la siguiente sonando sin confirmar): se toca de inmediato', async () => {
  const m = crearMundo({ cola: ['a', 'b'] });
  await m.tick(); m.pasar(30_000);
  await m.db.avanzar('saltada', null, false);                 // lo que hace rockola_saltar
  e((await m.tick()).accion, 'tocar'); assert.deepEqual(m.llamadas.at(-1), ['tocar', 'b', 'cel']);
  e(m.estado(1), 'saltada');
});

test('alguien cambia de canción en la app de Spotify: la base lo reconoce y retoma la cola', async () => {
  const m = crearMundo({ cola: ['a', 'b'] });
  await m.tick(); m.pasar(30_000);
  Object.assign(m.sp, { item: 'otra-cosa', progreso: 0 });
  m.pasar(GRACIA_MS + 1);
  e((await m.tick()).accion, 'tocar'); e(m.estado(1), 'saltada'); e(m.estado(2), 'sonando');
});

test('recién arrancada, Spotify aún puede mostrar la anterior: se espera, no se contradice', async () => {
  const m = crearMundo({ cola: ['a', 'b'] });
  await m.tick(); Object.assign(m.sp, { item: 'vieja' }); m.pasar(2_000);
  e((await m.tick()).accion, 'esperando'); e(m.estado(1), 'sonando');
});

test('Spotify se quedó sin nada cargado a mitad de canción (dispositivo dormido): se retoma la misma', async () => {
  const m = crearMundo({ cola: ['a'] });
  await m.tick(); m.pasar(40_000);
  Object.assign(m.sp, { item: null, reproduciendo: false, progreso: 0 });
  e((await m.tick()).accion, 'tocar'); e(m.estado(1), 'sonando'); assert.deepEqual(m.llamadas.at(-1), ['tocar', 'a', 'cel']);
});

test('pausa del panel: congela todo; si alguien reanuda desde Spotify, se entiende', async () => {
  const m = crearMundo({ cola: ['a', 'b'] });
  await m.tick(); m.reproductor.pausada = true; m.sp.reproduciendo = false;
  m.pasar(190_000);
  e((await m.tick()).accion, 'pausada'); e(m.estado(1), 'sonando');
  m.sp.reproduciendo = true; m.sp.progreso = 10_000;
  const r = await m.tick(); assert.notEqual(r.accion, 'pausada'); e(m.reproductor.pausada, false);
});

test('elegirDispositivo: el preferido, luego el activo, luego un celular; ignora los restringidos', () => {
  const l = [{ id: 'pc', type: 'Computer' }, { id: 'tel', type: 'Smartphone' }, { id: 'tv', type: 'TV', is_active: true }, { id: 'x', type: 'Smartphone', is_restricted: true }];
  e(elegirDispositivo(l, 'pc').id, 'pc'); e(elegirDispositivo(l, null).id, 'tv');
  e(elegirDispositivo(l.filter((d) => !d.is_active), null).id, 'tel'); e(elegirDispositivo([], null), null);
});
