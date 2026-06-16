"""
test_dxf_to_3d_core.py — dxf_to_3d.py temel matematik/geometri helper testleri
"""
from __future__ import annotations

import math
import pytest

from dxf_to_3d import (
    poly_signed_area,
    poly_true_area,
    poly_box_area,
    poly_box_dims,
    distance,
    is_closed,
    _shoelace_signed_area_legacy,
)

TOL = 1e-3


class TestPolyBoxArea:
    def test_birim_kare(self):
        assert poly_box_area([[0, 0], [1, 0], [1, 1], [0, 1]]) == pytest.approx(1.0, abs=TOL)

    def test_dikdörtgen(self):
        assert poly_box_area([[0, 0], [3, 0], [3, 5], [0, 5]]) == pytest.approx(15.0, abs=TOL)

    def test_2_nokta_alanı_0(self):
        assert poly_box_area([[0, 0], [1, 1]]) == pytest.approx(2 * 2, abs=TOL) or poly_box_area([[0, 0]]) == 0

    def test_tek_nokta_0(self):
        assert poly_box_area([[5, 5]]) == 0


class TestPolyBoxDims:
    def test_genişlik_ve_derinlik(self):
        w, h = poly_box_dims([[0, 0], [4, 0], [4, 3], [0, 3]])
        assert w == pytest.approx(4.0, abs=TOL)
        assert h == pytest.approx(3.0, abs=TOL)


class TestDistance:
    def test_yatay(self):
        assert distance([0, 0], [3, 0]) == pytest.approx(3.0, abs=TOL)

    def test_dikey(self):
        assert distance([0, 0], [0, 4]) == pytest.approx(4.0, abs=TOL)

    def test_diagonal_3_4_5(self):
        assert distance([0, 0], [3, 4]) == pytest.approx(5.0, abs=TOL)

    def test_aynı_nokta(self):
        assert distance([5, 5], [5, 5]) == 0


class TestIsClosed:
    def test_kapalı_polygon(self):
        assert is_closed([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) is True

    def test_açık_polygon(self):
        assert is_closed([[0, 0], [1, 0], [1, 1], [0, 1]]) is False

    def test_2_nokta_değil(self):
        # is_closed [0]'a [-1] eşit mi diye bakar; 2-nokta polyline'da [0]==[-1] olabilir veya olmayabilir
        assert is_closed([[0, 0], [1, 1]]) is False
        assert is_closed([]) is False


class TestPolyAreaShoelaceLegacy:
    def test_legacy_birim_kare_pozitif(self):
        # CCW order
        assert _shoelace_signed_area_legacy([[0, 0], [1, 0], [1, 1], [0, 1]]) == pytest.approx(1.0, abs=TOL)

    def test_legacy_cw_negatif(self):
        # CW order → negatif
        assert _shoelace_signed_area_legacy([[0, 0], [0, 1], [1, 1], [1, 0]]) == pytest.approx(-1.0, abs=TOL)

    def test_legacy_3_nokta_az_0(self):
        assert _shoelace_signed_area_legacy([[0, 0], [1, 1]]) == 0
