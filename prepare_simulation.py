"""
prepare_simulation.py — CAD → Simülasyon JSON dönüştürücü
=========================================================

DWG veya DXF dosyasını Seramikcim simülasyonunun kullandığı
public/current_*.json dosyalarına dönüştürür.

Desteklenen entity tipleri (dxf_to_3d.py aracılığıyla):
  LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE, INSERT (blok referansları)

Ölçek tespiti:
  $INSUNITS başlık değeri okunur; yoksa koordinat büyüklüğüne göre
  çok-adımlı buluşsal yöntem kullanılır.

Kullanım:
    python prepare_simulation.py banyo.dwg
    python prepare_simulation.py banyo.dxf
    python prepare_simulation.py               # Klasördeki en yeni CAD dosyasını seçer
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import uuid
import json
import argparse
from collections.abc import Sequence
from pathlib import Path

# Python arama yoluna kendi klasörümüzü ekle
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dxf_to_3d import (
    process, save_outputs,
    extract_all_geometry, merge_collinear_lines,
    read_insunits, load_dxf, bbox,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORK_DIR   = Path.cwd()
UPLOAD_DIR = WORK_DIR / "uploads"
PUBLIC_DIR = WORK_DIR / "public"

SUPPORTED_SUFFIXES = {".dwg", ".dxf", ".obj", ".skp"}
SKIP_PATTERNS      = ("_converted", "_test")


def detect_format(path: Path) -> str:
    """Dosya uzantısına göre işlem akışını seçer.

    Dönüş değerleri:
      'cad'             — DWG/DXF (dxf_to_3d.py akışı)
      'mesh'            — OBJ (mesh_to_3d.py akışı)
      'skp_unsupported' — SKP (manuel OBJ export rehberi)
      'unknown'         — desteklenmeyen
    """
    suffix = path.suffix.lower()
    if suffix in {".dwg", ".dxf"}:
        return "cad"
    if suffix == ".obj":
        return "mesh"
    if suffix == ".skp":
        return "skp_unsupported"
    return "unknown"


def find_latest_cad_file(directory: Path = WORK_DIR) -> Path:
    """Klasördeki en son değiştirilen DWG/DXF dosyasını bulur."""
    candidates = [
        p for p in directory.glob("*")
        if p.suffix.lower() in SUPPORTED_SUFFIXES
        and not any(pat in p.stem.lower() for pat in SKIP_PATTERNS)
    ]
    if not candidates:
        raise SystemExit(f"'{directory}' içinde DWG/DXF dosyası bulunamadı.")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def stage_source_file(source: Path) -> Path:
    """
    Kaynak CAD dosyasını çalışma klasörüne kopyalar.
    aspose-cad ve bazı ezdxf fonksiyonları ağ yolu veya
    OneDrive senkronize klasörleri gibi kısıtlı yolları okuyamaz.
    """
    source = source.resolve()
    if source.parent.resolve() in {WORK_DIR.resolve(), UPLOAD_DIR.resolve()}:
        return source
    UPLOAD_DIR.mkdir(exist_ok=True)
    target = UPLOAD_DIR / source.name
    if source == target.resolve():
        return source
    shutil.copyfile(source, target)
    print(f"[0/4] Kaynak dosya çalışma klasörüne kopyalandı: {target}")
    return target


def _find_oda_converter() -> Path | None:
    """ODA File Converter yürütülebilir dosyasını bulur."""
    found = shutil.which("ODAFileConverter")
    if found:
        return Path(found)
    if sys.platform == "win32":
        for base in [
            Path("C:/Program Files/ODA"),
            Path("C:/Program Files (x86)/ODA"),
            Path.home() / "AppData" / "Local" / "ODA",
        ]:
            if base.exists():
                for child in sorted(base.iterdir(), reverse=True):
                    candidate = child / "ODAFileConverter.exe"
                    if candidate.exists():
                        return candidate
    return None


def _find_libredwg() -> Path | None:
    """
    LibreDWG'nin dwg2dxf CLI aracını bulur.
    Arama sırası: proje içi tools/ → PATH → conda ortamları.
    """
    exe_name = "dwg2dxf.exe" if sys.platform == "win32" else "dwg2dxf"

    # 1. Proje içi tools/libredwg/ (en güvenilir, versiyon kilidi)
    bundled = WORK_DIR / "tools" / "libredwg" / exe_name
    if bundled.exists():
        return bundled

    # 2. PATH
    found = shutil.which("dwg2dxf")
    if found:
        return Path(found)

    # 3. Conda ortamları
    conda_roots: list[Path] = []
    conda_prefix = os.environ.get("CONDA_PREFIX")
    if conda_prefix:
        conda_roots.append(Path(conda_prefix))

    if sys.platform == "win32":
        bin_sub = Path("Library") / "bin"
        for root_name in ("miniconda3", "miniconda", "anaconda3", "anaconda"):
            for base in [Path.home(), Path("C:/"), Path("C:/ProgramData")]:
                conda_roots.append(base / root_name)
        for root in conda_roots:
            candidate = root / bin_sub / "dwg2dxf.exe"
            if candidate.exists():
                return candidate
            envs_dir = root / "envs"
            if envs_dir.exists():
                for env in sorted(envs_dir.iterdir(), reverse=True):
                    candidate = env / bin_sub / "dwg2dxf.exe"
                    if candidate.exists():
                        return candidate
    else:
        for root in conda_roots:
            candidate = root / "bin" / "dwg2dxf"
            if candidate.exists():
                return candidate
    return None


def _run_kwargs() -> dict:
    """subprocess.run için platform uyumlu ortak seçenekler."""
    kw: dict = dict(
        capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
    )
    if sys.platform == "win32":
        kw["creationflags"] = subprocess.CREATE_NO_WINDOW
    return kw


def _convert_dwg_to_dxf_libredwg(dwg_path: Path) -> Path:
    """
    LibreDWG'nin dwg2dxf aracıyla DWG dosyasını DXF'e dönüştürür.
    Desteklenen DWG sürümleri: R14 – R2018.
    """
    exe = _find_libredwg()
    if exe is None:
        raise RuntimeError("dwg2dxf bulunamadı")

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        tmp_dwg = tmp / dwg_path.name
        shutil.copyfile(dwg_path, tmp_dwg)

        tmp_dxf = tmp / (dwg_path.stem + ".dxf")
        result = subprocess.run(
            [str(exe), "--as", "r2013", "-y",
             "-o", str(tmp_dxf), str(tmp_dwg)],
            **_run_kwargs(),
            cwd=str(tmp),
        )

        dxf_files = [tmp_dxf] if tmp_dxf.exists() else \
                    list(tmp.glob("*.dxf")) + list(tmp.glob("*.DXF"))
        if not dxf_files:
            stderr_hint = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(
                f"dwg2dxf DXF üretemedi.\n"
                + (f"  Çıktı: {stderr_hint}\n" if stderr_hint else "")
            )

        dxf_path = dwg_path.with_name(
            f"{dwg_path.stem}_converted_{uuid.uuid4().hex[:8]}.dxf"
        )
        shutil.copyfile(dxf_files[0], dxf_path)
        print(f"  ✓ LibreDWG dönüşümü tamamlandı: {dxf_path.name}")
        return dxf_path


def _convert_dwg_to_dxf_oda(dwg_path: Path) -> Path:
    """ODA File Converter kullanarak DWG dosyasını geçici DXF'e dönüştürür."""
    oda_exe = _find_oda_converter()
    if oda_exe is None:
        raise RuntimeError("ODA File Converter bulunamadı")

    with tempfile.TemporaryDirectory() as tmp_in_str, \
         tempfile.TemporaryDirectory() as tmp_out_str:
        tmp_in  = Path(tmp_in_str)
        tmp_out = Path(tmp_out_str)
        shutil.copyfile(dwg_path, tmp_in / dwg_path.name)

        result = subprocess.run(
            [str(oda_exe), str(tmp_in), str(tmp_out),
             "ACAD2018", "DXF", "0", "1", "*.DWG"],
            **_run_kwargs(),
        )

        dxf_files = list(tmp_out.glob("*.dxf")) + list(tmp_out.glob("*.DXF"))
        if not dxf_files:
            stderr_hint = (result.stderr or "").strip()
            raise RuntimeError(
                "ODA File Converter DXF üretemedi.\n"
                + (f"  Hata: {stderr_hint}\n" if stderr_hint else "")
            )

        dxf_path = dwg_path.with_name(
            f"{dwg_path.stem}_converted_{uuid.uuid4().hex[:8]}.dxf"
        )
        shutil.copyfile(dxf_files[0], dxf_path)
        print(f"  ✓ ODA dönüşümü tamamlandı: {dxf_path.name}")
        return dxf_path


