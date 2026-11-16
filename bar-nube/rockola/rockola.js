(function () {
  const { params, db, buscar, el, pista, toast, limpiar, pedirError } = window.Rockola;
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
  let pidiendo = false;

  async function pedir(p, boton) {
    if (pidiendo) return;
    pidiendo = true; boton.disabled = true;
    try {
      const { error } = await db.rpc('rockola_pedir', {
        p_cliente: cliente, p_mesa: mesa, p_proveedor: p.proveedor, p_pista: p.pista_id,
        p_titulo: p.titulo, p_artista: p.artista, p_portada: p.portada, p_duracion_ms: p.duracion_ms,
      });
      if (error) throw error;
      toast('¡Listo! «' + p.titulo + '» quedó en la cola', 'ok');
      limpiar($('resultados')); $('q').value = '';
      await refrescar();
    } catch (e) {
      toast(pedirError(e), 'error'); boton.disabled = false;
    } finally { pidiendo = false; }
  }

  function pintar() {
    if (!estado) return;
    $('pausa').hidden = estado.activa;
    limpiar($('ahora'));
    $('ahora').append(estado.sonando ? pista(estado.sonando, null, 'ahora') : el('p', { class: 'vacio' }, 'Silencio sospechoso… ¡pon la primera! 🎶'));
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

  $('form-buscar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const box = $('resultados');
    limpiar(box); box.append(el('p', { class: 'vacio' }, 'Buscando…'));
    try {
      const lista = await buscar($('q').value);
      limpiar(box);
      if (!lista.length) box.append(el('p', { class: 'vacio' }, 'Nada por ahí. Prueba con otro nombre.'));
      lista.forEach((p) => {
        const b = el('button', { class: 'btn principal chico', type: 'button' }, 'Pedir');
        b.addEventListener('click', () => pedir(p, b));
        box.append(pista(p, b));
      });
    } catch (e) { limpiar(box); box.append(el('p', { class: 'vacio' }, pedirError(e))); }
  });

  refrescar();
  setInterval(() => { if (!document.hidden) refrescar(); }, SONDEO_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
})();
