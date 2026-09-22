"""End-to-end sobre huerto sintético con GT conocido + chequeo de robustez (ROADMAP §5.8)."""

import cv2
import pytest

from centinela_core.config import Config
from centinela_core.evaluate import evaluate
from centinela_core.pipeline import run
from centinela_core.synthetic import perturb


def _run_on(tmp_path, img, name="orchard.png"):
    path = tmp_path / name
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    return run(path, Config())


def test_end_to_end_f1(tmp_path, orchard_medium):
    img, gt = orchard_medium
    result = _run_on(tmp_path, img)
    res = evaluate(result.trees[["x_px", "y_px"]].to_numpy(), gt[["x", "y"]].to_numpy(),
                   match_radius_px=14)
    assert res.f1 >= 0.85, res.as_dict()
    assert res.count_error <= 0.15, res.as_dict()


def test_reproducible(tmp_path, orchard_medium):
    img, _ = orchard_medium
    a = _run_on(tmp_path, img, "a.png")
    b = _run_on(tmp_path, img, "b.png")
    assert a.n_trees == b.n_trees


@pytest.mark.parametrize("kind", ["bright+", "bright-", "noise"])
def test_robustness_to_perturbations(tmp_path, orchard_medium, kind):
    img, gt = orchard_medium
    result = _run_on(tmp_path, perturb(img, kind), f"{kind}.png")
    res = evaluate(result.trees[["x_px", "y_px"]].to_numpy(), gt[["x", "y"]].to_numpy(),
                   match_radius_px=16)
    # no exigimos el mismo F1, solo que no colapse
    assert res.recall >= 0.7, (kind, res.as_dict())


def test_conteo_sintetico_no_depende_de_dbscan(tmp_path, orchard_medium):
    """Documenta el hallazgo de docs/resultados-imagen-real.md §5.6.

    Sobre el sintético DBSCAN no llega a decidir: el conteo sale igual sin agrupar.
    Si algún día este test falla porque DBSCAN empieza a cambiar el conteo, es buena
    noticia — y hay que revisar las métricas de la Etapa I.
    """
    img, _ = orchard_medium
    path = tmp_path / "orchard.png"
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))

    cfg_ws = Config()
    cfg_ws.cluster.method = "watershed"
    con_dbscan = run(path, Config())
    sin_dbscan = run(path, cfg_ws)

    assert con_dbscan.decision == "fallback"
    assert sin_dbscan.decision == "watershed"
    assert con_dbscan.n_trees == sin_dbscan.n_trees