def convert_dwg_to_dxf(dwg_path: Path) -> Path:
    """
    DWG dosyasını geçici DXF'e dönüştürür.
    Öncelik sırası: aspose-cad → LibreDWG (dwg2dxf) → ODA File Converter.
    Hiçbiri yoksa kurulum talimatlarıyla hata fırlatır.
    """
    # 1. aspose-cad
    try:
        import aspose.cad as cad
        from aspose.cad.imageoptions import DxfOptions
        dxf_path = dwg_path.with_name(
            f"{dwg_path.stem}_converted_{uuid.uuid4().hex[:8]}.dxf"
        )
        print(f"[1/4] DWG → DXF (aspose-cad): {dwg_path.name} → {dxf_path.name}")
        image = cad.Image.load(str(dwg_path))
        image.save(str(dxf_path), DxfOptions())
        print("  ✓ Dönüşüm tamamlandı.")
        return dxf_path
    except ImportError:
        pass

    # 2. LibreDWG (açık kaynak, ücretsiz)
    if _find_libredwg():
        print("[1/4] DWG → DXF (LibreDWG dwg2dxf)…")
        try:
            return _convert_dwg_to_dxf_libredwg(dwg_path)
        except RuntimeError as exc:
            print(f"  [Uyarı] LibreDWG başarısız: {exc}")

    # 3. ODA File Converter
    if _find_oda_converter():
        print("[1/4] DWG → DXF (ODA File Converter)…")
        try:
            return _convert_dwg_to_dxf_oda(dwg_path)
        except RuntimeError as exc:
            print(f"  [Uyarı] ODA başarısız: {exc}")

    raise SystemExit(
        "DWG okumak için uygun bir dönüştürücü bulunamadı.\n"
        "\n"
        "Seçenekler (birini kurun):\n"
        "  1. LibreDWG (açık kaynak, ücretsiz)\n"
        "       conda install -c conda-forge libredwg\n"
        "       veya https://github.com/LibreDWG/libredwg/releases\n"
        "  2. ODA File Converter (ücretsiz, tescilli)\n"
        "       https://www.opendesign.com/guestfiles/oda_file_converter\n"
        "  3. aspose-cad (ticari)\n"
        "       pip install aspose-cad\n"
        "\n"
        "DXF dosyası verirseniz dönüşüm gerekmez."
    )


