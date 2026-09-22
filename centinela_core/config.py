"""Carga y validación de la configuración del pipeline.

Los defaults de las dataclasses son la fuente de verdad; `config.yaml` solo
sobrescribe lo que declare. Un YAML parcial es válido.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path

import yaml

from .cluster import FEATURE_COLS


@dataclass
class CropCfg:
    overlay_bbox: list[int] | None = None


@dataclass
class VegetationCfg:
    index: str = "combo"  # combo (verde + oscuridad) | exg | exgr | dark | hsv
    threshold: str | float = "otsu"  # "otsu" o un float


@dataclass
class MorphologyCfg:
    open_radius: int = 3
    close_radius: int = 5
    min_area_px: int = 80
    fill_holes: bool = True


@dataclass
class WatershedCfg:
    min_distance_px: int = 15
    footprint_px: int = 7


@dataclass
class FeaturesCfg:
    color_space: str = "lab"


@dataclass
class ClusterCfg:
    method: str = "dbscan"  # dbscan | watershed (toda mancha cuenta, sin agrupar)
    eps: float = 0.8
    min_samples: int = 6
    dominant: str = "largest"  # largest | densest
    features: list[str] = field(default_factory=lambda: list(FEATURE_COLS))


@dataclass
class EvaluateCfg:
    match_radius_px: float = 14.0


@dataclass
class HealthCfg:
    vigor_index: str = "vari"  # vari | gli
    z_threshold: float = 2.5
    metrics: list[str] = field(
        default_factory=lambda: ["area", "vigor", "gap", "solidity"]
    )
    min_trees: int = 5


@dataclass
class Config:
    crop: CropCfg = field(default_factory=CropCfg)
    vegetation: VegetationCfg = field(default_factory=VegetationCfg)
    morphology: MorphologyCfg = field(default_factory=MorphologyCfg)
    watershed: WatershedCfg = field(default_factory=WatershedCfg)
    features: FeaturesCfg = field(default_factory=FeaturesCfg)
    cluster: ClusterCfg = field(default_factory=ClusterCfg)
    evaluate: EvaluateCfg = field(default_factory=EvaluateCfg)
    health: HealthCfg = field(default_factory=HealthCfg)

    @classmethod
    def load(cls, path: str | Path | None = None) -> Config:
        cfg = cls()
        if path is None:
            return cfg
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        for section, values in data.items():
            if not hasattr(cfg, section) or not isinstance(values, dict):
                continue
            sub = getattr(cfg, section)
            known = {f.name for f in fields(sub)} if is_dataclass(sub) else set()
            for key, value in values.items():
                if key in known:
                    setattr(sub, key, value)
        return cfg
