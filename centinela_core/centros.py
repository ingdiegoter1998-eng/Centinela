"""Detección de centros de planta — conteo sin segmentar manchas.

El pipeline de manchas (`pipeline.py`) supone que cada planta es una mancha verde
sobre un fondo que no es verde, y cuenta manchas. En un platanal real las dos
premisas fallan a la vez: el entresurco es pasto verde y las hojas de matas vecinas
se tocan. La segmentación entrega pedazos de hoja y huecos entre hojas, y el conteo
sale de ahí (docs/resultados-centros.md §1).

Este módulo no segmenta. Busca **un punto por planta** en un mapa de "centralidad"
y se queda con sus máximos locales:

    forma "estrella"   plátano, banano, palma: las hojas salen de un mismo punto.
                       Cada borde de hoja vota a lo largo de su propia dirección;
                       los votos se acumulan donde convergen las hojas.
    forma "copa"       cítricos, cacao, frutales: la copa es una mancha redonda más
                       verde y más oscura que lo que la rodea. Un filtro pasabanda
                       (diferencia de gaussianas) del índice de vegetación, a la
                       escala de la copa.

Las dos formas necesitan saber **cuánto mide una planta en la foto**. Una plantación
es casi periódica, así que ese tamaño se estima con la autocorrelación de la imagen:
el primer pico prominente es la distancia entre plantas vecinas. Si la foto no tiene
periodo claro (plantas sueltas, bordes de lote), el estimador lo dice y el tamaño se
fija a mano.

El conteo se publica con su sensibilidad a esa escala: se repite con el tamaño
±10 % (el error típico del estimador). Si el número casi no cambia, el conteo es consistente; si cambia mucho, se
publica el rango. Es el mismo criterio de `stability.py`, aplicado al parámetro que
aquí manda.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from skimage.feature import peak_local_max

from .health import robust_z
from .vegetation import combo, vari

FORMAS = ("estrella", "copa")
# Por debajo de esta prominencia el pico de la autocorrelación es ruido de textura.
PROMINENCIA_MIN = 0.01
# Variación de escala con la que se mide la sensibilidad del conteo.
SENSIBILIDAD = (0.9, 1.1)
# Tolerancia relativa para llamar "consistente" a un conteo.
TOLERANCIA = 0.10


@dataclass
class Escala:
    px: int | None  # distancia típica entre plantas vecinas, en píxeles
    prominencia: float  # qué tan marcado es el periodo (0 = nada)
    fuente: str  # "autocorrelacion" | "manual" | "sin_periodo"


@dataclass
class ResultadoCentros:
    rgb: np.ndarray
    mapa: np.ndarray  # mapa de centralidad sobre el que se buscan los máximos
    detecciones: pd.DataFrame  # x_px, y_px, puntaje — una fila por planta
    forma: str
    escala: Escala
    sensibilidad: dict[float, int] = field(default_factory=dict)  # factor → conteo

    @property
    def n(self) -> int:
        return len(self.detecciones)

    @property
    def rango(self) -> tuple[int, int]:
        v = list(self.sensibilidad.values()) or [self.n]
        return min(v), max(v)

    @property
    def consistente(self) -> bool:
        lo, hi = self.rango
        return self.n > 0 and (hi - lo) <= TOLERANCIA * self.n


# --------------------------------------------------------------------------- escala


def _autocorrelacion(m: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Autocorrelación normalizada centrada, distancia al centro de cada píxel y el
    perfil radial (promedio por anillo: valor por distancia en px)."""
    m = m.astype(np.float64) - m.mean()
    f = np.fft.fft2(m)
    ac = np.fft.fftshift(np.fft.ifft2(f * np.conj(f)).real)
    ac /= ac.max() + 1e-12
    h, w = ac.shape
    yy, xx = np.mgrid[:h, :w]
    r = np.hypot(yy - h // 2, xx - w // 2)
    ri = r.astype(int)
    perfil = np.bincount(ri.ravel(), ac.ravel()) / np.bincount(ri.ravel())
    return ac, r, perfil[: min(h, w) // 3]


def estimar_escala(rgb: np.ndarray) -> Escala:
    """Distancia entre plantas vecinas a partir de la autocorrelación de la imagen.

    Se prueba sobre la luminancia y sobre el índice de vegetación, porque según la
    escena la planta se distingue del fondo por una cosa o por la otra (en el platanal,
    la hoja es más clara que el pasto; en el huerto, la copa es más verde que el suelo).
    Gana el mapa con el periodo más marcado.

    Dos cuidados. En el perfil radial, una cuadrícula también da pico al doble de la
    distancia, a veces un poco más prominente: se toma el pico más cercano cuya
    prominencia sea al menos la mitad de la mayor. Y el promedio por anillos mezcla a
    los vecinos directos con los diagonales y corre el pico hacia afuera: el valor se
    refina con el máximo de la autocorrelación 2D cerca de esa distancia.
    """
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    mejor, ac_mejor, prom_max = Escala(None, 0.0, "sin_periodo"), None, 0.0
    for m in (lum, combo(rgb)):
        ac, r, perfil = _autocorrelacion(m)
        picos, props = find_peaks(perfil, prominence=PROMINENCIA_MIN)
        ok = picos >= 6
        picos, prom = picos[ok], props["prominences"][ok]
        if not len(picos) or prom.max() <= prom_max:
            continue
        prom_max = float(prom.max())
        i = int(np.flatnonzero(prom >= 0.5 * prom_max)[0])
        mejor, ac_mejor = Escala(int(picos[i]), float(prom[i]), "autocorrelacion"), (ac, r)
    if ac_mejor is not None:
        ac, r = ac_mejor
        # Solo máximos locales verdaderos: en el borde interior del anillo la
        # autocorrelación todavía viene bajando desde el centro y ganaría siempre.
        h, w = ac.shape
        k = int(1.3 * mejor.px) + 2
        y0, x0 = max(0, h // 2 - k), max(0, w // 2 - k)
        ventana = ac[y0 : h // 2 + k, x0 : w // 2 + k]
        maximos = peak_local_max(ventana, min_distance=max(2, mejor.px // 6), exclude_border=False)
        if len(maximos):
            rm = r[maximos[:, 0] + y0, maximos[:, 1] + x0]
            ok = (rm >= 0.7 * mejor.px) & (rm <= 1.2 * mejor.px)
            if ok.any():
                vals = ventana[maximos[ok, 0], maximos[ok, 1]]
                mejor.px = round(float(rm[ok][np.argmax(vals)]))
    return mejor


# --------------------------------------------------------------------------- mapas


def mapa_estrella(rgb: np.ndarray, p: float, frac_bordes: float = 0.25) -> np.ndarray:
    """Votos de convergencia de hojas.

    Cada píxel de borde con orientación bien definida (tensor de estructura coherente)
    vota a lo largo de la dirección del borde, hacia los dos lados, a distancias entre
    0,12 y 0,55 veces la escala. Los bordes de las hojas de una roseta apuntan al
    centro, así que sus votos se amontonan ahí; los bordes de pasto o de hojas
    cruzadas votan en direcciones que no coinciden.
    """
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    g = cv2.GaussianBlur(lum, (0, 0), 1.5)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    jxx = cv2.GaussianBlur(gx * gx, (0, 0), 2)
    jyy = cv2.GaussianBlur(gy * gy, (0, 0), 2)
    jxy = cv2.GaussianBlur(gx * gy, (0, 0), 2)
    theta = 0.5 * np.arctan2(2 * jxy, jxx - jyy)  # orientación dominante del gradiente
    coherencia = np.sqrt((jxx - jyy) ** 2 + 4 * jxy**2) / (jxx + jyy + 1e-6)
    fuerza = np.sqrt(jxx + jyy) * coherencia

    ys, xs = np.nonzero(fuerza > np.quantile(fuerza, 1 - frac_bordes))
    peso = fuerza[ys, xs].astype(np.float64)
    ex, ey = -np.sin(theta[ys, xs]), np.cos(theta[ys, xs])  # dirección del borde

    h, w = lum.shape
    votos = np.zeros(h * w)
    paso = max(1.0, 0.43 * p / 20)  # ~20 distancias, sea cual sea la escala
    for d in np.arange(0.12 * p, 0.55 * p, paso):
        for signo in (1, -1):
            x = np.round(xs + signo * d * ex).astype(int)
            y = np.round(ys + signo * d * ey).astype(int)
            ok = (x >= 0) & (x < w) & (y >= 0) & (y < h)
            votos += np.bincount(y[ok] * w + x[ok], peso[ok], h * w)
    return cv2.GaussianBlur(votos.reshape(h, w).astype(np.float32), (0, 0), 0.08 * p)


def mapa_copa(rgb: np.ndarray, p: float) -> np.ndarray:
    """Índice de vegetación `combo` filtrado a la escala de la copa (diferencia de gaussianas)."""
    v = combo(rgb).astype(np.float32)
    return cv2.GaussianBlur(v, (0, 0), 0.2 * p) - cv2.GaussianBlur(v, (0, 0), 1.5 * p)


def _es_verde(rgb: np.ndarray) -> np.ndarray:
    a = rgb.astype(np.int16)
    return ((a[..., 1] > a[..., 0]) & (a[..., 1] > a[..., 2])).astype(np.float32)


# --------------------------------------------------------------------------- detección


def _maximos(mapa: np.ndarray, rgb: np.ndarray, forma: str, p: float) -> pd.DataFrame:
    if forma == "estrella":
        # Relativo a los centros fuertes típicos (percentil 90 de los máximos), no al
        # máximo absoluto: una sola roseta muy marcada no debe apagar a las demás.
        cand = peak_local_max(mapa, min_distance=max(2, int(0.5 * p)), exclude_border=False)
        if not len(cand):
            return pd.DataFrame(columns=["x_px", "y_px", "puntaje"])
        v = mapa[cand[:, 0], cand[:, 1]]
        picos = cand[v >= 0.25 * np.percentile(v, 90)]
    else:
        picos = peak_local_max(
            mapa, min_distance=max(2, int(0.45 * p)), threshold_abs=0.0, exclude_border=False
        )
    # Descarta centros sobre algo que no es planta: sombras de palma sobre una vía,
    # textura del agua en un río.
    verde = cv2.blur(_es_verde(rgb), (max(3, int(0.3 * p)),) * 2)
    picos = picos[verde[picos[:, 0], picos[:, 1]] >= 0.5]
    return pd.DataFrame(
        {
            "x_px": picos[:, 1].astype(float),
            "y_px": picos[:, 0].astype(float),
            "puntaje": mapa[picos[:, 0], picos[:, 1]].astype(float),
        }
    )


def _mapa(rgb: np.ndarray, forma: str, p: float) -> np.ndarray:
    return mapa_estrella(rgb, p) if forma == "estrella" else mapa_copa(rgb, p)


def detectar(
    rgb: np.ndarray,
    forma: str = "estrella",
    tamano_px: float | None = None,
    sensibilidad: bool = True,
) -> ResultadoCentros:
    """Un punto por planta. `tamano_px` fija la escala a mano (distancia entre plantas)."""
    if forma not in FORMAS:
        raise ValueError(f"forma desconocida: {forma!r} (válidas: {', '.join(FORMAS)})")
    if tamano_px:
        escala = Escala(round(tamano_px), 0.0, "manual")
    else:
        escala = estimar_escala(rgb)
    if escala.px is None:
        vacio = pd.DataFrame(columns=["x_px", "y_px", "puntaje"])
        return ResultadoCentros(rgb, np.zeros(rgb.shape[:2], np.float32), vacio, forma, escala)

    p = float(escala.px)
    mapa = _mapa(rgb, forma, p)
    dets = _maximos(mapa, rgb, forma, p)
    sens = {1.0: len(dets)}
    if sensibilidad:
        for f in SENSIBILIDAD:
            sens[f] = len(_maximos(_mapa(rgb, forma, p * f), rgb, forma, p * f))
    return ResultadoCentros(rgb, mapa, dets, forma, escala, dict(sorted(sens.items())))


def revisar_vigor(res: ResultadoCentros, z_umbral: float = 2.5, min_plantas: int = 5) -> pd.DataFrame:
    """Etapa II sobre centros: marca las plantas mucho menos verdes que el resto de la foto.

    VARI medio en un cuadro de 0,4 veces la escala alrededor de cada centro, comparado
    con la mediana de la propia foto (z robusto, `health.robust_z`). Como en la Etapa II,
    no diagnostica: señala dónde mirar primero. Con menos de `min_plantas` no marca nada.
    """
    d = res.detecciones.copy()
    d["vigor"] = np.nan
    d["z_vigor"] = np.nan
    d["revisar"] = False
    if res.n == 0 or not res.escala.px:
        return d
    lado = max(3, int(0.4 * res.escala.px))
    medio = cv2.blur(vari(res.rgb), (lado, lado))
    y = d["y_px"].to_numpy(int).clip(0, res.rgb.shape[0] - 1)
    x = d["x_px"].to_numpy(int).clip(0, res.rgb.shape[1] - 1)
    d["vigor"] = medio[y, x]
    if res.n >= min_plantas:
        z = -robust_z(d["vigor"].to_numpy())  # positivo = menos verde que la mediana
        d["z_vigor"] = z
        d["revisar"] = z > z_umbral
    return d
