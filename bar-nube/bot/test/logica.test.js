import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBot, limpiarBusqueda, mensajeDeError, entreComillas, paraElBot, LEMA } from '../src/logica.js';
import { normalizarCelular } from '../src/numero.js';

function montar({ registrado = true, saldo = 16, encola = 0, resultados, costo = 8, comillas = false } = {}) {
  const enviados = []; const pedidos = []; const estado = { registrado, saldo, en_cola: encola, max_pendientes: 2 };
  let reloj = 1_000_000;
  const api = {
    buscar: async () => resultados ?? [
      { proveedor: 'spotify', pista_id: 'a', titulo: 'Besos en guerra', artista: 'Morat', artista_ids: ['m'] },
      { proveedor: 'spotify', pista_id: 'b', titulo: 'El Rey', artista: 'Vicente Fernández', artista_ids: ['v'] }],
    precio: async (_p, ids) => (ids[0] === 'v' ? 24 : costo),
    miEstado: async () => ({ ...estado }),
    registrar: async () => { estado.registrado = true; return 16; },
    estado: async () => ({ activa: true, sonando: { titulo: 'La Tortura', artista: 'Shakira', nombre: 'Luis', mesa: '4' }, cola: [{ id: 7, titulo: 'X', artista: 'Y', nombre: 'Camila', mesa: '' }] }),
    pedir: async (cel, nombre, p) => {
      pedidos.push([cel, p.pista_id]);
      const c = p.pista_id === 'b' ? 24 : costo;
      if (estado.saldo < c) throw new Error(`Te faltan ${c - estado.saldo} puntos (cuesta ${c}, tienes ${estado.saldo})`);
      estado.saldo -= c; return { id: 7, costo: c, saldo: estado.saldo };
    },
  };
  const bot = crearBot({ api, enviar: async (c, t) => enviados.push(t), ahora: () => reloj, limitePorMinuto: 5, comillas });
  return { bot, enviados, pedidos, estado, avanzar: (ms) => { reloj += ms; } };
}
const dec = (celular = '573001112233') => ({ celular, nombre: 'Camila Pérez' });

test('limpiarBusqueda quita muletillas', () => {
  assert.equal(limpiarBusqueda('Ponme la canción besos en guerra de morat por favor'), 'besos en guerra de morat');
  assert.equal(limpiarBusqueda('hola quiero escuchar Gasolina'), 'Gasolina');
  assert.equal(limpiarBusqueda('  pon   morat  '), 'morat');
});

test('buscar muestra opciones con precio y elegir pide con puntos', async () => {
  const { bot, enviados, pedidos } = montar();
  await bot.manejar({ ...dec(), texto: 'besos en guerra morat' });
  assert.match(enviados.at(-1), /1\) Besos en guerra — Morat · 8 puntos/);
  assert.match(enviados.at(-1), /2\) El Rey — Vicente Fernández · 24 puntos/);
  assert.match(enviados.at(-1), /Tienes 16 puntos/);
  await bot.manejar({ ...dec(), texto: '1' });
  assert.deepEqual(pedidos, [['573001112233', 'a']]);
  assert.match(enviados.at(-1), /Besos en guerra.*quedó en la cola/);
  assert.match(enviados.at(-1), /Gastaste 8 puntos, te quedan 8 puntos/);
});

test('sin puntos suficientes el mensaje dice cuánto falta y no pide', async () => {
  const { bot, enviados } = montar();
  await bot.manejar({ ...dec(), texto: 'el rey vicente' });
  await bot.manejar({ ...dec(), texto: '2' });
  assert.match(enviados.at(-1), /Te faltan 8 puntos \(cuesta 24, tienes 16\)/);
});

test('un número sin búsqueda previa, o vencida, no hace nada raro', async () => {
  const { bot, enviados, pedidos, avanzar } = montar();
  await bot.manejar({ ...dec(), texto: '2' });
  assert.match(enviados.at(-1), /ya venció|Escríbeme otra vez/);
  await bot.manejar({ ...dec(), texto: 'morat' });
  avanzar(6 * 60 * 1000);
  await bot.manejar({ ...dec(), texto: '1' });
  assert.match(enviados.at(-1), /ya venció/);
  assert.equal(pedidos.length, 0);
});

test('primer mensaje: bienvenida con los puntos y luego atiende lo que escribió', async () => {
  const { bot, enviados } = montar({ registrado: false });
  await bot.manejar({ ...dec(), texto: 'morat besos en guerra' });
  assert.equal(enviados.length, 2);
  assert.match(enviados[0], /Hola Camila.*16 puntos\* de bienvenida/s);
  assert.match(enviados[1], /Encontré esto/);
});

