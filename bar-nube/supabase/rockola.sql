-- Rockola: los clientes piden canciones desde el celular (sin cuenta), la cola suena en el PC del bar.
-- Se aplica DESPUÉS de schema.sql (usa es_personal()) y es seguro repetirlo:  ./aplicar.sh rockola.sql
-- OJO: schema.sql le quita a `anon` todos los permisos al final; si lo vuelves a correr, corre este otra vez.
--
-- Seguridad: el cliente anónimo NO toca tablas. Solo puede llamar a rockola_estado() y rockola_pedir(),
-- que validan todo (rockola activa, límite por celular, sin repetidas). El personal controla el
-- reproductor con rockola_siguiente / rockola_saltar / rockola_quitar / rockola_activar.
--
-- Puntos (para después): cada pedido guarda `puntos` (hoy siempre 0) y la cola ordena por puntos
-- desc y luego por llegada. Cuando existan los puntos, rockola_pedir recibe el gasto y listo.

create table if not exists rockola_config (
  id               boolean primary key default true check (id),      -- una sola fila
  activa           boolean not null default true,                    -- false = no se aceptan pedidos
  max_pendientes   int     not null default 2 check (max_pendientes > 0),  -- pedidos en cola por celular
  max_cola         int     not null default 30 check (max_cola > 0),       -- tope de la cola completa
  cooldown_min     int     not null default 60 check (cooldown_min >= 0)   -- no repetir una canción en N min
);
insert into rockola_config (id) values (true) on conflict do nothing;

create table if not exists rockola_cola (
  id          bigint generated always as identity primary key,
  proveedor   text   not null default 'spotify',
  pista_id    text   not null,                   -- id de la canción en el proveedor (spotify: id de pista)
  titulo      text   not null,
  artista     text   not null default '',
  portada     text   not null default '',
  duracion_ms int    not null default 0,
  mesa        text   not null default '',        -- viene del QR de la mesa (?mesa=5); informativo
  cliente     text   not null,                   -- id anónimo del celular, para el límite por persona
  puntos      int    not null default 0,         -- prioridad comprada (futuro); mayor puntos = suena antes
  estado      text   not null default 'pendiente'
              check (estado in ('pendiente', 'sonando', 'sonada', 'saltada', 'quitada')),
  creado_en   timestamptz not null default now(),
  empezo_en   timestamptz
);
create index if not exists rockola_cola_estado on rockola_cola (estado, puntos desc, id);
create index if not exists rockola_cola_pista on rockola_cola (pista_id, creado_en);
-- Solo puede haber una canción sonando a la vez.
create unique index if not exists rockola_una_sonando on rockola_cola ((true)) where estado = 'sonando';

alter table rockola_config enable row level security;
alter table rockola_cola   enable row level security;
drop policy if exists personal_lee on rockola_cola;
drop policy if exists personal_lee on rockola_config;
create policy personal_lee on rockola_cola   for select to authenticated using (es_personal());
create policy personal_lee on rockola_config for select to authenticated using (es_personal());
-- Escribir: solo por las funciones de abajo.

-- ── Lo que ve cualquiera (cliente o PC): estado actual + cola ───────────────────────────────

create or replace function rockola_estado(p_cliente text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'activa', c.activa,
    'max_pendientes', c.max_pendientes,
    'sonando', (select to_jsonb(x) from (
        select id, proveedor, pista_id, titulo, artista, portada, duracion_ms, mesa, empezo_en
        from rockola_cola where estado = 'sonando') x),
    'cola', coalesce((select jsonb_agg(to_jsonb(x) order by x.puntos desc, x.id) from (
        select id, pista_id, titulo, artista, portada, duracion_ms, mesa, puntos,
               (cliente = p_cliente and p_cliente <> '') as mio
        from rockola_cola where estado = 'pendiente') x), '[]'::jsonb),
    'ahora', now())
  from rockola_config c
$$;

-- ── Pedir una canción (cliente anónimo) ─────────────────────────────────────────────────────

