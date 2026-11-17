import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { limpiarSesiones } from '../src/sesion.js';
import { crearVigilante, esFalloDeDescifrado, esRuidoConocido, seLeyoBien } from '../src/vigilante.js';
import { tomarBloqueo, procesoVivo } from '../src/bloqueo.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rockola-'));

test('limpiarSesiones borra las llaves de conversación y conserva la identidad del bot', () => {
  const d = tmp();
  for (const n of ['creds.json', 'pre-key-1.json', 'app-state-sync-key-AAA.json', 'session-73667379765411.0.json', 'sender-key-g@g.us--x--0.json', 'sender-key-memory-g@g.us.json']) fs.writeFileSync(path.join(d, n), '{}');
  assert.equal(limpiarSesiones(d), 3);
  assert.deepEqual(fs.readdirSync(d).sort(), ['app-state-sync-key-AAA.json', 'creds.json', 'pre-key-1.json']);
  assert.equal(limpiarSesiones(path.join(d, 'no-existe')), 0, 'carpeta inexistente no rompe');
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

test('vigilante: avisa solo con MUCHOS fallos seguidos (30), una vez, y cualquier lectura buena lo reinicia', () => {
  let t = 0; const v = crearVigilante({ ahora: () => t });
  for (let i = 0; i < 29; i++) { t += 5000; assert.equal(v.fallo(), false, `fallo ${i + 1}: lo de los primeros minutos tras vincular es normal`); }
  t += 5000; assert.equal(v.fallo(), true, 'el 30 seguido');
  assert.equal(v.seguidos, 0, 'tras avisar vuelve a contar: no repite el aviso en cada fallo');
  for (let i = 0; i < 29; i++) { t += 5000; assert.equal(v.fallo(), false); }
  v.ok();
  for (let i = 0; i < 29; i++) { t += 5000; assert.equal(v.fallo(), false, 'con una lectura buena en medio no llega a 30'); }
});

test('vigilante: el caso real del log (73 fallos, uno cada 5 s) no avisa antes de ~2,5 minutos y nunca borra nada', () => {
  let t = 0; const v = crearVigilante({ ahora: () => t });
  let primerAviso = null;
  for (let i = 1; i <= 73; i++) { t += 5200; if (v.fallo() && primerAviso === null) primerAviso = Math.round(t / 1000); }
  assert.ok(primerAviso >= 150, `avisó a los ${primerAviso} s`);
});

test('vigilante: fallos viejos (fuera de la ventana de 15 min) no se suman', () => {
  let t = 0; const v = crearVigilante({ ahora: () => t });
  for (let i = 0; i < 20; i++) { t += 10_000; v.fallo(); }
  t += 20 * 60_000;
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

test('esRuidoConocido: calla los fallos de estados/grupos y el 408 de init queries, pero deja pasar lo que sí importa', () => {
  const falla = (jid) => [{ key: { remoteJid: jid }, err: { message: 'No session found to decrypt message' } }, 'failed to decrypt message'];
  assert.equal(esRuidoConocido(falla('status@broadcast')), true);
  assert.equal(esRuidoConocido(falla('120363413869605988@g.us')), true);
  assert.equal(esRuidoConocido(falla('123@newsletter')), true);
  assert.equal(esRuidoConocido(falla('573001112233@s.whatsapp.net')), false, 'un chat uno a uno que no se descifra SÍ se muestra');
  assert.equal(esRuidoConocido(falla('73667379765411@lid')), false);
  const boom = (codigo) => { const err = new Error('Timed Out'); err.output = { statusCode: codigo }; return [{ err }, "unexpected error in 'init queries'"]; };
  assert.equal(esRuidoConocido(boom(408)), true, 'el timeout de init queries es normal y no afecta a los mensajes');
  assert.equal(esRuidoConocido(boom(500)), false, 'otro error en init queries no se calla');
  assert.equal(esRuidoConocido([{ err: new Error('x') }, 'otra cosa']), false);
  assert.equal(esRuidoConocido(['solo texto']), false);
  assert.equal(esRuidoConocido([]), false);
  assert.equal(esRuidoConocido(undefined), false);
});