test('hola da la ayuda; puntos, cola y cancelar funcionan', async () => {
  const { bot, enviados } = montar({ saldo: 5, encola: 1 });
  await bot.manejar({ ...dec(), texto: 'Hola!' });
  assert.match(enviados.at(-1), /Rockola del Callejón del Gato/);
  await bot.manejar({ ...dec(), texto: 'Puntos' });
  assert.match(enviados.at(-1), /Tienes \*5 puntos\*.*1 canción en cola \(máximo 2\)/);
  await bot.manejar({ ...dec(), texto: 'cola' });
  assert.match(enviados.at(-1), /Suena: \*La Tortura\* — Shakira \(Luis, mesa 4\)/);
  assert.match(enviados.at(-1), /1\. X — Y \(Camila\)/);
  await bot.manejar({ ...dec(), texto: 'morat' });
  await bot.manejar({ ...dec(), texto: 'cancelar' });
  assert.match(enviados.at(-1), /cancelado/);
});

test('sin resultados avisa; errores técnicos no se muestran crudos', async () => {
  const a = montar({ resultados: [] });
  await a.bot.manejar({ ...dec(), texto: 'asdfgh' });
  assert.match(a.enviados.at(-1), /No encontré nada con «asdfgh»/);
  assert.equal(mensajeDeError(new Error('TypeError: fetch failed')), 'Uy, ahora no puedo hablar con la rockola. Intenta en un momentico.');
  assert.match(mensajeDeError(new Error('permission denied for function rockola_pedir_puntos')), /mal configurado/);
  assert.equal(mensajeDeError(new Error('Ya tienes 2 canciones en cola, espera a que suene alguna')), 'Ya tienes 2 canciones en cola, espera a que suene alguna');
});

test('anti-spam: pasado el límite avisa una vez y luego calla', async () => {
  const { bot, enviados, avanzar } = montar();
  for (let i = 0; i < 5; i++) await bot.manejar({ ...dec(), texto: 'cola' });
  assert.equal(enviados.length, 5);
  await bot.manejar({ ...dec(), texto: 'cola' });
  assert.match(enviados.at(-1), /muy rápido/);
  await bot.manejar({ ...dec(), texto: 'cola' });
  assert.equal(enviados.length, 6, 'no responde más mientras siga pasado');
  avanzar(61_000);
  await bot.manejar({ ...dec(), texto: 'cola' });
  assert.equal(enviados.length, 7, 'pasado el minuto vuelve a atender');
});

test('las personas no se mezclan: cada celular tiene sus opciones', async () => {
  const { bot, pedidos } = montar();
  await bot.manejar({ celular: '573001111111', nombre: 'A', texto: 'morat' });
  await bot.manejar({ celular: '573002222222', nombre: 'B', texto: '1' });   // B no buscó nada
  assert.equal(pedidos.length, 0);
  await bot.manejar({ celular: '573001111111', nombre: 'A', texto: '1' });
  assert.deepEqual(pedidos, [['573001111111', 'a']]);
});

test('normalizarCelular', () => {
  assert.equal(normalizarCelular('300 123 4567'), '573001234567');
  assert.equal(normalizarCelular('+57 300 123 4567'), '573001234567');
  assert.equal(normalizarCelular('573001234567'), '573001234567');
  assert.equal(normalizarCelular('12345'), null);
  assert.equal(normalizarCelular('hola'), null);
});

import { crearEco } from '../src/eco.js';
test('eco: no se contesta a sí mismo, ni por id ni por texto, y el olvido llega', () => {
  let t = 0; const eco = crearEco({ ahora: () => t, vidaMs: 1000 });
  eco.registrar({ key: { id: 'A1' } }, 'respuesta del bot');
  assert.equal(eco.esEco({ key: { id: 'A1' } }, 'otro texto'), true, 'por id');
  assert.equal(eco.esEco({ key: { id: 'ZZ' } }, 'respuesta del bot'), true, 'por texto (id tardío)');
  assert.equal(eco.esEco({ key: { id: 'B2' } }, 'morat'), false, 'lo que escribe la persona sí se atiende');
  t = 2000;
  assert.equal(eco.esEco({ key: { id: 'ZZ' } }, 'respuesta del bot'), false, 'pasado el tiempo, el mismo texto de la persona vuelve a valer');
  eco.registrar(undefined, 'sin id');   // sendMessage sin resultado no rompe
  assert.equal(eco.esEco({ key: {} }, 'sin id'), true);
});

test('entreComillas: acepta comillas rectas, tipográficas y latinas; lo demás es null', () => {
  assert.equal(entreComillas('"besos en guerra morat"'), 'besos en guerra morat');
  assert.equal(entreComillas('“besos en guerra morat”'), 'besos en guerra morat');
  assert.equal(entreComillas('”besos en guerra morat”'), 'besos en guerra morat', 'algunos teclados abren con ”');
  assert.equal(entreComillas('«morat»'), 'morat');
  assert.equal(entreComillas('  "  1  "  '), '1', 'espacios alrededor y adentro');
  assert.equal(entreComillas('"hola\nmorat"'), 'hola\nmorat');
  assert.equal(entreComillas('besos en guerra morat'), null, 'sin comillas no es para el bot');
  assert.equal(entreComillas('hola "morat"'), null, 'las comillas deben envolver todo el mensaje');
  assert.equal(entreComillas('"morat" gracias'), null);
  assert.equal(entreComillas('"morat'), null, 'comilla sin cerrar');
  assert.equal(entreComillas('""'), null);
  assert.equal(entreComillas('" "'), null);
  assert.equal(entreComillas(''), null);
  assert.equal(entreComillas(undefined), null);
});

