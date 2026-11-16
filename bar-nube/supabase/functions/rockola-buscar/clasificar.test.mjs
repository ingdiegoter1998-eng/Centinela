import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generoDeEtiqueta, elegirGenero, REGLAS } from './clasificar.mjs';

// Los géneros que existen salen de generos.sql: toda regla debe apuntar a uno (si no, la base rechazaría la clave foránea).
const sql = readFileSync(new URL('../../generos.sql', import.meta.url), 'utf8');
const MULT = Object.fromEntries([...sql.matchAll(/\('([^']+)',\s*([0-9.]+),/g)].map((m) => [m[1], Number(m[2])]));

test('todas las reglas apuntan a un género que existe en generos.sql', () => {
  assert.ok(Object.keys(MULT).length > 100);
  for (const [, g] of REGLAS) assert.ok(g in MULT, `género desconocido: ${g}`);
});

test('etiquetas típicas de Spotify', () => {
  const t = (e, g) => assert.equal(generoDeEtiqueta(e), g, e);
  t('vallenato', 'vallenato'); t('Música Popular Colombiana', 'popular colombiana'); t('ranchera', 'ranchera');
  t('colombian pop', 'pop colombiano'); t('latin pop', 'pop latino'); t('pop', 'pop'); t('dance pop', 'dance pop');
  t('reggaeton colombiano', 'reggaeton'); t('urbano latino', 'latin pop urbano'); t('trap latino', 'trap latino');
  t('salsa colombiana', 'salsa'); t('rock en español', 'rock en espanol'); t('classic rock', 'rock clasico');
  t('hard rock', 'hard rock'); t('pop rap', 'pop rap'); t('hip hop', 'hip hop'); t('r&b', 'r&b'); t('banda sonora', 'banda sonora');
  t('corridos tumbados', 'corridos tumbados'); t('norteño', 'norteno'); t('tango', 'tango'); t('banda', 'banda sinaloense');
  t('indie pop', 'indie pop'); t('k-pop', 'k-pop'); t('blues rock', 'blues rock'); t('folk rock', 'folk rock');
  assert.equal(generoDeEtiqueta('polka'), null);
});

test('un artista de cantina cobra cantina', () => {
  assert.equal(elegirGenero(['carrilera', 'despecho', 'musica popular colombiana'], MULT), 'carrilera');
  assert.equal(MULT[elegirGenero(['vallenato', 'vallenato moderno'], MULT)], 3);
});

test('una etiqueta suelta de cantina no encarece a un artista de pop; en empate gana el más caro', () => {
  const mon = ['chilean pop', 'pop', 'latin pop', 'latin alternative', 'ranchera'];
  assert.equal(MULT[elegirGenero(mon, MULT)], 1);
  assert.equal(MULT[elegirGenero(['latin pop', 'vallenato'], MULT)], 3);
});

test('sin etiquetas conocidas no hay género', () => {
  assert.equal(elegirGenero([], MULT), null);
  assert.equal(elegirGenero(['polka', 'zxqv'], MULT), null);
});
