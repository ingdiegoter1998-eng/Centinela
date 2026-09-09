import numpy as np
from scipy import ndimage as ndi

from centinela_core.morphology import clean_mask
from centinela_core.segment import separate_crowns
from centinela_core.synthetic import make_orchard
from centinela_core.vegetation import vegetation_mask


def _mask(img):
    return clean_mask(vegetation_mask(img, "exg", "otsu"))


def test_separated_crowns_one_instance_each():
    img, gt = make_orchard(n_rows=5, n_cols=5, spacing=70, crown_radius=16, seed=2)
    n = int(separate_crowns(_mask(img), min_distance_px=15).max())
    assert abs(n - len(gt)) <= 3


def test_watershed_beats_connected_components_on_touching_crowns():
    # Copas en contacto: los componentes conexos colapsan varias copas en un blob;
    # el watershed debe recuperar bastantes más instancias.
    img, gt = make_orchard(n_rows=5, n_cols=5, spacing=42, crown_radius=18, seed=3)
    mask = _mask(img)
    n_cc = int(ndi.label(mask)[1])
    n_ws = int(separate_crowns(mask, min_distance_px=15).max())
    assert n_ws >= n_cc + 5
    assert n_ws >= 0.5 * len(gt)


def test_empty_mask_returns_zero_labels():
    labels = separate_crowns(np.zeros((50, 50), dtype=bool))
    assert labels.max() == 0
