-- Panel de administración: reportes, dashboard, comisión del trabajador, trazabilidad y herramientas de rockola.
-- Se corre DESPUÉS de schema.sql, rockola.sql y rockola_puntos.sql. Es seguro repetirlo.
-- Pegar completo en Supabase → SQL Editor → Run. (schema.sql ya trae también las columnas y funciones de trazabilidad, así que
-- volver a correr schema.sql no las pierde.)
--
-- Todo es solo para el administrador (es_admin()): ninguna función da acceso al barman ni a la llave pública.
-- «Jornada» = noche de servicio: corte a las 6:00 AM de Bogotá (la madrugada es de la noche anterior).

-- ── Trazabilidad: quién cobra y quién anula ─────────────────────────────────────────────────
alter table facturas add column if not exists cobrada_por uuid;
alter table facturas add column if not exists anulada_por uuid;

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
         estado = 'pagada', metodo_pago = p_metodo, cerrada_en = now(), cobrada_por = auth.uid()
   where id = v_fac;
  return v_fac;
end $$;

create or replace function anular(p_mesa bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_fac bigint;
begin
  if not es_personal() then raise exception 'Inicia sesión.'; end if;
  select id into v_fac from facturas where mesa_id = p_mesa and estado = 'abierta' for update;
  if v_fac is null then return; end if;
  perform _mover_stock(l.producto_id, -l.cantidad) from lineas l where l.factura_id = v_fac;
  if exists (select 1 from lineas where factura_id = v_fac) then
    update facturas set estado = 'anulada', cerrada_en = now(), anulada_por = auth.uid() where id = v_fac;
  else
    delete from facturas where id = v_fac;
  end if;
end $$;

-- ── Comisión del trabajador: reglas por categoría ───────────────────────────────────────────
-- base 'ganancia' = (precio - costo) × cantidad;  base 'venta' = precio × cantidad.
create table if not exists comision_reglas (
  categoria_id bigint primary key references categorias(id) on delete cascade,
  pct          numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  base         text not null default 'ganancia' check (base in ('ganancia', 'venta')),
  nota         text not null default ''
);
alter table comision_reglas enable row level security;
drop policy if exists admin_todo on comision_reglas;
create policy admin_todo on comision_reglas for all to authenticated using (es_admin()) with check (es_admin());
-- Arranque según lo hablado con el dueño: 50 % de la ganancia de la cerveza no artesanal y ~20 % de la
-- venta de la artesanal (su costo aún no está cargado). Se ajusta desde el panel.
insert into comision_reglas (categoria_id, pct, base, nota)
select id, 50, 'ganancia', 'Cerveza no artesanal' from categorias where nombre = 'Cervezas'
on conflict do nothing;
insert into comision_reglas (categoria_id, pct, base, nota)
select id, 20, 'venta', 'Cerveza artesanal (aprox.)' from categorias where nombre = 'Cervezas artesanales'
on conflict do nothing;

-- ── Ayudas ──────────────────────────────────────────────────────────────────────────────────
create or replace function _jornada(p_ts timestamptz) returns date
language sql immutable as $$ select ((p_ts at time zone 'America/Bogota') - interval '6 hours')::date $$;

create or replace function _inicio(p_dia date) returns timestamptz   -- las 6:00 AM de Bogotá de esa jornada
language sql immutable as $$ select ((p_dia + interval '6 hours')::timestamp at time zone 'America/Bogota') $$;

-- ── Dashboard: ventas por día, semana o mes ─────────────────────────────────────────────────
-- p_paso: 'dia' | 'semana' (lunes a domingo) | 'mes'. Cada fila lleva el inicio del periodo.
create or replace function admin_serie(p_desde date, p_hasta date, p_paso text default 'semana') returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador.'; end if;
  if p_paso not in ('dia', 'semana', 'mes') then raise exception 'paso inválido'; end if;
  return coalesce((
    with f as (
      select f.id, _jornada(f.cerrada_en) as j,
             coalesce(sum(l.cantidad * l.precio), 0)::int as venta,
             coalesce(sum(l.cantidad * l.costo), 0)::int  as costo,
             coalesce(sum(l.cantidad), 0)::int as unidades
        from facturas f left join lineas l on l.factura_id = f.id
       where f.estado = 'pagada' and f.cerrada_en >= _inicio(p_desde) and f.cerrada_en < _inicio(p_hasta + 1)
       group by f.id
    ), g as (
      select date_trunc(case p_paso when 'dia' then 'day' when 'semana' then 'week' else 'month' end, j::timestamp)::date as periodo,
             j, venta, costo, unidades
        from f
    ), r as (
      select periodo,
             sum(venta)::int as venta, sum(costo)::int as costo, (sum(venta) - sum(costo))::int as ganancia,
             count(*)::int as n_facturas, sum(unidades)::int as unidades,
             count(distinct j)::int as jornadas
        from g group by periodo
    ), p as (
      select generate_series(
               date_trunc(case p_paso when 'dia' then 'day' when 'semana' then 'week' else 'month' end, p_desde::timestamp),
               date_trunc(case p_paso when 'dia' then 'day' when 'semana' then 'week' else 'month' end, p_hasta::timestamp),
               case p_paso when 'dia' then interval '1 day' when 'semana' then interval '7 days' else interval '1 month' end)::date as periodo
    )
    select jsonb_agg(jsonb_build_object(
             'periodo', p.periodo,
             'venta', coalesce(r.venta, 0), 'costo', coalesce(r.costo, 0), 'ganancia', coalesce(r.ganancia, 0),
             'n_facturas', coalesce(r.n_facturas, 0), 'unidades', coalesce(r.unidades, 0), 'jornadas', coalesce(r.jornadas, 0),
             'ticket', case when coalesce(r.n_facturas, 0) = 0 then 0 else r.venta / r.n_facturas end) order by p.periodo)
      from p left join r using (periodo)
  ), '[]'::jsonb);
end $$;

-- ── Reportes: detalle de un rango de jornadas ───────────────────────────────────────────────
create or replace function admin_detalle(p_desde date, p_hasta date) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_ini timestamptz := _inicio(p_desde); v_fin timestamptz := _inicio(p_hasta + 1); v jsonb;
begin
  if not es_admin() then raise exception 'Solo el administrador.'; end if;
  with f as (
    select * from facturas where estado = 'pagada' and cerrada_en >= v_ini and cerrada_en < v_fin
  ), l as (
    select l.*, f.metodo_pago, f.cobrada_por, _jornada(f.cerrada_en) as j, extract(isodow from _jornada(f.cerrada_en))::int as dow
      from lineas l join f on f.id = l.factura_id
  )
  select jsonb_build_object(
    'productos', (select coalesce(jsonb_agg(x order by x.venta desc), '[]') from (
        select p.nombre, c.nombre as categoria, sum(l.cantidad)::int as unidades,
               sum(l.cantidad * l.precio)::int as venta, sum(l.cantidad * (l.precio - l.costo))::int as ganancia
          from l join productos p on p.id = l.producto_id join categorias c on c.id = p.categoria_id
         group by p.id, p.nombre, c.nombre) x),
    'categorias', (select coalesce(jsonb_agg(x order by x.venta desc), '[]') from (
        select c.nombre, sum(l.cantidad)::int as unidades, sum(l.cantidad * l.precio)::int as venta,
               sum(l.cantidad * (l.precio - l.costo))::int as ganancia
          from l join productos p on p.id = l.producto_id join categorias c on c.id = p.categoria_id
         group by c.nombre) x),
    'metodos', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
        select metodo_pago as metodo, sum(cantidad * precio)::int as total, count(distinct factura_id)::int as n from l group by metodo_pago) x),
    -- promedio por noche de servicio abierta, para que lunes y martes (cerrado) no cuenten como «malos»
    'dias_semana', (select coalesce(jsonb_agg(x order by x.dow), '[]') from (
        select dow, count(distinct j)::int as jornadas, sum(cantidad * precio)::int as venta,
               (sum(cantidad * precio) / count(distinct j))::int as venta_por_jornada
          from l group by dow) x),
    'cajeros', (select coalesce(jsonb_agg(x order by x.venta desc), '[]') from (
        select coalesce(pf.nombre, 'Sin registro') as nombre, count(distinct f.id)::int as facturas,
               coalesce(sum(l.cantidad * l.precio), 0)::int as venta
          from f left join l on l.factura_id = f.id left join perfiles pf on pf.id = f.cobrada_por
         group by coalesce(pf.nombre, 'Sin registro')) x),
    'anuladas', (select coalesce(jsonb_agg(x order by x.cerrada_en desc), '[]') from (
        select a.id, m.nombre as mesa, a.cerrada_en, coalesce(pf.nombre, 'Sin registro') as por,
               (select coalesce(sum(cantidad * precio), 0)::int from lineas where factura_id = a.id) as total
          from facturas a join mesas m on m.id = a.mesa_id left join perfiles pf on pf.id = a.anulada_por
         where a.estado = 'anulada' and a.cerrada_en >= v_ini and a.cerrada_en < v_fin) x)
  ) into v;
  return v;
