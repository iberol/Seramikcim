"""
dxf_to_3d.py — DXF'ten simülasyon geometrisi üretici
=====================================================

DWG/DXF dosyasından oda geometrisini çıkarır, normalize eder ve
Seramikcim web arayüzü için mühendislik doğruluğunda JSON verisi üretir.

Desteklenen entity tipleri:
  LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE, INSERT (blok referansları)

Ölçek tespiti:
  Önce DXF başlığındaki $INSUNITS değeri okunur (AutoCAD standardı).
  Başlıkta yoksa koordinat büyüklüğüne göre çok-adımlı buluşsal yöntem kullanılır.

Kullanım:
    pip install ezdxf
    python dxf_to_3d.py Banyo.dxf
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter, defaultdict
from heapq import heappop, heappush
from itertools import count
from pathlib import Path
from typing import Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import ezdxf
    from ezdxf.document import Drawing
    from ezdxf.layouts import Modelspace
    import ezdxf.units as dxf_units
except ImportError:
    sys.exit("ezdxf kurulu değil. Lütfen: pip install ezdxf")

try:
    from shapely.geometry import Polygon as _ShapelyPolygon, box as _shapely_box
    _SHAPELY_AVAILABLE = True
except ImportError:
    _SHAPELY_AVAILABLE = False

# ── Tür tanımları ─────────────────────────────────────────────────────────────

Poly   = list[list[float]]          # [[x, y], ...]
Layers = dict[str, list[Poly]]      # katman_adı → polyline listesi

# ── $INSUNITS → metre katsayısı tablosu (AutoCAD standardı) ──────────────────
# https://help.autodesk.com/view/OARX/2024/ENU/?guid=GUID-A4DE0391-4CF7-4B51-BB3B-FAB7DBDF6F1A
_INSUNITS_TO_METERS: dict[int, float] = {
    0:  None,       # tanımsız — buluşsal yönteme düş
    1:  0.0254,     # inç
    2:  0.3048,     # fit (foot)
    3:  0.9144,     # yarda
    4:  1609.344,   # mil (mile)
    5:  1.0,        # metre
    6:  1e-3,       # milimetre
    7:  1e-2,       # santimetre
    8:  1e3,        # kilometre
    9:  0.0000254,  # mikroinç
    10: 2.54e-5,    # mil (thou)
    11: 1e-10,      # angstrom
    12: 1e-9,       # nanometre
    13: 1e-6,       # mikrometre
    14: 1e-1,       # desimetre
    15: 1e1,        # dekametre
    16: 1e2,        # hektometre
    17: 3.085677e16,# gigametre → parsek (pratikte gereksiz ama tam tablo)
    18: 1.495979e11,# astronomi birimi
    19: 9.460730e15,# ışık yılı
    20: 3.085677e16,# parsek
}

# ── DXF okuma ─────────────────────────────────────────────────────────────────

def load_dxf(path: str) -> tuple[Drawing, Modelspace]:
    """
    DXF dosyasını okur ve model uzayını döner.
    LibreDWG gibi araçların ürettiği eksik EOF / yapı hatalarını
    ezdxf.recover modülüyle tolere eder.
    """
    try:
        doc = ezdxf.readfile(path)
    except Exception:
        from ezdxf import recover
        doc, _ = recover.readfile(path)
    return doc, doc.modelspace()


def read_insunits(doc: Drawing) -> Optional[int]:
    """
    DXF başlığından $INSUNITS değerini okur.
    Değer yoksa veya 0 (tanımsız) ise None döner.
    """
    try:
        val = doc.header.get("$INSUNITS", 0)
        return int(val) if val else None
    except Exception:
        return None


def insunits_to_scale(insunits: Optional[int]) -> Optional[float]:
    """$INSUNITS kodunu metre/birim katsayısına çevirir."""
    if insunits is None:
        return None
    factor = _INSUNITS_TO_METERS.get(insunits)
    return factor  # None ise buluşsal yönteme düşülür


def arc_to_polyline(cx: float, cy: float, r: float,
                    start_deg: float, end_deg: float,
                    segments: int = 24) -> Poly:
    """
    ARC entity'sini yaklaşık bir polyline'a dönüştürür.
    AutoCAD ARC açıları derece cinsinden, CCW yönünde.
    """
    if end_deg < start_deg - 1e-9:
        end_deg += 360.0
    pts: Poly = []
    for i in range(segments + 1):
        angle = math.radians(start_deg + (end_deg - start_deg) * i / segments)
        pts.append([round(cx + r * math.cos(angle), 4),
                    round(cy + r * math.sin(angle), 4)])
    return pts


def circle_to_polyline(cx: float, cy: float, r: float, segments: int = 32) -> Poly:
    """CIRCLE entity'sini kapalı bir polyline'a dönüştürür."""
    pts: Poly = []
    for i in range(segments):
        angle = math.radians(360.0 * i / segments)
        pts.append([round(cx + r * math.cos(angle), 4),
                    round(cy + r * math.sin(angle), 4)])
    pts.append(pts[0])  # kapat
    return pts


def _make_transform(ins_x: float, ins_y: float,
                    scale_x: float, scale_y: float,
                    rotation: float):
    """INSERT dönüşüm fonksiyonu üretir (scale → rotate → translate)."""
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)

    def transform(px: float, py: float) -> list[float]:
        sx = px * scale_x
        sy = py * scale_y
        rx = sx * cos_r - sy * sin_r
        ry = sx * sin_r + sy * cos_r
        return [round(rx + ins_x, 4), round(ry + ins_y, 4)]

    return transform


def _expand_block(block, block_defs, transform_fn, layer_name: str,
                  depth: int = 0) -> list[tuple[str, Poly]]:
    """
    Bloğu özyinelemeli olarak açar; her polyline için (katman, poly) ikilisi döner.
    depth: iç içe blok derinlik sınırı (döngüsel referanslara karşı).
    """
    if depth > 8:
        return []
    results: list[tuple[str, Poly]] = []
    for sub in block:
        try:
            sub_layer = sub.dxf.layer if hasattr(sub.dxf, "layer") else layer_name
        except Exception:
            sub_layer = layer_name
        try:
            if sub.dxftype() == "INSERT":
                inner_name = sub.dxf.name
                inner_block = block_defs.get(inner_name)
                if inner_block is None:
                    continue
                ix = float(getattr(sub.dxf, "insert", (0, 0, 0))[0])
                iy = float(getattr(sub.dxf, "insert", (0, 0, 0))[1])
                isx = float(getattr(sub.dxf, "xscale", 1.0))
                isy = float(getattr(sub.dxf, "yscale", 1.0))
                irot = math.radians(float(getattr(sub.dxf, "rotation", 0.0)))

                def composed(px: float, py: float,
                             _ix=ix, _iy=iy, _isx=isx, _isy=isy, _irot=irot,
                             _outer=transform_fn) -> list[float]:
                    # Önce iç INSERT dönüşümünü uygula, sonra dışı
                    sx = px * _isx
                    sy = py * _isy
                    rx = sx * math.cos(_irot) - sy * math.sin(_irot)
                    ry = sx * math.sin(_irot) + sy * math.cos(_irot)
                    return _outer(rx + _ix, ry + _iy)

                results.extend(_expand_block(inner_block, block_defs,
                                             composed, sub_layer, depth + 1))

            elif sub.dxftype() == "LWPOLYLINE":
                raw = list(sub.get_points("xy"))
                if len(raw) < 2:
                    continue
                pts = [transform_fn(p[0], p[1]) for p in raw]
                closed_flag = bool(sub.dxf.flags & 1)
                if closed_flag and distance(pts[0], pts[-1]) > 0.01:
                    pts.append(pts[0])
                results.append((sub_layer, pts))

            elif sub.dxftype() == "POLYLINE":
                pts = []
                for v in sub.vertices:
                    loc = v.dxf.location
                    pts.append(transform_fn(float(loc.x), float(loc.y)))
                if len(pts) >= 2:
                    results.append((sub_layer, pts))

            elif sub.dxftype() == "LINE":
                s = sub.dxf.start
                e = sub.dxf.end
                results.append((sub_layer, [
                    transform_fn(float(s.x), float(s.y)),
                    transform_fn(float(e.x), float(e.y)),
                ]))

            elif sub.dxftype() == "ARC":
                pts = arc_to_polyline(
                    float(sub.dxf.center.x), float(sub.dxf.center.y),
                    float(sub.dxf.radius),
                    float(sub.dxf.start_angle), float(sub.dxf.end_angle),
                )
                pts = [transform_fn(p[0], p[1]) for p in pts]
                results.append((sub_layer, pts))
        except Exception:
            continue
    return results


def extract_insert_points(msp: Modelspace, doc: Drawing) -> Layers:
    """
    INSERT (blok referansları) entity'lerini özyinelemeli olarak çözer.
    Bloğun içindeki LWPOLYLINE, POLYLINE, LINE, ARC varlıklarını
    INSERT dönüşümü (konum + ölçek + döndürme) uygulanmış şekilde döner.
    İç içe bloklara (nested INSERT) da destek verilir.
    """
    result: Layers = {}
    try:
        block_defs = doc.blocks
    except Exception:
        return result

    for entity in msp:
        if entity.dxftype() != "INSERT":
            continue
        try:
            block_name = entity.dxf.name
            ins_x = float(getattr(entity.dxf, "insert", (0, 0, 0))[0])
            ins_y = float(getattr(entity.dxf, "insert", (0, 0, 0))[1])
            scale_x = float(getattr(entity.dxf, "xscale", 1.0))
            scale_y = float(getattr(entity.dxf, "yscale", 1.0))
            rotation = math.radians(float(getattr(entity.dxf, "rotation", 0.0)))
            layer = entity.dxf.layer
        except Exception:
            continue

        try:
            block = block_defs.get(block_name)
            if block is None:
                continue
        except Exception:
            continue

        transform = _make_transform(ins_x, ins_y, scale_x, scale_y, rotation)
        for sub_layer, poly in _expand_block(block, block_defs, transform, layer):
            result.setdefault(sub_layer, []).append(poly)

    return result


def extract_all_geometry(msp: Modelspace, doc: Drawing) -> Layers:
    """
    LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE ve INSERT entity'lerini okur.
    Her entity'yi kendi katmanına yerleştirir.
    INSERT blokları çözülerek eklenir.
    """
    layers: Layers = {}

    for entity in msp:
        etype = entity.dxftype()
        try:
            layer = entity.dxf.layer
        except Exception:
            layer = "0"

        try:
            # ── LWPOLYLINE (AutoCAD 2000+ en yaygın tip) ──────────────────────
            if etype == "LWPOLYLINE":
                raw = list(entity.get_points("xy"))
                if len(raw) < 2:
                    continue
                pts: Poly = [[round(float(p[0]), 4), round(float(p[1]), 4)] for p in raw]
                # LWPOLYLINE kapalılık durumu flags bitfield'den okunur (bit 0)
                closed_flag = bool(entity.dxf.flags & 1)
                if closed_flag and distance(pts[0], pts[-1]) > 0.01:
                    pts.append(pts[0])
                layers.setdefault(layer, []).append(pts)

            # ── POLYLINE (eski format, 3D mesh dahil) ─────────────────────────
            elif etype == "POLYLINE":
                pts = []
                for vertex in entity.vertices:
                    loc = vertex.dxf.location
                    pts.append([round(float(loc.x), 4), round(float(loc.y), 4)])
                if len(pts) < 2:
                    continue
                layers.setdefault(layer, []).append(pts)

            # ── LINE (tek segment) ────────────────────────────────────────────
            elif etype == "LINE":
                s = entity.dxf.start
                e = entity.dxf.end
                pts = [[round(float(s.x), 4), round(float(s.y), 4)],
                       [round(float(e.x), 4), round(float(e.y), 4)]]
                if distance(pts[0], pts[1]) < 1e-6:
                    continue
                layers.setdefault(layer, []).append(pts)

            # ── ARC (kapı kanatları, köşe yuvarlamaları) ──────────────────────
            elif etype == "ARC":
                cx = float(entity.dxf.center.x)
                cy = float(entity.dxf.center.y)
                r  = float(entity.dxf.radius)
                sa = float(entity.dxf.start_angle)
                ea = float(entity.dxf.end_angle)
                if r < 1e-6:
                    continue
                pts = arc_to_polyline(cx, cy, r, sa, ea)
                layers.setdefault(layer, []).append(pts)

            # ── CIRCLE ────────────────────────────────────────────────────────
            elif etype == "CIRCLE":
                cx = float(entity.dxf.center.x)
                cy = float(entity.dxf.center.y)
                r  = float(entity.dxf.radius)
                if r < 1e-6:
                    continue
                pts = circle_to_polyline(cx, cy, r)
                layers.setdefault(layer, []).append(pts)

        except Exception:
            continue

    # INSERT bloklarını çöz ve ekle
    insert_layers = extract_insert_points(msp, doc)
    for lyr, polys in insert_layers.items():
        layers.setdefault(lyr, []).extend(polys)

    return layers


def merge_collinear_lines(layers: Layers, tol_angle: float = 0.5,
                          tol_gap: float = 2.0) -> Layers:
    """
    Aynı katmandaki ayrı LINE segmentlerini birleştirerek polyline oluşturur.
    AutoCAD'de duvarlar çoğu zaman ayrı LINE entity'leri olarak gelir.
    tol_angle: derece cinsinden açı toleransı
    tol_gap:   birim cinsinden boşluk toleransı
    """
    merged: Layers = {}
    for layer, polys in layers.items():
        # Sadece 2 noktalı segmentleri (LINE'dan gelenleri) grupla
        segments = [p for p in polys if len(p) == 2]
        others   = [p for p in polys if len(p) != 2]

        if not segments:
            merged[layer] = polys
            continue

        # Uç noktaları eşleştirerek zincirleme bağla
        chains: list[Poly] = []
        used = [False] * len(segments)

        for i, seg in enumerate(segments):
            if used[i]:
                continue
            chain: Poly = [seg[0], seg[1]]
            used[i] = True
            extended = True
            while extended:
                extended = False
                tail = chain[-1]
                for j, other in enumerate(segments):
                    if used[j]:
                        continue
                    if distance(tail, other[0]) < tol_gap:
                        chain.append(other[1])
                        used[j] = True
                        extended = True
                        break
                    if distance(tail, other[1]) < tol_gap:
                        chain.append(other[0])
                        used[j] = True
                        extended = True
                        break
            chains.append(chain)

        merged[layer] = others + chains

    return merged


# ── Graph tabanlı duvar izleme ────────────────────────────────────────────────

def _polys_to_segments(polys: list[Poly]) -> list[tuple[list[float], list[float]]]:
    """Polyline listesini (A, B) segment çiftlerine dönüştürür."""
    segs = []
    for poly in polys:
        for i in range(len(poly) - 1):
            a, b = poly[i], poly[i + 1]
            if distance(a, b) > 1e-6:
                segs.append((list(a), list(b)))
    return segs


def snap_endpoints(
    segments: list[tuple[list[float], list[float]]], tol: float
) -> list[tuple[list[float], list[float]]]:
    """
    Tolerans içindeki uç noktaları birleştirir.
    Grid bucket + Union-Find ile O(N) yaklaşımı.
    """
    # Tüm uç noktaları topla
    raw: list[tuple[float, float]] = []
    for a, b in segments:
        raw.append((round(a[0], 6), round(a[1], 6)))
        raw.append((round(b[0], 6), round(b[1], 6)))

    # Union-Find
    parent: dict[tuple[float, float], tuple[float, float]] = {p: p for p in raw}

    def find(x: tuple[float, float]) -> tuple[float, float]:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: tuple[float, float], y: tuple[float, float]) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    cell = tol
    grid: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for pt in raw:
        cx = int(math.floor(pt[0] / cell))
        cy = int(math.floor(pt[1] / cell))
        grid[(cx, cy)].append(pt)

    for pt in raw:
        cx = int(math.floor(pt[0] / cell))
        cy = int(math.floor(pt[1] / cell))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in grid[(cx + dx, cy + dy)]:
                    if other != pt and math.hypot(pt[0] - other[0], pt[1] - other[1]) <= tol:
                        union(pt, other)

    # Her gruba canonical (ortalama) temsilci ata
    groups: dict[tuple[float, float], list[tuple[float, float]]] = defaultdict(list)
    for pt in raw:
        groups[find(pt)].append(pt)

    canonical: dict[tuple[float, float], tuple[float, float]] = {}
    for members in groups.values():
        avg_x = sum(p[0] for p in members) / len(members)
        avg_y = sum(p[1] for p in members) / len(members)
        rep = (round(avg_x, 4), round(avg_y, 4))
        for m in members:
            canonical[m] = rep

    result = []
    for a, b in segments:
        ak = (round(a[0], 6), round(a[1], 6))
        bk = (round(b[0], 6), round(b[1], 6))
        ca = canonical.get(ak, ak)
        cb = canonical.get(bk, bk)
        if ca != cb:
            result.append((list(ca), list(cb)))
    return result


def split_segments_at_tjunctions(
    segments: list[tuple[list[float], list[float]]], tol: float
) -> list[tuple[list[float], list[float]]]:
    """
    Bir segmentin uç noktası başka bir segmentin iç kısmına düşüyorsa
    o segmenti böler (T-junction → graph node).
    """
    endpoints: list[tuple[float, float]] = []
    for a, b in segments:
        endpoints.append((a[0], a[1]))
        endpoints.append((b[0], b[1]))

    split_tol = tol * 0.5
    result = []
    for seg in segments:
        a, b = seg
        splits: list[tuple[float, list[float]]] = []
        for pt_tuple in endpoints:
            pt = list(pt_tuple)
            if distance(pt, a) < split_tol or distance(pt, b) < split_tol:
                continue
            t, proj = project_on_segment(pt, a, b)
            if 0.01 < t < 0.99 and distance(pt, proj) < split_tol:
                splits.append((t, proj))
        if not splits:
            result.append(seg)
        else:
            splits.sort(key=lambda x: x[0])
            pts: list[list[float]] = [a] + [s[1] for s in splits] + [b]
            for i in range(len(pts) - 1):
                if distance(pts[i], pts[i + 1]) > split_tol * 0.1:
                    result.append((pts[i], pts[i + 1]))
    return result


def _norm_angle(a: float) -> float:
    """Açıyı [-π, π] aralığına normalize eder."""
    while a > math.pi:
        a -= 2 * math.pi
    while a <= -math.pi:
        a += 2 * math.pi
    return a


def build_planar_graph(
    segments: list[tuple[list[float], list[float]]]
) -> dict[tuple[float, float], list[tuple[tuple[float, float], float]]]:
    """
    Her segment için iki yönlü half-edge oluşturur.
    Dönen dict: node → [(komşu_node, açı_radyan), ...] açıya göre sıralı.
    """
    graph: dict[
        tuple[float, float],
        list[tuple[tuple[float, float], float]],
    ] = defaultdict(list)
    for a, b in segments:
        at = (a[0], a[1])
        bt = (b[0], b[1])
        angle_ab = math.atan2(b[1] - a[1], b[0] - a[0])
        angle_ba = math.atan2(a[1] - b[1], a[0] - b[0])
        graph[at].append((bt, angle_ab))
        graph[bt].append((at, angle_ba))
    for node in graph:
        graph[node].sort(key=lambda e: e[1])
    return dict(graph)


def trace_outer_boundary(
    graph: dict[tuple[float, float], list[tuple[tuple[float, float], float]]]
) -> Poly:
    """
    Planar graph'ın dış sınırını DCEL half-edge kuralıyla izler.
    Her adımda "gelen yönün tersinden sonraki CCW kenar" seçilir.
    Başlangıç: en alttaki-soldaki node → sağa doğru ilk kenar.
    """
    if not graph:
        return []

    # En alttaki-soldaki node (outer face'de garantili)
    start = min(graph.keys(), key=lambda p: (p[1], p[0]))
    outgoing = graph[start]
    if not outgoing:
        return []

    # Başlangıç kenarı: aşağıdan geliyormuş gibi davran (reverse = π/2 = yukarı)
    # En küçük CCW farkı olan kenarı seç → en sağdaki kenar
    init_reverse = math.pi / 2  # yukarı yönü = sanki aşağıdan gelindi

    def ccw_diff(angle: float, after: float) -> float:
        d = _norm_angle(angle - after)
        if d <= 1e-9:
            d += 2 * math.pi
        return d

    first_node, first_angle = min(outgoing, key=lambda e: ccw_diff(e[1], init_reverse))

    boundary: Poly = [list(start)]
    current = first_node
    prev_angle = first_angle
    max_steps = len(graph) * 4 + 10
    steps = 0

    while current != start and steps < max_steps:
        boundary.append(list(current))
        out_cur = graph.get(current, [])
        if not out_cur:
            break
        if len(out_cur) == 1:
            next_node, next_angle = out_cur[0]
        else:
            reverse = _norm_angle(prev_angle + math.pi)
            next_node, next_angle = min(out_cur, key=lambda e: ccw_diff(e[1], reverse))
        current = next_node
        prev_angle = next_angle
        steps += 1

    boundary.append(list(start))
    return boundary


def _convex_hull_fallback(pts: list[list[float]]) -> Poly:
    """Gift-wrapping ile dışbükey kabuk (yedek polygon)."""
    if len(pts) < 3:
        return pts
    unique = list({(round(p[0], 4), round(p[1], 4)) for p in pts})
    if len(unique) < 3:
        return [[p[0], p[1]] for p in unique]
    # En sol-alt nokta
    start_idx = min(range(len(unique)), key=lambda i: (unique[i][1], unique[i][0]))
    hull = [list(unique[start_idx])]
    current_idx = start_idx
    while True:
        best = (current_idx + 1) % len(unique)
        for j in range(len(unique)):
            if j == current_idx:
                continue
            cx, cy = unique[current_idx]
            bx, by = unique[best]
            jx, jy = unique[j]
            cross = (bx - cx) * (jy - cy) - (by - cy) * (jx - cx)
            if cross < 0 or (cross == 0 and distance([jx, jy], [cx, cy]) > distance([bx, by], [cx, cy])):
                best = j
        if best == start_idx:
            break
        hull.append(list(unique[best]))
        current_idx = best
        if len(hull) > len(unique) + 1:
            break
    hull.append(hull[0])
    return hull


def trace_wall_polygon(wall_polys: list[Poly]) -> Optional[Poly]:
    """
    Duvar polyline'larından graph tabanlı dış sınır izlemesiyle oda poligonu üretir.
    Başarısız olursa None döner (fallback tetiklenir).
    """
    if not wall_polys:
        return None

    # Tek kapalı büyük polyline → direkt kullan
    closed = [p for p in wall_polys if is_closed(p) and len(p) >= 5]
    if len(closed) == 1 and len(wall_polys) <= 3:
        return closed[0]

    # Segment grafiği oluştur
    all_pts = [p for poly in wall_polys for p in poly]
    if not all_pts:
        return None
    b = bbox(wall_polys)
    diag = math.hypot(b["width"], b["height"])
    snap_tol = max(2.0, diag * 0.001)

    raw_segs = _polys_to_segments(wall_polys)
    if not raw_segs:
        return None

    snapped = snap_endpoints(raw_segs, snap_tol)
    split = split_segments_at_tjunctions(snapped, snap_tol)
    graph = build_planar_graph(split)

    if len(graph) < 3:
        return None

    poly = trace_outer_boundary(graph)

    if len(poly) < 4:
        return None

    # Geçerlilik kontrolleri
    area = poly_true_area(poly)
    if area < (b["width"] * b["height"]) * 0.01:
        # Çok küçük → convex hull ile dene
        all_nodes = [list(n) for n in graph.keys()]
        poly = _convex_hull_fallback(all_nodes)

    if len(poly) < 4:
        return None

    if is_self_intersecting(poly):
        all_nodes = [list(n) for n in graph.keys()]
        poly = _convex_hull_fallback(all_nodes)

    return poly


def analyse_entities(msp: Modelspace) -> tuple[dict, dict]:
    """Entity tiplerini ve katman dağılımını sayar (raporlama amaçlı)."""
    types: Counter = Counter()
    layers: dict[str, Counter] = {}
    for entity in msp:
        types[entity.dxftype()] += 1
        try:
            layer = entity.dxf.layer
        except Exception:
            layer = "0"
        layers.setdefault(layer, Counter())[entity.dxftype()] += 1
    return dict(types), layers


def extract_text_annotations(msp: Modelspace) -> dict:
    """TEXT/MTEXT anotasyonlarından oda alanı ve açıklık ölçülerini çıkarır."""
    items: list[dict] = []
    joined_parts: list[str] = []

    for entity in msp:
        if entity.dxftype() not in {"TEXT", "MTEXT"}:
            continue
        try:
            raw = entity.plain_text() if hasattr(entity, "plain_text") else entity.dxf.text
            text = str(raw or "").strip()
            insert = getattr(entity.dxf, "insert", None)
            x = float(insert.x) if insert is not None else 0.0
            y = float(insert.y) if insert is not None else 0.0
        except Exception:
            continue
        if not text:
            continue
        normalized = re.sub(r"\s+", " ", text.replace(",", ".")).strip()
        items.append({"text": text, "normalized": normalized, "x": x, "y": y})
        joined_parts.append(normalized)

    joined = " ".join(joined_parts).lower()

    def number(pattern: str) -> Optional[float]:
        match = re.search(pattern, joined, flags=re.IGNORECASE)
        return float(match.group(1)) if match else None

    area_m2 = number(r"alan\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*m")
    ceiling_cm = number(r"(?:^|\s)h\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*cm")
    beam_cm = number(r"kiri[şs]\s*h\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*cm")
    beam_labels = [
        item for item in items
        if re.fullmatch(r"kiri[şs]", item["normalized"].strip(), flags=re.IGNORECASE)
    ]

    door_match = re.search(r"\bK\d+\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*([0-9]+(?:\.[0-9]+)?)\s*cm", joined, re.IGNORECASE)
    window_match = re.search(r"\bP\d+\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*([0-9]+(?:\.[0-9]+)?)\s*cm(?:\s*h\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*cm)?", joined, re.IGNORECASE)
    niche_match = re.search(r"ni[şs].*?h\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*cm.*?zeminden\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*cm", joined, re.IGNORECASE)

    return {
        "items": items,
        "area_m2": area_m2,
        "ceiling_height_m": ceiling_cm / 100 if ceiling_cm else None,
        "beam_height_m": beam_cm / 100 if beam_cm else None,
        "beams": [
            {
                "label": item["text"],
                "x": item["x"],
                "y": item["y"],
                "height_m": beam_cm / 100 if beam_cm else None,
            }
            for item in beam_labels
        ],
        "door": {
            "width_m": float(door_match.group(1)) / 100,
            "height_m": float(door_match.group(2)) / 100,
        } if door_match else None,
        "window": {
            "width_m": float(window_match.group(1)) / 100,
            "height_m": float(window_match.group(2)) / 100,
            "sill_m": float(window_match.group(3)) / 100 if window_match.group(3) else None,
        } if window_match else None,
        "niche": {
            "height_m": float(niche_match.group(1)) / 100,
            "sill_m": float(niche_match.group(2)) / 100,
        } if niche_match else None,
    }


def calibrate_scale_from_annotations(scale: float, scale_source: str,
                                     room_area_units2: float,
                                     annotations: dict) -> tuple[float, str]:
    """Metindeki alan değeri geometriyle ciddi çelişirse ölçeği alan üzerinden kalibre eder."""
    annotated_area = annotations.get("area_m2")
    if not annotated_area or room_area_units2 <= 0:
        return scale, scale_source
    measured_area = room_area_units2 * scale * scale
    if measured_area <= 0:
        return scale, scale_source
    ratio = measured_area / annotated_area
    if 0.7 <= ratio <= 1.3:
        return scale, scale_source
    calibrated = math.sqrt(annotated_area / room_area_units2)
    return calibrated, f"annotation_area:{annotated_area:g}m2"

# ── Geometri yardımcıları ─────────────────────────────────────────────────────

def bbox(polys: list[Poly]) -> dict:
    """Polyline listesinin bounding box'ını hesaplar."""
    all_pts = [p for poly in polys for p in poly]
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    return {
        "xmin": min(xs), "xmax": max(xs),
        "ymin": min(ys), "ymax": max(ys),
        "width":  round(max(xs) - min(xs), 4),
        "height": round(max(ys) - min(ys), 4),
    }


