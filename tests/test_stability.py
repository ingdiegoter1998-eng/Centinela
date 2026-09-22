import numpy as np
import pandas as pd

from centinela_core.stability import estabilidad, veredicto


def _blob(area, lightness, a, b, circ, ecc, ext):
    return {
        "label": 0, "x_px": 0.0, "y_px": 0.0, "area_px": area,
        "color_l": lightness, "color_a": a, "color_b": b,
        "circularity": circ, "eccentricity": ecc, "extent": ext,
    }


def _separable(rng, n_copas=60, n_distractores=15):
    """Copas parecidas entre sí + distractores dispersos: hay estructura real."""
    rows = [
        _blob(300 + rng.normal(0, 30), 55 + rng.normal(0, 3), -20 + rng.normal(0, 1.5),
              25 + rng.normal(0, 1.5), 0.85 + rng.normal(0, 0.03), 0.3 + rng.normal(0, 0.05),
              0.78 + rng.normal(0, 0.03))
        for _ in range(n_copas)
    ]
    rows += [
        _blob(rng.uniform(60, 2000), rng.uniform(15, 80), rng.uniform(-10, 10),
              rng.uniform(0, 20), rng.uniform(0.2, 0.6), rng.uniform(0.6, 0.99),
              rng.uniform(0.3, 0.6))
        for _ in range(n_distractores)
    ]
    return pd.DataFrame(rows)


def _continuo(rng, n=200):
    """Descriptores uniformes: no hay nube "copas" que separar."""
    return pd.DataFrame([
        _blob(rng.uniform(60, 3000), rng.uniform(20, 80), rng.uniform(-25, 5),
              rng.uniform(0, 30), rng.uniform(0.2, 0.95), rng.uniform(0.1, 0.99),
              rng.uniform(0.3, 0.9))
        for _ in range(n)
    ])


def test_estructura_real_da_meseta_con_el_conteo_correcto():
    e = estabilidad(_separable(np.random.default_rng(0)))
    assert e.veredicto == "estable", e.barrido
    assert e.conteo_meseta == 60
    lo, hi = e.meseta
    assert lo <= 0.8 <= hi  # el eps por defecto cae dentro de la meseta


def test_nube_continua_no_tiene_estructura():
    e = estabilidad(_continuo(np.random.default_rng(0)))
    assert e.veredicto == "sin_estructura", e.barrido
    assert e.meseta is None


def _barrido(arboles, descartadas, decisiones=None):
    n = len(arboles)
    return pd.DataFrame({
        "eps": np.linspace(0.5, 3.0, n),
        "arboles": arboles,
        "descartadas_pct": descartadas,
        "ruido_pct": descartadas,
        "clusters": [1] * n,
        "decision": decisiones or ["dbscan"] * n,
    })


def test_rampa_sin_meseta_es_inestable():
    # Lo medido sobre huerto_reticula_usda: el conteo sube con eps sin detenerse.
    b = _barrido([6, 36, 137, 190, 211, 215], [97, 83, 37, 13, 3, 1])
    e = veredicto(b)
    assert e.veredicto == "inestable"
    assert e.meseta is None


def test_meseta_por_saturacion_no_cuenta():
    # A eps grande todo cae en un cluster y el conteo se "estabiliza" en el total de
    # manchas. Eso no es estructura: DBSCAN ya no descarta nada.
    b = _barrido([6, 36, 137, 214, 216, 218], [97, 83, 37, 2, 1, 0])
    assert veredicto(b).veredicto != "estable"


def test_fallback_no_cuenta_como_decision():
    b = _barrido([80] * 6, [0] * 6, ["fallback"] * 6)
    assert veredicto(b).veredicto == "sin_estructura"


def test_meseta_mas_larga_gana():
    b = _barrido([40, 41, 60, 61, 60, 61, 60], [50, 49, 25, 24, 25, 24, 25])
    e = veredicto(b)
    assert e.veredicto == "estable"
    assert e.conteo_meseta == 60


# --- de punta a punta: el veredicto solo dice "estable" cuando el conteo es correcto ---

def _correr(tmp_path, nombre, features, **kw):
    import cv2

    from centinela_core.config import Config
    from centinela_core.evaluate import evaluate
    from centinela_core.pipeline import run
    from centinela_core.synthetic import make_orchard

    img, gt = make_orchard(seed=0, **kw)
    path = tmp_path / f"{nombre}.png"
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    cfg = Config()
    cfg.cluster.features = list(features)
    r = run(path, cfg)
    ev = evaluate(r.trees[["x_px", "y_px"]].to_numpy(), gt[["x", "y"]].to_numpy(), 14)
    return estabilidad(r.detections, features=features), ev


def test_maleza_con_descriptores_de_forma_es_estable_y_correcto(tmp_path):
    from centinela_core.cluster import SHAPE_COLS

    e, ev = _correr(tmp_path, "maleza", SHAPE_COLS, n_weeds=25)
    assert e.veredicto == "estable", e.barrido
    assert abs(e.conteo_meseta - 80) <= 2
    assert ev.f1 >= 0.95


def test_el_mismo_ajuste_sin_maleza_se_detecta_como_inestable(tmp_path):
    # Solo-forma fragmenta el huerto limpio (F1 ≈ 0.14). El conteo es malo y el
    # veredicto tiene que decirlo: este es el caso que el chequeo existe para atrapar.
    from centinela_core.cluster import SHAPE_COLS

    e, ev = _correr(tmp_path, "limpio", SHAPE_COLS)
    assert ev.f1 < 0.5
    assert e.veredicto != "estable"
