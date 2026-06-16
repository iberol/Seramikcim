"""
conftest.py — pytest fixture'ları

Test'lerin paylaştığı yapay DXF dosyası + diğer ortak fixture'lar.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


# Proje kökünü sys.path'e ekle (dxf_to_3d, prepare_simulation, api import için)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def fixtures_dir(tmp_path_factory) -> Path:
    """Test fixture'ları için geçici dizin (session lifetime)."""
    d = tmp_path_factory.mktemp("seramikcim_fixtures")
    return d


@pytest.fixture(scope="session")
def simple_room_dxf(fixtures_dir: Path) -> Path:
    """
    Basit 4 duvarlı dikdörtgen oda DXF dosyası (200×150 cm).
    Layer: WALLS — LWPOLYLINE.
    """
    import ezdxf

    path = fixtures_dir / "simple_room.dxf"
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 5  # 5 = centimeters
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (200, 0), (200, 150), (0, 150), (0, 0)],
        close=True,
        dxfattribs={"layer": "WALLS"},
    )
    doc.saveas(path)
    return path


@pytest.fixture(scope="session")
def l_shaped_room_dxf(fixtures_dir: Path) -> Path:
    """L-şekilli oda DXF (test_complex_bathroom benzeri)."""
    import ezdxf

    path = fixtures_dir / "l_shaped_room.dxf"
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 5
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [
            (0, 0), (240, 0), (240, 220),
            (320, 220), (320, 320), (0, 320), (0, 0),
        ],
        close=True,
        dxfattribs={"layer": "WALLS"},
    )
    doc.saveas(path)
    return path


@pytest.fixture(scope="session")
def simple_room_obj(fixtures_dir: Path) -> Path:
    """
    Basit 3×2×2.6 m kutu oda OBJ (mesh_to_3d testleri için).
    trimesh.creation.box ile üretilir.
    """
    import trimesh

    path = fixtures_dir / "simple_room.obj"
    # extents = [X, Y, Z]: X=3m genişlik, Y=2.6m yükseklik, Z=2m derinlik
    room = trimesh.creation.box(extents=[3.0, 2.6, 2.0])
    room.export(str(path))
    return path


@pytest.fixture(scope="session")
def big_scale_room_obj(fixtures_dir: Path) -> Path:
    """
    cm-ölçekli oda OBJ (auto-scale tespiti için).
    300×260×200 cm.
    """
    import trimesh

    path = fixtures_dir / "big_scale_room.obj"
    room = trimesh.creation.box(extents=[300.0, 260.0, 200.0])
    room.export(str(path))
    return path


@pytest.fixture(scope="session")
def temp_catalog_file(tmp_path_factory) -> Path:
    """FastAPI testleri için geçici catalog.json."""
    import json
    d = tmp_path_factory.mktemp("api_storage")
    f = d / "catalog.json"
    sample = {
        "products": [
            {
                "id": "test-tile-1",
                "type": "tile",
                "name": "Test Beyaz",
                "category": "tile",
                "width_m": 0.30,
                "height_m": 0.60,
                "color": "#ffffff",
                "price_try": 100,
                "pieces_per_box": 8,
            },
            {
                "id": "test-fixture-1",
                "type": "fixture",
                "fixtureKind": "sink",
                "name": "Test Lavabo",
                "category": "fixture",
                "color": "#eeeeee",
                "price_try": 1500,
            },
        ]
    }
    f.write_text(json.dumps(sample), encoding="utf-8")
    return f