def normalize_poly(poly: Poly, ox: float, oy: float) -> Poly:
    """Polyline noktalarını (ox, oy) orijinine göre normalize eder."""
    return [[round(p[0] - ox, 4), round(p[1] - oy, 4)] for p in poly]


def normalize_layer(polys: list[Poly], ox: float, oy: float) -> list[Poly]:
    return [normalize_poly(poly, ox, oy) for poly in polys]


def is_closed(poly: Poly, tol: float = 0.1) -> bool:
    """İlk ve son nokta arasındaki fark tol'dan küçükse kapalı kabul eder."""
    if len(poly) < 2:
        return False
    return abs(poly[0][0] - poly[-1][0]) < tol and abs(poly[0][1] - poly[-1][1]) < tol


def _shoelace_signed_area_legacy(poly: Poly) -> float:
    """Eski Shoelace implementasyonu — regresyon testleri ve fallback için korunur."""
    if len(poly) < 3:
        return 0.0
    n = len(poly)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += poly[i][0] * poly[j][1]
        area -= poly[j][0] * poly[i][1]
    return area / 2.0


def poly_signed_area(poly: Poly) -> float:
    """
    İşaretli alan (CCW pozitif). Shapely varsa onu kullanır; yoksa Shoelace.
    Shapely sürümü self-intersecting polylineları daha sağlam ele alır.
    """
    if len(poly) < 3:
        return 0.0
    if _SHAPELY_AVAILABLE:
        try:
            sp = _ShapelyPolygon([(p[0], p[1]) for p in poly])
            if sp.is_valid and not sp.is_empty:
                signed = sp.area
                return signed if _shoelace_signed_area_legacy(poly) >= 0 else -signed
        except Exception:
            pass
    return _shoelace_signed_area_legacy(poly)


