"""Máscara de vegetación a partir de índices RGB.

En una parcela de plantación, un árbol se distingue del suelo desnudo por dos
señales:

- **color**: la copa es más verde que el suelo → ExG (Excess Green) sobre canales
  cromáticos normalizados, aproximadamente invariante a la iluminación.
- **brillo**: la copa es más oscura que el suelo seco → término de oscuridad
  sobre la luminancia (canal L de Lab).

En imágenes de dron a baja altura la copa es de un verde vivo y ExG basta. En
imágenes aéreas más desaturadas (satélite, bruma, compresión) el verde casi
desaparece y lo que separa la copa del suelo es que es más oscura. El índice
`combo` (por defecto) combina ambas señales estandarizadas, así funciona en los
dos casos sin re-parametrizar (ROADMAP §5.5, §5.8).
"""

from __future__ import annotations

import numpy as np
from skimage.filters import threshold_otsu


def _chromatic(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    f = rgb.astype(np.float32)
    total = f.sum(axis=2) + 1e-6
    return f[..., 0] / total, f[..., 1] / total, f[..., 2] / total


def _otsu_gap_norm(x: np.ndarray) -> np.ndarray:
    """Reescala `x` a "separaciones de clase" respecto del umbral de Otsu.

    (x - t) / (media_alta - media_baja). Independiente del balance de clases,
    a diferencia del z-score: da lo mismo si la copa ocupa el 10 % o el 60 %
    de la imagen. Deja los dos índices de `combo` en unidades comparables.
    """
    finite = x[np.isfinite(x)]
    if finite.size == 0:
        return np.zeros_like(x)
    t = threshold_otsu(finite)
    lo = finite[finite < t]
    hi = finite[finite >= t]
    gap = (hi.mean() if hi.size else t) - (lo.mean() if lo.size else t)
    return (x - t) / (gap + 1e-6)


def excess_green(rgb: np.ndarray) -> np.ndarray:
    r, g, b = _chromatic(rgb)
    return 2.0 * g - r - b


def excess_green_red(rgb: np.ndarray) -> np.ndarray:
    r, g, b = _chromatic(rgb)
    return (2.0 * g - r - b) - (1.4 * r - g)


def darkness(rgb: np.ndarray) -> np.ndarray:
    """Alto para píxeles oscuros (copa) y bajo para claros (suelo seco)."""
    f = rgb.astype(np.float32)
    luminance = 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]
    return -luminance


def combo(rgb: np.ndarray) -> np.ndarray:
    """ExG + oscuridad, cada uno normalizado por su propia separación de Otsu.

    La copa es más verde Y más oscura que el suelo. Sumar las dos señales en
    unidades comparables hace que el índice funcione tanto con imágenes de dron
    (verde vivo, ExG fuerte) como con imágenes desaturadas de satélite (ExG casi
    nulo, manda la oscuridad) sin re-parametrizar.
    """
    return _otsu_gap_norm(excess_green(rgb)) + _otsu_gap_norm(darkness(rgb))


def _hsv_green(rgb: np.ndarray) -> np.ndarray:
    import cv2

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, _ = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # H en OpenCV: 0-179. Verde ~ 35-85. Devolvemos un "score" continuo.
    green = np.exp(-((h - 60.0) ** 2) / (2 * 20.0**2))
    return green * (s / 255.0)


INDEXES = {
    "combo": combo,
    "exg": excess_green,
    "exgr": excess_green_red,
    "dark": darkness,
    "hsv": _hsv_green,
}


def vegetation_index(rgb: np.ndarray, index: str = "combo") -> np.ndarray:
    if index not in INDEXES:
        raise ValueError(f"índice desconocido: {index!r} (opciones: {list(INDEXES)})")
    return INDEXES[index](rgb)


def vegetation_mask(
    rgb: np.ndarray, index: str = "combo", threshold: str | float = "otsu"
) -> np.ndarray:
    """Devuelve una máscara booleana (True = vegetación / copa)."""
    idx = vegetation_index(rgb, index)
    if isinstance(threshold, str):
        if threshold != "otsu":
            raise ValueError(f"umbral desconocido: {threshold!r}")
        finite = idx[np.isfinite(idx)]
        t = threshold_otsu(finite) if finite.size else 0.0
    else:
        t = float(threshold)
    return idx >= t
