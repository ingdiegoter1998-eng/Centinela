"""Descriptores por mancha: tamaño, color medio, geometría y vigor.

Los siete primeros son sobre los que DBSCAN agrupa "manchas parecidas"
(ROADMAP §5.1). Los cuatro últimos — `vari`, `gli`, `gap_fraction`, `solidity` —
son los de la Etapa II: describen el *estado* de cada copa, no su identidad
(ROADMAP §6.5). Se calculan siempre porque son baratos, pero `cluster.py` tiene
su propia lista explícita y no los mira: el conteo de la Etapa I no cambia.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from skimage.color import rgb2lab
from skimage.measure import regionprops_table

from .vegetation import gli, vari

OUTPUT_COLS = [
    "label",
    "x_px",
    "y_px",
    "area_px",
    "color_l",
    "color_a",
    "color_b",
    "circularity",
    "eccentricity",
    "extent",
    # ── Etapa II ──
    "vari",
    "gli",
    "gap_fraction",
    "solidity",
]


def extract_features(
    labels: np.ndarray, rgb: np.ndarray, veg: np.ndarray | None = None
) -> pd.DataFrame:
    """Un registro por instancia (label > 0).

    `veg` es la máscara de vegetación **cruda**, antes de la morfología. Hace falta
    para medir huecos: `clean_mask()` ejecuta `binary_fill_holes`, así que para
    cuando llegamos al watershed los huecos de la copa ya están tapados. Si no se
    pasa, `gap_fraction` sale 0 (no hay con qué medirla).
    """
    if labels.max() == 0:
        return pd.DataFrame(columns=OUTPUT_COLS)

    lab = rgb2lab(rgb)
    veg_f = (
        np.ones(labels.shape, dtype=np.float32)
        if veg is None
        else veg.astype(np.float32)
    )
    # Un solo pase de regionprops sobre todos los canales que necesitamos promediar.
    stack = np.dstack(
        [lab, vari(rgb)[..., None], gli(rgb)[..., None], veg_f[..., None]]
    )

    props = regionprops_table(
        labels,
        intensity_image=stack,
        properties=(
            "label",
            "centroid",
            "area",
            "perimeter",
            "eccentricity",
            "extent",
            "solidity",
            "intensity_mean",
        ),
    )
    df = pd.DataFrame(props).rename(
        columns={
            "centroid-0": "y_px",
            "centroid-1": "x_px",
            "area": "area_px",
            "intensity_mean-0": "color_l",
            "intensity_mean-1": "color_a",
            "intensity_mean-2": "color_b",
            "intensity_mean-3": "vari",
            "intensity_mean-4": "gli",
        }
    )
    # La media de la máscara sobre la instancia es la fracción que sí es vegetación.
    df["gap_fraction"] = np.clip(1.0 - df["intensity_mean-5"].to_numpy(), 0.0, 1.0)

    perim = df["perimeter"].to_numpy()
    circ = 4.0 * np.pi * df["area_px"].to_numpy() / np.where(perim > 0, perim**2, np.inf)
    df["circularity"] = np.clip(circ, 0.0, 1.0)

    return df[OUTPUT_COLS].reset_index(drop=True)
