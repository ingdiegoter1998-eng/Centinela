-- Rockola, parte 2: puntos por consumo, precio por género y lista negra.
-- Se aplica DESPUÉS de schema.sql y rockola.sql; es seguro repetirlo:  ./aplicar.sh rockola_puntos.sql
-- (schema.sql le quita permisos a `anon` al final: si lo vuelves a correr, corre rockola.sql y este otra vez.)
--
-- Idea: 1 punto = `punto_pesos` pesos consumidos (hoy $1.000). Una canción normal cuesta `precio_base_puntos`
-- (hoy 8 = $8.000, dos cervezas); el género del artista la multiplica (ranchera ×3). Quien se registra por
-- primera vez recibe `puntos_bienvenida` (hoy 16 = dos canciones). El saldo no se guarda: es la suma de un
-- libro de movimientos (rockola_puntos) que nunca se edita, solo se le agregan filas.
--
-- Quién puede qué:
--   · el bot de WhatsApp (rol service_role, la llave nunca sale del servidor del bot) pide con puntos:
--     rockola_pedir_puntos / rockola_mi_estado. El celular lo prueba WhatsApp, no hay que creerle al cliente.
--   · el personal da puntos al cobrar (rockola_dar_puntos_factura) y clasifica artistas; las cortesías, el admin.
--   · cualquiera puede ver el precio de una canción (rockola_precio).
-- Pendiente (a propósito): la pantalla web del cliente sigue pidiendo con el límite por celular, sin puntos;
-- cómo se cobra ahí depende de cómo se identifique el cliente (ver README).

-- ── Ajustes ─────────────────────────────────────────────────────────────────────────────────
alter table rockola_config add column if not exists punto_pesos       int not null default 1000 check (punto_pesos > 0);
alter table rockola_config add column if not exists precio_base_puntos int not null default 8    check (precio_base_puntos >= 0);
alter table rockola_config add column if not exists puntos_bienvenida  int not null default 16   check (puntos_bienvenida >= 0);

-- ── Géneros y artistas ──────────────────────────────────────────────────────────────────────
create table if not exists rockola_generos (
  genero        text primary key,
  multiplicador numeric(5, 2) not null default 1 check (multiplicador > 0),
  nota          text not null default ''
);
insert into rockola_generos (genero, multiplicador, nota) values
  ('general', 1, 'Precio base'), ('ranchera', 3, 'El triple de una canción normal')
on conflict do nothing;

-- Un artista sin género (null) cuesta el precio base y aparece en la lista de «por clasificar».
create table if not exists rockola_artistas (
  proveedor  text not null default 'spotify',
  artista_id text not null,
  nombre     text not null default '',
  genero     text references rockola_generos(genero) on update cascade on delete set null,
  primary key (proveedor, artista_id)
);
-- De dónde salió el género: 'spotify' (automático, con las etiquetas del artista) o 'manual' (lo puso el personal;
-- el automático nunca lo pisa). null = nadie lo ha mirado todavía.
alter table rockola_artistas add column if not exists origen    text check (origen in ('manual', 'spotify'));
alter table rockola_artistas add column if not exists etiquetas text[] not null default '{}';
update rockola_artistas set origen = 'manual' where genero is not null and origen is null;

create table if not exists rockola_prohibidas (          -- lista negra de canciones
  proveedor text not null default 'spotify',
  pista_id  text not null,
  titulo    text not null default '',
  motivo    text not null default '',
  primary key (proveedor, pista_id)
);

-- ── Personas y libro de puntos ──────────────────────────────────────────────────────────────
create table if not exists rockola_personas (
  celular   text primary key check (celular ~ '^[0-9]{10,15}$'),   -- solo dígitos, con indicativo: 573001234567
  nombre    text not null default '',
  creado_en timestamptz not null default now()
);

