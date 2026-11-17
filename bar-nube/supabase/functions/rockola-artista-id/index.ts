// Traduce nombres de artista a su id de Spotify (para cargar el catálogo de artistas ya clasificados, ver artistas_catalogo.sql).
// Solo lee el catálogo público de Spotify (client credentials, como rockola-buscar). No escribe nada.
//   supabase functions deploy rockola-artista-id --no-verify-jwt
// POST { nombres: ['Morat', 'Karol G', …] }  (hasta 25)  →  { 'Morat': { id, nombre }, 'Karol G': null, … }
// Solo devuelve un artista si su nombre coincide exactamente con el pedido (sin tildes ni mayúsculas); entre varios, el más popular.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usa POST.' }, 405);
  try {
    const { nombres } = await req.json();
    if (!Array.isArray(nombres) || nombres.length > 25) return json({ error: 'nombres: hasta 25.' }, 400);
    const t = await obtenerToken();
    const salida: Record<string, { id: string; nombre: string } | null> = {};
    await Promise.all(nombres.map(async (n: unknown) => {
      const nombre = String(n ?? '').slice(0, 100);
      const r = await fetch('https://api.spotify.com/v1/search?type=artist&limit=5&market=CO&q=' + encodeURIComponent(nombre), { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) { salida[nombre] = null; return; }
      const items = ((await r.json()).artists?.items ?? []).filter((a: any) => norm(a.name) === norm(nombre));
      items.sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0));
      salida[nombre] = items[0] ? { id: items[0].id, nombre: items[0].name } : null;
    }));
    return json(salida);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
