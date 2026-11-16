// Controlador de la rockola: hace de DJ sobre Spotify Connect (cualquier celular de la cuenta que esté sonando).
//   supabase functions deploy rockola-control --no-verify-jwt
// Secretos que ya existen del buscador: SPOTIFY_CLIENT_ID (el secreto de cliente NO hace falta: el login es PKCE).
//
// Quién lo llama:
//   · pg_cron (vía rockola_ctl_disparar) con el secreto generado en la base: acción «tick», cada ~5 s mientras hay trabajo.
//   · El panel del personal (rockola/player.html) con la sesión del usuario: estado, dispositivos, pausa, volumen, saltar.
//     «conectar» y «desconectar» (la cuenta de Spotify) solo el administrador.
// El refresh token de Spotify vive en rockola_spotify, que ni el anónimo ni el personal pueden leer por la API.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { crearSpotify, clasificar } from './spotify.mjs';
import { tick, elegirDispositivo, textoError } from './tick.mjs';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(URL_SB, SERVICIO, { auth: { persistSession: false, autoRefreshToken: false } });
// deno-lint-ignore no-explicit-any
const rpc = async (nombre: string, args: Record<string, unknown> = {}): Promise<any> => {
  const { data, error } = await admin.rpc(nombre, args);
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
};

const sp = crearSpotify({
  clientId: CLIENT_ID,
  leerRefresh: async () => (await admin.from('rockola_spotify').select('refresh_token').maybeSingle()).data?.refresh_token ?? null,
  guardarRefresh: async (t: string) => { await admin.from('rockola_spotify').update({ refresh_token: t }).eq('id', true); },
});

const db = {
  estado: () => rpc('rockola_ctl_estado'),
  avanzar: (final: string, id: number | null, confirmada: boolean) => rpc('rockola_ctl_avanzar', { p_final: final, p_id: id, p_confirmada: confirmada }),
  confirmar: (id: number) => rpc('rockola_ctl_confirmar', { p_id: id }),
  devolver: (id: number) => rpc('rockola_ctl_devolver', { p_id: id }),
  fallo: (id: number, motivo: string) => rpc('rockola_ctl_fallo', { p_id: id, p_motivo: motivo }),
  encolada: (id: number) => rpc('rockola_ctl_encolada', { p_id: id }),
  // deno-lint-ignore no-explicit-any
  latido: (l: any) => rpc('rockola_ctl_latido', {
    p_dispositivo: l.dispositivo ?? null, p_dispositivo_id: l.dispositivo_id ?? null,
    p_reproduciendo: l.reproduciendo ?? false, p_error: l.error ?? null,
  }),
  pausa: (v: boolean) => rpc('rockola_ctl_pausa', { p_pausada: v }),
};

// Un solo tick a la vez (el cron y el botón Saltar pueden coincidir).
async function correrTick() {
  if (!(await rpc('rockola_ctl_tomar'))) return { accion: 'ocupado' };
  try {
    return await tick({ db, sp, log: (...a: unknown[]) => console.log(...a) });
  } finally {
    await rpc('rockola_ctl_soltar').catch(() => {});
  }
}

// ¿Quién llama? 'cron' (secreto de la base), o el rol del usuario con sesión ('admin' | 'barman').
async function quien(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if ((await admin.rpc('rockola_ctl_verificar', { p_secreto: token })).data === true) return 'cron';
  const usuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await usuario.rpc('rockola_panel_permiso');
  return typeof data === 'string' ? data : null;
}

