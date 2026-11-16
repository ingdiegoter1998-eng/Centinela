// Busca canciones en Spotify para los clientes de la rockola (que no tienen cuenta ni llave).
// Usa «client credentials»: el secreto vive solo aquí, como secreto de la función, nunca en el repo.
//   supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
//   supabase functions deploy rockola-buscar --no-verify-jwt
// GET ?q=texto  →  [{ proveedor, pista_id, titulo, artista, portada, duracion_ms }]
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return json([]);
  try {
    const url = 'https://api.spotify.com/v1/search?type=track&limit=10&market=CO&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await obtenerToken()) } });
    if (!r.ok) return json({ error: 'Spotify no respondió (' + r.status + ')' }, 502);
    const d = await r.json();
    return json((d.tracks?.items ?? []).map((t: any) => ({
      proveedor: 'spotify',
      pista_id: t.id,
      titulo: t.name,
      artista: (t.artists ?? []).map((a: any) => a.name).join(', '),
      portada: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? '',
      duracion_ms: t.duration_ms ?? 0,
    })));
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
