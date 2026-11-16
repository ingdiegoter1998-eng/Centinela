// Supabase corre `pg_safeupdate`: un UPDATE o DELETE sin WHERE falla en producción aunque la tabla tenga una sola fila.
// El Postgres desechable de probar.sh no lo tiene, así que esto lo vigila leyendo los .sql de la rockola.
//   node --test bar-nube/supabase/sin_where.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const ARCHIVOS = ['rockola.sql', 'rockola_puntos.sql', 'rockola_control.sql'];

// Quita comentarios (-- hasta el fin de línea) para no confundir texto con sentencias.
const sinComentarios = (sql) => sql.replace(/--[^\n]*/g, '');

for (const archivo of ARCHIVOS) {
  test(`${archivo}: todo UPDATE y DELETE lleva WHERE`, () => {
    const sql = sinComentarios(readFileSync(join(aqui, archivo), 'utf8'));
    // Cada sentencia DML se lee hasta su «;» o hasta el «$$» que cierra una función de una línea.
    const sentencias = [...sql.matchAll(/\b(update\s+\w+\s+set|delete\s+from\s+\w+)\b([^;$]*)/gi)];
    const sinWhere = sentencias.filter((m) => !/\bwhere\b/i.test(m[2])).map((m) => (m[1] + m[2]).replace(/\s+/g, ' ').trim().slice(0, 100));
    assert.deepEqual(sinWhere, [], `UPDATE/DELETE sin WHERE (pg_safeupdate los rechaza): ${sinWhere.join(' | ')}`);
  });
}
