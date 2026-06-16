"""
test_geometry_compat.py — Shapely entegrasyonu regresyon testleri

dxf_to_3d.py'deki Shapely tabanlı alan hesabının eski Shoelace implementasyonu
ile ±0.001 toleranslı eşleştiğini doğrular. compute_net_area helper'ının
intersection-aware çıkarma yaptığını kontrol eder.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dxf_to_3d import (
    _shoelace_signed_area_legacy,
    poly_signed_area,
    poly_true_area,
    compute_net_area,
)

TOL = 1e-3


# ── Temel şekiller ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("poly,expected_abs_area", [
    # Birim kare
    ([[0, 0], [1, 0], [1, 1], [0, 1]], 1.0),
    # 3×4 dikdörtgen
    ([[0, 0], [3, 0], [3, 4], [0, 4]], 12.0),
    # İkizkenar üçgen (taban 4, yükseklik 3)
    ([[0, 0], [4, 0], [2, 3]], 6.0),
    # L-şekil (toplam 5 m²: 3×2 + 1×1 sağ üstte... 6+1 - örtüşme = 7 değil aslında L)
    # Köşeleri: dikdörtgen 3x2 = 6, sonra çıkıntı 1x1 = 7 toplam
    ([[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [0, 2]], 5.0),
])
def test_legacy_vs_shapely_area_match(poly, expected_abs_area):
    """Shapely + legacy ±0.001 toleransla eşleşmeli, beklenen alana yakın olmalı."""
    legacy = abs(_shoelace_signed_area_legacy(poly))
    new = poly_true_area(poly)
    assert abs(legacy - new) < TOL, f"legacy={legacy}, new={new}"
    assert abs(new - expected_abs_area) < TOL, f"new={new}, expected={expected_abs_area}"


def test_signed_area_preserves_orientation():
    """İmzalı alan CCW pozitif, CW negatif olmalı (her iki implementasyonda)."""
    ccw = [[0, 0], [1, 0], [1, 1], [0, 1]]  # saatin tersi
    cw  = [[0, 0], [0, 1], [1, 1], [1, 0]]  # saatin yönü

    assert poly_signed_area(ccw) > 0
    assert poly_signed_area(cw) < 0
    assert abs(poly_signed_area(ccw)) == pytest.approx(1.0, abs=TOL)
    assert abs(poly_signed_area(cw))  == pytest.approx(1.0, abs=TOL)


def test_degenerate_inputs_return_zero():
    """2 nokta veya altı polyline alan 0 dönmeli."""
    assert poly_true_area([]) == 0.0
    assert poly_true_area([[0, 0]]) == 0.0
    assert poly_true_area([[0, 0], [1, 1]]) == 0.0


# ── compute_net_area ──────────────────────────────────────────────────────────

def test_compute_net_area_no_openings_equals_gross():
    """Açıklık yoksa net alan = brüt alan."""
    outline = [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert compute_net_area(outline, []) == pytest.approx(100.0, abs=TOL)
    assert compute_net_area(outline, None) == pytest.approx(100.0, abs=TOL)


def test_compute_net_area_interior_hole_subtracted():
    """Oda iç bölgesinde tam içerde bir açıklık alanı doğru çıkmalı."""
    outline = [[0, 0], [10, 0], [10, 10], [0, 10]]
    # 2×3'lük açıklık tam iç bölgede (2..4, 3..6)
    openings = [{"x": 2, "y": 3, "w": 2, "h": 3}]
    expected = 100.0 - 6.0
    assert compute_net_area(outline, openings) == pytest.approx(expected, abs=TOL)


def test_compute_net_area_perimeter_opening_partial_subtract():
    """Kenar üzerindeki açıklık sadece içeri düşen kısım kadar çıkarılmalı."""
    outline = [[0, 0], [10, 0], [10, 10], [0, 10]]
    # x=-1..2, y=5..6 → odaya 0..2 × 5..6 = 2 m² düşer
    openings = [{"x": -1, "y": 5, "w": 3, "h": 1}]
    assert compute_net_area(outline, openings) == pytest.approx(98.0, abs=TOL)


def test_compute_net_area_outside_opening_no_effect():
    """Tamamen oda dışındaki açıklık brüt alanı değiştirmemeli."""
    outline = [[0, 0], [10, 0], [10, 10], [0, 10]]
    openings = [{"x": 20, "y": 20, "w": 1, "h": 1}]
    assert compute_net_area(outline, openings) == pytest.approx(100.0, abs=TOL)


def test_compute_net_area_zero_size_opening_skipped():
    """w=0 veya h=0 olan açıklık atlanmalı."""
    outline = [[0, 0], [10, 0], [10, 10], [0, 10]]
    openings = [{"x": 1, "y": 1, "w": 0, "h": 5}, {"x": 3, "y": 3, "w": 2, "h": 0}]
    assert compute_net_area(outline, openings) == pytest.approx(100.0, abs=TOL)


def test_compute_net_area_multiple_openings():
    """Birden fazla iç açıklık toplam çıkarılmalı."""
    outline = [[0, 0], [20, 0], [20, 10], [0, 10]]
    openings = [
        {"x": 2, "y": 2, "w": 2, "h": 2},   # 4 m²
        {"x": 10, "y": 5, "w": 3, "h": 2},  # 6 m²
    ]
    expected = 200.0 - 4.0 - 6.0
    assert compute_net_area(outline, openings) == pytest.approx(expected, abs=TOL)


def test_compute_net_area_degenerate_outline():
    """Geçersiz outline 0 dönmeli."""
    assert compute_net_area([], [{"x": 0, "y": 0, "w": 1, "h": 1}]) == 0.0
    assert compute_net_area([[0, 0], [1, 0]], []) == 0.0
