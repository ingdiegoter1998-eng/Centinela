"""Limpieza morfológica de la máscara de vegetación."""

from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi
from skimage import morphology


def clean_mask(
    mask: np.ndarray,
    open_radius: int = 3,
    close_radius: int = 5,
    min_area_px: int = 80,
    fill_holes: bool = True,
) -> np.ndarray:
    """Apertura → cierre → relleno de huecos → descarte de componentes pequeños."""
    m = mask.astype(bool)
    if open_radius > 0:
        m = morphology.opening(m, morphology.disk(open_radius))
    if close_radius > 0:
        m = morphology.closing(m, morphology.disk(close_radius))
    if fill_holes:
        m = ndi.binary_fill_holes(m)
    if min_area_px > 1:
        # skimage 0.26: max_size elimina objetos con área <= al valor dado.
        m = morphology.remove_small_objects(m, max_size=min_area_px - 1)
    return m
