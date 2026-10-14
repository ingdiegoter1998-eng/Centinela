"""Detector de personas (opcional). Sin él, el programa igual cuenta sacadas; con él suma aforo y barra sola.

Usa YOLO (paquete `ultralytics`, se instala aparte: pip install ultralytics). La primera vez descarga el
modelo pequeño (yolov8n.pt, unos 6 MB). Corre en el procesador, sin tarjeta de video: por eso se usa cada
pocos segundos y no en cada cuadro. No reconoce caras ni identifica a nadie: solo dice dónde hay una persona.
"""
from __future__ import annotations


class ContadorPersonas:
    def __init__(self, modelo: str = 'yolov8n.pt', confianza: float = 0.4):
        from ultralytics import YOLO          # ImportError si no está instalado: quien llama decide
        self.modelo, self.confianza = YOLO(modelo), confianza

    def centros(self, cuadro) -> list[tuple[float, float]]:
        """Centro (x, y) relativo de cada persona en el cuadro."""
        alto, ancho = cuadro.shape[:2]
        r = self.modelo.predict(cuadro, classes=[0], conf=self.confianza, verbose=False)[0]
        return [((x1 + x2) / 2 / ancho, (y1 + y2) / 2 / alto) for x1, y1, x2, y2 in r.boxes.xyxy.tolist()]


def crear(ajustes: dict, avisar=print):
    """El contador, o None si está apagado en camara.yaml o falta el paquete."""
    if not ajustes.get('activo', True):
        return None
    try:
        return ContadorPersonas(ajustes.get('modelo', 'yolov8n.pt'), ajustes.get('confianza', 0.4))
    except ImportError:
        avisar('Sin detector de personas (pip install ultralytics): cuento sacadas, pero no aforo ni barra sola.')
        return None