end $$;

-- ── Facturas de un rango (para buscar y revisar) ────────────────────────────────────────────
create or replace function admin_facturas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador.'; end if;
  return coalesce((select jsonb_agg(x order by x.cerrada_en desc) from (
    select f.id, f.numero, f.estado, f.metodo_pago, f.cerrada_en, _jornada(f.cerrada_en) as jornada,
           m.nombre as mesa, cl.nombre as cliente, coalesce(pf.nombre, 'Sin registro') as cobrada_por,
           (select coalesce(sum(cantidad * precio), 0)::int from lineas where factura_id = f.id) as total,
           (select coalesce(sum(cantidad), 0)::int from lineas where factura_id = f.id) as unidades
      from facturas f join mesas m on m.id = f.mesa_id
      left join clientes cl on cl.id = f.cliente_id
      left join perfiles pf on pf.id = coalesce(f.cobrada_por, f.anulada_por)
     where f.estado in ('pagada', 'anulada') and f.cerrada_en >= _inicio(p_desde) and f.cerrada_en < _inicio(p_hasta + 1)) x), '[]'::jsonb);
end $$;

-- ── Comisión del trabajador ─────────────────────────────────────────────────────────────────
create or replace function admin_comision(p_desde date, p_hasta date) returns jsonb
language plpgsql stable set search_path = public as $$
declare v jsonb;
begin
  if not es_admin() then raise exception 'Solo el administrador.'; end if;
  with l as (
    select l.*, p.categoria_id from facturas f join lineas l on l.factura_id = f.id join productos p on p.id = l.producto_id
     where f.estado = 'pagada' and f.cerrada_en >= _inicio(p_desde) and f.cerrada_en < _inicio(p_hasta + 1)
  ), r as (
    select c.nombre as categoria, k.pct, k.base, k.nota,
           sum(l.cantidad)::int as unidades,
           sum(l.cantidad * l.precio)::int as venta,
           sum(l.cantidad * (l.precio - l.costo))::int as ganancia,
           round(sum(case k.base when 'venta' then l.cantidad * l.precio else l.cantidad * (l.precio - l.costo) end) * k.pct / 100)::int as comision
      from l join comision_reglas k on k.categoria_id = l.categoria_id join categorias c on c.id = l.categoria_id
     group by c.nombre, k.pct, k.base, k.nota
  )
  select jsonb_build_object(
    'detalle', coalesce((select jsonb_agg(to_jsonb(r) order by r.categoria) from r), '[]'),
    'total', coalesce((select sum(comision) from r), 0)) into v;
  return v;
