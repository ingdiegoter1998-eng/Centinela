(function () {
  const { cfg, params, db, el, pista, limpiar } = window.Rockola;
  const SONDEO_MS = 4000;

  // Id anónimo del celular: solo sirve para el límite de pedidos y para marcar «los míos».
  let cliente = '';
  try { cliente = localStorage.getItem('rockola-cliente') || ''; } catch (e) { /* sin almacenamiento */ }
  if (!cliente) {
    cliente = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    try { localStorage.setItem('rockola-cliente', cliente); } catch (e) { /* se pierde al recargar; no pasa nada */ }
  }
  const mesa = (params.get('mesa') || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 20);
  document.getElementById('mesa-txt').textContent = mesa ? 'Mesa ' + mesa : 'Pide lo que quieras escuchar';

  const $ = (id) => document.getElementById(id);
  let estado = null;

  function pintar() {
    if (!estado) return;
    $('pausa').hidden = estado.activa;
    $('bafle').hidden = !(estado.reproductor && estado.reproductor.conectado && !estado.reproductor.ok);
    limpiar($('ahora'));
    $('ahora').append(estado.sonando ? pista(estado.sonando, null, 'ahora') : el('p', { class: 'vacio' }, 'Silencio sospechoso… ¡pon la primera!'));
    limpiar($('cola'));
    estado.cola.forEach((p, i) => $('cola').append(pista(p, el('div', { class: 'n' }, String(i + 1)), p.mio ? 'mio' : '')));
    if (!estado.cola.length) $('cola').append(el('p', { class: 'vacio' }, 'La cola está vacía.'));
    $('n-cola').textContent = estado.cola.length ? '(' + estado.cola.length + ')' : '';
    const mias = estado.cola.filter((p) => p.mio).length;
    $('limite').textContent = mias ? `Llevas ${mias} de ${estado.max_pendientes} pedidos en cola` : '';
  }

  async function refrescar() {
    try {
      const { data, error } = await db.rpc('rockola_estado', { p_cliente: cliente });
      if (error) throw error;
      estado = data; pintar();
    } catch (e) { /* sin red: se reintenta solo en el próximo ciclo */ }
  }

  // Pedir es por WhatsApp (con puntos). El botón abre el chat con el bot y ya trae un saludo entre comillas.
  const wa = String(cfg.ROCKOLA_WHATSAPP || '').replace(/\D/g, '');
  if (wa) $('btn-wa').href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('"hola"');
  else $('pedir-wa').hidden = true;

  refrescar();
  setInterval(() => { if (!document.hidden) refrescar(); }, SONDEO_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
})();
