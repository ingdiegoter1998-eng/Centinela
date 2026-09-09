import numpy as np
import pandas as pd

from centinela_core.cluster import FEATURE_COLS, cluster_blobs


def _blob(area, lightness, a, b, circ, ecc, ext):
    return {
        "label": 0, "x_px": 0.0, "y_px": 0.0, "area_px": area,
        "color_l": lightness, "color_a": a, "color_b": b,
        "circularity": circ, "eccentricity": ecc, "extent": ext,
    }


def test_dominant_cluster_are_trees():
    rng = np.random.default_rng(0)
    rows = []
    # 40 copas parecidas
    for _ in range(40):
        rows.append(_blob(300 + rng.normal(0, 15), 55 + rng.normal(0, 2), -20, 25,
                          0.9, 0.3, 0.8))
    # 8 sombras: oscuras, alargadas, chicas
    for _ in range(8):
        rows.append(_blob(90 + rng.normal(0, 10), 25, 2, 3, 0.5, 0.85, 0.5))
    df = pd.DataFrame(rows)

    out = cluster_blobs(df, eps=0.9, min_samples=5)
    trees = out[out["is_tree"]]
    assert 35 <= len(trees) <= 42
    assert out.loc[out.index[-8:], "is_tree"].sum() <= 2


def test_empty_input():
    df = pd.DataFrame(columns=["label", "x_px", "y_px", *FEATURE_COLS])
    out = cluster_blobs(df)
    assert len(out) == 0
    assert "is_tree" in out.columns


def test_no_cluster_degrades_to_all_trees():
    df = pd.DataFrame([_blob(i * 1000, i * 10, i, i, 0.1 * i, 0.09 * i, 0.1 * i) for i in range(1, 5)])
    out = cluster_blobs(df, eps=0.01, min_samples=3)
    assert out["is_tree"].all()
