-- Pruebas de la rockola: lo que puede el cliente anónimo, los límites y el control del personal.
-- Se corre después de rockola.sql. Todo se deshace.
\set QUIET on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into perfiles (id, nombre, rol) values ('00000000-0000-0000-0000-0000000000b1', 'José Manuel', 'barman');

-- ── la puerta anónima de pedir está cerrada (los pedidos entran por el bot o por una función verificada) ──
do $$
begin
  assert not has_function_privilege('anon', 'rockola_pedir(text, text, text, text, text, text, text, int)', 'execute'), 'anon no pide directo';
  assert not has_function_privilege('authenticated', 'rockola_pedir(text, text, text, text, text, text, text, int)', 'execute'), 'ni el personal: pide por la ruta verificada';
end $$;

-- ── reglas de rockola_pedir (se prueba como dueño de la base; antes la llamaba cualquier anónimo) ──
do $$
declare e jsonb;
begin
  perform rockola_pedir('celular-AAAA1', '5', 'spotify', 'p1', 'Canción 1', 'Artista', 'https://x/1.jpg', 200000);
  perform rockola_pedir('celular-AAAA1', '5', 'spotify', 'p2', 'Canción 2', 'Artista', 'javascript:alert(1)', 200000);
  begin perform rockola_pedir('celular-AAAA1', '5', 'spotify', 'p3', 'Canción 3', '', '', 1); assert false, 'límite por celular';
  exception when others then assert sqlerrm like 'Ya tienes%', 'mensaje de límite: ' || sqlerrm; end;
  begin perform rockola_pedir('celular-BBBB2', '7', 'spotify', 'p1', 'Canción 1', '', '', 1); assert false, 'repetida en cola';
  exception when others then assert sqlerrm like 'Esa canción%', 'mensaje de repetida: ' || sqlerrm; end;
  begin perform rockola_pedir('x', '7', 'spotify', 'p9', 'T', '', '', 1); assert false, 'cliente corto';
  exception when others then assert sqlerrm = 'cliente inválido', sqlerrm; end;
end $$;

-- ── cliente anónimo: solo ve el estado ──
set local role anon;
do $$
declare e jsonb;
begin
  assert not has_table_privilege('anon', 'rockola_cola', 'select'), 'anon no lee la tabla directo';
  assert not has_function_privilege('anon', 'rockola_siguiente()', 'execute'), 'anon no controla el reproductor';
  e := rockola_estado('celular-AAAA1');
  assert jsonb_array_length(e->'cola') = 2 and (e->'cola'->0->>'mio')::boolean, 'cola con mis pedidos';
  assert not (rockola_estado('otro-celular-1')->'cola'->0->>'mio')::boolean, 'no es mío';
  assert e->'cola'->0->>'portada' = 'https://x/1.jpg' and e->'cola'->1->>'portada' = '', 'portada no-https descartada';
  assert not (e->'cola'->0 ? 'cliente'), 'no se filtra el id del celular';
end $$;
do $$ begin
  begin perform rockola_siguiente(); assert false, 'anon controla'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_cola; assert false, 'anon lee tabla'; exception when insufficient_privilege then null; end;
end $$;

-- ── personal ──
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true); end $$;  -- sin perfil
do $$ begin begin perform rockola_activar(false); assert false; exception when others then assert sqlerrm = 'sin permiso', sqlerrm; end; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true); end $$;  -- barman
do $$
declare s jsonb;
begin
  perform rockola_activar(false);
  assert not (rockola_estado()->>'activa')::boolean, 'en pausa';
  perform rockola_activar(true);
  assert (rockola_estado()->>'activa')::boolean, 'reanudada';

  s := rockola_siguiente();
  assert s->>'pista_id' = 'p1', 'suena la primera en llegar';
  assert (select count(*) from rockola_cola where estado = 'sonando') = 1, 'una sola sonando';
  assert rockola_estado()->'sonando'->>'pista_id' = 'p1', 'estado muestra la que suena';
  s := rockola_saltar();
  assert s->>'pista_id' = 'p2', 'saltar pasa a la siguiente';
  assert (select estado from rockola_cola where pista_id = 'p1') = 'saltada', 'la saltada queda marcada';
  assert rockola_siguiente() is null, 'cola vacía → null';
  assert (select estado from rockola_cola where pista_id = 'p2') = 'sonada', 'terminó';
  assert rockola_estado()->'sonando' = 'null'::jsonb, 'nada suena';
end $$;
reset role;

-- cooldown: la que sonó hace poco no se repite; las saltadas sí se pueden volver a pedir
do $$
declare q bigint;
begin
  begin perform rockola_pedir('celular-DDDD4', '2', 'spotify', 'p2', 'Canción 2', '', '', 1); assert false, 'cooldown';
  exception when others then assert sqlerrm like 'Esa canción%', sqlerrm; end;
  perform rockola_pedir('celular-DDDD4', '2', 'spotify', 'p1', 'Canción 1', '', '', 1);   -- p1 fue saltada
end $$;

-- quitar y prioridad por puntos (el futuro sistema de puntos solo tiene que llenar `puntos`)
update rockola_cola set estado = 'sonada';
insert into rockola_cola (pista_id, titulo, cliente, puntos) values ('a', 'normal', 'celular-EEEE5', 0), ('b', 'vip', 'celular-EEEE5', 5);
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true); end $$;
do $$
declare s jsonb;
begin
  assert rockola_estado()->'cola'->0->>'pista_id' = 'b', 'más puntos va primero';
  perform rockola_quitar((select id from rockola_cola where pista_id = 'b'));
  s := rockola_siguiente();
  assert s->>'pista_id' = 'a', 'la quitada no suena';
end $$;
rollback;
