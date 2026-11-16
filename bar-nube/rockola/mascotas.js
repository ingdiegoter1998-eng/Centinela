// Mascotas del Callejón del Gato: un gato, un perro salchicha, un loro y un ratón (dibujos propios en SVG) que pasean por la
// calle de la pantalla, duermen, comen, se rascan, bailan cuando cambia la canción, anuncian los pedidos con un cartel y a veces
// se persiguen. Sin librerías ni build. Las piernas/cabezas se animan con CSS (compositor) y JS solo mueve 4 transformaciones
// a ~30 fps; con la pestaña oculta no hace nada. Diseñado para quedarse encendido días enteros.
(function () {
  'use strict';
  const FRAME = 1000 / 30;
  const $ = (id) => document.getElementById(id);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const elige = (l) => l[Math.floor(Math.random() * l.length)];

  // ---------- Dibujos (todos miran a la derecha; el JS los voltea) ----------
  const OJOS = (a, b, r) => `<g class="ojo"><ellipse cx="${a[0]}" cy="${a[1]}" rx="${r}" ry="${r * 1.3}" fill="#1a1209"/><circle cx="${a[0] + 1.5}" cy="${a[1] - 2}" r="1.6" fill="#fff"/></g>
    <g class="ojo"><ellipse cx="${b[0]}" cy="${b[1]}" rx="${r}" ry="${r * 1.3}" fill="#1a1209"/><circle cx="${b[0] + 1.5}" cy="${b[1] - 2}" r="1.6" fill="#fff"/></g>`;
  const SVG = {
    gato: `<svg viewBox="0 0 200 140" aria-hidden="true">
      <g class="cola"><path d="M45 95 C8 92 2 52 26 40" stroke="#e8923a" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M14 52 q4 -8 12 -12" stroke="#b8651c" stroke-width="13" fill="none" stroke-linecap="round" opacity=".55"/></g>
      <rect class="p p1" x="52" y="98" width="15" height="33" rx="7.5" fill="#d9812a"/><rect class="p p2" x="74" y="98" width="15" height="33" rx="7.5" fill="#e8923a"/>
      <rect class="p p2" x="116" y="98" width="15" height="33" rx="7.5" fill="#d9812a"/><rect class="p p1" x="138" y="98" width="15" height="33" rx="7.5" fill="#e8923a"/>
      <ellipse cx="97" cy="90" rx="54" ry="30" fill="#e8923a"/>
      <path d="M72 63 q5 13 0 25 M90 61 q5 14 0 28 M108 62 q5 13 0 26" stroke="#b8651c" stroke-width="6" fill="none" stroke-linecap="round"/>
      <ellipse cx="128" cy="108" rx="16" ry="10" fill="#fff1dc"/>
      <g class="cab">
        <polygon points="126,48 130,16 150,38" fill="#e8923a"/><polygon points="150,38 170,16 174,48" fill="#e8923a"/>
        <polygon points="131,40 133,26 144,37" fill="#ff9fb0"/><polygon points="156,37 167,26 169,40" fill="#ff9fb0"/>
        <circle cx="150" cy="62" r="28" fill="#e8923a"/>
        <path d="M137 40 q2 7 -1 11 M150 36 v9 M163 40 q-2 7 1 11" stroke="#b8651c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="150" cy="74" rx="12" ry="8" fill="#fff1dc"/>
        ${OJOS([140, 60], [160, 60], 4.5)}
        <polygon points="146,67 154,67 150,72" fill="#ff7f96"/>
        <path d="M150 72 q-3 5 -8 3 M150 72 q3 5 8 3" stroke="#5a3a20" stroke-width="1.6" fill="none"/>
        <ellipse class="boca" cx="150" cy="78" rx="5" ry="6" fill="#7a2230"/>
        <path d="M128 70 l-18 -3 M128 75 l-18 4 M172 70 l18 -3 M172 75 l18 4" stroke="#fff" stroke-width="1.4" opacity=".8"/>
      </g>
      <g class="prop"><ellipse cx="176" cy="124" rx="12" ry="6" fill="#8fb8de"/><polygon points="188,124 198,117 198,131" fill="#8fb8de"/><circle cx="169" cy="123" r="1.6" fill="#111"/></g>
    </svg>`,
    perro: `<svg viewBox="0 0 250 140" aria-hidden="true">
      <path class="cola" d="M42 92 q-20 -6 -18 -34" stroke="#8b5a3c" stroke-width="10" fill="none" stroke-linecap="round"/>
      <rect class="p p1" x="50" y="108" width="14" height="23" rx="7" fill="#74482d"/><rect class="p p2" x="76" y="108" width="14" height="23" rx="7" fill="#8b5a3c"/>
      <rect class="p p2" x="140" y="108" width="14" height="23" rx="7" fill="#74482d"/><rect class="p p1" x="164" y="108" width="14" height="23" rx="7" fill="#8b5a3c"/>
      <ellipse cx="112" cy="94" rx="76" ry="23" fill="#8b5a3c"/>
      <ellipse cx="116" cy="108" rx="52" ry="9" fill="#a8714d"/>
      <path d="M172 78 q10 -3 20 4 l-4 12 q-10 -4 -18 -2z" fill="#d9322e"/><circle cx="183" cy="94" r="4" fill="#ffd36e"/>
      <g class="cab">
        <ellipse class="oreja" cx="188" cy="70" rx="10" ry="20" fill="#5e3a24" transform="rotate(14 188 70)"/>
        <circle cx="198" cy="68" r="23" fill="#8b5a3c"/>
        <ellipse cx="224" cy="80" rx="21" ry="12" fill="#a8714d"/>
        <circle cx="240" cy="76" r="6" fill="#1a1209"/><circle cx="238" cy="74" r="1.6" fill="#fff"/>
        <path class="lengua" d="M226 88 q4 14 10 6 l-2 -8z" fill="#ff6f8a"/>
        <path d="M216 86 q10 4 20 -2" stroke="#3a2214" stroke-width="2" fill="none"/>
        <ellipse class="ojo" cx="206" cy="62" rx="4.5" ry="5.8" fill="#1a1209"/><circle cx="207.5" cy="60" r="1.6" fill="#fff"/>
        <path d="M198 50 q8 -6 16 0" stroke="#5e3a24" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <g class="prop"><rect x="214" y="123" width="26" height="6" rx="3" fill="#f4ebe4"/><circle cx="213" cy="123" r="4.5" fill="#f4ebe4"/><circle cx="213" cy="129" r="4.5" fill="#f4ebe4"/><circle cx="241" cy="123" r="4.5" fill="#f4ebe4"/><circle cx="241" cy="129" r="4.5" fill="#f4ebe4"/></g>
    </svg>`,
    loro: `<svg viewBox="0 0 120 160" aria-hidden="true">
      <g class="cola"><rect x="48" y="118" width="9" height="38" rx="4" fill="#d9322e" transform="rotate(8 52 118)"/><rect x="60" y="118" width="9" height="40" rx="4" fill="#2f6fd6" transform="rotate(-6 64 118)"/></g>
      <path d="M52 132 v14 M68 132 v14 M44 146 h16 M60 146 h16" stroke="#e8923a" stroke-width="4" stroke-linecap="round" class="p"/>
      <ellipse cx="60" cy="96" rx="31" ry="42" fill="#3cb371"/>
      <ellipse cx="66" cy="104" rx="19" ry="30" fill="#8de6a8"/>
      <g class="ala"><ellipse cx="44" cy="100" rx="15" ry="33" fill="#2e8b57"/><path d="M36 120 q8 22 16 0z" fill="#2f6fd6"/></g>
      <g class="cab">
        <circle cx="60" cy="50" r="25" fill="#3cb371"/>
        <path d="M48 30 q12 -12 26 0 q-12 -3 -26 0" fill="#d9322e"/><path d="M52 28 q8 -16 20 -2 q-10 -5 -20 2" fill="#ffd36e"/>
        <circle cx="68" cy="47" r="8.5" fill="#fff"/><g class="ojo"><circle cx="70" cy="47" r="4.5" fill="#1a1209"/><circle cx="71.5" cy="45.5" r="1.5" fill="#fff"/></g>
        <path class="pico-arriba" d="M78 40 q26 0 18 22 q-8 4 -22 -4z" fill="#ffb347"/>
        <path class="pico-abajo" d="M76 60 q14 2 16 8 q-10 6 -20 -2z" fill="#e8923a"/>
      </g>
    </svg>`,
    raton: `<svg viewBox="0 0 100 60" aria-hidden="true">
      <path class="cola" d="M20 42 q-16 4 -14 -14" stroke="#e8a0b0" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect class="p p1" x="30" y="48" width="7" height="9" rx="3.5" fill="#8a909b"/><rect class="p p2" x="44" y="48" width="7" height="9" rx="3.5" fill="#9aa0aa"/>
      <rect class="p p2" x="56" y="48" width="7" height="9" rx="3.5" fill="#8a909b"/>
      <ellipse cx="46" cy="40" rx="29" ry="16" fill="#9aa0aa"/><ellipse cx="50" cy="48" rx="20" ry="7" fill="#d0d4db"/>
      <g class="cab"><circle cx="76" cy="34" r="12" fill="#9aa0aa"/><circle cx="69" cy="22" r="8" fill="#b9bec7"/><circle cx="69" cy="22" r="4.5" fill="#ffb3c1"/><circle cx="82" cy="23" r="7" fill="#b9bec7"/><circle cx="82" cy="23" r="4" fill="#ffb3c1"/>
        <ellipse cx="88" cy="38" rx="6" ry="5" fill="#b9bec7"/><circle cx="93" cy="37" r="2.6" fill="#ff8fa3"/>
        <ellipse class="ojo" cx="80" cy="32" rx="2.4" ry="3.1" fill="#1a1209"/></g>
      <g class="prop"><polygon points="86,58 106,58 96,44" fill="#ffd34d" transform="translate(-6 0)"/><circle cx="92" cy="54" r="2" fill="#e8a91c"/></g>
    </svg>`,
  };
  const CORAZON = '<svg viewBox="0 0 24 22"><path d="M12 21 C-6 8 4 -4 12 6 C20 -4 30 8 12 21z" fill="#ff5c7c"/></svg>';
  const NOTA = '<svg viewBox="0 0 20 28"><ellipse cx="6" cy="22" rx="5" ry="4" fill="#ffd36e"/><rect x="9.5" y="3" width="2.6" height="19" fill="#ffd36e"/><path d="M12 3 q8 2 6 10 q-1 -5 -6 -5z" fill="#ffd36e"/></svg>';
  const ZZZ = '<svg viewBox="0 0 22 22"><path d="M3 4h15l-13 14h15" stroke="#9db4ff" stroke-width="3.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const MIGA = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#f4ebe4"/></svg>';

  // ---------- Elenco y comportamiento ----------
  // w = ancho en unidades de pantalla (1 u = 1% del ancho); vel en u/s; pesos = qué tan seguido elige cada acción.
  const ELENCO = {
    gato:  { w: 11,  vel: [6, 10],  pesos: { pasea: 4, quieto: 1.5, olfatea: 1.2, rasca: 1.4, come: 1.2, duerme: 0.5, bosteza: 0.8 } },
    perro: { w: 13,  vel: [7, 11],  pesos: { pasea: 4, quieto: 1.2, olfatea: 2.2, rasca: 1.4, come: 1.2, duerme: 0.5, bosteza: 0.8 } },
    loro:  { w: 5.6, vel: [5, 8],   pesos: { pasea: 2, quieto: 2, canta: 2.4, vuela: 1.6, duerme: 0.4, bosteza: 0.5 } },
    raton: { w: 4.4, vel: [9, 15],  pesos: { pasea: 3, quieto: 1, olfatea: 1.5, come: 2, duerme: 0.3 } },
  };
  const DUR = { pasea: [3, 8], quieto: [2, 5], olfatea: [2, 4], rasca: [2, 4], come: [4, 7], duerme: [25, 60], bosteza: [2.4, 2.4], baila: [8, 11], canta: [5, 9], vuela: [3, 5], amigos: [3.5, 3.5], cartel: [8, 8], ruta: [14, 14], persigue: [12, 12], huye: [12, 12] };
  const ESPECIALES = new Set(['ruta', 'cartel', 'persigue', 'huye', 'amigos']);

  let capa, W = 1920, U = 19.2;
  const mascotas = [];
  let vacia = false, largaCola = false, enPausa = false, hayVacia = false;
  let espera = 0, pendientes = [], proxPersecucion = 45, ultimo = 0;

  function crear(tipo) {
    const d = ELENCO[tipo];
    const el = document.createElement('div');
    el.className = 'pet pet-' + tipo;
    el.style.width = 'calc(var(--u) * ' + d.w + ')';
    el.innerHTML = '<div class="voltea">' + SVG[tipo] + '</div><div class="cartel" hidden></div>';
    el.querySelectorAll('.ojo').forEach((o) => { o.style.animationDelay = -rnd(0, 5) + 's'; });
    capa.append(el);
    const p = { tipo, d, el, voltea: el.firstChild, cartel: el.lastChild, x: rnd(0.1, 0.8) * W, y: 0, dir: Math.random() > 0.5 ? 1 : -1, v: 0, estado: '', t: 0, dura: 1, pt: 1, dest: 0, tgt: null, texto: '' };
    mascotas.push(p);
    return p;
  }

  function ancho(p) { return p.d.w * U; }
  function pon(p, e, dura) {
    if (p.estado) p.el.classList.remove('e-' + p.estado);
    p.estado = e; p.t = 0;
    p.dura = dura || (e === 'duerme' && !vacia ? rnd(8, 18) : rnd(...(DUR[e] || [3, 6])));       // siesta corta si hay ambiente
    p.el.classList.add('e-' + e);
    p.cartel.hidden = e !== 'cartel';
    const [a, b] = p.d.vel;
    p.v = e === 'pasea' ? rnd(a, b) * U : e === 'ruta' ? b * 1.4 * U : e === 'persigue' ? b * 2.4 * U : e === 'huye' ? b * 2 * U : e === 'vuela' ? b * 4 * U : 0;
    if (e === 'pasea' && Math.random() > 0.55) p.dir = -p.dir;
    if (e === 'vuela') p.dir = p.x > W / 2 ? -1 : 1;
    p.pt = rnd(0.2, 0.8);
  }

  function escoge(p) {
    const w = Object.assign({}, p.d.pesos);
    if (vacia) { w.duerme = (w.duerme || 0) * 8; w.bosteza = (w.bosteza || 0) * 3; w.pasea = (w.pasea || 0) * 0.3; delete w.canta; }
    else if (largaCola) w.baila = 6;                       // cola larga: fiesta
    if (p.estado === 'bosteza' && vacia) return 'duerme';
    if (p.estado === 'duerme') return 'bosteza';
    let tot = 0; for (const k in w) tot += w[k];
    let r = Math.random() * tot;
    for (const k in w) { if ((r -= w[k]) <= 0) return k; }
    return 'pasea';
  }

  // ---------- Partículas ----------
  function soltar(p, html, clase) {
    const e = document.createElement('div');
    e.className = 'parti ' + clase; e.innerHTML = html;
    e.style.left = rnd(35, 75) + '%'; e.style.setProperty('--dx', rnd(-3, 3) + 'vw');
    e.addEventListener('animationend', () => e.remove());
    p.el.append(e);
  }

  // ---------- Actualización por cuadro ----------
  function mover(p, dt) {
    p.t += dt; p.pt -= dt;
    const e = p.estado, anc = ancho(p);
    // Desplazamiento
    if (e === 'pasea' || e === 'ruta' || e === 'vuela') {
      if (e === 'ruta') { p.dir = p.dest > p.x ? 1 : -1; if (Math.abs(p.dest - p.x) < U * 0.8) pon(p, 'cartel'); }
      p.x += p.dir * p.v * dt;
    } else if (e === 'persigue' || e === 'huye') {
      const t = p.tgt;
      if (!t || (t.estado !== 'huye' && t.estado !== 'persigue')) return fin(p);
      if (e === 'persigue') { p.dir = t.x > p.x ? 1 : -1; p.x += p.dir * p.v * dt; if (Math.abs(t.x - p.x) < anc * 0.6 || p.t > p.dura) { amigos(p, t); return; } }
      else { p.x += p.dir * p.v * dt; if (p.x < U || p.x > W - anc - U) p.dir = -p.dir; }
    }
    p.x = Math.max(0, Math.min(W - anc, p.x));
    if ((e === 'pasea' || e === 'vuela' || e === 'ruta') && (p.x <= 0 || p.x >= W - anc)) p.dir = p.x <= 0 ? 1 : -1;
    p.y = (e === 'vuela' || (e === 'huye' && p.tipo === 'loro')) ? Math.abs(Math.sin(p.t * 1.1)) * 6 * U : 0;
    // Partículas por acción
    if (p.pt <= 0) {
      if (e === 'baila' || e === 'canta') { soltar(p, NOTA, 'nota'); p.pt = rnd(0.5, 1.1); }
      else if (e === 'duerme') { soltar(p, ZZZ, 'zzz'); p.pt = rnd(1.6, 2.4); }
      else if (e === 'come') { soltar(p, MIGA, 'miga'); p.pt = rnd(0.3, 0.6); }
      else if (e === 'amigos') { soltar(p, CORAZON, 'cora'); p.pt = rnd(0.25, 0.5); }
      else p.pt = 1;
    }
    if (p.t > p.dura) fin(p);
  }
  function fin(p) {
    pon(p, escoge(p));
  }
  function amigos(a, b) { [a, b].forEach((p) => { p.tgt = null; pon(p, 'amigos'); }); a.dir = b.x > a.x ? 1 : -1; b.dir = -a.dir; }

  function dibujar(p) {
    p.el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + (-p.y).toFixed(1) + 'px,0)';
    p.voltea.style.transform = p.dir < 0 ? 'scaleX(-1)' : '';
  }

  // ---------- Director: carteles de pedidos y persecuciones ----------
  function director(dt) {
    // Cartel: una mascota lleva el pedido al centro-izquierda (lejos del QR)
    if (pendientes.length && !mascotas.some((p) => p.estado === 'cartel' || p.estado === 'ruta')) {
      espera += dt;
      let libre = mascotas.filter((p) => p.tipo !== 'raton' && p.estado !== 'duerme' && !ESPECIALES.has(p.estado));
      if (!libre.length && espera > 4) libre = mascotas.filter((p) => p.tipo !== 'raton' && !ESPECIALES.has(p.estado));   // si todos duermen, despierta a uno
      const p = libre.length ? elige(libre) : null;
      if (p) {
        const it = pendientes.shift(); espera = 0;
        p.texto = it; p.cartel.innerHTML = it;
        p.dest = rnd(0.12, 0.42) * W; pon(p, 'ruta');
      }
    }
    // Persecución cada ~70-110 s si hay ambiente
    proxPersecucion -= dt;
    if (proxPersecucion <= 0 && !vacia) {
      proxPersecucion = 5;                                   // si no se puede ahora (alguien duerme), reintenta pronto
      const par = Math.random() > 0.5 ? ['perro', 'raton'] : ['gato', 'loro'];
      const [a, b] = par.map((t) => mascotas.find((m) => m.tipo === t));
      if (![a, b].some((m) => m.estado === 'duerme' || ESPECIALES.has(m.estado))) {
        b.x = a.x > W / 2 ? a.x - rnd(8, 14) * U : a.x + rnd(8, 14) * U;
        b.dir = b.x > a.x ? 1 : -1; a.dir = b.dir; a.tgt = b; b.tgt = a;
        pon(b, 'huye');
        pon(a, 'persigue'); proxPersecucion = rnd(70, 110);
      }
    }
  }

  // Fondo: edificios en silueta con ventanas encendidas (semilla fija, se dibuja una sola vez).
  function ciudad() {
    const svg = $('ciudad'); let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let x = 0, o = '';
    while (x < 1000) {
      const w = 30 + r() * 50, h = 40 + r() * 110;
      o += '<rect x="' + x.toFixed(0) + '" y="' + (200 - h).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" fill="#0c0f22"/>';
      for (let wy = 200 - h + 10; wy < 190; wy += 16) for (let wx = x + 6; wx < x + w - 8; wx += 14) if (r() > 0.7) o += '<rect x="' + wx.toFixed(0) + '" y="' + wy.toFixed(0) + '" width="6" height="8" fill="' + (r() > 0.5 ? '#ffd36e' : '#ff9a3c') + '" opacity=".85"/>';
      x += w + r() * 6;
    }
    svg.innerHTML = o;
  }
  function medir() {
    W = window.innerWidth; U = Math.min(W / 100, window.innerHeight * 1.7778 / 100);       // igual que --u del CSS
    mascotas.forEach((p) => { p.x = Math.min(p.x, W - ancho(p)); });
  }

  function cuadro(ahora) {
    requestAnimationFrame(cuadro);
    if (document.hidden || ahora - ultimo < FRAME - 2) return;
    const dt = Math.min(0.25, (ahora - ultimo) / 1000); ultimo = ahora;
    director(dt);
    for (const p of mascotas) { mover(p, dt); dibujar(p); }
  }

  // ---------- API ----------
  const Mascotas = {
    iniciar() {
      capa = $('mascotas'); ciudad(); medir();
      ['perro', 'gato', 'raton', 'loro'].forEach((t, i) => { const p = crear(t); p.x = (0.12 + i * 0.22) * W; pon(p, t === 'gato' ? 'duerme' : elige(['pasea', 'quieto'])); });
      let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(medir, 300); });
      requestAnimationFrame(cuadro);
    },
    // Cambió la canción: todos bailan (el loro canta) unos segundos, escalonados.
    cancion() {
      mascotas.forEach((p, i) => {
        if (p.estado === 'cartel' || p.estado === 'ruta') return;
        setTimeout(() => { p.tgt = null; pon(p, p.tipo === 'loro' ? 'canta' : 'baila'); }, i * 350);
      });
    },
    // Alguien pidió una canción: una mascota lleva el cartel.
    pedido(quien, titulo) {
      if (pendientes.length > 4) return;
      const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      pendientes.push('<b>' + e(quien || 'Alguien') + '</b> pidió<br><span>' + e(titulo) + '</span>');
    },
    // Largo de la cola: vacía → a dormir; larga (5+) → fiesta.
    cola(n) {
      const antes = vacia;
      vacia = n === 0; largaCola = n >= 5;
      if (vacia && !antes) setTimeout(() => { if (vacia) mascotas.forEach((p, i) => setTimeout(() => { if (!ESPECIALES.has(p.estado) && p.estado !== 'duerme') pon(p, 'bosteza'); }, i * 1500)); }, 15000);
      if (!vacia && antes) mascotas.forEach((p) => { if (p.estado === 'duerme') pon(p, 'quieto', 1.5); });
    },
    perseguir() { proxPersecucion = 0; },
    estados() { return mascotas.map((p) => p.tipo + ':' + p.estado + '@' + Math.round(p.x) + (p.dest ? '>' + Math.round(p.dest) : '')).concat('pend=' + pendientes.length); },
    pausa(p) { if (p && !enPausa) { vacia = true; } enPausa = p; },
  };
  window.Mascotas = Mascotas;
})();
