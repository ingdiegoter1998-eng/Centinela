// Conversación del bot, sin WhatsApp ni red: recibe un mensaje y decide qué responder.
// Todo lo externo entra por `api` y `enviar`, así se prueba entero con `node --test`.
//
//   api.buscar(texto)                → [{ proveedor, pista_id, titulo, artista, artista_ids, portada, duracion_ms }]
//   api.precio(proveedor, ids)       → puntos que cuesta esa canción
//   api.miEstado(celular)            → { registrado, saldo, en_cola, max_pendientes }
//   api.registrar(celular, nombre)   → saldo (abona la bienvenida si es nuevo)
//   api.pedir(celular, nombre, pista)→ { id, costo, saldo }   (lanza Error con mensaje claro si no se puede)
//   api.estado()                     → { activa, sonando, cola: [{ id, titulo, artista, nombre, mesa }] }

const OPCIONES = 3;
const VIDA_OPCIONES_MS = 5 * 60 * 1000;
const NUMEROS = ['1️⃣', '2️⃣', '3️⃣'];

// «Pónme besos en guerra de morat» → «besos en guerra morat»
export function limpiarBusqueda(texto) {
  return String(texto || '')
    .replace(/[̀-ͯ]/g, (c) => c)       // (los acentos se conservan: Spotify los entiende)
    .replace(/^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches)[,!.\s]*/i, '')
    .replace(/^\s*(por favor|porfa|pf)[,\s]*/i, '')
    .replace(/^\s*(me\s+)?(pones?|ponme|poner|pon|quiero( escuchar)?|quisiera|pide|pedir|play|suena|reproduce|dale|ponga|colocar?|coloca)\b[\s:,]*/i, '')
    .replace(/^\s*(la\s+)?(canci[oó]n|rola|tema|m[uú]sica)\s+(de\s+)?/i, '')
    .replace(/\s+(por favor|porfa)\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pts = (n) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

// Los errores de Postgres llegan como «Te faltan 8 puntos (cuesta 24, tienes 16)»; se dejan tal cual salvo ruido técnico.
export function mensajeDeError(e) {
  const m = String((e && e.message) || e || '').replace(/^.*?(ERROR:|error:)\s*/s, '').trim();
  if (!m || /fetch failed|ECONN|ETIMEDOUT|network|timeout/i.test(m)) return 'Uy, ahora no puedo hablar con la rockola. Intenta en un momentico 🙏';
  if (/permission denied|jwt|apikey|row-level/i.test(m)) return 'Algo está mal configurado de mi lado. Avísale al barman 🙏';
  return m;
}

export function crearBot({ api, enviar, ahora = () => Date.now(), limitePorMinuto = 12 }) {
  const pendientes = new Map();   // celular → { opciones, vence }
  const recientes = new Map();    // celular → [marcas de tiempo]   (anti-spam)
  const avisados = new Set();

  function pasaLimite(celular) {
    const t = ahora();
    const lista = (recientes.get(celular) || []).filter((x) => t - x < 60_000);
    lista.push(t);
    recientes.set(celular, lista);
    if (lista.length <= limitePorMinuto) { avisados.delete(celular); return true; }
    if (!avisados.has(celular)) { avisados.add(celular); return 'aviso'; }
    return false;
  }

  const AYUDA = (saldo) => `🎶 *Rockola del Callejón del Gato*
Escríbeme el nombre de la canción y el artista, por ejemplo: *besos en guerra morat*. Te muestro 3 opciones y eliges con el número.

• *puntos*: tu saldo${saldo != null ? ` (tienes ${pts(saldo)})` : ''}
• *cola*: lo que suena y lo que sigue
• *cancelar*: borra la búsqueda

Los puntos se ganan consumiendo: 1 punto por cada $1.000 😉`;

  async function bienvenida(celular, nombre) {
    const saldo = await api.registrar(celular, nombre);
    return `¡Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''}! 🎶 Soy la rockola del Callejón del Gato. Te di *${pts(saldo)}* de bienvenida.\n\n${AYUDA(null)}`;
  }

  async function mostrarCola() {
    const e = await api.estado();
    const quien = (p) => [p.nombre, p.mesa ? `mesa ${p.mesa}` : ''].filter(Boolean).join(', ');
    const lineas = [];
    lineas.push(e.sonando ? `▶️ Suena: *${e.sonando.titulo}* — ${e.sonando.artista}${quien(e.sonando) ? ` (${quien(e.sonando)})` : ''}` : '▶️ Ahora no suena nada');
    e.cola.slice(0, 5).forEach((p, i) => lineas.push(`${i + 1}. ${p.titulo} — ${p.artista}${quien(p) ? ` (${quien(p)})` : ''}`));
    if (!e.cola.length) lineas.push('La cola está vacía, ¡pon la primera!');
    else if (e.cola.length > 5) lineas.push(`…y ${e.cola.length - 5} más`);
    if (!e.activa) lineas.push('\n⏸ Los pedidos están en pausa por ahora.');
    return lineas.join('\n');
  }

  async function buscar(celular, texto) {
    const consulta = limpiarBusqueda(texto);
    if (consulta.length < 2) return 'Dime qué canción quieres, por ejemplo: *besos en guerra morat* 🎵';
    const resultados = (await api.buscar(consulta)).slice(0, OPCIONES);
    if (!resultados.length) return `No encontré nada con «${consulta}» 😕 Prueba con el nombre de la canción y el artista.`;
    const opciones = await Promise.all(resultados.map(async (r) => ({ ...r, costo: await api.precio(r.proveedor, r.artista_ids) })));
    pendientes.set(celular, { opciones, vence: ahora() + VIDA_OPCIONES_MS });
    const est = await api.miEstado(celular);
    return `Encontré esto:\n${opciones.map((o, i) => `${NUMEROS[i]} ${o.titulo} — ${o.artista} · ${pts(o.costo)}`).join('\n')}\n\nResponde con el número${opciones.length > 1 ? ` (1 a ${opciones.length})` : ''}. Tienes ${pts(est.saldo)}.`;
  }

  async function elegir(celular, nombre, n) {
    const p = pendientes.get(celular);
    if (!p || p.vence < ahora()) { pendientes.delete(celular); return 'Esa búsqueda ya venció. Escríbeme otra vez la canción 🎵'; }
    const pista = p.opciones[n - 1];
    if (!pista) return `Elige un número del 1 al ${p.opciones.length}.`;
    const r = await api.pedir(celular, nombre, pista);
    pendientes.delete(celular);
    const e = await api.estado();
    const puesto = e.cola.findIndex((x) => x.id === r.id) + 1;
    const cuando = e.sonando || puesto > 1 ? (puesto ? `Va en el puesto *${puesto}* de la cola.` : '') : 'Es la siguiente en sonar. 🔥';
    return `✅ *${pista.titulo}* quedó en la cola. ${cuando}\nGastaste ${pts(r.costo)}, te quedan ${pts(r.saldo)}.`;
  }

  // Punto de entrada. `celular`: solo dígitos con indicativo. Devuelve el texto enviado (o null).
  async function manejar({ celular, nombre, texto }) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const limite = pasaLimite(celular);
    if (limite === false) return null;
    if (limite === 'aviso') { const m = 'Vas muy rápido 😅 Dame un minutico.'; await enviar(celular, m); return m; }

    let respuesta;
    try {
      const est = await api.miEstado(celular);
      const norm = sinAcentos(t).replace(/[!¡?¿.]+$/g, '');
      if (!est.registrado) {
        respuesta = await bienvenida(celular, nombre);
        if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|ayuda|menu|help|hey|ola)$/.test(norm) || norm.length < 2) { await enviar(celular, respuesta); return respuesta; }
        await enviar(celular, respuesta);        // bienvenida, y a continuación se atiende lo que escribió
      }
      if (/^[1-3]$/.test(norm)) respuesta = await elegir(celular, nombre, Number(norm));
      else if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|ayuda|menu|help|hey|ola)$/.test(norm)) respuesta = AYUDA(est.saldo);
      else if (/^(puntos|saldo|mis puntos|cuantos puntos tengo|cuantos puntos)$/.test(norm)) respuesta = `Tienes *${pts(est.saldo)}*. Tienes ${est.en_cola} ${est.en_cola === 1 ? 'canción' : 'canciones'} en cola (máximo ${est.max_pendientes}).`;
      else if (/^(cola|lista|que sigue|que suena|que hay|siguiente|siguientes)$/.test(norm)) respuesta = await mostrarCola();
      else if (/^(cancelar|cancela|nada|olvidalo|no)$/.test(norm)) { pendientes.delete(celular); respuesta = 'Listo, cancelado 👌'; }
      else respuesta = await buscar(celular, t);
    } catch (e) {
      respuesta = mensajeDeError(e);
    }
    await enviar(celular, respuesta);
    return respuesta;
  }

  return { manejar, _pendientes: pendientes };
}