create table if not exists rockola_puntos (
  id         bigint generated always as identity primary key,
  celular    text   not null references rockola_personas(celular) on delete restrict,
  delta      int    not null check (delta <> 0),
  motivo     text   not null check (motivo in ('bienvenida', 'consumo', 'cortesia', 'pedido', 'reembolso')),
  factura_id bigint references facturas(id) on delete set null,
  cola_id    bigint references rockola_cola(id) on delete set null,
  nota       text   not null default '',
  creado_en  timestamptz not null default now(),
  creado_por uuid
);
create index if not exists rockola_puntos_celular on rockola_puntos (celular);
create unique index if not exists rockola_puntos_una_bienvenida on rockola_puntos (celular) where motivo = 'bienvenida';
create unique index if not exists rockola_puntos_una_por_factura on rockola_puntos (factura_id) where motivo = 'consumo';
create unique index if not exists rockola_puntos_un_reembolso on rockola_puntos (cola_id) where motivo = 'reembolso';

alter table rockola_cola add column if not exists celular      text;
alter table rockola_cola add column if not exists nombre       text not null default '';
alter table rockola_cola add column if not exists artista_id   text not null default '';
alter table rockola_cola add column if not exists costo_puntos int  not null default 0;

do $$
declare t text;
begin
  foreach t in array array['rockola_generos', 'rockola_artistas', 'rockola_prohibidas', 'rockola_personas', 'rockola_puntos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists personal_lee on %I', t);
    execute format('create policy personal_lee on %I for select to authenticated using (es_personal())', t);
  end loop;
end $$;

-- ── Precio y saldo ──────────────────────────────────────────────────────────────────────────

-- Precio en puntos de una canción según sus artistas (si hay varios, vale el género más caro).
create or replace function rockola_precio(p_proveedor text, p_artista_ids text[]) returns int
language sql stable security definer set search_path = public as $$
  select ceil(c.precio_base_puntos * coalesce(
           (select max(g.multiplicador) from rockola_artistas a join rockola_generos g on g.genero = a.genero
             where a.proveedor = p_proveedor and a.artista_id = any(coalesce(p_artista_ids, '{}'))), 1))::int
  from rockola_config c
$$;

