// Panel de control del administrador: dashboard, reportes, facturas, inventario, rockola, puntos y comisión.
// Es una página aparte (misma sesión que la app): solo entra el rol «admin». Todo lo que lee o escribe pasa por la
// base (RLS + funciones con es_admin()), esta pantalla solo lo muestra. Las funciones están en supabase/admin.sql.
(() => {
  const cfg = window.BAR_CONFIG || {};
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : opts?.signal }) },
  });

  // ── Utilidades ───────────────────────────────────────────────────────────────────────────
  const ZONA = 'America/Bogota';
  const dominio = '@bar.local', sufijo = '-bar';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  const corto = (n) => {
    const a = Math.abs(n || 0), s = n < 0 ? '-' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
    if (a >= 1e3) return `${s}$${Math.round(a / 1e3)} k`;
    return `${s}$${Math.round(a)}`;
  };
  const num = (n) => Math.round(n || 0).toLocaleString('es-CO');
  const plural = (n, s, p) => (n === 1 ? s : p);
  const ES = (a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
  const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', '': '—' };
  const utc = (ymd) => new Date(`${ymd}T12:00:00Z`);
  const aYmd = (d) => d.toISOString().slice(0, 10);
  const sumaDias = (ymd, n) => aYmd(new Date(utc(ymd).getTime() + n * 864e5));
  const lunes = (ymd) => sumaDias(ymd, -((utc(ymd).getUTCDay() + 6) % 7));
  const primeroMes = (ymd) => `${ymd.slice(0, 8)}01`;
  const restaMeses = (ymd, n) => { const d = utc(primeroMes(ymd)); d.setUTCMonth(d.getUTCMonth() - n); return aYmd(d); };
  const diaCorto = (ymd) => utc(ymd).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '').replace(' de ', ' ');
  const mesCorto = (ymd) => utc(ymd).toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
  const diaLargo = (ymd) => utc(ymd).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: ZONA }) : '');
  const celularCO = (v) => { const d = String(v || '').replace(/\D/g, ''); return /^3\d{9}$/.test(d) ? `57${d}` : d; };
  const verCelular = (c) => (/^57(3\d{9})$/.test(c || '') ? c.replace(/^57(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3') : c || '');
  const pct = (a, b) => (b ? (a - b) / b : null);

  let perfil = null;
  let hoyCache = null;
  const jornada = async () => (hoyCache ||= await rpc('jornada_actual', { p_corte: 6 }));

  async function leer(consulta) {
    const { data, error } = await (consulta.retry ? consulta.retry(false) : consulta);
    if (error) throw new Error(error.message || 'Error de conexión');
    return data;
  }
  const rpc = (nombre, args) => leer(db.rpc(nombre, args));

  function aviso(texto, tipo = 'error') {
    const el = document.createElement('div');
    el.className = `aviso ${tipo}`;
    el.textContent = texto;
    el.onclick = () => el.remove();
    document.getElementById('avisos').appendChild(el);
    setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 3500);
  }

  // CSV: cada tabla exportable se registra aquí al dibujarse (separador «;» para que Excel en español lo abra bien).
  const csvs = {};
  function descargar(nombre) {
    const c = csvs[nombre];
    if (!c) return;
    const celda = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const texto = '﻿' + [c.cols, ...c.filas].map((f) => f.map(celda).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `${nombre}-${c.sufijo || ''}.csv`.replace(/-\.csv$/, '.csv');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const botonCsv = (nombre, cols, filas, sufijo = '') => {
    csvs[nombre] = { cols, filas, sufijo };
    return `<button type="button" class="btn chico" data-act="csv" data-nombre="${nombre}">CSV</button>`;
  };

  // ── Gráficos (SVG a mano, sin librerías) ─────────────────────────────────────────────────
  function escala(max) {
    if (max <= 0) return { tope: 1, paso: 0.25 };
    const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(bruto));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
    return { tope: paso * 4, paso };
  }
  // series: [{ clase, nombre, valores }]; etiquetas: texto por grupo; fmt: formato del eje y del detalle
  function barras(series, etiquetas, fmt = corto) {
    const W = 760, H = 270, L = 58, R = 8, T = 10, B = 30;
    const max = Math.max(0, ...series.flatMap((s) => s.valores));
    const { tope, paso } = escala(max);
    const n = etiquetas.length, ancho = (W - L - R) / Math.max(n, 1), k = series.length;
    const bw = Math.min(34, (ancho * 0.78) / k);
    const y = (v) => T + (H - T - B) * (1 - v / tope);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = paso * i;
      g += `<line class="eje" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    etiquetas.forEach((et, i) => {
      const x0 = L + ancho * i + (ancho - bw * k) / 2;
      series.forEach((s, j) => {
        const v = s.valores[i] || 0, h = Math.max(0, y(0) - y(v));
        g += `<rect class="${s.clase}" x="${x0 + bw * j}" y="${y(v)}" width="${bw - 2}" height="${h}" rx="3"><title>${esc(et)} · ${esc(s.nombre)}: ${esc(fmt(v))}</title></rect>`;
      });
      if (n <= 14 || i % Math.ceil(n / 14) === 0) g += `<text x="${L + ancho * i + ancho / 2}" y="${H - 10}" text-anchor="middle">${esc(et)}</text>`;
    });
    const leyenda = series.length > 1 ? `<p class="leyenda">${series.map((s) => `<span><i class="${s.clase}" style="background:var(${{ b1: '--ambar', b2: '--verde', b3: '--azul' }[s.clase]})"></i>${esc(s.nombre)}</span>`).join('')}</p>` : '';
    return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.nombre).join(' y '))}">${g}</svg>${leyenda}`;
  }
  const tira = (v, max) => `<span class="mini"><span class="tira" style="width:${max > 0 ? Math.max(2, Math.round((v / max) * 120)) : 2}px"></span></span>`;
  const delta = (cur, prev, buenoSube = true) => {
    const d = pct(cur, prev);
    if (d === null) return '<small>sin dato anterior</small>';
    const sube = d >= 0;
    return `<small class="${sube === buenoSube ? 'sube' : 'baja'}">${sube ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))} % vs. el periodo anterior</small>`;
  };
  const kpi = (titulo, valor, extra = '') => `<div class="kpi"><span>${esc(titulo)}</span><b>${valor}</b>${extra}</div>`;

  // ── Rango de fechas compartido (Reportes, Facturas, Rockola, Trabajador) ────────────────
  let rango = null;     // { desde, hasta }, jornadas
  async function rangoActual() {
    if (!rango) { const h = await jornada(); rango = { desde: sumaDias(h, -6), hasta: h, preset: '7' }; }
    return rango;
  }
  async function aplicarPreset(p) {
    const h = await jornada();
    const r = {
      hoy: [h, h], ayer: [sumaDias(h, -1), sumaDias(h, -1)], '7': [sumaDias(h, -6), h], '30': [sumaDias(h, -29), h],
      mes: [primeroMes(h), h], mespasado: [restaMeses(h, 1), sumaDias(primeroMes(h), -1)],
    }[p];
    if (r) rango = { desde: r[0], hasta: r[1], preset: p };
  }
  function filtroRango(r) {
    const P = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['mespasado', 'Mes pasado']];
    return `<div class="barra-filtros">
      <span class="pildoras">${P.map(([k, t]) => `<button type="button" data-act="preset" data-preset="${k}" class="${r.preset === k ? 'on' : ''}">${t}</button>`).join('')}</span>
      <input type="date" name="desde" value="${r.desde}" data-rango> <span class="nota">a</span> <input type="date" name="hasta" value="${r.hasta}" data-rango>
    </div><p class="nota">Jornadas de 6:00 AM a 6:00 AM: la madrugada cuenta para la noche anterior. El bar descansa lunes y martes.</p>`;
  }

  const tabla = (cabeza, filas, vacio = 'Sin datos.') => (filas.length
    ? `<div class="scroll"><table class="datos"><thead><tr>${cabeza.map(([t, n]) => `<th class="${n ? 'n' : ''}">${t}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`
    : `<p class="vacio">${vacio}</p>`);

  // ── Vistas ───────────────────────────────────────────────────────────────────────────────
  const vistas = {};

  // Resumen: dashboard semana a semana o mes a mes ------------------------------------------
  vistas.resumen = {
    async datos([paso]) {
      paso = paso === 'mes' ? 'mes' : 'semana';
      const hoy = await jornada();
      const desde = paso === 'mes' ? restaMeses(hoy, 11) : sumaDias(lunes(hoy), -77);
      const [serie, detalle, rk] = await Promise.all([
        rpc('admin_serie', { p_desde: desde, p_hasta: hoy, p_paso: paso }),
        rpc('admin_detalle', { p_desde: desde, p_hasta: hoy }),
        rpc('admin_rockola', { p_desde: desde, p_hasta: hoy, p_paso: paso }),
      ]);
      return { paso, hoy, desde, serie, detalle, rk };
    },
    html({ paso, desde, hoy, serie, detalle, rk }) {
      const etq = (p) => (paso === 'mes' ? mesCorto(p) : diaCorto(p));
      const cur = serie[serie.length - 1] || {}, prev = serie[serie.length - 2] || {};
      const rcur = rk.serie[rk.serie.length - 1] || {}, rprev = rk.serie[rk.serie.length - 2] || {};
      const nombrePeriodo = paso === 'mes' ? 'Este mes' : 'Esta semana';
      const activos = serie.filter((s) => s.jornadas > 0);
      const prom = activos.length ? activos.reduce((t, s) => t + s.venta, 0) / activos.length : 0;
      const mejor = activos.slice().sort((a, b) => b.venta - a.venta)[0];
      const dias = [1, 2, 3, 4, 5, 6, 7].map((d) => detalle.dias_semana.find((x) => x.dow === d) || { dow: d, jornadas: 0, venta: 0, venta_por_jornada: 0 });
      const maxDia = Math.max(1, ...dias.map((d) => d.venta_por_jornada));
      const prods = detalle.productos.slice(0, 8), maxProd = Math.max(1, ...prods.map((p) => p.venta));
      const totCat = detalle.categorias.reduce((t, c) => t + c.venta, 0) || 1;
      return `<div class="cab"><h1>Resumen</h1>
        <span class="pildoras"><a href="#/resumen/semana" class="${paso === 'semana' ? 'on' : ''}">Semana a semana</a><a href="#/resumen/mes" class="${paso === 'mes' ? 'on' : ''}">Mes a mes</a></span></div>
      <p class="nota">${paso === 'mes' ? 'Últimos 12 meses' : 'Últimas 12 semanas (lunes a domingo)'}, desde ${esc(diaLargo(desde))} hasta ${esc(diaLargo(hoy))}. El último periodo está en curso.</p>
      <div class="rejilla">
        ${kpi(`${nombrePeriodo}: vendido`, pesos(cur.venta), delta(cur.venta, prev.venta))}
        ${kpi(`${nombrePeriodo}: ganancia`, pesos(cur.ganancia), delta(cur.ganancia, prev.ganancia))}
        ${kpi('Facturas', num(cur.n_facturas), delta(cur.n_facturas, prev.n_facturas))}
        ${kpi('Promedio por factura', pesos(cur.ticket), delta(cur.ticket, prev.ticket))}
        ${kpi('Por noche abierta', pesos(cur.jornadas ? cur.venta / cur.jornadas : 0), `<small>${cur.jornadas || 0} ${plural(cur.jornadas, 'noche', 'noches')} con ventas</small>`)}
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Ventas y ganancia</h2>
          ${barras([{ clase: 'b1', nombre: 'Vendido', valores: serie.map((s) => s.venta) }, { clase: 'b2', nombre: 'Ganancia', valores: serie.map((s) => s.ganancia) }], serie.map((s) => etq(s.periodo)))}
          <p class="nota">Promedio de los periodos con ventas: ${pesos(prom)}${mejor ? ` · mejor: ${esc(etq(mejor.periodo))} con ${pesos(mejor.venta)}` : ''}.</p></section>
        <section class="panel"><h2>Rockola: pedidos y personas</h2>
          ${barras([{ clase: 'b3', nombre: 'Canciones pedidas', valores: rk.serie.map((s) => s.pedidos) }, { clase: 'b1', nombre: 'Personas distintas', valores: rk.serie.map((s) => s.personas) }], rk.serie.map((s) => etq(s.periodo)), num)}
          <p class="nota">${nombrePeriodo}: ${num(rcur.pedidos)} canciones (${rprev.pedidos ?? 0} antes) · ${num(rcur.puntos_gastados)} puntos gastados · ${num(rcur.puntos_dados)} puntos entregados.</p></section>
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Cómo se mueve la semana</h2><p class="nota">Venta promedio por noche abierta, en todo el periodo mostrado.</p>
          ${tabla([['Día'], ['Noches', 1], ['Promedio por noche', 1], ['']], dias.map((d) => `<tr><td>${DIAS[d.dow]}</td><td class="n">${d.jornadas || '—'}</td>
            <td class="n">${d.jornadas ? pesos(d.venta_por_jornada) : '<span class="etiqueta">cerrado</span>'}</td><td>${tira(d.venta_por_jornada, maxDia)}</td></tr>`))}</section>
        <section class="panel"><h2>Lo que más deja</h2><p class="nota">Top 8 por venta en todo el periodo.</p>
          ${tabla([['Producto'], ['Unid.', 1], ['Vendido', 1], ['']], prods.map((p) => `<tr><td>${esc(p.nombre)}<small>${esc(p.categoria)} · gana ${pesos(p.ganancia)}</small></td><td class="n">${num(p.unidades)}</td><td class="n">${pesos(p.venta)}</td><td>${tira(p.venta, maxProd)}</td></tr>`), 'Sin ventas.')}</section>
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Por categoría</h2>
          ${tabla([['Categoría'], ['Vendido', 1], ['%', 1], ['Ganancia', 1]], detalle.categorias.map((c) => `<tr><td>${esc(c.nombre)}</td><td class="n">${pesos(c.venta)}</td><td class="n">${Math.round((c.venta / totCat) * 100)} %</td><td class="n">${pesos(c.ganancia)}</td></tr>`), 'Sin ventas.')}</section>
        <section class="panel"><h2>Rockola: lo que más se pide</h2>
          ${tabla([['Artista'], ['Género'], ['Veces', 1]], rk.top_artistas.slice(0, 8).map((a) => `<tr><td>${esc(a.artista)}</td><td><span class="etiqueta">${esc(a.genero)}</span></td><td class="n">${a.veces}</td></tr>`), 'Aún no hay pedidos.')}
          <p class="nota">Más detalle en la pestaña Rockola.</p></section>
      </div>
      <section class="panel"><h2>Periodo por periodo</h2>${tabla([['Desde'], ['Noches', 1], ['Facturas', 1], ['Vendido', 1], ['Ganancia', 1], ['Promedio', 1]],
        serie.slice().reverse().map((s) => `<tr><td>${esc(paso === 'mes' ? mesCorto(s.periodo) : `Semana del ${diaCorto(s.periodo)}`)}</td><td class="n">${s.jornadas}</td><td class="n">${s.n_facturas}</td><td class="n">${pesos(s.venta)}</td><td class="n">${pesos(s.ganancia)}</td><td class="n">${pesos(s.ticket)}</td></tr>`))}
        ${botonCsv('resumen-periodos', ['Desde', 'Noches', 'Facturas', 'Vendido', 'Costo', 'Ganancia', 'Promedio'], serie.map((s) => [s.periodo, s.jornadas, s.n_facturas, s.venta, s.costo, s.ganancia, s.ticket]), paso)}</section>`;
    },
  };

  // Reportes: un rango, todas las cifras --------------------------------------------------------
  vistas.reportes = {
    async datos() {
      const r = await rangoActual();
      const dias = Math.round((utc(r.hasta) - utc(r.desde)) / 864e5) + 1;
      const paso = dias > 62 ? 'mes' : dias > 21 ? 'semana' : 'dia';
      const [detalle, serie] = await Promise.all([
        rpc('admin_detalle', { p_desde: r.desde, p_hasta: r.hasta }),
        rpc('admin_serie', { p_desde: r.desde, p_hasta: r.hasta, p_paso: paso }),
      ]);
      return { r, detalle, serie, paso };
    },
    html({ r, detalle, serie, paso }) {
      const suf = `${r.desde}_${r.hasta}`;
      const venta = serie.reduce((t, s) => t + s.venta, 0), gan = serie.reduce((t, s) => t + s.ganancia, 0), fac = serie.reduce((t, s) => t + s.n_facturas, 0);
      const etq = (p) => (paso === 'mes' ? mesCorto(p) : paso === 'semana' ? diaCorto(p) : diaLargo(p));
      return `<div class="cab"><h1>Reportes</h1></div>${filtroRango(r)}
      <div class="rejilla">${kpi('Vendido', pesos(venta))}${kpi('Ganancia', pesos(gan), `<small>${venta ? Math.round((gan / venta) * 100) : 0} % de margen</small>`)}${kpi('Facturas', num(fac))}${kpi('Promedio por factura', pesos(fac ? venta / fac : 0))}</div>
      <section class="panel"><h2>${paso === 'dia' ? 'Día a día' : paso === 'semana' ? 'Semana a semana' : 'Mes a mes'}</h2>
        ${barras([{ clase: 'b1', nombre: 'Vendido', valores: serie.map((s) => s.venta) }, { clase: 'b2', nombre: 'Ganancia', valores: serie.map((s) => s.ganancia) }], serie.map((s) => etq(s.periodo)))}
        ${botonCsv('ventas-por-periodo', ['Periodo', 'Facturas', 'Vendido', 'Costo', 'Ganancia'], serie.map((s) => [s.periodo, s.n_facturas, s.venta, s.costo, s.ganancia]), suf)}</section>
      <div class="rejilla dos">
        <section class="panel"><h2>Por producto</h2>${tabla([['Producto'], ['Categoría'], ['Unid.', 1], ['Vendido', 1], ['Ganancia', 1]],
          detalle.productos.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td><td class="n">${num(p.unidades)}</td><td class="n">${pesos(p.venta)}</td><td class="n">${pesos(p.ganancia)}</td></tr>`), 'Sin ventas en este rango.')}
          ${botonCsv('ventas-por-producto', ['Producto', 'Categoría', 'Unidades', 'Vendido', 'Ganancia'], detalle.productos.map((p) => [p.nombre, p.categoria, p.unidades, p.venta, p.ganancia]), suf)}</section>
        <div>
          <section class="panel"><h2>Por categoría</h2>${tabla([['Categoría'], ['Unid.', 1], ['Vendido', 1], ['Ganancia', 1]],
            detalle.categorias.map((c) => `<tr><td>${esc(c.nombre)}</td><td class="n">${num(c.unidades)}</td><td class="n">${pesos(c.venta)}</td><td class="n">${pesos(c.ganancia)}</td></tr>`))}
            ${botonCsv('ventas-por-categoria', ['Categoría', 'Unidades', 'Vendido', 'Ganancia'], detalle.categorias.map((c) => [c.nombre, c.unidades, c.venta, c.ganancia]), suf)}</section>
          <section class="panel" style="margin-top:12px"><h2>Cómo pagaron</h2>${tabla([['Método'], ['Facturas', 1], ['Total', 1]],
            detalle.metodos.map((m) => `<tr><td>${METODOS[m.metodo] || esc(m.metodo)}</td><td class="n">${m.n}</td><td class="n">${pesos(m.total)}</td></tr>`))}</section>
          <section class="panel" style="margin-top:12px"><h2>Por día de la semana</h2>${tabla([['Día'], ['Noches', 1], ['Promedio por noche', 1]],
            detalle.dias_semana.map((d) => `<tr><td>${DIAS[d.dow]}</td><td class="n">${d.jornadas}</td><td class="n">${pesos(d.venta_por_jornada)}</td></tr>`))}</section>
        </div>
      </div>`;
    },
  };

  // Facturas: buscar y revisar -----------------------------------------------------------------
  vistas.facturas = {
    async datos() { const r = await rangoActual(); return { r, fs: await rpc('admin_facturas', { p_desde: r.desde, p_hasta: r.hasta }) }; },
    html({ r, fs }) {
      const cajeros = [...new Set(fs.map((f) => f.cobrada_por))].sort(ES);
      const filas = fs.map((f) => `<tr data-txt="${esc(`${f.numero ?? ''} ${f.mesa} ${f.cliente || ''} ${f.cobrada_por} ${f.estado}`.toLowerCase())}" data-estado="${f.estado}" data-metodo="${f.metodo_pago}" data-cajero="${esc(f.cobrada_por)}" data-total="${f.estado === 'pagada' ? f.total : 0}">
        <td>${f.estado === 'pagada' ? `<a href="../#/factura/${f.id}">N.º ${f.numero}</a>` : '<span class="etiqueta mala">Anulada</span>'}</td>
        <td>${esc(cuando(f.cerrada_en))}<small>jornada del ${esc(diaLargo(f.jornada))}</small></td><td>${esc(f.mesa)}</td><td>${esc(f.cliente || 'Anónimo')}</td>
        <td>${f.estado === 'pagada' ? METODOS[f.metodo_pago] : '—'}</td><td>${esc(f.cobrada_por)}</td><td class="n">${f.unidades}</td><td class="n">${pesos(f.total)}</td></tr>`);
      return `<div class="cab"><h1>Facturas</h1></div>${filtroRango(r)}
      <div class="barra-filtros"><input type="search" id="f-q" placeholder="Buscar: número, mesa, cliente, cajero" style="flex:1;min-width:220px">
        <select id="f-estado"><option value="">Todas</option><option value="pagada">Pagadas</option><option value="anulada">Anuladas</option></select>
        <select id="f-metodo"><option value="">Cualquier pago</option>${Object.entries(METODOS).filter(([k]) => k).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
        <select id="f-cajero"><option value="">Quien cobró: todos</option>${cajeros.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
      <p class="nota" id="f-resumen"></p>
      <section class="panel">${tabla([['Factura'], ['Cierre'], ['Mesa'], ['Cliente'], ['Pago'], ['Cobró / anuló'], ['Unid.', 1], ['Total', 1]], filas, 'No hay facturas en este rango.')}
        ${botonCsv('facturas', ['Número', 'Estado', 'Cierre', 'Jornada', 'Mesa', 'Cliente', 'Pago', 'Cobró o anuló', 'Unidades', 'Total'],
          fs.map((f) => [f.numero ?? '', f.estado, f.cerrada_en, f.jornada, f.mesa, f.cliente || 'Anónimo', f.metodo_pago, f.cobrada_por, f.unidades, f.total]), `${r.desde}_${r.hasta}`)}</section>`;
    },
    despues() {
      const filas = [...app.querySelectorAll('tbody tr')];
      const q = document.getElementById('f-q'), es = document.getElementById('f-estado'), me = document.getElementById('f-metodo'), ca = document.getElementById('f-cajero');
      const aplicar = () => {
        let n = 0, t = 0;
        filas.forEach((tr) => {
          const ok = (!q.value || tr.dataset.txt.includes(q.value.toLowerCase())) && (!es.value || tr.dataset.estado === es.value)
            && (!me.value || tr.dataset.metodo === me.value) && (!ca.value || tr.dataset.cajero === ca.value);
          tr.hidden = !ok;
          if (ok) { n++; t += Number(tr.dataset.total); }
        });
        document.getElementById('f-resumen').textContent = `${n} ${plural(n, 'factura', 'facturas')} · ${pesos(t)} cobrados`;
      };
      [q, es, me, ca].forEach((el) => el.addEventListener('input', aplicar));
      aplicar();
    },
  };

  // Inventario ----------------------------------------------------------------------------------
  vistas.inventario = {
    async datos() {
      const [productos, movs] = await Promise.all([
        leer(db.from('productos').select('id, nombre, precio, costo, stock, stock_minimo, controla_stock, unidad, insumo_id, se_vende, activo, categorias(nombre, orden)').eq('activo', true)),
        leer(db.from('movimientos').select('id, motivo, cantidad, costo_unitario, nota, fecha, productos(nombre, unidad)').order('fecha', { ascending: false }).limit(40)),
      ]);
      productos.sort((a, b) => a.categorias.orden - b.categorias.orden || ES(a.categorias.nombre, b.categorias.nombre) || ES(a.nombre, b.nombre));
      return { productos, movs };
    },
    html({ productos, movs }) {
      const cont = productos.filter((p) => p.controla_stock && !p.insumo_id);
      const cant = (p) => (p.unidad === 'ml' ? `${(p.stock / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} L` : num(p.stock));
      const valor = cont.filter((p) => p.stock > 0 && p.unidad !== 'ml').reduce((t, p) => t + p.stock * p.costo, 0);
      const neg = cont.filter((p) => p.stock < 0), bajo = cont.filter((p) => p.stock >= 0 && p.stock_minimo > 0 && p.stock <= p.stock_minimo);
      const fila = (p) => `<tr><td>${esc(p.nombre)}<small>${esc(p.categorias.nombre)}</small></td><td class="n ${p.stock < 0 ? 'rojo' : ''}">${cant(p)}</td>
        <td class="n">${p.stock_minimo || '—'}</td><td class="n">${p.se_vende ? pesos(p.costo) : '—'}</td><td class="n">${p.se_vende ? pesos(p.precio) : '—'}</td>
        <td class="n">${p.se_vende && p.precio ? `${Math.round(((p.precio - p.costo) / p.precio) * 100)} %` : '—'}</td><td class="n">${p.stock > 0 && p.unidad !== 'ml' ? pesos(p.stock * p.costo) : '—'}</td></tr>`;
      return `<div class="cab"><h1>Inventario</h1><a class="btn" href="../#/inventario">Cargar compras o contar</a></div>
      <div class="rejilla">${kpi('Valor a costo', pesos(valor))}${kpi('Por reponer', String(bajo.length), '<small>en o bajo el mínimo</small>')}${kpi('Con stock negativo', String(neg.length), '<small>suelen ser compras sin cargar</small>')}${kpi('Productos controlados', String(cont.length))}</div>
      ${neg.length || bajo.length ? `<section class="panel"><h2>Atención</h2><p>${[...neg.map((p) => `<span class="etiqueta mala">${esc(p.nombre)}: ${cant(p)}</span>`), ...bajo.map((p) => `<span class="etiqueta">${esc(p.nombre)}: ${cant(p)}</span>`)].join(' ')}</p>
        <p class="nota">Las ventas están completas: un stock negativo significa que falta cargar la compra, no que falte anotar una venta.</p></section>` : ''}
      <section class="panel" style="margin-top:12px"><h2>Existencias</h2>${tabla([['Producto'], ['Hay', 1], ['Mínimo', 1], ['Costo', 1], ['Precio', 1], ['Margen', 1], ['Valor', 1]], productos.filter((p) => p.controla_stock || p.se_vende).map(fila))}
        ${botonCsv('inventario', ['Producto', 'Categoría', 'Existencia', 'Mínimo', 'Costo', 'Precio'], productos.map((p) => [p.nombre, p.categorias.nombre, p.stock, p.stock_minimo, p.costo, p.precio]))}</section>
      <section class="panel" style="margin-top:12px"><h2>Últimos movimientos</h2>${tabla([['Cuándo'], ['Producto'], ['Tipo'], ['Cantidad', 1], ['Costo u.', 1], ['Nota']],
        movs.map((m) => `<tr><td>${esc(cuando(m.fecha))}</td><td>${esc(m.productos?.nombre)}</td><td><span class="etiqueta">${m.motivo === 'compra' ? 'Compra' : 'Conteo / ajuste'}</span></td>
          <td class="n">${m.cantidad > 0 ? '+' : ''}${m.productos?.unidad === 'ml' ? `${m.cantidad / 1000} L` : m.cantidad}</td><td class="n">${m.costo_unitario ? pesos(m.costo_unitario) : '—'}</td><td>${esc(m.nota)}</td></tr>`), 'Aún no hay movimientos.')}</section>`;
    },
  };

  // Rockola -------------------------------------------------------------------------------------
  const idSpotify = (v) => { const m = String(v).match(/track[/:]([A-Za-z0-9]{10,30})/); return m ? m[1] : String(v).trim(); };
  vistas.rockola = {
    async datos() {
      const r = await rangoActual();
      const paso = Math.round((utc(r.hasta) - utc(r.desde)) / 864e5) > 45 ? 'mes' : 'semana';
      const [e, rep, porClasificar, generos, artistas, negra, recientes] = await Promise.all([
        rpc('rockola_estado', { p_cliente: '' }),
        rpc('admin_rockola', { p_desde: r.desde, p_hasta: r.hasta, p_paso: paso }),
        leer(db.from('v_rockola_por_clasificar').select('*').order('pedidos', { ascending: false })),
        leer(db.from('rockola_generos').select('*').order('multiplicador')),
        leer(db.from('rockola_artistas').select('*').not('genero', 'is', null).order('nombre').limit(300)),
        leer(db.from('rockola_prohibidas').select('*').order('titulo')),
        leer(db.from('rockola_cola').select('id, proveedor, pista_id, titulo, artista, estado, creado_en, nombre, mesa').order('id', { ascending: false }).limit(25)),
      ]);
      return { r, paso, e, rep, porClasificar, generos, artistas, negra, recientes };
    },
    html({ r, paso, e, rep, porClasificar, generos, artistas, negra, recientes }) {
      const opcionesGenero = (sel) => generos.map((g) => `<option value="${esc(g.genero)}" ${g.genero === sel ? 'selected' : ''}>${esc(g.genero)} (×${g.multiplicador})</option>`).join('');
      const quien = (p) => [p.mesa ? `Mesa ${esc(p.mesa)}` : '', esc(p.nombre || '')].filter(Boolean).join(' · ');
      const prohibir = (p) => `<button type="button" class="btn peligro chico" data-act="prohibir" data-proveedor="${esc(p.proveedor || 'spotify')}" data-pista="${esc(p.pista_id)}" data-titulo="${esc(p.titulo)}">A lista negra</button>`;
      const etq = (p) => (paso === 'mes' ? mesCorto(p) : diaCorto(p));
      const maxArt = Math.max(1, ...rep.top_artistas.map((a) => a.veces));
      const totGen = rep.generos.reduce((t, g) => t + g.veces, 0) || 1;
      const estados = { pendiente: 'En cola', sonando: 'Sonando', sonada: 'Sonó', saltada: 'Saltada', quitada: 'Quitada' };
      return `<div class="cab"><h1>Rockola</h1><span class="nota">${e.activa ? 'Recibiendo pedidos' : '<b>En pausa</b>'}</span></div>
      <div class="acciones" style="margin-bottom:10px">
        <button type="button" class="btn" data-act="activar" data-activa="${e.activa ? 'false' : 'true'}">${e.activa ? 'Pausar pedidos' : 'Reanudar pedidos'}</button>
        ${e.sonando ? `<button type="button" class="btn peligro" data-act="saltar" data-confirmar="¿Saltar «${esc(e.sonando.titulo)}»? Sus puntos no se devuelven.">Saltar la que suena</button>` : ''}
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Ahora y en cola (${e.cola.length})</h2>
          <p><b>${e.sonando ? esc(e.sonando.titulo) : 'Nada suena'}</b>${e.sonando ? `<small>${esc(e.sonando.artista)}${quien(e.sonando) ? ` · ${quien(e.sonando)}` : ''}</small>` : ''}</p>
          ${tabla([['#'], ['Canción'], ['']], e.cola.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.titulo)}<small>${esc(p.artista)}${quien(p) ? ` · ${quien(p)}` : ''}</small></td>
            <td class="n"><button type="button" class="btn chico" data-act="quitar" data-id="${p.id}" data-confirmar="¿Quitar «${esc(p.titulo)}» de la cola? Si se pagó con puntos, se devuelven.">Quitar</button> ${prohibir({ ...p, proveedor: 'spotify' })}</td></tr>`), 'La cola está vacía.')}</section>
        <section class="panel"><h2>Artistas por clasificar (${porClasificar.length})</h2>
          <p class="nota">Mientras no tengan género se cobran a precio base. Elegir el género fija el precio de todas sus canciones.</p>
          ${tabla([['Artista'], ['Pedidos', 1], ['Género']], porClasificar.map((a) => `<tr><td>${esc(a.nombre)}</td><td class="n">${a.pedidos}</td>
            <td><form class="caja" data-form="clasificar" data-proveedor="${esc(a.proveedor)}" data-artista="${esc(a.artista_id)}" data-nombre="${esc(a.nombre)}"><select name="genero" required><option value="">Elegir…</option>${opcionesGenero('')}</select><button class="btn chico principal">Guardar</button></form></td></tr>`), 'Todos los artistas tienen género.')}
          ${artistas.length ? `<details><summary class="nota">Ver y cambiar los ${artistas.length} ya clasificados</summary>${tabla([['Artista'], ['Género']], artistas.map((a) => `<tr><td>${esc(a.nombre || a.artista_id)}</td>
            <td><form class="caja" data-form="clasificar" data-proveedor="${esc(a.proveedor)}" data-artista="${esc(a.artista_id)}" data-nombre="${esc(a.nombre)}"><select name="genero">${opcionesGenero(a.genero)}<option value="">(sin género)</option></select><button class="btn chico">Cambiar</button></form></td></tr>`))}</details>` : ''}</section>
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Géneros y precios</h2><p class="nota">Precio de una canción = precio base × multiplicador del género (si hay varios artistas, el más caro).</p>
          ${tabla([['Género'], ['Multiplicador'], ['Nota'], ['']], generos.map((g) => `<tr><td colspan="4"><form class="caja" data-form="genero"><b style="min-width:90px">${esc(g.genero)}</b><input type="hidden" name="genero" value="${esc(g.genero)}">
            <input name="mult" type="number" step="0.25" min="0.25" value="${g.multiplicador}" style="width:90px"><input name="nota" value="${esc(g.nota)}" placeholder="Nota" maxlength="200">
            <button class="btn chico">Guardar</button>${['general', 'ranchera'].includes(g.genero) ? '' : `<button type="button" class="btn peligro chico" data-act="borrar-genero" data-genero="${esc(g.genero)}" data-confirmar="¿Borrar el género «${esc(g.genero)}»? Sus artistas quedan sin clasificar.">Borrar</button>`}</form></td></tr>`))}
          <form class="caja" data-form="genero" style="margin-top:10px"><label>Nuevo género<input name="genero" placeholder="cumbia" required maxlength="40"></label>
            <label>Multiplicador<input name="mult" type="number" step="0.25" min="0.25" value="1" style="width:90px" required></label><label>Nota<input name="nota" maxlength="200"></label><button class="btn principal">Agregar</button></form></section>
        <section class="panel"><h2>Lista negra (${negra.length})</h2><p class="nota">Canciones que nadie puede pedir. Al agregarla sale de la cola y se devuelven los puntos.</p>
          ${tabla([['Canción'], ['Motivo'], ['']], negra.map((n) => `<tr><td>${esc(n.titulo || n.pista_id)}</td><td>${esc(n.motivo)}</td>
            <td class="n"><button type="button" class="btn chico" data-act="perdonar" data-proveedor="${esc(n.proveedor)}" data-pista="${esc(n.pista_id)}">Sacar</button></td></tr>`), 'La lista negra está vacía.')}
          <form class="caja" data-form="prohibir" style="margin-top:10px"><label>Link o ID de Spotify<input name="pista" placeholder="https://open.spotify.com/track/…" required></label>
            <label>Título<input name="titulo" maxlength="300"></label><label>Motivo<input name="motivo" maxlength="200"></label><button class="btn peligro">Prohibir</button></form></section>
      </div>
      <section class="panel" style="margin-top:12px"><h2>Pedidos recientes</h2>${tabla([['Cuándo'], ['Canción'], ['Estado'], ['']], recientes.map((p) => `<tr><td>${esc(cuando(p.creado_en))}</td><td>${esc(p.titulo)}<small>${esc(p.artista)}${quien(p) ? ` · ${quien(p)}` : ''}</small></td>
        <td><span class="etiqueta">${estados[p.estado] || p.estado}</span></td><td class="n">${prohibir(p)}</td></tr>`), 'Aún no hay pedidos.')}</section>
      <h2 class="categoria">Reporte del rango</h2>${filtroRango(r)}
      <div class="rejilla">${kpi('Canciones pedidas', num(rep.serie.reduce((t, s) => t + s.pedidos, 0)))}${kpi('Sonaron', num(rep.serie.reduce((t, s) => t + s.sonadas, 0)), `<small>${rep.saltadas} saltadas · ${rep.quitadas} quitadas</small>`)}
        ${kpi('Puntos gastados', num(rep.serie.reduce((t, s) => t + s.puntos_gastados, 0)))}${kpi('Puntos entregados', num(rep.serie.reduce((t, s) => t + s.puntos_dados, 0)), '<small>bienvenida, consumo y cortesías</small>')}</div>
      <div class="rejilla dos">
        <section class="panel"><h2>Pedidos por ${paso === 'mes' ? 'mes' : 'semana'}</h2>${barras([{ clase: 'b3', nombre: 'Pedidos', valores: rep.serie.map((s) => s.pedidos) }, { clase: 'b2', nombre: 'Sonaron', valores: rep.serie.map((s) => s.sonadas) }], rep.serie.map((s) => etq(s.periodo)), num)}</section>
        <section class="panel"><h2>Por género</h2>${tabla([['Género'], ['Pedidos', 1], ['%', 1]], rep.generos.map((g) => `<tr><td>${esc(g.genero)}</td><td class="n">${g.veces}</td><td class="n">${Math.round((g.veces / totGen) * 100)} %</td></tr>`), 'Sin pedidos.')}</section>
      </div>
      <div class="rejilla dos">
        <section class="panel"><h2>Canciones más pedidas</h2>${tabla([['Canción'], ['Veces', 1]], rep.top_canciones.map((c) => `<tr><td>${esc(c.titulo)}<small>${esc(c.artista)}</small></td><td class="n">${c.veces}</td></tr>`), 'Sin pedidos.')}
          ${botonCsv('rockola-canciones', ['Canción', 'Artista', 'Veces'], rep.top_canciones.map((c) => [c.titulo, c.artista, c.veces]), `${r.desde}_${r.hasta}`)}</section>
        <section class="panel"><h2>Artistas más pedidos</h2>${tabla([['Artista'], ['Género'], ['Veces', 1], ['']], rep.top_artistas.map((a) => `<tr><td>${esc(a.artista)}</td><td><span class="etiqueta">${esc(a.genero)}</span></td><td class="n">${a.veces}</td><td>${tira(a.veces, maxArt)}</td></tr>`), 'Sin pedidos.')}</section>
      </div>`;
    },
  };

  // Puntos y clientes -------------------------------------------------------------------------------
  const MOTIVOS = ['Cumpleaños', 'Cliente frecuente', 'Compensación', 'Promoción', 'Prueba', 'Ajuste'];
  vistas.puntos = {
    async datos([celular]) {
      const [saldos, libro, personas, perfiles] = await Promise.all([
        leer(db.from('v_rockola_saldos').select('*').order('saldo', { ascending: false }).limit(500)),
        leer(db.from('rockola_puntos').select('*').order('id', { ascending: false }).limit(celular ? 150 : 40).then((x) => x)),
        leer(db.from('rockola_personas').select('celular, nombre')),
        leer(db.from('perfiles').select('id, nombre')),
      ]);
      const detalle = celular ? await leer(db.from('rockola_puntos').select('*').eq('celular', celular).order('id', { ascending: false }).limit(150)) : null;
      return { celular, saldos, libro, nombres: Object.fromEntries(personas.map((p) => [p.celular, p.nombre])), quienes: Object.fromEntries(perfiles.map((p) => [p.id, p.nombre])), detalle };
    },
    html({ celular, saldos, libro, nombres, quienes, detalle }) {
      const MOT = { bienvenida: 'Bienvenida', consumo: 'Por consumo', cortesia: 'Cortesía', pedido: 'Pidió canción', reembolso: 'Reembolso' };
      const circulacion = saldos.reduce((t, s) => t + s.saldo, 0);
      const regalados = libro.filter((l) => l.motivo === 'cortesia' && l.delta > 0).reduce((t, l) => t + l.delta, 0);
      const filaLibro = (l, conPersona) => `<tr><td>${esc(cuando(l.creado_en))}</td>${conPersona ? `<td><a href="#/puntos/${l.celular}">${esc(nombres[l.celular] || verCelular(l.celular))}</a></td>` : ''}
        <td><span class="etiqueta ${l.delta < 0 ? 'mala' : 'buena'}">${MOT[l.motivo] || l.motivo}</span></td><td class="n">${l.delta > 0 ? '+' : ''}${l.delta}</td>
        <td>${esc(l.nota)}${l.creado_por && quienes[l.creado_por] ? `<small>por ${esc(quienes[l.creado_por])}</small>` : ''}</td></tr>`;
      const persona = detalle && saldos.find((s) => s.celular === celular);
      return `<div class="cab"><h1>Puntos de los clientes</h1></div>
      <div class="rejilla">${kpi('Personas registradas', num(saldos.length))}${kpi('Puntos en circulación', num(circulacion), `<small>≈ ${pesos(circulacion * 1000)} de música</small>`)}${kpi('Regalados (últimos movimientos)', num(regalados))}</div>
      <section class="panel"><h2>Dar puntos</h2><p class="nota">Solo el administrador. Un punto equivale a $1.000; una canción normal son 8 puntos. Queda anotado quién los dio y por qué.</p>
        <form class="caja" data-form="dar" id="form-dar">
          <label>Celular<input name="celular" inputmode="tel" placeholder="3001234567" required autocomplete="off" value="${esc(celular ? verCelular(celular).replace(/^57 /, '') : '')}"></label>
          <label>Nombre (si es nuevo)<input name="nombre" maxlength="60" placeholder="Opcional"></label>
          <label>Puntos<input name="puntos" type="number" inputmode="numeric" required placeholder="16"></label>
          <label>Motivo<select name="motivo">${MOTIVOS.map((m) => `<option>${m}</option>`).join('')}<option>Otro</option></select></label>
          <label>Detalle<input name="nota" maxlength="120" placeholder="Opcional"></label>
          <button class="btn principal">Dar puntos</button></form>
        <div class="atajos"><span class="nota">Atajos:</span>${[[8, '1 canción'], [16, '2 canciones'], [24, '3 canciones o 1 ranchera'], [40, '5 canciones']].map(([n, t]) => `<button type="button" class="btn chico" data-act="atajo" data-puntos="${n}">${n} · ${t}</button>`).join('')}<button type="button" class="btn chico peligro" data-act="atajo" data-puntos="-8">−8 (ajuste)</button></div>
        <p class="nota" id="saldo-vivo"></p></section>
      ${detalle ? `<section class="panel" style="margin-top:12px"><div class="cab"><h2>${esc(nombres[celular] || verCelular(celular))}</h2><a class="btn chico" href="#/puntos">Cerrar</a></div>
        <p>${verCelular(celular)} · saldo <b>${persona ? persona.saldo : 0}</b> · recibió ${persona ? persona.recibidos : 0} · gastó ${persona ? persona.gastados : 0}</p>
        ${tabla([['Cuándo'], ['Tipo'], ['Puntos', 1], ['Detalle']], detalle.map((l) => filaLibro(l, false)), 'Sin movimientos.')}</section>` : ''}
      <div class="rejilla dos" style="margin-top:12px">
        <section class="panel"><h2>Saldos</h2><div class="barra-filtros"><input type="search" id="p-q" placeholder="Buscar nombre o celular" style="flex:1"></div>
          ${tabla([['Cliente'], ['Saldo', 1], ['Gastó', 1], ['Última vez']], saldos.map((s) => `<tr data-txt="${esc(`${s.nombre} ${s.celular}`.toLowerCase())}"><td><a href="#/puntos/${s.celular}">${esc(s.nombre || 'Sin nombre')}</a><small>${verCelular(s.celular)}</small></td>
            <td class="n"><b>${s.saldo}</b></td><td class="n">${s.gastados}</td><td>${s.ultima_vez ? esc(cuando(s.ultima_vez)) : '—'}</td></tr>`), 'Aún no hay clientes con puntos.')}
          ${botonCsv('puntos-saldos', ['Celular', 'Nombre', 'Saldo', 'Recibidos', 'Gastados'], saldos.map((s) => [s.celular, s.nombre, s.saldo, s.recibidos, s.gastados]))}</section>
        <section class="panel"><h2>Últimos movimientos</h2>${tabla([['Cuándo'], ['Cliente'], ['Tipo'], ['Puntos', 1], ['Detalle']], libro.slice(0, 40).map((l) => filaLibro(l, true)), 'Sin movimientos.')}</section>
      </div>`;
    },
    despues() {
      const q = document.getElementById('p-q');
      q?.addEventListener('input', () => app.querySelectorAll('tr[data-txt]').forEach((tr) => { tr.hidden = !tr.dataset.txt.includes(q.value.toLowerCase()); }));
      const cel = document.querySelector('#form-dar [name=celular]');
      let t;
      const buscar = async () => {
        const c = celularCO(cel.value), el = document.getElementById('saldo-vivo');
        if (!/^\d{10,15}$/.test(c)) { el.textContent = ''; return; }
        try {
          const [p, filas] = await Promise.all([leer(db.from('rockola_personas').select('nombre').eq('celular', c).maybeSingle()), leer(db.from('rockola_puntos').select('delta').eq('celular', c))]);
          el.textContent = p ? `${p.nombre || 'Sin nombre'}: tiene ${filas.reduce((s, x) => s + x.delta, 0)} puntos.` : 'Cliente nuevo: se registra y recibe además los puntos de bienvenida.';
        } catch { el.textContent = ''; }
      };
      cel?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 350); });
      if (cel?.value) buscar();
    },
  };

  // Trabajador: comisión y control --------------------------------------------------------------
  vistas.trabajador = {
    async datos() {
      const r = await rangoActual();
      const [com, detalle, reglas, cats] = await Promise.all([
        rpc('admin_comision', { p_desde: r.desde, p_hasta: r.hasta }),
        rpc('admin_detalle', { p_desde: r.desde, p_hasta: r.hasta }),
        leer(db.from('comision_reglas').select('categoria_id, pct, base, monto, nota')),
        leer(db.from('categorias').select('id, nombre').order('orden')),
      ]);
      return { r, com, detalle, reglas, cats };
    },
    html({ r, com, detalle, reglas, cats }) {
      const nombreCat = Object.fromEntries(cats.map((c) => [c.id, c.nombre]));
      const libres = cats.filter((c) => !reglas.some((x) => x.categoria_id === c.id));
      const BASE = { ganancia: 'de la ganancia', venta: 'de la venta', unidad: 'fijos por cada unidad' };
      const valorRegla = (c) => (c.base === 'unidad' ? pesos(c.monto) : `${c.pct} %`);
      const baseOpc = (sel) => `<option value="ganancia" ${sel === 'ganancia' ? 'selected' : ''}>% de la ganancia</option><option value="venta" ${sel === 'venta' ? 'selected' : ''}>% de la venta</option><option value="unidad" ${sel === 'unidad' ? 'selected' : ''}>$ fijos por unidad</option>`;
      return `<div class="cab"><h1>Trabajador</h1></div>${filtroRango(r)}
      <div class="rejilla">${kpi('Comisión del rango', pesos(com.total))}${kpi('Facturas anuladas', String(detalle.anuladas.length), `<small>${pesos(detalle.anuladas.reduce((t, a) => t + a.total, 0))} en cuentas descartadas</small>`)}</div>
      <div class="rejilla dos">
        <section class="panel"><h2>Comisión por categoría</h2>${tabla([['Categoría'], ['Regla'], ['Sobre', 1], ['Comisión', 1]], com.detalle.map((c) => `<tr><td>${esc(c.categoria)}<small>${esc(c.nota)}</small></td><td>${valorRegla(c)} ${BASE[c.base]}</td><td class="n">${c.base === 'unidad' ? `${num(c.unidades)} unid.` : pesos(c.base === 'venta' ? c.venta : c.ganancia)}</td><td class="n"><b>${pesos(c.comision)}</b></td></tr>`), 'Sin ventas con comisión en este rango.')}
          <p class="nota">Total a pagar: <b>${pesos(com.total)}</b>. Las reglas se editan abajo; el cálculo usa el precio y el costo con que se vendió cada producto.</p>
          ${botonCsv('comision', ['Categoría', 'Porcentaje', 'Monto por unidad', 'Base', 'Unidades', 'Venta', 'Ganancia', 'Comisión'], com.detalle.map((c) => [c.categoria, c.pct, c.monto, c.base, c.unidades, c.venta, c.ganancia, c.comision]), `${r.desde}_${r.hasta}`)}</section>
        <section class="panel"><h2>Reglas de comisión</h2>
          ${reglas.map((x) => `<form class="caja" data-form="regla" style="margin-bottom:8px"><input type="hidden" name="categoria" value="${x.categoria_id}"><b style="min-width:150px">${esc(nombreCat[x.categoria_id])}</b>
            <input name="valor" type="number" min="0" step="any" value="${x.base === 'unidad' ? x.monto : x.pct}" style="width:100px" required>
            <select name="base">${baseOpc(x.base)}</select>
            <input name="nota" value="${esc(x.nota)}" placeholder="Nota" maxlength="100"><button class="btn chico">Guardar</button>
            <button type="button" class="btn peligro chico" data-act="quitar-regla" data-cat="${x.categoria_id}" data-confirmar="¿Quitar la comisión de «${esc(nombreCat[x.categoria_id])}»?">Quitar</button></form>`).join('') || '<p class="vacio">Sin reglas.</p>'}
          ${libres.length ? `<form class="caja" data-form="regla" style="margin-top:10px"><label>Agregar categoría<select name="categoria">${libres.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
            <label>Valor<input name="valor" type="number" min="0" step="any" value="4000" style="width:100px" required></label><label>Regla<select name="base">${baseOpc('unidad')}</select></label>
            <button class="btn principal">Agregar</button></form>` : ''}
          <p class="nota">«Valor» es un porcentaje en las reglas de % y pesos en la de «$ fijos por unidad». La cerveza artesanal paga $4.000 por cada una vendida, sea cual sea la presentación.</p></section>
      </div>
      <div class="rejilla dos" style="margin-top:12px">
        <section class="panel"><h2>Quién cobró</h2>${tabla([['Usuario'], ['Facturas', 1], ['Vendido', 1]], detalle.cajeros.map((c) => `<tr><td>${esc(c.nombre)}${c.nombre === 'Sin registro' ? '<small>facturas anteriores a este panel</small>' : ''}</td><td class="n">${c.facturas}</td><td class="n">${pesos(c.venta)}</td></tr>`), 'Sin facturas.')}</section>
        <section class="panel"><h2>Cuentas anuladas</h2>${tabla([['Cuándo'], ['Mesa'], ['Anuló'], ['Total', 1]], detalle.anuladas.map((a) => `<tr><td>${esc(cuando(a.cerrada_en))}</td><td>${esc(a.mesa)}</td><td>${esc(a.por)}</td><td class="n">${pesos(a.total)}</td></tr>`), 'No hubo anulaciones.')}
          <p class="nota">Solo se registran las cuentas con productos; una cuenta vacía que se descarta no deja rastro.</p></section>
      </div>`;
    },
  };

  // ── Acciones y formularios ───────────────────────────────────────────────────────────────
  const acciones = {
    csv: (el) => descargar(el.dataset.nombre),
    preset: async (el) => { await aplicarPreset(el.dataset.preset); await refrescar(true); },
    activar: (el) => rpc('rockola_activar', { p_activa: el.dataset.activa === 'true' }),
    saltar: () => rpc('rockola_saltar'),
    quitar: (el) => rpc('rockola_quitar', { p_id: Number(el.dataset.id) }),
    prohibir: async (el) => {
      const motivo = prompt(`¿Por qué se prohíbe «${el.dataset.titulo}»? (opcional)`);
      if (motivo === null) return false;
      await rpc('rockola_prohibir', { p_proveedor: el.dataset.proveedor, p_pista_id: el.dataset.pista, p_titulo: el.dataset.titulo, p_motivo: motivo });
      aviso('Quedó en la lista negra.', 'success');
    },
    perdonar: (el) => rpc('rockola_perdonar', { p_proveedor: el.dataset.proveedor, p_pista_id: el.dataset.pista }),
    'borrar-genero': (el) => rpc('rockola_genero_borrar', { p_genero: el.dataset.genero }),
    'quitar-regla': (el) => leer(db.from('comision_reglas').delete().eq('categoria_id', Number(el.dataset.cat))),
    atajo: (el) => { const f = document.querySelector('#form-dar [name=puntos]'); if (f) { f.value = el.dataset.puntos; f.focus(); } return false; },
  };

  const formularios = {
    async dar(f) {
      const celular = celularCO(f.get('celular')), puntos = parseInt(f.get('puntos'), 10);
      if (!/^\d{10,15}$/.test(celular)) throw new Error('Escribe un celular válido (10 dígitos).');
      if (!puntos) throw new Error('Los puntos no pueden ser cero.');
      const nota = [f.get('motivo'), String(f.get('nota') || '').trim()].filter(Boolean).join(': ');
      if (!confirm(`${puntos > 0 ? 'Dar' : 'Quitar'} ${Math.abs(puntos)} puntos a ${celular}?\nMotivo: ${nota}`)) return false;
      const saldo = await rpc('rockola_cortesia', { p_celular: celular, p_puntos: puntos, p_nota: nota, p_nombre: String(f.get('nombre') || '').trim() });
      aviso(`Listo. ${celular} ahora tiene ${saldo} puntos.`, 'success');
    },
    clasificar: (f, form) => rpc('rockola_clasificar', { p_proveedor: form.dataset.proveedor, p_artista_id: form.dataset.artista, p_nombre: form.dataset.nombre, p_genero: f.get('genero') || null }),
    genero: (f) => rpc('rockola_genero_guardar', { p_genero: String(f.get('genero')), p_multiplicador: Number(f.get('mult')), p_nota: String(f.get('nota') || '') }),
    async prohibir(f) {
      const id = idSpotify(f.get('pista'));
      if (!/^[A-Za-z0-9]{10,30}$/.test(id)) throw new Error('No reconozco ese link o ID de Spotify.');
      await rpc('rockola_prohibir', { p_proveedor: 'spotify', p_pista_id: id, p_titulo: String(f.get('titulo') || ''), p_motivo: String(f.get('motivo') || '') });
      aviso('Quedó en la lista negra.', 'success');
    },
    regla: (f) => {
      const base = String(f.get('base')), valor = Number(f.get('valor'));
      if (!(valor >= 0)) throw new Error('El valor no puede ser negativo.');
      if (base !== 'unidad' && valor > 100) throw new Error('Un porcentaje no puede pasar de 100.');
      return leer(db.from('comision_reglas').upsert({ categoria_id: Number(f.get('categoria')), base, pct: base === 'unidad' ? 0 : valor, monto: base === 'unidad' ? Math.round(valor) : 0, nota: String(f.get('nota') || '') }));
    },
  };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.confirmar && !confirm(el.dataset.confirmar)) return;
    el.disabled = true;
    try {
      const r = await acciones[el.dataset.act](el);
      if (r !== false && !['csv', 'preset'].includes(el.dataset.act)) { aviso('Listo.', 'success'); await refrescar(true); }
    } catch (err) { aviso(err.message); }
    el.disabled = false;
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const boton = form.querySelector('button:not([type=button])');
    if (boton) boton.disabled = true;
    try {
      const r = await formularios[form.dataset.form](new FormData(form), form);
      if (r !== false) { if (form.dataset.form !== 'dar' && form.dataset.form !== 'prohibir') aviso('Guardado.', 'success'); await refrescar(true); }
    } catch (err) { aviso(err.message); }
    if (boton) boton.disabled = false;
  });

  document.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-rango]')) return;
    const f = [...document.querySelectorAll('[data-rango]')].map((i) => i.value);
    if (f[0] && f[1] && f[0] <= f[1]) { rango = { desde: f[0], hasta: f[1], preset: '' }; await refrescar(true); }
    else aviso('Revisa las fechas: la primera no puede ser posterior a la segunda.');
  });

  // ── Rutas y sesión ───────────────────────────────────────────────────────────────────────
  let actual = { nombre: 'resumen', args: [], d: null }, seq = 0;
  function ruta() {
    const partes = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
    const nombre = vistas[partes[0]] ? partes[0] : 'resumen';
    return { nombre, args: partes.slice(1) };
  }
  function dibujar() {
    app.innerHTML = vistas[actual.nombre].html(actual.d, actual.args);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('activo', a.dataset.nav === actual.nombre));
    vistas[actual.nombre].despues?.();
  }
  async function refrescar(forzar = false) {
    const mia = ++seq, { nombre, args } = actual;
    try {
      const d = await vistas[nombre].datos(args);
      if (mia !== seq || nombre !== actual.nombre) return;
      if (!forzar && (document.querySelector('dialog[open]') || document.activeElement?.matches('input, select'))) return;
      actual.d = d;
      const y = window.scrollY;
      dibujar();
      if (forzar) window.scrollTo(0, y);
    } catch (err) { if (nombre === actual.nombre && (forzar || !actual.d)) app.innerHTML = `<p class="vacio">${esc(err.message)}</p>`; }
  }
  async function navegar() {
    if (!perfil) return;
    const { nombre, args } = ruta();
    actual = { nombre, args, d: null };
    window.scrollTo(0, 0);
    app.innerHTML = '<p class="vacio">Cargando…</p>';
    await refrescar(true);
  }
  window.addEventListener('hashchange', navegar);
  setInterval(() => { if (perfil && actual.nombre === 'rockola' && !document.hidden) refrescar(); }, 10000);

  function pantallaLogin(mensaje = '') {
    nav.hidden = true;
    app.innerHTML = `<form class="login" id="form-login">
      <img src="../logo.png" alt="El Callejón del Gato" width="120" height="120">
      <h1>Panel de control</h1>
      <label>Usuario <input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" required autofocus></label>
      <label>Contraseña <input name="clave" type="password" autocomplete="current-password" required></label>
      <p class="login-error" id="login-error">${esc(mensaje)}</p>
      <button class="btn principal">Entrar</button>
    </form>`;
    document.getElementById('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), boton = e.target.querySelector('button');
      boton.disabled = true;
      const { error } = await db.auth.signInWithPassword({ email: String(f.get('usuario')).trim().toLowerCase() + dominio, password: String(f.get('clave')) + sufijo });
      if (error) {
        boton.disabled = false;
        document.getElementById('login-error').textContent = /fetch|network|abort|timeout/i.test(error.message) ? 'Sin conexión con el servidor.' : 'Usuario o contraseña incorrectos.';
        return;
      }
      entrar();
    });
  }

  async function entrar() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return pantallaLogin();
    let datos;
    try { datos = await leer(db.from('perfiles').select('nombre, rol').eq('id', session.user.id).maybeSingle()); }
    catch (e) { app.innerHTML = `<p class="vacio">${esc(e.message)}</p>`; return; }
    if (!datos) { await db.auth.signOut(); return pantallaLogin('Ese usuario no tiene permisos en el bar.'); }
    if (datos.rol !== 'admin') { app.innerHTML = `<p class="vacio">Este panel es solo para el administrador. <a href="../#/">Volver a la app</a></p>`; return; }
    perfil = datos;
    document.getElementById('quien').textContent = perfil.nombre;
    nav.hidden = false;
    navegar();
  }

  document.getElementById('salir').addEventListener('click', async () => { if (confirm('¿Cerrar sesión?')) { await db.auth.signOut(); location.reload(); } });
  entrar();
})();
