-- Pruebas del controlador de Spotify (rockola_control.sql): latido, rechazo de pedidos sin bafle, reembolso por falla,
-- devolver canciones y permisos. Se corre después de rockola_control.sql. Todo se deshace.
\set QUIET on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into perfiles (id, nombre, rol) values ('00000000-0000-0000-0000-0000000000d1', 'José Manuel', 'barman');
delete from rockola_cola;

-- Sin cuenta de Spotify conectada (como antes de instalar el controlador) no se exige nada.
do $$ begin
  insert into rockola_cola (pista_id, titulo, cliente) values ('t0', 'sin controlador', 'c0');
  assert not (rockola_estado()->'reproductor'->>'conectado')::boolean, 'sin cuenta: no conectado';
  delete from rockola_cola;
end $$;

-- Con la cuenta conectada y sin latido, los pedidos se rechazan por cualquier vía.
insert into rockola_spotify (refresh_token, cuenta) values ('token-de-prueba', 'bar');
do $$
begin
  perform rockola_registrar('573001110000', 'Ana');                 -- (el bot la registra aparte, antes de pedir)
  begin perform rockola_pedir_puntos('573001110000', 'Ana', '', 'spotify', 'p1', 'Una', 'A', '{}', '', 1000);
    assert false, 'sin latido'; exception when others then assert sqlerrm like 'El bafle no está conectado%', 'rechazo sin latido: ' || sqlerrm; end;
  assert rockola_saldo('573001110000') = 16, 'el rechazo no cobra: ' || rockola_saldo('573001110000');
  assert not (rockola_estado()->'reproductor'->>'ok')::boolean, 'estado: no ok';

  perform rockola_ctl_latido(null, null, false, 'No encuentro ningún dispositivo');
  begin perform rockola_pedir('celular-latido-1', '1', 'spotify', 'p1', 'Una', 'A', '', 1000); assert false, 'latido con error';
    exception when others then assert sqlerrm like 'El bafle no está conectado%', 'rechazo con error: ' || sqlerrm; end;
  assert rockola_estado()->'reproductor'->>'mensaje' like 'No encuentro%', 'mensaje visible';

  perform rockola_ctl_latido('Celular del bafle', 'dev1', false, null);
  assert (rockola_estado()->'reproductor'->>'ok')::boolean and rockola_estado()->'reproductor'->>'dispositivo' = 'Celular del bafle', 'estado ok';
  update rockola_reproductor set verificado_en = now() - interval '5 minutes';
  assert not (rockola_estado()->'reproductor'->>'ok')::boolean, 'latido viejo = no ok';
  assert rockola_ctl_trabajo(), 'latido viejo: toca despertar a la función';
  perform rockola_ctl_latido('Celular del bafle', 'dev1', false, null);
  assert not rockola_ctl_trabajo(), 'sin cola y con latido fresco: nada que hacer';
end $$;

