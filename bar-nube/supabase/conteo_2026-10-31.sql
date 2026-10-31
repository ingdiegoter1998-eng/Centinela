-- Conteo del 31-oct-2026 (cervezas comerciales y bebidas). Se corre UNA vez, al abrir, antes de vender:
--   SUPABASE_ACCESS_TOKEN=... ./aplicar.sh --catalogo conteo_2026-10-31.sql
-- Fija las existencias a lo contado y guarda la diferencia como ajuste en movimientos (igual que hacer
-- «Conteo» en Inventario → Mover). Si ya se vendió algo después de contar, NO lo repitas: pisaría esas ventas.
-- Las artesanales no se tocan.

-- Redd's se vendía sin control de existencias: desde hoy se cuenta.
update productos set controla_stock = true, stock_minimo = greatest(stock_minimo, 2)
 where nombre = 'Redd''s' and not controla_stock;

select contar(p.id, v.cantidad, 'Conteo 31-oct-2026')
  from (values ('Poker', 18), ('Águila Light', 37), ('Club Colombia', 18), ('Soda', 8), ('Redd''s', 8)) as v(nombre, cantidad)
  join productos p on p.nombre = v.nombre
  join categorias c on c.id = p.categoria_id and c.nombre in ('Cervezas', 'Sin alcohol');
