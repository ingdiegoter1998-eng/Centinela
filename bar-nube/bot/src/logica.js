// Conversación del bot, sin WhatsApp ni red: recibe un mensaje y decide qué responder.
// Todo lo externo entra por `api` y `enviar`, así se prueba entero con `node --test`.
//
//   api.buscar(texto)                → [{ proveedor, pista_id, titulo, artista, artista_ids, portada, duracion_ms }]
//   api.precio(proveedor, ids)       → puntos que cuesta esa canción
//   api.miEstado(celular)            → { registrado, saldo, en_cola, max_pendientes }
//   api.registrar(celular, nombre)   → saldo (abona la bienvenida si es nuevo)
//   api.pedir(celular, nombre, pista)→ { id, costo, saldo }   (lanza Error con mensaje claro si no se puede)
//   api.estado()                     → { activa, sonando, cola: [{ id, titulo, artista, nombre, mesa }], reproductor?: { conectado, ok } }

const OPCIONES = 3;
const VIDA_OPCIONES_MS = 5 * 60 * 1000;
export const VIDA_NUMERO_SUELTO_MS = 3 * 60 * 1000;   // un número sin comillas solo vale si las opciones se mostraron hace menos de esto
const NUMEROS = ['1)', '2)', '3)'];
export const LEMA = 'Pon tu música, tu caos';
export const SIN_BAFLE = 'El bafle está desconectado y por ahora no recibo pedidos (no te cobro nada). Avísale al barman.';
const bafleCaido = (e) => !!(e && e.reproductor && e.reproductor.conectado && !e.reproductor.ok);

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

// Modo «solo entre comillas»: el bot solo atiende mensajes escritos así: "besos en guerra morat". Acepta comillas
// rectas, tipográficas (“ ”) y latinas («»). Devuelve lo de adentro, o null si el mensaje no viene entre comillas.
export function entreComillas(texto) {
  const m = String(texto || '').match(/^\s*["“”„«]\s*([\s\S]*?)\s*["“”«»]\s*$/);
  return m && m[1].trim() ? m[1].trim() : null;
}

// ¿Este mensaje es para el bot? Devuelve el texto a procesar o null (se ignora en silencio).
//   soloComillas   → exige que el mensaje venga entre comillas y las quita
//   aceptarPropio  → atiende lo que tú escribes en el chat contigo mismo (fromMe && propio)
// Lo que tú mismo escribes en el chat de OTRA persona (fromMe sin ser el chat propio) nunca se atiende.
export function paraElBot({ texto, fromMe = false, propio = false, soloComillas = false, aceptarPropio = false }) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (fromMe && !(aceptarPropio && propio)) return null;
  if (!soloComillas) return t;
  return entreComillas(t);
}

// Un «1», «2» o «3» suelto (también «1.» o «1)»). Devuelve el dígito o null.
export function numeroSuelto(texto) {
  const m = String(texto || '').match(/^\s*([1-3])\s*[.)]?\s*$/);
  return m ? m[1] : null;
}

// Como paraElBot, pero con una excepción a la regla de las comillas: si la persona acaba de recibir opciones de una búsqueda
// (`busquedaAbierta()` → true) y responde solo «1», «2» o «3» sin comillas, también cuenta. `busquedaAbierta` solo se llama
// en ese caso (es asíncrona porque saber quién escribe puede requerir resolver su número).
export async function textoParaElBot(args, busquedaAbierta) {
  const t = paraElBot(args);
  if (t !== null || !args.soloComillas) return t;
  const suelto = numeroSuelto(paraElBot({ ...args, soloComillas: false }));   // respeta lo de fromMe / chat propio
  if (suelto === null) return null;
  return (await busquedaAbierta()) ? suelto : null;
}

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pts = (n) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

// Los errores de Postgres llegan como «Te faltan 8 puntos (cuesta 24, tienes 16)»; se dejan tal cual salvo ruido técnico.
export function mensajeDeError(e) {
  const m = String((e && e.message) || e || '').replace(/^.*?(ERROR:|error:)\s*/s, '').trim();
  if (!m || /fetch failed|ECONN|ETIMEDOUT|network|timeout/i.test(m)) return 'Uy, ahora no puedo hablar con la rockola. Intenta en un momentico.';
  if (/permission denied|jwt|apikey|row-level/i.test(m)) return 'Algo está mal configurado de mi lado. Avísale al barman.';
  return m;
}

