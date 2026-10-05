// Sin librerías. Dos ideas:
//  1. El servidor entrega el HTML de la pantalla ("panel"); el navegador solo lo reemplaza.
//  2. Cada toque (data-accion) se manda al servidor y la respuesta es el panel ya actualizado.
// Además el panel se vuelve a pedir cada pocos segundos, así todos los celulares ven lo mismo.
(() => {
  const panel = document.querySelector('[data-panel]');
  const csrf = document.querySelector('meta[name=csrf-token]')?.content;
  const REFRESCO_MS = 4000;

  // Categoría elegida en la pantalla de cuenta; vive aquí para sobrevivir a cada reemplazo.
  let categoria = '';
  const aplicarFiltro = () => {
    if (!panel) return;
    panel.querySelectorAll('[data-cat]').forEach((p) => { p.hidden = categoria !== '' && p.dataset.cat !== categoria; });
    panel.querySelectorAll('[data-filtro]').forEach((c) => c.classList.toggle('activo', c.dataset.filtro === categoria));
  };

  let ultima = 0;     // número de la última petición enviada
  let enCurso = 0;    // peticiones sin respuesta todavía

  async function pedir(url, cuerpo) {
    const mia = ++ultima;
    enCurso++;
    try {
      const r = await fetch(url, cuerpo
        ? { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: cuerpo }
        : { headers: { 'X-Requested-With': 'fetch' } });
      if (r.headers.get('content-type')?.includes('json')) {
        const { ir } = await r.json();
        if (ir) location.href = ir;
        return;
      }
      // Si ya salió una petición más nueva, esta respuesta quedó vieja: se descarta.
      if (!r.ok || mia < ultima) return;
      panel.innerHTML = await r.text();
      aplicarFiltro();
    } catch (e) {
      // Sin red un momento: el siguiente refresco lo corrige.
    } finally {
      enCurso--;
    }
  }

  function enviar(boton, extra = {}) {
    const d = boton.dataset;
    if (d.confirmar && !confirm(d.confirmar)) return;
    const datos = new URLSearchParams({ accion: d.accion, producto: d.producto || '', metodo: d.metodo || '', ...extra });
    if (d.pregunta) {
      const nombre = prompt(d.pregunta);
      if (!nombre) return;
      datos.set('nombre', nombre);
    }
    navigator.vibrate?.(15);
    pedir(panel.dataset.accionUrl, datos);
  }

  document.addEventListener('click', (e) => {
    const filtro = e.target.closest('[data-filtro]');
    if (filtro && panel) { categoria = filtro.dataset.filtro; aplicarFiltro(); return; }
    const boton = e.target.closest('button[data-accion]');
    if (boton && panel) enviar(boton);

    // Diálogo de inventario
    const mover = e.target.closest('[data-mover]');
    if (mover) {
      const dlg = document.getElementById('dialogo-mover');
      dlg.querySelector('#mover-titulo').textContent = mover.dataset.nombre;
      dlg.querySelector('#mover-producto').value = mover.dataset.mover;
      dlg.querySelector('#mover-costo').value = '';
      dlg.querySelector('#mover-cantidad').value = '';
      dlg.querySelector('input[value=compra]').checked = true;
      dlg.showModal();
    }
    if (e.target.closest('[data-cerrar]')) e.target.closest('dialog').close();
  });

  document.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-accion]');
    if (s && panel) enviar(s, { cliente: s.value });
  });

  if (panel) {
    aplicarFiltro();
    setInterval(() => {
      // No pisar un menú abierto ni una petición en vuelo, ni gastar batería con la pantalla apagada.
      if (document.hidden || enCurso || document.activeElement?.matches('select, input')) return;
      pedir(panel.dataset.url);
    }, REFRESCO_MS);
  }
})();
