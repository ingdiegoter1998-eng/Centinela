// Reproductor: corre en el PC/tablet del bar con una pestaña abierta. Saca la siguiente canción de la cola
// (rockola_siguiente), la pone a sonar en Spotify (Web Playback SDK, requiere Premium) y cuando termina pide otra.
// ?demo → no usa Spotify: «reproduce» cada canción de mentira por 15 s, para probar todo el flujo.
(function () {
  const { cfg, demo, db, el, pista, toast, limpiar, pedirError } = window.Rockola;
  const $ = (id) => document.getElementById(id);
  const SP_ID = cfg.SPOTIFY_CLIENT_ID || '';
  const REDIRECT = location.origin + location.pathname;
  const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
  const dominio = '@bar.local', sufijo = '-bar';        // igual que el resto de la app (ver README)

  let estado = null, corriendo = false, cambiando = false, actual = null, temporizador = null;
  let sdk = null, deviceId = null, volumen = 0.7;

  // ── Spotify: inicio de sesión PKCE (sin secreto en el navegador) ──────────────────────────
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const guardar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  async function conectarSpotify() {
    const verif = b64(crypto.getRandomValues(new Uint8Array(48)));
    const reto = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif)));
    sessionStorage.setItem('sp-verif', verif);
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: SP_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES,
      code_challenge_method: 'S256', code_challenge: reto,
    });
  }
  async function pedirToken(cuerpo) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: SP_ID, ...cuerpo }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || 'Spotify rechazó el inicio de sesión');
    const t = { acceso: d.access_token, refresco: d.refresh_token || (leer('sp-token') || {}).refresco, vence: Date.now() + d.expires_in * 1000 };
    guardar('sp-token', t);
    return t;
  }
  async function token() {
    let t = leer('sp-token');
    if (!t) return null;
    if (t.vence < Date.now() + 60000) t = await pedirToken({ grant_type: 'refresh_token', refresh_token: t.refresco });
    return t.acceso;
  }
  async function terminarConexion() {         // vuelve de Spotify con ?code=...
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    try {
      await pedirToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: sessionStorage.getItem('sp-verif') || '' });
    } catch (e) { toast(pedirError(e), 'error'); }
    history.replaceState({}, '', REDIRECT);
  }

  // ── Reproducción ──────────────────────────────────────────────────────────────────────────
  function iniciarSDK() {
    return new Promise((ok, mal) => {
      window.onSpotifyWebPlaybackSDKReady = () => {
        sdk = new Spotify.Player({ name: 'Rockola del bar', getOAuthToken: (cb) => token().then(cb), volume: volumen });
        sdk.addListener('ready', ({ device_id }) => { deviceId = device_id; ok(); });
        sdk.addListener('initialization_error', ({ message }) => mal(new Error(message)));
        sdk.addListener('authentication_error', () => { localStorage.removeItem('sp-token'); mal(new Error('Spotify: vuelve a conectar')); });
        sdk.addListener('account_error', () => mal(new Error('Spotify: la cuenta necesita Premium')));
        sdk.addListener('player_state_changed', (s) => {
          // Terminó la canción: quedó en pausa, en 0, y la que sonaba ya figura entre las anteriores.
          if (s && actual && !cambiando && s.paused && s.position === 0 && s.track_window.previous_tracks.some((t) => t.id === actual.pista_id)) avanzar();
        });
        sdk.connect();
      };
      const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.onerror = () => mal(new Error('No cargó el SDK de Spotify'));
      document.head.append(s);
    });
  }
  async function sonar(p) {
    clearTimeout(temporizador);
    actual = p;
    const respaldo = (p.duracion_ms || 240000) + 4000;       // por si el SDK no avisa el final
    if (demo) { temporizador = setTimeout(() => avanzar(), p.duracion_ms || 15000); return; }
    const r = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + deviceId, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: ['spotify:track:' + p.pista_id] }),
    });
    if (!r.ok) throw new Error('Spotify no pudo poner «' + p.titulo + '» (' + r.status + ')');
    temporizador = setTimeout(() => avanzar(), respaldo);
  }
  async function avanzar(saltar) {
    if (cambiando || !corriendo) return;
    cambiando = true;
    try {
      const { data, error } = await db.rpc(saltar ? 'rockola_saltar' : 'rockola_siguiente');
      if (error) throw error;
      if (!data) { actual = null; clearTimeout(temporizador); temporizador = setTimeout(() => { cambiando = false; avanzar(); }, 4000); await refrescar(); return; }
      try { await sonar(data); } catch (e) { toast(pedirError(e), 'error'); actual = null; temporizador = setTimeout(() => { cambiando = false; avanzar(true); }, 1500); return; }
      await refrescar();
    } catch (e) { toast(pedirError(e), 'error'); temporizador = setTimeout(() => { cambiando = false; avanzar(); }, 5000); return; }
    cambiando = false;
  }
  // La cola vacía se vigila: en cuanto alguien pide, arranca sola (por eso «avanzar» se reintenta cada 4 s).

  async function arrancar() {
    $('btn-arrancar').disabled = true;
    try {
      if (!demo) {
        if (!sdk) await iniciarSDK();
        sdk.activateElement();
      }
      corriendo = true;
      $('btn-arrancar').hidden = true;
      await refrescar();
      if (estado && estado.sonando) await sonar(estado.sonando);   // quedó una sonando de antes (se recargó la pestaña): se retoma
      else await avanzar();
    } catch (e) { toast(pedirError(e), 'error'); $('btn-arrancar').disabled = false; }
  }

  // ── Pantalla ──────────────────────────────────────────────────────────────────────────────
  function pintar() {
    if (!estado) return;
    $('btn-pausa').textContent = estado.activa ? '⏸ Pausar pedidos' : '▶ Reanudar pedidos';
    limpiar($('ahora'));
    const s = estado.sonando;
    $('ahora').append(s ? pista(s, null, 'ahora') : el('p', { class: 'vacio' }, corriendo ? 'Esperando pedidos…' : 'Detenida'));
    limpiar($('cola'));
    estado.cola.forEach((p, i) => {
      const quitar = el('button', { class: 'btn chico', type: 'button' }, '✕');
      quitar.addEventListener('click', async () => {
        const { error } = await db.rpc('rockola_quitar', { p_id: p.id });
        if (error) toast(pedirError(error), 'error'); else refrescar();
      });
      $('cola').append(pista(p, quitar));
    });
    if (!estado.cola.length) $('cola').append(el('p', { class: 'vacio' }, 'Cola vacía.'));
  }
  async function refrescar() {
    const { data } = await db.rpc('rockola_estado');
    if (data) { estado = data; pintar(); }
  }

  async function mostrarPanel() {
    $('login').hidden = true; $('panel').hidden = false;
    const conectado = demo || !!leer('sp-token');
    $('estado-sp').textContent = demo ? 'Modo demo: no suena nada de verdad.'
      : !SP_ID ? 'Falta SPOTIFY_CLIENT_ID en config.js.' : conectado ? 'Spotify conectado.' : 'Spotify sin conectar.';
    $('btn-spotify').hidden = demo || !SP_ID || conectado;
    $('btn-arrancar').hidden = !(demo || (SP_ID && conectado));
    await refrescar();
    setInterval(() => { if (!document.hidden) refrescar().catch(() => {}); }, 4000);
  }

  $('btn-spotify').addEventListener('click', conectarSpotify);
  $('btn-arrancar').addEventListener('click', arrancar);
  $('btn-saltar').addEventListener('click', () => { if (corriendo) { clearTimeout(temporizador); cambiando = false; avanzar(true); } else toast('Arranca la rockola primero'); });
  $('btn-pausa').addEventListener('click', async () => {
    const { error } = await db.rpc('rockola_activar', { p_activa: !(estado && estado.activa) });
    if (error) toast(pedirError(error), 'error'); else refrescar();
  });
  $('volumen').addEventListener('input', (e) => { volumen = e.target.value / 100; if (sdk && sdk.setVolume) sdk.setVolume(volumen); });
  $('btn-salir').addEventListener('click', async () => { await db.auth.signOut(); location.reload(); });
  $('login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const { error } = await db.auth.signInWithPassword({ email: String(f.get('usuario')).trim().toLowerCase() + dominio, password: String(f.get('clave')) + sufijo });
    if (error) $('login-error').textContent = 'Usuario o clave incorrectos'; else mostrarPanel();
  });

  (async () => {
    await terminarConexion();
    const { data } = await db.auth.getSession();
    if (data.session) mostrarPanel(); else $('login').hidden = false;
  })();
})();
