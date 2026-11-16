// Busca canciones en Spotify para los clientes de la rockola (que no tienen cuenta ni llave).
// Usa «client credentials»: el secreto vive solo aquí, como secreto de la función, nunca en el repo.
//   supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
//   supabase functions deploy rockola-buscar --no-verify-jwt
// GET ?q=texto  →  [{ proveedor, pista_id, titulo, artista, artista_ids, portada, duracion_ms }]
// (artista_ids sirve para calcular el precio en puntos según el género: rockola_precio en la base)
// Antes de responder, los artistas que aún no tienen género se clasifican solos con las etiquetas de Spotify
// (clasificar.mjs), para que el precio ya sea el del género. Lo que clasificó el personal a mano no se toca.
// POST {accion:'clasificar_pendientes'} (con la sesión del personal): clasifica hasta 40 artistas pendientes.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

import { createClient } from 'npm:@supabase/supabase-js@2';
import { elegirGenero } from './clasificar.mjs';

const URL_SB = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const base = () => createClient(URL_SB, SERVICIO, { auth: { persistSession: false, autoRefreshToken: false } });

let token: { valor: string; vence: number } | null = null;

async function obtenerToken(): Promise<string> {
  if (token && token.vence > Date.now() + 30_000) return token.valor;
  const id = Deno.env.get('SPOTIFY_CLIENT_ID'), secreto = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!id || !secreto) throw new Error('Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${id}:${secreto}`) },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('Spotify rechazó las credenciales');
  const d = await r.json();
  token = { valor: d.access_token, vence: Date.now() + d.expires_in * 1000 };
  return token.valor;
}


// Etiquetas de género de Spotify por artista. Prueba el lote (/artists?ids=) y, si Spotify lo rechaza, uno por uno.
async function etiquetasSpotify(ids: string[]): Promise<Map<string, { nombre: string; generos: string[] | null }>> {
  const t = await obtenerToken();
  const salida = new Map<string, { nombre: string; generos: string[] | null }>();
  const guardar = (a: any) => { if (a?.id) salida.set(a.id, { nombre: a.name ?? '', generos: Array.isArray(a.genres) ? a.genres : null }); };
  const lote = await fetch('https://api.spotify.com/v1/artists?ids=' + ids.join(','), { headers: { Authorization: 'Bearer ' + t } });
  if (lote.ok) { for (const a of (await lote.json()).artists ?? []) guardar(a); return salida; }
  await Promise.all(ids.map(async (id) => {
    const r = await fetch('https://api.spotify.com/v1/artists/' + id, { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) guardar(await r.json());
  }));
  return salida;
}

// Clasifica a los artistas de `ids` que nadie ha mirado (origen null). Devuelve cuántos quedaron con género.
async function clasificarArtistas(ids: string[]): Promise<{ revisados: number; clasificados: number }> {
  ids = [...new Set(ids.filter(Boolean))].slice(0, 40);
  if (!ids.length || !URL_SB || !SERVICIO) return { revisados: 0, clasificados: 0 };
  const db = base();
  const { data: existentes, error } = await db.from('rockola_artistas').select('artista_id, origen').eq('proveedor', 'spotify').in('artista_id', ids);
  if (error) throw new Error(error.message);
  const yaVistos = new Set((existentes ?? []).filter((a: any) => a.origen).map((a: any) => a.artista_id));
  const existe = new Set((existentes ?? []).map((a: any) => a.artista_id));
  const pendientes = ids.filter((id) => !yaVistos.has(id));
  if (!pendientes.length) return { revisados: 0, clasificados: 0 };
  const { data: gs } = await db.from('rockola_generos').select('genero, multiplicador');
  const mult: Record<string, number> = Object.fromEntries((gs ?? []).map((g: any) => [g.genero, Number(g.multiplicador)]));
  const info = await etiquetasSpotify(pendientes);
  let clasificados = 0, revisados = 0;
  await Promise.all(pendientes.map(async (id) => {
    const a = info.get(id);
    if (!a || a.generos === null) return;          // Spotify no dio el artista o no trae etiquetas: se reintenta otro día
    const genero = elegirGenero(a.generos, mult);
    const fila = { genero, origen: 'spotify', etiquetas: a.generos };
    if (existe.has(id)) {
      // Solo si sigue sin mirar: si el personal lo clasificó mientras tanto, gana el personal.
      const { data } = await db.from('rockola_artistas').update({ ...fila, ...(a.nombre ? { nombre: a.nombre } : {}) })
        .eq('proveedor', 'spotify').eq('artista_id', id).is('origen', null).select('artista_id');
      if (!data?.length) return;
    } else {
      const { error: e2 } = await db.from('rockola_artistas').upsert({ proveedor: 'spotify', artista_id: id, nombre: a.nombre, ...fila }, { onConflict: 'proveedor,artista_id', ignoreDuplicates: true });
      if (e2) return;
    }
    revisados++; if (genero) clasificados++;
  }));
  return { revisados, clasificados };
}

async function esPersonal(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !URL_SB || !ANON) return false;
  const usuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await usuario.rpc('es_personal');
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'POST') {
    try {
      if (!(await esPersonal(req))) return json({ error: 'Inicia sesión como personal.' }, 403);
      const { accion } = await req.json().catch(() => ({}));
      if (accion !== 'clasificar_pendientes') return json({ error: 'Acción desconocida.' }, 400);
      const db = base();
      const { data } = await db.from('rockola_artistas').select('artista_id').eq('proveedor', 'spotify').is('origen', null).limit(40);
      const r = await clasificarArtistas((data ?? []).map((a: any) => a.artista_id));
      const { count } = await db.from('rockola_artistas').select('artista_id', { count: 'exact', head: true }).eq('proveedor', 'spotify').is('origen', null);
      return json({ ...r, restantes: count ?? 0 });
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500);
    }
  }
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return json([]);
  try {
    const url = 'https://api.spotify.com/v1/search?type=track&limit=10&market=CO&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await obtenerToken()) } });
    if (!r.ok) return json({ error: 'Spotify no respondió (' + r.status + ')' }, 502);
    const d = await r.json();
    const pistas = (d.tracks?.items ?? []).map((t: any) => ({
      proveedor: 'spotify',
      pista_id: t.id,
      titulo: t.name,
      artista: (t.artists ?? []).map((a: any) => a.name).join(', '),
      artista_ids: (t.artists ?? []).map((a: any) => a.id),
      portada: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? '',
      duracion_ms: t.duration_ms ?? 0,
    }));
    // El género no puede tumbar la búsqueda: si algo falla o tarda más de 4 s, se responde igual (queda para la próxima).
    try {
      await Promise.race([
        clasificarArtistas(pistas.flatMap((p: any) => p.artista_ids)),
        new Promise((ok) => setTimeout(ok, 4000)),
      ]);
    } catch (e) { console.error('clasificar:', (e as Error).message ?? e); }
    return json(pistas);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