def poly_true_area(poly: Poly) -> float:
    """Mutlak alan (bounding box değil)."""
    return abs(poly_signed_area(poly))


def compute_net_area(outline: Poly, openings: list[dict]) -> float:
    """
    Oda dış sınırından kapı/pencere/niş açıklıklarını çıkararak net kaplama alanı döner.

    outline: oda dış konturu (kapalı polyline, units cinsinden)
    openings: her biri {x, y, w, h} içeren feature dict listesi (units cinsinden)
    Dönüş: units² cinsinden net alan.

    Shapely yoksa basit toplam-çıkarma fallback'i kullanır (intersection-aware değil).
    """
    if not outline or len(outline) < 3:
        return 0.0

    if not _SHAPELY_AVAILABLE:
        gross = poly_true_area(outline)
        cut = 0.0
        for op in openings or []:
            w = float(op.get("w") or 0.0)
            h = float(op.get("h") or 0.0)
            if w > 0 and h > 0:
                cut += w * h
        return max(gross - cut, 0.0)

    try:
        room = _ShapelyPolygon([(p[0], p[1]) for p in outline])
        if not room.is_valid:
            room = room.buffer(0)
        for op in openings or []:
            try:
                x = float(op.get("x") or 0.0)
                y = float(op.get("y") or 0.0)
                w = float(op.get("w") or 0.0)
                h = float(op.get("h") or 0.0)
                if w <= 0 or h <= 0:
                    continue
                opening_box = _shapely_box(x, y, x + w, y + h)
                room = room.difference(opening_box)
            except Exception:
                continue
        return float(room.area)
    except Exception:
        return poly_true_area(outline)


def poly_box_area(poly: Poly) -> float:
    """Hızlı bounding-box alanı (sınıflandırma için)."""
    if len(poly) < 2:
        return 0.0
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def poly_box_dims(poly: Poly) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return max(xs) - min(xs), max(ys) - min(ys)


