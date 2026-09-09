"""DBSCAN sobre los descriptores: separa las copas del cultivo de todo lo demás.

El cluster dominante (más numeroso) se toma como "los árboles del cultivo". El
resto — ruido de DBSCAN y clusters minoritarios — son sombras, maleza y suelo.
Esto es lo que cumple el §5.1: agrupar por similitud, sin modelo entrenado.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

FEATURE_COLS = [
    "area_px",
    "color_l",
    "color_a",
    "color_b",
    "circularity",
    "eccentricity",
    "extent",
]


def cluster_blobs(
    df: pd.DataFrame, eps: float = 0.8, min_samples: int = 6, dominant: str = "largest"
) -> pd.DataFrame:
    """Añade columnas `cluster_id` (int, -1 = ruido) e `is_tree` (bool)."""
    out = df.copy()
    if len(out) == 0:
        out["cluster_id"] = pd.Series(dtype=int)
        out["is_tree"] = pd.Series(dtype=bool)
        return out

    x = StandardScaler().fit_transform(out[FEATURE_COLS].to_numpy(dtype=float))
    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(x)
    out["cluster_id"] = labels

    valid = labels[labels >= 0]
    if valid.size == 0:
        # DBSCAN no formó ningún cluster: se degrada a "toda mancha cuenta".
        out["is_tree"] = True
        return out

    if dominant == "densest":
        best, best_score = None, -np.inf
        for cid in np.unique(valid):
            members = x[labels == cid]
            spread = np.linalg.norm(members - members.mean(axis=0), axis=1).mean()
            score = len(members) / (spread + 1e-6)
            if score > best_score:
                best, best_score = cid, score
        dom = best
    else:  # "largest"
        counts = np.bincount(valid)
        dom = int(counts.argmax())

    out["is_tree"] = out["cluster_id"] == dom
    return out
