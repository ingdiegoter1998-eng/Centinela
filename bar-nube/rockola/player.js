// Panel del bafle. La música NO sale de esta página: la toca el celular que tenga Spotify abierto con la cuenta del bar
// (Spotify Connect), dirigido por la función `rockola-control`. Aquí se conecta la cuenta (una sola vez, el administrador),
// se ve si el bafle responde y se controla: pausar, saltar, volumen, pausar pedidos, elegir celular.
(function () {
  const { cfg, db, el, pista, toast, limpiar, pedirError } = window.Rockola;
  const $ = (id) => document.getElementById(id);
  const SP_ID = cfg.SPOTIFY_CLIENT_ID || '';
  const REDIRECT = location.origin + location.pathname;
  const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-private';
  const dominio = '@bar.local', SUFIJO_VIEJO = '-bar';        // igual que la app; el sufijo es TEMPORAL (claves antiguas sin rotar)
  const FUNCION = cfg.SUPABASE_URL + '/functions/v1/rockola-control';

  let estado = null, sp = null, perfil = '';

  // ── Spotify: inicio de sesión PKCE (sin secreto en el navegador) ──────────────────────────
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function conectarSpotify() {
    const verif = b64(crypto.getRandomValues(new Uint8Array(48)));
    const reto = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif)));
    sessionStorage.setItem('sp-verif', verif);
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: SP_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES,
      code_challenge_method: 'S256', code_challenge: reto,
    });
  }

  // Llama a la función de borde con la sesión del usuario.
  async function llamar(accion, datos) {
    const { data } = await db.auth.getSession();
    const r = await fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (data.session ? data.session.access_token : '') },
      body: JSON.stringify({ accion, ...(datos || {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || 'La función del bafle no respondió (¿está desplegada?)');
    return d;
  }
  const hacer = (accion, datos, ok) => llamar(accion, datos).then((d) => { if (ok) toast(ok, 'ok'); refrescarTodo(); return d; }).catch((e) => toast(pedirError(e), 'error'));

  async function terminarConexion() {         // vuelve de Spotify con ?code=...
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    history.replaceState({}, '', REDIRECT);
    try {
      const d = await llamar('conectar', { code, verificador: sessionStorage.getItem('sp-verif') || '', redirect: REDIRECT });
      toast('Spotify conectado' + (d.cuenta ? ': ' + d.cuenta : ''), 'ok');
    } catch (e) { toast(pedirError(e), 'error'); }
    sessionStorage.removeItem('sp-verif');
  }

  // ── Pantalla ──────────────────────────────────────────────────────────────────────────────
  const hace = (iso) => { if (!iso) return 'nunca'; const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 90 ? s + ' s' : Math.round(s / 60) + ' min'; };

  function pintarEstado() {
    const caja = $('caja-estado');
    if (!sp) { $('sp-titulo').textContent = 'Revisando…'; return; }
    const r = sp.reproductor || {};
    $('btn-spotify').hidden = sp.conectado || !SP_ID || perfil !== 'admin';
    $('btn-desconectar').hidden = !sp.conectado || perfil !== 'admin';
    $('caja-control').hidden = !sp.conectado;
    caja.classList.remove('ok', 'mal');
    if (!SP_ID) { $('sp-titulo').textContent = 'Falta SPOTIFY_CLIENT_ID en config.js.'; $('sp-detalle').textContent = ''; return; }
    if (!sp.conectado) {
      $('sp-titulo').textContent = 'Spotify sin conectar';
      $('sp-detalle').textContent = perfil === 'admin' ? 'Toca «Conectar Spotify» e inicia sesión con la cuenta Premium del bar. Se hace una sola vez.' : 'El administrador tiene que conectar la cuenta de Spotify una vez.';
      return;
    }
    const bien = !!(r.dispositivo && !r.error && r.verificado_en && Date.now() - Date.parse(r.verificado_en) < 180000);
    caja.classList.add(bien ? 'ok' : 'mal');
    $('sp-titulo').textContent = bien ? 'Bafle listo: ' + r.dispositivo : 'El bafle no responde';
    $('sp-detalle').textContent = (sp.cuenta ? 'Cuenta: ' + sp.cuenta + '. ' : '') +
      (bien ? (r.pausada ? 'Música en pausa. ' : '') : (r.error || 'Aún no hay un latido. ') + ' ') + 'Última revisión hace ' + hace(r.verificado_en) + '.' +
      (sp.error ? ' ' + sp.error : '');
    // Hay una canción «sonando» en la rockola pero Spotify dice que no reproduce (se pausó en el celular, o el bafle se desconectó).
    const detenida = !!(bien && estado && estado.sonando && !r.reproduciendo && !r.pausada);
    if (detenida) $('sp-detalle').textContent += ' Spotify está en pausa en el celular aunque la rockola tiene una canción sonando: toca «Reanudar música» o dale play en Spotify (y revisa que el Bluetooth del bafle siga conectado).';
    $('btn-pausar').textContent = (r.pausada || detenida) ? 'Reanudar música' : 'Pausar música';
    sp.__detenida = detenida;
  }

  function pintarDispositivos() {
    const c = $('dispositivos'); limpiar(c);
    const lista = (sp && sp.dispositivos) || [];
    lista.forEach((d) => {
      const b = el('button', { class: 'btn chico', type: 'button' }, d.is_active ? 'Es este' : 'Usar este');
      if (d.is_active) b.disabled = true;
      b.addEventListener('click', () => hacer('transferir', { device_id: d.id }, 'Listo: ' + d.name));
      c.append(el('div', { class: 'pista' }, el('div', { class: 'info' }, el('b', {}, d.name), el('span', {}, d.type + (d.volume_percent != null ? ' · volumen ' + d.volume_percent + '%' : ''))), b));
    });
    if (!lista.length) c.append(el('p', { class: 'vacio' }, 'Ningún celular con Spotify abierto. Ábrelo en el del bafle (con la pantalla encendida un momento) y vuelve aquí.'));
  }

  function pintarCola() {
    if (!estado) return;
    $('btn-pedidos').textContent = estado.activa ? 'Pausar pedidos' : 'Reanudar pedidos';
    limpiar($('ahora'));
    const s = estado.sonando;
    $('ahora').append(s ? pista(s, null, 'ahora') : el('p', { class: 'vacio' }, 'Nada suena.'));
    limpiar($('cola'));
    estado.cola.forEach((p) => {
      const quitar = el('button', { class: 'btn chico', type: 'button' }, 'Quitar');
      quitar.addEventListener('click', async () => {
        const { error } = await db.rpc('rockola_quitar', { p_id: p.id });
        if (error) toast(pedirError(error), 'error'); else refrescarCola();
      });
      $('cola').append(pista(p, quitar));
    });
    if (!estado.cola.length) $('cola').append(el('p', { class: 'vacio' }, 'Cola vacía.'));
  }

  async function refrescarCola() {
    const { data } = await db.rpc('rockola_estado');
    if (data) { estado = data; pintarCola(); }
  }
  async function refrescarSpotify() {
    try { sp = await llamar('estado'); } catch (e) { sp = { conectado: false, error: pedirError(e), reproductor: null, dispositivos: [] }; }
    pintarEstado(); pintarDispositivos();
  }
  const refrescarTodo = () => Promise.all([refrescarCola(), refrescarSpotify()]);

  async function mostrarPanel() {
    $('login').hidden = true; $('panel').hidden = false;
    const { data } = await db.rpc('rockola_panel_permiso');
    perfil = data || '';
    await terminarConexion();
    await refrescarTodo();
    setInterval(() => { if (!document.hidden) refrescarCola().catch(() => {}); }, 4000);
    setInterval(() => { if (!document.hidden) refrescarSpotify().catch(() => {}); }, 15000);
  }

  $('btn-spotify').addEventListener('click', conectarSpotify);
  $('btn-desconectar').addEventListener('click', () => { if (confirm('¿Desconectar la cuenta de Spotify? La rockola dejará de sonar hasta volver a conectarla.')) hacer('desconectar', null, 'Spotify desconectado'); });
  $('btn-pausar').addEventListener('click', () => hacer(sp && sp.reproductor && (sp.reproductor.pausada || sp.__detenida) ? 'reanudar' : 'pausar'));
  $('btn-saltar').addEventListener('click', () => hacer('saltar', null, 'Saltada'));
  $('btn-pedidos').addEventListener('click', async () => {
    const { error } = await db.rpc('rockola_activar', { p_activa: !(estado && estado.activa) });
    if (error) toast(pedirError(error), 'error'); else refrescarCola();
  });
  let esperaVolumen = null;
  $('volumen').addEventListener('input', (e) => { clearTimeout(esperaVolumen); esperaVolumen = setTimeout(() => llamar('volumen', { valor: Number(e.target.value) }).catch((x) => toast(pedirError(x), 'error')), 350); });
  $('btn-salir').addEventListener('click', async () => { await db.auth.signOut(); location.reload(); });
  $('login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const correo = String(f.get('usuario')).trim().toLowerCase() + dominio, clave = String(f.get('clave'));
    let { error } = await db.auth.signInWithPassword({ email: correo, password: clave });
    if (error && /invalid login/i.test(error.message)) ({ error } = await db.auth.signInWithPassword({ email: correo, password: clave + SUFIJO_VIEJO }));
    if (error) $('login-error').textContent = 'Usuario o contraseña incorrectos'; else mostrarPanel();
  });

  (async () => {
    const { data } = await db.auth.getSession();
    if (data.session) mostrarPanel(); else $('login').hidden = false;
  })();
})();