def copy_to_public(base_name: str) -> None:
    """Üretilen geometry/building JSON'larını public/ klasörüne kopyalar."""
    PUBLIC_DIR.mkdir(exist_ok=True)
    for suffix in ("_geometry.json", "_building.json"):
        src = WORK_DIR / f"{base_name}{suffix}"
        key = "geometry" if "geometry" in suffix else "building"
        dst = PUBLIC_DIR / f"current_{key}.json"
        shutil.copyfile(src, dst)
        print(f"  ✓ {dst} güncellendi")


def _poly_bbox(poly: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), max(xs), min(ys), max(ys)


def analyze_dxf_profile(dxf_path: Path, source_path: Path) -> dict:
    """
    CAD çizimini geometri düzenine göre profiller:
    - zemin planı benzeri tek baskın görünüm
    - pafta / duvar görünüşü benzeri çoklu görünüm

    Düzeltme: LWPOLYLINE, LINE, ARC dahil tüm entity tipleri sayılır.
    $INSUNITS başlık değeri de profile eklenir.
    """
    try:
        doc, msp = load_dxf(str(dxf_path))
    except Exception as exc:
        raise SystemExit(f"DXF okunamadı ({dxf_path}): {exc}")

    insunits = read_insunits(doc)

    # Tüm entity tiplerini çıkar (artık LWPOLYLINE/LINE/ARC dahil)
    layer_data = extract_all_geometry(msp, doc)
    layer_data = merge_collinear_lines(layer_data)

    polys: list[list[tuple[float, float]]] = []
    for layer_polys in layer_data.values():
        for poly in layer_polys:
            if len(poly) >= 2:
                polys.append([(p[0], p[1]) for p in poly])

    total_entity_count = sum(len(lp) for lp in layer_data.values())

    if not polys:
        return {
            "source":                   source_path.name,
            "source_path":              str(source_path),
            "analysis_source":          str(dxf_path.name),
            "classification":           "unknown",
            "polyline_count":           0,
            "total_entity_count":       0,
            "floor_plan_score":         0,
            "elevation_score":          0,
            "room_ratio":               0.0,
            "aspect_ratio":             0.0,
            "width_units":              0.0,
            "height_units":             0.0,
            "dominant_width_units":     0.0,
            "dominant_height_units":    0.0,
            "insunits":                 insunits,
        }

    all_pts = [point for poly in polys for point in poly]
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    full_w = max(xs) - min(xs)
    full_h = max(ys) - min(ys)
    full_area   = max(full_w * full_h, 1.0)
    aspect_ratio = full_w / max(full_h, 1e-6)

    boxes: dict[tuple[float, float, float, float], dict] = {}
    for poly in polys:
        x0, x1, y0, y1 = _poly_bbox(poly)
        width  = x1 - x0
        height = y1 - y0
        if width <= 0 or height <= 0:
            continue
        key = (round(x0, 1), round(y0, 1), round(width, 1), round(height, 1))
        boxes[key] = {
            "ratio":  (width * height) / full_area,
            "width":  width,
            "height": height,
        }

    # Title block / dış çerçeve hariç tut (full_area'nın >%90'ı)
    candidates = [item for item in boxes.values() if item["ratio"] < 0.90]
    dominant   = max(candidates or list(boxes.values()), key=lambda item: item["ratio"])
    room_ratio = float(dominant["ratio"])

    floor_plan_score = 0
    elevation_score  = 0

    if room_ratio > 0.65 and 0.65 <= aspect_ratio <= 1.6:
        floor_plan_score += 4
    if room_ratio > 0.45:
        floor_plan_score += 1
    if 0.5 <= aspect_ratio <= 2.2:
        floor_plan_score += 1

    if room_ratio < 0.55 and (aspect_ratio < 0.8 or aspect_ratio > 1.8):
        elevation_score += 3
    if room_ratio < 0.55:
        elevation_score += 1

    if floor_plan_score >= elevation_score + 1 and floor_plan_score >= 3:
        classification = "floor_plan"
    elif elevation_score >= floor_plan_score + 1 and elevation_score >= 3:
        classification = "elevation_sheet"
    else:
        classification = "mixed"

    return {
        "source":                   source_path.name,
        "source_path":              str(source_path),
        "analysis_source":          dxf_path.name,
        "classification":           classification,
        "polyline_count":           len(polys),
        "total_entity_count":       total_entity_count,
        "floor_plan_score":         floor_plan_score,
        "elevation_score":          elevation_score,
        "room_ratio":               round(room_ratio, 4),
        "aspect_ratio":             round(aspect_ratio, 4),
        "width_units":              round(full_w, 4),
        "height_units":             round(full_h, 4),
        "dominant_width_units":     round(float(dominant["width"]), 4),
        "dominant_height_units":    round(float(dominant["height"]), 4),
        "insunits":                 insunits,
    }


