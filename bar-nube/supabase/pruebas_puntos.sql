-- Pruebas de puntos, precio por género, lista negra y permisos del bot. Se corre después de rockola_puntos.sql.
-- Todo se deshace.
\set QUIET on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000b2');
insert into perfiles (id, nombre, rol) values
  ('00000000-0000-0000-0000-0000000000a2', 'Diego', 'admin'), ('00000000-0000-0000-0000-0000000000b2', 'José Manuel', 'barman');
insert into rockola_artistas (artista_id, nombre, genero) values ('vicente', 'Vicente Fernández', 'ranchera'), ('morat', 'Morat', 'general');
insert into rockola_prohibidas (pista_id, titulo, motivo) values ('mala', 'Canción prohibida', 'prueba');

-- ── precio ──
do $$ begin
  assert rockola_precio('spotify', '{}') = 8, 'precio base: 8 puntos';
  assert rockola_precio('spotify', '{desconocido}') = 8, 'artista sin género = precio base';
  assert rockola_precio('spotify', '{vicente}') = 24, 'ranchera = triple';
  assert rockola_precio('spotify', '{morat}') = 8, 'general = base';
  assert rockola_precio('spotify', '{morat,vicente}') = 24, 'con varios artistas vale el género más caro';
end $$;

-- ── anónimo: solo ve precios ──
set local role anon;
do $$ begin
  assert rockola_precio('spotify', '{vicente}') = 24, 'anon ve el precio';
  begin perform rockola_saldo('573001112233'); assert false, 'anon lee saldos'; exception when insufficient_privilege then null; end;
  begin perform rockola_registrar('573001112233'); assert false, 'anon registra'; exception when insufficient_privilege then null; end;
  begin perform rockola_mi_estado('573001112233'); assert false, 'anon lee estado'; exception when insufficient_privilege then null; end;
  begin perform rockola_pedir_puntos('573001112233', 'X', '1', 'spotify', 'p', 't', 'a', '{}', '', 1); assert false, 'anon pide con puntos'; exception when insufficient_privilege then null; end;
  begin perform rockola_cortesia('573001112233', 50); assert false, 'anon da cortesías'; exception when insufficient_privilege then null; end;
  begin perform rockola_dar_puntos_factura(1, '573001112233'); assert false, 'anon da puntos'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_puntos; assert false, 'anon lee el libro'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── bot (service_role): bienvenida, precio, saldo, límites, lista negra ──
set local role service_role;
do $$
declare r jsonb;
begin
  assert (rockola_mi_estado('573001112233')->>'registrado')::boolean = false, 'aún no registrado';
  begin perform rockola_pedir_puntos('abc', 'X', '1', 'spotify', 'p', 't', 'a', '{}', '', 1); assert false, 'celular inválido';
  exception when others then assert sqlerrm like 'celular inválido%', sqlerrm; end;

  -- la bienvenida son 16 puntos: la ranchera (24) no alcanza, el error dice cuánto falta
  begin perform rockola_pedir_puntos('573001112233', 'Camila Pérez', '4', 'spotify', 'v1', 'El Rey', 'Vicente Fernández', '{vicente}', '', 150000); assert false, 'sin saldo';
  exception when others then assert sqlerrm like 'Te faltan 8 puntos%', sqlerrm; end;
  -- (el error deshace la llamada completa, incluido el registro: el bot registra al primer mensaje)
  assert (rockola_mi_estado('573001112233')->>'saldo')::int = 16 and not (rockola_mi_estado('573001112233')->>'registrado')::boolean, 'quien no se ha registrado ve su bienvenida';
  assert rockola_registrar('573001112233', 'Camila Pérez') = 16 and rockola_registrar('573001112233', 'Camila Pérez') = 16, 'registrar es idempotente';

  begin perform rockola_pedir_puntos('573001112233', 'Camila', '4', 'spotify', 'mala', 'Prohibida', 'X', '{}', '', 1); assert false, 'lista negra';
  exception when others then assert sqlerrm like 'Esa canción no la ponemos%', sqlerrm; end;

  r := rockola_pedir_puntos('573001112233', 'Camila Pérez', '4', 'spotify', 'm1', 'Besos en guerra', 'Morat', '{morat}', 'https://x/a.jpg', 200000);
  assert (r->>'costo')::int = 8 and (r->>'saldo')::int = 8, 'canción normal: 8 puntos, quedan 8';
  r := rockola_pedir_puntos('573001112233', 'Camila Pérez', '4', 'spotify', 'm2', 'Otra', 'Morat', '{morat,nuevo}', '', 200000);
  assert (r->>'saldo')::int = 0, 'dos canciones con la bienvenida';
  begin perform rockola_pedir_puntos('573001112233', 'Camila', '4', 'spotify', 'm3', 'Tercera', 'Morat', '{morat}', '', 1); assert false, 'límite de 2';
  exception when others then assert sqlerrm like 'Ya tienes 2%', sqlerrm; end;
  assert rockola_saldo('573001112233') = 0, 'los rechazos no cobran';
  assert (rockola_mi_estado('573001112233')->>'en_cola')::int = 2, 'dos en cola';

  perform rockola_registrar('573009998877', 'Luis');
  -- otra persona: la misma canción ya está en cola; y el celular no se puede volver a «estrenar»
  begin perform rockola_pedir_puntos('573009998877', 'Luis', '2', 'spotify', 'm1', 'Besos en guerra', 'Morat', '{morat}', '', 1); assert false, 'repetida';
  exception when others then assert sqlerrm like 'Esa canción ya está%', sqlerrm; end;
  assert rockola_saldo('573009998877') = 16, 'Luis también recibió su bienvenida, una sola vez';
  perform rockola_pedir_puntos('573009998877', 'Luis', '2', 'spotify', 'l1', 'Otra canción', 'X', '{}', '', 1);
  assert rockola_saldo('573009998877') = 8, 'Luis pagó 8';
