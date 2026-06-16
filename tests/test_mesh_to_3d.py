"""
test_mesh_to_3d.py — OBJ mesh pipeline testleri
"""
from __future__ import annotations

import math
import pytest

# trimesh kurulu değilse tüm modülü atla
trimesh = pytest.importorskip("trimesh")

from mesh_to_3d import (
    load_mesh,
    validate_and_repair,
    detect_scale,
    group_coplanar_faces,
    classify_horizontal,
    classify_vertical,
    extract_floor_outline,
    extract_wall_segments,
    polygon_to_outline,
    classify_opening,
    process,
    normalize_mesh,
    extract_outline_via_section,
    extract_outline_with_fallback,
)


# ── Load & validate ───────────────────────────────────────────────────────────

class TestLoadMesh:
    def test_var_olmayan_systemexit(self, tmp_path):
        with pytest.raises(SystemExit):
            load_mesh(str(tmp_path / "nope.obj"))

    def test_basit_oda_yuklenir(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        assert mesh is not None
        assert len(mesh.vertices) >= 8
        assert len(mesh.faces) >= 12


class TestValidateAndRepair:
    def test_kapali_kutu_watertight(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        report = validate_and_repair(mesh)
        assert report["vertex_count"] >= 8
        assert report["face_count"] >= 12
        assert isinstance(report["warnings"], list)


# ── Scale detection ──────────────────────────────────────────────────────────

class TestDetectScale:
    def test_metre_olcekli(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        scale, source = detect_scale(mesh)
        # 3m bbox → 1–10 → m (scale=1.0)
        assert scale == 1.0
        assert "m" in source

    def test_cm_olcekli(self, big_scale_room_obj):
        mesh = load_mesh(str(big_scale_room_obj))
        scale, source = detect_scale(mesh)
        # Yükseklik-tabanlı tespit: 300 birim × 0.01 = 3.0 m (makul oda
        # yüksekliği) → cm. mm (0.3 m) çok kısa olduğu için elenir.
        assert scale == 0.01
        assert "cm" in source


# ── Face gruplama ────────────────────────────────────────────────────────────

class TestGroupCoplanarFaces:
    def test_kutu_6_grup_uretir(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        # Bir kutu 6 yüzeye sahip — kapalı kutuda 12 üçgen 6 plane'e gruplanır
        assert len(groups) == 6

    def test_her_grup_face_indices(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        for g in groups:
            assert "normal" in g and len(g["normal"]) == 3
            assert "offset" in g
            assert "face_indices" in g and len(g["face_indices"]) >= 1
            assert g["area"] > 0


# ── Sınıflandırma ────────────────────────────────────────────────────────────

class TestClassifyHorizontal:
    def test_zemin_ve_tavan_tespit(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        floor, ceiling = classify_horizontal(groups)
        assert floor is not None
        assert ceiling is not None
        assert floor["normal"][1] > 0.9    # +Y
        assert ceiling["normal"][1] < -0.9 # -Y


class TestClassifyVertical:
    def test_4_duvar_tespit(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        walls = classify_vertical(groups)
        # Kutu odanın 4 dikey yüzeyi olmalı
        assert len(walls) == 4

    def test_duvar_xz_normali_birimsel(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        walls = classify_vertical(groups)
        for w in walls:
            n2d = w["normal_2d"]
            mag = math.hypot(n2d[0], n2d[1])
            assert mag == pytest.approx(1.0, abs=1e-3)


# ── Oda outline ──────────────────────────────────────────────────────────────

class TestExtractFloorOutline:
    def test_dikdortgen_outline(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        floor, _ = classify_horizontal(groups)
        outline = extract_floor_outline(mesh, floor)
        assert not outline.is_empty
        # 3m × 2m = 6 m² (X=3, Z=2)
        assert outline.area == pytest.approx(6.0, abs=0.01)

    def test_polygon_to_outline_4_kose(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        floor, _ = classify_horizontal(groups)
        outline = extract_floor_outline(mesh, floor)
        coords = polygon_to_outline(outline)
        # En az 4 köşe (kapalı için son nokta tekrar)
        assert len(coords) >= 4


class TestExtractWallSegments:
    def test_dikdortgen_4_segment(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        groups = group_coplanar_faces(mesh)
        floor, _ = classify_horizontal(groups)
        outline = extract_floor_outline(mesh, floor)
        segs = extract_wall_segments(outline)
        assert len(segs) == 4
        for s in segs:
            assert "a" in s and "b" in s and "length" in s
            assert s["length"] > 0


# ── Opening classification ───────────────────────────────────────────────────

class TestClassifyOpening:
    def test_kapi_yerden_yuksek(self):
        op = {"id": "x", "x": 0, "y": 0, "w": 0.9, "h": 2.1}
        result = classify_opening(op, wall_height=2.6)
        assert result["type"] == "door"

    def test_pencere_yerden_yuksek(self):
        op = {"id": "x", "x": 0, "y": 1.0, "w": 0.6, "h": 0.8}
        result = classify_opening(op, wall_height=2.6)
        assert result["type"] == "window"

    def test_nis_kucuk(self):
        # Niche: tipik küçük (25×35 cm); w<0.3 + h<0.4 → window eşiğinin altı
        op = {"id": "x", "x": 0, "y": 1.0, "w": 0.25, "h": 0.35}
        result = classify_opening(op, wall_height=2.6)
        assert result["type"] == "niche"

    def test_frame_default(self):
        op = {"id": "x", "x": 0, "y": 0.5, "w": 0.1, "h": 0.1}
        result = classify_opening(op, wall_height=2.6)
        # Düşük confidence frame'e gider
        assert result["confidence"] == "low"


# ── Process integration ──────────────────────────────────────────────────────

class TestProcessIntegration:
    def test_basit_oda_process_calisir(self, simple_room_obj):
        data = process(str(simple_room_obj))
        assert data is not None
        assert "meta" in data
        assert "room_outline" in data

    def test_meta_alanlari_var(self, simple_room_obj):
        data = process(str(simple_room_obj))
        m = data["meta"]
        assert m["scale_factor_to_meters"] > 0
        assert m["wall_height_m"] > 0
        assert m["room_true_area_m2"] > 0
        # Face-based v3 mode
        assert m["geometry_mode"] == "mesh-face"
        assert m["wall_tracer_version"] == "mesh-face-v1"

    def test_dxf_kontrat_uyumu(self, simple_room_obj):
        data = process(str(simple_room_obj))
        # dxf_to_3d.process ile aynı alanlar
        for key in ["meta", "room_outline", "tiles", "floor_lines", "door_polys",
                    "doors", "windows", "niches", "frames", "beams",
                    "detail_polys", "surface_segments", "wall_segments",
                    "features", "walls_raw"]:
            assert key in data, f"Çıktı kontratında eksik alan: {key}"

    def test_room_outline_kapali(self, simple_room_obj):
        data = process(str(simple_room_obj))
        assert len(data["room_outline"]) >= 1
        outline = data["room_outline"][0]
        assert len(outline) >= 4

    def test_wall_planes_4_adet(self, simple_room_obj):
        data = process(str(simple_room_obj))
        # 3×2 dikdörtgen oda → 4 wall_plane (face-based, her co-planar wall grup)
        walls = data["meta"]["surfaces"]["walls"]
        assert len(walls) == 4


# ── FAZ 2A: normalize + section testleri ───────────────────────────────────────

class TestNormalizeMesh:
    def test_x_z_origin_merkez(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        bmin, bmax = mesh.bounds
        cx = (bmin[0] + bmax[0]) / 2
        cz = (bmin[2] + bmax[2]) / 2
        assert abs(cx) < 1e-6
        assert abs(cz) < 1e-6

    def test_y_zeminde(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        assert abs(mesh.bounds[0][1]) < 1e-6


class TestExtractOutlineViaSection:
    def test_basit_kutu_section_1_3m(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        outline = extract_outline_via_section(mesh, section_height_m=1.3)
        assert outline is not None
        assert outline.area == pytest.approx(6.0, abs=0.05)

    def test_section_yok_yukseklik_dondursun_none(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        # Tavan üstünde (mesh 2.6m yüksek) section yok
        outline = extract_outline_via_section(mesh, section_height_m=5.0)
        assert outline is None


class TestExtractOutlineWithFallback:
    def test_basit_oda_1_3m_secer(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        outline, h = extract_outline_with_fallback(mesh)
        assert outline is not None
        assert h == 1.3  # default başarılı

    def test_outline_merkez_origin(self, simple_room_obj):
        mesh = load_mesh(str(simple_room_obj))
        validate_and_repair(mesh)
        normalize_mesh(mesh)
        outline, _ = extract_outline_with_fallback(mesh)
        cx, _, _, _ = outline.bounds[0], outline.bounds[1], outline.bounds[2], outline.bounds[3]
        minx, miny, maxx, maxy = outline.bounds
        assert abs((minx + maxx) / 2) < 0.1  # outline X merkez ≈ 0
        assert abs((miny + maxy) / 2) < 0.1  # outline Z merkez ≈ 0


class TestProcessNormalizeIntegration:
    def test_outline_origin_yakin_0(self, simple_room_obj):
        data = process(str(simple_room_obj))
        # Internal alanları temizle
        data.pop("_mesh", None)
        data.pop("_offset", None)
        data.pop("_section_height_m", None)
        outline = data["room_outline"][0]
        xs = [p[0] for p in outline]
        ys = [p[1] for p in outline]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        assert abs(cx) < 0.1
        assert abs(cy) < 0.1

    def test_meta_face_based_surfaces_yazildi(self, simple_room_obj):
        data = process(str(simple_room_obj))
        data.pop("_mesh", None)
        data.pop("_offset", None)
        # Face-based mode: meta.surfaces yapısı yazılmalı
        assert "surfaces" in data["meta"]
        s = data["meta"]["surfaces"]
        assert "floors" in s
        assert "walls" in s
        assert "ceilings" in s
        assert len(s["walls"]) >= 1
        assert s["total_floor_area"] > 0


class TestProcessGeometryMode:
    def test_meta_face_based_alani(self, simple_room_obj):
        data = process(str(simple_room_obj))
        data.pop("_mesh", None)
        data.pop("_offset", None)
        # Face-based meta yapısı
        assert "surfaces" in data["meta"]
        s = data["meta"]["surfaces"]
        for k in ("floors", "walls", "ceilings", "total_floor_area",
                  "total_wall_area", "total_surface_area"):
            assert k in s
        # JSON serializable
        assert isinstance(s["total_floor_area"], float)

    def test_json_serializable(self, simple_room_obj):
        import json
        data = process(str(simple_room_obj))
        data.pop("_mesh", None)
        data.pop("_offset", None)
        # Trimesh leak yok
        assert "_mesh" not in data
        # Tam JSON dump çalışmalı
        s = json.dumps(data)
        assert len(s) > 100


class TestBackwardCompat:
    def test_meta_backward_compat_alanlari(self, simple_room_obj):
        """Face-based mode'da backward compat alanları (wall_planes, floor_polygon_3d) yazılmalı."""
        data = process(str(simple_room_obj))
        data.pop("_mesh", None)
        data.pop("_offset", None)
        assert "wall_planes" in data["meta"]
        assert "floor_polygon_3d" in data["meta"]
        # Kutu için wall_planes == 4
        assert len(data["meta"]["wall_planes"]) >= 4

# -----------------------------------------------------------------------------
# İç/Dış Duvar Filtreleme Testi (separate_inner_outer_surfaces)
# -----------------------------------------------------------------------------
from mesh_to_3d import separate_inner_outer_surfaces
from shapely.geometry import Polygon

def test_separate_inner_outer_surfaces():
    import numpy as np
    
    # Mock Trimesh
    class MockMesh:
        def __init__(self):
            self.is_watertight = True
            self.center_mass = [5.0, 5.0, 5.0]
            # 5 faces
            self.triangles_center = np.array([
                [5.0, 0.0, 5.0],   # İçeride
                [0.1, 0.0, 5.0],   # İçeride yakın
                [-0.1, 0.0, 5.0],  # Dışarıda sınır ihlali yapmayan
                [-0.5, 0.0, 5.0],  # Dışarıda (çöpe)
                [12.0, 0.0, 12.0]  # Çok dışarıda (çöpe)
            ])

    # Odanın iç sınırı: 0,0'dan 10,10'a bir kare
    room_polygon = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    groups = [
        {"face_indices": [0]},
        {"face_indices": [1]},
        {"face_indices": [2]},
        {"face_indices": [3]},
        {"face_indices": [4]},
    ]

    mock_mesh = MockMesh()

    inner_groups, outer_groups = separate_inner_outer_surfaces(
        groups, 
        mesh=mock_mesh, 
        inner_threshold=-0.15, 
        room_polygon=room_polygon
    )
    
    assert len(inner_groups) == 3
    # İlk üç grup inner olmalı
    assert inner_groups[0]["face_indices"] == [0]
    assert inner_groups[1]["face_indices"] == [1]
    assert inner_groups[2]["face_indices"] == [2]
