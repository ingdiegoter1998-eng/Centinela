-- Catálogo REAL del bar (precios, costos y existencias que dio el dueño). Se puede repetir sin riesgo:
-- ajusta precios y costos, pero NO toca las existencias de lo que ya existe (esas se cambian desde
-- Inventario, solo el super administrador). La ganancia no se guarda: la app la calcula como venta − costo.

insert into categorias (nombre, orden) values
  ('Cervezas', 1), ('Cervezas artesanales', 1), ('Licores', 2), ('Cócteles', 3), ('Sin alcohol', 4), ('Comida', 5)
on conflict (nombre) do nothing;

-- «Águila» pasa a llamarse «Águila Light».
update productos set nombre = 'Águila Light'
 where nombre = 'Águila' and categoria_id = (select id from categorias where nombre = 'Cervezas')
   and not exists (select 1 from productos where nombre = 'Águila Light');

-- Productos con costo y precio dados. Existencias: solo se usan si el producto es nuevo.
insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo)
select c.id, v.nombre, v.precio, v.costo, v.stock is not null, coalesce(v.stock, 0), v.minimo
from (values
  ('Cervezas',    'Águila Light',           5000,  2400, 48, 12),   -- 48: cantidad aproximada, ajustar con un conteo
  ('Cervezas',    'Club Colombia',          6000,  3200, 36, 12),
  ('Cervezas',    'Corona',                 5000,  3000, 24,  6),
  ('Cervezas',    'Poker',                  5000,  2400, 48, 12),
  ('Licores',     'Aguardiente — trago',    4000,  1500, null, 0),
  ('Licores',     'Aguardiente — botella', 65000, 38000, 10, 3),
  ('Licores',     'Ron — botella',         85000, 52000,  8, 2),
  ('Licores',     'Whisky — trago',        12000,  5000, null, 0),
  ('Cócteles',    'Mojito',                18000,  6500, null, 0),
  ('Cócteles',    'Michelada',             12000,  4500, null, 0),
  ('Cócteles',    'Piña colada',           20000,  7000, null, 0),
  ('Sin alcohol', 'Gaseosa',                4000,  1800, 30, 10),
  ('Sin alcohol', 'Agua',                   3000,  1000, 40, 10),
  ('Sin alcohol', 'Jugo natural',           7000,  2500, null, 0),
  ('Comida',      'Papas fritas',          10000,  3500, null, 0),
  ('Comida',      'Nachos',                16000,  6000, null, 0),
  ('Comida',      'Empanadas (3)',          9000,  3000, null, 0)
) as v(categoria, nombre, precio, costo, stock, minimo)
join categorias c on c.nombre = v.categoria
on conflict (categoria_id, nombre) do update set precio = excluded.precio, costo = excluded.costo;

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
