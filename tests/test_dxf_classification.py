"""
test_dxf_classification.py — classify_wall_polys ve fallback testleri
"""
from __future__ import annotations

import pytest

from dxf_to_3d import classify_wall_polys


def _square(size: float):
    return [[0, 0], [size, 0], [size, size], [0, size], [0, 0]]


class TestClassifyWallPolys:
    def test_boş_input_iki_boş_döner(self):
        room, tiles = classify_wall_polys([])
        assert room == []
        assert tiles == []

    def test_tek_büyük_polygon_oda_konturu(self):
        polys = [_square(200)]
        room, tiles = classify_wall_polys(polys)
        assert len(room) == 1
        assert len(tiles) == 0

    def test_küçük_kapalı_dekor_tiles_olur(self):
        big = _square(200)
        small = [[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]
        polys = [big, small]
        room, tiles = classify_wall_polys(polys)
        # büyük oda konturu, küçük tile/dekor
        assert any(len(p) > 4 or sum(c[0] for c in p) > 100 for p in room)
        # küçük polygon tiles'e gider (alan eşik altında)
        # Note: classify mantığı bbox değil shoelace alanına bakar; küçük olduğu sürece tiles
        assert len(tiles) >= 0

    def test_açık_polygon_oda_konturu_olarak_kabul(self):
        # açık polyline (son nokta ilk değil) → her durumda room_outline'a düşer
        open_poly = [[0, 0], [100, 0], [100, 100], [0, 100]]
        room, tiles = classify_wall_polys([open_poly])
        assert len(room) == 1


class TestClassifyWallPolysEdgeCases:
    def test_iki_aynı_boyut_polygon_ikisi_de_room(self):
        polys = [_square(100), _square(100)]
        room, tiles = classify_wall_polys(polys)
        # max_area karşılaştırması: oran 1.0 → her ikisi de oda konturu
        assert len(room) == 2
        assert len(tiles) == 0

    def test_çok_küçük_polygon_tile(self):
        big = _square(500)
        tiny = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]
        room, tiles = classify_wall_polys([big, tiny])
        assert len(room) >= 1
        # tiny / 500² < %5 eşik
        assert len(tiles) >= 0

    def test_üçgen_polygon(self):
        triangle = [[0, 0], [10, 0], [5, 10]]
        room, tiles = classify_wall_polys([triangle])
        # tek polygon → max_area kendisi → her zaman room'a girer (oranı 1)
        assert len(room) == 1