create or replace function rockola_pedir(
  p_cliente text, p_mesa text, p_proveedor text, p_pista text,
  p_titulo text, p_artista text, p_portada text, p_duracion_ms int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  c rockola_config;
  v_id bigint;
begin
  if coalesce(length(p_cliente), 0) < 8 or length(p_cliente) > 64 then raise exception 'cliente inválido'; end if;
  if coalesce(p_pista, '') = '' or coalesce(p_titulo, '') = '' then raise exception 'canción inválida'; end if;
  if length(p_pista) > 100 or length(p_titulo) > 300 or length(coalesce(p_artista, '')) > 300
     or length(coalesce(p_portada, '')) > 500 or length(coalesce(p_mesa, '')) > 20 then
    raise exception 'datos demasiado largos';
  end if;
  if p_portada <> '' and p_portada !~ '^https://' then p_portada := ''; end if;
  if p_duracion_ms < 0 or p_duracion_ms > 3600000 then p_duracion_ms := 0; end if;

  select * into c from rockola_config;
  if not c.activa then raise exception 'La rockola está en pausa'; end if;

  -- Serializa los pedidos para que los límites no se salten con toques simultáneos.
  perform pg_advisory_xact_lock(7102026);

  if (select count(*) from rockola_cola where estado = 'pendiente') >= c.max_cola then
    raise exception 'La cola está llena, intenta en un rato';
  end if;
  if (select count(*) from rockola_cola where estado = 'pendiente' and cliente = p_cliente) >= c.max_pendientes then
    raise exception 'Ya tienes % canciones en cola, espera a que suene alguna', c.max_pendientes;
  end if;
  if exists (select 1 from rockola_cola
             where proveedor = p_proveedor and pista_id = p_pista
               and (estado in ('pendiente', 'sonando')
                    or (estado = 'sonada' and creado_en > now() - make_interval(mins => c.cooldown_min)))) then
    raise exception 'Esa canción ya está en la cola o sonó hace poco';
  end if;

  insert into rockola_cola (proveedor, pista_id, titulo, artista, portada, duracion_ms, mesa, cliente)
  values (p_proveedor, p_pista, p_titulo, coalesce(p_artista, ''), coalesce(p_portada, ''), p_duracion_ms,
          coalesce(p_mesa, ''), p_cliente)
  returning id into v_id;
  return v_id;
end $$;

-- ── Control del reproductor (solo personal con sesión) ──────────────────────────────────────

-- Cierra la que suena y pone a sonar la siguiente. Devuelve la nueva (o null si la cola quedó vacía).
create or replace function rockola_siguiente() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  perform pg_advisory_xact_lock(7102027);
  update rockola_cola set estado = 'sonada' where estado = 'sonando';
  select id into v_id from rockola_cola where estado = 'pendiente' order by puntos desc, id limit 1 for update skip locked;
  if v_id is null then return null; end if;
  update rockola_cola set estado = 'sonando', empezo_en = now() where id = v_id;
  return (select to_jsonb(x) from (
    select id, proveedor, pista_id, titulo, artista, portada, duracion_ms from rockola_cola where id = v_id) x);
end $$;

create or replace function rockola_saltar() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  update rockola_cola set estado = 'saltada' where estado = 'sonando';
  return rockola_siguiente();
end $$;

create or replace function rockola_quitar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  update rockola_cola set estado = 'quitada' where id = p_id and estado = 'pendiente';
end $$;

create or replace function rockola_activar(p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  update rockola_config set activa = p_activa;
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────────────────────
revoke all on rockola_cola, rockola_config from anon;
grant select on rockola_cola, rockola_config to authenticated;
revoke execute on function rockola_estado(text), rockola_pedir(text, text, text, text, text, text, text, int),
  rockola_siguiente(), rockola_saltar(), rockola_quitar(bigint), rockola_activar(boolean) from public;
grant execute on function rockola_estado(text) to anon, authenticated;
grant execute on function rockola_pedir(text, text, text, text, text, text, text, int) to anon, authenticated;
grant execute on function rockola_siguiente(), rockola_saltar(), rockola_quitar(bigint), rockola_activar(boolean) to authenticated;