end $$;
reset role;

do $$ begin
  assert (select count(*) from rockola_puntos where motivo = 'bienvenida') = 2, 'una bienvenida por persona';
  assert (select genero is null from rockola_artistas where artista_id = 'nuevo'), 'artista nuevo queda por clasificar';
  assert (select nombre from rockola_cola where pista_id = 'm1') = 'Camila Pérez', 'nombre en la cola';
  assert rockola_estado()->'cola'->0->>'nombre' = 'Camila', 'la pantalla muestra solo el primer nombre';
  assert not (rockola_estado()->'cola'->0 ? 'celular'), 'el celular no sale en el estado público';
end $$;

-- ── personal ──
create or replace function _saldo(p text) returns int language sql stable as $$ select coalesce(sum(delta), 0)::int from rockola_puntos where celular = p $$;   -- el personal lee el libro por RLS
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;   -- barman
do $$
declare mesa bigint := (select id from mesas order by id limit 1); prod bigint := (select id from productos where se_vende order by id limit 1);
        f bigint; r jsonb; total int; antes int;
begin
  -- quitar una pendiente devuelve los puntos, una sola vez
  perform rockola_quitar((select id from rockola_cola where pista_id = 'l1'));
  perform rockola_quitar((select id from rockola_cola where pista_id = 'l1'));
  assert (select count(*) from rockola_puntos where motivo = 'reembolso') = 1, 'un solo reembolso';

  -- puntos por consumo
  perform agregar(mesa, prod, 3);
  begin perform rockola_dar_puntos_factura((select id from facturas where mesa_id = mesa and estado = 'abierta'), '573001112233', 'Camila'); assert false, 'factura sin pagar';
  exception when others then assert sqlerrm like 'La factura no está pagada%', sqlerrm; end;
  f := cobrar(mesa, 'efectivo');
  total := (select sum(cantidad * precio) from lineas where factura_id = f);
  assert total >= 1000, 'la prueba necesita una factura de al menos $1.000';
  antes := _saldo('573001112233');
  r := rockola_dar_puntos_factura(f, '573001112233', 'Camila');
  assert (r->>'puntos')::int = total / 1000 and (r->>'saldo')::int = antes + total / 1000, 'puntos = total / 1000';
  begin perform rockola_dar_puntos_factura(f, '573000000000', ''); assert false, 'misma factura dos veces';
  exception when others then assert sqlerrm like 'Esa factura ya dio%', sqlerrm; end;

  -- cortesías: solo admin; clasificar: personal
  begin perform rockola_cortesia('573001112233', 50); assert false, 'barman da cortesía'; exception when others then assert sqlerrm = 'sin permiso', sqlerrm; end;
  perform rockola_clasificar('spotify', 'nuevo', 'Artista Nuevo', 'ranchera');
  assert rockola_precio('spotify', '{nuevo}') = 24, 'al clasificar cambia el precio';
  begin perform rockola_clasificar('spotify', 'nuevo', '', 'inventado'); assert false, 'género inexistente'; exception when others then assert sqlerrm like 'género desconocido%', sqlerrm; end;
  begin perform rockola_pedir_puntos('573001112233', 'X', '1', 'spotify', 'p', 't', 'a', '{}', '', 1); assert false, 'barman no usa la llave del bot'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true); end $$;   -- admin
do $$
declare antes int := _saldo('573001112233');
begin
  assert rockola_cortesia('573001112233', 50, 'cumpleaños') = antes + 50, 'cortesía del admin';
  assert rockola_cortesia('573001112233', -10, 'ajuste') = antes + 40, 'ajuste negativo';
  assert (select count(*) from rockola_puntos where motivo = 'cortesia') = 2;
end $$;
rollback;
