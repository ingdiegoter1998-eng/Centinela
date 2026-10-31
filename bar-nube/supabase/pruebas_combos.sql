-- Pruebas de cigarrillos y combos (catálogo del 31-oct-2026) y del conteo. Se corre después de catalogo.sql.
\set QUIET on
create or replace function _id_prod(p text) returns bigint language sql as $$ select id from productos where nombre = p $$;
create or replace function _id_mesa(p text) returns bigint language sql as $$ select id from mesas where nombre = p $$;
create or replace function _stock(p text) returns int language sql as $$ select stock from productos where nombre = p $$;
create or replace function _falla(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

begin;  -- catálogo: cigarrillos y combo como los pidió el dueño
do $$ begin
  assert (select precio || '/' || costo from productos where nombre = 'Mata Cuchos') = '1000/250', 'Mata Cuchos';
  assert (select precio from productos where nombre = 'Lucky Strike') = 1500, 'Lucky Strike sigue a 1.500';
  assert not (select en_promos from productos where nombre = 'Lucky Strike'), 'Lucky fuera de promos';
  assert (select precio from productos where nombre = 'Combo Poker + Mata Cuchos') = 3800, 'combo 3.800';
  assert (select string_agg(p.nombre, ',' order by p.nombre) from combo_componentes c join productos p on p.id = c.producto_id
           where c.combo_id = _id_prod('Combo Poker + Mata Cuchos')) = 'Mata Cuchos,Poker', 'componentes del combo';
  assert (select count(*) from productos where nombre = 'Lucky Strike') = 1, 'sin duplicar Lucky';
end $$;
rollback;

begin;  -- el combo cobra 3.800, descuenta 1 Poker + 1 Mata Cuchos, y quitar/anular lo devuelven
do $$ declare m bigint := _id_mesa('Mesa 1'); c bigint := _id_prod('Combo Poker + Mata Cuchos');
  p0 int := _stock('Poker'); k0 int := _stock('Mata Cuchos');
begin
  perform agregar(m, c, 2);
  assert _stock('Poker') = p0 - 2 and _stock('Mata Cuchos') = k0 - 2, 'descuenta componentes';
  assert (select total from v_cuentas_abiertas where mesa_id = m) = 7600, 'total combo';
  assert (select costo from lineas where producto_id = c) = 2650, format('costo combo: %s', (select costo from lineas where producto_id = c));
  perform quitar(m, c);
  assert _stock('Poker') = p0 - 1 and _stock('Mata Cuchos') = k0 - 1, 'quitar devuelve';
  perform anular(m);
  assert _stock('Poker') = p0 and _stock('Mata Cuchos') = k0, 'anular devuelve';
end $$;
rollback;

begin;  -- Lucky Strike no entra a ningún combo, ni se puede excluir algo que ya está en uno
do $$ declare e text;
begin
  e := _falla(format('insert into combo_componentes values (%s, %s, 1)', _id_prod('Combo Poker + Mata Cuchos'), _id_prod('Lucky Strike')));
  assert e like '%no aplica para combos%', format('Lucky en combo: %s', e);
  e := _falla('update productos set en_promos = false where nombre = ''Mata Cuchos''');
  assert e like '%está en un combo%', format('excluir Mata Cuchos: %s', e);
  e := _falla(format('insert into combo_componentes values (%s, %s, 1)', _id_prod('Poker'), _id_prod('Combo Poker + Mata Cuchos')));
  assert e like '%combo no puede%', format('combo dentro de combo: %s', e);
end $$;
rollback;

begin;  -- Lucky Strike se vende suelto a 1.500
do $$ declare m bigint := _id_mesa('Mesa 1');
begin
  perform agregar(m, _id_prod('Lucky Strike'));
  assert (select total from v_cuentas_abiertas where mesa_id = m) = 1500, 'Lucky suelto';
end $$;
rollback;

begin;  -- el barman no puede mover stock a pelo con _mover_stock
do $$ begin
  assert not has_function_privilege('authenticated', '_mover_stock(bigint, int)', 'execute'), 'mover_stock cerrado';
  assert has_table_privilege('authenticated', 'combo_componentes', 'select'), 'combos legibles';
end $$;
rollback;

begin;  -- conteo del 31-oct: deja las cantidades exactas y Redd's pasa a controlar existencias
\i conteo_2026-10-31.sql
do $$ begin
  assert _stock('Poker') = 18 and _stock('Águila Light') = 37 and _stock('Club Colombia') = 18
     and _stock('Soda') = 8 and _stock('Redd''s') = 8, 'conteo';
  assert (select controla_stock from productos where nombre = 'Redd''s'), 'Redd''s controla';
  assert _stock('Cerveza artesanal negra (litros)') = 10000, 'artesanal intacta';
  assert exists (select 1 from movimientos where nota = 'Conteo 31-oct-2026'), 'deja rastro';
end $$;
rollback;
