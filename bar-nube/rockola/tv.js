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
    if (window.Mascotas) {
      window.Mascotas.pausa(!estado.activa);
      window.Mascotas.cola(estado.cola.length);
      const clave = estado.sonando ? [estado.sonando.titulo, estado.sonando.artista, estado.sonando.empezo_en].join('|') : '';
      if (clave && cancionActual !== null && clave !== cancionActual) { window.Mascotas.cancion(); cambio = true; } else cambio = false;
      cancionActual = clave || (cancionActual === null ? '' : cancionActual);
      // Pedidos nuevos en la cola: una mascota lleva el cartel (la primera carga no anuncia nada)
      const llaves = estado.cola.map((p) => [p.titulo, p.artista, p.mesa, p.nombre].join('|'));
      if (vistos) estado.cola.forEach((p, i) => { if (!vistos.has(llaves[i])) window.Mascotas.pedido(p.nombre || (p.mesa ? 'Mesa ' + p.mesa : ''), p.titulo); });
      vistos = new Set(llaves);
    }
    const a = $('ahora'); limpiar(a);
    const s = estado.sonando;
    if (s) {
      a.append(...[
        s.portada && /^https:\/\//.test(s.portada) ? el('img', { class: 'tv-portada' + (cambio ? ' nueva' : ''), src: s.portada, alt: '' }) : el('div', { class: 'tv-portada' }),
        el('div', { class: 'tv-titulo' }, s.titulo),
        el('div', { class: 'tv-artista' }, s.artista || ''),
        quien(s) ? el('div', { class: 'tv-quien' }, 'Pidió: ' + quien(s)) : null,
        el('div', { class: 'tv-barra' }, el('i', { id: 'progreso' }))].filter(Boolean));
      progreso();
    } else {
      a.append(el('div', { class: 'tv-silencio' }, 'Silencio sospechoso… ¡pon la primera! 🎶'));
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

  if (window.Mascotas) window.Mascotas.iniciar();
  refrescar();
  setInterval(refrescar, 3000);
  setInterval(progreso, 1000);
  // La pantalla vive días enteros: recarga completa de madrugada para evitar fugas de memoria.
  setInterval(() => { const h = new Date().getHours(); if (h === 5 && new Date().getMinutes() === 30) location.reload(); }, 60000);
})();
