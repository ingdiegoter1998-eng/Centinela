#!/usr/bin/env python3
"""Genera ../artistas_catalogo_2.sql con los artistas de resueltos.json que aún no están en ../artistas_catalogo.sql.
Mismo formato y mismas reglas que artistas_catalogo.sql (no pisa lo que el personal clasificó a mano).
Los géneros que no existan en rockola_generos se saltan solos (generos.sql debe estar aplicado)."""
import json, re
ya = set(re.findall(r"\('([A-Za-z0-9]{22})'", open('../artistas_catalogo.sql', encoding='utf8').read()))
nuevos = [r for r in json.load(open('resueltos.json', encoding='utf8')) if r['id'] not in ya]
q = lambda s: "'" + s.replace("'", "''") + "'"
filas = ',\n'.join(f"  ({q(r['id'])}, {q(r['nombre'])}, {q(r['genero'])})" for r in nuevos)
sql = f"""-- Catálogo de artistas, parte 2 ({len(nuevos)} artistas). Idempotente. Requiere rockola_puntos.sql y generos.sql.
-- Generado por catalogo_artistas/generar_sql.py. No pisa lo que el personal clasificó a mano.
insert into rockola_artistas (proveedor, artista_id, nombre, genero, origen)
select 'spotify', v.id, v.nombre, v.genero, 'manual'
  from (values
{filas}
  ) as v(id, nombre, genero)
 where exists (select 1 from rockola_generos g where g.genero = v.genero)
on conflict (proveedor, artista_id) do update
  set nombre = excluded.nombre, genero = excluded.genero, origen = 'manual'
  where rockola_artistas.origen is distinct from 'manual' or rockola_artistas.genero is null;
""" if nuevos else '-- No hay artistas nuevos.\n'
open('../artistas_catalogo_2.sql', 'w', encoding='utf8').write(sql)
print(len(nuevos), 'artistas nuevos ->', '../artistas_catalogo_2.sql')
