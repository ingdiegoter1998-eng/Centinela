// Cliente mínimo de la Web API de Spotify para el controlador de la rockola. Sin dependencias: recibe `fetch`
// y los lugares donde se guarda el refresh token, así se prueba entero con `node --test` sin red.
// Solo se usa el flujo PKCE (client id, sin secreto): el navegador del panel genera el verificador y la función lo canjea.

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyError extends Error {
  constructor(status, reason, message) {
    super(message || reason || `Spotify respondió ${status}`);
    this.status = status;       // 0 = sin red
    this.reason = reason || '';
  }
}

// ¿De quién es el problema? Decide qué hace el controlador con la canción que iba a tocar.
//   'dispositivo' → no hay (o se perdió) un celular con Spotify abierto: la canción vuelve a la cola
//   'cuenta'      → la cuenta no es Premium, o se revocó el permiso: hay que reconectar; vuelve a la cola
//   'espera'      → límite de Spotify, caída o red: vuelve a la cola y se reintenta
//   'pista'       → Spotify no puede tocar esa canción (no existe, no está disponible): se devuelve el pedido
export function clasificar(err) {
  const s = err?.status ?? 0, texto = `${err?.reason || ''} ${err?.message || ''}`;
  if (s === 0 || s === 429 || s >= 500) return 'espera';
  if (s === 401 || (s === 403 && /PREMIUM/i.test(texto))) return 'cuenta';
  if (err?.reason === 'REVOCADO') return 'cuenta';
  if (s === 404 && /DEVICE/i.test(texto)) return 'dispositivo';
  return 'pista';
}

export function crearSpotify({ clientId, fetchFn = fetch, leerRefresh, guardarRefresh, ahora = Date.now }) {
  let acceso = null, vence = 0;

  async function pedirToken(cuerpo) {
    let r;
    try {
      r = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...cuerpo }) });
    } catch (e) { throw new SpotifyError(0, 'RED', 'No hay conexión con Spotify'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new SpotifyError(r.status, d.error === 'invalid_grant' ? 'REVOCADO' : d.error, d.error_description || d.error || 'Spotify rechazó el inicio de sesión');
    return d;
  }

  async function token() {
    if (acceso && vence > ahora() + 30_000) return acceso;
    const refresh = await leerRefresh();
    if (!refresh) throw new SpotifyError(401, 'SIN_CUENTA', 'Spotify no está conectado');
    const d = await pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });
    acceso = d.access_token; vence = ahora() + d.expires_in * 1000;
    if (d.refresh_token && d.refresh_token !== refresh) await guardarRefresh(d.refresh_token);
    return acceso;
  }

  async function llamar(metodo, ruta, { query, cuerpo } = {}) {
    const url = API + ruta + (query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')) : '');
    let r;
    try {
      r = await fetchFn(url, { method: metodo, headers: { Authorization: 'Bearer ' + (await token()), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    } catch (e) {
      if (e instanceof SpotifyError) throw e;
      throw new SpotifyError(0, 'RED', 'No hay conexión con Spotify');
    }
    if (r.status === 401) acceso = null;        // el token se venció antes de lo previsto: la próxima vez se renueva
    if (r.status === 204) return null;
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new SpotifyError(r.status, d?.error?.reason, d?.error?.message);
    return d;
  }

  return {
    // Canje del código del inicio de sesión (PKCE). Devuelve el refresh token: quien llama lo guarda.
    async canjear({ code, verificador, redirect }) {
      const d = await pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verificador });
      if (!d.refresh_token) throw new SpotifyError(400, 'SIN_REFRESH', 'Spotify no entregó permiso permanente');
      acceso = d.access_token; vence = ahora() + d.expires_in * 1000;
      return d.refresh_token;
    },
    async cuenta() { const d = await llamar('GET', '/me'); return d?.display_name || d?.id || ''; },

    // Qué está pasando: { dispositivo | null (el activo), reproduciendo, progreso_ms, item_id, item_duracion }
    async estado() {
      const d = await llamar('GET', '/me/player', { query: { additional_types: 'track,episode' } });
      if (!d) return { dispositivo: null, reproduciendo: false, progreso_ms: 0, item_id: null, item_duracion: 0 };
      return {
        dispositivo: d.device ? { id: d.device.id, name: d.device.name, type: d.device.type, volume_percent: d.device.volume_percent } : null,
        reproduciendo: !!d.is_playing, progreso_ms: d.progress_ms ?? 0, item_id: d.item?.id ?? null, item_duracion: d.item?.duration_ms ?? 0,
      };
    },
    async dispositivos() { const d = await llamar('GET', '/me/player/devices'); return d?.devices ?? []; },

    // Suena esa canción YA, en ese dispositivo (aunque esté dormido en la lista).
    tocar: (pistaId, deviceId) => llamar('PUT', '/me/player/play', { query: { device_id: deviceId }, cuerpo: { uris: ['spotify:track:' + pistaId] } }),
    // La deja de siguiente en la cola de Spotify.
    encolar: (pistaId, deviceId) => llamar('POST', '/me/player/queue', { query: { uri: 'spotify:track:' + pistaId, device_id: deviceId } }),
    pausar: (deviceId) => llamar('PUT', '/me/player/pause', { query: { device_id: deviceId } }),
    reanudar: (deviceId) => llamar('PUT', '/me/player/play', { query: { device_id: deviceId } }),
    volumen: (porcentaje, deviceId) => llamar('PUT', '/me/player/volume', { query: { volume_percent: Math.max(0, Math.min(100, Math.round(porcentaje))), device_id: deviceId } }),
    transferir: (deviceId, tocando = false) => llamar('PUT', '/me/player', { cuerpo: { device_ids: [deviceId], play: tocando } }),
  };
}