// El dispositivo sobre el que actúan pausa, volumen, etc.: el activo, o el mejor disponible.
async function dispositivo() {
  const st = await sp.estado();
  if (st.dispositivo) return st.dispositivo;
  const { data } = await admin.from('rockola_reproductor').select('preferido_id').maybeSingle();
  const d = elegirDispositivo(await sp.dispositivos(), data?.preferido_id);
  if (!d) throw new Error('No hay ningún dispositivo con Spotify abierto. Abre Spotify en el celular del bafle.');
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  const rol = await quien(req);
  if (!rol) return json({ error: 'Sin permiso' }, 401);
  // deno-lint-ignore no-explicit-any
  const b: any = await req.json().catch(() => ({}));
  const soloAdmin = () => { if (rol !== 'admin' && rol !== 'cron') throw Object.assign(new Error('Solo el administrador puede hacer eso'), { http: 403 }); };

  try {
    switch (b.accion) {
      case 'tick':
        return json(await correrTick());

      case 'estado': {   // lo que muestra el panel: cuenta, latido y dispositivos
        const { data: cuenta } = await admin.from('rockola_spotify').select('cuenta, conectado_en').maybeSingle();
        const { data: r } = await admin.from('rockola_reproductor').select('verificado_en, dispositivo, dispositivo_id, reproduciendo, error, pausada, preferido_id').maybeSingle();
        let dispositivos: unknown[] = [], errorSpotify: string | null = null;
        if (cuenta) { try { dispositivos = await sp.dispositivos(); } catch (e) { errorSpotify = textoError(e) || String((e as Error).message); } }
        return json({ conectado: !!cuenta, cuenta: cuenta?.cuenta ?? '', reproductor: r, dispositivos, error: errorSpotify });
      }

      case 'conectar': {   // el panel vuelve de Spotify con ?code=...: se canjea aquí y el refresh token se guarda en la base
        soloAdmin();
        if (!b.code || !b.verificador || !b.redirect) return json({ error: 'Faltan datos del inicio de sesión' }, 400);
        const refresh = await sp.canjear({ code: String(b.code), verificador: String(b.verificador), redirect: String(b.redirect) });
        const cuenta = await sp.cuenta().catch(() => '');
        const { error } = await admin.from('rockola_spotify').upsert({ id: true, refresh_token: refresh, cuenta, conectado_en: new Date().toISOString() });
        if (error) throw new Error(error.message);
        await rpc('rockola_ctl_pausa', { p_pausada: false });
        return json({ ok: true, cuenta, tick: await correrTick() });
      }
      case 'desconectar':
        soloAdmin();
        await admin.from('rockola_spotify').delete().eq('id', true);
        await rpc('rockola_ctl_latido');
        return json({ ok: true });

      case 'dispositivos':
        return json(await sp.dispositivos());
      case 'transferir': {   // «usar este celular»: se le pasa la reproducción (sin tocar nada) y queda como preferido
        if (!b.device_id) return json({ error: 'Falta el dispositivo' }, 400);
        await sp.transferir(String(b.device_id), false);
        await rpc('rockola_ctl_preferido', { p_id: String(b.device_id) });
        return json({ ok: true, tick: await correrTick() });
      }
      case 'pausar': { const d = await dispositivo(); await db.pausa(true); await sp.pausar(d.id); return json({ ok: true }); }
      case 'reanudar': { const d = await dispositivo(); await db.pausa(false); await sp.reanudar(d.id); return json({ ok: true, tick: await correrTick() }); }
      case 'volumen': { const d = await dispositivo(); await sp.volumen(Number(b.valor), d.id); return json({ ok: true }); }
      case 'saltar': {   // la base pasa a la siguiente (la actual queda «saltada», sin devolver puntos) y el tick la pone a sonar
        await db.pausa(false);
        await rpc('rockola_ctl_avanzar', { p_final: 'saltada' });
        return json({ ok: true, tick: await correrTick() });
      }
      default:
        return json({ error: 'Acción desconocida' }, 400);
    }
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const err = e as any;
    console.error('rockola-control', b?.accion, err?.message);
    return json({ error: textoError(err) || err?.message || 'Algo falló', tipo: err?.status != null ? clasificar(err) : undefined }, err?.http ?? 502);
  }
});
