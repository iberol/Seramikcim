"""
test_prepare_simulation.py — prepare_simulation.py top-level helper testleri
"""
from __future__ import annotations

from pathlib import Path

import pytest

from prepare_simulation import (
    analyze_dxf_profile,
    choose_floor_plan,
    apply_kind_overrides,
    build_comparison_report,
    parse_kind_overrides,
    find_latest_cad_file,
    detect_format,
)


class TestAnalyzeDxfProfile:
    def test_basit_oda_dxf_zemin_planı_tanır(self, simple_room_dxf: Path):
        result = analyze_dxf_profile(simple_room_dxf, simple_room_dxf)
        assert result["source"] == simple_room_dxf.name
        assert result["classification"] in {"floor_plan", "mixed", "elevation_sheet", "unknown"}
        assert result["polyline_count"] >= 1
        assert result["insunits"] == 5

    def test_l_oda_dxf_işleyebilir(self, l_shaped_room_dxf: Path):
        result = analyze_dxf_profile(l_shaped_room_dxf, l_shaped_room_dxf)
        assert result["polyline_count"] >= 1
        assert result["width_units"] > 0
        assert result["height_units"] > 0


class TestChooseFloorPlan:
    def test_tek_dosya_otomatik_seçer(self):
        analyses = [{
            "source": "a.dxf",
            "source_path": "a.dxf",
            "classification": "floor_plan",
            "floor_plan_score": 5,
        }]
        result = choose_floor_plan(analyses, [Path("a.dxf")], {})
        assert result == analyses[0]

    def test_boş_liste_None_döner(self):
        assert choose_floor_plan([], [], {}) is None

    def test_açık_override_kullanılır(self):
        analyses = [
            {"source": "a.dxf", "source_path": "a.dxf", "classification": "mixed", "floor_plan_score": 1},
            {"source": "b.dxf", "source_path": "b.dxf", "classification": "mixed", "floor_plan_score": 1},
        ]
        result = choose_floor_plan(
            analyses, [Path("a.dxf"), Path("b.dxf")],
            {"b.dxf": "floor_plan"},
        )
        assert result["source"] == "b.dxf"

    def test_skor_en_yüksek_kazanır(self):
        analyses = [
            {"source": "a.dxf", "source_path": "a.dxf", "classification": "floor_plan", "floor_plan_score": 2},
            {"source": "b.dxf", "source_path": "b.dxf", "classification": "floor_plan", "floor_plan_score": 5},
        ]
        result = choose_floor_plan(analyses, [Path("a.dxf"), Path("b.dxf")], {})
        assert result["source"] == "b.dxf"


class TestApplyKindOverrides:
    def test_override_yok_değişmez(self):
        analyses = [{
            "source": "a.dxf", "source_path": "a.dxf",
            "classification": "mixed", "floor_plan_score": 1, "elevation_score": 0,
        }]
        result = apply_kind_overrides(analyses, {})
        assert result[0]["classification"] == "mixed"

    def test_floor_plan_override_skor_yükseltir(self):
        analyses = [{
            "source": "a.dxf", "source_path": "a.dxf",
            "classification": "mixed", "floor_plan_score": 1, "elevation_score": 0,
        }]
        result = apply_kind_overrides(analyses, {"a.dxf": "floor_plan"})
        assert result[0]["classification"] == "floor_plan"
        assert result[0]["floor_plan_score"] >= 99


class TestParseKindOverrides:
    def test_geçerli_eşleme(self):
        result = parse_kind_overrides(["test.dwg=floor_plan", "test2.dxf=mixed"])
        assert result["test.dwg"] == "floor_plan"
        assert result["test2.dxf"] == "mixed"

    def test_geçersiz_kind_systemexit_atar(self):
        with pytest.raises(SystemExit):
            parse_kind_overrides(["test.dwg=invalid_kind"])

    def test_eşittir_yoksa_systemexit(self):
        with pytest.raises(SystemExit):
            parse_kind_overrides(["test.dwg"])


class TestBuildComparisonReport:
    def test_boş_analyses(self):
        report = build_comparison_report([], None)
        assert report["valid"] is False
        assert report["selected_floor_plan"] is None

    def test_tek_analiz_geçerli(self):
        analyses = [{
            "source": "a.dxf",
            "classification": "floor_plan",
            "floor_plan_score": 5,
            "elevation_score": 0,
            "dominant_width_units": 200,
            "dominant_height_units": 150,
        }]
        report = build_comparison_report(analyses, analyses[0])
        assert report["valid"] is True
        assert report["selected_floor_plan"] == "a.dxf"
        assert report["comparisons"] == []


class TestFindLatestCadFile:
    def test_boş_dizinde_systemexit(self, tmp_path):
        with pytest.raises(SystemExit):
            find_latest_cad_file(tmp_path)

    def test_tek_dxf_döner(self, tmp_path):
        f = tmp_path / "test.dxf"
        f.write_text("dummy")
        result = find_latest_cad_file(tmp_path)
        assert result.name == "test.dxf"

    def test_converted_dosyayı_atlar(self, tmp_path):
        f1 = tmp_path / "test_a.dxf"
        f1.write_text("dummy")
        f2 = tmp_path / "test_a_converted_abc.dxf"
        f2.write_text("dummy")
        result = find_latest_cad_file(tmp_path)
        assert "_converted" not in result.stem


class TestDetectFormat:
    def test_dwg_cad(self):
        from pathlib import Path
        assert detect_format(Path("plan.dwg")) == "cad"

    def test_dxf_cad(self):
        from pathlib import Path
        assert detect_format(Path("plan.dxf")) == "cad"

    def test_obj_mesh(self):
        from pathlib import Path
        assert detect_format(Path("room.obj")) == "mesh"

    def test_obj_uppercase_mesh(self):
        from pathlib import Path
        assert detect_format(Path("room.OBJ")) == "mesh"

    def test_skp_unsupported(self):
        from pathlib import Path
        assert detect_format(Path("room.skp")) == "skp_unsupported"

    def test_unknown_suffix(self):
        from pathlib import Path
        assert detect_format(Path("data.json")) == "unknown"
        assert detect_format(Path("noext")) == "unknown"
