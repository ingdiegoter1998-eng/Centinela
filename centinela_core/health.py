"""Etapa II — banderas de estado por árbol.

Compara cada árbol contra la distribución del propio huerto y marca los que se
apartan **en sentido negativo**: más chicos, menos verdes, con más huecos, menos
sólidos. No diagnostica causa; señala dónde mirar (ROADMAP §6.1).

Dos decisiones de diseño que lo diferencian del clustering de la Etapa I:

1. **Mediana y MAD, no media y desviación.** Unos pocos árboles muy malos no deben
   arrastrar la referencia contra la que se compara al resto.
2. **Direccional, no simétrico.** DBSCAN marca "distinto" en cualquier dirección —
   correcto para separar árbol de sombra. Aquí un árbol *más* grande o *más* verde
   que la mediana no es un problema, y no se marca.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# 0.6745 = Φ⁻¹(0.75): pone el MAD en la misma escala que una desviación estándar
# para datos normales, de modo que el umbral se lee como "tantas sigmas".
_MAD_TO_SIGMA = 0.6745
# 1/1.2533: el mismo ajuste, para la desviación absoluta media.
_MEANAD_TO_SIGMA = 0.7979
# 1.349 = rango intercuartílico de una normal estándar.
_IQR_TO_SIGMA = 1.349

# métrica → (columna de origen, signo con el que "peor" se vuelve positivo)
METRICS: dict[str, tuple[str, float]] = {
    "area": ("area_px", -1.0),  # más chico es peor
    "vigor": ("__vigor__", -1.0),  # menos verde es peor
    "gap": ("gap_fraction", +1.0),  # más huecos es peor
    "solidity": ("solidity", -1.0),  # menos sólida es peor
}

Z_COLS = {
    "area": "z_area",
    "vigor": "z_vigor",
    "gap": "z_gap",
    "solidity": "z_solidity",
}


def robust_z(values: np.ndarray) -> np.ndarray:
    """z-score robusto respecto de la mediana, con escala en "sigmas".

    Escalera de estimadores de dispersión, de más robusto a menos:

    1. **MAD** — el que se usa siempre que haya dispersión real.
    2. **IQR** — cuando el MAD colapsa a cero. Pasa si más de la mitad de los
       árboles tienen exactamente el mismo valor: la mediana de las desviaciones
       es entonces 0 y la división queda degenerada, con el efecto de que *nadie*
       se marcaría nunca.
    3. **Desviación absoluta media** — último recurso; menos resistente a
       outliers, pero solo entra cuando los dos anteriores son cero.

    Si no hay ninguna dispersión (todos idénticos), devuelve ceros: no hay nada
    contra lo cual destacar.
    """
    x = np.asarray(values, dtype=float)
    if x.size == 0:
        return x

    median = np.median(x)
    deviations = np.abs(x - median)

    mad = np.median(deviations)
    if mad > 1e-12:
        return _MAD_TO_SIGMA * (x - median) / mad

    iqr = float(np.subtract(*np.percentile(x, [75, 25])))
    if iqr > 1e-12:
        return (x - median) / (iqr / _IQR_TO_SIGMA)

    mean_ad = float(deviations.mean())
    if mean_ad > 1e-12:
        return _MEANAD_TO_SIGMA * (x - median) / mean_ad

    return np.zeros_like(x)


def characterize(
    detections: pd.DataFrame,
    vigor_index: str = "vari",
    z_threshold: float = 2.5,
    metrics: list[str] | None = None,
    min_trees: int = 5,
) -> pd.DataFrame:
    """Añade `z_*`, `flag` y `motivo` al DataFrame de detecciones.

    Los estadísticos se calculan solo sobre los árboles del cultivo
    (`is_tree == True`); las manchas descartadas por DBSCAN salen sin bandera.
    """
    metrics = list(METRICS) if metrics is None else list(metrics)
    unknown = set(metrics) - set(METRICS)
    if unknown:
        raise ValueError(f"métricas desconocidas: {sorted(unknown)}")
    if vigor_index not in ("vari", "gli"):
        raise ValueError(f"vigor_index debe ser 'vari' o 'gli', no {vigor_index!r}")

    out = detections.copy()
    for col in Z_COLS.values():
        out[col] = np.nan
    out["flag"] = ""
    out["motivo"] = ""

    if len(out) == 0 or "is_tree" not in out.columns:
        return out

    trees = out.index[out["is_tree"].fillna(False).astype(bool)]
    if len(trees) == 0:
        return out

    out.loc[trees, "flag"] = "normal"
    if len(trees) < min_trees:
        # La mediana de tres árboles no dice nada: no se marca a nadie.
        return out

    reasons: dict[int, list[str]] = {i: [] for i in trees}

    for metric in metrics:
        source, sign = METRICS[metric]
        column = vigor_index if source == "__vigor__" else source
        if column not in out.columns:
            continue
        z_bad = sign * robust_z(out.loc[trees, column].to_numpy())
        out.loc[trees, Z_COLS[metric]] = z_bad
        for idx, z in zip(trees, z_bad, strict=True):
            if z > z_threshold:
                reasons[idx].append(metric)

    for idx, why in reasons.items():
        if why:
            out.loc[idx, "flag"] = "revisar"
            out.loc[idx, "motivo"] = ";".join(why)

    return out


def summary(detections: pd.DataFrame) -> dict:
    """Recuento rápido para imprimir en el CLI."""
    trees = detections[detections["is_tree"].fillna(False).astype(bool)]
    flagged = trees[trees["flag"] == "revisar"]
    motivos: dict[str, int] = {}
    for raw in flagged["motivo"]:
        for metric in str(raw).split(";"):
            if metric:
                motivos[metric] = motivos.get(metric, 0) + 1
    return {
        "n_trees": len(trees),
        "n_flagged": len(flagged),
        "pct_flagged": (len(flagged) / len(trees) * 100.0) if len(trees) else 0.0,
        "por_motivo": dict(sorted(motivos.items(), key=lambda kv: -kv[1])),
    }
