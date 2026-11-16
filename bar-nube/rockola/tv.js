// Pantalla del TV: solo lee (rockola_estado, abierta al público) y se refresca sola cada 3 s.
(function () {
  const { db, el, limpiar } = window.Rockola;
  const $ = (id) => document.getElementById(id);
  const FILAS = 8;
  let estado = null, cancionActual = null, cambio = false, vistos = null;

  const quien = (p) => (p.nombre ? p.nombre + ' · ' : '') + (p.mesa ? 'Mesa ' + p.mesa : '');

  function pintar() {
    if (!estado) return;
    $('pausa').hidden = estado.activa;
    const clave = estado.sonando ? [estado.sonando.titulo, estado.sonando.artista, estado.sonando.empezo_en].join('|') : '';
    cambio = clave && cancionActual !== null && clave !== cancionActual;
    cancionActual = clave || (cancionActual === null ? '' : cancionActual);
    // Pedidos nuevos en la cola: aviso breve abajo (la primera carga no anuncia nada)
    const llaves = estado.cola.map((p) => [p.titulo, p.artista, p.mesa, p.nombre].join('|'));
    if (vistos) estado.cola.forEach((p, i) => { if (!vistos.has(llaves[i])) avisar(p.nombre || (p.mesa ? 'Mesa ' + p.mesa : 'Alguien'), p.titulo); });
    vistos = new Set(llaves);
    const a = $('ahora'); limpiar(a); a.classList.toggle('nueva', !!cambio);
    const s = estado.sonando;
    if (s) {
      a.append(...[
        s.portada && /^https:\/\//.test(s.portada) ? el('img', { class: 'tv-portada', src: s.portada, alt: '' }) : el('div', { class: 'tv-portada' }),
        el('div', { class: 'tv-titulo' }, s.titulo),
        el('div', { class: 'tv-artista' }, s.artista || ''),
        quien(s) ? el('div', { class: 'tv-quien' }, 'Pidió: ' + quien(s)) : null,
        el('div', { class: 'tv-barra' }, el('i', { id: 'progreso' }))].filter(Boolean));
      progreso();
    } else {
      a.append(el('div', { class: 'tv-silencio' }, 'Silencio sospechoso… ¡pon la primera!'));
    }
    const c = $('cola'); limpiar(c);
    estado.cola.slice(0, FILAS).forEach((p, i) => {
      const img = p.portada && /^https:\/\//.test(p.portada) ? el('img', { src: p.portada, alt: '' }) : el('div', { class: 'sin' });
      c.append(el('div', { class: 'tv-fila' }, el('div', { class: 'n' }, String(i + 1)), img,
        el('div', { class: 'info' }, el('b', {}, p.titulo), el('span', {}, p.artista || '')),
        el('div', { class: 'quien' }, quien(p))));
    });
    if (!estado.cola.length) c.append(el('div', { class: 'tv-vacio' }, 'La cola está vacía.'));
    // Cuántas filas caben de verdad en el alto disponible (en TV de otra proporción caben más o menos)
    let ocultas = 0;
    while (c.lastElementChild && c.lastElementChild.className === 'tv-fila' && c.lastElementChild.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1) { c.lastElementChild.remove(); ocultas++; }
    const resto = estado.cola.length - Math.min(FILAS, estado.cola.length) + ocultas;
    $('n-cola').textContent = estado.cola.length ? '(' + estado.cola.length + (resto > 0 ? ', +' + resto + ' más' : '') + ')' : '';
  }
  function progreso() {
    const s = estado && estado.sonando, barra = $('progreso');
    if (!s || !barra || !s.duracion_ms || !s.empezo_en) return;
    const reloj = estado.ahora ? Date.parse(estado.ahora) - estadoRecibido : 0;          // corrige el reloj del TV con el del servidor
    const pasado = Date.now() - Date.parse(s.empezo_en) + reloj;
    barra.style.width = Math.max(0, Math.min(100, (pasado / s.duracion_ms) * 100)) + '%';
  }
  let estadoRecibido = Date.now();

  async function refrescar() {
    try {
      const { data, error } = await db.rpc('rockola_estado');
      if (error) throw error;
      estado = data; estadoRecibido = Date.now(); pintar();
    } catch (e) { /* sin red: se queda lo último y reintenta */ }
  }

  // QR hacia la pantalla de pedidos (misma carpeta).
  const destino = new URL('index.html', location.href); destino.search = '';
  $('url').textContent = destino.href.replace(/^https?:\/\//, '');
  const lib = document.createElement('script');
  lib.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  lib.onload = () => new window.QRCode($('qr'), { text: destino.href, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M });
  lib.onerror = () => { $('qr').hidden = true; };      // sin internet para la librería: queda el enlace escrito
  document.head.append(lib);

  // Aviso de pedido nuevo (un cartel a la vez; los demás esperan su turno)
  const avisos = []; let avisando = false;
  function avisar(quien, titulo) {
    if (avisos.length < 4) avisos.push([quien, titulo]);
    if (avisando) return;
    avisando = true;
    (function siguiente() {
      const a = avisos.shift(), caja = $('aviso');
      if (!a) { avisando = false; caja.hidden = true; return; }
      limpiar(caja); caja.hidden = true; void caja.offsetWidth;        // reinicia la animación
      caja.append(el('b', {}, a[0] + ' pidió'), el('span', {}, a[1]));
      caja.hidden = false;
      setTimeout(siguiente, 7200);
    })();
  }

  // Fondos en video (carpeta fondos/), con rotación y tema de color por fondo. Configurable en config.js:
  //   TV_FONDOS: [{ src: 'fondos/x.mp4', tema: 'noche' | 'dorado' }, ...]   TV_FONDO_ROTAR_S: segundos entre fondos (240 por defecto)
  // Para probar uno solo: ?fondo=fondos/x.mp4&tema=dorado
  (function () {
    const cfg = window.Rockola.cfg || {}, params = window.Rockola.params;
    let lista = Array.isArray(cfg.TV_FONDOS) && cfg.TV_FONDOS.length ? cfg.TV_FONDOS : [
      { src: 'fondos/noche-colina.mp4', poster: 'fondos/noche-colina.webp', tema: 'noche' },
      { src: 'fondos/caballero-flores.mp4', poster: 'fondos/caballero-flores.webp', tema: 'dorado' },
    ];
    if (params.get('fondo')) lista = [{ src: params.get('fondo'), tema: params.get('tema') || 'noche' }];
    lista = lista.filter((f) => f && typeof f.src === 'string' && /^(https:\/\/|[\w./%-]+$)/.test(f.src))
      .map((f) => Object.assign({}, f, { url: /^https:/.test(f.src) ? f.src : new URL(f.src, location.href).href }));
    if (!lista.length) return;
    const caja = $('fondo');
    const videos = [0, 1].map(() => { const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true; v.setAttribute('muted', ''); caja.append(v); return v; });
    const segundos = Number(params.get('rotar') || cfg.TV_FONDO_ROTAR_S) || 240;
    let actual = -1, cual = 0;
    function mostrar(i) {
      const f = lista[i], nuevo = videos[cual], viejo = videos[1 - cual];
      if (f.poster) caja.style.backgroundImage = 'url("' + new URL(f.poster, location.href).href + '")';
      nuevo.onerror = () => { if (lista.length > 1) { lista.splice(i, 1); actual = -1; mostrar(0); } };
      nuevo.src = f.url;
      nuevo.play().catch(() => {});
      const listo = () => {
        nuevo.classList.add('on'); viejo.classList.remove('on');
        setTimeout(() => { document.body.className = document.body.className.replace(/tema-\w+/g, '') + ' tema-' + (f.tema === 'dorado' ? 'dorado' : 'noche'); }, 900);
        setTimeout(() => { if (!viejo.classList.contains('on')) { viejo.pause(); viejo.removeAttribute('src'); viejo.load(); } }, 2600);      // el que se fue deja de decodificar
      };
      if (nuevo.readyState >= 3) listo(); else nuevo.addEventListener('canplay', listo, { once: true });
      actual = i; cual = 1 - cual;
    }
    mostrar(0);
    if (lista.length > 1) setInterval(() => mostrar((actual + 1) % lista.length), segundos * 1000);
  })();
  refrescar();
  setInterval(refrescar, 3000);
  setInterval(progreso, 1000);
  // La pantalla vive días enteros: recarga completa de madrugada para evitar fugas de memoria.
  setInterval(() => { const h = new Date().getHours(); if (h === 5 && new Date().getMinutes() === 30) location.reload(); }, 60000);
})();
