"""Generador de huertos sintéticos con ground truth exacto.

Sirve para los tests deterministas y para el chequeo de robustez (ROADMAP §5.8):
no depende de tener imágenes reales para validar que el pipeline funciona.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SOIL_RGB = np.array([150.0, 132.0, 104.0])
CROWN_RGB = np.array([58.0, 112.0, 48.0])


def make_orchard(
    n_rows: int = 8,
    n_cols: int = 10,
    spacing: float = 62.0,
    crown_radius: float = 18.0,
    jitter: float = 6.0,
    pad: float = 55.0,
    shadows: bool = True,
    noise_sigma: float = 7.0,
    seed: int = 0,
) -> tuple[np.ndarray, pd.DataFrame]:
    """Devuelve (imagen RGB uint8, DataFrame GT con columnas x,y)."""
    rng = np.random.default_rng(seed)
    h = round(pad * 2 + (n_rows - 1) * spacing)
    w = round(pad * 2 + (n_cols - 1) * spacing)

    img = np.empty((h, w, 3), dtype=np.float32)
    img[:] = SOIL_RGB
    img += rng.normal(0, noise_sigma, img.shape)

    # Gradiente de iluminación suave (una esquina más clara que la opuesta).
    yy, xx = np.mgrid[0:h, 0:w]
    grad = 0.12 * ((xx / w) + (yy / h) - 1.0)
    img *= (1.0 + grad)[..., None]

    centers = []
    for i in range(n_rows):
        for j in range(n_cols):
            cy = pad + i * spacing + rng.uniform(-jitter, jitter)
            cx = pad + j * spacing + rng.uniform(-jitter, jitter)
            r = crown_radius * rng.uniform(0.82, 1.18)
            centers.append((cx, cy, r))

    if shadows:
        # Sombra corta, pegada a la copa (nadir cerca del mediodía).
        for cx, cy, r in centers:
            sy, sx = cy + r * 0.3, cx + r * 0.35
            shadow = ((yy - sy) ** 2 + (xx - sx) ** 2) <= (r * 0.8) ** 2
            img[shadow] *= 0.72

    for cx, cy, r in centers:
        disk = ((yy - cy) ** 2 + (xx - cx) ** 2) <= r**2
        tint = CROWN_RGB + rng.normal(0, 9, 3)
        img[disk] = tint

    img = np.clip(img, 0, 255).astype(np.uint8)
    gt = pd.DataFrame([(cx, cy) for cx, cy, _ in centers], columns=["x", "y"])
    return img, gt


def perturb(img: np.ndarray, kind: str, seed: int = 0) -> np.ndarray:
    """Variaciones para el chequeo de robustez."""
    rng = np.random.default_rng(seed)
    f = img.astype(np.float32)
    if kind == "bright+":
        f *= 1.2
    elif kind == "bright-":
        f *= 0.8
    elif kind == "noise":
        f += rng.normal(0, 15, f.shape)
    elif kind == "rot":
        return np.rot90(img).copy()
    else:
        raise ValueError(f"perturbación desconocida: {kind}")
    return np.clip(f, 0, 255).astype(np.uint8)
