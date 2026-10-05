-- Control del bar — esquema para Supabase (Postgres).
--
-- Mismo modelo que la versión Django de bar/, con las reglas de negocio dentro de la base
-- (funciones `rpc`), para que el front sea una página estática sin servidor propio:
--
--     categorias 1─* productos 1─* movimientos      compras y conteos de inventario
--     mesas 1─* facturas *─1 clientes                sin cliente = anónimo
--     facturas 1─* lineas *─1 productos
--
-- Seguridad: hay que iniciar sesión (Supabase Auth). Cada usuario tiene un perfil con rol:
--     admin   (super administrador)  todo: catálogo, precios, inventario, ventas y ganancias
--     barman  (personal limitado)    abre y cobra cuentas; solo ve el inventario, sin modificarlo
-- La llave `anon` (pública) ya no lee ni escribe nada. Los usuarios se crean con crear_usuarios.sh.
--
-- Se puede ejecutar más de una vez sin duplicar nada ni borrar datos.

-- ── Tablas ──────────────────────────────────────────────────────────────────────────────────

create table if not exists categorias (
  id     bigint generated always as identity primary key,
  nombre text not null unique,
  orden  int  not null default 0
);

create table if not exists productos (
  id             bigint generated always as identity primary key,
  categoria_id   bigint  not null references categorias(id) on delete restrict,
  nombre         text    not null,
  precio         int     not null check (precio >= 0),
  costo          int     not null default 0 check (costo >= 0),
  controla_stock boolean not null default true,
  stock          int     not null default 0,
  stock_minimo   int     not null default 0 check (stock_minimo >= 0),
  activo         boolean not null default true,
  unique (categoria_id, nombre)
);

-- Productos que se venden por porciones de un mismo recipiente (ej.: cerveza artesanal de barril):
--   insumo_id  producto «recipiente» del que se descuenta   consumo  cuánto se descuenta por unidad vendida
--   unidad     'ml' → el recipiente cuenta en mililitros y la app lo muestra en litros
--   se_vende   false para el recipiente: existe en inventario pero no aparece en las mesas
alter table productos add column if not exists unidad    text    not null default 'unid';
alter table productos add column if not exists se_vende  boolean not null default true;
alter table productos add column if not exists insumo_id bigint  references productos(id) on delete restrict;
alter table productos add column if not exists consumo   int     not null default 1 check (consumo > 0);

create table if not exists mesas (
  id     bigint generated always as identity primary key,
  nombre text    not null unique,
  orden  int     not null default 0,
  activa boolean not null default true
);

create table if not exists clientes (
  id       bigint generated always as identity primary key,
  nombre   text not null,
  telefono text not null default ''
);

create table if not exists facturas (
  id          bigint generated always as identity primary key,
  numero      int unique,                                  -- consecutivo, se asigna al cobrar
  mesa_id     bigint not null references mesas(id) on delete restrict,
  cliente_id  bigint references clientes(id) on delete set null,   -- null = anónimo
  estado      text   not null default 'abierta' check (estado in ('abierta', 'pagada', 'anulada')),
  metodo_pago text   not null default '' check (metodo_pago in ('', 'efectivo', 'transferencia', 'tarjeta')),
  abierta_en  timestamptz not null default now(),
  cerrada_en  timestamptz
);
-- Una mesa tiene a lo sumo una cuenta abierta (dos celulares tocando la misma mesa no la duplican).
create unique index if not exists una_factura_abierta_por_mesa on facturas (mesa_id) where estado = 'abierta';
create index if not exists facturas_cerrada_en on facturas (cerrada_en) where estado = 'pagada';

-- La línea guarda copia del precio y del costo del momento: subir el precio no cambia lo ya vendido.
create table if not exists lineas (
  id          bigint generated always as identity primary key,
  factura_id  bigint not null references facturas(id) on delete cascade,
  producto_id bigint not null references productos(id) on delete restrict,
  cantidad    int    not null check (cantidad > 0),
  precio      int    not null check (precio >= 0),
  costo       int    not null check (costo >= 0),
  unique (factura_id, producto_id)
);