test('modo comillas: la ayuda y las instrucciones piden escribir entre comillas', async () => {
  const { bot, enviados } = montar({ comillas: true });
  await bot.manejar({ ...dec(), texto: 'hola' });
  assert.match(enviados.at(-1), /\*entre comillas\*/);
  assert.match(enviados.at(-1), /\*"besos en guerra morat"\*/);
  assert.match(enviados.at(-1), /\*"puntos"\*/);
  assert.doesNotMatch(enviados.at(-1), /\*\*/, 'negrita de WhatsApp es un solo asterisco');
  await bot.manejar({ ...dec(), texto: 'morat' });
  assert.match(enviados.at(-1), /Responde con el número entre comillas \("1" a "2"\)/);
  await bot.manejar({ ...dec(), texto: '1' });
  assert.match(enviados.at(-1), /quedó en la cola/);
});

test('modo comillas: ninguna respuesta del bot empieza y termina con comillas (no se confunde con un pedido)', async () => {
  const { bot, enviados, avanzar } = montar({ comillas: true, registrado: false });
  for (const t of ['hola', 'puntos', 'cola', 'morat', '1', '3', 'cancelar', 'x']) { await bot.manejar({ ...dec(), texto: t }); avanzar(61_000); }
  assert.ok(enviados.length >= 8);
  for (const r of enviados) assert.equal(entreComillas(r), null, `respuesta confundible con un pedido: ${r.slice(0, 40)}`);
});

test('sin modo comillas el texto de ayuda queda como antes', async () => {
  const { bot, enviados } = montar();
  await bot.manejar({ ...dec(), texto: 'hola' });
  assert.doesNotMatch(enviados.at(-1), /comillas/);
});

test('paraElBot: con comillas solo pasa lo que viene entre comillas, de cualquiera', () => {
  const o = { soloComillas: true, aceptarPropio: true };
  assert.equal(paraElBot({ ...o, texto: '"besos en guerra morat"' }), 'besos en guerra morat', 'un cliente cualquiera');
  assert.equal(paraElBot({ ...o, texto: 'hola, ¿a qué hora abren?' }), null, 'conversación normal: silencio');
  assert.equal(paraElBot({ ...o, texto: 'ok' }), null);
  assert.equal(paraElBot({ ...o, texto: '   ' }), null);
});

test('paraElBot: lo que tú escribes solo vale en el chat contigo mismo', () => {
  const o = { soloComillas: true, aceptarPropio: true };
  assert.equal(paraElBot({ ...o, fromMe: true, propio: true, texto: '"morat"' }), 'morat', 'chat contigo mismo');
  assert.equal(paraElBot({ ...o, fromMe: true, propio: true, texto: 'nota para mí' }), null, 'sin comillas, ni siquiera tú mismo');
  assert.equal(paraElBot({ ...o, fromMe: true, propio: false, texto: '"morat"' }), null, 'tú le escribes "morat" a un amigo: el bot no se mete');
  assert.equal(paraElBot({ soloComillas: true, aceptarPropio: false, fromMe: true, propio: true, texto: '"morat"' }), null, 'ACEPTAR_PROPIO=0');
});

test('paraElBot: SOLO_COMILLAS=0 atiende todo, pero igual ignora lo tuyo hacia otros', () => {
  assert.equal(paraElBot({ texto: ' morat ' }), 'morat');
  assert.equal(paraElBot({ texto: 'morat', fromMe: true, propio: false, aceptarPropio: true }), null);
  assert.equal(paraElBot({ texto: 'morat', fromMe: true, propio: true, aceptarPropio: true }), 'morat');
});

const EMOJI = /[\p{Extended_Pictographic}\u20E3\uFE0F]/u;
test('ninguna respuesta del bot lleva emojis ni stickers, con o sin comillas, y la ayuda trae el lema', async () => {
  assert.equal(LEMA, 'Pon, tu música, tu caos');
  for (const comillas of [false, true]) {
    const a = montar({ comillas, registrado: false });
    const b = montar({ comillas, resultados: [] });
    const c = montar({ comillas, saldo: 1 });
    const enviados = [];
    for (const [m, textos] of [[a, ['hola', 'morat', '1', '2', 'puntos', 'cola', 'cancelar', 'x']], [b, ['asdfgh', '1']], [c, ['el rey vicente', '2', 'p']]]) {
      for (const t of textos) { await m.bot.manejar({ ...dec(), texto: t }); m.avanzar(61_000); }
      enviados.push(...m.enviados);
    }
    assert.ok(enviados.length > 10);
    for (const r of enviados) assert.doesNotMatch(r, EMOJI, `emoji en: ${r.slice(0, 60)}`);
    assert.ok(enviados.some((r) => r.includes(`_${LEMA}_`)), 'la bienvenida/ayuda lleva el lema');
  }
  for (const e of ['fetch failed', 'permission denied for function x']) assert.doesNotMatch(mensajeDeError(new Error(e)), EMOJI);
});
