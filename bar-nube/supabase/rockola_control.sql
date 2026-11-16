-- Rockola, parte 3: el controlador de Spotify Connect (cualquier celular de la cuenta que esté sonando).
-- Se aplica DESPUÉS de schema.sql, rockola.sql y rockola_puntos.sql; es seguro repetirlo:  ./aplicar.sh rockola_control.sql
-- (si vuelves a correr rockola_puntos.sql, corre este otra vez: redefine rockola_estado.)
--
-- Cómo suena la música ahora: nadie abre una pestaña. Un celular (el del bafle, por Bluetooth) tiene la app de
-- Spotify abierta con la cuenta Premium del bar. La función de borde `rockola-control` hace de DJ: cada pocos segundos
-- (pg_cron la dispara SOLO cuando hay cola o canción sonando, y una vez por minuto para vigilar) mira qué toca Spotify,
-- le dice qué canción poner, la deja encolada unos segundos antes de que acabe la anterior (sin silencios) y pasa a la
-- siguiente de la cola. Este archivo es el lado de la base: el estado, el latido y las reglas.
--
-- Garantías:
--   · Latido: la función anota cada vez que mira (dispositivo, errores). Si Spotify ya está conectado y el bafle no
--     responde, la base RECHAZA pedidos nuevos (nadie paga puntos por una canción que no va a sonar) y la TV avisa.
--   · Si Spotify no puede tocar una canción (no existe, no está disponible), el pedido queda «fallida» y los puntos se devuelven.
--   · Si el problema es el dispositivo o la red, la canción vuelve a la cola, sin perder el puesto ni los puntos.
--   · El refresh token de Spotify vive en una tabla que ni el anónimo ni el personal pueden leer: solo la función de borde.

-- ── Tablas ──────────────────────────────────────────────────────────────────────────────────
create table if not exists rockola_spotify (            -- la cuenta de Spotify conectada (una sola)
  id            boolean primary key default true check (id),
  refresh_token text not null,
  cuenta        text not null default '',
  conectado_en  timestamptz not null default now(),
  conectado_por uuid
);

create table if not exists rockola_reproductor (        -- lo último que vio el controlador (una sola fila)
  id             boolean primary key default true check (id),
  verificado_en  timestamptz,
  dispositivo    text,
  dispositivo_id text,
  reproduciendo  boolean not null default false,
  error          text,                                   -- null = todo bien
  pausada        boolean not null default false,         -- el barman pausó desde el panel
  preferido_id   text,                                   -- dispositivo elegido en el panel (si no hay uno activo)
  tick_hasta     timestamptz                             -- candado: dos ticks a la vez se pisarían (ver rockola_ctl_tomar)
);
alter table rockola_reproductor add column if not exists tick_hasta timestamptz;
insert into rockola_reproductor (id) values (true) on conflict do nothing;

create table if not exists rockola_ctl_ajustes (        -- URL de la función y secreto del cron (generado aquí, nunca sale)
  clave text primary key,
  valor text not null
);
insert into rockola_ctl_ajustes (clave, valor) values
  ('url', 'https://xesmbhfgiosrhctjamru.supabase.co/functions/v1/rockola-control'),
  ('secreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['rockola_spotify', 'rockola_reproductor', 'rockola_ctl_ajustes'] loop
    execute format('alter table %I enable row level security', t);       -- sin políticas: la API no las lee
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

alter table rockola_cola add column if not exists confirmada boolean not null default false;   -- Spotify ya la está tocando
alter table rockola_cola add column if not exists en_spotify boolean not null default false;   -- ya está en la cola de Spotify
alter table rockola_cola add column if not exists fallo      text;
do $$ begin
  alter table rockola_cola drop constraint if exists rockola_cola_estado_check;
  alter table rockola_cola add constraint rockola_cola_estado_check
    check (estado in ('pendiente', 'sonando', 'sonada', 'saltada', 'quitada', 'fallida'));
end $$;

-- ── ¿El bafle está listo? ───────────────────────────────────────────────────────────────────
create or replace function _rockola_bafle_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select r.verificado_en > now() - interval '3 minutes' and r.error is null and r.dispositivo is not null
                     from rockola_reproductor r), false)
$$;

-- Con Spotify conectado y el bafle sin responder, no entran pedidos (ninguna vía: bot, web, lo que venga).
create or replace function _rockola_exige_bafle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rockola_spotify) and not _rockola_bafle_ok() then
    raise exception 'El bafle no está conectado ahora mismo, así que no recibo pedidos. Avísale al barman.';
  end if;
  return new;
end $$;
drop trigger if exists exige_bafle on rockola_cola;
create trigger exige_bafle before insert on rockola_cola for each row execute function _rockola_exige_bafle();

