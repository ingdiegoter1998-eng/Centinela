-- Pruebas del panel de administración (admin.sql). Se corre después de rockola_puntos.sql y admin.sql. Todo se deshace.
\set QUIET on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000b3');
insert into perfiles (id, nombre, rol) values
  ('00000000-0000-0000-0000-0000000000a3', 'Diego', 'admin'), ('00000000-0000-0000-0000-0000000000b3', 'José Manuel', 'barman');

insert into rockola_personas (celular) values ('573001110000');
insert into rockola_puntos (celular, delta, motivo) values ('573001110000', 16, 'cortesia');
insert into rockola_cola (pista_id, titulo, artista, cliente, celular, costo_puntos, estado) values ('malo', 'Canción mala', 'Alguien', 'wa:573001110000', '573001110000', 8, 'pendiente');
insert into rockola_puntos (celular, delta, motivo, cola_id) select '573001110000', -8, 'pedido', id from rockola_cola where pista_id = 'malo';
insert into rockola_artistas (artista_id, nombre) values ('sin', 'Sin Género');
insert into rockola_cola (pista_id, titulo, artista, artista_id, cliente, estado) values ('s1', 'Una', 'Sin Género', 'sin', 'web:1', 'sonada');

-- ── barman: nada de reportes ni de lista negra, pero sí cobra y queda registrado ──
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true); end $$;
do $$
declare mesa bigint := (select id from mesas order by id limit 1); mesa2 bigint := (select id from mesas order by id offset 1 limit 1);
        prod bigint := (select id from productos where se_vende and controla_stock and insumo_id is null order by id limit 1); f bigint;
begin
  begin perform admin_serie(current_date - 7, current_date); assert false, 'barman ve el dashboard'; exception when others then assert sqlerrm = 'Solo el administrador.', sqlerrm; end;
  begin perform admin_detalle(current_date - 7, current_date); assert false, 'barman ve reportes'; exception when others then assert sqlerrm = 'Solo el administrador.', sqlerrm; end;
  begin perform admin_facturas(current_date - 7, current_date); assert false; exception when others then assert sqlerrm = 'Solo el administrador.', sqlerrm; end;
  begin perform admin_comision(current_date - 7, current_date); assert false; exception when others then assert sqlerrm = 'Solo el administrador.', sqlerrm; end;
  begin perform admin_rockola(current_date - 7, current_date); assert false; exception when others then assert sqlerrm = 'Solo el administrador.', sqlerrm; end;
  begin perform rockola_prohibir('spotify', 'x', 'X'); assert false, 'barman usa lista negra'; exception when others then assert sqlerrm = 'sin permiso', sqlerrm; end;
  begin perform rockola_genero_guardar('cumbia', 2); assert false; exception when others then assert sqlerrm = 'sin permiso', sqlerrm; end;
  begin perform 1 from comision_reglas; assert (select count(*) from comision_reglas) = 0, 'barman lee reglas'; end;

  perform agregar(mesa, prod, 2); f := cobrar(mesa, 'efectivo');
  assert (select cobrada_por from facturas where id = f) = '00000000-0000-0000-0000-0000000000b3', 'se registra quién cobró';
  perform agregar(mesa2, prod, 1); perform anular(mesa2);
  assert (select anulada_por from facturas where mesa_id = mesa2 and estado = 'anulada') = '00000000-0000-0000-0000-0000000000b3', 'se registra quién anuló';
end $$;

