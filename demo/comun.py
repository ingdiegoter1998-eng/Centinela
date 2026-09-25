"""Lo que comparten las páginas de la demo: rutas, escenas, cálculo en caché y dibujo."""

from __future__ import annotations

import hashlib
import io
import os
import sys
import tempfile
from pathlib import Path

import cv2
import matplotlib
import numpy as np
import pandas as pd
import streamlit as st
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # por si el paquete no está instalado en modo editable

from centinela_core.config import Config
from centinela_core.pipeline import run

SAMPLES = ROOT / "data" / "samples"

ESCENAS = {
    "Huerto sintético · 80 árboles, verdad de terreno exacta": {
        "img": SAMPLES / "huerto_demo.png",
        "gt": SAMPLES / "huerto_demo_gt.csv",
        "nota": "Generado por `centinela make-synthetic`. Copas sobre suelo desnudo, "
        "posición exacta de cada árbol conocida.",
    },
    "Huerto sintético con maleza · 80 árboles + 25 manchas de maleza": {
        "img": SAMPLES / "huerto_maleza.png",
        "gt": SAMPLES / "huerto_maleza_gt.csv",
        "nota": "El mismo huerto con maleza entre hileras: mismo verde y misma luminancia "
        "que la copa, forma irregular. La maleza no está en la verdad de terreno.",
    },
    "Platanal sintético · 63 matas sobre pasto verde": {
        "img": SAMPLES / "platanal_demo.png",
        "gt": SAMPLES / "platanal_demo_gt.csv",
        "nota": "Generado por `centinela make-synthetic --platanal`. Rosetas de hojas sobre "
        "pasto tan verde como la planta: la segmentación por manchas no tiene de dónde "
        "agarrarse. En *Analizar mi foto* se cuenta con el método de centros.",
    },
    "Huerto real (USDA) · cenital, suelo visible": {
        "img": SAMPLES / "banco" / "huerto_reticula_usda.jpg",
        "gt": None,
        "nota": "La única imagen real del banco donde la premisa se cumple: árboles "
        "espaciados sobre suelo. Dominio público (USDA).",
    },
    "Palma junto a un río (real) · segundo control": {
        "img": SAMPLES / "banco" / "palma_aceite_rio.jpg",
        "gt": None,
        "nota": "Palmas separadas sobre suelo, casi cenital: la otra imagen real donde la "
        "premisa se cumple. DrLianPinKoh, CC BY 2.0.",
    },
    "Palma de aceite · dron cenital": {
        "img": SAMPLES / "palma_lote.jpg",
        "gt": None,
        "publica": False,  # procedencia no registrada (data/ATRIBUCIONES.md)
        "nota": "Copas grandes, bloque denso. El mejor resultado real hasta la fecha.",
    },
    "Banano · dosel cerrado": {
        "img": SAMPLES / "platano_div8.png",
        "gt": None,
        "nota": "No hay suelo entre plantas: el umbral separa hoja iluminada de hoja "
        "sombreada. The Roving Rokibul, CC BY-SA 4.0.",
    },
    "Cítrico en seto · satélite 0,25 m/px": {
        "img": SAMPLES / "sep_topright.png",
        "gt": None,
        "publica": False,  # Esri World Imagery, condiciones de uso sin verificar
        "nota": "Copas de ~15 px pegadas en hilera. Falta resolución.",
    },
}
# Modo público: la copia en Streamlit Community Cloud (el repo se monta en /mount/src/)
# o cualquier ejecución con CENTINELA_PUBLICO=1. Muestra el aviso de que es una demo de
# laboratorio y oculta las escenas cuya imagen no tiene licencia clara para redistribuir.
PUBLICO = os.environ.get("CENTINELA_PUBLICO") == "1" or ROOT.as_posix().startswith("/mount/src/")

ESCENAS = {
    nombre: e
    for nombre, e in ESCENAS.items()
    if e["img"].exists() and (e.get("publica", True) or not PUBLICO)
}

VERDE = (48, 209, 88)
ROJO = (229, 72, 77)
MAX_LADO = 1600  # las imágenes subidas se reducen para que el análisis siga siendo rápido


@st.cache_data(show_spinner=False)
def procesar(ruta: str, mtime: float):
    r = run(ruta, Config())
    return r.rgb, r.index, r.mask, r.labels, r.detections


def _leer_con_pillow(datos: bytes) -> np.ndarray | None:
    """Decodifica con Pillow lo que OpenCV no abre. Devuelve BGR, o None si tampoco puede."""
    try:
        with Image.open(io.BytesIO(datos)) as im:
            return cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    except (OSError, ValueError):  # UnidentifiedImageError es un OSError
        return None


def guardar_subida(archivo) -> tuple[Path, tuple[int, int]]:
    """Guarda la foto subida (reducida si hace falta). Devuelve la ruta y el tamaño original."""
    datos = archivo.getvalue()
    img = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        img = _leer_con_pillow(datos)  # AVIF y otros formatos que OpenCV no abre
    if img is None:
        raise ValueError("No se pudo leer la imagen. Prueba con un JPG o PNG.")
    original = img.shape[:2]
    h = hashlib.sha1(datos).hexdigest()[:16]
    destino = Path(tempfile.gettempdir()) / "centinela_demo" / f"{h}.png"
    if not destino.exists():
        destino.parent.mkdir(parents=True, exist_ok=True)
        lado = max(original)
        if lado > MAX_LADO:
            f = MAX_LADO / lado
            img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(destino), img)
    return destino, original


def dibujar_detecciones(rgb: np.ndarray, dets: pd.DataFrame) -> np.ndarray:
    out = rgb.copy()
    grosor = max(1, round(max(rgb.shape[:2]) / 500))
    for _, d in dets.iterrows():
        r = int(max(5, np.sqrt(d["area_px"] / np.pi)))
        c = (int(d["x_px"]), int(d["y_px"]))
        if d["is_tree"]:
            cv2.circle(out, c, r, VERDE, grosor + 1, cv2.LINE_AA)
        else:
            k = max(3, r // 2)
            cv2.line(out, (c[0] - k, c[1] - k), (c[0] + k, c[1] + k), ROJO, grosor, cv2.LINE_AA)
            cv2.line(out, (c[0] - k, c[1] + k), (c[0] + k, c[1] - k), ROJO, grosor, cv2.LINE_AA)
    return out


def colorear_indice(idx: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(idx, [2, 98])
    norm = np.clip((idx - lo) / (hi - lo + 1e-9), 0, 1)
    return (matplotlib.colormaps["RdYlGn"](norm)[..., :3] * 255).astype(np.uint8)
