-- Pruebas de las reglas de negocio. Cada bloque corre en una transacción que se deshace.
-- (Mismas reglas que las pruebas de la versión Django en bar/barra/tests.py.)
\set QUIET on

-- Ayudas
create or replace function _id_prod(p text) returns bigint language sql as $$ select id from productos where nombre = p $$;
create or replace function _id_mesa(p text) returns bigint language sql as $$ select id from mesas where nombre = p $$;
create or replace function _stock(p text) returns int language sql as $$ select stock from productos where nombre = p $$;
create or replace function _falla(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

begin;  -- el primer producto abre la cuenta y descuenta stock; el cóctel no
do $$ declare m bigint := _id_mesa('Mesa 1'); s0 int := _stock('Águila'); t int; n int;
begin
  perform agregar(m, _id_prod('Águila')); perform agregar(m, _id_prod('Águila'));
  select total, n_items into t, n from v_cuentas_abiertas where mesa_id = m;
  assert t = 12000 and n = 2, format('total/items: %s/%s', t, n);
  assert _stock('Águila') = s0 - 2, 'stock Águila';
  perform agregar(m, _id_prod('Mojito'));
  assert _stock('Mojito') = 0, 'el cóctel no descuenta';
end $$;
rollback;

begin;  -- producto inactivo o inexistente se ignora; cantidad inválida se ignora
do $$ declare m bigint := _id_mesa('Mesa 1');
begin
  update productos set activo = false where nombre = 'Águila';
  perform agregar(m, _id_prod('Águila')); perform agregar(m, 999999);
  perform agregar(m, _id_prod('Poker'), 0); perform agregar(m, _id_prod('Poker'), -2);
  assert not exists (select 1 from facturas), 'no debe abrirse cuenta';
end $$;
rollback;

begin;  -- se puede vender con stock en cero (queda negativo)
do $$ declare m bigint := _id_mesa('Mesa 1');
begin
  update productos set stock = 0 where nombre = 'Águila';
  perform agregar(m, _id_prod('Águila'));
  assert _stock('Águila') = -1, 'stock negativo permitido';
end $$;
rollback;

begin;  -- quitar devuelve stock; cuenta vacía libera la mesa; quitar algo inexistente no falla
do $$ declare m bigint := _id_mesa('Mesa 1'); s0 int := _stock('Águila');
begin
  perform quitar(m, _id_prod('Águila'));                       -- sin cuenta
  perform agregar(m, _id_prod('Águila'), 2);
  perform quitar(m, _id_prod('Águila'));
  assert (select n_items from v_cuentas_abiertas where mesa_id = m) = 1, 'queda 1';
  assert _stock('Águila') = s0 - 1, 'devuelve 1';
  perform quitar(m, _id_prod('Poker'));                        -- producto que no está
  perform quitar(m, _id_prod('Águila'));
  assert not exists (select 1 from facturas), 'la mesa queda libre';
  assert _stock('Águila') = s0, 'stock restituido';
  perform quitar(m, _id_prod('Águila'), 50);                   -- ya no hay cuenta: no falla
end $$;
rollback;

begin;  -- quitar más de lo que hay solo quita lo que hay
do $$ declare m bigint := _id_mesa('Mesa 1'); s0 int := _stock('Águila');
begin
  perform agregar(m, _id_prod('Águila'), 2); perform agregar(m, _id_prod('Mojito'));
  perform quitar(m, _id_prod('Águila'), 99);
  assert _stock('Águila') = s0, 'no devuelve de más';
end $$;
rollback;

begin;  -- el precio queda fijo aunque el producto cambie
do $$ declare m bigint := _id_mesa('Mesa 1');
begin
  perform agregar(m, _id_prod('Águila'));
  update productos set precio = 9000, costo = 5000 where nombre = 'Águila';
  assert (select precio from lineas) = 6000 and (select costo from lineas) = 3300, 'copia del precio';
end $$;
rollback;

begin;  -- una sola cuenta abierta por mesa
do $$ declare m bigint := _id_mesa('Mesa 1'); r text;
begin
  insert into facturas (mesa_id) values (m);
  r := _falla(format('insert into facturas (mesa_id) values (%s)', m));
  assert r like '%una_factura_abierta_por_mesa%', 'debe rechazar la segunda: ' || coalesce(r, 'nada');
  insert into facturas (mesa_id) values (_id_mesa('Mesa 2'));   -- otra mesa sí
end $$;
rollback;

begin;  -- clientes: anónimo, asignar, crear al vuelo reutilizando el nombre
do $$ declare m bigint := _id_mesa('Mesa 1'); c bigint;
begin
  perform agregar(m, _id_prod('Águila'));
  assert (select cliente_id from facturas) is null, 'anónimo por defecto';
  select id into c from clientes where nombre like 'Carlos%';
  perform asignar_cliente(m, c);
  assert (select cliente_id from facturas) = c, 'asignado';
  perform asignar_cliente(m, null);
  assert (select cliente_id from facturas) is null, 'vuelve a anónimo';
  perform crear_cliente(m, '  Laura '); perform crear_cliente(m, 'Laura');
  assert (select count(*) from clientes where nombre = 'Laura') = 1, 'no duplica';
  assert (select cl.nombre from facturas f join clientes cl on cl.id = f.cliente_id) = 'Laura', 'asignó Laura';
  perform crear_cliente(m, '   ');                              -- vacío: no hace nada
end $$;
rollback;

begin;  -- cobrar: consecutivo, libera la mesa, valida
do $$ declare m bigint := _id_mesa('Mesa 1'); a bigint; b bigint; r text;
begin
  r := _falla(format('select cobrar(%s, ''efectivo'')', m));
  assert r like '%vacía%', 'cuenta vacía: ' || coalesce(r, 'nada');
  perform agregar(m, _id_prod('Águila'));
  r := _falla(format('select cobrar(%s, ''cheque'')', m));
  assert r like '%Elige cómo pagó%', 'método inválido: ' || coalesce(r, 'nada');
  a := cobrar(m, 'efectivo');
  perform agregar(m, _id_prod('Águila'));
  b := cobrar(m, 'tarjeta');
  assert (select numero from facturas where id = a) = 1 and (select numero from facturas where id = b) = 2, 'consecutivo';
  assert (select estado from facturas where id = a) = 'pagada' and (select cerrada_en from facturas where id = a) is not null, 'pagada';
  assert not exists (select 1 from facturas where estado = 'abierta'), 'mesa libre';
  r := _falla(format('select cobrar(%s, ''efectivo'')', m));    -- segundo cobro: ya no hay cuenta
  assert r like '%ya fue cobrada%', 'doble cobro: ' || coalesce(r, 'nada');
end $$;
rollback;

begin;  -- anular devuelve todo el stock y conserva el registro; vacía no deja rastro
do $$ declare m bigint := _id_mesa('Mesa 1'); s0 int := _stock('Águila');
begin
  perform agregar(m, _id_prod('Águila'), 2); perform agregar(m, _id_prod('Mojito'));
  perform anular(m);
  assert _stock('Águila') = s0, 'stock devuelto';
  assert (select estado from facturas) = 'anulada' and (select count(*) from facturas) = 1, 'anulada conservada';
  perform asignar_cliente(_id_mesa('Mesa 2'), null);            -- abre cuenta vacía
  perform anular(_id_mesa('Mesa 2'));
  assert (select count(*) from facturas) = 1, 'la vacía no deja rastro';
  perform anular(_id_mesa('Mesa 2'));                           -- sin cuenta: no falla
end $$;
rollback;

begin;  -- inventario: compra y conteo
do $$ declare s0 int := _stock('Águila'); r text;
begin
  perform comprar(_id_prod('Águila'), 24, 3500, 'Distribuidora');
  assert _stock('Águila') = s0 + 24 and (select costo from productos where nombre = 'Águila') = 3500, 'compra con costo';
  assert (select costo_unitario from movimientos where motivo = 'compra') = 3500, 'movimiento de compra';
  perform comprar(_id_prod('Águila'), 5);
  assert (select costo from productos where nombre = 'Águila') = 3500, 'sin costo no toca el costo';
  r := _falla(format('select comprar(%s, 0)', _id_prod('Águila')));
  assert r like '%mayor que cero%', 'cantidad cero';
  r := _falla(format('select comprar(%s, -3)', _id_prod('Águila')));
  assert r like '%mayor que cero%', 'cantidad negativa';
  perform contar(_id_prod('Águila'), 7);
  assert _stock('Águila') = 7, 'conteo fija';
  assert (select cantidad from movimientos where motivo = 'ajuste') = 7 - (s0 + 29), 'guarda la diferencia';
  perform contar(_id_prod('Águila'), 7);
  assert (select count(*) from movimientos where motivo = 'ajuste') = 1, 'igual no genera movimiento';
  r := _falla(format('select contar(%s, -1)', _id_prod('Águila')));
  assert r like '%negativo%', 'conteo negativo';
end $$;
rollback;

begin;  -- jornada: la madrugada cuenta en la noche anterior; anuladas/abiertas no cuentan
do $$ declare m bigint := _id_mesa('Mesa 1'); lunes date := date '2026-03-02'; f bigint; r jsonb;
begin
  -- Lunes 21:00 (Bogotá): 3 Águila + 1 Mojito, efectivo
  insert into facturas (mesa_id, estado, metodo_pago, numero, cerrada_en)
    values (m, 'pagada', 'efectivo', 1, timestamp '2026-03-02 21:00' at time zone 'America/Bogota') returning id into f;
  insert into lineas (factura_id, producto_id, cantidad, precio, costo)
    values (f, _id_prod('Águila'), 3, 6000, 3300), (f, _id_prod('Mojito'), 1, 18000, 6500);
  -- Martes 01:00: 2 Águila, tarjeta  → sigue siendo la jornada del lunes
  insert into facturas (mesa_id, estado, metodo_pago, numero, cerrada_en)
    values (m, 'pagada', 'tarjeta', 2, timestamp '2026-03-03 01:00' at time zone 'America/Bogota') returning id into f;
  insert into lineas (factura_id, producto_id, cantidad, precio, costo) values (f, _id_prod('Águila'), 2, 6000, 3300);
  -- Martes 08:00: otra jornada
  insert into facturas (mesa_id, estado, metodo_pago, numero, cerrada_en)
    values (m, 'pagada', 'efectivo', 3, timestamp '2026-03-03 08:00' at time zone 'America/Bogota') returning id into f;
  insert into lineas (factura_id, producto_id, cantidad, precio, costo) values (f, _id_prod('Águila'), 5, 6000, 3300);
  -- Anulada el lunes: no cuenta
  insert into facturas (mesa_id, estado, cerrada_en) values (m, 'anulada', timestamp '2026-03-02 22:00' at time zone 'America/Bogota');

  r := resumen(lunes);
  assert (r->>'n_facturas')::int = 2, 'facturas: ' || (r->>'n_facturas');
  assert (r->>'venta')::int = 3 * 6000 + 18000 + 2 * 6000, 'venta';
  assert (r->>'costo')::int = 3 * 3300 + 6500 + 2 * 3300, 'costo';
  assert (r->>'ganancia')::int = (r->>'venta')::int - (r->>'costo')::int, 'ganancia';
  assert (r->>'ticket_promedio')::int = (r->>'venta')::int / 2, 'ticket';
  assert (r->'metodos'->0->>'metodo') = 'efectivo' and (r->'metodos'->0->>'total')::int = 36000, 'efectivo';
  assert (r->'metodos'->2->>'metodo') = 'tarjeta' and (r->'metodos'->2->>'total')::int = 12000, 'tarjeta';
  assert (r->'productos'->0->>'nombre') = 'Águila' and (r->'productos'->0->>'unidades')::int = 5, 'más vendido';
  assert jsonb_array_length(r->'facturas') = 2 and (r->'facturas'->0->>'numero')::int = 2, 'facturas más reciente primero';
  r := resumen(date '2026-01-01');
  assert (r->>'n_facturas')::int = 0 and (r->>'ticket_promedio')::int = 0 and r->'productos' = '[]'::jsonb, 'día vacío';
  assert jornada_actual(6) = (((now() at time zone 'America/Bogota') - interval '6 hours'))::date, 'jornada_actual';
end $$;
rollback;

begin;  -- sin sesión (rol anon, la llave pública) no se lee ni se escribe nada
set local role anon;
do $$ begin
  begin perform count(*) from productos; assert false, 'anon no debe leer productos';
  exception when insufficient_privilege then null; end;
  begin perform agregar(_id_mesa('Mesa 1'), _id_prod('Águila')); assert false, 'anon no debe vender';
  exception when insufficient_privilege then null; end;
  begin insert into categorias (nombre) values ('Prueba anon'); assert false, 'anon no debe escribir';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

drop function _id_prod(text), _id_mesa(text), _stock(text), _falla(text);
\echo 'pruebas.sql: todas las reglas OK'
