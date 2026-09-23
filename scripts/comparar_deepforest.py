"""Compara el conteo por centros con DeepForest, un detector de copas preentrenado.

    pip install -e ".[modelo]"          # una vez: instala deepforest + PyTorch (~1 GB)
    python scripts/comparar_deepforest.py FOTO.jpg [--forma estrella] [--gt GT.csv]

DeepForest (weecology/deepforest-tree en Hugging Face, licencia MIT) es una RetinaNet
entrenada con copas de bosque de EE. UU. vistas a ~10 cm/px. No se entrenó con plátano,
así que aquí se usa sin reentrenar (*zero-shot*), como punto de comparación externo:
un método aprendido, independiente del nuestro.

Lo decisivo es la escala. Pasada tal cual, parte cada mata de plátano en pedazos; a la
escala correcta la encuentra entera (docs/resultados-centros.md §4). El script usa la
misma estimación de escala de `centros.py` para reducir la foto hasta que la distancia
entre plantas quede en ~40 px, que es donde DeepForest rinde.

Salidas junto a la foto: FOTO_deepforest.csv (cajas) y FOTO_comparacion.png.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from centinela_core.centros import detectar
from centinela_core.evaluate import evaluate
from centinela_core.io import load_ground_truth, load_image

SEPARACION_OBJETIVO = 40  # px entre plantas vecinas a la que DeepForest ve bien la copa


def deepforest(rgb: np.ndarray, escala: float, umbral: float = 0.2) -> pd.DataFrame:
    import contextlib
    import tempfile
    import warnings

    from deepforest import main

    warnings.filterwarnings("ignore")
    chica = cv2.resize(rgb, None, fx=escala, fy=escala, interpolation=cv2.INTER_AREA)
    # PyTorch Lightning deja carpetas version_N/ en el directorio actual: que sea uno temporal.
    with tempfile.TemporaryDirectory() as tmp, contextlib.chdir(tmp):
        modelo = main.deepforest()
        modelo.load_model("weecology/deepforest-tree")
        cajas = modelo.predict_tile(
            image=chica.astype(np.float32), patch_size=400, patch_overlap=0.25
        )
    if cajas is None or not len(cajas):
        return pd.DataFrame(columns=["x_px", "y_px", "score"])
    cajas = cajas[cajas["score"] >= umbral]
    return pd.DataFrame(
        {
            "x_px": (cajas["xmin"] + cajas["xmax"]) / 2 / escala,
            "y_px": (cajas["ymin"] + cajas["ymax"]) / 2 / escala,
            "score": cajas["score"],
        }
    ).reset_index(drop=True)


def coincidencias(a: np.ndarray, b: np.ndarray, radio: float) -> np.ndarray:
    """Pares (i, j) de puntos que marcan la misma planta: emparejamiento óptimo < radio."""
    if not len(a) or not len(b):
        return np.zeros((0, 2), int)
    d = cdist(a, b)
    costo = np.where(d < radio, d, 1e6)
    i, j = linear_sum_assignment(costo)
    ok = costo[i, j] < radio
    return np.c_[i[ok], j[ok]]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("imagen")
    p.add_argument("--forma", choices=["estrella", "copa"], default="estrella")
    p.add_argument("--tamano", type=float, default=None, help="distancia entre plantas en px")
    p.add_argument("--gt", default=None, help="CSV x,y de conteo manual")
    args = p.parse_args()

    rgb = load_image(args.imagen)
    cen = detectar(rgb, args.forma, args.tamano)
    if not cen.escala.px:
        sys.exit("La foto no tiene periodo claro: indica la distancia entre plantas con --tamano.")
    escala = min(1.0, SEPARACION_OBJETIVO / cen.escala.px)
    df = deepforest(rgb, escala)

    a = cen.detecciones[["x_px", "y_px"]].to_numpy()
    b = df[["x_px", "y_px"]].to_numpy()
    radio = 0.4 * cen.escala.px
    pares = coincidencias(a, b, radio)

    print(f"Escala estimada:   {cen.escala.px} px; DeepForest corre con la foto al {escala:.0%}")
    print(f"Centros:           {len(a)}  (entre {cen.rango[0]} y {cen.rango[1]})")
    print(f"DeepForest:        {len(b)}")
    print(f"Marcan la misma planta: {len(pares)}  · solo centros: {len(a) - len(pares)}"
          f"  · solo DeepForest: {len(b) - len(pares)}")
    if args.gt:
        gt = load_ground_truth(args.gt)
        for nombre, pts in (("centros", a), ("DeepForest", b)):
            r = evaluate(pts, gt, radio)
            print(f"{nombre:>11} vs GT: P {r.precision:.3f} · R {r.recall:.3f} · F1 {r.f1:.3f}")

    stem = Path(args.imagen).with_suffix("")
    df.to_csv(f"{stem}_deepforest.csv", index=False)
    out = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    solo_a = np.setdiff1d(np.arange(len(a)), pares[:, 0])
    solo_b = np.setdiff1d(np.arange(len(b)), pares[:, 1])
    for i, j in pares:
        cv2.circle(out, tuple(int(v) for v in (a[i] + b[j]) / 2), 6, (255, 255, 255), -1)
    for i in solo_a:
        cv2.circle(out, tuple(int(v) for v in a[i]), 9, (255, 0, 255), 3)
    for j in solo_b:
        cv2.circle(out, tuple(int(v) for v in b[j]), 9, (0, 200, 255), 3)
    cv2.imwrite(f"{stem}_comparacion.png", out)
    print(f"Salida: {stem}_deepforest.csv, {stem}_comparacion.png"
          "  (blanco: ambos · magenta: solo centros · naranja: solo DeepForest)")


if __name__ == "__main__":
    main()