export function crearBot({ api, enviar, ahora = () => Date.now(), limitePorMinuto = 12, comillas = false }) {
  const Q = (t) => (comillas ? `"${t}"` : t);   // en modo comillas, los ejemplos del bot van entre comillas
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

  const AYUDA = (saldo) => `*Rockola del Callejón del Gato*
_${LEMA}_
${comillas ? 'Escríbeme *entre comillas* el nombre de la canción y el artista, por ejemplo: *"besos en guerra morat"*. Lo que no vaya entre comillas no lo leo.' : 'Escríbeme el nombre de la canción y el artista, por ejemplo: *besos en guerra morat*.'} Te muestro 3 opciones y eliges con el número.

• *${Q('puntos')}*: tu saldo${saldo != null ? ` (tienes ${pts(saldo)})` : ''}
• *${Q('cola')}*: lo que suena y lo que sigue
• *${Q('cancelar')}*: borra la búsqueda

Los puntos se ganan consumiendo: 1 punto por cada $1.000.`;

  async function bienvenida(celular, nombre) {
    const saldo = await api.registrar(celular, nombre);
    return `¡Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''}! Soy la rockola del Callejón del Gato. Te di *${pts(saldo)}* de bienvenida.\n\n${AYUDA(null)}`;
  }

  async function mostrarCola() {
    const e = await api.estado();
    const quien = (p) => [p.nombre, p.mesa ? `mesa ${p.mesa}` : ''].filter(Boolean).join(', ');
    const lineas = [];
    lineas.push(e.sonando ? `Suena: *${e.sonando.titulo}* — ${e.sonando.artista}${quien(e.sonando) ? ` (${quien(e.sonando)})` : ''}` : 'Ahora no suena nada');
    e.cola.slice(0, 5).forEach((p, i) => lineas.push(`${i + 1}. ${p.titulo} — ${p.artista}${quien(p) ? ` (${quien(p)})` : ''}`));
    if (!e.cola.length) lineas.push('La cola está vacía, ¡pon la primera!');
    else if (e.cola.length > 5) lineas.push(`…y ${e.cola.length - 5} más`);
    if (!e.activa) lineas.push('\nLos pedidos están en pausa por ahora.');
    if (bafleCaido(e)) lineas.push('\n' + SIN_BAFLE);
    return lineas.join('\n');
  }

  async function buscar(celular, texto) {
    const consulta = limpiarBusqueda(texto);
    if (bafleCaido(await api.estado())) return SIN_BAFLE;      // no se muestran opciones que no van a poder pedirse
    if (consulta.length < 2) return `Dime qué canción quieres, por ejemplo: *${Q('besos en guerra morat')}*.`;
    const resultados = (await api.buscar(consulta)).slice(0, OPCIONES);
    if (!resultados.length) return `No encontré nada con «${consulta}». Prueba con el nombre de la canción y el artista.`;
    const opciones = await Promise.all(resultados.map(async (r) => ({ ...r, costo: await api.precio(r.proveedor, r.artista_ids) })));
    pendientes.set(celular, { opciones, vence: ahora() + VIDA_OPCIONES_MS, desde: ahora() });
    const est = await api.miEstado(celular);
    return `Encontré esto:\n${opciones.map((o, i) => `${NUMEROS[i]} ${o.titulo} — ${o.artista} · ${pts(o.costo)}`).join('\n')}\n\nResponde con el número${opciones.length > 1 ? ` (1 a ${opciones.length})` : ''}${comillas ? ', con o sin comillas' : ''}. Tienes ${pts(est.saldo)}.`;
  }

  async function elegir(celular, nombre, n) {
    const p = pendientes.get(celular);
    if (!p || p.vence < ahora()) { pendientes.delete(celular); return `Esa búsqueda ya venció. Escríbeme otra vez la canción${comillas ? ' entre comillas' : ''}.`; }
    const pista = p.opciones[n - 1];
    if (!pista) return `Elige un número del ${Q('1')} al ${Q(String(p.opciones.length))}.`;
    const r = await api.pedir(celular, nombre, pista);
    pendientes.delete(celular);
    const e = await api.estado();
    const puesto = e.cola.findIndex((x) => x.id === r.id) + 1;
    const cuando = e.sonando || puesto > 1 ? (puesto ? `Va en el puesto *${puesto}* de la cola.` : '') : 'Es la siguiente en sonar.';
    return `*${pista.titulo}* quedó en la cola. ${cuando}\nGastaste ${pts(r.costo)}, te quedan ${pts(r.saldo)}.`;
  }

  // Punto de entrada. `celular`: solo dígitos con indicativo. Devuelve el texto enviado (o null).
  async function manejar({ celular, nombre, texto }) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const limite = pasaLimite(celular);
    if (limite === false) return null;
    if (limite === 'aviso') { const m = 'Vas muy rápido. Dame un minutico.'; await enviar(celular, m); return m; }

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
      else if (/^(cancelar|cancela|nada|olvidalo|no)$/.test(norm)) { pendientes.delete(celular); respuesta = 'Listo, cancelado.'; }
      else respuesta = await buscar(celular, t);
    } catch (e) {
      respuesta = mensajeDeError(e);
    }
    await enviar(celular, respuesta);
    return respuesta;
  }

  // ¿Esta persona tiene opciones de una búsqueda recién mostradas (para aceptarle un número suelto sin comillas)?
  const tieneBusqueda = (celular) => {
    const p = pendientes.get(celular);
    return !!p && p.vence >= ahora() && ahora() - p.desde <= VIDA_NUMERO_SUELTO_MS;
  };

  return { manejar, tieneBusqueda, _pendientes: pendientes };
}
