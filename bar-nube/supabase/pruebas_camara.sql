-- Pruebas de la cámara: el rol «camara» solo registra eventos, el barman no ve nada de la cámara y el
-- administrador ve la cámara contra las ventas. Se corre después de catalogo.sql. Todo se deshace.
\set QUIET on

begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
                                   ('00000000-0000-0000-0000-00000000000d');
insert into perfiles (id, nombre, rol) values
  ('00000000-0000-0000-0000-00000000000a', 'Diego', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'José Manuel', 'barman'),
  ('00000000-0000-0000-0000-00000000000d', 'Cámara', 'camara');

set local role authenticated;

-- cámara: registra eventos y nada más
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true); end $$;
do $$ declare n int;
begin
  n := registrar_eventos(jsonb_build_array(
    jsonb_build_object('origen', 's1', 'tipo', 'sacada', 'inicio', now() - interval '20 min', 'fin', now() - interval '20 min' + interval '8 s'),
    jsonb_build_object('origen', 's2', 'tipo', 'sacada', 'inicio', now() - interval '15 min', 'fin', now() - interval '15 min' + interval '6 s'),
    jsonb_build_object('origen', 's3', 'tipo', 'sacada', 'inicio', now() - interval '10 min'),
    jsonb_build_object('origen', 's4', 'tipo', 'sacada', 'inicio', now() - interval '5 min', 'nota', 'larga: revisar la foto'),
    jsonb_build_object('origen', 'a1', 'tipo', 'aforo', 'inicio', now() - interval '10 min', 'fin', now() - interval '5 min', 'personas', 12),
    jsonb_build_object('origen', 'a2', 'tipo', 'aforo', 'inicio', now() - interval '5 min', 'fin', now(), 'personas', 20),
    jsonb_build_object('origen', 'b1', 'tipo', 'barra_sola', 'inicio', now() - interval '40 min', 'fin', now() - interval '25 min'),
    jsonb_build_object('origen', 'l1', 'tipo', 'latido', 'inicio', now())));
  assert n = 8, format('8 eventos nuevos, fueron %s', n);
  n := registrar_eventos(jsonb_build_array(jsonb_build_object('origen', 's1', 'tipo', 'sacada', 'inicio', now())));
  assert n = 0, 'reenviar el mismo evento no lo duplica';
  assert (select count(*) from productos) = 0, 'la cámara no ve productos';
  assert (select count(*) from eventos_camara) = 0, 'la cámara no lee sus eventos';
  begin perform agregar((select id from mesas limit 1), (select id from productos limit 1)); assert false, 'la cámara no vende';
  exception when raise_exception then null; end;
  begin perform resumen_camara(jornada_actual(6)); assert false, 'la cámara no ve el resumen';
  exception when raise_exception then assert sqlerrm like 'Solo el administrador%', sqlerrm; end;
  begin perform registrar_eventos('{"tipo": "sacada"}'); assert false, 'pide una lista';
  exception when raise_exception then null; end;
end $$;

-- barman: vende (2 pintas + 1 vaso cobrados, 1 pinta anulada) pero no ve ni manda nada de la cámara
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); end $$;
do $$ declare m1 bigint := (select id from mesas where nombre = 'Mesa 1'); m2 bigint := (select id from mesas where nombre = 'Mesa 2');
begin
  perform agregar(m1, (select id from productos where nombre = 'Pinta negra 490 ml'), 2);
  perform agregar(m1, (select id from productos where nombre = 'Vaso negra 330 ml'));
  perform agregar(m1, (select id from productos where nombre = 'Poker'));         -- no es de barril: no cuenta
  perform cobrar(m1, 'efectivo');
  perform agregar(m2, (select id from productos where nombre = 'Pinta negra 490 ml'));
  perform anular(m2);
  assert (select count(*) from eventos_camara) = 0, 'el barman no ve los eventos';
  begin perform resumen_camara(jornada_actual(6)); assert false, 'el barman no ve la cámara';
  exception when raise_exception then assert sqlerrm like 'Solo el administrador%', sqlerrm; end;
  begin perform registrar_eventos('[]'); assert false, 'el barman no manda eventos';
  exception when raise_exception then assert sqlerrm like 'Solo el programa%', sqlerrm; end;
end $$;

-- admin: cámara contra ventas
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); end $$;
do $$ declare r jsonb := resumen_camara(jornada_actual(6));
begin
  assert (r->>'sacadas')::int = 4, format('sacadas: %s', r->>'sacadas');
  assert (r->>'vendidas')::int = 3, format('vendidas (2 pintas + 1 vaso): %s', r->>'vendidas');
  assert (r->>'anuladas')::int = 1, format('anuladas: %s', r->>'anuladas');
  assert (r->>'aforo_max')::int = 20, format('aforo: %s', r->>'aforo_max');
  assert r->>'ultima_senal' is not null, 'última señal';
  assert jsonb_array_length(r->'alertas') = 2, format('alertas (barra sola + sacada larga): %s', r->'alertas');
  assert (select sum((x->>'sacadas')::int) from jsonb_array_elements(r->'por_hora') x) = 4, 'sacadas por hora suman';
  assert (select sum((x->>'vendidas')::int) from jsonb_array_elements(r->'por_hora') x) = 3, 'vendidas por hora suman';
  assert (select count(*) from eventos_camara) = 8, 'el admin ve los eventos';
  assert (resumen_camara(jornada_actual(6) - 1)->>'sacadas')::int = 0, 'la jornada anterior está vacía';
end $$;
rollback;

\echo 'pruebas_camara.sql: cámara OK'
