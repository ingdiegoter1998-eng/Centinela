// Reconoce los mensajes que el propio bot envió, para no contestarse en bucle en el chat contigo mismo
// (ahí sus respuestas vuelven como mensajes «fromMe»). Se mira el id del mensaje y, por si el id llega tarde
// (el evento puede adelantarse a la respuesta de sendMessage), el texto enviado en los últimos 3 minutos.
export function crearEco({ ahora = () => Date.now(), vidaMs = 3 * 60 * 1000, maxIds = 300 } = {}) {
  const ids = new Set();
  const textos = [];   // [texto, momento]
  return {
    registrar(resultado, texto) {
      if (resultado?.key?.id) {
        ids.add(resultado.key.id);
        if (ids.size > maxIds) ids.delete(ids.values().next().value);
      }
      textos.push([texto, ahora()]);
    },
    esEco(m, texto) {
      if (ids.has(m?.key?.id)) return true;
      const t = ahora();
      while (textos.length && t - textos[0][1] > vidaMs) textos.shift();
      return textos.some(([x]) => x === texto);
    },
  };
}
