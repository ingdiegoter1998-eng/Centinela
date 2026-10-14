"""Dibuja las zonas sobre una foto de la cámara y las guarda en zonas.yaml.

    python calibrar.py                  toma una foto de la cámara (datos en .env)
    python calibrar.py --imagen f.jpg   sobre una foto que ya tienes
    python calibrar.py --video v.mp4    sobre el primer cuadro de un video

En la ventana: clic para poner cada esquina de la zona, Enter para terminarla, U deshace el último punto,
S salta una zona opcional, Esc cancela. Las zonas, en orden:
    grifo   (obligatoria) recuadro pequeño y ajustado sobre la manija del grifo y donde va el vaso.
            Que no entre el paso de la gente ni una pantalla: cualquier movimiento ahí cuenta.
    barra   (opcional) donde se para el barman detrás de la barra → avisa si la barra queda sola.
    salon   (opcional) donde están los clientes → aforo.
barra y salon necesitan el detector de personas (pip install ultralytics).
Al final deja zonas.jpg con las zonas dibujadas para revisarlas.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from vigia import AQUI, cargar_env, url_camara

ZONAS = [('grifo', True), ('barra', False), ('salon', False)]
COLORES = {'grifo': (0, 200, 255), 'barra': (255, 160, 0), 'salon': (120, 220, 120)}


def foto(a):
    import cv2
    if a.imagen:
        img = cv2.imread(a.imagen)
    else:
        if a.video:
            fuente = a.video
        else:
            ajustes = yaml.safe_load((AQUI / 'camara.yaml').read_text(encoding='utf-8')) or {}
            fuente = url_camara(cargar_env(AQUI / '.env'), ajustes.get('camara', {}).get('flujo', 'stream2'))
        cap = cv2.VideoCapture(fuente)
        ok, img = False, None
        for _ in range(15):                    # los primeros cuadros de una cámara por red salen grises
            ok, img = cap.read()
        cap.release()
        if not ok:
            img = None
    if img is None:
        sys.exit('No pude sacar la foto. Revisa la cámara o la ruta del archivo.')
    return img


def pintar(img, zonas, actual, nombre):
    import cv2
    import numpy as np
    out = img.copy()
    alto, ancho = out.shape[:2]
    for n, pts in list(zonas.items()) + [(nombre, actual)]:
        if not pts:
            continue
        p = np.array([(int(x * ancho), int(y * alto)) for x, y in pts], np.int32)
        cv2.polylines(out, [p], n != nombre, COLORES[n], 2)
        for q in p:
            cv2.circle(out, tuple(int(v) for v in q), 4, COLORES[n], -1)
        cv2.putText(out, n, tuple(int(v) for v in p[0]), cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLORES[n], 2)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--imagen')
    ap.add_argument('--video')
    ap.add_argument('--salida', default=str(AQUI / 'zonas.yaml'))
    a = ap.parse_args()
    import cv2

    img = foto(a)
    alto, ancho = img.shape[:2]
    zonas, actual = {}, []
    ventana = 'Zonas del bar'
    cv2.namedWindow(ventana)
    cv2.setMouseCallback(ventana, lambda ev, x, y, *_: ev == cv2.EVENT_LBUTTONDOWN
                         and actual.append((round(x / ancho, 4), round(y / alto, 4))))
    for nombre, obligatoria in ZONAS:
        actual.clear()
        print(f'Zona «{nombre}»: clic en cada esquina, Enter para terminar'
              + ('' if obligatoria else ', S para saltarla') + '.')
        while True:
            cv2.imshow(ventana, pintar(img, zonas, actual, nombre))
            k = cv2.waitKey(30) & 0xFF
            if k in (13, 10) and len(actual) >= 3:
                zonas[nombre] = list(actual)
                break
            if k in (ord('u'), ord('U')) and actual:
                actual.pop()
            if k in (ord('s'), ord('S')) and not obligatoria:
                break
            if k == 27:
                sys.exit('Cancelado: no se guardó nada.')
    cv2.destroyAllWindows()

    Path(a.salida).write_text(
        '# Generado por calibrar.py: polígonos en coordenadas relativas (0 a 1) del cuadro.\n'
        + yaml.safe_dump({k: [list(p) for p in v] for k, v in zonas.items()}, default_flow_style=None),
        encoding='utf-8')
    actual.clear()
    cv2.imwrite(str(Path(a.salida).with_suffix('.jpg')), pintar(img, zonas, actual, ''))
    print(f'Guardado {a.salida} ({", ".join(zonas)}). Revisa zonas.jpg y prueba con: python vigia.py --ver --sin-envio')


if __name__ == '__main__':
    main()
