import numpy as np

from centinela_core.evaluate import evaluate


def test_perfect_match():
    pts = np.array([[10, 10], [20, 20], [30, 30]], dtype=float)
    r = evaluate(pts, pts, match_radius_px=5)
    assert r.tp == 3 and r.fp == 0 and r.fn == 0
    assert r.f1 == 1.0
    assert r.count_error == 0.0


def test_small_offset_still_matches():
    gt = np.array([[10, 10], [20, 20]], dtype=float)
    det = gt + 2.0
    r = evaluate(det, gt, match_radius_px=5)
    assert r.tp == 2


def test_offset_beyond_radius_is_miss():
    gt = np.array([[10, 10]], dtype=float)
    det = np.array([[40, 40]], dtype=float)
    r = evaluate(det, gt, match_radius_px=5)
    assert r.tp == 0 and r.fp == 1 and r.fn == 1
    assert r.f1 == 0.0


def test_extra_detections_are_fp():
    gt = np.array([[10, 10]], dtype=float)
    det = np.array([[10, 10], [11, 11], [12, 12]], dtype=float)
    r = evaluate(det, gt, match_radius_px=3)
    assert r.tp == 1 and r.fp == 2
    assert r.count_error == 2.0


def test_empty_inputs_do_not_crash():
    assert evaluate(np.empty((0, 2)), np.empty((0, 2))).f1 == 0.0
    assert evaluate(np.empty((0, 2)), [[1, 1]]).fn == 1
    assert evaluate([[1, 1]], np.empty((0, 2))).fp == 1
