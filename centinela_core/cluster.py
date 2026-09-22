"""DBSCAN sobre los descriptores: separa las copas del cultivo de todo lo demás.

El cluster dominante (más numeroso) se toma como "los árboles del cultivo". El
resto — ruido de DBSCAN y clusters minoritarios — son sombras, maleza y suelo.
Esto es lo que cumple el §5.1: agrupar por similitud, sin modelo entrenado.

Quién decide el conteo queda registrado en `df.attrs["decision"]`:

    "dbscan"     DBSCAN formó al menos un cluster y el dominante es el conteo
    "fallback"   DBSCAN no formó ninguno: toda mancha del watershed cuenta
    "watershed"  método "watershed": no se agrupa, toda mancha cuenta

La distinción importa. En el huerto sintético, con la config por defecto, DBSCAN
cae siempre en "fallback": el conteo lo produce el watershed solo. Ver
`docs/resultados-imagen-real.md` §5.6.
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
# Solo geometría. Separa copa de maleza cuando difieren en forma, pero sobre una
# escena sin distractores fragmenta las copas: ver resultados-imagen-real.md §5.7.
SHAPE_COLS = ["area_px", "circularity", "eccentricity", "extent"]

METHODS = ("dbscan", "watershed")


def cluster_blobs(
    df: pd.DataFrame,
    eps: float = 0.8,
    min_samples: int = 6,
    dominant: str = "largest",
    method: str = "dbscan",
    features: list[str] | None = None,
) -> pd.DataFrame:
    """Añade columnas `cluster_id` (int, -1 = ruido) e `is_tree` (bool).

    `method="watershed"` no agrupa: cada mancha que sobrevivió a la morfología
    (`morphology.min_area_px`) cuenta como árbol, con `cluster_id = 0`. El
    criterio de descarte queda en un parámetro con unidades físicas en vez de
    escondido en `eps`.

    `features` elige los descriptores sobre los que agrupa DBSCAN (por defecto
    `FEATURE_COLS`). Se estandarizan con la varianza de la propia imagen, así que
    un mismo `eps` no significa lo mismo en dos escenas distintas.
    """
    if method not in METHODS:
        raise ValueError(f"method debe ser uno de {METHODS}, no {method!r}")

    out = df.copy()
    if len(out) == 0:
        out["cluster_id"] = pd.Series(dtype=int)
        out["is_tree"] = pd.Series(dtype=bool)
        out.attrs["decision"] = method if method == "watershed" else "fallback"
        return out

    if method == "watershed":
        out["cluster_id"] = 0
        out["is_tree"] = True
        out.attrs["decision"] = "watershed"
        return out

    cols = list(features or FEATURE_COLS)
    faltan = [c for c in cols if c not in out.columns]
    if faltan:
        raise ValueError(f"descriptores inexistentes: {faltan}")
    x = StandardScaler().fit_transform(out[cols].to_numpy(dtype=float))
    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(x)
    out["cluster_id"] = labels

    valid = labels[labels >= 0]
    if valid.size == 0:
        # DBSCAN no formó ningún cluster: se degrada a "toda mancha cuenta".
        out["is_tree"] = True
        out.attrs["decision"] = "fallback"
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
    out.attrs["decision"] = "dbscan"
    return out