def distance(a: list[float], b: list[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def clean_poly(poly: Poly, tol: float = 0.05) -> Poly:
    """Çakışan ve çok yakın noktaları temizler."""
    cleaned: Poly = []
    for point in poly:
        if not cleaned or distance(cleaned[-1], point) > tol:
            cleaned.append(point)
    if len(cleaned) > 1 and distance(cleaned[0], cleaned[-1]) <= tol:
        cleaned[-1] = cleaned[0]
    return cleaned


def remove_collinear(poly: Poly, tol: float = 1e-4) -> Poly:
    """Doğrusal üç noktadan ortadakini kaldırır."""
    if len(poly) < 4:
        return poly
    closed = poly[:]
    result: Poly = [closed[0]]
    for i in range(1, len(closed) - 1):
        ax, ay = result[-1]
        bx, by = closed[i]
        cx, cy = closed[i + 1]
        cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
        if abs(cross) > tol:
            result.append(closed[i])
    result.append(closed[-1])
    return result


def _segments_intersect(a1: list[float], a2: list[float],
                        b1: list[float], b2: list[float],
                        tol: float = 1e-6) -> bool:
    def orient(p: list[float], q: list[float], r: list[float]) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    def on_seg(p: list[float], q: list[float], r: list[float]) -> bool:
        return (min(p[0], r[0]) - tol <= q[0] <= max(p[0], r[0]) + tol
                and min(p[1], r[1]) - tol <= q[1] <= max(p[1], r[1]) + tol)

    o1, o2 = orient(a1, a2, b1), orient(a1, a2, b2)
    o3, o4 = orient(b1, b2, a1), orient(b1, b2, a2)
    if ((o1 > tol and o2 < -tol) or (o1 < -tol and o2 > tol)) and \
       ((o3 > tol and o4 < -tol) or (o3 < -tol and o4 > tol)):
        return True
    if abs(o1) <= tol and on_seg(a1, b1, a2): return True
    if abs(o2) <= tol and on_seg(a1, b2, a2): return True
    if abs(o3) <= tol and on_seg(b1, a1, b2): return True
    if abs(o4) <= tol and on_seg(b1, a2, b2): return True
    return False


def is_self_intersecting(poly: Poly) -> bool:
    if len(poly) < 5:
        return False
    n = len(poly) - 1
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if _segments_intersect(poly[i], poly[i + 1], poly[j], poly[j + 1]):
                return True
    return False


def ensure_ccw(poly: Poly) -> Poly:
    """Poligonun CCW (saat yönü tersi) sırada olmasını garanti eder."""
    if poly_signed_area(poly) < 0:
        # CW → CCW: ilk ve son nokta sabit tutularak ortası tersine çevrilir
        if is_closed(poly):
            return [poly[0]] + list(reversed(poly[1:-1])) + [poly[0]]
        return list(reversed(poly))
    return poly


def close_polygon_generic(poly: Poly) -> Poly:
    """
    Açık bir polyline'ı kapatmaya çalışır.
    Dikdörtgen varsayımı YOK — doğrudan başlangıç noktasına bağlanır.
    Zaten kapalıysa dokunmaz.
    """
    poly = clean_poly(poly)
    if len(poly) < 3:
        return poly
    if is_closed(poly):
        closed = poly[:]
        if closed[-1] != closed[0]:
            closed.append(closed[0])
        return remove_collinear(closed)
    # Doğrudan kapat — L/U/T şekilli odalarda köşe ekleme yapmıyoruz
    closed = poly + [poly[0]]
    return remove_collinear(clean_poly(closed))


def normalize_room_polygon(poly: Poly) -> tuple[Poly, bool]:
    normalized = close_polygon_generic(poly)
    normalized = remove_collinear(clean_poly(normalized))
    normalized = ensure_ccw(normalized)
    return normalized, is_closed(normalized)


def stitch_open_polyline(poly: Poly, context_polys: list[Poly],
                         tol_gap: float = 16.0) -> Poly:
    """
    Açık oda konturunu doğrudan diyagonal kapatmak yerine çevredeki
    çizgi ağından poly[-1] → poly[0] bağlantısını bulmaya çalışır.
    """
    if is_closed(poly) or len(poly) < 3:
        return poly

    start = tuple(round(v, 4) for v in poly[-1])
    target = tuple(round(v, 4) for v in poly[0])
    graph: dict[tuple[float, float], list[tuple[float, tuple[float, float]]]] = defaultdict(list)
    nodes: set[tuple[float, float]] = {start, target}

    def add_edge(a: tuple[float, float], b: tuple[float, float], cost: Optional[float] = None) -> None:
        if a == b:
            return
        edge_cost = distance(list(a), list(b)) if cost is None else cost
        graph[a].append((edge_cost, b))
        graph[b].append((edge_cost, a))
        nodes.add(a)
        nodes.add(b)

    for other in context_polys:
        if len(other) < 2:
            continue
        pts = [tuple(round(v, 4) for v in p) for p in other]
        for a, b in zip(pts, pts[1:]):
            add_edge(a, b)

    node_list = list(nodes)
    for i, a in enumerate(node_list):
        for b in node_list[i + 1:]:
            gap = distance(list(a), list(b))
            if 0 < gap <= tol_gap:
                add_edge(a, b, gap * 1.5)

    queue: list[tuple[float, tuple[float, float]]] = [(0.0, start)]
    costs = {start: 0.0}
    previous: dict[tuple[float, float], tuple[float, float]] = {}

    while queue:
        current_cost, current = heappop(queue)
        if current == target:
            break
        if current_cost > costs.get(current, float("inf")):
            continue
        for edge_cost, neighbor in graph.get(current, []):
            next_cost = current_cost + edge_cost
            if next_cost < costs.get(neighbor, float("inf")):
                costs[neighbor] = next_cost
                previous[neighbor] = current
                heappush(queue, (next_cost, neighbor))

    if target not in costs:
        return poly

    path: list[tuple[float, float]] = []
    cursor = target
    while cursor != start:
        path.append(cursor)
        cursor = previous[cursor]
    path.append(start)
    path.reverse()
    if len(path) < 3:
        return poly
    return poly + [[float(x), float(y)] for x, y in path[1:]]


def point_to_segment_distance(point: list[float],
                               a: list[float], b: list[float]) -> float:
    ax, ay = a; bx, by = b; px, py = point
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 <= 1e-9:
        return distance(point, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return distance(point, [ax + t * dx, ay + t * dy])


def project_on_segment(point: list[float],
                       a: list[float], b: list[float]) -> tuple[float, list[float]]:
    ax, ay = a; bx, by = b; px, py = point
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 <= 1e-9:
        return 0.0, list(a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return t, [ax + t * dx, ay + t * dy]

# ── Duvar çift-çizgi tespiti ve kalınlık ölçümü ──────────────────────────────

def _poly_dominant_angle(poly: Poly) -> Optional[float]:
    """En uzun segmente göre polyline'ın baskın açısını döner ([0, π) aralığında)."""
    if len(poly) < 2:
        return None
    max_len = 0.0
    best_angle = None
    for i in range(len(poly) - 1):
        a, b = poly[i], poly[i + 1]
        seg_len = distance(a, b)
        if seg_len > max_len:
            max_len = seg_len
            best_angle = math.atan2(b[1] - a[1], b[0] - a[0]) % math.pi
    return best_angle


def _polys_are_parallel(p1: Poly, p2: Poly, angle_tol_deg: float = 10.0) -> bool:
    """İki polyline'ın baskın açıları paralel mi?"""
    a1 = _poly_dominant_angle(p1)
    a2 = _poly_dominant_angle(p2)
    if a1 is None or a2 is None:
        return False
    diff = abs(a1 - a2)
    tol = math.radians(angle_tol_deg)
    return diff < tol or diff > math.pi - tol


def detect_wall_thickness(wall_polys: list[Poly]) -> float:
    """
    AutoCAD'de duvarlar çoğunlukla iki paralel polyline (iç/dış) olarak çizilir.
    Yalnızca paralel çizgi çiftleri değerlendirilerek duvar kalınlığı tahmin edilir.
    Bulunamazsa 0 döner (bilinmiyor).
    """
    if len(wall_polys) < 2:
        return 0.0

    min_dist = float("inf")
    for i in range(len(wall_polys)):
        for j in range(i + 1, len(wall_polys)):
            p1 = wall_polys[i]
            p2 = wall_polys[j]
            if len(p1) < 2 or len(p2) < 2:
                continue
            # Sadece paralel polyline çiftlerini değerlendir
            if not _polys_are_parallel(p1, p2):
                continue
            sample = min(len(p1), 8)
            step = max(1, len(p1) // sample)
            local_min = float("inf")
            for k in range(0, len(p1), step):
                pt = p1[k]
                for seg_idx in range(len(p2) - 1):
                    d = point_to_segment_distance(pt, p2[seg_idx], p2[seg_idx + 1])
                    if d < local_min:
                        local_min = d
            if local_min < min_dist:
                min_dist = local_min

    if 0.0 < min_dist < float("inf"):
        return round(min_dist, 4)
    return 0.0

# ── Ölçek tespiti ─────────────────────────────────────────────────────────────

def _parse_dimension_value(text: str) -> Optional[tuple[float, str]]:
    """
    Metin içinden gerçek-dünya ölçüsünü çıkarır.
    Döner: (metre_cinsinden_değer, birim_adı) veya None.
    Öncelik sırası: açık birim etiketi > bare sayı (mm varsayımı).
    """
    t = re.sub(r"\s+", "", text.replace(",", "."))
    # Açık birimler
    for pattern, multiplier, name in [
        (r"([0-9]+(?:\.[0-9]+)?)\s*mm\b",   1e-3,  "mm"),
        (r"([0-9]+(?:\.[0-9]+)?)\s*cm\b",   1e-2,  "cm"),
        (r"([0-9]+(?:\.[0-9]+)?)\s*m\b",    1.0,   "m"),
        (r"([0-9]+(?:\.[0-9]+)?)\s*inch\b", 0.0254, "inch"),
        (r"([0-9]+(?:\.[0-9]+)?)\s*'",      0.3048, "ft"),
    ]:
        m = re.search(pattern, t, re.IGNORECASE)
        if m:
            return float(m.group(1)) * multiplier, name
    # Bare sayı: 3 veya daha fazla basamak → mm varsayımı
    m = re.search(r"\b([2-9][0-9]{2,4})\b", t)
    if m:
        return float(m.group(1)) * 1e-3, "bare_mm"
    return None


def detect_scale_from_dimensions(
    msp: "Modelspace", wall_w: float, wall_h: float
) -> tuple[Optional[float], Optional[str]]:
    """
    DIMENSION entity'lerin actual_measurement vs. metin değerini karşılaştırarak ölçek çıkarır.
    TEXT/MTEXT anotasyonlarını da değerlendirir.
    Geçerli bir oran bulunamazsa (None, None) döner.
    """
    candidates: list[tuple[float, str]] = []

    # 1. DIMENSION entity
    for entity in msp:
        if entity.dxftype() != "DIMENSION":
            continue
        try:
            dxf_meas = float(getattr(entity.dxf, "actual_measurement", 0) or 0)
            if dxf_meas <= 0:
                continue
            raw_text = ""
            try:
                raw_text = entity.dxf.text or ""
            except Exception:
                pass
            if not raw_text or raw_text.strip() in ("<>", ""):
                raw_text = str(dxf_meas)
            result = _parse_dimension_value(raw_text)
            if result:
                real_m, unit = result
                scale = real_m / dxf_meas
                if 1e-6 < scale < 2.0:
                    candidates.append((scale, f"dim_entity:{unit}:{real_m:.3g}m"))
        except Exception:
            continue

    # 2. TEXT/MTEXT — boyuta karşı test et
    for entity in msp:
        if entity.dxftype() not in {"TEXT", "MTEXT"}:
            continue
        try:
            raw = entity.plain_text() if hasattr(entity, "plain_text") else entity.dxf.text
            text = str(raw or "").strip()
        except Exception:
            continue
        if not text:
            continue
        result = _parse_dimension_value(text)
        if not result:
            continue
        real_m, unit = result
        if unit == "bare_mm" and real_m < 0.3:
            continue  # çok küçük rakam anlamlı değil
        for dim in (wall_w, wall_h):
            if dim <= 0:
                continue
            scale = real_m / dim
            if 1e-6 < scale < 2.0:
                # Plausibility: oda bu ölçekte 0.3–50 m arasında mı?
                w_m = wall_w * scale
                h_m = wall_h * scale
                if 0.3 <= w_m <= 50 and 0.3 <= h_m <= 50:
                    candidates.append((scale, f"text_annot:{unit}:{real_m:.3g}m"))

    if not candidates:
        return None, None
    # En sık görülen ölçeği seç (binom oylama)
    # Önce grupla (0.5% toleranslı)
    buckets: list[list[tuple[float, str]]] = []
    for cand in candidates:
        placed = False
        for bucket in buckets:
            if abs(cand[0] / bucket[0][0] - 1.0) < 0.005:
                bucket.append(cand)
                placed = True
                break
        if not placed:
            buckets.append([cand])
    best_bucket = max(buckets, key=len)
    avg_scale = sum(c[0] for c in best_bucket) / len(best_bucket)
    return round(avg_scale, 10), best_bucket[0][1]


def _detect_scale_heuristic(wall_w: float, wall_h: float) -> tuple[float, str]:
    """
    Plausibility scoring ile aday ölçek listesinden en mantıklı olanı seçer.
    Eski rijit eşik mantığının yerine geçer.
    """
    candidates = [
        (1e-3,   "mm"),
        (1e-2,   "cm"),
        (0.0254, "inch"),
        (1.0,    "m"),
        (1e-1,   "dm"),
        (1e-5,   "µm"),
    ]

    def plausibility(scale: float) -> float:
        w = wall_w * scale
        h = wall_h * scale
        if w < 0.3 or h < 0.3 or w > 50 or h > 50:
            return -1000.0
        score = 0.0
        if 1.5 <= w <= 12:
            score += 10
        if 1.5 <= h <= 12:
            score += 10
        asp = max(w, h) / max(min(w, h), 0.01)
        if 1.0 <= asp <= 5.0:
            score += 5
        return score

    best_scale, best_name = max(candidates, key=lambda c: plausibility(c[0]))
    return best_scale, f"heuristic:{best_name}"


def detect_scale(wall_w: float, wall_h: float,
                 insunits: Optional[int] = None,
                 msp: Optional["Modelspace"] = None) -> tuple[float, str]:
    """
    DXF koordinat birimini metriye çeviren ölçek faktörünü ve kaynağını döner.

    Öncelik sırası:
      1. $INSUNITS başlık değeri (AutoCAD standardı, en güvenilir)
      2. DIMENSION entity / TEXT anotasyonlarından çıkarım
      3. Plausibility scoring tabanlı buluşsal yöntem
    """
    # 1. $INSUNITS
    if insunits is not None:
        scale = insunits_to_scale(insunits)
        if scale is not None and scale > 0:
            return scale, f"$INSUNITS={insunits}"

    # 2. Dimension / annotation tabanlı
    if msp is not None:
        scale, source = detect_scale_from_dimensions(msp, wall_w, wall_h)
        if scale:
            return scale, source

    # 3. Plausibility scoring buluşsal yöntem
    return _detect_scale_heuristic(wall_w, wall_h)

# ── Katman eşleştirme ─────────────────────────────────────────────────────────

def find_layer(layers: Layers, *keywords: str) -> list[Poly]:
    """
    Anahtar kelimelerden herhangi birini (büyük/küçük harf duyarsız)
    içeren tüm katmanların polyline'larını birleştirerek döner.
    """
    result: list[Poly] = []
    for kw in keywords:
        kw_lower = kw.lower()
        for key, polys in layers.items():
            if kw_lower in key.lower():
                result.extend(polys)
    return result


def _norm_layer_name(layer_name: str) -> str:
    return (layer_name or "").strip().lower()

# ── Sınıflandırma ─────────────────────────────────────────────────────────────

def classify_wall_polys(polys: list[Poly]) -> tuple[list[Poly], list[Poly]]:
    """
    Büyük/açık poligonlar  → oda konturu
    Küçük kapalı poligonlar → seramik dekor

    Eşik olarak bounding-box değil Shoelace alanı kullanılır,
    L/U şekilli odaların küçük görünmesini önler.
    """
    if not polys:
        return [], []

    areas = [(p, poly_true_area(p) if len(p) >= 3 else poly_box_area(p)) for p in polys]
    max_area = max(a for _, a in areas) if areas else 1.0

    room_outline: list[Poly] = []
    tiles: list[Poly] = []

    for poly, area in areas:
        # Oda konturu: açık ya da toplam alanın %5'inden büyük
        if not is_closed(poly) or area > max_area * 0.05:
            room_outline.append(poly)
        else:
            tiles.append(poly)

    return room_outline, tiles


def fallback_classify(layers: Layers) -> tuple[list[Poly], list[Poly], list[Poly], list[Poly]]:
    """
    Katman adı eşleşmesi yoksa geometri tabanlı sınıflandırma.
    Hem açık hem kapalı büyük konturları oda adayı olarak değerlendirir.
    Title block / başlık kutusu hariç tutulur (full_area'nın >%90'ı olan poligonlar).
    """
    all_polys = [poly for polys in layers.values() for poly in polys]
    if not all_polys:
        return [], [], [], []

    full_box  = bbox(all_polys)
    full_area = max(full_box["width"] * full_box["height"], 1e-6)
    full_w    = full_box["width"]
    full_h    = full_box["height"]

    def room_score(poly: Poly) -> float:
        area = poly_true_area(poly) if len(poly) >= 3 else poly_box_area(poly)
        if area <= 0:
            return -1e9
        width, height = poly_box_dims(poly)
        if width <= 0 or height <= 0:
            return -1e9
        bbox_area = width * height
        area_ratio = bbox_area / full_area
        aspect = max(width, height) / max(min(width, height), 1e-6)
        score = area_ratio * 100.0
        score += min(len(poly), 24) * 1.5
        if len(poly) >= 4:
            score += 18.0
        if not is_closed(poly):
            score += 10.0
        if 1.0 <= aspect <= 2.4:
            score += 16.0
        elif aspect <= 4.0:
            score += 6.0
        # Title block / dış çerçeve cezası — tam ekranı kaplayan poligonlar
        if area_ratio > 0.90:
            score -= 80.0
        if len(poly) <= 2:
            score -= 120.0
        return score

    candidates = [p for p in all_polys if len(p) >= 4 or is_closed(p)]
    if not candidates:
        candidates = sorted(all_polys, key=poly_box_area, reverse=True)[:1]

    best_room = max(candidates, key=room_score)
    if not is_closed(best_room):
        best_room = stitch_open_polyline(
            best_room,
            [poly for poly in all_polys if poly is not best_room],
        )
    normalized_room, _ = normalize_room_polygon(best_room)
    room_outline = [normalized_room]
    room_area    = poly_true_area(normalized_room) or poly_box_area(normalized_room)
    room_bounds  = bbox([normalized_room])

    def overlaps_room(poly: Poly) -> bool:
        pb = bbox([poly])
        return not (pb["xmax"] < room_bounds["xmin"] or pb["xmin"] > room_bounds["xmax"]
                    or pb["ymax"] < room_bounds["ymin"] or pb["ymin"] > room_bounds["ymax"])

    closed_polys = [p for p in all_polys if is_closed(p)]
    tiles = [
        p for p in closed_polys
        if p is not best_room and p is not normalized_room
        and overlaps_room(p)
        and 0 < poly_box_area(p) < room_area * 0.12
    ][:120]

    return room_outline, tiles, [], []

# ── Yüzey / duvar segmentleri ────────────────────────────────────────────────

def build_surface_hints(room_poly: Poly) -> list[dict]:
    """Oda konturunun her kenarını bir yüzey segmenti olarak tanımlar."""
    surfaces: list[dict] = []
    pts = room_poly if not is_closed(room_poly) else room_poly[:-1]
    n = len(pts)
    for index in range(n):
        a = pts[index]
        b = pts[(index + 1) % n]
        seg_len = distance(a, b)
        if seg_len <= 0.1:
            continue
        surfaces.append({
            "id":     f"wall-{len(surfaces)}",
            "a":      a,
            "b":      b,
            "length": seg_len,
        })
    return surfaces


def extract_wall_segments(layer_data: Layers, room_poly: Poly,
                          min_len: float = 18.0) -> list[dict]:
    """
    Katman adı yoksa bile uzun, eksen hizalı CAD çizgilerini duvar yüzeyi adayı
    olarak çıkarır. Çift çizgili planlarda dış kabuk ve iç yüzey çizgileri
    böylece 3D modele taşınır.
    """
    room_bounds = bbox([room_poly])
    room_area = max(poly_true_area(room_poly) or poly_box_area(room_poly), 1.0)
    major_len = max(room_bounds["width"], room_bounds["height"]) * 0.42
    margin = max(room_bounds["width"], room_bounds["height"]) * 0.16
    segments: list[dict] = []
    seen: set[tuple[float, float, float, float]] = set()

    def append_segments(poly: Poly, layer_name: str) -> None:
        for a, b in zip(poly, poly[1:]):
            length = distance(a, b)
            if length < min_len:
                continue
            dx = abs(a[0] - b[0])
            dy = abs(a[1] - b[1])
            if min(dx, dy) > max(1.5, length * 0.08):
                continue
            if (
                max(a[0], b[0]) < room_bounds["xmin"] - margin
                or min(a[0], b[0]) > room_bounds["xmax"] + margin
                or max(a[1], b[1]) < room_bounds["ymin"] - margin
                or min(a[1], b[1]) > room_bounds["ymax"] + margin
            ):
                continue
            key = tuple(round(v, 1) for point in (a, b) for v in point)
            rev = tuple(round(v, 1) for point in (b, a) for v in point)
            if key in seen or rev in seen:
                continue
            seen.add(key)
            segments.append({
                "id": f"cad-wall-{len(segments)}",
                "a": [round(a[0], 4), round(a[1], 4)],
                "b": [round(b[0], 4), round(b[1], 4)],
                "length": round(length, 4),
                "source_layer": layer_name,
            })

    append_segments(room_poly, "room_outline")

    for layer_name, polys in layer_data.items():
        for poly in polys:
            pb = bbox([poly])
            box_area = pb["width"] * pb["height"]
            is_large_poly = len(poly) >= 4 and box_area >= room_area * 0.05
            is_major_line = len(poly) == 2 and distance(poly[0], poly[1]) >= major_len
            if not is_large_poly and not is_major_line:
                continue
            for a, b in zip(poly, poly[1:]):
                append_segments([a, b], layer_name)

    return segments


def feature_to_surface_hint(feature_bounds: dict,
                              surfaces: list[dict]) -> tuple[Optional[str], float]:
    center = [
        (feature_bounds["xmin"] + feature_bounds["xmax"]) / 2,
        (feature_bounds["ymin"] + feature_bounds["ymax"]) / 2,
    ]
    best_id   = None
    best_dist = 1e9
    for surface in surfaces:
        d = point_to_segment_distance(center, surface["a"], surface["b"])
        if d < best_dist:
            best_dist = d
            best_id   = surface["id"]
    return best_id, best_dist


def feature_rect_on_surface(feature_bounds: dict, surface: dict) -> dict:
    """
    Feature'ın yüzey üzerindeki dikdörtgen konumunu hesaplar.
    x: yüzey boyunca ofset (yüzey başından itibaren)
    w: yüzey boyunca genişlik
    """
    center = [
        (feature_bounds["xmin"] + feature_bounds["xmax"]) / 2,
        (feature_bounds["ymin"] + feature_bounds["ymax"]) / 2,
    ]
    axis_len = max(surface["length"], 1e-6)
    t, _     = project_on_segment(center, surface["a"], surface["b"])
    # Yüzeye paralel boyutu genişlik, dik boyutu yükseklik olarak al
    dx = surface["b"][0] - surface["a"][0]
    dy = surface["b"][1] - surface["a"][1]
    is_horizontal = abs(dx) >= abs(dy)
    w_dim  = feature_bounds["width"]
    h_dim  = feature_bounds["height"]
    opening_w = min(axis_len, (w_dim if is_horizontal else h_dim))
    opening_w = max(opening_w, 0.01)
    x = max(0.0, min(axis_len - opening_w, t * axis_len - opening_w / 2))
    return {
        "x": round(x, 4),
        "y": 0.0,
        "w": round(opening_w, 4),
        "h": round(h_dim if is_horizontal else w_dim, 4),
    }

# ── Feature sınıflandırma ─────────────────────────────────────────────────────

def _feature_confidence_label(score: int) -> str:
    if score >= 5: return "high"
    if score >= 3: return "medium"
    return "low"


def _feature_vertical_defaults(feature_type: str,
                                room_height_3d: float,
                                bbox_h: float, bbox_w: float) -> dict:
    """
    3D modeldeki dikey konum ve boyutları belirler.
    room_height_3d: gerçek oda yüksekliği (metre veya ölçeklenmiş birim).
    """
    if feature_type == "door":
        door_h = max(room_height_3d * 0.78, max(bbox_h, bbox_w) * 0.1)
        return {"y": 0.0, "h": door_h, "sill_h": 0.0, "head_h": door_h}
    if feature_type == "window":
        sill = room_height_3d * 0.34
        head = room_height_3d * 0.76
        return {"y": sill, "h": max(room_height_3d * 0.22, head - sill),
                "sill_h": sill, "head_h": head}
    if feature_type == "niche":
        sill   = room_height_3d * 0.42
        height = max(room_height_3d * 0.15,
                     min(room_height_3d * 0.28, max(bbox_h, bbox_w)))
        return {"y": sill, "h": height, "sill_h": sill, "head_h": sill + height}
    return {"y": 0.0, "h": max(bbox_h, bbox_w), "sill_h": 0.0,
            "head_h": max(bbox_h, bbox_w)}


def _classify_feature_candidate(
    *,
    layer_name: str,
    poly: Poly,
    poly_bounds: dict,
    room_area: float,
    room_w: float,
    room_h: float,
    surface_dist: float,
) -> tuple[Optional[str], list[str], int]:
    """
    Bir entity'yi kapı/pencere/niş/pervaz olarak sınıflandırır.
    Hem katman adı eşleşmesi hem geometri buluşsal yöntemi kullanılır.
    ARC/eğri şekiller kapı olarak tanınır (open_curve_like).
    """
    layer  = _norm_layer_name(layer_name)
    width  = poly_bounds["width"]
    height = poly_bounds["height"]
    area   = max(width * height, 0.0)
    aspect = max(width, height) / max(min(width, height), 1e-6)
    near_boundary = surface_dist < max(room_w, room_h) * 0.08

    validation_flags: list[str] = []
    score = 0
    closed = is_closed(poly)
    open_curve_like = (not closed) and len(poly) >= 4

    if near_boundary:
        validation_flags.append("near_boundary")
        score += 1
    if open_curve_like:
        validation_flags.append("open_poly")
        score += 1
    if closed:
        validation_flags.append("closed_poly")

    # ── Katman adı eşleşmesi (en yüksek öncelik) ──────────────────────────────
    if any(t in layer for t in ("kap", "door", "kapı", "kapi")):
        validation_flags.append("layer_door_match")
        score += 3
        return "door", validation_flags, score
    if any(t in layer for t in ("penc", "window", "pencere")):
        validation_flags.append("layer_window_match")
        score += 3
        return "window", validation_flags, score
    if any(t in layer for t in ("niş", "nis", "niche", "alcove")):
        validation_flags.append("layer_niche_match")
        score += 3
        return "niche", validation_flags, score
    if any(t in layer for t in ("pervaz", "kasa", "frame", "trim", "söve", "sove")):
        validation_flags.append("layer_frame_match")
        score += 3
        return "frame", validation_flags, score

    # ── ARC kökenli eğri → kapı kanat geometrisi ──────────────────────────────
    if open_curve_like and near_boundary and 0 < area < room_area * 0.14:
        # Daire yayı kontrolü: noktalar yaklaşık bir daire üzerinde mi?
        if len(poly) >= 6:
            cx = sum(p[0] for p in poly) / len(poly)
            cy = sum(p[1] for p in poly) / len(poly)
            radii = [distance([cx, cy], p) for p in poly]
            r_mean = sum(radii) / len(radii)
            r_var  = sum((r - r_mean) ** 2 for r in radii) / len(radii)
            if r_mean > 0 and (r_var ** 0.5) / r_mean < 0.15:
                validation_flags.append("arc_door_geometry")
                score += 4
                return "door", validation_flags, score
        if max(width, height) > min(room_w, room_h) * 0.15:
            validation_flags.append("door_arc_geometry")
            score += 3
            return "door", validation_flags, score

    # ── Geometri tabanlı buluşsal ──────────────────────────────────────────────
    if closed and near_boundary and 0 < area < room_area * 0.08:
        if aspect > 2.4 or (max(width, height) > min(room_w, room_h) * 0.18
                             and min(width, height) < min(room_w, room_h) * 0.16):
            validation_flags.append("window_like_ratio")
            score += 2
            return "window", validation_flags, score
        if 1.0 <= aspect <= 2.2 and min(width, height) > min(room_w, room_h) * 0.04:
            validation_flags.append("niche_like_ratio")
            score += 2
            return "niche", validation_flags, score
        if min(width, height) < max(width, height) * 0.22:
            validation_flags.append("frame_like_ratio")
            score += 2
            return "frame", validation_flags, score

    if near_boundary and area < room_area * 0.2:
        validation_flags.append("detail_poly_candidate")
        score += 1
        return "detail_poly", validation_flags, score

    return None, validation_flags, score


def _feature_conflicts(feature: dict, other: dict) -> bool:
    return (
        feature["surface_hint"] == other["surface_hint"]
        and feature["feature_type"] == other["feature_type"]
        and abs(feature["x"] - other["x"]) < 1.0
        and abs(feature["w"] - other["w"]) < 1.0
        and abs(feature["y"] - other["y"]) < 2.0
    )


def _derive_frame_features(opening_feature: dict,
                            room_height_3d: float,
                            seed_id: count) -> list[dict]:
    """Kapı/pencere açıklıklarından pervaz (frame) geometrisi türetir."""
    trim   = max(1.5, min(opening_feature["w"] * 0.12, room_height_3d * 0.04))
    y      = opening_feature["y"]
    h      = opening_feature["h"]
    x      = opening_feature["x"]
    w      = opening_feature["w"]
    head_h = opening_feature.get("head_h", y + h)
    common = {
        "surface_hint":      opening_feature["surface_hint"],
        "thickness":         round(trim, 4),
        "depth":             round(trim, 4),
        "sill_h":            round(opening_feature.get("sill_h", y), 4),
        "head_h":            round(head_h, 4),
        "source_layer":      opening_feature["source_layer"],
        "confidence":        opening_feature["confidence"],
        "validation_flags":  opening_feature["validation_flags"] + ["derived_frame"],
        "deduced_from":      f"derived_from_{opening_feature['feature_type']}",
        "subtract":          True,
        "detail_visible":    True,
        "parent_id":         opening_feature["id"],
        "feature_type":      "frame",
    }
    return [
        {**common, "id": f"feature-{next(seed_id)}",
         "subtype": f"{opening_feature['feature_type']}-frame-left",
         "x": round(max(0.0, x - trim), 4), "y": round(y, 4),
         "w": round(trim, 4), "h": round(h, 4)},
        {**common, "id": f"feature-{next(seed_id)}",
         "subtype": f"{opening_feature['feature_type']}-frame-right",
         "x": round(x + w, 4), "y": round(y, 4),
         "w": round(trim, 4), "h": round(h, 4)},
        {**common, "id": f"feature-{next(seed_id)}",
         "subtype": f"{opening_feature['feature_type']}-frame-top",
         "x": round(max(0.0, x - trim), 4), "y": round(y + h, 4),
         "w": round(w + trim * 2, 4), "h": round(trim, 4),
         "sill_h": round(head_h, 4), "head_h": round(head_h + trim, 4)},
    ]


def flatten_layer_polys(layer_data: Layers) -> list[dict]:
    return [
        {"layer": lyr, "poly": poly}
        for lyr, polys in layer_data.items()
        for poly in polys
    ]


def detect_structural_features(layer_data: Layers,
                                room_poly: Poly,
                                room_height_3d: float = 240.0) -> dict:
    """
    Katmanlardaki tüm entity'leri tarayarak kapı, pencere, niş, pervaz tespiti yapar.
    room_height_3d: oda yüksekliği (DXF birimi cinsinden, ölçek uygulanmadan).
    """
    room_bounds = bbox([room_poly])
    room_area   = max(poly_true_area(room_poly) or poly_box_area(room_poly), 1e-6)
    room_w, room_h = poly_box_dims(room_poly)
    surfaces    = build_surface_hints(room_poly)
    feature_id  = count(1)
    features:   list[dict] = []
    low_confidence: list[str] = []

    for item in flatten_layer_polys(layer_data):
        poly       = item["poly"]
        layer_name = item["layer"]
        if poly is room_poly or len(poly) < 2:
            continue
        pb = bbox([poly])
        center = [(pb["xmin"] + pb["xmax"]) / 2, (pb["ymin"] + pb["ymax"]) / 2]
        near_room = (
            room_bounds["xmin"] - room_w * 0.2 <= center[0] <= room_bounds["xmax"] + room_w * 0.2
            and room_bounds["ymin"] - room_h * 0.2 <= center[1] <= room_bounds["ymax"] + room_h * 0.2
        )
        if not near_room:
            continue
        surface_id, surface_dist = feature_to_surface_hint(pb, surfaces)
        surface = next((s for s in surfaces if s["id"] == surface_id), None)
        if not surface:
            continue

        feature_type, validation_flags, score = _classify_feature_candidate(
            layer_name=layer_name, poly=poly, poly_bounds=pb,
            room_area=room_area, room_w=room_w, room_h=room_h,
            surface_dist=surface_dist,
        )
        if not feature_type:
            continue

        rect     = feature_rect_on_surface(pb, surface)
        vertical = _feature_vertical_defaults(feature_type, room_height_3d, pb["height"], pb["width"])
        feature  = {
            "id":               f"feature-{next(feature_id)}",
            "feature_type":     feature_type,
            "surface_hint":     surface_id,
            "x":                round(rect["x"], 4),
            "y":                round(vertical["y"], 4),
            "w":                round(rect["w"], 4),
            "h":                round(vertical["h"], 4),
            "depth":            round(min(pb["width"], pb["height"]), 4),
            "sill_h":           round(vertical["sill_h"], 4),
            "head_h":           round(vertical["head_h"], 4),
            "thickness":        round(min(pb["width"], pb["height"]), 4),
            "source_layer":     layer_name,
            "confidence":       _feature_confidence_label(score),
            "validation_flags": validation_flags,
            "deduced_from":     "plan_direct",
            "subtract":         feature_type in {"door", "window", "frame"},
            "detail_visible":   True,
        }
        if feature_type == "niche":
            feature["subtract"] = False
        if any(_feature_conflicts(feature, existing) for existing in features):
            continue
        if feature["confidence"] == "low":
            low_confidence.append(feature["id"])
        features.append(feature)

    # Pervaz türet
    derived_frames: list[dict] = []
    for feat in features:
        if feat["feature_type"] in {"door", "window"}:
            derived_frames.extend(_derive_frame_features(feat, room_height_3d, feature_id))

    final_features: list[dict] = []
    for feat in [*features, *derived_frames]:
        if any(_feature_conflicts(feat, existing) for existing in final_features):
            continue
        final_features.append(feat)

    return {
        "features":      final_features,
        "doors":         [f for f in final_features if f["feature_type"] == "door"],
        "windows":       [f for f in final_features if f["feature_type"] == "window"],
        "niches":        [f for f in final_features if f["feature_type"] == "niche"],
        "frames":        [f for f in final_features if f["feature_type"] == "frame"],
        "detail_polys":  [f for f in final_features if f["feature_type"] == "detail_poly"],
        "surface_segments": [
            {"id": s["id"],
             "a":  [round(s["a"][0], 4), round(s["a"][1], 4)],
             "b":  [round(s["b"][0], 4), round(s["b"][1], 4)],
             "length": round(s["length"], 4)}
            for s in surfaces
        ],
        "detection_summary": {
            "doors":         sum(1 for f in final_features if f["feature_type"] == "door"),
            "windows":       sum(1 for f in final_features if f["feature_type"] == "window"),
            "niches":        sum(1 for f in final_features if f["feature_type"] == "niche"),
            "frames":        sum(1 for f in final_features if f["feature_type"] == "frame"),
            "detail_polys":  sum(1 for f in final_features if f["feature_type"] == "detail_poly"),
            "surface_segments": len(surfaces),
        },
        "validation_summary": {
            "high":               sum(1 for f in final_features if f["confidence"] == "high"),
            "medium":             sum(1 for f in final_features if f["confidence"] == "medium"),
            "low":                sum(1 for f in final_features if f["confidence"] == "low"),
            "low_confidence_ids": low_confidence,
        },
    }


def apply_annotation_dimensions(feature_data: dict, annotations: dict, scale: float) -> None:
    """Anotasyonda verilen kapı/pencere/niş ölçülerini tespit edilen feature'lara uygular."""
    if scale <= 0:
        return

    def metric_to_units(value_m: Optional[float]) -> Optional[float]:
        return value_m / scale if value_m else None

    door = annotations.get("door")
    if door and feature_data.get("doors"):
        target = feature_data["doors"][0]
        target["w"] = round(metric_to_units(door["width_m"]) or target["w"], 4)
        target["h"] = round(metric_to_units(door["height_m"]) or target["h"], 4)
        target["head_h"] = target["h"]
        target["confidence"] = "high"
        target["validation_flags"] = [*target.get("validation_flags", []), "annotation_size"]

    window = annotations.get("window")
    if window and feature_data.get("windows"):
        target = feature_data["windows"][0]
        target["w"] = round(metric_to_units(window["width_m"]) or target["w"], 4)
        target["h"] = round(metric_to_units(window["height_m"]) or target["h"], 4)
        if window.get("sill_m"):
            target["y"] = round(metric_to_units(window["sill_m"]) or target["y"], 4)
            target["sill_h"] = target["y"]
            target["head_h"] = round(target["y"] + target["h"], 4)
        target["confidence"] = "high"
        target["validation_flags"] = [*target.get("validation_flags", []), "annotation_size"]

    niche = annotations.get("niche")
    if niche:
        target = feature_data["niches"][0] if feature_data.get("niches") else None
        if target is None:
            surface_hint = feature_data.get("surface_segments", [{}])[0].get("id", "wall-0")
            target = {
                "id": "feature-annotation-niche",
                "feature_type": "niche",
                "surface_hint": surface_hint,
                "x": 0.0,
                "y": 0.0,
                "w": round(metric_to_units(0.5) or 0.5, 4),
                "h": 0.0,
                "depth": round(metric_to_units(0.12) or 0.12, 4),
                "sill_h": 0.0,
                "head_h": 0.0,
                "thickness": round(metric_to_units(0.12) or 0.12, 4),
                "source_layer": "annotation",
                "confidence": "medium",
                "validation_flags": ["annotation_niche"],
                "deduced_from": "annotation",
                "subtract": False,
                "detail_visible": True,
            }
            feature_data.setdefault("niches", []).append(target)
            feature_data.setdefault("features", []).append(target)
        target["h"] = round(metric_to_units(niche["height_m"]) or target["h"], 4)
        target["y"] = round(metric_to_units(niche["sill_m"]) or target["y"], 4)
        target["sill_h"] = target["y"]
        target["head_h"] = round(target["y"] + target["h"], 4)
        target["confidence"] = "high"
        target["validation_flags"] = [*target.get("validation_flags", []), "annotation_size"]


def build_beam_features(annotations: dict, ox: float, oy: float, scale: float) -> list[dict]:
    """Kiriş anotasyonlarını duvar/açıklık dışında ayrı üst-kot feature olarak üretir."""
    beams = []
    for index, beam in enumerate(annotations.get("beams") or []):
        if beam.get("height_m") is None:
            continue
        beams.append({
            "id": f"feature-annotation-beam-{index + 1}",
            "feature_type": "beam",
            "subtype": "overhead-beam",
            "x": round((beam["x"] - ox) * scale, 4),
            "z": round((beam["y"] - oy) * scale, 4),
            "height_m": round(beam["height_m"], 4),
            "source_layer": "annotation",
            "confidence": "high",
            "validation_flags": ["annotation_beam"],
            "deduced_from": "annotation",
            "subtract": False,
            "detail_visible": True,
        })
    return beams

# ── Ana işleme ────────────────────────────────────────────────────────────────

def process(dxf_path: str) -> Optional[dict]:
    """
    DXF dosyasını işler ve simülasyon için normalleştirilmiş geometri sözlüğü döner.
    Hata durumunda None döner.
    """
    print(f"\n{'='*60}")
    print(f"  Dosya: {dxf_path}")
    print(f"{'='*60}\n")

    try:
        doc, msp = load_dxf(dxf_path)
    except Exception as exc:
        print(f"HATA: DXF okunamadı — {exc}")
        return None

    # $INSUNITS oku
    insunits = read_insunits(doc)
    print(f"[$INSUNITS] değeri: {insunits!r}")
    annotations = extract_text_annotations(msp)
    if annotations.get("area_m2"):
        print(f"[Anotasyon] Alan: {annotations['area_m2']:.3f} m²")
    if annotations.get("ceiling_height_m"):
        print(f"[Anotasyon] Tavan yüksekliği: {annotations['ceiling_height_m']:.2f} m")

    # Entity/katman raporu
    types, layer_summary = analyse_entities(msp)
    _print_entity_report(types, layer_summary)

    # Tüm desteklenen entity tiplerini çıkar (LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE, INSERT)
    layer_data = extract_all_geometry(msp, doc)

    # LINE segmentlerini birleştir (otomatik zincirleme)
    layer_data = merge_collinear_lines(layer_data)

    _print_bbox_report(layer_data)

    # Katman eşleştir
    walls_raw = find_layer(layer_data, "Duvar", "duvar", "wall", "WALL", "Walls")
    zemin_raw = find_layer(layer_data, "Zemin", "zemin", "floor", "FLOOR", "grid", "Grid")
    kapi_raw  = find_layer(layer_data, "Kap", "kap", "Door", "door", "DOOR")

    print("[Eşleştirilen Katmanlar]")
    print(f"  Duvar  : {len(walls_raw)} polyline")
    print(f"  Zemin  : {len(zemin_raw)} polyline")
    print(f"  Kapı   : {len(kapi_raw)} polyline\n")

    # Duvar kalınlığı tespiti
    wall_thickness_units = detect_wall_thickness(walls_raw) if len(walls_raw) >= 2 else 0.0

    # Sınıflandır
    if walls_raw:
        traced = trace_wall_polygon(walls_raw)
        if traced is not None:
            print(f"[Duvar İzleme] Graph tabanlı izleme başarılı: {len(traced)} köşe")
            room_outline = [traced]
            # Küçük kapalı şekiller → dekor/seramik adayları
            _, tiles = classify_wall_polys(walls_raw)
        else:
            print("[Duvar İzleme] Graph izleme başarısız; alan bazlı sınıflandırmaya geçiliyor.")
            room_outline, tiles = classify_wall_polys(walls_raw)
    else:
        print("[Uyarı] Duvar katmanı bulunamadı; geometri tabanlı fallback kullanılıyor.")
        room_outline, tiles, zemin_raw, kapi_raw = fallback_classify(layer_data)

    if not room_outline:
        print("HATA: Oda konturu bulunamadı.")
        return None

    # Poligonları normalize et (CCW, temiz, kapalı)
    room_outline = [normalize_room_polygon(poly)[0] for poly in room_outline]

    # Dış kontur & ölçek
    outer   = max(room_outline, key=lambda p: poly_true_area(p) or poly_box_area(p))
    outer_b = bbox([outer])
    ox, oy  = outer_b["xmin"], outer_b["ymin"]
    wall_w, wall_h = outer_b["width"], outer_b["height"]

    scale, scale_source = detect_scale(wall_w, wall_h, insunits, msp)
    room_area_units2 = poly_true_area(outer) or poly_box_area(outer)
    scale, scale_source = calibrate_scale_from_annotations(
        scale,
        scale_source,
        room_area_units2,
        annotations,
    )

    # 3D duvar yüksekliği — DXF'te HEADER'dan okunabilir, yoksa standart 240 cm
    try:
        extmax_z = float(doc.header.get("$EXTMAX", (0, 0, 0))[2])
        extmin_z = float(doc.header.get("$EXTMIN", (0, 0, 0))[2])
        z_range  = extmax_z - extmin_z
        # Makul aralık: 100 cm – 600 cm ölçeklenmiş
        z_range_m = z_range * scale
        if annotations.get("ceiling_height_m"):
            wall_height_units = annotations["ceiling_height_m"] / scale
            wall_height_source = "annotation_h"
        elif 0.8 <= z_range_m <= 6.0:
            wall_height_units = z_range
            wall_height_source = "dxf_extents_z"
        else:
            wall_height_units = 240.0 / (scale * 100)   # 240 cm varsayılan
            wall_height_source = "default_240cm"
    except Exception:
        if annotations.get("ceiling_height_m"):
            wall_height_units = annotations["ceiling_height_m"] / scale
            wall_height_source = "annotation_h"
        else:
            wall_height_units  = 240.0 / (scale * 100)
            wall_height_source = "default_240cm"

    print(f"[Oda Boyutu]  {wall_w:.2f} × {wall_h:.2f} birim  →  "
          f"{wall_w * scale:.3f} m × {wall_h * scale:.3f} m  "
          f"(1 birim = {scale * 100:.4f} cm)  kaynak: {scale_source}")
    print(f"[Duvar Yüksekliği]  {wall_height_units:.2f} birim = "
          f"{wall_height_units * scale:.3f} m  ({wall_height_source})")
    if wall_thickness_units > 0:
        print(f"[Duvar Kalınlığı]  {wall_thickness_units:.2f} birim = "
              f"{wall_thickness_units * scale * 100:.1f} cm\n")

    # Structural feature tespiti
    feature_data = detect_structural_features(layer_data, outer,
                                              room_height_3d=wall_height_units)
    wall_segments = extract_wall_segments(layer_data, outer)
    doors_detected   = feature_data["doors"]
    windows_detected = feature_data["windows"]
    niches_detected  = feature_data["niches"]
    frames_detected  = feature_data["frames"]
    detail_polys_det = feature_data["detail_polys"]
    apply_annotation_dimensions(feature_data, annotations, scale)
    doors_detected   = feature_data["doors"]
    windows_detected = feature_data["windows"]
    niches_detected  = feature_data["niches"]
    frames_detected  = feature_data["frames"]
    detail_polys_det = feature_data["detail_polys"]
    feature_data["detection_summary"] = {
        "doors":         len(doors_detected),
        "windows":       len(windows_detected),
        "niches":        len(niches_detected),
        "frames":        len(frames_detected),
        "detail_polys":  len(detail_polys_det),
        "surface_segments": len(feature_data.get("surface_segments", [])),
    }
    feature_data["validation_summary"] = {
        "high":               sum(1 for f in feature_data["features"] if f.get("confidence") == "high"),
        "medium":             sum(1 for f in feature_data["features"] if f.get("confidence") == "medium"),
        "low":                sum(1 for f in feature_data["features"] if f.get("confidence") == "low"),
        "low_confidence_ids": [f["id"] for f in feature_data["features"] if f.get("confidence") == "low"],
    }
    beam_features = build_beam_features(annotations, ox, oy, scale)
    feature_data["features"].extend(beam_features)
    feature_data["detection_summary"]["beams"] = len(beam_features)

    print(
        f"[Sınıflandırma]  Oda konturu: {len(room_outline)}  |  Dekor: {len(tiles)}"
        f"  |  Kapı: {len(doors_detected)}  |  Pencere: {len(windows_detected)}"
        f"  |  Niş: {len(niches_detected)}  |  Pervaz/Kasa: {len(frames_detected)}\n"
    )

    # Net kaplama alanı: oda dış konturundan kapı/pencere/niş çıkar (shapely.difference)
    _all_openings = list(doors_detected) + list(windows_detected) + list(niches_detected)
    _net_area_units2 = compute_net_area(outer, _all_openings)
    _net_area_m2 = round(_net_area_units2 * scale * scale, 4)
    print(f"[Net Alan]  Brüt {room_area_units2 * scale * scale:.4f} m² → "
          f"Net {_net_area_m2:.4f} m²  (kapı/pencere/niş çıkarıldı)\n")

    return {
        "meta": {
            "source":                    str(Path(dxf_path).name),
            "scale_unit":                "DXF",
            "scale_source":              scale_source,
            "annotation_area_m2":         annotations.get("area_m2"),
            "annotation_ceiling_height_m":annotations.get("ceiling_height_m"),
            "annotation_beam_height_m":   annotations.get("beam_height_m"),
            "insunits":                  insunits,
            "scale_factor_to_meters":    scale,
            "wall_width_units":          round(wall_w, 4),
            "wall_height_units":         round(wall_h, 4),
            "wall_width_m":              round(wall_w  * scale, 4),
            "wall_height_m":             round(wall_h  * scale, 4),
            "wall_thickness_units":      round(wall_thickness_units, 4),
            "wall_thickness_m":          round(wall_thickness_units * scale, 4),
            "ceiling_height_units":      round(wall_height_units, 4),
            "ceiling_height_m":          round(wall_height_units * scale, 4),
            "wall_height_source":        wall_height_source,
            "origin":                    [round(ox, 4), round(oy, 4)],
            "geometry_mode":             "polygon",
            "wall_tracer_version":       "graph-v1",
            "room_polygon_closed":       is_closed(outer),
            "room_true_area_units2":     round(room_area_units2, 4),
            "room_true_area_m2":         round((annotations.get("area_m2") or (room_area_units2 * scale * scale)), 4),
            "net_area_units2":           round(_net_area_units2, 4),
            "net_area_m2":               _net_area_m2,
            "detection_summary":         feature_data["detection_summary"],
            "validation_summary":        feature_data["validation_summary"],
        },
        "room_outline":    normalize_layer(room_outline, ox, oy),
        "tiles":           normalize_layer(tiles, ox, oy),
        "floor_lines":     normalize_layer(zemin_raw, ox, oy),
        "door_polys":      normalize_layer(kapi_raw, ox, oy),
        "doors":           doors_detected,
        "windows":         windows_detected,
        "niches":          niches_detected,
        "frames":          frames_detected,
        "beams":           beam_features,
        "detail_polys":    detail_polys_det,
        "surface_segments":feature_data["surface_segments"],
        "wall_segments":    [
            {
                **segment,
                "a": normalize_poly([segment["a"]], ox, oy)[0],
                "b": normalize_poly([segment["b"]], ox, oy)[0],
            }
            for segment in wall_segments
        ],
        "features":        feature_data["features"],
        "walls_raw":       normalize_layer(walls_raw, ox, oy),
    }

# ── Çıktı kaydet ──────────────────────────────────────────────────────────────

def save_outputs(data: dict, base_name: str = "banyo") -> None:
    """
    Simülasyon verilerini üç dosyaya kaydeder:
      <base>_geometry.json  — Tam geometri (web arayüzü için)
      <base>_building.json  — Sadeleştirilmiş katman verisi (CAD paneli için)
      <base>_rapor.txt      — İnsan okunabilir özet
    """
    geom_path = f"{base_name}_geometry.json"
    with open(geom_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✓ {geom_path}  ({len(json.dumps(data)):,} byte)")

    meta = data.get("meta", {})
    building = {
        "walls":            data["room_outline"],
        "tiles":            data["tiles"],
        "floor":            data["floor_lines"],
        "doors":            data.get("door_polys", []),
        "features":         data.get("features", []),
        "windows":          data.get("windows", []),
        "frames":           data.get("frames", []),
        "beams":            data.get("beams", []),
        "surface_segments": data.get("surface_segments", []),
        "wall_segments":    data.get("wall_segments", []),
        "meta": {
            **meta,
            "detection_summary":  meta.get("detection_summary", {}),
            "validation_summary": meta.get("validation_summary", {}),
        },
    }
    build_path = f"{base_name}_building.json"
    with open(build_path, "w", encoding="utf-8") as f:
        json.dump(building, f, separators=(",", ":"), ensure_ascii=False)
    print(f"✓ {build_path}")

    scale = meta.get("scale_factor_to_meters", 1.0)
    report = (
        f"\nSeramikcim — DXF Analiz Raporu\n"
        f"{'='*50}\n"
        f"Kaynak         : {meta.get('source','?')}\n"
        f"$INSUNITS      : {meta.get('insunits','?')}\n"
        f"Ölçek kaynağı  : {meta.get('scale_source','?')}\n"
        f"Ölçek          : 1 birim = {scale * 100:.4f} cm\n\n"
        f"ODA BOYUTLARI\n"
        f"  Genişlik     : {meta.get('wall_width_units',0):.4f} birim"
        f"  ({meta.get('wall_width_m',0):.4f} m)\n"
        f"  Derinlik     : {meta.get('wall_height_units',0):.4f} birim"
        f"  ({meta.get('wall_height_m',0):.4f} m)\n"
        f"  Tavan yük.   : {meta.get('ceiling_height_units',0):.4f} birim"
        f"  ({meta.get('ceiling_height_m',0):.4f} m)"
        f"  [{meta.get('wall_height_source','?')}]\n"
        f"  Duvar kalın. : {meta.get('wall_thickness_units',0):.4f} birim"
        f"  ({meta.get('wall_thickness_m',0)*100:.2f} cm)\n"
        f"  Alan (Shoelace): {meta.get('room_true_area_m2',0):.4f} m²\n"
        f"  Orijin       : {meta.get('origin','?')}\n\n"
        f"GEOMETRİ\n"
        f"  Oda konturu  : {len(data.get('room_outline',[]))} polyline\n"
        f"  Duvar (ham)  : {len(data.get('walls_raw',[]))} polyline\n"
        f"  Dekor seramik: {len(data.get('tiles',[]))} poligon\n"
        f"  Zemin çizgisi: {len(data.get('floor_lines',[]))} çizgi\n"
        f"  Kapı         : {len(data.get('doors',[]))} açıklık\n"
        f"  Pencere      : {len(data.get('windows',[]))} açıklık\n"
        f"  Niş          : {len(data.get('niches',[]))} adet\n"
        f"  Pervaz/Kasa  : {len(data.get('frames',[]))} adet\n"
        f"  Doğrulama    : "
        f"yüksek={meta.get('validation_summary',{}).get('high',0)}"
        f" / orta={meta.get('validation_summary',{}).get('medium',0)}"
        f" / düşük={meta.get('validation_summary',{}).get('low',0)}\n"
    )
    rpt_path = f"{base_name}_rapor.txt"
    with open(rpt_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"✓ {rpt_path}\n{report}")

# ── Raporlama ─────────────────────────────────────────────────────────────────

def _print_entity_report(types: dict, layer_summary: dict) -> None:
    print("[Entity Tipleri]")
    for t, n in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {t:<20} {n:>6}")
    print()


def _print_bbox_report(layer_data: Layers) -> None:
    print("[Katman Bounding Box'ları]")
    for layer, polys in layer_data.items():
        if polys:
            b = bbox(polys)
            print(f"  '{layer}'  {len(polys)} poly  "
                  f"X={b['xmin']:.1f}..{b['xmax']:.1f}  "
                  f"Y={b['ymin']:.1f}..{b['ymax']:.1f}  "
                  f"({b['width']:.1f} × {b['height']:.1f})")
    print()

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    dxf_file = sys.argv[1] if len(sys.argv) > 1 else "Banyo.dxf"
    if not Path(dxf_file).exists():
        sys.exit(f"Dosya bulunamadı: {dxf_file}")

    result = process(dxf_file)
    if result:
        save_outputs(result, base_name=Path(dxf_file).stem.lower())
        print("Tamamlandı.")