-- Lo que ve cualquiera (TV, cliente): igual que antes, más el estado del bafle.
create or replace function rockola_estado(p_cliente text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'activa', c.activa,
    'max_pendientes', c.max_pendientes,
    'sonando', (select to_jsonb(x) from (
        select id, proveedor, pista_id, titulo, artista, portada, duracion_ms, mesa, split_part(nombre, ' ', 1) as nombre, empezo_en
        from rockola_cola where estado = 'sonando') x),
    'cola', coalesce((select jsonb_agg(to_jsonb(x) order by x.puntos desc, x.id) from (
        select id, pista_id, titulo, artista, portada, duracion_ms, mesa, split_part(nombre, ' ', 1) as nombre, puntos,
               (cliente = p_cliente and p_cliente <> '') as mio
        from rockola_cola where estado = 'pendiente') x), '[]'::jsonb),
    'reproductor', (select jsonb_build_object(
        'conectado', exists (select 1 from rockola_spotify),
        'ok', _rockola_bafle_ok(),
        'dispositivo', r.dispositivo,
        'pausada', r.pausada,
        'mensaje', r.error,
        'verificado_en', r.verificado_en) from rockola_reproductor r),
    'ahora', now())
  from rockola_config c
$$;

-- Quién es quien llama al panel: 'admin', 'barman' o null (sin perfil). La función de borde lo usa con el token del usuario.
create or replace function rockola_panel_permiso() returns text
language sql stable security definer set search_path = public as $$
  select rol::text from perfiles where id = auth.uid()
$$;

-- ── Funciones del controlador (solo la función de borde, con la llave service_role) ─────────

create or replace function rockola_ctl_verificar(p_secreto text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rockola_ctl_ajustes where clave = 'secreto' and valor = p_secreto)
$$;

-- Todo lo que el controlador necesita saber de un vistazo.
create or replace function rockola_ctl_estado() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sonando', (select to_jsonb(x) from (
        select id, pista_id, titulo, duracion_ms, empezo_en, confirmada from rockola_cola where estado = 'sonando') x),
    'siguiente', (select to_jsonb(x) from (
        select id, pista_id, titulo, en_spotify from rockola_cola where estado = 'pendiente' order by puntos desc, id limit 1) x),
    'encolada', (select to_jsonb(x) from (
        select id, pista_id from rockola_cola where estado = 'pendiente' and en_spotify order by puntos desc, id limit 1) x),
    'reproductor', jsonb_build_object(
        'conectado', exists (select 1 from rockola_spotify),
        'pausada', (select pausada from rockola_reproductor),
        'preferido_id', (select preferido_id from rockola_reproductor)),
    'ahora', now())
$$;

-- ¿Hay algo que hacer? El cron solo despierta a la función si hay cola, canción sonando o toca el latido (cada ~minuto).
create or replace function rockola_ctl_trabajo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rockola_spotify) and (
    exists (select 1 from rockola_cola where estado in ('sonando', 'pendiente'))
    or (select verificado_en is null or verificado_en < now() - interval '50 seconds' from rockola_reproductor))
$$;