create or replace function rockola_saldo(p_celular text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from rockola_puntos where celular = p_celular
$$;

-- Crea a la persona si no existe y le da los puntos de bienvenida (una sola vez). Interna.
create or replace function _rockola_persona(p_celular text, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_celular !~ '^[0-9]{10,15}$' then raise exception 'celular inválido: solo números, con indicativo (573001234567)'; end if;
  insert into rockola_personas (celular, nombre) values (p_celular, left(coalesce(p_nombre, ''), 60))
  on conflict (celular) do update set nombre = case when rockola_personas.nombre = '' then excluded.nombre else rockola_personas.nombre end;
  insert into rockola_puntos (celular, delta, motivo, nota)
  select p_celular, c.puntos_bienvenida, 'bienvenida', 'Puntos de bienvenida' from rockola_config c where c.puntos_bienvenida > 0
  on conflict do nothing;
end $$;

-- ── Personal: dar puntos y clasificar ───────────────────────────────────────────────────────

-- Al cobrar: los puntos de una factura pagada = total ÷ punto_pesos (hacia abajo). Una factura da puntos una sola vez.
create or replace function rockola_dar_puntos_factura(p_factura bigint, p_celular text, p_nombre text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_total int; v_pts int;
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  if not exists (select 1 from facturas where id = p_factura and estado = 'pagada') then raise exception 'La factura no está pagada'; end if;
  select coalesce(sum(cantidad * precio), 0)::int into v_total from lineas where factura_id = p_factura;
  select v_total / punto_pesos into v_pts from rockola_config;
  if v_pts <= 0 then raise exception 'La factura no alcanza para ganar puntos'; end if;
  perform _rockola_persona(p_celular, p_nombre);
  begin
    insert into rockola_puntos (celular, delta, motivo, factura_id, creado_por) values (p_celular, v_pts, 'consumo', p_factura, auth.uid());
  exception when unique_violation then raise exception 'Esa factura ya dio sus puntos';
  end;
  return jsonb_build_object('puntos', v_pts, 'saldo', rockola_saldo(p_celular));
end $$;

-- Cortesía (o ajuste con delta negativo): solo el administrador.
create or replace function rockola_cortesia(p_celular text, p_puntos int, p_nota text default '', p_nombre text default '') returns int
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin permiso'; end if;
  if p_puntos = 0 then raise exception 'puntos en cero'; end if;
  perform _rockola_persona(p_celular, p_nombre);
  insert into rockola_puntos (celular, delta, motivo, nota, creado_por) values (p_celular, p_puntos, 'cortesia', left(coalesce(p_nota, ''), 200), auth.uid());
  return rockola_saldo(p_celular);
end $$;

-- Asigna (o cambia) el género de un artista. Personal.
create or replace function rockola_clasificar(p_proveedor text, p_artista_id text, p_nombre text, p_genero text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  if p_genero is not null and not exists (select 1 from rockola_generos where genero = p_genero) then raise exception 'género desconocido: %', p_genero; end if;
  insert into rockola_artistas (proveedor, artista_id, nombre, genero, origen) values (p_proveedor, p_artista_id, coalesce(p_nombre, ''), p_genero, 'manual')
  on conflict (proveedor, artista_id) do update set genero = excluded.genero, origen = 'manual', nombre = case when excluded.nombre = '' then rockola_artistas.nombre else excluded.nombre end;
end $$;

-- ── Bot de WhatsApp (service_role) ──────────────────────────────────────────────────────────

create or replace function rockola_mi_estado(p_celular text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'registrado', exists (select 1 from rockola_personas where celular = p_celular),
    -- quien aún no está registrado verá su bienvenida como saldo (se le abona al registrarse o al pedir)
    'saldo', case when exists (select 1 from rockola_personas where celular = p_celular)
                  then rockola_saldo(p_celular) else (select puntos_bienvenida from rockola_config) end,
    'en_cola', (select count(*) from rockola_cola where estado = 'pendiente' and celular = p_celular),
    'max_pendientes', (select max_pendientes from rockola_config))
$$;

-- Primer contacto del bot con un celular: lo registra y le abona la bienvenida (si ya estaba, no pasa nada).
create or replace function rockola_registrar(p_celular text, p_nombre text default '') returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _rockola_persona(p_celular, p_nombre);
  return rockola_saldo(p_celular);
end $$;

-- Pide una canción gastando puntos. Registra a la persona (con bienvenida) si es su primera vez.
create or replace function rockola_pedir_puntos(
  p_celular text, p_nombre text, p_mesa text, p_proveedor text, p_pista text, p_titulo text, p_artista text,
  p_artista_ids text[], p_portada text, p_duracion_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c rockola_config; v_costo int; v_saldo int; v_id bigint; v_art text;
begin
  if coalesce(p_pista, '') = '' or coalesce(p_titulo, '') = '' then raise exception 'canción inválida'; end if;
  if length(p_pista) > 100 or length(p_titulo) > 300 or length(coalesce(p_artista, '')) > 300
     or length(coalesce(p_portada, '')) > 500 or length(coalesce(p_mesa, '')) > 20 then
    raise exception 'datos demasiado largos';
  end if;
  if p_portada <> '' and p_portada !~ '^https://' then p_portada := ''; end if;
  if p_duracion_ms < 0 or p_duracion_ms > 3600000 then p_duracion_ms := 0; end if;
  p_artista_ids := coalesce(p_artista_ids, '{}');

  select * into c from rockola_config;
  if not c.activa then raise exception 'La rockola está en pausa'; end if;
  perform _rockola_persona(p_celular, p_nombre);
  perform pg_advisory_xact_lock(7102026);          -- el mismo candado que rockola_pedir: límites sin carreras

  if exists (select 1 from rockola_prohibidas where proveedor = p_proveedor and pista_id = p_pista) then
    raise exception 'Esa canción no la ponemos aquí';
  end if;
  if (select count(*) from rockola_cola where estado = 'pendiente') >= c.max_cola then
    raise exception 'La cola está llena, intenta en un rato';
  end if;
  if (select count(*) from rockola_cola where estado = 'pendiente' and celular = p_celular) >= c.max_pendientes then
    raise exception 'Ya tienes % canciones en cola, espera a que suene alguna', c.max_pendientes;
  end if;
  if exists (select 1 from rockola_cola
             where proveedor = p_proveedor and pista_id = p_pista
               and (estado in ('pendiente', 'sonando')
                    or (estado = 'sonada' and creado_en > now() - make_interval(mins => c.cooldown_min)))) then
    raise exception 'Esa canción ya está en la cola o sonó hace poco';
  end if;

  v_costo := rockola_precio(p_proveedor, p_artista_ids);
  v_saldo := rockola_saldo(p_celular);
  if v_saldo < v_costo then raise exception 'Te faltan % puntos (cuesta %, tienes %)', v_costo - v_saldo, v_costo, v_saldo; end if;

  -- Los artistas nuevos quedan anotados sin género, para que el personal los clasifique.
  foreach v_art in array p_artista_ids loop
    insert into rockola_artistas (proveedor, artista_id) values (p_proveedor, v_art) on conflict do nothing;
  end loop;

  insert into rockola_cola (proveedor, pista_id, titulo, artista, artista_id, portada, duracion_ms, mesa, cliente, celular, nombre, costo_puntos)
  values (p_proveedor, p_pista, p_titulo, coalesce(p_artista, ''), coalesce(p_artista_ids[1], ''), coalesce(p_portada, ''), p_duracion_ms,
          coalesce(p_mesa, ''), 'wa:' || p_celular, p_celular, (select nombre from rockola_personas where celular = p_celular), v_costo)
  returning id into v_id;
  if v_costo > 0 then
    insert into rockola_puntos (celular, delta, motivo, cola_id, nota) values (p_celular, -v_costo, 'pedido', v_id, left(p_titulo, 100));
  end if;
  return jsonb_build_object('id', v_id, 'costo', v_costo, 'saldo', v_saldo - v_costo);
end $$;

-- ── Lo que ya existía, ahora con nombre, y reembolso al quitar ──────────────────────────────

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
    'ahora', now())
  from rockola_config c
$$;

-- Quitar una pendiente que se pagó con puntos devuelve los puntos.
create or replace function rockola_quitar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r rockola_cola;
begin
  if not es_personal() then raise exception 'sin permiso'; end if;
  update rockola_cola set estado = 'quitada' where id = p_id and estado = 'pendiente' returning * into r;
  if r.id is not null and r.celular is not null and r.costo_puntos > 0 then
    insert into rockola_puntos (celular, delta, motivo, cola_id, nota, creado_por)
    values (r.celular, r.costo_puntos, 'reembolso', r.id, left(r.titulo, 100), auth.uid()) on conflict do nothing;
  end if;
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────────────────────
revoke all on rockola_generos, rockola_artistas, rockola_prohibidas, rockola_personas, rockola_puntos from anon;
grant select on rockola_generos, rockola_artistas, rockola_prohibidas, rockola_personas, rockola_puntos to authenticated;

revoke execute on function rockola_precio(text, text[]), rockola_saldo(text), _rockola_persona(text, text),
  rockola_dar_puntos_factura(bigint, text, text), rockola_cortesia(text, int, text, text),
  rockola_clasificar(text, text, text, text), rockola_mi_estado(text), rockola_registrar(text, text),
  rockola_pedir_puntos(text, text, text, text, text, text, text, text[], text, int),
  rockola_estado(text), rockola_quitar(bigint) from public, anon, authenticated;

grant execute on function rockola_estado(text) to anon, authenticated;
grant execute on function rockola_precio(text, text[]) to anon, authenticated;
grant execute on function rockola_quitar(bigint) to authenticated;
grant execute on function rockola_dar_puntos_factura(bigint, text, text), rockola_cortesia(text, int, text, text),
  rockola_clasificar(text, text, text, text) to authenticated;
-- Solo el servidor del bot (llave service_role): saldo de cualquier celular y pedidos con puntos.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rockola_mi_estado(text), rockola_saldo(text), rockola_registrar(text, text),
      rockola_pedir_puntos(text, text, text, text, text, text, text, text[], text, int), rockola_precio(text, text[]),
      rockola_estado(text) to service_role;
    grant usage on schema public to service_role;
  end if;
end $$;
