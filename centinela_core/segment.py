"""Separación de copas por watershed sobre la transformada de distancia.

Es el remedio clásico para copas que se tocan (ROADMAP §5.5): la transformada de
distancia tiene un máximo por copa; el watershed corta por los valles entre ellos.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi
from skimage.feature import peak_local_max
from skimage.segmentation import watershed


def separate_crowns(
    mask: np.ndarray, min_distance_px: int = 15, footprint_px: int = 7
) -> np.ndarray:
    """Devuelve un mapa de etiquetas int: 0 = fondo, 1..N = instancias de copa."""
    mask = mask.astype(bool)
    if not mask.any():
        return np.zeros(mask.shape, dtype=np.int32)

    distance = ndi.distance_transform_edt(mask)
    footprint = np.ones((footprint_px, footprint_px), dtype=bool)
    coords = peak_local_max(
        distance,
        min_distance=min_distance_px,
        footprint=footprint,
        labels=mask,
        exclude_border=False,
    )
    if len(coords) == 0:
        # Sin picos claros: cada componente conexo es una instancia.
        labels, _ = ndi.label(mask)
        return labels.astype(np.int32)

    markers = np.zeros(distance.shape, dtype=np.int32)
    markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)
    labels = watershed(-distance, markers, mask=mask)
    return labels.astype(np.int32)