end $$;

-- ── Rockola: reportes ───────────────────────────────────────────────────────────────────────
create or replace function admin_rockola(p_desde date, p_hasta date, p_paso text default 'semana') returns jsonb
language plpgsql stable set search_path = public as $$
declare v_ini timestamptz := _inicio(p_desde); v_fin timestamptz := _inicio(p_hasta + 1); v jsonb;
begin
  if not es_admin() then raise exception 'Solo el administrador.'; end if;
  if p_paso not in ('dia', 'semana', 'mes') then raise exception 'paso inválido'; end if;
  with u as (select case p_paso when 'dia' then 'day' when 'semana' then 'week' else 'month' end as t),
  c as (select * from rockola_cola where creado_en >= v_ini and creado_en < v_fin),
  pt as (select * from rockola_puntos where creado_en >= v_ini and creado_en < v_fin)
  select jsonb_build_object(
    'serie', coalesce((select jsonb_agg(x order by x.periodo) from (
        select p.periodo,
               (select count(*) from c where date_trunc((select t from u), _jornada(c.creado_en)::timestamp)::date = p.periodo)::int as pedidos,
               (select count(*) from c where c.estado = 'sonada' and date_trunc((select t from u), _jornada(c.creado_en)::timestamp)::date = p.periodo)::int as sonadas,
               (select count(distinct coalesce(c.celular, c.cliente)) from c where date_trunc((select t from u), _jornada(c.creado_en)::timestamp)::date = p.periodo)::int as personas,
               coalesce((select -sum(delta) from pt where motivo = 'pedido' and date_trunc((select t from u), _jornada(pt.creado_en)::timestamp)::date = p.periodo), 0)::int as puntos_gastados,
               coalesce((select sum(delta) from pt where motivo in ('consumo', 'cortesia', 'bienvenida') and delta > 0 and date_trunc((select t from u), _jornada(pt.creado_en)::timestamp)::date = p.periodo), 0)::int as puntos_dados
          from (select generate_series(date_trunc((select t from u), p_desde::timestamp),
                                       date_trunc((select t from u), p_hasta::timestamp),
                                       case p_paso when 'dia' then interval '1 day' when 'semana' then interval '7 days' else interval '1 month' end)::date as periodo) p) x), '[]'),
    'top_canciones', coalesce((select jsonb_agg(x) from (
        select titulo, artista, count(*)::int as veces from c where estado in ('sonada', 'sonando', 'pendiente')
         group by titulo, artista order by count(*) desc, titulo limit 15) x), '[]'),
    'top_artistas', coalesce((select jsonb_agg(x) from (
        select c.artista, coalesce(a.genero, 'sin clasificar') as genero, count(*)::int as veces
          from c left join rockola_artistas a on a.proveedor = c.proveedor and a.artista_id = c.artista_id
         where c.estado in ('sonada', 'sonando', 'pendiente') and c.artista <> ''
         group by c.artista, coalesce(a.genero, 'sin clasificar') order by count(*) desc, c.artista limit 15) x), '[]'),
    'generos', coalesce((select jsonb_agg(x order by x.veces desc) from (
        select coalesce(a.genero, 'sin clasificar') as genero, count(*)::int as veces
          from c left join rockola_artistas a on a.proveedor = c.proveedor and a.artista_id = c.artista_id
         where c.estado in ('sonada', 'sonando', 'pendiente') group by coalesce(a.genero, 'sin clasificar')) x), '[]'),
    'quitadas', (select count(*)::int from c where estado = 'quitada'),
    'saltadas', (select count(*)::int from c where estado = 'saltada')
  ) into v;
  return v;