def choose_floor_plan(
    analyses: Sequence[dict],
    source_order: Sequence[Path],
    kind_overrides: dict[str, str],
) -> dict | None:
    """
    Zemin planı dosyasını seçer:
    1. Kullanıcı floor_plan olarak işaretlediyse onu seç.
    2. Tek dosya varsa onu seç.
    3. Çoklu dosyada floor_plan_score en yüksek olanı seç.
       Eşitlikte kaynak sırasına göre ilk dosyayı seç.
    """
    ordered = {Path(path).name: index for index, path in enumerate(source_order)}
    explicit = [
        item for item in analyses
        if kind_overrides.get(item["source"]) == "floor_plan"
        or kind_overrides.get(item["source_path"]) == "floor_plan"
    ]
    if explicit:
        return sorted(explicit, key=lambda item: ordered.get(item["source"], 10**6))[0]
    if len(analyses) == 1:
        return analyses[0]
    if not analyses:
        return None
    # Puanla: floor_plan_score yüksek, ardından sıra
    return sorted(
        analyses,
        key=lambda item: (-item["floor_plan_score"], ordered.get(item["source"], 10**6))
    )[0]


def apply_kind_overrides(analyses: Sequence[dict],
                         kind_overrides: dict[str, str]) -> list[dict]:
    normalized: list[dict] = []
    for item in analyses:
        overridden = dict(item)
        override = (kind_overrides.get(item["source"])
                    or kind_overrides.get(item["source_path"]))
        if override and override != "auto":
            overridden["classification"] = override
            if override == "floor_plan":
                overridden["floor_plan_score"] = max(overridden["floor_plan_score"], 99)
            elif override == "elevation_sheet":
                overridden["elevation_score"] = max(overridden["elevation_score"], 99)
        normalized.append(overridden)
    return normalized