-- Solo entradas/ajustes manuales de inventario. Las ventas ya están en `lineas`.
create table if not exists movimientos (
  id             bigint generated always as identity primary key,
  producto_id    bigint not null references productos(id) on delete restrict,
  motivo         text   not null check (motivo in ('compra', 'ajuste')),
  cantidad       int    not null,                          -- positivo entra, negativo sale
  costo_unitario int,
  nota           text   not null default '',
  fecha          timestamptz not null default now()
);

-- Un perfil por usuario de Supabase Auth: quién es y qué rol tiene.
create table if not exists perfiles (
  id     uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol    text not null check (rol in ('admin', 'barman'))
);

-- Quién llama. Sin sesión (auth.uid() nulo) solo vale la conexión directa de administración
-- (SQL editor, scripts, pruebas); la API pública nunca entra por ahí (su rol de sesión es otro).
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then session_user in ('postgres', 'supabase_admin')
              else exists (select 1 from perfiles where id = auth.uid() and rol = 'admin') end
$$;

create or replace function es_personal() returns boolean   -- cualquier usuario con perfil
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then session_user in ('postgres', 'supabase_admin')
              else exists (select 1 from perfiles where id = auth.uid()) end
$$;

-- ── Vista: cuentas abiertas con su total (tablero de mesas) ─────────────────────────────────

create or replace view v_cuentas_abiertas with (security_invoker = true) as
select f.id, f.mesa_id, f.cliente_id, c.nombre as cliente, f.abierta_en,
       coalesce(sum(l.cantidad * l.precio), 0)::int as total,
       coalesce(sum(l.cantidad), 0)::int            as n_items
from facturas f
left join clientes c on c.id = f.cliente_id
left join lineas   l on l.factura_id = f.id
where f.estado = 'abierta'
group by f.id, c.nombre;

-- ── Operaciones ─────────────────────────────────────────────────────────────────────────────
-- Cada función es una transacción. Todas toman primero el candado de la fila de la factura, así
-- dos celulares que tocan la misma mesa a la vez se turnan en vez de pisarse.
-- Criterio de «personal con prisa»: si la pantalla estaba desactualizada (otro ya quitó el
-- producto, ya cobró la mesa), la operación se aplica sobre el estado real o se ignora, sin error.

