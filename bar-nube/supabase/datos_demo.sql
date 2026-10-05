-- Catálogo de ejemplo para probar el bar (precios y costos inventados). Se puede repetir sin duplicar.
-- Cámbialos desde la pantalla «Catálogo» de la app, o borra esto y carga los tuyos.

insert into categorias (nombre, orden) values
  ('Cervezas', 1), ('Licores', 2), ('Cócteles', 3), ('Sin alcohol', 4), ('Comida', 5)
on conflict (nombre) do nothing;

insert into productos (categoria_id, nombre, precio, costo, controla_stock, stock, stock_minimo)
select c.id, v.nombre, v.precio, v.costo, v.stock is not null, coalesce(v.stock, 0), v.minimo
from (values
  ('Cervezas',    'Águila',                6000,  3300, 48, 12),
  ('Cervezas',    'Club Colombia',         7000,  3900, 36, 12),
  ('Cervezas',    'Corona',                9000,  5200, 24,  6),
  ('Cervezas',    'Poker',                 5500,  3000, 48, 12),
  ('Licores',     'Aguardiente — trago',   4000,  1500, null, 0),
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
on conflict (categoria_id, nombre) do nothing;

insert into mesas (nombre, orden) values
  ('Barra', 0), ('Mesa 1', 1), ('Mesa 2', 2), ('Mesa 3', 3), ('Mesa 4', 4),
  ('Mesa 5', 5), ('Mesa 6', 6), ('Mesa 7', 7), ('Mesa 8', 8)
on conflict (nombre) do nothing;

insert into clientes (nombre)
select 'Carlos (cliente frecuente)' where not exists (select 1 from clientes where nombre = 'Carlos (cliente frecuente)');
