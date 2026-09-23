"""Detección de centros (centinela_core/centros.py) — docs/resultados-centros.md."""

import numpy as np
import pandas as pd
import pytest

from centinela_core.annotate import _puntos_iniciales
from centinela_core.centros import detectar, estimar_escala
from centinela_core.config import Config
from centinela_core.evaluate import evaluate
from centinela_core.io import save_image
from centinela_core.pipeline import run
from centinela_core.synthetic import make_orchard, make_plantain


def _f1(res, gt):
    return evaluate(
        res.detecciones[["x_px", "y_px"]].to_numpy(), gt[["x", "y"]].to_numpy(),
        0.4 * res.escala.px,
    ).f1


@pytest.mark.parametrize(
    ("img_gt", "separacion"),
    [
        (make_orchard(seed=0), 62),
        (make_orchard(n_rows=5, n_cols=5, spacing=64, crown_radius=17, seed=1), 64),
        (make_plantain(seed=0), 80),
        (make_plantain(seed=4, spacing=60, leaf_len=34), 60),
    ],
)
def test_escala_sale_de_la_autocorrelacion(img_gt, separacion):
    escala = estimar_escala(img_gt[0])
    assert escala.fuente == "autocorrelacion"
    assert abs(escala.px - separacion) <= 0.08 * separacion


def test_sin_periodo_no_inventa_escala():
    ruido = np.random.default_rng(0).integers(0, 255, (300, 300, 3), dtype=np.uint8)
    res = detectar(ruido, "estrella")
    assert res.escala.px is None and res.escala.fuente == "sin_periodo"
    assert res.n == 0


def test_tamano_manual_manda_sobre_la_estimacion():
    img, _ = make_plantain(seed=0)
    res = detectar(img, "estrella", tamano_px=70)
    assert res.escala.fuente == "manual" and res.escala.px == 70


def test_copa_sobre_huerto_sintetico(orchard_medium):
    img, gt = orchard_medium
    res = detectar(img, "copa")
    assert _f1(res, gt) == 1.0
    assert res.consistente


def test_copa_con_maleza_no_cuenta_la_maleza():
    img, gt = make_orchard(seed=0, n_weeds=25)
    assert _f1(detectar(img, "copa"), gt) == 1.0


@pytest.mark.parametrize("seed", [0, 1, 2])
def test_estrella_sobre_platanal_sintetico(seed):
    img, gt = make_plantain(seed=seed)
    assert _f1(detectar(img, "estrella"), gt) >= 0.9


def test_segmentar_manchas_no_sirve_en_el_platanal(tmp_path):
    """El motivo del módulo: sobre pasto verde con hojas tocándose, el pipeline de
    manchas no llega a un conteo útil y el de centros sí."""
    img, gt = make_plantain(seed=0)
    ruta = tmp_path / "platanal.png"
    save_image(ruta, img)
    manchas = run(ruta, Config()).trees[["x_px", "y_px"]].to_numpy()
    f1_manchas = evaluate(manchas, gt[["x", "y"]].to_numpy(), 32).f1
    assert f1_manchas < 0.6
    assert _f1(detectar(img, "estrella"), gt) > f1_manchas + 0.3


def test_sensibilidad_reporta_rango():
    img, _ = make_plantain(seed=1)
    res = detectar(img, "estrella")
    lo, hi = res.rango
    assert set(res.sensibilidad) == {0.9, 1.0, 1.1}
    assert lo <= res.n <= hi


def test_forma_desconocida():
    with pytest.raises(ValueError):
        detectar(np.zeros((50, 50, 3), np.uint8), "triangulo")


def test_anotar_desde_lee_ambos_formatos(tmp_path):
    a = tmp_path / "a.csv"
    b = tmp_path / "b.csv"
    pd.DataFrame({"x_px": [1.0, 2.0], "y_px": [3.0, 4.0], "puntaje": [9, 9]}).to_csv(a, index=False)
    pd.DataFrame({"x": [5.0], "y": [6.0]}).to_csv(b, index=False)
    assert _puntos_iniciales(a) == [(1.0, 3.0), (2.0, 4.0)]
    assert _puntos_iniciales(b) == [(5.0, 6.0)]
    assert _puntos_iniciales(None) == []
