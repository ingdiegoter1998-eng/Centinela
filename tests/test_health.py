"""Etapa II — z-score robusto direccional y banderas de estado (ROADMAP §6.8)."""

import cv2
import numpy as np
import pandas as pd
import pytest

from centinela_core.config import Config
from centinela_core.health import characterize, robust_z, summary
from centinela_core.pipeline import run
from centinela_core.synthetic import make_orchard


def _trees(n, **overrides):
    """n árboles idénticos; `overrides` reemplaza columnas por listas."""
    base = {
        "area_px": [300.0] * n,
        "vari": [0.45] * n,
        "gli": [0.30] * n,
        "gap_fraction": [0.02] * n,
        "solidity": [0.95] * n,
        "is_tree": [True] * n,
    }
    base.update(overrides)
    return pd.DataFrame(base)


# ── robust_z ──────────────────────────────────────────────────────────


def test_robust_z_centra_en_la_mediana():
    z = robust_z(np.array([10.0, 10.0, 10.0, 10.0, 20.0]))
    assert z[0] == pytest.approx(0.0)  # la mediana queda en cero
    assert z[-1] > 0


def test_robust_z_sin_dispersion_no_revienta():
    z = robust_z(np.array([5.0] * 10))
    assert np.all(z == 0.0)


def test_robust_z_vacio():
    assert robust_z(np.array([])).size == 0


def test_robust_z_resiste_outliers():
    """Un valor absurdo no debe mover la referencia del resto.

    La garantía es del MAD, así que se prueba con datos continuos — que es el
    caso real de un huerto. Con valores todos idénticos el MAD degenera y se
    entra en la escalera de respaldo, donde esta propiedad ya no se sostiene.
    """
    normales = list(np.linspace(9.5, 10.5, 20))
    z_solo = robust_z(np.array(normales))
    z_con_outlier = robust_z(np.array(normales + [10_000.0]))
    # El outlier no infla la escala: los normales conservan su z casi igual.
    assert np.allclose(z_solo, z_con_outlier[:-1], atol=0.15)
    # Y el outlier sí queda disparado.
    assert z_con_outlier[-1] > 100


def test_robust_z_usa_respaldo_si_el_mad_colapsa():
    """19 valores idénticos + 1 raro: el MAD es 0, pero el raro debe destacar."""
    z = robust_z(np.array([300.0] * 19 + [90.0]))
    assert abs(z[-1]) > 2.0
    assert z[0] == pytest.approx(0.0)


# ── direccionalidad ───────────────────────────────────────────────────


def test_arbol_mas_grande_y_mas_verde_no_se_marca():
    df = _trees(20)
    df.loc[0, "area_px"] = 900.0  # el triple de grande
    df.loc[0, "vari"] = 0.90  # el doble de verde
    out = characterize(df, z_threshold=2.0)
    assert out.loc[0, "flag"] == "normal"


def test_arbol_mas_chico_si_se_marca():
    df = _trees(20, area_px=[300.0] * 19 + [90.0])
    out = characterize(df, z_threshold=2.0)
    assert out.loc[19, "flag"] == "revisar"
    assert "area" in out.loc[19, "motivo"]


def test_arbol_menos_verde_si_se_marca():
    df = _trees(20, vari=[0.45] * 19 + [0.05])
    out = characterize(df, z_threshold=2.0)
    assert out.loc[19, "flag"] == "revisar"
    assert "vigor" in out.loc[19, "motivo"]


def test_mas_huecos_si_se_marca():
    df = _trees(20, gap_fraction=[0.02] * 19 + [0.40])
    out = characterize(df, z_threshold=2.0)
    assert "gap" in out.loc[19, "motivo"]


# ── casos borde ───────────────────────────────────────────────────────


def test_huerto_uniforme_no_marca_a_nadie():
    out = characterize(_trees(30), z_threshold=2.0)
    assert (out["flag"] == "normal").all()


def test_pocos_arboles_no_se_evaluan():
    df = _trees(3, area_px=[300.0, 300.0, 20.0])
    out = characterize(df, z_threshold=2.0, min_trees=5)
    assert (out["flag"] == "normal").all()


def test_dataframe_vacio():
    out = characterize(pd.DataFrame(columns=["is_tree"]))
    assert len(out) == 0
    assert "flag" in out.columns


def test_metricas_desconocidas_fallan():
    with pytest.raises(ValueError, match="métricas desconocidas"):
        characterize(_trees(10), metrics=["inventada"])


def test_vigor_index_invalido_falla():
    with pytest.raises(ValueError, match="vigor_index"):
        characterize(_trees(10), vigor_index="ndvi")


def test_manchas_descartadas_no_llevan_bandera():
    df = _trees(10)
    df.loc[9, "is_tree"] = False
    out = characterize(df)
    assert out.loc[9, "flag"] == ""


# ── end-to-end sobre sintético (§6.8) ─────────────────────────────────


def test_detecta_anomalos_inyectados(tmp_path):
    """80 sanos + 8 anómalos → recall ≥ 0.80 y falsos positivos < 10 %."""
    img, gt = make_orchard(n_rows=8, n_cols=11, n_anomalous=8, seed=7)
    path = tmp_path / "huerto.png"
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))

    cfg = Config()
    result = run(path, cfg)
    dets = characterize(
        result.detections,
        vigor_index=cfg.health.vigor_index,
        z_threshold=cfg.health.z_threshold,
        metrics=cfg.health.metrics,
    )
    trees = dets[dets["is_tree"]]

    # Emparejar cada árbol del GT con la detección más cercana.
    gt_xy = gt[["x", "y"]].to_numpy()
    det_xy = trees[["x_px", "y_px"]].to_numpy()
    flags = trees["flag"].to_numpy()

    marcado_por_gt = []
    for x, y in gt_xy:
        d = np.hypot(det_xy[:, 0] - x, det_xy[:, 1] - y)
        j = int(d.argmin())
        marcado_por_gt.append(flags[j] == "revisar" if d[j] <= 20 else False)
    marcado = np.array(marcado_por_gt)
    anomalo = gt["anomalous"].to_numpy()

    recall = marcado[anomalo].mean()
    fp_rate = marcado[~anomalo].mean()
    assert recall >= 0.80, f"recall={recall:.2f}, fp={fp_rate:.2f}"
    assert fp_rate < 0.10, f"recall={recall:.2f}, fp={fp_rate:.2f}"


def test_summary_cuenta_motivos():
    df = _trees(20, area_px=[300.0] * 18 + [80.0, 85.0])
    out = characterize(df, z_threshold=2.0)
    s = summary(out)
    assert s["n_trees"] == 20
    assert s["n_flagged"] >= 1
    assert "area" in s["por_motivo"]
