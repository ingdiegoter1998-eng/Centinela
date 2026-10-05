// Control del bar — front estático. Habla directo con Supabase (tablas + funciones rpc).
// Las reglas de negocio (stock, cobro, numeración) viven en la base: ver supabase/schema.sql.
//
// Cómo se mantiene todo sincronizado entre celulares:
//  - Cada toque se muestra al instante (optimista) y se manda a la base; luego se vuelve a leer.
//  - Supabase Realtime avisa cuando cambia algo; además se relee cada pocos segundos por si el
//    aviso se pierde (WiFi inestable).
// Hay que iniciar sesión. Dos roles (tabla `perfiles`): «admin» lo ve y lo cambia todo; «barman» abre y
// cobra cuentas y solo ve el inventario. Lo que cada rol puede lo decide la base (RLS), no esta pantalla:
// aquí solo se esconde lo que no le sirve.
(() => {
  const cfg = window.BAR_CONFIG || {};
  const app = document.getElementById('app');

  if (!cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith('PEGA_')) {
    app.innerHTML = `<p class="vacio">Falta configurar la llave de Supabase en <code>config.js</code>.</p>`;
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    // Tope de 10 s por petición: con WiFi malo es mejor avisar que dejar la pantalla colgada.
    global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : opts?.signal }) },
  });

  // ── Utilidades ───────────────────────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  const ES = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });   // «Águila» va con la A
  const plural = (n, s, p) => (n === 1 ? s : p);
  const ZONA = 'America/Bogota';
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA });
  const fechaLarga = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ZONA });
  const diaLargo = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const sumaDias = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const total = (lineas) => lineas.reduce((t, l) => t + l.cantidad * l.precio, 0);
  const items = (lineas) => lineas.reduce((t, l) => t + l.cantidad, 0);
  const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
  const HORA_CORTE = 6;
  let perfil = null;                                   // { nombre, rol } de quien inició sesión
  const esAdmin = () => perfil?.rol === 'admin';
  const dominio = '@bar.local';                        // Supabase pide un correo: el usuario es «<usuario>@bar.local»
  const sufijo = '-bar';                               // y exige 6+ caracteres: a la clave escrita se le suma esto (ver crear_usuarios.sh)

  // Existencias que se ven de un producto. Si se vende por porciones de un recipiente (cerveza de barril),
  // son las porciones que alcanzan; el recipiente (unidad 'ml') se muestra en litros.
  const porId = (ps) => Object.fromEntries(ps.map((p) => [p.id, p]));
  const quedan = (p, ids) => (p.insumo_id && ids[p.insumo_id] ? Math.floor(ids[p.insumo_id].stock / p.consumo) : p.stock);
  const litros = (ml) => `${(ml / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} L`;
  const existencia = (p, ids) => (p.unidad === 'ml' ? litros(p.stock) : String(quedan(p, ids)));

  async function leer(consulta) {
    // Sin reintentos internos de la librería (esperan varios segundos con la red caída):
    // la app ya relee sola cada pocos segundos.
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
    setTimeout(() => el.remove(), tipo === 'error' ? 6000 : 3500);
  }

  // ── Vistas ───────────────────────────────────────────────────────────────────────────────
  // Cada vista: `datos(args)` lee de la base; `html(d, args)` dibuja.

  const vistas = {};

  // Mesas ----------------------------------------------------------------------------------
  vistas.mesas = {
    async datos() {
      const [mesas, cuentas] = await Promise.all([
        leer(db.from('mesas').select('*').eq('activa', true).order('orden').order('nombre')),
        leer(db.from('v_cuentas_abiertas').select('*')),
      ]);
      const porMesa = Object.fromEntries(cuentas.map((c) => [c.mesa_id, c]));
      return { mesas: mesas.map((m) => ({ ...m, cuenta: porMesa[m.id] })), porCobrar: cuentas.reduce((t, c) => t + c.total, 0) };
    },
    html({ mesas, porCobrar }) {
      if (!mesas.length) return `<p class="vacio">Sin mesas.</p>`;
      const tarjetas = mesas.map((m) => {
        const c = m.cuenta;
        return `<a class="mesa ${c ? 'ocupada' : 'libre'}" href="#/mesa/${m.id}">
          <span class="mesa-nombre">${esc(m.nombre)}</span>
          ${c ? `<span class="mesa-total">${pesos(c.total)}</span>
                 <span class="mesa-info">${c.n_items} ${plural(c.n_items, 'ítem', 'ítems')} · ${esc(c.cliente || 'Anónimo')}</span>
                 <span class="mesa-info">desde ${hora(c.abierta_en)}</span>`
               : `<span class="mesa-info">Libre</span>`}
        </a>`;
      }).join('');
      return `<div class="mesas">${tarjetas}</div>
        ${porCobrar ? `<p class="pie">Por cobrar en las mesas: <b>${pesos(porCobrar)}</b></p>` : ''}`;
    },
  };

  // Cuenta de una mesa ---------------------------------------------------------------------
  let categoria = '';          // filtro elegido; vive aquí para sobrevivir a cada redibujado
  vistas.cuenta = {
    async datos([mesaId]) {
      const [mesa, factura, productos, clientes] = await Promise.all([
        leer(db.from('mesas').select('*').eq('id', mesaId).maybeSingle()),
        leer(db.from('facturas').select('id, cliente_id, lineas(id, producto_id, cantidad, precio, productos(nombre))')
          .eq('mesa_id', mesaId).eq('estado', 'abierta').maybeSingle()),
        leer(db.from('productos').select('*, categorias(id, nombre, orden)').eq('activo', true)),
        leer(db.from('clientes').select('id, nombre')),
      ]);
      if (!mesa) throw new Error('Esa mesa no existe.');
      productos.sort((a, b) => a.categorias.orden - b.categorias.orden || ES(a.categorias.nombre, b.categorias.nombre) || ES(a.nombre, b.nombre));
      clientes.sort((a, b) => ES(a.nombre, b.nombre));
      return { mesa, factura, lineas: (factura?.lineas || []).slice().sort((a, b) => a.id - b.id), productos, clientes };
    },
    html({ mesa, factura, lineas, productos: todos, clientes }) {
      const ids = porId(todos);
      const productos = todos.filter((p) => p.se_vende);
      const cats = [...new Map(productos.map((p) => [p.categorias.id, p.categorias])).values()]
        .sort((a, b) => a.orden - b.orden || ES(a.nombre, b.nombre));
      const enCuenta = Object.fromEntries(lineas.map((l) => [l.producto_id, l.cantidad]));
      const t = total(lineas);
      const n = items(lineas);
      const botones = productos.map((p) => {
        const q = quedan(p, ids);
        const agotado = p.controla_stock && q <= 0;
        const bajo = p.controla_stock && p.stock_minimo > 0 && q <= p.stock_minimo;
        return `<button type="button" class="producto${agotado ? ' agotado' : ''}${bajo ? ' bajo' : ''}" data-accion="agregar" data-producto="${p.id}" data-cat="${p.categoria_id}">
          <span class="p-nombre">${esc(p.nombre)}</span>
          <span class="p-precio">${pesos(p.precio)}</span>
          ${p.controla_stock ? `<span class="p-stock">${agotado ? 'agotado' : `quedan ${q}`}</span>` : ''}
          ${enCuenta[p.id] ? `<span class="p-badge">${enCuenta[p.id]}</span>` : ''}
        </button>`;
      }).join('');
      const filas = lineas.map((l) => `<li>
          <span class="l-nombre">${esc(l.productos.nombre)}<small>${pesos(l.precio)} c/u</small></span>
          <span class="l-cant">
            <button type="button" data-accion="quitar" data-producto="${l.producto_id}" aria-label="Quitar uno">−</button>
            <b>${l.cantidad}</b>
            <button type="button" data-accion="agregar" data-producto="${l.producto_id}" aria-label="Agregar uno">＋</button>
          </span>
          <span class="l-subtotal">${pesos(l.cantidad * l.precio)}</span></li>`).join('');
      return `<div class="cab"><a class="volver" href="#/">← Mesas</a><h1>${esc(mesa.nombre)}</h1></div>
      <div class="pantalla">
        <section class="catalogo">
          ${productos.length ? `
            <div class="chips">
              <button type="button" class="chip" data-filtro="">Todo</button>
              ${cats.map((c) => `<button type="button" class="chip" data-filtro="${c.id}">${esc(c.nombre)}</button>`).join('')}
            </div>
            <div class="productos">${botones}</div>`
            : `<p class="vacio">Sin productos.</p>`}
        </section>
        <section class="cuenta" id="cuenta">
          <h2>Cuenta</h2>
          <div class="cliente">
            <select data-accion="cliente" aria-label="Cliente">
              <option value="">Cliente anónimo</option>
              ${clientes.map((c) => `<option value="${c.id}"${factura?.cliente_id === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
            </select>
            <button type="button" class="btn chico" data-accion="cliente_nuevo">＋ Cliente</button>
          </div>
          ${lineas.length ? `<ul class="lineas">${filas}</ul>` : ''}
          <div class="total"><span>Total</span><b>${pesos(t)}</b></div>
          ${lineas.length ? `<div class="cobrar">${Object.entries(METODOS).map(([v, e]) =>
            `<button type="button" class="btn pago pago-${v}" data-accion="cobrar" data-metodo="${v}" data-confirmar="¿Cobrar ${pesos(t)} en ${e.toLowerCase()}?">${e}</button>`).join('')}</div>` : ''}
          ${factura ? `<button type="button" class="btn peligro chico" data-accion="anular" data-confirmar="¿Anular toda la cuenta de ${esc(mesa.nombre)}? Lo pedido vuelve al inventario.">Anular cuenta</button>` : ''}
        </section>
        <a class="barra-total" role="button" data-ir="cuenta"><span>${n} ${plural(n, 'ítem', 'ítems')}</span><b>${pesos(t)}</b><span>Ver cuenta ↓</span></a>
      </div>`;
    },
    despues() { aplicarFiltro(); },
  };

  function aplicarFiltro() {
    app.querySelectorAll('[data-cat]').forEach((p) => { p.hidden = categoria !== '' && p.dataset.cat !== categoria; });
    app.querySelectorAll('[data-filtro]').forEach((c) => c.classList.toggle('activo', c.dataset.filtro === categoria));
  }

  // Inventario -----------------------------------------------------------------------------
  vistas.inventario = {
    async datos() {
      const productos = await leer(db.from('productos').select('*, categorias(id, nombre, orden)').eq('activo', true));
      productos.sort((a, b) => a.categorias.orden - b.categorias.orden || ES(a.categorias.nombre, b.categorias.nombre) || ES(a.nombre, b.nombre));
      return { productos };
    },
    html({ productos }) {
      const ids = porId(productos);
      const agotado = (p) => p.controla_stock && quedan(p, ids) <= 0;
      const bajo = (p) => p.controla_stock && p.stock_minimo > 0 && quedan(p, ids) <= p.stock_minimo;
      const detalle = (p) => !p.se_vende ? ''
        : esAdmin() ? `costo ${pesos(p.costo)} · venta ${pesos(p.precio)} · gana ${pesos(p.precio - p.costo)}${p.insumo_id ? ` · usa ${p.consumo} ml` : ''}`
        : `venta ${pesos(p.precio)}`;
      const porReponer = productos.filter((p) => !p.insumo_id && (agotado(p) || bajo(p)));
      const valor = productos.filter((p) => p.controla_stock && p.stock > 0 && p.unidad !== 'ml' && !p.insumo_id).reduce((t, p) => t + p.stock * p.costo, 0);
      const grupos = [];
      productos.forEach((p) => {
        if (!grupos.length || grupos[grupos.length - 1].id !== p.categorias.id) grupos.push({ id: p.categorias.id, nombre: p.categorias.nombre, lista: [] });
        grupos[grupos.length - 1].lista.push(p);
      });
      return `<h1>Inventario</h1>
      ${porReponer.length ? `<section class="alerta"><h2>Por reponer (${porReponer.length})</h2><ul>${porReponer.map((p) =>
        `<li><b>${esc(p.nombre)}</b> — ${agotado(p) ? 'agotado' : `quedan ${existencia(p, ids)}`}</li>`).join('')}</ul></section>` : ''}
      ${grupos.map((g) => `<h2 class="categoria">${esc(g.nombre)}</h2><div class="tabla">${g.lista.map((p) => `
        <div class="fila${agotado(p) ? ' agotado' : bajo(p) ? ' bajo' : ''}">
          <span class="f-nombre">${esc(p.nombre)}${detalle(p) ? `<small>${detalle(p)}</small>` : ''}</span>
          <span class="f-stock">${p.controla_stock ? existencia(p, ids) : '—'}</span>
          ${p.controla_stock && esAdmin() && !p.insumo_id ? `<button type="button" class="btn chico" data-mover="${p.id}" data-nombre="${esc(p.nombre)}" data-unidad="${p.unidad}">Mover</button>` : '<span></span>'}
        </div>`).join('')}</div>`).join('') || `<p class="vacio">Sin productos.</p>`}
      ${valor && esAdmin() ? `<p class="pie">Valor del inventario a costo: <b>${pesos(valor)}</b></p>` : ''}`;
    },
  };

  // Ventas ---------------------------------------------------------------------------------
  vistas.ventas = {
    async datos([dia]) {
      const hoy = await rpc('jornada_actual', { p_corte: HORA_CORTE });
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(dia || '') ? dia : hoy;
      const [r, abiertas, mesas] = await Promise.all([
        rpc('resumen', { p_dia: fecha, p_corte: HORA_CORTE }),
        leer(db.from('v_cuentas_abiertas').select('*')),
        leer(db.from('mesas').select('id, nombre, orden')),
      ]);
      const nombreMesa = Object.fromEntries(mesas.map((m) => [m.id, m]));
      abiertas.sort((a, b) => (nombreMesa[a.mesa_id]?.orden ?? 0) - (nombreMesa[b.mesa_id]?.orden ?? 0));
      return { r, fecha, hoy, abiertas: abiertas.map((a) => ({ ...a, mesa: nombreMesa[a.mesa_id]?.nombre })) };
    },
    html({ r, fecha, hoy, abiertas }) {
      const esHoy = fecha === hoy;
      return `<div class="cab"><h1>Ventas</h1>
        <form class="fecha" onsubmit="return false">
          <a class="btn chico" href="#/ventas/${sumaDias(fecha, -1)}">←</a>
          <input type="date" value="${fecha}" data-fecha>
          ${fecha < hoy ? `<a class="btn chico" href="#/ventas/${sumaDias(fecha, 1)}">→</a>` : ''}
        </form></div>
      <p class="nota">${esc(diaLargo(fecha))}</p>
      ${esHoy && abiertas.length ? `<section class="alerta"><h2>Cuentas abiertas sin cobrar (${abiertas.length})</h2><ul>${abiertas.map((a) =>
        `<li><a href="#/mesa/${a.mesa_id}"><b>${esc(a.mesa)}</b></a> — ${pesos(a.total)}</li>`).join('')}</ul></section>` : ''}
      <div class="tarjetas">
        <div class="tarjeta"><span>Vendido</span><b>${pesos(r.venta)}</b></div>
        <div class="tarjeta"><span>Ganancia</span><b>${pesos(r.ganancia)}</b></div>
        <div class="tarjeta"><span>Facturas</span><b>${r.n_facturas}</b></div>
        <div class="tarjeta"><span>Promedio por factura</span><b>${pesos(r.ticket_promedio)}</b></div>
      </div>
      <h2 class="categoria">Cómo pagaron</h2>
      <div class="tabla">${r.metodos.map((m) => `<div class="fila"><span class="f-nombre">${METODOS[m.metodo]}</span><span class="f-valor">${pesos(m.total)}</span></div>`).join('')}</div>
      <h2 class="categoria">Lo más vendido</h2>
      <div class="tabla">${r.productos.map((p) => `<div class="fila">
        <span class="f-nombre">${esc(p.nombre)}<small>${esc(p.categoria)} · gana ${pesos(p.ganancia)}</small></span>
        <span class="f-stock">${p.unidades}</span><span class="f-valor">${pesos(p.venta)}</span></div>`).join('') || '<p class="vacio">Sin ventas en esta jornada.</p>'}</div>
      <h2 class="categoria">Facturas</h2>
      <div class="tabla">${r.facturas.map((f) => `<a class="fila enlace" href="#/factura/${f.id}">
        <span class="f-nombre">N.º ${f.numero} · ${esc(f.mesa)}<small>${hora(f.cerrada_en)} · ${esc(f.cliente || 'Anónimo')} · ${METODOS[f.metodo_pago]}</small></span>
        <span class="f-valor">${pesos(f.total)}</span></a>`).join('') || '<p class="vacio">Sin facturas.</p>'}</div>`;
    },
  };

  // Factura (recibo) -----------------------------------------------------------------------
  vistas.factura = {
    async datos([id]) {
      const f = await leer(db.from('facturas').select('*, mesas(nombre), clientes(nombre), lineas(id, cantidad, precio, productos(nombre))').eq('id', id).maybeSingle());
      if (!f) throw new Error('Esa factura no existe.');
      f.lineas.sort((a, b) => a.id - b.id);
      return { f };
    },
    html({ f }) {
      return `<article class="recibo">
        <h1>${f.numero ? `Factura N.º ${f.numero}` : `Cuenta ${f.estado}`}</h1>
        <p class="nota">${esc(f.mesas.nombre)} · ${esc(f.clientes?.nombre || 'Cliente anónimo')}<br>
          ${esc(fechaLarga(f.cerrada_en || f.abierta_en))}${f.metodo_pago ? ` · ${METODOS[f.metodo_pago]}` : ''}
          ${f.estado === 'anulada' ? '<br><b>ANULADA</b>' : ''}</p>
        <table>${f.lineas.map((l) => `<tr><td>${l.cantidad} × ${esc(l.productos.nombre)}</td><td class="der">${pesos(l.cantidad * l.precio)}</td></tr>`).join('')}
          <tr class="total"><td>Total</td><td class="der">${pesos(total(f.lineas))}</td></tr></table>
        <div class="acciones sin-imprimir"><a class="btn principal" href="#/">Volver a mesas</a>
          <button type="button" class="btn" onclick="window.print()">Imprimir</button></div>
      </article>`;
    },
  };

  // Catálogo (lo que antes era la administración) ------------------------------------------
  vistas.catalogo = {
    async datos() {
      const [categorias, productos, mesas] = await Promise.all([
        leer(db.from('categorias').select('*')),
        leer(db.from('productos').select('*')),
        leer(db.from('mesas').select('*')),
      ]);
      categorias.sort((a, b) => a.orden - b.orden || ES(a.nombre, b.nombre));
      mesas.sort((a, b) => a.orden - b.orden || ES(a.nombre, b.nombre));
      productos.sort((a, b) => ES(a.nombre, b.nombre));
      return { categorias, productos, mesas };
    },
    html({ categorias, productos, mesas }) {
      return `<h1>Catálogo</h1>
      <div class="seccion-cab"><h2>Productos</h2>
        <button type="button" class="btn chico principal" data-nuevo="producto"${categorias.length ? '' : ' disabled'}>＋ Producto</button></div>
      ${categorias.length ? '' : '<p class="vacio">Crea primero una categoría (abajo).</p>'}
      ${categorias.map((c) => { const ps = productos.filter((p) => p.categoria_id === c.id);
        return ps.length ? `<h2 class="categoria">${esc(c.nombre)}</h2><div class="tabla">${ps.map((p) => `
          <div class="fila clicable${p.activo ? '' : ' inactivo'}" data-editar="producto" data-id="${p.id}">
            <span class="f-nombre">${esc(p.nombre)}${p.activo ? '' : ' (oculto)'}${p.se_vende ? '' : ' (no se vende)'}<small>costo ${pesos(p.costo)} · gana ${pesos(p.precio - p.costo)}${p.controla_stock ? '' : ' · sin inventario'}</small></span>
            <span class="f-valor">${pesos(p.precio)}</span></div>`).join('')}</div>` : ''; }).join('')}
      <div class="seccion-cab"><h2>Categorías</h2><button type="button" class="btn chico" data-nuevo="categoria">＋ Categoría</button></div>
      <div class="tabla">${categorias.map((c) => `<div class="fila clicable" data-editar="categoria" data-id="${c.id}"><span class="f-nombre">${esc(c.nombre)}</span><span class="f-stock">${c.orden}</span></div>`).join('') || '<p class="vacio">Sin categorías.</p>'}</div>
      <div class="seccion-cab"><h2>Mesas</h2><button type="button" class="btn chico" data-nuevo="mesa">＋ Mesa</button></div>
      <div class="tabla">${mesas.map((m) => `<div class="fila clicable${m.activa ? '' : ' inactivo'}" data-editar="mesa" data-id="${m.id}"><span class="f-nombre">${esc(m.nombre)}${m.activa ? '' : ' (oculta)'}</span><span class="f-stock">${m.orden}</span></div>`).join('') || '<p class="vacio">Sin mesas.</p>'}</div>`;
    },
  };

  // ── Motor de vistas ──────────────────────────────────────────────────────────────────────
  let actual = { nombre: null, args: [], d: null };
  let seq = 0;            // lecturas lanzadas; una respuesta vieja se descarta
  let pendientes = 0;     // acciones en vuelo: mientras haya, no se pisa la pantalla con una lectura
  let ultimoError = false;

  function ruta() {
    const partes = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
    let nombre = { mesa: 'cuenta' }[partes[0]] || partes[0] || 'mesas';
    if (!esAdmin() && ['ventas', 'catalogo'].includes(nombre)) nombre = 'mesas';
    return { nombre: vistas[nombre] ? nombre : 'mesas', args: partes.slice(1) };
  }

  function dibujar() {
    const v = vistas[actual.nombre];
    app.innerHTML = v.html(actual.d, actual.args);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('activo',
      a.dataset.nav === actual.nombre || (a.dataset.nav === 'mesas' && ['cuenta', 'factura'].includes(actual.nombre))
      || (a.dataset.nav === 'ventas' && actual.nombre === 'factura')));
    v.despues?.();
  }

  function conexion(ok) {
    document.getElementById('aviso-red').hidden = ok;
    ultimoError = !ok;
  }

  async function refrescar({ forzar = false } = {}) {
    const mia = ++seq;
    const { nombre, args } = actual;
    try {
      const d = await vistas[nombre].datos(args);
      conexion(true);
      if (mia !== seq || nombre !== actual.nombre) return;              // llegó otra lectura más nueva
      if (pendientes > 0) return;                                        // hay toques sin confirmar
      if (!forzar && (document.querySelector('dialog[open]') || document.activeElement?.matches('select, input'))) return;
      actual.d = d;
      dibujar();
    } catch (e) {
      if (nombre === actual.nombre && forzar) { app.innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
      conexion(false);
    }
  }

  async function navegar() {
    if (!perfil) return;                  // sin sesión solo se ve el inicio de sesión
    const { nombre, args } = ruta();
    actual = { nombre, args, d: null };
    window.scrollTo(0, 0);
    app.innerHTML = '<p class="vacio">Cargando…</p>';
    await refrescar({ forzar: true });
  }

  // ── Acciones sobre la cuenta ─────────────────────────────────────────────────────────────
  function bajaStock(d, prod, n) {      // n > 0 descuenta (igual que la base: del recipiente si lo hay)
    const destino = (prod.insumo_id && d.productos.find((x) => x.id === prod.insumo_id)) || prod;
    destino.stock -= n * prod.consumo;
  }

  function optimista(accion, productoId) {
    const d = actual.d;
    const prod = d.productos.find((p) => p.id === productoId);
    if (!prod) return;
    const l = d.lineas.find((x) => x.producto_id === productoId);
    if (accion === 'agregar') {
      if (l) l.cantidad += 1;
      else d.lineas.push({ id: Date.now(), producto_id: productoId, cantidad: 1, precio: prod.precio, productos: { nombre: prod.nombre } });
      if (!d.factura) d.factura = { id: null, cliente_id: null };
      if (prod.controla_stock) bajaStock(d, prod, 1);
    } else if (l) {
      l.cantidad -= 1;
      if (l.cantidad <= 0) d.lineas = d.lineas.filter((x) => x !== l);
      if (!d.lineas.length) d.factura = null;
      if (prod.controla_stock) bajaStock(d, prod, -1);
    }
    dibujar();
  }

  async function accionCuenta(boton) {
    const mesaId = Number(actual.args[0]);
    const { accion, producto, metodo, confirmar } = boton.dataset;
    if (confirmar && !confirm(confirmar)) return;
    navigator.vibrate?.(15);
    pendientes++;
    try {
      if (accion === 'agregar' || accion === 'quitar') {
        optimista(accion, Number(producto));
        await rpc(accion, { p_mesa: mesaId, p_producto: Number(producto) });
      } else if (accion === 'cliente') {
        await rpc('asignar_cliente', { p_mesa: mesaId, p_cliente: boton.value ? Number(boton.value) : null });
      } else if (accion === 'cliente_nuevo') {
        const nombre = prompt('Nombre del cliente nuevo');
        if (!nombre) return;
        await rpc('crear_cliente', { p_mesa: mesaId, p_nombre: nombre });
      } else if (accion === 'cobrar') {
        const id = await rpc('cobrar', { p_mesa: mesaId, p_metodo: metodo });
        pendientes--; location.hash = `#/factura/${id}`; pendientes++;
        return;
      } else if (accion === 'anular') {
        await rpc('anular', { p_mesa: mesaId });
        pendientes--; location.hash = '#/'; pendientes++;
        return;
      }
    } catch (e) {
      aviso(e.message);
    } finally {
      pendientes--;
    }
    if (pendientes === 0) refrescar({ forzar: true });
  }

  // ── Diálogos: inventario y catálogo ──────────────────────────────────────────────────────
  const dlgMover = document.getElementById('dlg-mover');
  const formMover = document.getElementById('form-mover');
  let moviendo = null; let moviendoUnidad = 'unid';

  formMover.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(formMover);
    const cantidad = moviendoUnidad === 'ml' ? Math.round(parseFloat(String(f.get('cantidad')).replace(',', '.')) * 1000) : parseInt(f.get('cantidad'), 10);
    const nota = (f.get('nota') || '').trim();
    try {
      if (f.get('tipo') === 'conteo') await rpc('contar', { p_producto: moviendo, p_stock: cantidad, p_nota: nota });
      else await rpc('comprar', { p_producto: moviendo, p_cantidad: cantidad, p_costo: f.get('costo') === '' ? null : parseInt(f.get('costo'), 10), p_nota: nota });
      dlgMover.close();
      aviso('Inventario actualizado.', 'success');
      refrescar({ forzar: true });
    } catch (err) { aviso(err.message); }
  });

  // Formulario genérico para el catálogo. `campos`: [{n, l, t: text|number|check|select, op?, req?}]
  const dlgForm = document.getElementById('dlg-form');
  const formGen = document.getElementById('form-generico');
  let alGuardar = null; let alEliminar = null;

  function formulario(titulo, campos, valores, guardar, eliminar) {
    formGen.innerHTML = `<h2>${esc(titulo)}</h2>${campos.map((c) => {
      const v = valores[c.n] ?? '';
      if (c.t === 'check') return `<label class="casilla"><input type="checkbox" name="${c.n}"${v ? ' checked' : ''}> ${esc(c.l)}</label>`;
      if (c.t === 'select') return `<label>${esc(c.l)}<select name="${c.n}" required>${c.op.map(([val, txt]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>`;
      return `<label>${esc(c.l)}<input type="${c.t}" name="${c.n}" value="${esc(v)}"${c.t === 'number' ? ' inputmode="numeric" min="0"' : ''}${c.req ? ' required' : ''}></label>`;
    }).join('')}
      <div class="acciones">${eliminar ? '<button type="button" class="btn peligro" data-eliminar>Eliminar</button>' : ''}
        <button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn principal">Guardar</button></div>`;
    alGuardar = (f) => guardar(Object.fromEntries(campos.map((c) => [c.n,
      c.t === 'check' ? f.get(c.n) === 'on' : c.t === 'number' ? (f.get(c.n) === '' ? 0 : parseInt(f.get(c.n), 10)) : c.t === 'select' ? Number(f.get(c.n)) : String(f.get(c.n)).trim()])));
    alEliminar = eliminar;
    dlgForm.showModal();
  }

  formGen.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await alGuardar(new FormData(formGen)); dlgForm.close(); aviso('Guardado.', 'success'); refrescar({ forzar: true }); }
    catch (err) { aviso(err.message.includes('duplicate') ? 'Ya existe uno con ese nombre.' : err.message); }
  });

  const escribir = (promesa) => leer(promesa);
  const sinUso = (err) => { throw new Error(/foreign key|violates/.test(err.message) ? 'No se puede eliminar: ya tiene movimientos o ventas. Mejor ocúltalo.' : err.message); };

  function editarCatalogo(tipo, id) {
    const d = actual.d;
    const cats = d.categorias.map((c) => [c.id, c.nombre]);
    const nuevo = id == null;
    if (tipo === 'producto') {
      const p = nuevo ? { categoria_id: cats[0][0], precio: 0, costo: 0, controla_stock: true, stock: 0, stock_minimo: 0, activo: true } : d.productos.find((x) => x.id === id);
      const campos = [
        { n: 'categoria_id', l: 'Categoría', t: 'select', op: cats },
        { n: 'nombre', l: 'Nombre', t: 'text', req: true },
        { n: 'precio', l: 'Precio de venta', t: 'number', req: true },
        { n: 'costo', l: 'Costo de compra', t: 'number' },
        { n: 'controla_stock', l: 'Controla inventario', t: 'check' },
        ...(nuevo ? [{ n: 'stock', l: 'Unidades que hay hoy', t: 'number' }] : []),
        { n: 'stock_minimo', l: 'Avisar cuando queden', t: 'number' },
        { n: 'activo', l: 'Activo', t: 'check' },
      ];
      formulario(nuevo ? 'Nuevo producto' : 'Editar producto', campos, p,
        (v) => escribir(nuevo ? db.from('productos').insert(v) : db.from('productos').update(v).eq('id', id)),
        nuevo ? null : () => escribir(db.from('productos').delete().eq('id', id)).catch(sinUso));
    } else if (tipo === 'categoria') {
      const c = nuevo ? { nombre: '', orden: (cats.length + 1) } : d.categorias.find((x) => x.id === id);
      formulario(nuevo ? 'Nueva categoría' : 'Editar categoría',
        [{ n: 'nombre', l: 'Nombre', t: 'text', req: true }, { n: 'orden', l: 'Posición', t: 'number' }], c,
        (v) => escribir(nuevo ? db.from('categorias').insert(v) : db.from('categorias').update(v).eq('id', id)),
        nuevo ? null : () => escribir(db.from('categorias').delete().eq('id', id)).catch(sinUso));
    } else {
      const m = nuevo ? { nombre: '', orden: d.mesas.length, activa: true } : d.mesas.find((x) => x.id === id);
      formulario(nuevo ? 'Nueva mesa' : 'Editar mesa',
        [{ n: 'nombre', l: 'Nombre', t: 'text', req: true }, { n: 'orden', l: 'Posición', t: 'number' }, { n: 'activa', l: 'Activa', t: 'check' }], m,
        (v) => escribir(nuevo ? db.from('mesas').insert(v) : db.from('mesas').update(v).eq('id', id)),
        nuevo ? null : () => escribir(db.from('mesas').delete().eq('id', id)).catch(sinUso));
    }
  }

  // ── Eventos ──────────────────────────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const t = e.target;
    const ir = t.closest('[data-ir]');
    if (ir) { document.getElementById(ir.dataset.ir)?.scrollIntoView({ behavior: 'smooth' }); return; }
    const filtro = t.closest('[data-filtro]');
    if (filtro) { categoria = filtro.dataset.filtro; aplicarFiltro(); return; }
    const boton = t.closest('button[data-accion]');
    if (boton && actual.nombre === 'cuenta') { accionCuenta(boton); return; }
    const mover = t.closest('[data-mover]');
    if (mover) {
      moviendo = Number(mover.dataset.mover);
      moviendoUnidad = mover.dataset.unidad || 'unid';
      const enLitros = moviendoUnidad === 'ml';
      formMover.reset();
      formMover.cantidad.step = enLitros ? '0.1' : '1';
      formMover.cantidad.inputMode = enLitros ? 'decimal' : 'numeric';
      document.getElementById('mover-unidad').textContent = enLitros ? 'Litros' : 'Cantidad';
      formMover.querySelector('.solo-compra').hidden = enLitros;
      document.getElementById('mover-titulo').textContent = mover.dataset.nombre;
      dlgMover.showModal();
      return;
    }
    const nuevo = t.closest('[data-nuevo]');
    if (nuevo) { editarCatalogo(nuevo.dataset.nuevo, null); return; }
    const editar = t.closest('[data-editar]');
    if (editar) { editarCatalogo(editar.dataset.editar, Number(editar.dataset.id)); return; }
    if (t.closest('[data-cerrar]')) { t.closest('dialog').close(); return; }
    if (t.closest('[data-eliminar]')) {
      if (!confirm('¿Eliminar definitivamente?')) return;
      Promise.resolve(alEliminar()).then(() => { dlgForm.close(); aviso('Eliminado.', 'success'); refrescar({ forzar: true }); }).catch((err) => aviso(err.message));
    }
  });

  document.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-accion]');
    if (s && actual.nombre === 'cuenta') accionCuenta(s);
    const f = e.target.closest('[data-fecha]');
    if (f && f.value) location.hash = `#/ventas/${f.value}`;
  });

  window.addEventListener('hashchange', navegar);

  // ── Sincronización: Realtime + relectura de respaldo ─────────────────────────────────────
  let temporizador = null;
  const pedirRefresco = () => { clearTimeout(temporizador); temporizador = setTimeout(() => refrescar(), 250); };
  let enVivo = false;
  let sincronizando = false;
  function sincronizar() {
    if (sincronizando) return;
    sincronizando = true;
    const canal = db.channel('bar');
    ['facturas', 'lineas', 'productos', 'mesas'].forEach((tabla) => canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, pedirRefresco));
    canal.subscribe((estado) => { enVivo = estado === 'SUBSCRIBED'; });

    let tick = 0;
    setInterval(() => {
      tick++;
      if (document.hidden) return;
      // Con Realtime activo basta una relectura de respaldo cada ~20 s; sin él, cada 4 s.
      if (enVivo ? tick % 5 === 0 : true) refrescar();
    }, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
    window.addEventListener('online', () => refrescar());
  }

  // ── Sesión ───────────────────────────────────────────────────────────────────────────────
  const nav = document.getElementById('nav');

  function pantallaLogin(mensaje = '') {
    nav.hidden = true;
    app.innerHTML = `<form class="login" id="form-login">
      <img src="logo.png" alt="El Callejón del Gato" width="140" height="140">
      <h1>Cuentas</h1>
      <label>Usuario <input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" required autofocus></label>
      <label>Contraseña <input name="clave" type="password" autocomplete="current-password" required></label>
      <p class="login-error" id="login-error">${esc(mensaje)}</p>
      <button class="btn principal">Entrar</button>
    </form>`;
    document.getElementById('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const boton = e.target.querySelector('button');
      boton.disabled = true;
      const { error } = await db.auth.signInWithPassword({ email: String(f.get('usuario')).trim().toLowerCase() + dominio, password: String(f.get('clave')) + sufijo });
      if (error) {
        boton.disabled = false;
        const sinRed = /fetch|network|abort|timeout/i.test(error.message);
        document.getElementById('login-error').textContent = sinRed ? 'Sin conexión con el servidor.' : 'Usuario o contraseña incorrectos.';
        return;
      }
      location.hash = '#/';
      entrar();
    });
  }

  async function salir() {
    await db.auth.signOut();
    location.hash = '#/';
    location.reload();
  }

  async function entrar() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return pantallaLogin();
    let datos;
    try { datos = await leer(db.from('perfiles').select('nombre, rol').eq('id', session.user.id).maybeSingle()); }
    catch (e) { app.innerHTML = `<p class="vacio">${esc(e.message)}</p>`; return; }
    if (!datos) { await db.auth.signOut(); return pantallaLogin('Ese usuario no tiene permisos en el bar.'); }
    perfil = datos;
    document.querySelectorAll('.solo-admin').forEach((a) => { a.hidden = !esAdmin(); });
    document.getElementById('quien').textContent = perfil.nombre;
    nav.hidden = false;
    sincronizar();
    navegar();
  }

  document.getElementById('salir').addEventListener('click', () => { if (confirm('¿Cerrar sesión?')) salir(); });
  db.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && perfil) location.reload(); });

  entrar();
})();
