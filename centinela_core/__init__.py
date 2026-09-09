"""Proyecto Centinela — Etapa I: conteo de árboles en una imagen aérea.

Pipeline de visión clásica + DBSCAN, sin modelos entrenados, sin georreferencia.
Ver ROADMAP.md §5 y docs/plan-fase-1.md.
"""

from .config import Config
from .pipeline import PipelineResult, run

__version__ = "0.1.0"
__all__ = ["Config", "PipelineResult", "__version__", "run"]
