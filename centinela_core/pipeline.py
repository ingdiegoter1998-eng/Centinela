"""Orquestación del pipeline completo: imagen → detecciones.

    imagen RGB
      → máscara de vegetación (ExG + Otsu)
      → limpieza morfológica
      → watershed (separa copas pegadas)
      → descriptores por mancha
      → DBSCAN → cluster dominante = árboles
      → tabla de detecciones
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .cluster import cluster_blobs
from .config import Config
from .features import extract_features
from .io import load_image
from .morphology import clean_mask
from .segment import separate_crowns
from .vegetation import vegetation_index, vegetation_mask


@dataclass
class PipelineResult:
    rgb: np.ndarray
    index: np.ndarray  # índice de vegetación continuo
    veg: np.ndarray  # máscara de vegetación cruda
    mask: np.ndarray  # máscara limpia
    labels: np.ndarray  # instancias del watershed
    detections: pd.DataFrame  # una fila por mancha (con is_tree)
    decision: str = "dbscan"  # quién decidió el conteo: dbscan | fallback | watershed

    @property
    def trees(self) -> pd.DataFrame:
        return self.detections[self.detections["is_tree"]]

    @property
    def n_trees(self) -> int:
        return int(self.detections["is_tree"].sum())


def run(image_path: str | Path, config: Config | None = None) -> PipelineResult:
    cfg = config or Config()

    rgb = load_image(image_path, cfg.crop.overlay_bbox)
    idx = vegetation_index(rgb, cfg.vegetation.index)
    veg = vegetation_mask(rgb, cfg.vegetation.index, cfg.vegetation.threshold)
    mask = clean_mask(
        veg,
        cfg.morphology.open_radius,
        cfg.morphology.close_radius,
        cfg.morphology.min_area_px,
        cfg.morphology.fill_holes,
    )
    labels = separate_crowns(
        mask, cfg.watershed.min_distance_px, cfg.watershed.footprint_px
    )
    feats = extract_features(labels, rgb, veg)
    dets = cluster_blobs(
        feats,
        cfg.cluster.eps,
        cfg.cluster.min_samples,
        cfg.cluster.dominant,
        method=cfg.cluster.method,
        features=cfg.cluster.features,
    )
    decision = dets.attrs["decision"]
    dets["lat"] = np.nan  # reservado para Etapa I-B (georreferencia)
    dets["lon"] = np.nan

    return PipelineResult(
        rgb=rgb, index=idx, veg=veg, mask=mask, labels=labels, detections=dets, decision=decision
    )