def build_comparison_report(analyses: Sequence[dict],
                            selected_floor_plan: dict | None) -> dict:
    comparisons: list[dict] = []
    if selected_floor_plan:
        base_w = max(selected_floor_plan["dominant_width_units"],  1e-6)
        base_h = max(selected_floor_plan["dominant_height_units"], 1e-6)
        for item in analyses:
            if item["source"] == selected_floor_plan["source"]:
                continue
            width_delta  = abs(item["dominant_width_units"]  - selected_floor_plan["dominant_width_units"])  / base_w
            height_delta = abs(item["dominant_height_units"] - selected_floor_plan["dominant_height_units"]) / base_h
            cls_mismatch = item["classification"] != selected_floor_plan["classification"]
            compatibility = max(0, round(
                100 - (width_delta + height_delta) * 50 - (35 if cls_mismatch else 0)
            ))
            notes: list[str] = []
            if cls_mismatch:
                notes.append(
                    f"Görünüm türü farklı: {selected_floor_plan['classification']}"
                    f" vs {item['classification']}"
                )
            if width_delta > 0.2 or height_delta > 0.2:
                notes.append("Baskın geometri ölçüleri belirgin şekilde farklı.")
            if not notes:
                notes.append("Ana geometrik imza yakın görünüyor.")
            comparisons.append({
                "source":               item["source"],
                "classification":       item["classification"],
                "compatibility_score":  compatibility,
                "width_delta_ratio":    round(width_delta, 4),
                "height_delta_ratio":   round(height_delta, 4),
                "notes":                notes,
            })

    return {
        "files":                list(analyses),
        "selected_floor_plan":  selected_floor_plan["source"] if selected_floor_plan else None,
        "floor_plan_required":  True,
        "valid":                selected_floor_plan is not None,
        "comparisons":          comparisons,
    }


def save_comparison_report(report: dict) -> None:
    PUBLIC_DIR.mkdir(exist_ok=True)
    report_path = PUBLIC_DIR / "current_comparison.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"  ✓ {report_path} güncellendi")


def print_comparison_summary(report: dict) -> None:
    print("[CAD Fark Analizi]")
    for item in report["files"]:
        insunits_str = (f"$INSUNITS={item['insunits']}"
                        if item.get("insunits") is not None else "insunits=?")
        print(
            f"  - {item['source']}: {item['classification']}  |  "
            f"skor(plan/elev)={item['floor_plan_score']}/{item['elevation_score']}  |  "
            f"oran={item['room_ratio']:.2f}  |  "
            f"bbox={item['dominant_width_units']:.1f}x{item['dominant_height_units']:.1f}  |  "
            f"entity={item.get('total_entity_count','?')}  |  "
            f"{insunits_str}"
        )
    if report["selected_floor_plan"]:
        print(f"  -> Zemin planı: {report['selected_floor_plan']}")
    else:
        print("  -> Zemin planı bulunamadı.")
    for item in report["comparisons"]:
        print(f"  * {item['source']} uyum skoru: {item['compatibility_score']}/100")
        for note in item["notes"]:
            print(f"      · {note}")
    print()


