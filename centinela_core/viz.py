"""Visualización: overlay de detecciones y panel de depuración."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from skimage.color import label2rgb

from .pipeline import PipelineResult


def overlay(result: PipelineResult, path: str | Path, dpi: int = 110) -> None:
    det = result.detections
    trees = det[det["is_tree"]]
    outliers = det[~det["is_tree"]]

    h, w = result.rgb.shape[:2]
    fig, ax = plt.subplots(figsize=(w / dpi, h / dpi))
    ax.imshow(result.rgb)
    ax.scatter(
        outliers["x_px"], outliers["y_px"], s=45, facecolors="none",
        edgecolors="#e5484d", linewidths=1.0, label=f"descartados ({len(outliers)})",
    )
    ax.scatter(
        trees["x_px"], trees["y_px"], s=45, facecolors="none",
        edgecolors="#30d158", linewidths=1.6, label=f"árboles ({len(trees)})",
    )
    ax.legend(loc="upper right", framealpha=0.9)
    ax.set_title(f"{len(trees)} árboles detectados")
    ax.axis("off")
    fig.savefig(path, bbox_inches="tight", dpi=dpi)
    plt.close(fig)


def debug_panel(result: PipelineResult, path: str | Path, dpi: int = 100) -> None:
    fig, ax = plt.subplots(2, 2, figsize=(16, 16))

    ax[0, 0].imshow(result.rgb)
    ax[0, 0].set_title("1 · original")

    ax[0, 1].imshow(result.index, cmap="RdYlGn")
    ax[0, 1].set_title("2 · índice de vegetación")

    ax[1, 0].imshow(label2rgb(result.labels, bg_label=0))
    ax[1, 0].set_title(f"3 · watershed — {int(result.labels.max())} instancias")

    ax[1, 1].imshow(result.rgb)
    det = result.detections
    if len(det):
        n_clusters = det["cluster_id"].nunique()
        sc = ax[1, 1].scatter(
            det["x_px"], det["y_px"], c=det["cluster_id"], cmap="tab10", s=30,
            vmin=det["cluster_id"].min(), vmax=det["cluster_id"].max(),
        )
        if n_clusters > 1:
            fig.colorbar(sc, ax=ax[1, 1], fraction=0.046, label="cluster_id")
    ax[1, 1].set_title(f"4 · clusters DBSCAN — {result.n_trees} árboles")

    for a in ax.flat:
        a.axis("off")
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight", dpi=dpi)
    plt.close(fig)


def errors_overlay(result: PipelineResult, gt_xy: np.ndarray, match_radius_px: float,
                   path: str | Path, dpi: int = 110) -> None:
    """Dibuja TP/FP/FN sobre la imagen para inspección visual."""
    from scipy.spatial.distance import cdist

    trees = result.trees[["x_px", "y_px"]].to_numpy()
    gt = np.asarray(gt_xy, dtype=float).reshape(-1, 2)

    used_det, used_gt = set(), set()
    if len(trees) and len(gt):
        dist = cdist(gt, trees)
        order = np.dstack(np.unravel_index(np.argsort(dist, axis=None), dist.shape))[0]
        for gi, di in order:
            if dist[gi, di] > match_radius_px:
                break
            if gi in used_gt or di in used_det:
                continue
            used_gt.add(int(gi))
            used_det.add(int(di))

    tp = trees[list(used_det)] if used_det else np.empty((0, 2))
    fp = trees[[i for i in range(len(trees)) if i not in used_det]] if len(trees) else np.empty((0, 2))
    fn = gt[[i for i in range(len(gt)) if i not in used_gt]] if len(gt) else np.empty((0, 2))

    h, w = result.rgb.shape[:2]
    fig, a = plt.subplots(figsize=(w / dpi, h / dpi))
    a.imshow(result.rgb)
    if len(tp):
        a.scatter(tp[:, 0], tp[:, 1], s=45, facecolors="none", edgecolors="#30d158",
                  linewidths=1.5, label=f"TP ({len(tp)})")
    if len(fp):
        a.scatter(fp[:, 0], fp[:, 1], s=55, marker="x", c="#e5484d",
                  linewidths=1.6, label=f"FP ({len(fp)})")
    if len(fn):
        a.scatter(fn[:, 0], fn[:, 1], s=55, marker="+", c="#ffd60a",
                  linewidths=1.6, label=f"FN ({len(fn)})")
    a.legend(loc="upper right", framealpha=0.9)
    a.axis("off")
    fig.savefig(path, bbox_inches="tight", dpi=dpi)
    plt.close(fig)


def health_overlay(result: PipelineResult, path: str | Path, dpi: int = 110) -> None:
    """Etapa II: verde = normal, ámbar = revisar, con el motivo anotado."""
    det = result.detections
    trees = det[det["is_tree"].fillna(False).astype(bool)]
    ok = trees[trees["flag"] != "revisar"]
    bad = trees[trees["flag"] == "revisar"]

    h, w = result.rgb.shape[:2]
    fig, ax = plt.subplots(figsize=(w / dpi, h / dpi))
    ax.imshow(result.rgb)
    ax.scatter(
        ok["x_px"], ok["y_px"], s=45, facecolors="none",
        edgecolors="#30d158", linewidths=1.2, label=f"normal ({len(ok)})",
    )
    ax.scatter(
        bad["x_px"], bad["y_px"], s=150, facecolors="none",
        edgecolors="#ff9f0a", linewidths=2.2, label=f"revisar ({len(bad)})",
    )
    for _, row in bad.iterrows():
        ax.annotate(
            str(row["motivo"]),
            (row["x_px"], row["y_px"]),
            textcoords="offset points", xytext=(0, 14),
            ha="center", fontsize=7, color="#ff9f0a",
        )
    ax.legend(loc="upper right", framealpha=0.9)
    ax.set_title(f"{len(bad)} de {len(trees)} árboles para revisar")
    ax.axis("off")
    fig.savefig(path, bbox_inches="tight", dpi=dpi)
    plt.close(fig)


def centros_overlay(res, path: str | Path, dpi: int = 110) -> None:
    """Un punto por planta (`centros.detectar`) y el tamaño de planta usado, como referencia."""
    h, w = res.rgb.shape[:2]
    fig, ax = plt.subplots(figsize=(w / dpi, h / dpi))
    ax.imshow(res.rgb)
    d = res.detecciones
    ax.scatter(d["x_px"], d["y_px"], s=36, c="#ff2bd6", edgecolors="white", linewidths=0.8)
    if res.escala.px:
        r = res.escala.px / 2
        ax.add_patch(plt.Circle((r + 8, r + 8), r, fill=False, ec="white", lw=1.5, ls="--"))
    lo, hi = res.rango
    rango = f" (entre {lo} y {hi})" if (lo, hi) != (res.n, res.n) else ""
    ax.set_title(f"{res.n} plantas{rango} · forma {res.forma} · escala {res.escala.px} px")
    ax.axis("off")
    fig.savefig(path, bbox_inches="tight", dpi=dpi)
    plt.close(fig)
