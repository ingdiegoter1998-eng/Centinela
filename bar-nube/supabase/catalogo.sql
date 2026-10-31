-- Catálogo REAL del bar (precios, costos y existencias que dio el dueño). Se puede repetir sin riesgo:
-- ajusta precios y costos, pero NO toca las existencias de lo que ya existe (esas se cambian desde
-- Inventario, solo el super administrador). La ganancia no se guarda: la app la calcula como venta − costo.

insert into categorias (nombre, orden) values
  ('Cervezas', 1), ('Cervezas artesanales', 1), ('Combos', 2), ('Sin alcohol', 4), ('Comida', 5), ('Cigarrillos', 6)
on conflict (nombre) do nothing;

-- «Águila» pasa a llamarse «Águila Light».
update productos set nombre = 'Águila Light'
 where nombre = 'Águila' and categoria_id = (select id from categorias where nombre = 'Cervezas')
   and not exists (select 1 from productos where nombre = 'Águila Light');

-- «Gaseosa» pasa a llamarse «Soda» (se conserva su historial de ventas).
update productos set nombre = 'Soda'
 where nombre = 'Gaseosa' and categoria_id = (select id from categorias where nombre = 'Sin alcohol')
   and not exists (select 1 from productos where nombre = 'Soda');

-- Lo que no existe o todavía no hay en el bar no va en la app (cócteles, tragos, jugo, botellas de licor): se quita si existía.
delete from productos p
 where p.nombre in ('Aguardiente — trago', 'Whisky — trago', 'Mojito', 'Michelada', 'Piña colada', 'Jugo natural',
                    'Papas fritas', 'Nachos', 'Empanadas (3)', 'Aguardiente — botella', 'Ron — botella', 'Agua')
   and not exists (select 1 from lineas l where l.producto_id = p.id)
   and not exists (select 1 from movimientos m where m.producto_id = p.id);
delete from categorias c
 where c.nombre in ('Cócteles', 'Licores') and not exists (select 1 from productos where categoria_id = c.id);

-- Productos con costo y precio dados. Existencias: solo se usan si el producto es nuevo.
insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo)
select c.id, v.nombre, v.precio, v.costo, v.stock is not null, coalesce(v.stock, 0), v.minimo
from (values
  ('Cervezas',    'Águila Light',           3500,  2400, 37, 12),   -- 2026-10-31: baja a 3.500 (igual que Poker)
  ('Cervezas',    'Club Colombia',          4000,  3200, 18, 12),   -- 2026-10-31: baja a 4.000
  ('Cervezas',    'Corona',                 5000,  3000, 24,  6),
  ('Cervezas',    'Poker',                  3500,  2400, 18, 12),   -- 2026-10-31: 3.500
  ('Cervezas',    'Redd''s',                5000,  2500, null, 0),   -- sin control de existencias por ahora
  ('Sin alcohol', 'Soda',                   4000,  1800,  5,  2),
  ('Comida',      'Maní',                   2800,  1275, 95, 10),   -- 100 comprados, ~95 en existencia
  ('Cigarrillos', 'Mata Cuchos',            1000,   250,  0,  0)    -- existencias: cargarlas con Inventario → Mover
) as v(categoria, nombre, precio, costo, stock, minimo)
join categorias c on c.nombre = v.categoria
on conflict (categoria_id, nombre) do update set precio = excluded.precio, costo = excluded.costo;

-- Maní ya controla existencias (antes se vendía sin control).
update productos set controla_stock = true where nombre = 'Maní' and not controla_stock;

insert into mesas (nombre, orden) values ('Mesa afuera', 9) on conflict (nombre) do nothing;

-- Cerveza artesanal. El costo no se conoce todavía: queda en 0 hasta que el administrador lo ponga
-- (Catálogo → producto), y mientras tanto la ganancia aparece igual al precio.
insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo, unidad, se_vende)
select c.id, v.nombre, v.precio, 0, true, v.stock, 0, v.unidad, v.se_vende
from (values
  ('Jirafa Red Ale',                       60000, 50,    'unid', true),
  -- Recipiente de la negra: se cuenta en mililitros (10 litros) y se muestra en litros. No se vende solo.
  ('Cerveza artesanal negra (litros)',         0, 10000, 'ml',   false),
  ('Pinta negra 490 ml',                   20000, 0,     'unid', true),
  ('Vaso negra 330 ml',                    15000, 0,     'unid', true)
) as v(nombre, precio, stock, unidad, se_vende)
join categorias c on c.nombre = 'Cervezas artesanales'
on conflict (categoria_id, nombre) do update set precio = excluded.precio;

-- La pinta y el vaso descuentan del mismo recipiente: 490 ml y 330 ml por unidad.
update productos p set insumo_id = r.id, consumo = v.consumo
from (values ('Pinta negra 490 ml', 490), ('Vaso negra 330 ml', 330)) as v(nombre, consumo),
     productos r
where p.nombre = v.nombre and r.nombre = 'Cerveza artesanal negra (litros)'
  and (p.insumo_id is distinct from r.id or p.consumo <> v.consumo);

-- ── Cigarrillos y combos (2026-10-31) ─────────────────────────────────────────────────────────
-- Lucky Strike ya se vendía: si existe (con cualquier categoría) no se toca su precio; si no, se crea a 1.500.
insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo)
select c.id, 'Lucky Strike', 1500, 0, true, 0, 0 from categorias c
 where c.nombre = 'Cigarrillos' and not exists (select 1 from productos where nombre ilike 'lucky%');
-- Lucky Strike NO aplica para ningún combo ni promoción: la base rechaza meterlo en uno.
delete from combo_componentes where producto_id in (select id from productos where nombre ilike 'lucky%');
update productos set en_promos = false where nombre ilike 'lucky%' and en_promos;

-- Combo Poker + Mata Cuchos a 3.800 (Poker 3.500 + cigarrillo 300). Descuenta 1 Poker y 1 Mata Cuchos;
-- su costo se calcula al vender con los costos vigentes de ambos (hoy 2.400 + 250).
insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo)
select c.id, 'Combo Poker + Mata Cuchos', 3800, 2650, false, 0, 0 from categorias c where c.nombre = 'Combos'
on conflict (categoria_id, nombre) do update set precio = excluded.precio, costo = excluded.costo;
insert into combo_componentes (combo_id, producto_id, cantidad)
select combo.id, p.id, 1
  from productos combo, productos p
  join categorias c on c.id = p.categoria_id
 where combo.nombre = 'Combo Poker + Mata Cuchos'
   and ((p.nombre = 'Poker' and c.nombre = 'Cervezas') or (p.nombre = 'Mata Cuchos' and c.nombre = 'Cigarrillos'))
on conflict do nothing;
