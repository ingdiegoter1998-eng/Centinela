#!/usr/bin/env python3
"""Convierte nombres de artista en ids de Spotify, de a poquito y sin provocar un 429.

Uso (desde esta carpeta):   python3 resolver.py
Lee latinos.json ([[nombre, genero], ...]) y resueltos.json (lo ya resuelto), llama a la función
rockola-artista-id en lotes de 8, espera 1,5 s entre lotes y PARA al primer error (429 u otro).
Guarda el avance en resueltos.json después de cada lote: se puede cortar y repetir sin perder nada.
Los nombres que Spotify no devuelve con coincidencia exacta se anotan en no_encontrados.json y no se reintentan (se clasifican solos o a mano cuando alguien los pida).
Máximo 160 nombres por corrida: repite otro día/otra hora, no insistas.
Luego:  python3 generar_sql.py  y pegar artistas_catalogo_2.sql en el SQL Editor.
"""
import json, subprocess, time, sys
URL = 'https://xesmbhfgiosrhctjamru.supabase.co/functions/v1/rockola-artista-id'
LOTE, PAUSA, MAX_POR_CORRIDA = 8, 3.0, 160   # el 17-nov, ~850 consultas seguidas bastaron para un 429 de ~24 h
L = json.load(open('latinos.json', encoding='utf8'))
hechos = json.load(open('resueltos.json', encoding='utf8'))
vistos_id = {r['id'] for r in hechos}
vistos_nom = {r['nombre'].lower() for r in hechos}
import os
perdidos = set(json.load(open('no_encontrados.json', encoding='utf8'))) if os.path.exists('no_encontrados.json') else set()
pendientes = [(n, g) for n, g in L if n.lower() not in vistos_nom and n not in perdidos][:MAX_POR_CORRIDA]
print(f'{len(L)} en la lista, {len(hechos)} resueltos, {len(pendientes)} por intentar')
for i in range(0, len(pendientes), LOTE):
    lote = pendientes[i:i + LOTE]
    p = subprocess.run(['curl', '-sS', '-m', '60', '-X', 'POST', URL, '-H', 'Content-Type: application/json',
                        '-d', json.dumps({'nombres': [n for n, _ in lote]})], capture_output=True, text=True)
    try:
        d = json.loads(p.stdout)
    except Exception:
        sys.exit(f'Respuesta rara, paro: {p.stdout[:200]} {p.stderr[:200]}')
    if 'error' in d:
        for n, g in lote:   # lo que alcanzó a resolver antes del error
            r = (d.get('parcial') or {}).get(n)
            if r and r['id'] not in vistos_id:
                vistos_id.add(r['id']); hechos.append({'id': r['id'], 'nombre': r['nombre'], 'genero': g})
        json.dump(hechos, open('resueltos.json', 'w', encoding='utf8'), ensure_ascii=False)
        sys.exit(f'Paro por error (si es 429 espera lo que diga reintentar_en_s): {d}')
    for n, g in lote:
        r = d.get(n)
        if r and r['id'] not in vistos_id:
            vistos_id.add(r['id']); hechos.append({'id': r['id'], 'nombre': r['nombre'], 'genero': g})
        elif not r:
            perdidos.add(n)
    json.dump(sorted(perdidos), open('no_encontrados.json', 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(hechos, open('resueltos.json', 'w', encoding='utf8'), ensure_ascii=False)
    print(f'{min(i + LOTE, len(pendientes))}/{len(pendientes)}  resueltos={len(hechos)}')
    time.sleep(PAUSA)
print('Listo.')
