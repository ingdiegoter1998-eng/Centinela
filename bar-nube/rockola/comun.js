// Piezas compartidas entre la pantalla del cliente y la del reproductor.
(function () {
  const cfg = window.BAR_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const demo = params.has('demo');                       // ?demo → canciones de mentira, sin Spotify

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storageKey: 'rockola-sesion', autoRefreshToken: true },
  });

  const DEMO = [
    ['Gasolina', 'Daddy Yankee'], ['La Tortura', 'Shakira'], ['Hotel California', 'Eagles'],
    ['Bohemian Rhapsody', 'Queen'], ['Pa\' Bailar', 'Bajofondo'], ['Smooth Criminal', 'Michael Jackson'],
    ['Lamento Boliviano', 'Enanitos Verdes'], ['Wonderwall', 'Oasis'],
  ].map(([titulo, artista], i) => ({ proveedor: 'demo', pista_id: 'demo' + i, titulo, artista, portada: '', duracion_ms: 15000 }));

  async function buscar(q) {
    q = q.trim();
    if (q.length < 2) return [];
    if (demo) return DEMO.filter((p) => (p.titulo + ' ' + p.artista).toLowerCase().includes(q.toLowerCase()));
    const r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/rockola-buscar?q=${encodeURIComponent(q)}`, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || 'No se pudo buscar');
    return d;
  }

  // Crea un elemento sin interpretar HTML (los títulos vienen de fuera: nada de innerHTML con ellos).
  function el(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    for (const h of hijos.flat()) if (h != null) e.append(h);
    return e;
  }
  function pista(p, extra, clases) {
    const portada = p.portada && /^https:\/\//.test(p.portada) ? el('img', { src: p.portada, alt: '', loading: 'lazy' }) : el('div', { class: 'sin' });
    return el('div', { class: 'pista ' + (clases || '') }, portada,
      el('div', { class: 'info' }, el('b', {}, p.titulo), el('span', {}, p.artista || '')), extra);
  }
  function toast(texto, tipo) {
    const t = el('div', { class: 'toast ' + (tipo || '') }, texto);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }
  const limpiar = (e) => { while (e.firstChild) e.firstChild.remove(); };
  const pedirError = (e) => (e && e.message ? e.message : 'Algo falló');

  window.Rockola = { cfg, params, demo, db, buscar, el, pista, toast, limpiar, pedirError };
})();