-- Devuelve la cuenta abierta de la mesa (bloqueada), creándola si no hay.
create or replace function _cuenta_de(p_mesa bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  insert into facturas (mesa_id) values (p_mesa) on conflict (mesa_id) where estado = 'abierta' do nothing;
  select id into v_fac from facturas where mesa_id = p_mesa and estado = 'abierta' for update;
  return v_fac;
end $$;

create or replace function agregar(p_mesa bigint, p_producto bigint, p_cantidad int default 1) returns void
language plpgsql security definer set search_path = public as $$
declare v_prod productos; v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  if p_cantidad is null or p_cantidad <= 0 then return; end if;
  select * into v_prod from productos where id = p_producto and activo and se_vende;
  if not found then return; end if;
  v_fac := _cuenta_de(p_mesa);
  insert into lineas (factura_id, producto_id, cantidad, precio, costo)
  values (v_fac, p_producto, p_cantidad, v_prod.precio, v_prod.costo)
  on conflict (factura_id, producto_id) do update set cantidad = lineas.cantidad + excluded.cantidad;
  -- El stock se descuenta al pedir (inventario de este instante) y puede quedar negativo:
  -- nunca se frena una venta porque el conteo esté desactualizado.
  -- Si se vende por porciones de un recipiente (insumo_id), el descuento sale del recipiente.
  if v_prod.controla_stock then
    update productos set stock = stock - p_cantidad * v_prod.consumo where id = coalesce(v_prod.insumo_id, v_prod.id);
  end if;
end $$;

create or replace function quitar(p_mesa bigint, p_producto bigint, p_cantidad int default 1) returns void
language plpgsql security definer set search_path = public as $$
declare v_fac bigint; v_lin lineas; v_n int; v_prod productos;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  select id into v_fac from facturas where mesa_id = p_mesa and estado = 'abierta' for update;
  if v_fac is null then return; end if;
  select * into v_lin from lineas where factura_id = v_fac and producto_id = p_producto;
  if not found then return; end if;
  v_n := least(greatest(coalesce(p_cantidad, 1), 1), v_lin.cantidad);
  if v_n = v_lin.cantidad then
    delete from lineas where id = v_lin.id;
  else
    update lineas set cantidad = cantidad - v_n where id = v_lin.id;
  end if;
  select * into v_prod from productos where id = p_producto;
  if v_prod.controla_stock then
    update productos set stock = stock + v_n * v_prod.consumo where id = coalesce(v_prod.insumo_id, v_prod.id);
  end if;
  -- Una cuenta sin nada pedido no existe: la mesa vuelve a estar libre.
  if not exists (select 1 from lineas where factura_id = v_fac) then
    delete from facturas where id = v_fac;
  end if;
end $$;

create or replace function asignar_cliente(p_mesa bigint, p_cliente bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  v_fac := _cuenta_de(p_mesa);
  update facturas set cliente_id = (select id from clientes where id = p_cliente) where id = v_fac;
end $$;

create or replace function crear_cliente(p_mesa bigint, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
declare v_nombre text := btrim(coalesce(p_nombre, '')); v_cli bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  if v_nombre = '' then return; end if;
  select id into v_cli from clientes where nombre = v_nombre order by id limit 1;
  if v_cli is null then insert into clientes (nombre) values (v_nombre) returning id into v_cli; end if;
  perform asignar_cliente(p_mesa, v_cli);
end $$;

-- Cobra la cuenta de la mesa. Devuelve el id de la factura (para abrir el recibo).
create or replace function cobrar(p_mesa bigint, p_metodo text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Elige cómo pagó el cliente.';
  end if;
  select id into v_fac from facturas where mesa_id = p_mesa and estado = 'abierta' for update;
  if v_fac is null or not exists (select 1 from lineas where factura_id = v_fac) then
    raise exception 'La cuenta está vacía o ya fue cobrada.';
  end if;
  perform pg_advisory_xact_lock(70001);   -- numeración consecutiva sin huecos ni repetidos
  update facturas
     set numero = (select coalesce(max(numero), 0) + 1 from facturas),
         estado = 'pagada', metodo_pago = p_metodo, cerrada_en = now()
   where id = v_fac;
  return v_fac;
end $$;

-- Descarta la cuenta abierta y devuelve al inventario todo lo que tenía.
create or replace function anular(p_mesa bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  select id into v_fac from facturas where mesa_id = p_mesa and estado = 'abierta' for update;
  if v_fac is null then return; end if;
  update productos p set stock = p.stock + d.n
    from (select coalesce(pr.insumo_id, pr.id) as destino, sum(l.cantidad * pr.consumo)::int as n
            from lineas l join productos pr on pr.id = l.producto_id
           where l.factura_id = v_fac and pr.controla_stock
           group by 1) d
   where p.id = d.destino;
  if exists (select 1 from lineas where factura_id = v_fac) then
    update facturas set estado = 'anulada', cerrada_en = now() where id = v_fac;
  else
    delete from facturas where id = v_fac;
  end if;
end $$;

-- Entra mercancía. Si se informa el costo, queda como el costo de compra vigente.
create or replace function comprar(p_producto bigint, p_cantidad int, p_costo int default null, p_nota text default '')
returns void language plpgsql set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador mueve el inventario.'; end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad que entra debe ser mayor que cero.';
  end if;
  perform 1 from productos where id = p_producto for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  insert into movimientos (producto_id, motivo, cantidad, costo_unitario, nota)
  values (p_producto, 'compra', p_cantidad, p_costo, coalesce(p_nota, ''));
  update productos set stock = stock + p_cantidad, costo = coalesce(p_costo, costo) where id = p_producto;
end $$;

-- Fija el stock a lo contado en el estante; guarda la diferencia como movimiento.
create or replace function contar(p_producto bigint, p_stock int, p_nota text default '') returns void
language plpgsql set search_path = public as $$
declare v_actual int;
begin
  if not es_admin() then raise exception 'Solo el administrador mueve el inventario.'; end if;
  if p_stock is null or p_stock < 0 then raise exception 'El conteo no puede ser negativo.'; end if;
  select stock into v_actual from productos where id = p_producto for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if v_actual = p_stock then return; end if;
  insert into movimientos (producto_id, motivo, cantidad, nota)
  values (p_producto, 'ajuste', p_stock - v_actual, coalesce(p_nota, ''));
  update productos set stock = p_stock where id = p_producto;
end $$;

-- ── Reportes ────────────────────────────────────────────────────────────────────────────────
-- La jornada de un bar cruza la medianoche: va de `p_corte` (6:00) a la misma hora del día
-- siguiente, en hora de Colombia. Una factura cuenta en la jornada en que se cobró.

create or replace function jornada_actual(p_corte int default 6) returns date
language sql stable set search_path = public as $$
  select ((now() at time zone 'America/Bogota') - make_interval(hours => p_corte))::date
$$;

create or replace function resumen(p_dia date, p_corte int default 6) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_ini timestamptz := ((p_dia + make_interval(hours => p_corte))::timestamp at time zone 'America/Bogota');
  v_fin timestamptz := (((p_dia + 1) + make_interval(hours => p_corte))::timestamp at time zone 'America/Bogota');
  v_res jsonb;
begin
  if not es_admin() then raise exception 'Solo el administrador ve las ventas.'; end if;
  with f as (
    select * from facturas where estado = 'pagada' and cerrada_en >= v_ini and cerrada_en < v_fin
  ), l as (
    select l.*, f.metodo_pago from lineas l join f on f.id = l.factura_id
  ), tot as (
    select coalesce(sum(cantidad * precio), 0)::int as venta,
           coalesce(sum(cantidad * costo), 0)::int  as costo,
           coalesce(sum(cantidad), 0)::int          as unidades
    from l
  )
  select jsonb_build_object(
    'venta', tot.venta, 'costo', tot.costo, 'ganancia', tot.venta - tot.costo, 'unidades', tot.unidades,
    'n_facturas', (select count(*) from f),
    'ticket_promedio', case when (select count(*) from f) = 0 then 0
                            else tot.venta / (select count(*) from f) end,
    'metodos', (select coalesce(jsonb_agg(jsonb_build_object('metodo', m.metodo,
                        'total', coalesce((select sum(cantidad * precio) from l where l.metodo_pago = m.metodo), 0)::int)
                        order by m.ord), '[]')
                from (values ('efectivo', 1), ('transferencia', 2), ('tarjeta', 3)) as m(metodo, ord)),
    'productos', (select coalesce(jsonb_agg(x order by x.unidades desc, x.nombre), '[]')
                  from (select p.nombre, c.nombre as categoria,
                               sum(l.cantidad)::int as unidades,
                               sum(l.cantidad * l.precio)::int as venta,
                               sum(l.cantidad * (l.precio - l.costo))::int as ganancia
                        from l join productos p on p.id = l.producto_id
                        join categorias c on c.id = p.categoria_id
                        group by p.id, p.nombre, c.nombre) x),
    'facturas', (select coalesce(jsonb_agg(y order by y.cerrada_en desc), '[]')
                 from (select f.id, f.numero, m.nombre as mesa, cl.nombre as cliente,
                              f.metodo_pago, f.cerrada_en,
                              (select coalesce(sum(cantidad * precio), 0)::int from lineas where factura_id = f.id) as total
                       from f join mesas m on m.id = f.mesa_id
                       left join clientes cl on cl.id = f.cliente_id) y)
  ) into v_res from tot;
  return v_res;
end $$;

-- ── Permisos y seguridad ────────────────────────────────────────────────────────────────────
-- Leer: cualquier usuario con perfil. Escribir directo en las tablas: solo admin. El barman vende
-- a través de las funciones de arriba (agregar, cobrar...), que son las que tocan stock y cuentas.

do $$
declare t text;
begin
  foreach t in array array['categorias', 'productos', 'mesas', 'clientes', 'facturas', 'lineas', 'movimientos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists acceso_total on %I', t);
    execute format('drop policy if exists personal_lee on %I', t);
    execute format('drop policy if exists admin_escribe on %I', t);
    execute format('create policy personal_lee on %I for select to authenticated using (es_personal())', t);
    execute format('create policy admin_escribe on %I for all to authenticated using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;

alter table perfiles enable row level security;
drop policy if exists perfil_propio on perfiles;
create policy perfil_propio on perfiles for select to authenticated using (id = auth.uid() or es_admin());

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ── Tiempo real: los celulares reciben los cambios sin preguntar ────────────────────────────

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['facturas', 'lineas', 'productos', 'mesas'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
