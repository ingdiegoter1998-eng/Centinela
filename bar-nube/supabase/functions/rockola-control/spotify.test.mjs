import test from 'node:test';
import assert from 'node:assert/strict';
import { crearSpotify, clasificar, SpotifyError } from './spotify.mjs';

function falso(respuestas) {
  const pedidos = [];
  const fetchFn = async (url, init = {}) => {
    pedidos.push({ url: String(url), metodo: init.method || 'GET', cab: init.headers || {}, cuerpo: init.body });
    const r = respuestas.shift(); if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.cuerpo };
  };
  return { fetchFn, pedidos };
}
const tokenOk = { status: 200, cuerpo: { access_token: 'AT', expires_in: 3600 } };

test('renueva el token una vez y arma bien tocar y encolar', async () => {
  const { fetchFn, pedidos } = falso([tokenOk, { status: 204 }, { status: 204 }]);
  const sp = crearSpotify({ clientId: 'CID', fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async () => {} });
  await sp.tocar('abc', 'dev1'); await sp.encolar('xyz', 'dev1');
  assert.match(pedidos[0].url, /accounts\.spotify\.com\/api\/token/); assert.match(String(pedidos[0].cuerpo), /grant_type=refresh_token.*client_id=CID|client_id=CID.*grant_type=refresh_token/);
  assert.equal(pedidos[1].metodo, 'PUT'); assert.match(pedidos[1].url, /\/me\/player\/play\?device_id=dev1$/);
  assert.equal(pedidos[1].cab.Authorization, 'Bearer AT'); assert.deepEqual(JSON.parse(pedidos[1].cuerpo), { uris: ['spotify:track:abc'] });
  assert.equal(pedidos[2].metodo, 'POST'); assert.match(pedidos[2].url, /\/me\/player\/queue\?uri=spotify%3Atrack%3Axyz&device_id=dev1$/);
  assert.equal(pedidos.length, 3, 'un solo canje de token');
});

test('guarda el refresh token nuevo si Spotify lo rota', async () => {
  let guardado = null;
  const { fetchFn } = falso([{ status: 200, cuerpo: { access_token: 'AT', expires_in: 3600, refresh_token: 'RT2' } }, { status: 204 }]);
  const sp = crearSpotify({ clientId: 'C', fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async (t) => { guardado = t; } });
  await sp.pausar('d'); assert.equal(guardado, 'RT2');
});

test('estado: 204 = nada activo; 200 se aplana', async () => {
  const a = falso([tokenOk, { status: 204 }]);
  const sp = crearSpotify({ clientId: 'C', fetchFn: a.fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async () => {} });
  assert.deepEqual(await sp.estado(), { dispositivo: null, reproduciendo: false, progreso_ms: 0, item_id: null, item_duracion: 0 });
  a.pedidos.length = 0;
  const b = falso([tokenOk, { status: 200, cuerpo: { is_playing: true, progress_ms: 5000, device: { id: 'd', name: 'Tel', type: 'Smartphone', volume_percent: 40 }, item: { id: 'T', duration_ms: 200000 } } }]);
  const sp2 = crearSpotify({ clientId: 'C', fetchFn: b.fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async () => {} });
  const s = await sp2.estado();
  assert.equal(s.item_id, 'T'); assert.equal(s.dispositivo.name, 'Tel'); assert.equal(s.progreso_ms, 5000); assert.equal(s.reproduciendo, true);
});

test('errores: se clasifican por quién tiene el problema', async () => {
  const { fetchFn } = falso([tokenOk, { status: 404, cuerpo: { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } } }]);
  const sp = crearSpotify({ clientId: 'C', fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async () => {} });
  await assert.rejects(sp.tocar('a', 'd'), (e) => e instanceof SpotifyError && clasificar(e) === 'dispositivo');
  assert.equal(clasificar(new SpotifyError(403, 'PREMIUM_REQUIRED')), 'cuenta');
  assert.equal(clasificar(new SpotifyError(401)), 'cuenta');
  assert.equal(clasificar(new SpotifyError(429)), 'espera');
  assert.equal(clasificar(new SpotifyError(503)), 'espera');
  assert.equal(clasificar(new SpotifyError(0, 'RED')), 'espera');
  assert.equal(clasificar(new SpotifyError(400, '', 'Invalid track uri')), 'pista');
  assert.equal(clasificar(new SpotifyError(404, '', 'Track not found')), 'pista');
  assert.equal(clasificar(new SpotifyError(400, 'REVOCADO')), 'cuenta');
});

test('sin cuenta conectada o token revocado', async () => {
  const sp = crearSpotify({ clientId: 'C', fetchFn: async () => { throw new Error('no debe llamar'); }, leerRefresh: async () => null, guardarRefresh: async () => {} });
  await assert.rejects(sp.estado(), (e) => e.reason === 'SIN_CUENTA' && clasificar(e) === 'cuenta');
  const { fetchFn } = falso([{ status: 400, cuerpo: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }]);
  const sp2 = crearSpotify({ clientId: 'C', fetchFn, leerRefresh: async () => 'RT', guardarRefresh: async () => {} });
  await assert.rejects(sp2.estado(), (e) => clasificar(e) === 'cuenta');
});

test('canjear el código PKCE devuelve el refresh token', async () => {
  const { fetchFn, pedidos } = falso([{ status: 200, cuerpo: { access_token: 'AT', expires_in: 3600, refresh_token: 'RT-nuevo' } }]);
  const sp = crearSpotify({ clientId: 'C', fetchFn, leerRefresh: async () => null, guardarRefresh: async () => {} });
  assert.equal(await sp.canjear({ code: 'cod', verificador: 'ver', redirect: 'https://x/y' }), 'RT-nuevo');
  const cuerpo = new URLSearchParams(String(pedidos[0].cuerpo));
  assert.equal(cuerpo.get('grant_type'), 'authorization_code'); assert.equal(cuerpo.get('code_verifier'), 'ver'); assert.equal(cuerpo.get('redirect_uri'), 'https://x/y');
  assert.equal(cuerpo.get('client_secret'), null, 'PKCE: sin secreto');
});
