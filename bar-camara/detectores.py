"""Lógica de detección, sin cámara ni red: recibe cuadros (arreglos numpy) con su hora y devuelve eventos.

Así se prueba con video sintético y se calibra sin estar en el bar. Solo usa numpy; OpenCV y el detector de
personas viven en vigia.py y personas.py.

Zonas: polígonos en coordenadas relativas (0 a 1) del cuadro, para que valgan igual en la resolución
alta y en la baja de la cámara. Las dibuja calibrar.py:
    grifo   recuadro pequeño sobre la manija del grifo y el vaso      → sacadas
    barra   detrás de la barra, donde se para el barman               → barra sola (necesita personas)
    salon   donde están los clientes                                  → aforo (necesita personas)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

import numpy as np

# Colombia no tiene horario de verano: con un desfase fijo no hace falta la base de zonas horarias
# (en Windows no viene instalada).
BOGOTA = timezone(timedelta(hours=-5), 'COT')


@dataclass
class Evento:
    tipo: str                      # sacada | aforo | barra_sola | latido (los mismos de eventos_camara)
    inicio: datetime
    fin: datetime | None = None
    personas: int | None = None
    zona: str = ''
    nota: str = ''

    @property
    def origen(self) -> str:
        """Id único y estable: si el lote se reenvía tras un corte de internet, la base no lo duplica."""
        return f"{self.tipo}-{self.zona}-{self.inicio.isoformat(timespec='milliseconds')}"

    def a_json(self) -> dict:
        d = {'origen': self.origen, 'tipo': self.tipo, 'inicio': self.inicio.isoformat(timespec='milliseconds'),
             'zona': self.zona, 'nota': self.nota}
        if self.fin is not None:
            d['fin'] = self.fin.isoformat(timespec='milliseconds')
        if self.personas is not None:
            d['personas'] = self.personas
        return d


def _seg(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds()


# ── Zonas ────────────────────────────────────────────────────────────────────────────────────

def mascara_poligono(alto: int, ancho: int, puntos) -> np.ndarray:
    """Máscara booleana alto×ancho de un polígono [(x, y), ...] en coordenadas relativas 0–1."""
    ys, xs = np.mgrid[0:alto, 0:ancho]
    px, py = (xs + 0.5) / ancho, (ys + 0.5) / alto
    dentro = np.zeros((alto, ancho), bool)
    for (x1, y1), (x2, y2) in zip(puntos, list(puntos[1:]) + [puntos[0]]):
        if y1 == y2:
            continue                                          # un lado horizontal no cruza el rayo
        cruza = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / (y2 - y1) + x1)
        dentro ^= cruza
    return dentro


def punto_en(punto, puntos) -> bool:
    """¿El punto (x, y) relativo cae dentro del polígono?"""
    x, y = punto
    dentro = False
    for (x1, y1), (x2, y2) in zip(puntos, list(puntos[1:]) + [puntos[0]]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dentro = not dentro
    return dentro


def a_gris(cuadro: np.ndarray) -> np.ndarray:
    if cuadro.ndim == 2:
        return cuadro.astype(np.float32)
    b, g, r = cuadro[..., 0], cuadro[..., 1], cuadro[..., 2]      # OpenCV entrega BGR
    return (0.114 * b + 0.587 * g + 0.299 * r).astype(np.float32)


def _suavizar(img: np.ndarray) -> np.ndarray:
    """Promedio 3×3: quita el ruido de pixel de una cámara barata con poca luz."""
    p = np.pad(img, 1, mode='edge')
    return sum(p[dy:dy + img.shape[0], dx:dx + img.shape[1]] for dy in range(3) for dx in range(3)) / 9.0


class Movimiento:
    """Qué fracción de una zona cambió respecto a un fondo que se adapta despacio (luces, sombras).

    El fondo solo aprende donde no hay cambio, para no tragarse la mano mientras sirve. Lo que queda quieto
    (un vaso que dejaron, el «fantasma» de la mano que ya se fue) no es movimiento: tras `quieto` cuadros
    sin cambio entre un cuadro y el siguiente la zona cuenta como quieta, y tras `reinicio` cuadros lo que
    haya pasa a ser el fondo.
    """

    def __init__(self, puntos, umbral_pixel: float = 25, adaptacion: float = 0.02, quieto: int = 5, reinicio: int = 15):
        self.puntos, self.umbral, self.alfa = puntos, umbral_pixel, adaptacion
        self.quieto, self.reinicio = quieto, reinicio
        self._forma = None
        self._fondo = None

    def _preparar(self, alto, ancho):
        m = mascara_poligono(alto, ancho, self.puntos)
        if not m.any():
            raise ValueError('La zona del grifo quedó vacía: vuelve a dibujarla con calibrar.py.')
        filas, cols = np.where(m)
        self._caja = (filas.min(), filas.max() + 1, cols.min(), cols.max() + 1)
        y0, y1, x0, x1 = self._caja
        self._mask = m[y0:y1, x0:x1]
        self._forma, self._fondo, self._previo, self._quietos = (alto, ancho), None, None, 0

    def __call__(self, cuadro: np.ndarray) -> float:
        alto, ancho = cuadro.shape[:2]
        if self._forma != (alto, ancho):
            self._preparar(alto, ancho)
        y0, y1, x0, x1 = self._caja
        recorte = _suavizar(a_gris(cuadro[y0:y1, x0:x1]))
        if self._fondo is None:
            self._fondo = self._previo = recorte
            return 0.0
        entre_cuadros = (np.abs(recorte - self._previo) > self.umbral)[self._mask].mean()
        self._previo = recorte
        self._quietos = self._quietos + 1 if entre_cuadros < 0.01 else 0
        cambio = np.abs(recorte - self._fondo) > self.umbral
        if self._quietos >= self.reinicio:
            self._fondo = recorte
        else:
            self._fondo = np.where(cambio, self._fondo, self._fondo + self.alfa * (recorte - self._fondo))
        if self._quietos >= self.quieto:
            return 0.0
        return float(cambio[self._mask].mean())


# ── Detectores ───────────────────────────────────────────────────────────────────────────────

class DetectorSacadas:
    """Convierte el movimiento en el grifo en sacadas con hora de inicio y fin.

    - Empieza cuando hay movimiento (fracción ≥ umbral) que se sostiene `min_activo` segundos; pausas
      cortas (la mano que suelta y vuelve) no la cortan.
    - Termina tras `pausa` segundos quieto. Si duró menos de `min_duracion`, era alguien pasando: no cuenta.
    - Si pasa de `max_duracion` sin parar, se cierra marcada para revisar (¿luz que titila, cámara movida?)
      y no se cuenta otra hasta que el grifo vuelva a quedar quieto.
    """

    def __init__(self, umbral=0.08, min_activo=1.0, pausa=2.0, min_duracion=3.0, max_duracion=60.0, zona='grifo'):
        self.umbral, self.min_activo, self.pausa = umbral, min_activo, pausa
        self.min_duracion, self.max_duracion, self.zona = min_duracion, max_duracion, zona
        self._desde = self._ultimo = None
        self.en_curso = False
        self.recien_empezo = False          # verdadero en el cuadro en que arranca: momento de la foto
        self._bloqueado = False

    def _reiniciar(self):
        self._desde = self._ultimo = None
        self.en_curso = False

    def actualizar(self, t: datetime, fraccion: float) -> Evento | None:
        self.recien_empezo = False
        activo = fraccion >= self.umbral
        if self._bloqueado:
            if activo:
                self._ultimo = t
            elif self._ultimo is None or _seg(self._ultimo, t) >= self.pausa:
                self._bloqueado = False
                self._reiniciar()
            return None
        if activo:
            if self._desde is None:
                self._desde = t
            self._ultimo = t
            if not self.en_curso and _seg(self._desde, t) >= self.min_activo:
                self.en_curso = self.recien_empezo = True
            if self.en_curso and _seg(self._desde, t) >= self.max_duracion:
                ev = Evento('sacada', self._desde, t, zona=self.zona,
                            nota=f'actividad continua en el grifo más de {self.max_duracion:.0f} s: revisar la foto')
                self._bloqueado = True
                return ev
            return None
        if self._desde is None or _seg(self._ultimo, t) < self.pausa:
            return None
        ev = None
        if self.en_curso and _seg(self._desde, self._ultimo) >= self.min_duracion:
            ev = Evento('sacada', self._desde, self._ultimo, zona=self.zona)
        self._reiniciar()
        return ev


class MuestreoAforo:
    """Máximo de personas vistas en el salón por ventana (5 min por defecto): un evento «aforo» por ventana."""

    def __init__(self, ventana=300.0, zona='salon'):
        self.ventana, self.zona = ventana, zona
        self._desde = None
        self._maximo = 0

    def actualizar(self, t: datetime, personas: int) -> Evento | None:
        ev = None
        if self._desde is not None and _seg(self._desde, t) >= self.ventana:
            ev = Evento('aforo', self._desde, t, personas=self._maximo, zona=self.zona)
            self._desde = None
        if self._desde is None:
            self._desde, self._maximo = t, 0
        self._maximo = max(self._maximo, personas)
        return ev


class VigilanteBarra:
    """Avisa cuando, con el bar abierto, nadie estuvo detrás de la barra al menos `minutos`."""

    def __init__(self, minutos=10.0, zona='barra'):
        self.minimo, self.zona = minutos * 60, zona
        self._desde = None

    def actualizar(self, t: datetime, personas: int, abierto: bool) -> Evento | None:
        if abierto and personas == 0:
            if self._desde is None:
                self._desde = t
            return None
        ev = None
        if self._desde is not None and _seg(self._desde, t) >= self.minimo:
            ev = Evento('barra_sola', self._desde, t, zona=self.zona)
        self._desde = None
        return ev


class Horario:
    """Horario de atención; puede cruzar la medianoche (16:00 a 03:00)."""

    def __init__(self, abre: str = '16:00', cierra: str = '03:00'):
        self.abre, self.cierra = time.fromisoformat(abre), time.fromisoformat(cierra)

    def abierto(self, t: datetime) -> bool:
        h = t.timetz().replace(tzinfo=None)
        if self.abre <= self.cierra:
            return self.abre <= h < self.cierra
        return h >= self.abre or h < self.cierra


# ── Todo junto ───────────────────────────────────────────────────────────────────────────────

class Vigia:
    """Junta los detectores. `paso(t, cuadro, personas)` devuelve los eventos nuevos.

    `personas` es la lista de centros (x, y) relativos de las personas detectadas en ese cuadro, o None si
    en ese cuadro no se corrió el detector de personas (es pesado: se corre cada pocos segundos).
    `foto_pendiente` queda en True en el cuadro en que arranca una sacada: quien llama guarda ese cuadro.
    """

    def __init__(self, zonas: dict, ajustes: dict | None = None):
        a = ajustes or {}
        s = a.get('sacadas', {})
        if 'grifo' not in zonas:
            raise ValueError('Falta la zona «grifo»: dibújala con calibrar.py.')
        self.zonas = zonas
        fps = a.get('camara', {}).get('cuadros_por_seg', 5)
        self.movimiento = Movimiento(zonas['grifo'], s.get('umbral_pixel', 25), s.get('adaptacion', 0.02),
                                     max(1, round(s.get('quieto_seg', 1.0) * fps)),
                                     max(2, round(s.get('reinicio_seg', 3.0) * fps)))
        self.sacadas = DetectorSacadas(s.get('umbral', 0.08), s.get('min_activo', 1.0), s.get('pausa', 2.0),
                                       s.get('min_duracion', 3.0), s.get('max_duracion', 60.0))
        self.aforo = MuestreoAforo(a.get('aforo', {}).get('ventana_seg', 300)) if 'salon' in zonas else None
        self.barra = VigilanteBarra(a.get('barra', {}).get('minutos_sola', 10)) if 'barra' in zonas else None
        h = a.get('horario', {})
        self.horario = Horario(h.get('abre', '16:00'), h.get('cierra', '03:00'))
        self.latido_seg = a.get('latido_seg', 300)
        self._ultimo_latido = None
        self.ultima_fraccion = 0.0
        self.foto_pendiente = False

    def paso(self, t: datetime, cuadro: np.ndarray, personas=None) -> list[Evento]:
        eventos = []
        self.ultima_fraccion = self.movimiento(cuadro)
        ev = self.sacadas.actualizar(t, self.ultima_fraccion)
        self.foto_pendiente = self.sacadas.recien_empezo
        if ev:
            if not self.horario.abierto(ev.inicio):
                ev.nota = '; '.join(x for x in ('fuera de horario', ev.nota) if x)
            eventos.append(ev)
        if personas is not None:
            if self.aforo:
                ev = self.aforo.actualizar(t, sum(punto_en(p, self.zonas['salon']) for p in personas))
                if ev:
                    eventos.append(ev)
            if self.barra:
                ev = self.barra.actualizar(t, sum(punto_en(p, self.zonas['barra']) for p in personas),
                                           self.horario.abierto(t))
                if ev:
                    eventos.append(ev)
        if self._ultimo_latido is None or _seg(self._ultimo_latido, t) >= self.latido_seg:
            self._ultimo_latido = t
            eventos.append(Evento('latido', t))
        return eventos
