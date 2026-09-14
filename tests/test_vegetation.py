import numpy as np

from centinela_core.vegetation import excess_green, vegetation_mask


def test_exg_higher_on_crowns_than_soil(orchard_small):
    img, gt = orchard_small
    exg = excess_green(img)

    yy, xx = np.mgrid[0 : img.shape[0], 0 : img.shape[1]]
    on_crown = np.zeros(img.shape[:2], dtype=bool)
    for x, y in gt[["x", "y"]].to_numpy():
        on_crown |= (yy - y) ** 2 + (xx - x) ** 2 <= 8**2

    assert exg[on_crown].mean() > exg[~on_crown].mean() + 0.1


def test_vegetation_mask_fraction_reasonable(orchard_small):
    img, _ = orchard_small
    mask = vegetation_mask(img, index="exg", threshold="otsu")
    frac = mask.mean()
    assert 0.03 < frac < 0.6


def test_fixed_threshold_path(orchard_small):
    img, _ = orchard_small
    mask = vegetation_mask(img, index="exg", threshold=0.15)
    assert mask.any()