-- Cierra la que suena (`p_final`: 'sonada' o 'saltada') y pone a sonar la siguiente. Si `p_id` es una pendiente, esa
-- (Spotify ya pasó a ella por la cola); si no, la primera de la cola. `p_confirmada` = Spotify ya la está tocando.
create or replace function rockola_ctl_avanzar(p_final text default 'sonada', p_id bigint default null, p_confirmada boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_conf boolean := false;
begin
  if p_final not in ('sonada', 'saltada') then raise exception 'final inválido'; end if;
  perform pg_advisory_xact_lock(7102027);
  update rockola_cola set estado = p_final where estado = 'sonando';
  if p_id is not null then
    select id into v_id from rockola_cola where id = p_id and estado = 'pendiente' for update;
    if v_id is not null then v_conf := p_confirmada; end if;
  end if;
  if v_id is null then
    select id into v_id from rockola_cola where estado = 'pendiente' order by puntos desc, id limit 1 for update skip locked;
  end if;
  if v_id is null then return null; end if;
  update rockola_cola set estado = 'sonando', empezo_en = now(), confirmada = v_conf where id = v_id;
  return (select to_jsonb(x) from (select id, pista_id, titulo, duracion_ms, confirmada from rockola_cola where id = v_id) x);
end $$;

create or replace function rockola_ctl_confirmar(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update rockola_cola set confirmada = true, empezo_en = now() where id = p_id and estado = 'sonando'
$$;

-- El dispositivo o la red fallaron: la canción vuelve a su puesto en la cola (sin tocar puntos).
create or replace function rockola_ctl_devolver(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update rockola_cola set estado = 'pendiente', confirmada = false, empezo_en = null where id = p_id and estado = 'sonando'
$$;

-- Spotify no puede tocar esa canción: queda «fallida» y los puntos vuelven a quien la pidió.
create or replace function rockola_ctl_fallo(p_id bigint, p_motivo text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r rockola_cola;
begin
  update rockola_cola set estado = 'fallida', fallo = left(coalesce(p_motivo, ''), 200)
   where id = p_id and estado in ('sonando', 'pendiente') returning * into r;
  if r.id is not null and r.celular is not null and r.costo_puntos > 0 then
    insert into rockola_puntos (celular, delta, motivo, cola_id, nota)
    values (r.celular, r.costo_puntos, 'reembolso', r.id, left('No pudo sonar: ' || r.titulo, 100)) on conflict do nothing;
  end if;
end $$;

create or replace function rockola_ctl_encolada(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update rockola_cola set en_spotify = true where id = p_id and estado = 'pendiente'
$$;

create or replace function rockola_ctl_latido(p_dispositivo text default null, p_dispositivo_id text default null,
                                              p_reproduciendo boolean default false, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update rockola_reproductor set verificado_en = now(), dispositivo = p_dispositivo, dispositivo_id = p_dispositivo_id,
         reproduciendo = coalesce(p_reproduciendo, false), error = left(p_error, 300)
$$;

create or replace function rockola_ctl_pausa(p_pausada boolean) returns void
language sql security definer set search_path = public as $$
  update rockola_reproductor set pausada = coalesce(p_pausada, false)
$$;

-- Un solo «tick» a la vez: si otro está corriendo (el cron y el botón Saltar pueden coincidir), este se salta.
-- El candado vence solo a los 15 s por si la función se cae a medias.
create or replace function rockola_ctl_tomar() returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update rockola_reproductor set tick_hasta = now() + interval '15 seconds' where tick_hasta is null or tick_hasta < now();
  get diagnostics v = row_count;
  return v > 0;
end $$;
create or replace function rockola_ctl_soltar() returns void
language sql security definer set search_path = public as $$
  update rockola_reproductor set tick_hasta = null
$$;

create or replace function rockola_ctl_preferido(p_id text) returns void
language sql security definer set search_path = public as $$
  update rockola_reproductor set preferido_id = p_id
$$;

-- Lo que llama pg_cron: despierta a la función de borde solo si hay trabajo.
create or replace function rockola_ctl_disparar() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_sec text;
begin
  if not rockola_ctl_trabajo() then return; end if;
  select valor into v_url from rockola_ctl_ajustes where clave = 'url';
  select valor into v_sec from rockola_ctl_ajustes where clave = 'secreto';
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_sec),
    body := jsonb_build_object('accion', 'tick'), timeout_milliseconds := 8000);
exception when others then
  raise warning 'rockola_ctl_disparar: %', sqlerrm;
end $$;

-- ── El cron: cada 5 s, pero solo despierta la función si rockola_ctl_trabajo() ──────────────
do $$ begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'No pude activar pg_cron / pg_net desde SQL (%). Actívalos en Supabase → Database → Extensions y corre este archivo otra vez.', sqlerrm;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'rockola-tick') then perform cron.unschedule('rockola-tick'); end if;
    perform cron.schedule('rockola-tick', '5 seconds', 'select rockola_ctl_disparar()');
  end if;
exception when others then
  raise notice 'No pude programar el cron de la rockola (%). Hace falta pg_cron 1.5 o más (intervalos en segundos).', sqlerrm;
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────────────────────
revoke execute on function _rockola_bafle_ok(), _rockola_exige_bafle(), rockola_estado(text), rockola_panel_permiso(),
  rockola_ctl_verificar(text), rockola_ctl_estado(), rockola_ctl_trabajo(), rockola_ctl_avanzar(text, bigint, boolean),
  rockola_ctl_confirmar(bigint), rockola_ctl_devolver(bigint), rockola_ctl_fallo(bigint, text), rockola_ctl_encolada(bigint),
  rockola_ctl_latido(text, text, boolean, text), rockola_ctl_pausa(boolean), rockola_ctl_preferido(text),
  rockola_ctl_tomar(), rockola_ctl_soltar(), rockola_ctl_disparar() from public, anon, authenticated;
grant execute on function rockola_estado(text) to anon, authenticated;
grant execute on function rockola_panel_permiso() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rockola_estado(text), rockola_ctl_verificar(text), rockola_ctl_estado(), rockola_ctl_trabajo(),
      rockola_ctl_avanzar(text, bigint, boolean), rockola_ctl_confirmar(bigint), rockola_ctl_devolver(bigint),
      rockola_ctl_fallo(bigint, text), rockola_ctl_encolada(bigint), rockola_ctl_latido(text, text, boolean, text),
      rockola_ctl_pausa(boolean), rockola_ctl_preferido(text), rockola_ctl_tomar(), rockola_ctl_soltar() to service_role;
    grant select, insert, update, delete on rockola_spotify, rockola_reproductor to service_role;
  end if;
end $$;
