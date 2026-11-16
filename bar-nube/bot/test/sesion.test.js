import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { limpiarSesiones, marcarReparacion, ultimaReparacion, olvidarReparacion, decidirReparacion } from '../src/sesion.js';
import { crearVigilante, esFalloDeDescifrado, seLeyoBien } from '../src/vigilante.js';
import { tomarBloqueo, procesoVivo } from '../src/bloqueo.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rockola-'));

test('limpiarSesiones borra las llaves de conversación y conserva la identidad del bot', () => {
  const d = tmp();
  for (const n of ['creds.json', 'pre-key-1.json', 'app-state-sync-key-AAA.json', 'session-73667379765411.0.json', 'sender-key-g@g.us--x--0.json', 'sender-key-memory-g@g.us.json']) fs.writeFileSync(path.join(d, n), '{}');
  assert.equal(limpiarSesiones(d), 3);
  assert.deepEqual(fs.readdirSync(d).sort(), ['app-state-sync-key-AAA.json', 'creds.json', 'pre-key-1.json']);
  assert.equal(limpiarSesiones(path.join(d, 'no-existe')), 0, 'carpeta inexistente no rompe');
});

test('la marca de reparación se guarda, se lee y se olvida', () => {
  const d = tmp();
  assert.equal(ultimaReparacion(d), 0);
  marcarReparacion(d, 1234);
  assert.equal(ultimaReparacion(d), 1234);
  olvidarReparacion(d);
  assert.equal(ultimaReparacion(d), 0);
  olvidarReparacion(d);   // dos veces no rompe
});

test('decidirReparacion: primero limpiar; si ya se limpió hace poco, vincular de nuevo; pasado un rato, limpiar otra vez', () => {
  const min = 60_000;
  assert.equal(decidirReparacion({ ultima: 0, ahora: 1_000_000 }), 'limpiar');
  assert.equal(decidirReparacion({ ultima: 1_000_000, ahora: 1_000_000 + 5 * min }), 'revincular');
  assert.equal(decidirReparacion({ ultima: 1_000_000, ahora: 1_000_000 + 31 * min }), 'limpiar');
});

test('esFalloDeDescifrado: cuenta los chats uno a uno, no los estados ni los grupos', () => {
  const propio = { key: { remoteJid: '73667379765411@lid', fromMe: true, id: 'AC1' }, err: { message: 'No matching sessions found for message' } };
  assert.equal(esFalloDeDescifrado([propio, 'failed to decrypt message']), true);
  assert.equal(esFalloDeDescifrado([{ key: { remoteJid: '573001112233@s.whatsapp.net' } }, 'failed to decrypt message']), true);
  assert.equal(esFalloDeDescifrado([{ key: { remoteJid: 'status@broadcast' } }, 'failed to decrypt message']), false, 'los estados fallan siempre y es normal');
  assert.equal(esFalloDeDescifrado([{ key: { remoteJid: '1203@g.us' } }, 'failed to decrypt message']), false);
  assert.equal(esFalloDeDescifrado([propio, 'otra cosa']), false);
  assert.equal(esFalloDeDescifrado(['failed to decrypt message']), false);
  assert.equal(esFalloDeDescifrado([]), false);
});

test('seLeyoBien: solo cuenta mensajes con contenido de chats uno a uno', () => {
  assert.equal(seLeyoBien({ key: { remoteJid: '573001112233@s.whatsapp.net' }, message: { conversation: 'hola' } }), true);
  assert.equal(seLeyoBien({ key: { remoteJid: '73667379765411@lid' }, message: { protocolMessage: {} } }), true, 'mensajes internos de sincronización también');
  assert.equal(seLeyoBien({ key: { remoteJid: '73667379765411@lid' }, messageStubType: 2 }), false, 'los que no se pudieron abrir llegan sin contenido');
  assert.equal(seLeyoBien({ key: { remoteJid: 'status@broadcast' }, message: { conversation: 'x' } }), false, 'un estado leído no prueba que los chats funcionen');
});

test('vigilante: avisa con 6 fallos seguidos, y cualquier lectura buena lo reinicia', () => {
  let t = 0; const v = crearVigilante({ ahora: () => t });
  for (let i = 0; i < 5; i++) { t += 5000; assert.equal(v.fallo(), false); }
  t += 5000; assert.equal(v.fallo(), true, 'el sexto seguido');
  v.ok();
  assert.equal(v.seguidos, 0);
  for (let i = 0; i < 5; i++) { t += 5000; assert.equal(v.fallo(), false); }
  v.ok();
  for (let i = 0; i < 5; i++) { t += 5000; assert.equal(v.fallo(), false, 'con una lectura buena en medio nunca llega al sexto'); }
});

test('vigilante: fallos viejos (fuera de la ventana) no se suman', () => {
  let t = 0; const v = crearVigilante({ ahora: () => t, ventanaMs: 120_000 });
  for (let i = 0; i < 5; i++) { t += 10_000; v.fallo(); }
  t += 10 * 60_000;
  assert.equal(v.fallo(), false);
  assert.equal(v.seguidos, 1);
});

test('bloqueo: una sola copia a la vez, y un candado de un proceso muerto no estorba', () => {
  const d = tmp(); const archivo = path.join(d, 'auth.lock');
  const a = tomarBloqueo(archivo, { pid: 100, vivo: () => true });
  assert.equal(a.ok, true);
  const b = tomarBloqueo(archivo, { pid: 200, vivo: (p) => p === 100 });
  assert.deepEqual({ ok: b.ok, pid: b.pid }, { ok: false, pid: 100 });
  const c = tomarBloqueo(archivo, { pid: 300, vivo: () => false });   // el dueño ya no existe (se cayó sin soltar)
  assert.equal(c.ok, true);
  assert.equal(fs.readFileSync(archivo, 'utf8'), '300');
  a.soltar();                                                          // un proceso viejo no puede soltar el candado de otro
  assert.equal(fs.existsSync(archivo), true);
  c.soltar();
  assert.equal(fs.existsSync(archivo), false);
  assert.equal(tomarBloqueo(archivo, { pid: 100, vivo: () => true }).ok, true, 'el mismo pid vuelve a entrar');
});

test('procesoVivo: yo estoy vivo; un pid imposible no', () => {
  assert.equal(procesoVivo(process.pid), true);
  assert.equal(procesoVivo(2 ** 22 + 12345), false);
});
