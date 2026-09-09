"""Descriptores por mancha: tamaño, color medio y geometría.

Son las variables sobre las que DBSCAN agrupa "manchas parecidas" (ROADMAP §5.1).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from skimage.color import rgb2lab
from skimage.measure import regionprops_table

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
]


def extract_features(labels: np.ndarray, rgb: np.ndarray) -> pd.DataFrame:
    """Un registro por instancia (label > 0)."""
    if labels.max() == 0:
        return pd.DataFrame(columns=OUTPUT_COLS)

    lab = rgb2lab(rgb)
    props = regionprops_table(
        labels,
        intensity_image=lab,
        properties=(
            "label",
            "centroid",
            "area",
            "perimeter",
            "eccentricity",
            "extent",
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
        }
    )
    perim = df["perimeter"].to_numpy()
    circ = 4.0 * np.pi * df["area_px"].to_numpy() / np.where(perim > 0, perim**2, np.inf)
    df["circularity"] = np.clip(circ, 0.0, 1.0)
    return df[OUTPUT_COLS].reset_index(drop=True)
