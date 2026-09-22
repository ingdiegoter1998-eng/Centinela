"""Prueba de control del pipeline sobre el banco de imágenes reales.

Complementa `centinela count`: en vez del conteo por imagen, saca las métricas
intermedias que permiten atribuir un fallo a una etapa concreta del pipeline
(máscara, watershed o DBSCAN), y mide qué tan sensible es el conteo final al
parámetro `eps` del clustering.

    python scripts/control_banco.py                 # tabla sobre las 4 del USDA
    python scripts/control_banco.py --eps IMG.jpg   # barrido de eps sobre una imagen
    python scripts/control_banco.py IMG.jpg [IMG…]  # tabla sobre las imágenes dadas

Las métricas reportadas por imagen:

    masc%     fracción de la imagen que sobrevive a la máscara limpia
    vegcr%    ídem sobre la máscara cruda, antes de la morfología
    verde%    fracción de píxeles con verde dominante sobre rojo y azul
              (referencia independiente del pipeline: cuánta vegetación hay
              de verdad en la escena)
    manchas   instancias que entrega el watershed
    ruido%    porcentaje de esas manchas que DBSCAN descarta como ruido
    árboles   tamaño del cluster dominante — el conteo que publica `count`
"""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import numpy as np

from centinela_core.cluster import cluster_blobs
from centinela_core.config import Config
from centinela_core.features import extract_features
from centinela_core.pipeline import run

BANCO = Path("data/samples/banco")

# Las cuatro del USDA: árboles espaciados sobre suelo desnudo es la única
# condición real donde la premisa "verde sobre fondo no verde" podría cumplirse.
CONTROL = [
    BANCO / "huerto_hileras_usda.jpg",
    BANCO / "huerto_reticula_usda.jpg",
    BANCO / "huerto_surcos_usda.jpg",
    BANCO / "huerto_camino_usda.jpg",
]

EPS_BARRIDO = [0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0]


def verde_real(rgb: np.ndarray) -> float:
    """Fracción de píxeles con verde dominante sobre rojo y azul.

    Medida deliberadamente tosca y ajena al pipeline: sirve para contrastar
    contra la máscara y detectar cuándo Otsu está partiendo vegetación contra
    vegetación en vez de vegetación contra suelo.
    """
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return float(((g > r) & (g > b)).mean())


def tabla(imagenes: list[Path], cfg: Config) -> None:
    cab = (
        f"{'imagen':<28}{'px':>10}{'masc%':>8}{'vegcr%':>8}{'verde%':>8}"
        f"{'manchas':>9}{'ruido%':>8}{'árboles':>9}"
    )
    print(cab)
    print("-" * len(cab))

    for ruta in imagenes:
        res = run(ruta, cfg)
        h, w = res.rgb.shape[:2]
        n = len(res.detections)
        ruido = int((res.detections["cluster_id"] == -1).sum()) if n else 0
        print(
            f"{ruta.name:<28}{f'{w}x{h}':>10}"
            f"{100 * float(res.mask.mean()):>8.1f}"
            f"{100 * float(res.veg.mean()):>8.1f}"
            f"{100 * verde_real(res.rgb):>8.1f}"
            f"{n:>9}"
            f"{(100 * ruido / n if n else 0):>8.0f}"
            f"{res.n_trees:>9}"
        )


def barrido(imagen: Path, cfg: Config) -> None:
    """Conteo final en función de `eps`, reusando un solo pase del watershed."""
    res = run(imagen, cfg)
    feats = extract_features(res.labels, res.rgb, res.veg)
    print(f"{imagen.name} — {len(feats)} manchas del watershed")
    print()
    print(f"{'eps':>6}{'ruido%':>9}{'clusters':>10}{'árboles':>9}")
    print("-" * 34)
    for eps in EPS_BARRIDO:
        d = cluster_blobs(
            feats,
            eps=eps,
            min_samples=cfg.cluster.min_samples,
            dominant=cfg.cluster.dominant,
        )
        c = Counter(d["cluster_id"])
        ruido = c.get(-1, 0)
        n_cl = len([k for k in c if k >= 0])
        print(
            f"{eps:>6.1f}{100 * ruido / len(d):>9.0f}{n_cl:>10}"
            f"{int(d['is_tree'].sum()):>9}"
        )


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("imagenes", nargs="*", help="por defecto, las 4 del USDA")
    p.add_argument("--config", default=None)
    p.add_argument("--eps", action="store_true", help="barrido de eps (una sola imagen)")
    args = p.parse_args(argv)

    cfg = Config.load(args.config)
    imagenes = [Path(x) for x in args.imagenes] or CONTROL

    faltan = [x for x in imagenes if not x.exists()]
    if faltan:
        p.error("no existe: " + ", ".join(str(x) for x in faltan))

    if args.eps:
        if len(imagenes) != 1:
            p.error("--eps opera sobre una sola imagen")
        barrido(imagenes[0], cfg)
    else:
        tabla(imagenes, cfg)


if __name__ == "__main__":
    main()
