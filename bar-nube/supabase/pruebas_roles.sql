-- Pruebas del catálogo real (cerveza artesanal por litros) y de los roles (admin / barman / sin sesión).
-- Se corre después de catalogo.sql. Cada bloque se deshace.
\set QUIET on

create or replace function _id_prod(p text) returns bigint language sql as $$ select id from productos where nombre = p $$;
create or replace function _id_mesa(p text) returns bigint language sql as $$ select id from mesas where nombre = p $$;
create or replace function _stock(p text) returns int language sql as $$ select stock from productos where nombre = p $$;

begin;  -- el catálogo real quedó como lo dio el dueño
do $$ begin
  assert _id_prod('Águila') is null and _id_prod('Águila Light') is not null, 'Águila → Águila Light';
  assert (select precio || '/' || costo from productos where nombre = 'Águila Light') = '5000/2400', 'Águila Light';
  assert (select precio || '/' || costo from productos where nombre = 'Corona') = '5000/3000', 'Corona';
  assert _stock('Águila Light') = 48 and _stock('Poker') = 48 and _stock('Aguardiente — botella') = 10, 'existencias';
  assert _stock('Cerveza artesanal negra (litros)') = 10000, '10 litros = 10000 ml';
  assert (select count(*) from productos where nombre = 'Whisky — trago') = 1, 'sin duplicados al repetir';
  assert not (select se_vende from productos where nombre = 'Cerveza artesanal negra (litros)'), 'el recipiente no se vende';
end $$;
rollback;

begin;  -- la pinta (490) y el vaso (330) descuentan del mismo recipiente; anular y quitar lo devuelven
do $$ declare m bigint := _id_mesa('Mesa 1'); r text := 'Cerveza artesanal negra (litros)';
begin
  perform agregar(m, _id_prod('Pinta negra 490 ml'));
  perform agregar(m, _id_prod('Vaso negra 330 ml'), 2);
  assert _stock(r) = 10000 - 490 - 660, format('recipiente: %s', _stock(r));
  assert _stock('Pinta negra 490 ml') = 0 and _stock('Vaso negra 330 ml') = 0, 'ellos no tienen stock propio';
  perform quitar(m, _id_prod('Vaso negra 330 ml'));
  assert _stock(r) = 10000 - 490 - 330, 'quitar un vaso devuelve 330';
  perform agregar(m, _id_prod(r));                              -- el recipiente no se vende
  assert (select n_items from v_cuentas_abiertas where mesa_id = m) = 2, 'recipiente fuera de la cuenta';
  perform anular(m);
  assert _stock(r) = 10000, 'anular devuelve todo';
end $$;
rollback;

begin;  -- roles: perfiles de prueba
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into perfiles (id, nombre, rol) values
  ('00000000-0000-0000-0000-00000000000a', 'Diego', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'José Manuel', 'barman');
-- (la «c» es un usuario sin perfil)

-- barman: vende, ve el inventario, no toca nada más
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); end $$;
do $$ declare m bigint := _id_mesa('Mesa 1'); f bigint; s0 int := _stock('Poker');
begin
  assert (select count(*) from productos) > 0, 'barman lee productos';
  perform agregar(m, _id_prod('Poker'), 2);
  assert _stock('Poker') = s0 - 2, 'barman vende y el stock baja';
  perform crear_cliente(m, 'Cliente del barman');
  f := cobrar(m, 'efectivo');
  assert (select estado from facturas where id = f) = 'pagada', 'barman cobra';
  assert (select numero from facturas where id = f) is not null, 'con número';
  -- lo que NO puede
  update productos set precio = 1 where nombre = 'Poker';
  assert (select precio from productos where nombre = 'Poker') = 5000, 'barman no cambia precios';
  begin insert into categorias (nombre) values ('Hackeada'); assert false, 'barman no crea categorías';
  exception when insufficient_privilege then null; end;
  begin perform comprar(_id_prod('Poker'), 5); assert false, 'barman no compra';
  exception when raise_exception then assert sqlerrm like 'Solo el administrador%', sqlerrm; end;
  begin perform contar(_id_prod('Poker'), 5); assert false, 'barman no cuenta';
  exception when raise_exception then assert sqlerrm like 'Solo el administrador%', sqlerrm; end;
  begin perform resumen(jornada_actual(6)); assert false, 'barman no ve ventas';
  exception when raise_exception then assert sqlerrm like 'Solo el administrador%', sqlerrm; end;
  assert (select count(*) from perfiles) = 1, 'solo ve su propio perfil';
  delete from facturas;                                          -- bloqueado por RLS: 0 filas
  assert (select count(*) from facturas) > 0, 'barman no borra facturas';
end $$;

-- usuario sin perfil: no ve nada ni vende
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); end $$;
do $$ begin
  assert (select count(*) from productos) = 0, 'sin perfil no ve productos';
  begin perform agregar(_id_mesa('Mesa 2'), _id_prod('Poker')); assert false, 'sin perfil no vende';
  exception when raise_exception then null; end;
end $$;

-- admin: todo
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); end $$;
do $$ declare s0 int := _stock('Poker');
begin
  update productos set precio = 5500 where nombre = 'Poker';
  assert (select precio from productos where nombre = 'Poker') = 5500, 'admin cambia precios';
  perform comprar(_id_prod('Poker'), 10, 2500);
  assert _stock('Poker') = s0 + 10, 'admin compra';
  perform contar(_id_prod('Poker'), 40);
  assert _stock('Poker') = 40, 'admin cuenta';
  assert (resumen(jornada_actual(6))->>'n_facturas')::int = 1, 'admin ve las ventas';
  assert (select count(*) from perfiles) = 2, 'admin ve los perfiles';
end $$;
rollback;

drop function _id_prod(text), _id_mesa(text), _stock(text);
\echo 'pruebas_roles.sql: catálogo y roles OK'
