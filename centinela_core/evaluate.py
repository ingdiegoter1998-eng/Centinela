"""Arnés de evaluación: empareja detecciones con el conteo manual.

Emparejado greedy por distancia ascendente, con radio de tolerancia. Reporta
precision / recall / F1 (métrica principal) y el error de conteo agregado
(secundario). El F1 es lo que también pide la Etapa III (§7.5).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy.spatial.distance import cdist


@dataclass
class EvalResult:
    tp: int
    fp: int
    fn: int
    precision: float
    recall: float
    f1: float
    n_detected: int
    n_gt: int
    count_error: float

    def as_dict(self) -> dict:
        return asdict(self)


def evaluate(detections_xy, gt_xy, match_radius_px: float = 14.0) -> EvalResult:
    det = np.asarray(detections_xy, dtype=float).reshape(-1, 2)
    gt = np.asarray(gt_xy, dtype=float).reshape(-1, 2)
    n_det, n_gt = len(det), len(gt)

    tp = 0
    if n_det and n_gt:
        dist = cdist(gt, det)
        order = np.dstack(np.unravel_index(np.argsort(dist, axis=None), dist.shape))[0]
        used_gt: set[int] = set()
        used_det: set[int] = set()
        for gi, di in order:
            if dist[gi, di] > match_radius_px:
                break
            if gi in used_gt or di in used_det:
                continue
            used_gt.add(int(gi))
            used_det.add(int(di))
            tp += 1

    fp = n_det - tp
    fn = n_gt - tp
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    count_error = abs(n_det - n_gt) / n_gt if n_gt else float("nan")

    return EvalResult(
        tp=tp,
        fp=fp,
        fn=fn,
        precision=precision,
        recall=recall,
        f1=f1,
        n_detected=n_det,
        n_gt=n_gt,
        count_error=count_error,
    )
