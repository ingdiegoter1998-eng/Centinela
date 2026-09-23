"""Proyecto Centinela — Etapa I: conteo de plantas en una imagen aérea.

Dos métodos de visión clásica, sin modelos entrenados y sin georreferencia:

- `pipeline.run` — segmenta manchas de vegetación y las agrupa con DBSCAN. Funciona con
  copas separadas sobre suelo (ROADMAP.md §5, docs/plan-fase-1.md).
- `centros.detectar` — busca un punto por planta; funciona también sobre pasto verde y con
  hojas que se tocan (docs/resultados-centros.md).
"""

from .config import Config
from .pipeline import PipelineResult, run

__version__ = "0.2.0"
__all__ = ["Config", "PipelineResult", "__version__", "run"]