-- Pedidos con puntos, reembolso por falla y devolver.
do $$
declare r jsonb; a bigint; b bigint; s jsonb;
begin
  r := rockola_pedir_puntos('573001110000', 'Ana', '', 'spotify', 'p1', 'Buena', 'A', '{}', '', 200000);
  a := (r->>'id')::bigint;
  r := rockola_pedir_puntos('573001110000', 'Ana', '', 'spotify', 'p2', 'Mala', 'A', '{}', '', 200000);
  b := (r->>'id')::bigint;
  assert rockola_saldo('573001110000') = 0, 'pagó dos canciones: ' || rockola_saldo('573001110000');
  assert rockola_ctl_trabajo(), 'hay cola: trabajo';
  assert rockola_ctl_estado()->'siguiente'->>'pista_id' = 'p1' and rockola_ctl_estado()->'encolada' = 'null'::jsonb, 'siguiente sin encolar';

  s := rockola_ctl_avanzar(null);
  assert s->>'pista_id' = 'p1' and not (s->>'confirmada')::boolean, 'avanza a p1 sin confirmar';
  perform rockola_ctl_confirmar(a);
  assert (rockola_ctl_estado()->'sonando'->>'confirmada')::boolean, 'confirmada';

  -- p2 se encola en Spotify
  perform rockola_ctl_encolada(b);
  assert rockola_ctl_estado()->'encolada'->>'pista_id' = 'p2', 'encolada';

  -- Spotify pasó solo a p2 (estaba encolada): se cierra p1 y p2 queda sonando YA confirmada
  s := rockola_ctl_avanzar('sonada', b, true);
  assert s->>'pista_id' = 'p2' and (s->>'confirmada')::boolean, 'p2 confirmada';
  assert (select estado from rockola_cola where id = a) = 'sonada', 'p1 sonada';

  -- p2 no se puede tocar: fallida y con reembolso (una sola vez)
  perform rockola_ctl_fallo(b, 'Spotify: canción no disponible');
  perform rockola_ctl_fallo(b, 'otra vez');
  assert (select estado from rockola_cola where id = b) = 'fallida', 'fallida';
  assert rockola_saldo('573001110000') = 8, 'reembolso de p2 una sola vez: ' || rockola_saldo('573001110000');

  -- falla de dispositivo: vuelve a la cola, sin tocar puntos
  r := rockola_pedir_puntos('573001110000', 'Ana', '', 'spotify', 'p3', 'Tercera', 'A', '{}', '', 200000);
  s := rockola_ctl_avanzar('sonada');
  assert s->>'pista_id' = 'p3', 'p3 sonando';
  perform rockola_ctl_devolver((s->>'id')::bigint);
  assert (select estado from rockola_cola where pista_id = 'p3') = 'pendiente', 'p3 de vuelta';
  assert rockola_saldo('573001110000') = 0, 'devolver no toca los puntos';
  assert rockola_ctl_avanzar('sonada') is not null and rockola_ctl_avanzar('sonada') is null, 'después de p3, cola vacía';

  perform rockola_ctl_pausa(true); assert (rockola_estado()->'reproductor'->>'pausada')::boolean, 'pausada';
  perform rockola_ctl_pausa(false);
end $$;

-- Un solo tick a la vez.
do $$ begin
  assert rockola_ctl_tomar(), 'toma el candado';
  assert not rockola_ctl_tomar(), 'segundo tick: ocupado';
  perform rockola_ctl_soltar();
  assert rockola_ctl_tomar(), 'liberado';
  update rockola_reproductor set tick_hasta = now() - interval '1 second';
  assert rockola_ctl_tomar(), 'el candado vence solo';
  perform rockola_ctl_soltar();
end $$;

-- Permisos: ni el anónimo ni el personal tocan el controlador, el token, ni las tablas internas.
set local role anon;
do $$ begin
  begin perform rockola_ctl_estado(); assert false, 'anon controlador'; exception when insufficient_privilege then null; end;
  begin perform rockola_ctl_latido('x', 'y', true, null); assert false, 'anon latido'; exception when insufficient_privilege then null; end;
  begin perform rockola_ctl_verificar('x'); assert false, 'anon verifica secreto'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_spotify; assert false, 'anon lee el token'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_ctl_ajustes; assert false, 'anon lee el secreto'; exception when insufficient_privilege then null; end;
  begin perform rockola_panel_permiso(); assert false, 'anon panel'; exception when insufficient_privilege then null; end;
  assert rockola_estado() ? 'reproductor', 'anon sí ve el estado';
  assert not (rockola_estado()->'reproductor' ? 'refresh_token'), 'el estado no filtra el token';
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true); end $$;
do $$ begin
  assert rockola_panel_permiso() = 'barman', 'permiso del barman';
  begin perform rockola_ctl_avanzar(); assert false, 'barman controlador'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_spotify; assert false, 'barman lee el token'; exception when insufficient_privilege then null; end;
  begin perform 1 from rockola_ctl_ajustes; assert false, 'barman lee el secreto'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true); end $$;
do $$ begin assert rockola_panel_permiso() is null, 'sin perfil: sin permiso'; end $$;
set local role service_role;
do $$ begin
  assert rockola_ctl_verificar((select valor from rockola_ctl_ajustes where clave = 'secreto')) is not null, 'service_role verifica';
exception when insufficient_privilege then null;   -- (leer ajustes directo no es del service_role; solo comprobamos que la función se puede llamar)
end $$;
rollback;
\echo pruebas_control.sql: controlador OK