def export_dwg_cad_view(dwg_path: Path, base_name: str) -> None:
    """
    CAD kontrol görünümünü doğrudan DWG kaynağından SVG olarak render eder.
    Daha önce üretilen building JSON içeriğini korur; yalnızca DWG kaynak
    görünüm bilgisini ekler. Böylece features/windows/frames gibi CAD kontrol
    verileri DWG görünümü yüzünden kaybolmaz.
    """
    try:
        import aspose.cad as cad
        from aspose.cad.imageoptions import CadRasterizationOptions, SvgOptions
    except ImportError:
        print("[Uyarı] aspose-cad bulunamadı; SVG görünümü üretilmeyecek.")
        return

    PUBLIC_DIR.mkdir(exist_ok=True)
    try:
        image = cad.Image.load(str(dwg_path))
    except Exception as exc:
        print(f"[Uyarı] DWG görünümü render edilemedi: {exc}")
        return

    source_w = float(getattr(image, "width",  0) or 1400)
    source_h = float(getattr(image, "height", 0) or 1000)
    page_w   = 1600.0
    page_h   = max(900.0, page_w * source_h / max(source_w, 1.0))

    raster_options = CadRasterizationOptions()
    raster_options.page_width  = page_w
    raster_options.page_height = page_h

    svg_options = SvgOptions()
    svg_options.vector_rasterization_options = raster_options

    view_name = f"{base_name}_cad_view.svg"
    view_path = PUBLIC_DIR / view_name
    print(f"  ✓ DWG CAD görünümü üretiliyor: {view_path}")
    image.save(str(view_path), svg_options)

    build_path = WORK_DIR / f"{base_name}_building.json"
    try:
        with open(build_path, "r", encoding="utf-8") as f:
            building = json.load(f)
    except Exception:
        building = {
            "walls": [], "tiles": [], "floor": [], "doors": [],
            "features": [], "windows": [], "frames": [],
            "surface_segments": [],
            "meta": {},
        }

    building["meta"] = {
        **building.get("meta", {}),
        "source": dwg_path.name,
        "view_source": "dwg",
        "note": "CAD görünümü DWG kaynağından render edildi; geometri tespit verisi korundu.",
    }
    building["view"] = {
        "type":   "svg",
        "image":  f"/{view_name}",
        "width":  page_w,
        "height": page_h,
    }

    with open(build_path, "w", encoding="utf-8") as f:
        json.dump(building, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  ✓ {build_path.name} DWG görünümü eklenerek güncellendi")


def _prepare_mesh(source: Path) -> None:
    """OBJ mesh dosyası akışı — dxf_to_3d.process çıktı kontratıyla uyumlu."""
    try:
        from mesh_to_3d import process as mesh_process, save_outputs as mesh_save
    except ImportError as exc:
        raise SystemExit(
            f"mesh_to_3d modülü yüklenemedi: {exc}\n"
            "Bağımlılıklar: pip install trimesh shapely numpy"
        )

    print(f"[1/4] Mesh dosyası analiz ediliyor: {source.name}")
    data = mesh_process(str(source))
    if not data:
        raise SystemExit("Geometri çıkarılamadı. OBJ mesh dosyasını kontrol edin.")

    # Internal trimesh nesnesini JSON'dan önce çıkar
    normalized_mesh = data.pop("_mesh", None)
    data.pop("_offset", None)
    data.pop("_section_height_m", None)

    base_name = source.stem.lower()
    print(f"[2/4] Geometri çıktıları üretiliyor")
    mesh_save(data, base_name=base_name)

    # Normalize edilmiş mesh'i public/'a export et
    PUBLIC_DIR.mkdir(exist_ok=True)
    public_obj = PUBLIC_DIR / "current_mesh.obj"
    if normalized_mesh is not None:
        try:
            normalized_mesh.export(str(public_obj))
            print(f"  ✓ {public_obj} (normalize edilmiş)")
        except Exception as exc:
            print(f"  [Uyarı] normalize export başarısız ({exc}); kaynak kopyalanıyor")
            shutil.copyfile(source, public_obj)
    else:
        # Fallback: pipeline mesh dönmediyse ham dosya
        shutil.copyfile(source, public_obj)
        print(f"  ✓ {public_obj} (ham)")
    # MTL varsa kopyala (normalize MTL koordinatlarını etkilemez)
    mtl_source = source.with_suffix(".mtl")
    if mtl_source.exists():
        shutil.copyfile(mtl_source, PUBLIC_DIR / "current_mesh.mtl")
    # _offset / _section_height_m internal alanlarını temizle (JSON serializable kalmasın)
    data.pop("_offset", None)
    data.pop("_section_height_m", None)
    data["meta"]["mesh_view_url"] = "/current_mesh.obj"

    # Mesh akışı için tek dosya — basit comparison report
    report = {
        "files": [{
            "source": source.name,
            "source_path": str(source),
            "classification": "mesh_room",
            "geometry_mode": "mesh",
            "polyline_count": 1,
            "total_entity_count": int(data["meta"].get("detection_summary", {}).get("doors", 0)
                                      + data["meta"].get("detection_summary", {}).get("windows", 0)),
            "floor_plan_score": 99,
            "elevation_score": 0,
            "room_ratio": 1.0,
            "aspect_ratio": 1.0,
            "width_units": data["meta"].get("wall_width_m", 0),
            "height_units": data["meta"].get("wall_height_m", 0),
            "dominant_width_units": data["meta"].get("wall_width_m", 0),
            "dominant_height_units": data["meta"].get("wall_height_m", 0),
            "insunits": None,
        }],
        "selected_floor_plan": source.name,
        "floor_plan_required": True,
        "valid": True,
        "comparisons": [],
    }
    save_comparison_report(report)
    print(f"[3/4] CAD karşılaştırma raporu yazıldı")

    print("[4/4] Simülasyon verisi güncelleniyor")
    copy_to_public(base_name)

    print(
        f"\nTamam. {source.name} OBJ olarak işlendi; "
        "web arayüzü yeni mesh verisini kullanabilir."
    )


def prepare(source_paths: str | Sequence[str],
            kind_overrides: dict[str, str] | None = None) -> None:
    """
    Ana orkestrasyon fonksiyonu — dosya formatına göre dispatch:
      - .dwg / .dxf → dxf_to_3d (CAD vektörel akış)
      - .obj        → mesh_to_3d (mesh akışı)
      - .skp        → manuel OBJ export rehberi

    CAD akışı:
      1. Yüklenen çizimleri hazırla ve analiz et
      2. Zemin planı adayını otomatik seç (floor_plan_score bazlı)
      3. Gerekirse DWG → DXF dönüştür
      4. Geometriyi çıkar (LWPOLYLINE/LINE/ARC/INSERT dahil)
      5. JSON çıktıları ve fark raporunu kaydet
    """
    if isinstance(source_paths, str):
        requested = [source_paths]
    else:
        requested = list(source_paths)
    if not requested:
        raise SystemExit("En az bir CAD/mesh dosyası verilmelidir.")

    # Format dispatch: ilk dosyaya göre akışı seç (mesh tek dosya destekler)
    first = Path(requested[0])
    if not first.exists():
        raise SystemExit(f"Dosya bulunamadı: {first}")
    fmt = detect_format(first)

    if fmt == "skp_unsupported":
        raise SystemExit(
            ".skp dosyaları doğrudan desteklenmiyor.\n"
            "  SketchUp Pro: File → Export → 3D Model → Wavefront OBJ (*.obj)\n"
            "  Sonra OBJ dosyasını yükleyin."
        )

    if fmt == "mesh":
        if len(requested) > 1:
            print("[Uyarı] OBJ mesh akışı tek dosya destekler; ilk dosya işlenecek.")
        staged = stage_source_file(first)
        _prepare_mesh(staged)
        return

    if fmt == "unknown":
        raise SystemExit(
            f"Desteklenmeyen dosya türü: '{first.suffix}'. "
            "Yalnızca .dwg, .dxf, .obj desteklenir."
        )

    prepared_items: list[dict] = []
    print(f"[1/4] Yüklenen çizimler analiz ediliyor ({len(requested)} dosya)")

    for raw_path in requested:
        source = Path(raw_path)
        if not source.exists():
            raise SystemExit(f"Dosya bulunamadı: {source}")
        source = stage_source_file(source)
        suffix = source.suffix.lower()

        if suffix == ".dwg":
            dxf_path = convert_dwg_to_dxf(source)
        elif suffix == ".dxf":
            dxf_path = source
        else:
            # Bu noktaya gelmemeli — dispatch zaten yukarıda yaptı
            raise SystemExit(
                f"CAD akışında beklenmeyen dosya: '{suffix}'. "
                "Yalnızca .dwg ve .dxf desteklenir."
            )

        profile = analyze_dxf_profile(dxf_path, source)
        prepared_items.append({
            "source":   source,
            "suffix":   suffix,
            "dxf_path": dxf_path,
            "profile":  profile,
        })

    analyses = [item["profile"] for item in prepared_items]
    analyses = apply_kind_overrides(analyses, kind_overrides or {})
    selected_profile = choose_floor_plan(
        analyses,
        [item["source"] for item in prepared_items],
        kind_overrides or {},
    )
    report = build_comparison_report(analyses, selected_profile)
    save_comparison_report(report)
    print_comparison_summary(report)

    if selected_profile is None:
        raise SystemExit("Zemin planı seçilemedi.")

    selected_item = next(
        item for item in prepared_items
        if item["source"].name == selected_profile["source"]
    )
    source    = selected_item["source"]
    dxf_path  = selected_item["dxf_path"]
    suffix    = selected_item["suffix"]
    base_name = source.stem.lower()

    print(f"[2/4] Zemin planı: {source.name}")
    print(f"[3/4] Geometri çıkarılıyor: {dxf_path.name}")
    data = process(str(dxf_path))
    if not data:
        raise SystemExit("Geometri çıkarılamadı. DXF dosyasını kontrol edin.")

    save_outputs(data, base_name=base_name)

    if suffix == ".dwg":
        export_dwg_cad_view(source, base_name)

    print("[4/4] Simülasyon verisi güncelleniyor")
    copy_to_public(base_name)

    print(
        "\nTamam. current_comparison.json güncellendi; "
        "web arayüzü yeni CAD verisini kullanabilir."
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CAD dosyalarını simülasyon verisine hazırlar."
    )
    parser.add_argument("cad_files", nargs="*",
                        help="Hazırlanacak DWG/DXF dosyaları")
    parser.add_argument(
        "--drawing-kind", action="append", default=[],
        help="Dosya tipi eşlemesi. Örnek: --drawing-kind test_a.dwg=floor_plan",
    )
    return parser.parse_args(argv)


def parse_kind_overrides(raw_overrides: Sequence[str]) -> dict[str, str]:
    allowed = {"auto", "floor_plan", "elevation_sheet", "mixed"}
    result: dict[str, str] = {}
    for raw in raw_overrides:
        name, sep, kind = raw.partition("=")
        if not sep:
            raise SystemExit(f"Geçersiz --drawing-kind değeri: {raw}")
        key  = Path(name).name if Path(name).name else name
        kind = kind.strip().lower()
        if kind not in allowed:
            raise SystemExit(f"Geçersiz çizim tipi: {kind}")
        result[key] = kind
    return result


if __name__ == "__main__":
    args = parse_args(sys.argv[1:])
    cad_files = args.cad_files if args.cad_files else [str(find_latest_cad_file())]
    prepare(cad_files, kind_overrides=parse_kind_overrides(args.drawing_kind))
