"""¿El conteo depende de la estructura de los datos o del valor de `eps`?

Si existe de verdad una nube compacta "copas" separada del resto, el conteo de
DBSCAN se mantiene casi igual en un rango de `eps` (una meseta) mientras sigue
descartando algo. Si no existe, el conteo es una rampa: cada `eps` da un número
distinto y ninguno es defendible. Ver `docs/resultados-imagen-real.md` §5.4.

El veredicto tiene tres valores:

    "estable"         hay meseta: ≥ `min_puntos` valores consecutivos de eps con
                      el conteo dentro de ±`tol` y DBSCAN descartando algo
    "inestable"       DBSCAN descarta manchas, pero el conteo no se estabiliza
    "sin_estructura"  DBSCAN casi nunca descarta nada: o no forma cluster
                      (fallback) o lo agrupa todo. El conteo lo decide el
                      watershed, no el clustering.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .cluster import cluster_blobs

EPS_GRID = (0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0)


@dataclass
class Estabilidad:
    barrido: pd.DataFrame  # una fila por eps
    veredicto: str  # "estable" | "inestable" | "sin_estructura"
    meseta: tuple[float, float] | None  # rango de eps de la meseta, si la hay
    conteo_meseta: int | None

    def resumen(self) -> str:
        if self.veredicto == "estable":
            lo, hi = self.meseta
            return f"ESTABLE — meseta de {self.conteo_meseta} árboles para eps {lo}–{hi}"
        if self.veredicto == "inestable":
            b = self.barrido[self.barrido["informativo"]]
            return (
                f"INESTABLE — el conteo va de {int(b['arboles'].min())} a "
                f"{int(b['arboles'].max())} según eps; no hay meseta"
            )
        return "SIN ESTRUCTURA — DBSCAN no separa nada; el conteo lo decide el watershed"


def barrido_eps(
    detections: pd.DataFrame,
    eps_grid: tuple[float, ...] = EPS_GRID,
    min_samples: int = 6,
    dominant: str = "largest",
    features: list[str] | None = None,
) -> pd.DataFrame:
    """Conteo, descarte y camino de decisión para cada `eps` de la grilla."""
    n = len(detections)
    filas = []
    for eps in eps_grid:
        d = cluster_blobs(
            detections, eps=eps, min_samples=min_samples, dominant=dominant, features=features
        )
        arboles = int(d["is_tree"].sum()) if n else 0
        ids = d["cluster_id"].to_numpy() if n else np.array([], dtype=int)
        filas.append(
            {
                "eps": eps,
                "arboles": arboles,
                "descartadas_pct": 100.0 * (n - arboles) / n if n else 0.0,
                "ruido_pct": 100.0 * float((ids == -1).mean()) if n else 0.0,
                "clusters": len(np.unique(ids[ids >= 0])),
                "decision": d.attrs["decision"],
            }
        )
    return pd.DataFrame(filas)


def veredicto(
    barrido: pd.DataFrame,
    tol: float = 0.05,
    min_puntos: int = 3,
    min_descarte_pct: float = 5.0,
) -> Estabilidad:
    """Busca la meseta más larga entre los `eps` donde DBSCAN sí descarta algo."""
    b = barrido.copy()
    b["informativo"] = (b["decision"] == "dbscan") & (b["descartadas_pct"] >= min_descarte_pct)

    if int(b["informativo"].sum()) < min_puntos:
        return Estabilidad(b, "sin_estructura", None, None)

    mejor: tuple[int, int] | None = None
    filas = b.reset_index(drop=True)
    for i in range(len(filas)):
        if not filas.loc[i, "informativo"]:
            continue
        j = i
        while j + 1 < len(filas) and filas.loc[j + 1, "informativo"]:
            tramo = filas.loc[i : j + 1, "arboles"]
            if tramo.max() - tramo.min() > tol * tramo.median():
                break
            j += 1
        if j - i + 1 >= min_puntos and (mejor is None or j - i > mejor[1] - mejor[0]):
            mejor = (i, j)

    if mejor is None:
        return Estabilidad(b, "inestable", None, None)

    i, j = mejor
    conteo = round(filas.loc[i:j, "arboles"].median())
    return Estabilidad(b, "estable", (filas.loc[i, "eps"], filas.loc[j, "eps"]), conteo)


def estabilidad(
    detections: pd.DataFrame,
    eps_grid: tuple[float, ...] = EPS_GRID,
    min_samples: int = 6,
    dominant: str = "largest",
    features: list[str] | None = None,
) -> Estabilidad:
    return veredicto(barrido_eps(detections, eps_grid, min_samples, dominant, features))
