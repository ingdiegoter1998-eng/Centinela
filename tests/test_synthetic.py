import numpy as np

from centinela_core.synthetic import make_orchard


def test_sin_maleza_la_imagen_no_cambia():
    # La maleza usa su propio generador: añadirla no puede alterar los huertos
    # sobre los que se midieron las Etapas I y II.
    a, gt_a = make_orchard(seed=0)
    b, gt_b = make_orchard(seed=0, n_weeds=0)
    assert np.array_equal(a, b)
    assert gt_a.equals(gt_b)


def test_maleza_no_entra_al_ground_truth():
    _, gt = make_orchard(seed=0, n_weeds=25)
    assert len(gt) == 80


def test_maleza_solo_toca_el_espacio_entre_copas():
    limpio, _ = make_orchard(seed=0)
    maleza, _ = make_orchard(seed=0, n_weeds=25)
    cambiados = np.any(limpio != maleza, axis=2)
    assert 0 < cambiados.mean() < 0.1
