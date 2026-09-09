"""Entrada/salida: cargar imagen, recortar overlay, leer ground truth, escribir manifest."""

from __future__ import annotations

import datetime as _dt
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import yaml


def load_image(path: str | Path, overlay_bbox: list[int] | None = None) -> np.ndarray:
    """Lee una imagen como array RGB uint8. Aplica recorte [x0,y0,x1,y1] si se da."""
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if overlay_bbox is not None:
        x0, y0, x1, y1 = overlay_bbox
        img = img[y0:y1, x0:x1]
        if img.size == 0:
            raise ValueError(f"overlay_bbox {overlay_bbox} deja la imagen vacía")
    return np.ascontiguousarray(img)


def save_image(path: str | Path, rgb: np.ndarray) -> None:
    cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))


def save_detections(df: pd.DataFrame, path: str | Path) -> None:
    df.to_csv(path, index=False)


def load_ground_truth(path: str | Path) -> np.ndarray:
    """CSV con columnas x,y (píxeles). Devuelve array (N, 2)."""
    df = pd.read_csv(path)
    cols = {c.lower(): c for c in df.columns}
    if "x" not in cols or "y" not in cols:
        raise ValueError(f"{path}: se esperan columnas 'x' y 'y', hay {list(df.columns)}")
    return df[[cols["x"], cols["y"]]].to_numpy(dtype=float)


def write_manifest(path: str | Path, **fields: object) -> None:
    """Metadata mínima por imagen (ROADMAP §11). Campos parciales son válidos."""
    base = {
        "capturado": None,
        "ubicacion": None,
        "cultivo": None,
        "variedad": None,
        "dispositivo": None,
        "altura_vuelo_m": None,
        "gsd_cm_px": None,
        "condiciones": None,
        "pipeline_version": None,
        "generado": _dt.datetime.now().isoformat(timespec="seconds"),
    }
    base.update(fields)
    Path(path).write_text(yaml.safe_dump(base, sort_keys=False, allow_unicode=True), encoding="utf-8")
