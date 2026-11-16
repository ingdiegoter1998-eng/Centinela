// Conexión con Supabase con la llave service_role (secreta: vive solo en el .env del celular del bot).
import { createClient } from '@supabase/supabase-js';

export function crearApi({ url, serviceKey, fetchFn = fetch }) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async (nombre, args) => {
    const { data, error } = await db.rpc(nombre, args);
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async buscar(texto) {
      const r = await fetchFn(`${url}/functions/v1/rockola-buscar?q=${encodeURIComponent(texto)}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || 'No pude buscar ahora');
      return d;
    },
    precio: (proveedor, ids) => rpc('rockola_precio', { p_proveedor: proveedor, p_artista_ids: ids || [] }),
    miEstado: (celular) => rpc('rockola_mi_estado', { p_celular: celular }),
    registrar: (celular, nombre) => rpc('rockola_registrar', { p_celular: celular, p_nombre: nombre || '' }),
    estado: () => rpc('rockola_estado', { p_cliente: '' }),
    pedir: (celular, nombre, p) => rpc('rockola_pedir_puntos', {
      p_celular: celular, p_nombre: nombre || '', p_mesa: '', p_proveedor: p.proveedor, p_pista: p.pista_id,
      p_titulo: p.titulo, p_artista: p.artista, p_artista_ids: p.artista_ids || [], p_portada: p.portada || '', p_duracion_ms: p.duracion_ms || 0,
    }),
  };
}