-- ── admin ──
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true); end $$;
do $$
declare s jsonb; d jsonb; r jsonb; hoy date := _jornada(now()); venta int;
begin
  assert hoy = ((now() at time zone 'America/Bogota') - interval '6 hours')::date, 'jornada de 6 AM';
  assert _jornada('2026-11-01 08:00:00+00'::timestamptz) = '2026-10-31', 'la madrugada (3 AM Bogotá) es de la noche anterior';
  assert _jornada('2026-11-01 11:30:00+00'::timestamptz) = '2026-11-01', 'después de las 6 AM ya es otra jornada';

  s := admin_serie(hoy - 20, hoy, 'dia');
  assert jsonb_array_length(s) = 21, 'una fila por día, también los vacíos';
  assert (s->20->>'n_facturas')::int = 1 and (s->20->>'venta')::int > 0, 'hoy tiene la factura';
  assert (s->20->>'ganancia')::int = (s->20->>'venta')::int - (s->20->>'costo')::int, 'ganancia = venta - costo';
  s := admin_serie(hoy - 40, hoy, 'semana');
  assert (select sum((x->>'n_facturas')::int) from jsonb_array_elements(s) x) = 1, 'la serie semanal suma lo mismo';
  assert (select count(*) from jsonb_array_elements(s) x where (x->>'periodo')::date <> date_trunc('week', (x->>'periodo')::timestamp)::date) = 0, 'semanas empiezan en lunes';
  s := admin_serie(hoy - 70, hoy, 'mes');
  assert (select sum((x->>'venta')::int) from jsonb_array_elements(s) x) = (select sum(l.cantidad * l.precio) from lineas l join facturas f on f.id = l.factura_id where f.estado = 'pagada'), 'la serie mensual suma toda la venta';
  begin perform admin_serie(hoy, hoy, 'año'); assert false; exception when others then assert sqlerrm = 'paso inválido', sqlerrm; end;

  d := admin_detalle(hoy, hoy);
  assert jsonb_array_length(d->'productos') = 1 and jsonb_array_length(d->'metodos') = 1, 'un producto, un método';
  assert d->'cajeros'->0->>'nombre' = 'José Manuel', 'el cajero sale por nombre';
  assert jsonb_array_length(d->'anuladas') = 1 and d->'anuladas'->0->>'por' = 'José Manuel', 'anulada con responsable';
  assert jsonb_array_length(admin_facturas(hoy, hoy)) = 2, 'facturas: la pagada y la anulada';

  -- comisión: regla temporal sobre la categoría del producto vendido
  insert into comision_reglas (categoria_id, pct, base) select categoria_id, 50, 'ganancia' from productos
   where id in (select producto_id from lineas limit 1) on conflict (categoria_id) do update set pct = 50, base = 'ganancia';
  venta := (select sum(l.cantidad * (l.precio - l.costo)) from lineas l join facturas f on f.id = l.factura_id where f.estado = 'pagada');
  r := admin_comision(hoy, hoy);
  assert (r->>'total')::int = round(venta * 0.5), 'comisión = 50 % de la ganancia';
  update comision_reglas set base = 'venta';
  r := admin_comision(hoy, hoy);
  assert (r->>'total')::int = round((select sum(l.cantidad * l.precio) from lineas l join facturas f on f.id = l.factura_id where f.estado = 'pagada') * 0.5), 'comisión sobre la venta';

  -- lista negra: prohibir saca la canción de la cola y devuelve puntos
  perform rockola_prohibir('spotify', 'malo', 'Canción mala', 'no va con el bar');
  assert (select estado from rockola_cola where pista_id = 'malo') = 'quitada', 'prohibir quita la pendiente';
  assert (select sum(delta) from rockola_puntos where celular = '573001110000') = 16, 'y devuelve los puntos';
  assert (select count(*) from rockola_prohibidas where pista_id = 'malo') = 1;
  perform rockola_perdonar('spotify', 'malo');
  assert (select count(*) from rockola_prohibidas where pista_id = 'malo') = 0, 'perdonar la saca de la lista';

  -- géneros
  perform rockola_genero_guardar('Cumbia', 1.5, 'media');
  assert (select multiplicador from rockola_generos where genero = 'cumbia') = 1.5, 'género normalizado en minúsculas';
  begin perform rockola_genero_guardar('x', 0); assert false; exception when others then assert sqlerrm like 'el multiplicador%', sqlerrm; end;
  begin perform rockola_genero_borrar('ranchera'); assert false; exception when others then assert sqlerrm like 'Ese género es de base%', sqlerrm; end;
  perform rockola_genero_borrar('cumbia');

  -- reporte de rockola y vistas
  r := admin_rockola(hoy - 6, hoy, 'dia');
  assert jsonb_array_length(r->'serie') = 7, 'serie de rockola por día';
  assert (select sum((x->>'sonadas')::int) from jsonb_array_elements(r->'serie') x) = 1, 'una sonada';
  assert r->'generos'->0->>'genero' = 'sin clasificar', 'sin género aparece como por clasificar';
  assert (select count(*) from v_rockola_por_clasificar where artista_id = 'sin') = 1, 'vista por clasificar';
  assert (select saldo from v_rockola_saldos where celular = '573001110000') = 16, 'saldo por persona';
end $$;
rollback;
