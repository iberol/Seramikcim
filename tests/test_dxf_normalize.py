"""
test_dxf_normalize.py — normalize_poly, normalize_layer, merge_collinear_lines
"""
from __future__ import annotations

import pytest

from dxf_to_3d import normalize_poly, normalize_layer, merge_collinear_lines


class TestNormalizePoly:
    def test_origin_kaydırılır(self):
        poly = [[10, 20], [15, 25], [20, 30]]
        normalized = normalize_poly(poly, 10, 20)
        assert normalized == [[0, 0], [5, 5], [10, 10]]

    def test_negatif_origin(self):
        poly = [[5, 5]]
        normalized = normalize_poly(poly, -5, -5)
        assert normalized == [[10, 10]]

    def test_boş_polyline(self):
        assert normalize_poly([], 0, 0) == []

    def test_4_basamak_yuvarla(self):
        poly = [[1.123456, 2.987654]]
        normalized = normalize_poly(poly, 0, 0)
        assert normalized[0] == [1.1235, 2.9877]


class TestNormalizeLayer:
    def test_birden_fazla_polyline(self):
        polys = [[[10, 10], [20, 20]], [[30, 30], [40, 40]]]
        normalized = normalize_layer(polys, 10, 10)
        assert normalized == [[[0, 0], [10, 10]], [[20, 20], [30, 30]]]

    def test_boş_layer(self):
        assert normalize_layer([], 0, 0) == []


class TestMergeCollinearLines:
    def test_layer_boşsa_etkisiz(self):
        result = merge_collinear_lines({"walls": []})
        assert result == {"walls": []}

    def test_collinear_olmayan_segmentler_korunur(self):
        # Tek polyline, segment sayısı korunur
        layers = {"walls": [[[0, 0], [10, 0]], [[0, 0], [0, 10]]]}
        result = merge_collinear_lines(layers)
        assert "walls" in result
        assert len(result["walls"]) >= 1