end $$;

-- Artistas que han pedido y aún no tienen género (se cobran a precio base hasta clasificarlos).
create or replace view v_rockola_por_clasificar with (security_invoker = true) as
select a.proveedor, a.artista_id,
       coalesce(nullif(a.nombre, ''), (select max(c.artista) from rockola_cola c where c.proveedor = a.proveedor and c.artista_id = a.artista_id), a.artista_id) as nombre,
       (select count(*) from rockola_cola c where c.proveedor = a.proveedor and c.artista_id = a.artista_id)::int as pedidos
  from rockola_artistas a where a.genero is null;

-- Saldo por persona
create or replace view v_rockola_saldos with (security_invoker = true) as
select p.celular, p.nombre, p.creado_en,
       coalesce(sum(r.delta), 0)::int as saldo,
       coalesce(sum(r.delta) filter (where r.delta > 0), 0)::int as recibidos,
       coalesce(-sum(r.delta) filter (where r.motivo = 'pedido'), 0)::int as gastados,
       max(r.creado_en) as ultima_vez
  from rockola_personas p left join rockola_puntos r on r.celular = p.celular
 group by p.celular, p.nombre, p.creado_en;

-- ── Rockola: lista negra y géneros (solo administrador) ─────────────────────────────────────
create or replace function rockola_prohibir(p_proveedor text, p_pista_id text, p_titulo text, p_motivo text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin permiso'; end if;
  if coalesce(p_pista_id, '') = '' then raise exception 'falta la canción'; end if;
  insert into rockola_prohibidas (proveedor, pista_id, titulo, motivo)
  values (coalesce(nullif(p_proveedor, ''), 'spotify'), p_pista_id, left(coalesce(p_titulo, ''), 300), left(coalesce(p_motivo, ''), 200))
  on conflict (proveedor, pista_id) do update set titulo = excluded.titulo, motivo = excluded.motivo;
  -- si estaba en la cola, sale y se devuelven los puntos
  perform rockola_quitar(id) from rockola_cola where proveedor = coalesce(nullif(p_proveedor, ''), 'spotify') and pista_id = p_pista_id and estado = 'pendiente';
end $$;

create or replace function rockola_perdonar(p_proveedor text, p_pista_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin permiso'; end if;
  delete from rockola_prohibidas where proveedor = p_proveedor and pista_id = p_pista_id;
end $$;

create or replace function rockola_genero_guardar(p_genero text, p_multiplicador numeric, p_nota text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin permiso'; end if;
  p_genero := lower(btrim(coalesce(p_genero, '')));
  if p_genero = '' or length(p_genero) > 40 then raise exception 'género inválido'; end if;
  if coalesce(p_multiplicador, 0) <= 0 or p_multiplicador > 50 then raise exception 'el multiplicador debe ser mayor que 0'; end if;
  insert into rockola_generos (genero, multiplicador, nota) values (p_genero, p_multiplicador, left(coalesce(p_nota, ''), 200))
  on conflict (genero) do update set multiplicador = excluded.multiplicador, nota = excluded.nota;
end $$;

create or replace function rockola_genero_borrar(p_genero text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin permiso'; end if;
  if p_genero in ('general', 'ranchera') then raise exception 'Ese género es de base y no se borra'; end if;
  delete from rockola_generos where genero = p_genero;   -- los artistas quedan sin clasificar
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────────────────────
revoke execute on function _jornada(timestamptz), _inicio(date), admin_serie(date, date, text), admin_detalle(date, date),
  admin_facturas(date, date), admin_comision(date, date), admin_rockola(date, date, text),
  rockola_prohibir(text, text, text, text), rockola_perdonar(text, text),
  rockola_genero_guardar(text, numeric, text), rockola_genero_borrar(text) from public, anon;
grant execute on function _jornada(timestamptz), _inicio(date), admin_serie(date, date, text), admin_detalle(date, date),
  admin_facturas(date, date), admin_comision(date, date), admin_rockola(date, date, text),
  rockola_prohibir(text, text, text, text), rockola_perdonar(text, text),
  rockola_genero_guardar(text, numeric, text), rockola_genero_borrar(text) to authenticated;
revoke all on v_rockola_por_clasificar, v_rockola_saldos, comision_reglas from anon;
grant select on v_rockola_por_clasificar, v_rockola_saldos to authenticated;
grant all on comision_reglas to authenticated;
