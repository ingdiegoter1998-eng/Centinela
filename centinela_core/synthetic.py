"""Generador de huertos sintéticos con ground truth exacto.

Sirve para los tests deterministas y para el chequeo de robustez (ROADMAP §5.8):
no depende de tener imágenes reales para validar que el pipeline funciona.

Con `n_anomalous > 0` inyecta árboles deteriorados de posición conocida, que es
lo que permite probar las banderas de la Etapa II (ROADMAP §6.8).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SOIL_RGB = np.array([150.0, 132.0, 104.0])
CROWN_RGB = np.array([58.0, 112.0, 48.0])
# Copa clorótica: sigue siendo vegetación (más oscura que el suelo) pero su verde
# está muy por debajo del resto del huerto.
PALE_CROWN_RGB = np.array([104.0, 114.0, 58.0])

# Un defecto por métrica de la Etapa II, para que el test las ejercite todas.
ANOMALY_KINDS = ("small", "pale", "gappy", "bitten")


def make_orchard(
    n_rows: int = 8,
    n_cols: int = 10,
    spacing: float = 62.0,
    crown_radius: float = 18.0,
    jitter: float = 6.0,
    pad: float = 55.0,
    shadows: bool = True,
    noise_sigma: float = 7.0,
    n_anomalous: int = 0,
    seed: int = 0,
) -> tuple[np.ndarray, pd.DataFrame]:
    """Devuelve (imagen RGB uint8, DataFrame GT con columnas x, y, anomalous, kind).

    `n_anomalous` inyecta esa cantidad de árboles deteriorados en posiciones
    aleatorias conocidas, rotando entre los cuatro tipos de `ANOMALY_KINDS`:

    - `small`   — copa a la mitad del radio     → dispara `area`
    - `pale`    — copa clorótica, poco verde    → dispara `vigor`
    - `gappy`   — huecos perforados en la copa  → dispara `gap`
    - `bitten`  — mordida en el borde (cóncava) → dispara `solidity`
    """
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
            centers.append([cx, cy, r, ""])

    # ── elegir y deformar los anómalos ────────────────────────────────────
    n_anomalous = min(n_anomalous, len(centers))
    if n_anomalous:
        chosen = rng.choice(len(centers), size=n_anomalous, replace=False)
        for pos, idx in enumerate(chosen):
            kind = ANOMALY_KINDS[pos % len(ANOMALY_KINDS)]
            centers[idx][3] = kind
            if kind == "small":
                centers[idx][2] *= 0.5

    if shadows:
        # Sombra corta, pegada a la copa (nadir cerca del mediodía).
        for cx, cy, r, _ in centers:
            sy, sx = cy + r * 0.3, cx + r * 0.35
            shadow = ((yy - sy) ** 2 + (xx - sx) ** 2) <= (r * 0.8) ** 2
            img[shadow] *= 0.72

    soil_here = img.copy()  # para "borrar" copa de vuelta a suelo en gappy/bitten

    for cx, cy, r, kind in centers:
        disk = ((yy - cy) ** 2 + (xx - cx) ** 2) <= r**2
        base = PALE_CROWN_RGB if kind == "pale" else CROWN_RGB
        img[disk] = base + rng.normal(0, 9, 3)

        if kind == "gappy":
            # Huecos de suelo visible a través de la copa. Sobreviven a la
            # morfología porque gap_fraction se mide contra la máscara cruda.
            for _ in range(3):
                ang = rng.uniform(0, 2 * np.pi)
                dist = rng.uniform(0.15, 0.45) * r
                hy, hx = cy + dist * np.sin(ang), cx + dist * np.cos(ang)
                hole = ((yy - hy) ** 2 + (xx - hx) ** 2) <= (r * 0.3) ** 2
                img[hole & disk] = soil_here[hole & disk]

        elif kind == "bitten":
            # Mordida en el borde: deja la instancia cóncava y baja la solidez.
            ang = rng.uniform(0, 2 * np.pi)
            by, bx = cy + r * 0.85 * np.sin(ang), cx + r * 0.85 * np.cos(ang)
            bite = ((yy - by) ** 2 + (xx - bx) ** 2) <= (r * 0.75) ** 2
            img[bite & disk] = soil_here[bite & disk]

    img = np.clip(img, 0, 255).astype(np.uint8)
    gt = pd.DataFrame(
        [(cx, cy, bool(kind), kind) for cx, cy, _, kind in centers],
        columns=["x", "y", "anomalous", "kind"],
    )
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
