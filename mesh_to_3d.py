"""
mesh_to_3d.py — OBJ mesh dosyasından simülasyon geometrisi üretici
====================================================================

`dxf_to_3d.process()` ile birebir aynı çıktı kontratını (current_geometry.json)
üretir. Akış:

1. trimesh ile yükle, watertight/manifold doğrula, repair gerekiyorsa uygula
2. Auto-scale tespiti (bbox boyutuna göre mm/cm/m)
3. Co-planar face gruplama (tolerans: 1° açı, 1 cm offset)
4. Zemin / tavan / duvar sınıflandırması (normal vektör yönüne göre)
5. Zemin yüzeyinden oda outline (Shapely Polygon, concave destekli)
6. Duvar segmentleri (a→b kenar listesi)
7. Opening detection — duvar mesh'inde delik analizi:
   - Yerden < 30cm + yükseklik > 1.6m → kapı
   - Yerden 50–150 cm → pencere
   - Yerden 80–140 cm, küçük → niş
8. Net alan = compute_net_area (Shapely difference, dxf_to_3d'den reuse)

Kullanım:
    python -m pip install trimesh shapely numpy
    python mesh_to_3d.py oda.obj
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import numpy as np
except ImportError:
    sys.exit("numpy kurulu değil. Lütfen: pip install numpy")

try:
    import trimesh
except ImportError:
    sys.exit("trimesh kurulu değil. Lütfen: pip install trimesh")

try:
    from shapely.geometry import Polygon, MultiPolygon, Point
    from shapely.ops import unary_union
except ImportError:
    sys.exit("shapely kurulu değil. Lütfen: pip install shapely")

# dxf_to_3d'den net alan + ham polygon area
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dxf_to_3d import compute_net_area, _shoelace_signed_area_legacy


# ── Sabitler ──────────────────────────────────────────────────────────────────

TOL_ANGLE_DEG = 5.0           # co-planar face gruplama açı toleransı (gevşetildi)
TOL_PLANE_DIST = 0.05         # co-planar offset toleransı 5cm
WALL_NORMAL_Y_MAX = 0.15      # duvar = |normal.y| < 0.15
FLOOR_NORMAL_Y_MIN = 0.85     # zemin = normal.y > 0.85
CEILING_NORMAL_Y_MAX = -0.85  # tavan = normal.y < -0.85
MIN_VERTICES = 8
MIN_WALL_AREA_M2 = 0.50       # bir duvar yüzeyi olmak için min toplam alan
MIN_FLOOR_AREA_M2 = 0.80      # zemin/tavan adayı için min alan

# Doğrulanmış Z-up demo modelleri (tarayıcıda görsel onaylı). Bunlar env bayrağı
# olmadan da Y↔Z swap edilir; diğer modeller (cube,5,banyo,egri) Y-up'tır.
# MESH_SWAP_YZ env'i bu listeyi geçersiz kılar (her model için elle 1/0).
Z_UP_MODELS = {"1", "2", "3", "4"}


# ── Yükleme & validation ──────────────────────────────────────────────────────

def load_mesh(path: str) -> trimesh.Trimesh:
    """OBJ dosyasını yükle, mesh olarak forceler."""
    try:
        m = trimesh.load(path, force="mesh", process=True)
    except Exception as exc:
        raise SystemExit(f"Mesh yüklenemedi ({path}): {exc}")

    if not isinstance(m, trimesh.Trimesh):
        raise SystemExit(f"Mesh yüklenemedi — beklenen Trimesh, gelen: {type(m).__name__}")

    if m.is_empty or len(m.vertices) < MIN_VERTICES:
        raise SystemExit(f"Mesh boş veya çok az vertex ({len(m.vertices)}). En az {MIN_VERTICES} gerekir.")

    return m


def validate_and_repair(mesh: trimesh.Trimesh) -> dict:
    """Mesh kalitesini doğrula, mümkünse onar. Validation raporu döner."""
    report = {
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "is_watertight": bool(mesh.is_watertight),
        "is_winding_consistent": bool(mesh.is_winding_consistent),
        "is_volume": bool(mesh.is_volume),
        "warnings": [],
    }

    if not mesh.is_winding_consistent:
        try:
            mesh.fix_normals()
            report["warnings"].append("normal_direction_fixed")
            report["is_winding_consistent"] = bool(mesh.is_winding_consistent)
        except Exception:
            report["warnings"].append("normal_fix_failed")

    if not mesh.is_watertight:
        try:
            mesh.fill_holes()
            report["is_watertight"] = bool(mesh.is_watertight)
            if mesh.is_watertight:
                report["warnings"].append("holes_filled")
        except Exception:
            report["warnings"].append("hole_fill_failed")

    return report


# ── Mesh normalize (X-Z merkez, Y zeminde) ────────────────────────────────────

def normalize_mesh(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, np.ndarray]:
    """Mesh X-Z merkez + Y=0 zemine. Pipeline outline ile R3F MeshViewer
    aynı origin paylaşır → seramikler hizalanır.
    Dönüş: (mesh_in_place, offset_vector)
    """
    bbox_min = mesh.bounds[0]
    bbox_max = mesh.bounds[1]
    cx = (bbox_min[0] + bbox_max[0]) / 2.0
    cz = (bbox_min[2] + bbox_max[2]) / 2.0
    offset = np.array([-cx, -bbox_min[1], -cz], dtype=float)
    mesh.apply_translation(offset)
    return mesh, offset


# ── Section-based duvar tespiti ──────────────────────────────────────────────

def extract_outline_via_section(
    mesh: trimesh.Trimesh,
    section_height_m: float = 1.3,
    simplify_tolerance: float = 0.05,
) -> Optional[Polygon]:
    """Mesh'i Y=section_height_m yatay düzlemle kes; en büyük polygon = outline.

    section.discrete'den 3D vertex chain'lerini alır, X-Z koordinatlarını
    outline olarak kullanır. Bu sayede outline mesh world coord'unda kalır →
    R3F MeshViewer ile birebir hizalanır.
    """
    base_y = float(mesh.bounds[0][1])
    plane_origin = [0.0, base_y + section_height_m, 0.0]
    plane_normal = [0.0, 1.0, 0.0]

    try:
        section = mesh.section(plane_origin=plane_origin, plane_normal=plane_normal)
    except Exception:
        return None
    if section is None:
        return None

    chains = getattr(section, "discrete", None) or []
    if not chains:
        return None

    rings: list[Polygon] = []
    for chain in chains:
        if len(chain) < 3:
            continue
        coords_xz = [(float(p[0]), float(p[2])) for p in chain]
        if coords_xz[0] != coords_xz[-1]:
            coords_xz.append(coords_xz[0])
        if len(coords_xz) < 4:
            continue
        try:
            poly = Polygon(coords_xz)
            if poly.is_empty:
                continue
            if not poly.is_valid:
                poly = poly.buffer(0)
                if getattr(poly, "geoms", None):
                    poly = max(poly.geoms, key=lambda p: p.area)
            if poly.is_empty or poly.area <= 0:
                continue
            rings.append(poly)
        except Exception:
            continue

    if not rings:
        return None

    rings.sort(key=lambda p: -p.area)
    if len(rings) >= 2:
        outer_ring = rings[0]
        inner_candidate = rings[1]
        # İç kontur mu? Dış ring'in içinde olmalı ve alan oranı makul olmalı
        if outer_ring.contains(inner_candidate) and inner_candidate.area > outer_ring.area * 0.15:
            clean = inner_candidate
        else:
            clean = Polygon(list(outer_ring.exterior.coords))
    else:
        clean = Polygon(list(rings[0].exterior.coords))

    if clean.area < 0.5:
        return None

    return clean.simplify(simplify_tolerance, preserve_topology=True)


def extract_outline_with_fallback(
    mesh: trimesh.Trimesh,
) -> tuple[Optional[Polygon], Optional[float]]:
    """1.3 m → 1.0 m → 0.5 m sıralı fallback."""
    for h in (1.3, 1.0, 0.5):
        outline = extract_outline_via_section(mesh, section_height_m=h)
        if outline is not None and not outline.is_empty:
            return outline, h
    return None, None




# ── Face-based geometry pipeline (v3.0 — sıfırdan, matematik 3D vektör) ────────
# User: "OBJ dosyasının matematiksel 3D vektörünü al, dış hattı parçalı belirle"
# Her co-planar face grubu = bir surface (floor / ceiling / wall).
# Section/cluster/snap kullanılmaz. Mesh vertices + face normals direkt.


def separate_inner_outer_surfaces(
    groups: list[dict],
    mesh: trimesh.Trimesh,
    inner_threshold: float = -0.15,
    room_polygon: Optional[Polygon] = None,
) -> tuple[list[dict], list[dict]]:
    """Her grup için: group centroid - mesh centroid vektörü ile normal'ı karşılaştır.
    Aynı yön → dış face (mesh dışına bakıyor). Ters yön → iç face (mesh içine).
    Banyo'da iç face = banyo iç kaplaması (tile placement için gerekli).
    """
    if not groups:
        return [], []
    mesh_center = mesh.center_mass if mesh.is_watertight else mesh.centroid
    mesh_center = np.asarray(mesh_center, dtype=float)

    inner: list[dict] = []
    outer: list[dict] = []
    for g in groups:
        face_indices = g.get("face_indices", [])
        if not face_indices:
            continue
        # Grup centroid: face center'larının ortalaması
        face_centers = np.asarray(mesh.triangles_center[face_indices])
        group_center = face_centers.mean(axis=0)
        
        if room_polygon is not None and not room_polygon.is_empty:
            point = Point(group_center[0], group_center[2])
            distance = room_polygon.exterior.distance(point)
            wall_thickness_tol = 0.25
            is_inner = distance < wall_thickness_tol or room_polygon.contains(point)
            if is_inner:
                inner.append({**g, "inner_outer_dot": 0.0})
            else:
                outer.append({**g, "inner_outer_dot": 0.0})
            continue

        outward = group_center - mesh_center
        outward_norm = np.linalg.norm(outward)
        if outward_norm < 1e-6:
            outer.append(g)
            continue
        outward /= outward_norm
        normal = np.array(g["normal"], dtype=float)
        dot = float(np.dot(normal, outward))
        if dot < inner_threshold:
            inner.append({**g, "inner_outer_dot": round(dot, 3)})
        else:
            outer.append({**g, "inner_outer_dot": round(dot, 3)})
    return inner, outer


def classify_interior_by_raycast(
    region: dict,
    mesh: trimesh.Trimesh,
    sample_k: int = 5,
    eps: float = 1e-3,
    near_hit: float = 0.08,
) -> dict:
    """Bir yüzeyin İÇ duvar (odaya bakan) mı yoksa DIŞ kabuk mu olduğunu
    ray-cast occlusion testi ile belirler.

    Mantık: yüzeyin centroid'inden (+ region içinden k örnek) ±normal yönünde
    ışın at. İç duvar imzası:
      - +normal (yüzeyin baktığı yön) açık odaya bakar → çarpma uzak/yok
      - −normal (arka) yakın mesafede (<near_hit) arka kabuğa çarpar
    Çoğunluk oylaması ile karar. Watertight olmayan mesh / ince duvar için
    mutlak mesafe + occlusion kombinasyonu.

    Dönüş: {is_interior, confidence, front_dist, back_dist, reason}
    """
    face_idx = region.get("face_indices", [])
    if not face_idx:
        return {"is_interior": False, "confidence": 0.0, "reason": "no_faces"}
    normal = np.array(region["normal"], dtype=float)
    nl = float(np.linalg.norm(normal)) or 1.0
    normal = normal / nl
    centers = np.asarray(mesh.triangles_center[face_idx])

    # Örnek noktalar: centroid + en büyük alanlı birkaç face merkezi
    pts = [centers.mean(axis=0)]
    if len(face_idx) > 1:
        areas = np.asarray(mesh.area_faces[face_idx])
        order = np.argsort(-areas)[: max(0, sample_k - 1)]
        pts.extend(centers[order])
    pts = np.array(pts)

    try:
        ray = mesh.ray
    except Exception:
        return {"is_interior": False, "confidence": 0.0, "reason": "no_ray_engine"}

    def first_hit_dist(origin, direction):
        # Kendi yüzeyine çarpmamak için origin'i biraz ileri kaydır
        o = (origin + direction * eps).reshape(1, 3)
        d = direction.reshape(1, 3)
        try:
            locs, ray_idx, tri_idx = ray.intersects_location(o, d, multiple_hits=False)
        except Exception:
            return math.inf
        if len(locs) == 0:
            return math.inf
        return float(np.linalg.norm(locs[0] - o[0]))

    interior_votes = 0
    fronts, backs = [], []
    for p in pts:
        front = first_hit_dist(p, normal)    # baktığı yön
        back = first_hit_dist(p, -normal)    # arka
        fronts.append(front)
        backs.append(back)
        # İç imzası: ön açık (uzak/yok) VE arka yakın çarpar (kabuk),
        # ya da ön belirgin şekilde arkadan uzaksa (oda hacmi önde)
        if (back < near_hit) or (front > back * 1.5) or (math.isinf(front) and not math.isinf(back)):
            interior_votes += 1

    conf = interior_votes / len(pts)
    front_med = float(np.median([f for f in fronts if not math.isinf(f)] or [math.inf]))
    back_med = float(np.median([b for b in backs if not math.isinf(b)] or [math.inf]))
    return {
        "is_interior": conf >= 0.5,
        "confidence": round(conf, 3),
        "front_dist": None if math.isinf(front_med) else round(front_med, 3),
        "back_dist": None if math.isinf(back_med) else round(back_med, 3),
        "reason": f"votes={interior_votes}/{len(pts)} front={front_med:.2f} back={back_med:.2f}",
    }


def separate_inner_outer_by_raycast(
    groups: list[dict],
    mesh: trimesh.Trimesh,
    room_polygon: Optional[Polygon] = None,
) -> tuple[list[dict], list[dict]]:
    """separate_inner_outer_surfaces'in ray-cast tabanlı muadili.
    Her grup için classify_interior_by_raycast; düşük güvende (conf<0.5
    belirsiz) room_polygon/centroid fallback'e düşer. İmza/dönüş aynı.
    """
    if not groups:
        return [], []
    inner: list[dict] = []
    outer: list[dict] = []
    # Fallback için polygon/dot tabanlı sonuç
    fb_inner, fb_outer = separate_inner_outer_surfaces(groups, mesh, room_polygon=room_polygon)
    fb_inner_ids = {id(g) for g in groups if any(
        g.get("face_indices") == x.get("face_indices") for x in fb_inner)}

    for g in groups:
        rc = classify_interior_by_raycast(g, mesh)
        enriched = {**g, "raycast": rc}
        if rc.get("confidence", 0) < 0.4:
            # Belirsiz → fallback kararı
            is_in = id(g) in fb_inner_ids
            enriched["interior_source"] = "polygon_fallback"
        else:
            is_in = rc["is_interior"]
            enriched["interior_source"] = "raycast"
        (inner if is_in else outer).append(enriched)
    return inner, outer


def _fibonacci_directions(n: int) -> np.ndarray:
    """Küre üzerinde ~eşit dağılımlı n yön (birim vektör). Tam küre →
    duvar + zemin + tavan hepsine ışın gider."""
    n = max(8, int(n))
    i = np.arange(n, dtype=float) + 0.5
    phi = np.arccos(1.0 - 2.0 * i / n)          # kutup açısı [0, π]
    golden = math.pi * (3.0 - math.sqrt(5.0))   # altın açı
    theta = golden * i
    x = np.sin(phi) * np.cos(theta)
    y = np.cos(phi)
    z = np.sin(phi) * np.sin(theta)
    return np.column_stack([x, y, z])


def interior_sample_points(
    mesh: trimesh.Trimesh,
    floor_polygon: Optional[Polygon],
    max_xz: int = 9,
) -> np.ndarray:
    """Oda HACMİNİN İÇİNDE garantili 3D örnek noktalar üret.

    XZ: floor_polygon içinden temsilci nokta + polygon'a clip'lenmiş kaba grid
    (L/U şekilli odaların tüm kollarını kapsar). Y: zemin↔tavan arası birkaç
    yükseklik. Bu noktalardan atılan ışınların ilk çarptığı face'ler = iç yüzeyler.
    """
    y_min = float(mesh.bounds[0][1])
    y_max = float(mesh.bounds[1][1])
    h = max(y_max - y_min, 0.1)
    heights = [y_min + h * f for f in (0.2, 0.5, 0.8)]

    xz_points: list[tuple[float, float]] = []
    if floor_polygon is not None and not floor_polygon.is_empty:
        try:
            rp = floor_polygon.representative_point()
            xz_points.append((rp.x, rp.y))
        except Exception:
            pass
        minx, miny, maxx, maxy = floor_polygon.bounds
        # 4×4 kaba grid → polygon içinde kalanları al
        gx = np.linspace(minx, maxx, 5)[1:-1]
        gz = np.linspace(miny, maxy, 5)[1:-1]
        for x in gx:
            for z in gz:
                if floor_polygon.contains(Point(x, z)):
                    xz_points.append((float(x), float(z)))
                if len(xz_points) >= max_xz:
                    break
            if len(xz_points) >= max_xz:
                break
    if not xz_points:
        # Fallback: mesh centroid'in XZ'si
        c = mesh.centroid
        xz_points.append((float(c[0]), float(c[2])))

    pts = []
    for (x, z) in xz_points:
        for y in heights:
            pts.append([x, y, z])
    return np.asarray(pts, dtype=float)


def compute_interior_visible_faces(
    mesh: trimesh.Trimesh,
    sample_points: np.ndarray,
    n_dirs: int = 192,
) -> set:
    """Oda içindeki örnek noktalardan tam küre yönlerinde ışın at; her ışının
    İLK çarptığı face = iç yüzey. Dönen set tüm iç-görünür face index'leri.

    İç/dış ayrımının sağlam yolu: bir banyo iç kaplaması = içeride duran birinin
    GÖRDÜĞÜ yüzeyler. Dış kabuk, arka face'ler ve tavan üstü içeriden görünmez →
    otomatik elenir. Birim ölçeğinden ve watertight olup olmamasından bağımsızdır.
    """
    try:
        ray = mesh.ray
    except Exception:
        return set()
    dirs = _fibonacci_directions(n_dirs)
    visible: set = set()
    for p in sample_points:
        origins = np.repeat(p.reshape(1, 3), len(dirs), axis=0)
        try:
            _, _, tri_idx = ray.intersects_location(
                origins, dirs, multiple_hits=False
            )
        except Exception:
            continue
        if len(tri_idx):
            visible.update(int(t) for t in tri_idx)
    return visible


def filter_groups_by_visibility(
    groups: list[dict],
    visible_faces: set,
    min_frac: float = 0.25,
    min_count: int = 2,
) -> tuple[list[dict], list[dict]]:
    """Bir planar grubu, face'lerinin yeterli oranı iç-görünür ise İÇ kabul et.

    İç kabuk yüzeyleri yüksek görünürlük oranına sahiptir; dış kabuk/arka
    face'ler ~0 → temiz iç/dış ayrımı + duvar kopyalarının (iç+dış skin)
    elenmesi. separate_inner_outer_surfaces'in yerine geçer (imza uyumlu).
    """
    inner: list[dict] = []
    outer: list[dict] = []
    for g in groups:
        fi = g.get("face_indices", [])
        if not fi:
            continue
        vis = sum(1 for f in fi if f in visible_faces)
        frac = vis / len(fi)
        enriched = {**g, "vis_frac": round(frac, 3), "vis_count": vis,
                    "interior_source": "visibility"}
        if vis >= min_count and frac >= min_frac:
            inner.append(enriched)
        else:
            outer.append(enriched)
    return inner, outer


def extract_wall_quad_from_group(
    group: dict,
    mesh: trimesh.Trimesh,
    scale: float = 1.0,
) -> Optional[dict]:
    """Wall face grubunu local 2D'ye projeksiyonla, 2D bbox al, 3D quad olarak döndür.

    Local basis:
      tangent = normal × Ŷ (yatay yön)
      bitangent = Ŷ (dikey yön)
    Projeksiyon: u = tangent·v, v = vertical (y).

    Returns: {id, quad[4 corner], normal, width, height, area, centroid_3d,
              face_count, confidence}
    """
    face_indices = group.get("face_indices", [])
    if not face_indices:
        return None
    nx, ny, nz = group["normal"]
    normal_3d = np.array([nx, ny, nz], dtype=float)
    mag = math.hypot(nx, nz)
    if mag < 0.01:
        return None  # neredeyse yatay normal — duvar değil

    # Local basis
    tangent = np.array([-nz / mag, 0.0, nx / mag], dtype=float)
    bitangent = np.array([0.0, 1.0, 0.0], dtype=float)

    # Unique vertices
    vertex_indices = np.unique(mesh.faces[face_indices].flatten())
    verts = np.asarray(mesh.vertices[vertex_indices])

    # Project to local (u, v)
    us = verts @ tangent
    vs = verts[:, 1]  # bitangent is +Y, so v = y

    u_min = float(us.min())
    u_max = float(us.max())
    v_min = float(vs.min())
    v_max = float(vs.max())
    width = u_max - u_min
    height = v_max - v_min
    # Min boyut kontrolü METRİK olmalı: ham birim eşiği inch/cm modellerde
    # neredeyse hiçbir şeyi elemiyordu (örn. 0.30 ham birim = 7.6mm @ inch).
    # Gerçek bir tileable duvar en az ~0.40m yüksek, ~0.10m geniş olmalı;
    # daha kısa yüzeyler basamak rıhtı / süpürgelik / zemin kenarı gürültüsüdür.
    width_m = width * scale
    height_m = height * scale
    if width_m < 0.10 or height_m < 0.40:
        return None  # çok küçük yüzey, duvar değil (metrik eşik)

    # 3D quad corners (plane origin = face center mean)
    face_centers = np.asarray(mesh.triangles_center[face_indices])
    plane_origin = face_centers.mean(axis=0)
    # u/v koord → 3D = origin + u*tangent + v*bitangent
    # Ama origin de aynı plane'de — origin'in u,v projeksiyonunu çıkarmak gerek
    o_u = float(plane_origin @ tangent)
    o_v = float(plane_origin[1])
    # Quad: (u_min,v_min), (u_max,v_min), (u_max,v_max), (u_min,v_max)
    def to_world(u, v):
        offset_u = u - o_u
        offset_v = v - o_v
        pt = plane_origin + offset_u * tangent + offset_v * bitangent
        return [float(pt[0]), float(pt[1]), float(pt[2])]

    quad = [
        to_world(u_min, v_min),
        to_world(u_max, v_min),
        to_world(u_max, v_max),
        to_world(u_min, v_max),
    ]
    area = float(group.get("area", width * height))
    face_count = len(face_indices)

    # ── Gerçek 2D polygon outline ──────────────────────────────────────────
    # Duvarın gerçek şeklini (eğimli üst, L-şekli, basamak, girinti) yakalamak için
    # bu DÜZLEME ait TÜM mesh face'lerini topla (sadece co-planar grup değil).
    # Co-planar gruplama bazı face'leri kaçırabilir; aynı normal+offset'teki
    # tüm üçgenleri dahil ederek gerçek dış hattı çıkarırız.
    # Local (u,v) düzlemine projekte → Shapely union → exterior outline.
    polygon_2d = None
    try:
        # Bu düzleme ait tüm face'leri bul (normal yönü + plane offset eşleşmesi)
        nrm = normal_3d / (np.linalg.norm(normal_3d) + 1e-12)
        all_dots = mesh.face_normals @ nrm
        all_off = np.asarray(mesh.triangles_center) @ nrm
        plane_off = float(plane_origin @ nrm)
        cos_tol = math.cos(math.radians(8.0))
        plane_mask = (all_dots > cos_tol) & (np.abs(all_off - plane_off) < 0.06)
        coplanar_faces = np.where(plane_mask)[0]
        # En az grup face'leri kadar olmalı; değilse gruba düş
        use_faces = coplanar_faces if len(coplanar_faces) >= len(face_indices) else face_indices

        tri_polys = []
        for fi in use_faces:
            face = mesh.faces[fi]
            pts2d = []
            for vi in face:
                vert = mesh.vertices[vi]
                pu = float(vert @ tangent) - u_min
                pv = float(vert[1]) - v_min
                pts2d.append((pu, pv))
            if len(pts2d) == 3:
                tp = Polygon(pts2d)
                if tp.is_valid and tp.area > 1e-6:
                    tri_polys.append(tp)
        if tri_polys:
            merged = unary_union(tri_polys)
            # En büyük parçayı al (MultiPolygon ise)
            if isinstance(merged, MultiPolygon):
                merged = max(merged.geoms, key=lambda g: g.area)
            if merged and not merged.is_empty and merged.area > 1e-6:
                # Köşe sadeleştirme (0.5cm tolerans) — gerçek basamakları koru
                simplified = merged.simplify(0.005, preserve_topology=True)
                ext = list(simplified.exterior.coords)
                # Tam dikdörtgene çok yakınsa polygon ekleme (quad yeterli)
                bbox_area = width * height
                fill_ratio = simplified.area / bbox_area if bbox_area > 0 else 1.0
                is_rectangular = len(ext) <= 5 and fill_ratio > 0.985
                if not is_rectangular and len(ext) >= 4:
                    polygon_2d = [[round(float(x), 4), round(float(y), 4)] for x, y in ext]
                # Gerçek alan: polygon alanı (bbox değil) — daha doğru hesap
                if not is_rectangular:
                    area = float(simplified.area)
    except Exception:
        polygon_2d = None  # hata durumunda quad fallback

    # Confidence: face_count'a göre
    if face_count >= 50:
        confidence = 1.0
    elif face_count >= 20:
        confidence = 0.7
    elif face_count >= 10:
        confidence = 0.5
    else:
        confidence = 0.3

    result = {
        "quad": [[round(c, 4) for c in pt] for pt in quad],
        "normal": [round(float(nx), 4), round(float(ny), 4), round(float(nz), 4)],
        "width": round(width, 4),
        "height": round(height, 4),
        "area": round(area, 4),
        "centroid_3d": [round(float(plane_origin[i]), 4) for i in range(3)],
        "face_count": face_count,
        "confidence": round(confidence, 3),
        "plane_offset": round(float(group.get("offset", 0.0)), 4),
    }
    if polygon_2d:
        # polygon_2d: duvar-yerel (u,v) koordinatlarda gerçek şekil outline
        # u: 0..width (sol→sağ), v: 0..height (alt→üst)
        result["polygon_2d"] = polygon_2d
    return result


def merge_coplanar_redundant_walls(
    walls: list[dict],
    tol_angle_deg: float = 2.0,
    tol_dist: float = 0.05,
) -> list[dict]:
    """Aynı plane'deki face grupları residuel ofset gürültüsü ile ayrı düşmüş olabilir.
    Sıkı tolerance (2°, 5cm) ile aynı plane wall'larını birleştir.
    Banyo'da 14 wall → 7-10 wall'a düşer (gerçek duvarlar).
    """
    if not walls:
        return []
    cos_tol = math.cos(math.radians(tol_angle_deg))
    merged: list[dict] = []
    consumed = [False] * len(walls)

    for i, w1 in enumerate(walls):
        if consumed[i]:
            continue
        # Eğri yüzeyler coplanar-merge'e dahil edilmez (zaten birleşik)
        if w1.get("kind") == "curved":
            merged.append(w1)
            consumed[i] = True
            continue
        n1 = np.array(w1["normal"], dtype=float)
        o1 = float(w1.get("plane_offset", 0.0))
        cluster_idx = [i]
        for j in range(i + 1, len(walls)):
            if consumed[j]:
                continue
            w2 = walls[j]
            n2 = np.array(w2["normal"], dtype=float)
            o2 = float(w2.get("plane_offset", 0.0))
            # Normal benzerliği
            if float(np.dot(n1, n2)) < cos_tol:
                continue
            # Plane offset farkı (aynı plane mi?)
            if abs(o1 - o2) > tol_dist:
                continue
            cluster_idx.append(j)

        if len(cluster_idx) == 1:
            merged.append(w1)
            consumed[i] = True
        else:
            # Birleşim: face_indices union, area sum, quad combined bbox
            total_area = sum(walls[k]["area"] for k in cluster_idx)
            total_faces = sum(walls[k]["face_count"] for k in cluster_idx)
            # En büyük üye'nin quad'ını kullan (tüm cluster'ın quad'ını birleştirmek
            # karmaşık 2D union işi; en büyük temsilci yeter)
            biggest = max(cluster_idx, key=lambda k: walls[k]["area"])
            base = walls[biggest]
            confidence = 1.0 if total_faces >= 50 else (0.7 if total_faces >= 20 else 0.5)
            merged.append({
                **base,
                "area": round(total_area, 4),
                "face_count": total_faces,
                "confidence": round(confidence, 3),
                "merged_from": len(cluster_idx),
            })
            for k in cluster_idx:
                consumed[k] = True

    return merged


def dedup_opposite_face_walls(
    walls: list[dict],
    scale: float = 1.0,
    centroid_tol_m: float = 0.20,
) -> list[dict]:
    """İnce/sıfır-kalınlık bir duvarın iki yüzü (zıt normal + ~aynı merkez)
    iç-görünürlükte ikisi de kalabilir → çift sayım. Bu çakışık çiftleri
    tekille (büyük alanlıyı tut). Kalınlığı olan ayrı yüzeyler (merkez uzak)
    ya da farklı düzlemler dokunulmaz → gerçek partisyonlar korunur.

    centroid_3d ham normalize birimde olduğundan tolerans scale ile ham'a çevrilir.
    """
    if len(walls) < 2:
        return walls
    tol_raw = centroid_tol_m / scale if scale > 0 else centroid_tol_m
    dropped: set = set()
    for i in range(len(walls)):
        if i in dropped or walls[i].get("kind") == "curved":
            continue
        ni = np.array(walls[i]["normal"], dtype=float)
        ci = np.array(walls[i].get("centroid_3d", [0, 0, 0]), dtype=float)
        for j in range(i + 1, len(walls)):
            if j in dropped or walls[j].get("kind") == "curved":
                continue
            nj = np.array(walls[j]["normal"], dtype=float)
            cj = np.array(walls[j].get("centroid_3d", [0, 0, 0]), dtype=float)
            if float(ni @ nj) < -0.9 and float(np.linalg.norm(ci - cj)) < tol_raw:
                # Aynı yüzeyin iki tarafı → küçük alanlıyı at
                if walls[j].get("area", 0) <= walls[i].get("area", 0):
                    dropped.add(j)
                else:
                    dropped.add(i)
                    break
    return [w for k, w in enumerate(walls) if k not in dropped]


def _wall_bottom_edge(wall: dict) -> Optional[tuple]:
    """Duvarın alt kenar uç noktalarını (XZ) döndürür: (a, b) = (bot_left, bot_right)."""
    quad = wall.get("quad")
    if not quad or len(quad) != 4:
        return None
    a = (float(quad[0][0]), float(quad[0][2]))
    b = (float(quad[1][0]), float(quad[1][2]))
    return a, b


def merge_curved_wall_strips(
    walls: list[dict],
    join_tol: float = 0.12,
    min_angle_deg: float = 1.0,
    max_angle_deg: float = 40.0,
    max_seg_width: float = 0.80,
    min_chain: int = 3,
    min_total_span_deg: float = 12.0,
) -> list[dict]:
    """Eğri/silindirik duvarları tek yüzey olarak birleştirir.

    Coplanar-merge sonrası eğri duvar hâlâ N ince parçaya bölünmüş olur
    (her segmentin normali kademeli döner). Bu parçaları zincirleyip tek
    'curved' duvar yapar: arc_points_3d (alt kenar polyline) + arc uzunluğu
    width olarak. Tile hesabı duvarı "açılmış" (unrolled) düz yüzey gibi sayar.

    Düz duvar köşeleri (90° dönüş) birleştirilmez: komşu normal açısı
    max_angle_deg'i aşar. Yalnız kısa (max_seg_width) parçalar aday olur →
    büyük düz duvarlar zincire girmez.
    """
    if not walls:
        return []

    # Aday segmentler: kısa + alt kenarı olan duvarlar
    edges = {}
    for i, w in enumerate(walls):
        e = _wall_bottom_edge(w)
        edges[i] = e

    def angle_between(i, j):
        n1 = np.array(walls[i]["normal"], dtype=float)
        n2 = np.array(walls[j]["normal"], dtype=float)
        d = float(np.clip(np.dot(n1, n2), -1.0, 1.0))
        return math.degrees(math.acos(d))

    def endpoints_share(i, j):
        ei, ej = edges[i], edges[j]
        if not ei or not ej:
            return None
        # Hangi uçlar çakışıyor? (a/b kombinasyonları)
        for ai, pa in enumerate(ei):
            for bj, pb in enumerate(ej):
                if math.hypot(pa[0] - pb[0], pa[1] - pb[1]) <= join_tol:
                    return (ai, bj)
        return None

    # Komşuluk grafiği: kısa parçalar, uç paylaşan, açı ılımlı
    adj = {i: [] for i in range(len(walls))}
    for i in range(len(walls)):
        if walls[i]["width"] > max_seg_width:
            continue
        for j in range(i + 1, len(walls)):
            if walls[j]["width"] > max_seg_width:
                continue
            if endpoints_share(i, j) is None:
                continue
            ang = angle_between(i, j)
            if min_angle_deg <= ang <= max_angle_deg:
                adj[i].append(j)
                adj[j].append(i)

    # Bağlı bileşenler (zincirler)
    seen = set()
    out = []
    consumed_chain = set()
    for start in range(len(walls)):
        if start in seen or not adj[start]:
            continue
        # BFS ile bileşeni topla
        comp = []
        stack = [start]
        seen.add(start)
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        order = comp  # TÜM bileşeni birleştir (dallanmaya dayanıklı)
        if len(order) < min_chain:
            continue

        # Alt kenar noktalarını GEOMETRİK olarak sırala (nearest-neighbor chain).
        # Tek-yol yürüyüşü yerine: tüm segment uç noktalarını topla, en uçtaki
        # noktadan başlayıp en yakın komşuyu izleyerek polyline kur. Bu, tol'den
        # kaynaklı dallanmalara ve segment sırasızlığına dayanıklıdır.
        raw_pts = []
        for wi in order:
            quad = walls[wi]["quad"]
            raw_pts.append([float(quad[0][0]), float(quad[0][1]), float(quad[0][2])])
            raw_pts.append([float(quad[1][0]), float(quad[1][1]), float(quad[1][2])])
        # Yakın noktaları tekille (welding, ~join_tol/2)
        uniq = []
        for p in raw_pts:
            dup = False
            for q in uniq:
                if math.hypot(p[0]-q[0], p[2]-q[2]) <= join_tol * 0.5:
                    dup = True
                    break
            if not dup:
                uniq.append(p)
        if len(uniq) < 2:
            continue
        # Başlangıç: centroid'den en uzak nokta (arc'ın bir ucu)
        cx = sum(p[0] for p in uniq) / len(uniq)
        cz = sum(p[2] for p in uniq) / len(uniq)
        start_pt = max(uniq, key=lambda p: math.hypot(p[0]-cx, p[2]-cz))
        arc_pts = [start_pt]
        remaining = [p for p in uniq if p is not start_pt]
        while remaining:
            last = arc_pts[-1]
            nxt = min(remaining, key=lambda p: math.hypot(p[0]-last[0], p[2]-last[2]))
            arc_pts.append(nxt)
            remaining.remove(nxt)

        # Arc uzunluğu = polyline uzunluğu (gerçek yay)
        arc_len = sum(
            math.hypot(arc_pts[k+1][0]-arc_pts[k][0], arc_pts[k+1][2]-arc_pts[k][2])
            for k in range(len(arc_pts) - 1)
        )
        height = max(float(walls[wi]["height"]) for wi in order)
        total_area = arc_len * height
        total_faces = sum(int(walls[wi].get("face_count", 0)) for wi in order)
        normals = [np.array(walls[wi]["normal"], dtype=float) for wi in order]
        avg_n = np.mean(normals, axis=0)
        nl = float(np.linalg.norm(avg_n)) or 1.0
        avg_n = (avg_n / nl).tolist()

        # Toplam açı yayılımı: zincirdeki en uç iki normal arası açı.
        # Yayılım küçükse (≈düz) eğri sayılmaz → düz birleşik duvar.
        max_span = 0.0
        for a in range(len(normals)):
            for b in range(a + 1, len(normals)):
                d = float(np.clip(np.dot(normals[a], normals[b]), -1.0, 1.0))
                max_span = max(max_span, math.degrees(math.acos(d)))
        is_curved = max_span >= min_total_span_deg

        merged_wall = {
            "id": "curved-pending",
            "kind": "curved" if is_curved else "wall",
            "quad": walls[order[0]]["quad"],   # fallback quad (ilk segment)
            "normal": [round(c, 4) for c in avg_n],
            "width": round(arc_len, 4),
            "height": round(height, 4),
            "area": round(total_area, 4),
            "face_count": total_faces,
            "confidence": 0.6,
            "segment_count": len(order),
            # Açılmış (unrolled) dikdörtgen polygon — tile sayımı düz yüzey gibi
            "polygon_2d": [[0.0, 0.0], [round(arc_len, 4), 0.0],
                           [round(arc_len, 4), round(height, 4)], [0.0, round(height, 4)],
                           [0.0, 0.0]],
        }
        if is_curved:
            # arc_points_3d yalnız gerçek eğride — renderer tile'ları yay boyunca diz
            merged_wall["arc_points_3d"] = [[round(c, 4) for c in p] for p in arc_pts]
        # Karar: birleşen parçalardan miras al (hepsi iç duvar)
        src_decision = next((walls[wi].get("decision") for wi in order if walls[wi].get("decision")), None)
        merged_wall["decision"] = src_decision or {
            "category": "wall", "side": "interior", "tileable": True,
            "confidence": 0.6, "reason": "curved_merge", "source": "geometry",
        }
        out.append(merged_wall)
        consumed_chain.update(order)

    # Zincire girmeyen duvarları aynen koru
    for i, w in enumerate(walls):
        if i not in consumed_chain:
            out.append(w)
    return out


def extract_inner_floor_faces_by_y_cluster(
    mesh: trimesh.Trimesh,
    y_tolerance: float = 0.05,
    min_face_count: int = 200,
    bin_size: float = 0.05,
) -> Optional[dict]:
    """Banyo iç zemini mesh'in normal yönüne göre değişebilir:
    - Outside-modeled mesh: zemin face'leri yukarı bakar (normal.y > 0.85)
    - Inside-modeled (iç kaplama): zemin face'leri aşağı bakar (normal.y < -0.85)

    Bu fonksiyon: **horizontal face'lerin tümünü** al (|normal.y| > 0.85),
    en alt Y'deki cluster'ı bul (banyo iç zemini en yoğun + en aşağıda).

    Returns: face_indices + area + offset (Y level)
    """
    face_normals = np.asarray(mesh.face_normals)
    face_centers = np.asarray(mesh.triangles_center)
    face_areas = np.asarray(mesh.area_faces)

    # Yatay face'ler (her iki normal yönü dahil)
    horizontal_mask = np.abs(face_normals[:, 1]) > 0.85
    if not horizontal_mask.any():
        return None
    floor_face_indices = np.where(horizontal_mask)[0]
    ys = face_centers[floor_face_indices, 1]

    # bin_size cm histogram
    y_min = float(ys.min())
    y_max = float(ys.max())
    if y_max - y_min < bin_size:
        # Tek seviye
        face_indices = [int(i) for i in floor_face_indices]
        total_area = float(face_areas[floor_face_indices].sum())
        return {
            "normal": (0.0, 1.0, 0.0),
            "offset": float(ys.mean()),
            "face_indices": face_indices,
            "area": total_area,
        }

    n_bins = int((y_max - y_min) / bin_size) + 1
    hist, edges = np.histogram(ys, bins=n_bins, range=(y_min, y_max + bin_size))

    # ÖNEMLİ: Banyo iç zemini = en alt Y'de yoğun face cluster.
    # Üstteki yoğun cluster'lar mobilya/raf/lavabo üstü detayları.
    # En alt Y'den başla; ilk yoğun cluster (face_count >= min) = banyo zemini.
    peak_idx = -1
    peak_y = None
    for i in range(n_bins):
        if hist[i] >= min_face_count:
            peak_idx = i
            peak_y = float(edges[i] + bin_size / 2)
            break
    if peak_idx < 0:
        # Hiçbir yoğun cluster yoksa, max'i kullan (mobilya bile olsa)
        peak_idx = int(hist.argmax())
        peak_y = float(edges[peak_idx] + bin_size / 2)

    # peak_y ± tolerance içindeki face'leri al
    cluster_mask = np.abs(ys - peak_y) <= y_tolerance
    cluster_face_indices = [int(floor_face_indices[i]) for i in range(len(floor_face_indices)) if cluster_mask[i]]

    if len(cluster_face_indices) < min_face_count:
        return None

    # Cluster'daki face'lerin dominant normal yönünü bul (iç vs dış)
    cluster_normals_y = face_normals[cluster_face_indices, 1]
    up_count = int((cluster_normals_y > 0.85).sum())
    down_count = int((cluster_normals_y < -0.85).sum())
    # Iç zemin = dominant normal yönü (en çok face)
    if down_count >= up_count:
        # Mesh "iç kaplama" — iç zemin aşağı bakar
        inner_mask = face_normals[cluster_face_indices, 1] < -0.85
        normal_direction = (0.0, -1.0, 0.0)
    else:
        # Outside-modeled mesh — iç zemin yukarı bakar
        inner_mask = face_normals[cluster_face_indices, 1] > 0.85
        normal_direction = (0.0, 1.0, 0.0)

    cluster_indices_np = np.array(cluster_face_indices)
    inner_face_indices = [int(cluster_indices_np[i]) for i in range(len(cluster_indices_np)) if inner_mask[i]]

    if len(inner_face_indices) < min_face_count:
        # Filter çok agresif — fallback: tüm cluster
        inner_face_indices = cluster_face_indices

    inner_indices_np = np.array(inner_face_indices)
    total_area = float(face_areas[inner_indices_np].sum())

    return {
        "normal": normal_direction,
        "offset": round(peak_y, 4),
        "face_indices": inner_face_indices,
        "area": total_area,
        "y_level": round(peak_y, 4),
        "y_tolerance": y_tolerance,
        "total_floor_like_faces": int(len(floor_face_indices)),
        "cluster_total_faces": int(len(cluster_face_indices)),
        "inner_normal_dir": "down" if down_count >= up_count else "up",
    }


def classify_horizontal_all(groups: list[dict]) -> tuple[list[dict], list[dict]]:
    """Tüm floor + ceiling adayları (sadece en büyük değil).
    Birden çok floor/ceiling katmanı varsa hepsini döner.
    """
    floors = [
        g for g in groups
        if g["normal"][1] > FLOOR_NORMAL_Y_MIN and g["area"] >= MIN_FLOOR_AREA_M2
    ]
    ceilings = [
        g for g in groups
        if g["normal"][1] < CEILING_NORMAL_Y_MAX and g["area"] >= MIN_FLOOR_AREA_M2
    ]
    floors.sort(key=lambda g: -g["area"])
    ceilings.sort(key=lambda g: -g["area"])
    return floors, ceilings


def extract_floor_polygon_from_walls(
    wall_quads: list[dict],
    min_area_m2: float = 0.5,
    min_face_count: int = 0,
) -> Optional[Polygon]:
    """Wall_planes'in alt kenarlarından (quad[0] + quad[1]) iç oda zemin
    polygon'u türet. Banyo gibi 'iç kaplama' mesh'lerde zemin face'leri belirsiz
    olabilir; duvarlar arası kapalı alan = iç oda zemini.

    Algoritma:
      1. Her duvarın alt iki corner'ını al (quad[0]=bot_left, quad[1]=bot_right)
      2. XZ koordinatları olarak unique noktalar
      3. Centroid etrafında angular sort → kapalı polygon
      4. Validation: area ≥ min_area_m2, is_simple
      5. Self-intersect → convex hull failsafe
    """
    if not wall_quads:
        return None

    # Filter: high-confidence walls (gerçek iç duvar, mesh detail face_count yüksek)
    filtered = [w for w in wall_quads if w.get("face_count", 0) >= min_face_count]
    if len(filtered) < 3:
        filtered = wall_quads  # filter çok agresif — tümünü kullan

    # Alt corner'ları topla
    pts = []
    for w in filtered:
        quad = w.get("quad", [])
        if len(quad) != 4:
            continue
        pts.append((float(quad[0][0]), float(quad[0][2])))  # bot_left XZ
        pts.append((float(quad[1][0]), float(quad[1][2])))  # bot_right XZ

    if len(pts) < 3:
        return None

    # Unique nokta — 1cm tolerance ile yakın olanları birleştir
    uniques: list[tuple[float, float]] = []
    for p in pts:
        is_dup = False
        for u in uniques:
            if math.hypot(p[0] - u[0], p[1] - u[1]) < 0.02:
                is_dup = True
                break
        if not is_dup:
            uniques.append(p)
    if len(uniques) < 3:
        return None

    # Centroid + angular sort
    cx = sum(p[0] for p in uniques) / len(uniques)
    cz = sum(p[1] for p in uniques) / len(uniques)
    uniques.sort(key=lambda p: math.atan2(p[1] - cz, p[0] - cx))

    coords = list(uniques) + [uniques[0]]
    try:
        poly = Polygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if isinstance(poly, MultiPolygon):
            poly = max(poly.geoms, key=lambda p: p.area)

        if not poly.is_empty and poly.area >= min_area_m2 and poly.is_simple:
            return poly

        # Failsafe: convex hull
        from shapely.geometry import MultiPoint
        hull = MultiPoint(uniques).convex_hull
        if isinstance(hull, Polygon) and hull.area >= min_area_m2:
            return hull
        return None
    except Exception:
        return None


def refine_floor_group_by_y_level(
    floor_group: dict,
    mesh: trimesh.Trimesh,
    y_tolerance: float = 0.05,
) -> dict:
    """Floor face grubunda hem iç oda zemini hem mesh dış kabuk zemini face'leri
    olabilir. Face center Y'lerine göre histogram → en yoğun Y level = iç zemin.
    Bu cluster'daki face'leri yeni floor grubu olarak döndür.

    Banyo örneği: floor_group 10.76m² (iç + dış toplam) → iç zemin ~5.3m² olmalı.
    """
    if not floor_group or not floor_group.get("face_indices"):
        return floor_group

    face_indices = floor_group["face_indices"]
    face_centers = np.asarray(mesh.triangles_center[face_indices])
    ys = face_centers[:, 1]

    # Histogram: 1cm bin
    bin_size = 0.01
    y_min = float(ys.min())
    y_max = float(ys.max())
    if y_max - y_min < bin_size:
        return floor_group  # zaten tek seviye

    bins = int((y_max - y_min) / bin_size) + 1
    hist, edges = np.histogram(ys, bins=bins, range=(y_min, y_max + bin_size))

    # En yoğun bin'i bul → iç zemin Y center
    peak_idx = int(hist.argmax())
    peak_y = float(edges[peak_idx] + bin_size / 2)

    # peak_y ± tolerance içindeki face'leri al
    mask = np.abs(ys - peak_y) <= y_tolerance
    selected_face_indices = [int(face_indices[i]) for i in range(len(face_indices)) if mask[i]]

    if len(selected_face_indices) < 10:
        return floor_group  # cluster çok küçük, original'i kullan

    face_areas = np.asarray(mesh.area_faces)
    total_area = float(sum(face_areas[selected_face_indices]))

    return {
        **floor_group,
        "face_indices": selected_face_indices,
        "area": total_area,
        "refined_peak_y": round(peak_y, 4),
        "refined_face_count": len(selected_face_indices),
    }


def extract_floor_polygon_from_face_group(
    floor_group: Optional[dict],
    mesh: trimesh.Trimesh,
) -> Optional[Polygon]:
    """Floor face grubunun XZ projeksiyonunu Shapely polygon olarak çıkar.
    İlk önce Y level refine, sonra `extract_floor_outline` (existing helper).
    L-shape ok.
    """
    if floor_group is None:
        return None
    refined = refine_floor_group_by_y_level(floor_group, mesh)
    poly = extract_floor_outline(mesh, refined)
    if poly.is_empty:
        return None
    return poly


def build_face_based_geometry_dict(
    mesh: trimesh.Trimesh,
    source_path: str,
    floor_polygon: Optional[Polygon],
    wall_quads: list[dict],
    ceiling_quads: list[dict],
    scale: float,
    scale_source: str,
    validation_report: dict,
    openings: list[dict],
) -> dict:
    """Face-based geometry dict. meta.geometry_mode='mesh-face'.
    Hem yeni surfaces yapısı hem backward compat field'lar yazılır."""
    bbox = mesh.bounds
    extents = mesh.extents
    # Boyutlar ham birim → metreye çevir (scale)
    height_m = float(extents[1]) * scale
    width_m = float(extents[0]) * scale
    depth_m = float(extents[2]) * scale
    # Alan ham birim² → m² (scale²). floor_polygon koordinatları HAM kalır
    # (JS builders.js scale uygular); sadece raporlanan alan m²'ye çevrilir.
    raw_floor_area = float(floor_polygon.area) if floor_polygon and not floor_polygon.is_empty else 0.0
    area_m2 = round(raw_floor_area * scale * scale, 4)
    outline_units = polygon_to_outline(floor_polygon) if floor_polygon else []

    # Wall list (face-based)
    walls_list = []
    for idx, wq in enumerate(wall_quads):
        walls_list.append({
            "id": f"wall-{idx}",
            **wq,
        })

    # Ceiling list
    ceilings_list = []
    for idx, cq in enumerate(ceiling_quads):
        ceilings_list.append({
            "id": f"ceiling-{idx}",
            **cq,
        })

    # Floor list
    floors_list = []
    if floor_polygon is not None and not floor_polygon.is_empty:
        floor_coords = [
            [round(float(x), 4), round(float(z), 4)]
            for x, z in list(floor_polygon.exterior.coords)
        ]
        floors_list.append({
            "id": "floor-0",
            "polygon": floor_coords,
            "area": round(raw_floor_area * scale * scale, 4),  # m²
            "normal": [0.0, 1.0, 0.0],
        })

    total_wall_area = float(sum(w["area"] for w in walls_list))
    total_ceiling_area = float(sum(c["area"] for c in ceilings_list))
    total_floor_area = float(sum(f["area"] for f in floors_list))

    doors = [o for o in openings if o.get("type") == "door"]
    windows = [o for o in openings if o.get("type") == "window"]
    niches = [o for o in openings if o.get("type") == "niche"]
    frames = [o for o in openings if o.get("type") == "frame"]

    # Floor Y (en aşağıdaki face center y'si veya mesh.bounds)
    floor_y = float(mesh.bounds[0][1])
    # Wall Y bounds: en yaygın wall'ın quad y_min/y_max
    if walls_list:
        wall_ymins = [w["quad"][0][1] for w in walls_list]
        wall_ymaxs = [w["quad"][2][1] for w in walls_list]
        floor_y = float(min(wall_ymins))
        ceiling_y = float(max(wall_ymaxs))
    else:
        ceiling_y = float(mesh.bounds[1][1])

    meta = {
        "source": Path(source_path).name,
        "scale_unit": "OBJ",
        "scale_source": scale_source,
        "annotation_area_m2": None,
        "annotation_ceiling_height_m": None,
        "annotation_beam_height_m": None,
        "insunits": None,
        "scale_factor_to_meters": float(scale),
        "wall_width_units": round(width_m / scale, 4) if scale else width_m,
        "wall_height_units": round(height_m / scale, 4) if scale else height_m,
        "wall_width_m": round(width_m, 4),
        # ceiling_y, floor_y HAM birim → yüksekliği metreye çevir (× scale)
        "wall_height_m": round((ceiling_y - floor_y) * scale, 4),
        "wall_thickness_units": 0.10 / scale if scale else 0.10,
        "wall_thickness_m": 0.10,
        "ceiling_height_units": round(ceiling_y - floor_y, 4),
        "ceiling_height_m": round((ceiling_y - floor_y) * scale, 4),
        "wall_height_source": "mesh_face_planes",
        "origin": [round(float(bbox[0][0]), 4), round(float(bbox[0][2]), 4)],
        "geometry_mode": "mesh-face",
        "wall_tracer_version": "mesh-face-v1",
        "room_polygon_closed": bool(floor_polygon and not floor_polygon.is_empty),
        "room_true_area_units2": round(area_m2 / (scale * scale), 4) if scale else area_m2,
        "room_true_area_m2": area_m2,
        "net_area_units2": round(area_m2 / (scale * scale), 4) if scale else area_m2,
        "net_area_m2": area_m2,
        "floor_y_m": round(floor_y * scale, 4),
        "ceiling_y_m": round(ceiling_y * scale, 4),
        # Face-based surface structure
        "surfaces": {
            "floors": floors_list,
            "walls": walls_list,
            "ceilings": ceilings_list,
            "total_floor_area": round(total_floor_area, 4),
            "total_wall_area": round(total_wall_area, 4),
            "total_ceiling_area": round(total_ceiling_area, 4),
            "total_surface_area": round(total_floor_area + total_wall_area + total_ceiling_area, 4),
        },
        # Backward compat (calculation.js, R3F overlays okuyor)
        "wall_planes": walls_list,
        "floor_polygon_3d": [
            [round(float(x), 4), round(floor_y, 4), round(float(z), 4)]
            for x, z in list(floor_polygon.exterior.coords)
        ] if floor_polygon and not floor_polygon.is_empty else [],
        "detection_summary": {
            "doors": len(doors),
            "windows": len(windows),
            "niches": len(niches),
            "frames": len(frames),
            "detail_polys": 0,
            "surface_segments": 0,
            "beams": 0,
        },
        "validation_summary": {
            "high": 0, "medium": 0, "low": 0,
            "low_confidence_ids": [],
        },
        "mesh_validation": validation_report,
    }

    return {
        "meta": meta,
        "room_outline": [outline_units] if outline_units else [],
        "tiles": [],
        "floor_lines": [],
        "door_polys": [],
        "doors": doors,
        "windows": windows,
        "niches": niches,
        "frames": frames,
        "beams": [],
        "detail_polys": [],
        "surface_segments": [],
        "wall_segments": [],  # face-based mode'da segment yerine wall_planes kullanılır
        "features": openings,
        "walls_raw": [],
    }




# ── Scale tespiti ─────────────────────────────────────────────────────────────

def detect_scale(mesh: trimesh.Trimesh) -> tuple[float, str]:
    """
    Birim tahmini — YÜKSEKLİK tabanlı (en güvenilir).

    Oda yüksekliği fiziksel olarak ~2.2-3.5m aralığındadır. Mesh'in dikey
    (Y) ekseni boyutunu farklı birim varsayımlarıyla metreye çevirip,
    tipik oda yüksekliğine (2.7m hedef) en yakın olanı seçeriz.

    Bu sayede mm / cm / inch / m cinsinden modellenmiş OBJ'ler doğru
    ölçeklenir. (Örn. mimari OBJ'ler sıkça inch cinsindedir: 96 inch ≈ 2.44m.)

    Yükseklik makul aralığa hiç oturmuyorsa bbox çapına göre fallback.
    """
    extents = np.array(mesh.extents)
    # Mesh normalize sonrası Y-up; dikey eksen = Y (index 1)
    height = float(extents[1])
    max_extent = float(extents.max())

    candidates = [
        (1.0, "m"),
        (0.0254, "inch"),
        (0.01, "cm"),
        (0.001, "mm"),
    ]
    TARGET_H = 2.7
    H_MIN, H_MAX = 1.5, 4.6  # makul oda yüksekliği aralığı (metre)
    best = None
    best_score = 1e9
    for sc, name in candidates:
        h_m = height * sc
        if H_MIN <= h_m <= H_MAX:
            score = abs(h_m - TARGET_H)
            if score < best_score:
                best_score = score
                best = (sc, f"mesh_height_{name}")
    if best:
        return best

    # Fallback: bbox çapına göre kaba tahmin
    if max_extent > 1000:
        return 0.001, "mesh_bbox_mm"
    if max_extent > 100:
        return 0.0254, "mesh_bbox_inch"
    if max_extent > 10:
        return 0.01, "mesh_bbox_cm"
    if max_extent > 1:
        return 1.0, "mesh_bbox_m"
    return 1.0, "mesh_bbox_unknown_m"


# ── Face gruplama ─────────────────────────────────────────────────────────────

def group_coplanar_faces(
    mesh: trimesh.Trimesh,
    tol_angle_deg: float = TOL_ANGLE_DEG,
    tol_dist: float = TOL_PLANE_DIST,
) -> list[dict]:
    """
    Mesh face'lerini normal yönüne ve plane offset'e göre grupla.
    Her grup: { normal: (nx,ny,nz), offset: d, face_indices: [], area: total_m2 }

    O(N) hash-based gruplama: normal vektörü ve offset'i tolerans bucket'larına
    quantize ederek dict key olarak kullanır. Büyük mesh'lerde O(N²)'den >100x hızlı.
    """
    face_normals = np.asarray(mesh.face_normals)
    face_centers = np.asarray(mesh.triangles_center)
    face_areas = np.asarray(mesh.area_faces)
    face_offsets = np.einsum("ij,ij->i", face_normals, face_centers)

    # Quantization adımları
    # Açı toleransı X° → normal komponenti X°'ye karşılık gelen sin değeri (~ tol_angle_deg * π / 180)
    angle_step = max(math.sin(math.radians(tol_angle_deg)) * 2, 0.005)
    offset_step = max(tol_dist, 1e-4)

    buckets: dict[tuple, dict] = {}
    n_faces = len(face_normals)

    for i in range(n_faces):
        nx, ny, nz = face_normals[i]
        d = face_offsets[i]
        # Bucket key — normal'i symbol bin'lere, offset'i grid'e quantize et
        key = (
            int(round(nx / angle_step)),
            int(round(ny / angle_step)),
            int(round(nz / angle_step)),
            int(round(d / offset_step)),
        )
        g = buckets.get(key)
        if g is None:
            buckets[key] = {
                "normal": (float(nx), float(ny), float(nz)),
                "offset": float(d),
                "face_indices": [int(i)],
                "area": float(face_areas[i]),
            }
        else:
            g["face_indices"].append(int(i))
            g["area"] += float(face_areas[i])

    return list(buckets.values())


def segment_planar_regions(
    mesh: trimesh.Trimesh,
    tol_angle_deg: float = 5.0,
    tol_offset: float = 0.05,
) -> list[dict]:
    """Face-adjacency üzerinde BFS region-growing ile planar segmentasyon.

    group_coplanar_faces'in hash-bucket yaklaşımının yerine geçer. Bucket
    quantization sınırında tek düzlemin ikiye bölünmesi sorununu çözer:
    komşu face'ler ADJACENCY üzerinden, seed normaline göre büyür → tek bağlı
    düzlem = tek region.

    Düz yüzeyler tek region olur. Eğri yüzeyler ise (normal kademeli döner,
    offset toleransını aşar) her segment ayrı region kalır — bu KASITLI:
    eğri region tek quad'a indirgenemez (normaller döner), bu yüzden eğri
    fragment'ları downstream'de quad→merge_curved_wall_strips ile birleşir.

    Dönüş group_coplanar_faces ile aynı şekil: {normal, offset, face_indices, area}
    """
    face_normals = np.asarray(mesh.face_normals)
    face_centers = np.asarray(mesh.triangles_center)
    face_areas = np.asarray(mesh.area_faces)
    n_faces = len(face_normals)
    if n_faces == 0:
        return []

    # Komşuluk listesi (face_adjacency: Nx2 komşu face çiftleri)
    adj = [[] for _ in range(n_faces)]
    try:
        for a, b in np.asarray(mesh.face_adjacency):
            adj[int(a)].append(int(b))
            adj[int(b)].append(int(a))
    except Exception:
        # Adjacency üretilemezse bucket'a düş
        return group_coplanar_faces(mesh)

    cos_tol = math.cos(math.radians(tol_angle_deg))
    visited = [False] * n_faces
    regions: list[dict] = []

    for seed in range(n_faces):
        if visited[seed]:
            continue
        seed_n = face_normals[seed]
        seed_off = float(np.dot(seed_n, face_centers[seed]))
        # BFS — seed normaline göre büyü (drift birikmesin)
        comp = [seed]
        visited[seed] = True
        stack = [seed]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if visited[v]:
                    continue
                if float(np.dot(face_normals[v], seed_n)) < cos_tol:
                    continue
                off_v = float(np.dot(seed_n, face_centers[v]))  # seed düzlemine offset
                if abs(off_v - seed_off) > tol_offset:
                    continue
                visited[v] = True
                comp.append(v)
                stack.append(v)
        # Region normal/offset: alan-ağırlıklı ortalama
        idx = np.array(comp)
        w = face_areas[idx]
        wsum = float(w.sum()) or 1.0
        mean_n = (face_normals[idx] * w[:, None]).sum(axis=0) / wsum
        nl = float(np.linalg.norm(mean_n)) or 1.0
        mean_n = mean_n / nl
        mean_off = float((np.einsum("ij,j->i", face_centers[idx], mean_n) * w).sum() / wsum)
        regions.append({
            "normal": (float(mean_n[0]), float(mean_n[1]), float(mean_n[2])),
            "offset": mean_off,
            "face_indices": [int(i) for i in comp],
            "area": float(w.sum()),
        })

    return regions


# ── Sınıflandırma ─────────────────────────────────────────────────────────────

def classify_horizontal(groups: list[dict]) -> tuple[Optional[dict], Optional[dict]]:
    """
    Zemin/tavan tespiti — minimum alan threshold uygulanır.
    Birden fazla aday varsa en büyük alanlı seçilir.
    """
    floor_candidates = [
        g for g in groups
        if g["normal"][1] > FLOOR_NORMAL_Y_MIN and g["area"] >= MIN_FLOOR_AREA_M2
    ]
    ceil_candidates = [
        g for g in groups
        if g["normal"][1] < CEILING_NORMAL_Y_MAX and g["area"] >= MIN_FLOOR_AREA_M2
    ]

    floor = max(floor_candidates, key=lambda g: g["area"]) if floor_candidates else None
    ceiling = max(ceil_candidates, key=lambda g: g["area"]) if ceil_candidates else None
    return floor, ceiling


def classify_vertical(groups: list[dict]) -> list[dict]:
    """
    Duvar grupları: |normal.y| < 0.15 + minimum area threshold.
    Küçük yüzeyler (mobilya/dekor) filtre dışı.
    """
    walls = []
    for g in groups:
        nx, ny, nz = g["normal"]
        if abs(ny) >= WALL_NORMAL_Y_MAX:
            continue
        if g["area"] < MIN_WALL_AREA_M2:
            continue  # küçük yüzey = mobilya/dekor, duvar değil
        mag = math.hypot(nx, nz)
        if mag < 0.01:
            continue
        normal_2d = (nx / mag, nz / mag)
        walls.append({
            **g,
            "normal_2d": normal_2d,
            "angle_deg": math.degrees(math.atan2(nz, nx)),
        })
    return walls


# ── Oda outline ───────────────────────────────────────────────────────────────

def extract_floor_outline(mesh: trimesh.Trimesh, floor_group: dict) -> Polygon:
    """
    Zemin face'lerinin dış boundary'sini Shapely Polygon olarak çıkar.
    L-şekilli (concave) odalar desteklenir.
    """
    if not floor_group or not floor_group["face_indices"]:
        return Polygon()

    face_indices = floor_group["face_indices"]
    faces = mesh.faces[face_indices]
    vertices = mesh.vertices

    # Her face'i XZ düzleminde polygon'a çevir (Y düşürülür), unary_union ile birleştir
    polys = []
    for tri_face in faces:
        v0, v1, v2 = vertices[tri_face[0]], vertices[tri_face[1]], vertices[tri_face[2]]
        coords = [(float(v0[0]), float(v0[2])), (float(v1[0]), float(v1[2])), (float(v2[0]), float(v2[2]))]
        try:
            p = Polygon(coords)
            if p.is_valid and p.area > 1e-6:
                polys.append(p)
        except Exception:
            continue

    if not polys:
        return Polygon()

    merged = unary_union(polys)
    if isinstance(merged, MultiPolygon):
        # En büyük poligonu al
        merged = max(merged.geoms, key=lambda p: p.area)
    return merged


def polygon_to_outline(polygon: Polygon) -> list[list[float]]:
    """Shapely Polygon → [[x, y], ...] outline (4-decimal yuvarlamalı)."""
    if polygon.is_empty:
        return []
    coords = list(polygon.exterior.coords)
    return [[round(x, 4), round(y, 4)] for x, y in coords]


# ── Duvar segmentleri ─────────────────────────────────────────────────────────

def extract_wall_segments(
    floor_polygon: Polygon,
    scale: float = 1.0,
    min_length_m: float = 0.20,
    collinear_angle_deg: float = 5.0,
) -> list[dict]:
    """
    Zemin polygon kenarlarından duvar segmentleri.

    Noise temizleme:
    1) Çok kısa segmentler atılır (min_length_m, default 0.20 m)
    2) Ardışık collinear segmentler birleştirilir (5° açı toleransı)
    """
    if floor_polygon.is_empty:
        return []
    coords = list(floor_polygon.exterior.coords)
    if len(coords) < 3:
        return []

    # 1. Ham edge listesi
    raw = []
    for i in range(len(coords) - 1):
        a = (coords[i][0], coords[i][1])
        b = (coords[i + 1][0], coords[i + 1][1])
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        if length < 0.01:
            continue
        raw.append((a, b, length))
    if not raw:
        return []

    # 2. Collinear merge — ardışık aynı yönde edge'ler tek segment olur
    cos_tol = math.cos(math.radians(collinear_angle_deg))
    merged: list[tuple] = []
    for a, b, length in raw:
        if merged:
            pa, pb, plen = merged[-1]
            # Önceki segment yön vektörü
            pdx, pdy = pb[0] - pa[0], pb[1] - pa[1]
            pmag = math.hypot(pdx, pdy)
            ndx, ndy = b[0] - a[0], b[1] - a[1]
            nmag = math.hypot(ndx, ndy)
            if pmag > 1e-6 and nmag > 1e-6:
                dot = (pdx * ndx + pdy * ndy) / (pmag * nmag)
                if dot >= cos_tol and pb == a:
                    # Collinear + bağlantılı → merge
                    new_len = math.hypot(b[0] - pa[0], b[1] - pa[1])
                    merged[-1] = (pa, b, new_len)
                    continue
        merged.append((a, b, length))

    # 3. Min length filter
    segments = []
    for a, b, length in merged:
        if length < min_length_m:
            continue
        segments.append({
            "id": f"wall-{len(segments)}",
            "a": [round(a[0], 4), round(a[1], 4)],
            "b": [round(b[0], 4), round(b[1], 4)],
            "length": round(length, 4),
            "source": "mesh_outline",
        })
    return segments


# ── Opening detection ─────────────────────────────────────────────────────────

def project_wall_to_2d(mesh: trimesh.Trimesh, wall_group: dict) -> list[tuple[float, float]]:
    """
    Wall face vertices'ini duvar düzleminin local 2D koordinatlarına çevir.
    X = duvar boyu (tangent), Y = yükseklik (dikey).
    Sonuç: 2D nokta listesi (duplicates yok değil, sıra korunmaz).
    """
    nx, _, nz = wall_group["normal"]
    # Tangent vector (duvar boyu yönü): normal'a dik, Y=0
    tangent = np.array([-nz, 0.0, nx])
    tnorm = np.linalg.norm(tangent)
    if tnorm < 1e-6:
        return []
    tangent /= tnorm

    face_indices = wall_group["face_indices"]
    vertex_indices = np.unique(mesh.faces[face_indices].flatten())
    verts = mesh.vertices[vertex_indices]

    # 2D projection: x = tangent·v, y = v.y
    xs = verts @ tangent
    ys = verts[:, 1]
    return [(float(xs[i]), float(ys[i])) for i in range(len(xs))]


def detect_openings_in_wall(
    mesh: trimesh.Trimesh,
    wall_group: dict,
    wall_id: str,
    wall_height_m: float,
) -> list[dict]:
    """
    Duvar mesh'inde delik (kapı/pencere/niş) tespiti.

    Yaklaşım: Duvar face'lerini 2D'ye projeksiyonla, Shapely ile
    dış kontur + iç delikleri (holes) bul. Holes → openings.
    """
    pts_2d = project_wall_to_2d(mesh, wall_group)
    if len(pts_2d) < 4:
        return []

    # Convex hull veya alpha shape: shapely.geometry.MultiPoint.convex_hull
    from shapely.geometry import MultiPoint
    hull = MultiPoint(pts_2d).convex_hull
    if not hasattr(hull, "exterior"):
        return []

    # Şimdilik basit: tüm holes Polygon construction'ından
    # Daha gelişmiş: face indeksleriyle hole boundary çıkar
    # MVP: convex hull → opening tespiti sınırlı, gelecek iyileştirme

    # Mesh'in tüm bounding'i ile fark al (basit alanlar)
    openings: list[dict] = []
    return openings


def classify_opening(opening: dict, wall_height: float) -> dict:
    """
    Boyut + konum heuristics'iyle opening'i sınıflandır:
    - height/floor < 0.3m AND height_size > 1.5m → door
    - height/floor 0.5–1.5m AND size < 1.5m → window
    - height/floor 0.8–1.4m AND tiny → niche
    """
    y = float(opening.get("y", 0))
    w = float(opening.get("w", 0))
    h = float(opening.get("h", 0))

    if y < 0.30 and h > 1.5:
        kind = "door"
        confidence = "high" if y < 0.10 else "medium"
    elif 0.40 <= y <= 1.5 and 0.4 <= h <= 1.6 and w >= 0.3:
        kind = "window"
        confidence = "high" if 0.8 <= y <= 1.3 else "medium"
    elif 0.80 <= y <= 1.5 and w < 0.6 and h < 0.7:
        kind = "niche"
        confidence = "medium"
    else:
        kind = "frame"
        confidence = "low"

    return {**opening, "type": kind, "confidence": confidence}


# ── Net alan ──────────────────────────────────────────────────────────────────

def calc_room_area_m2(outline: Polygon) -> float:
    """Shapely polygon.area zaten m². Outline 0-area ise 0 döner."""
    if outline.is_empty:
        return 0.0
    return float(outline.area)


# ── Output builder ────────────────────────────────────────────────────────────

def build_geometry_dict(
    mesh: trimesh.Trimesh,
    source_path: str,
    floor_group: Optional[dict],
    ceiling_group: Optional[dict],
    wall_groups: list[dict],
    outline: Polygon,
    scale: float,
    scale_source: str,
    validation_report: dict,
    openings: list[dict],
) -> dict:
    """DXF kontratıyla uyumlu geometry dict üret."""
    bbox = mesh.bounds  # [[xmin,ymin,zmin],[xmax,ymax,zmax]]
    extents = mesh.extents
    height_m = float(extents[1])  # Y eksen
    width_m = float(extents[0])
    depth_m = float(extents[2])
    area_m2 = round(calc_room_area_m2(outline), 4)
    outline_units = polygon_to_outline(outline)

    wall_segments = extract_wall_segments(outline, scale=scale)

    doors = [o for o in openings if o.get("type") == "door"]
    windows = [o for o in openings if o.get("type") == "window"]
    niches = [o for o in openings if o.get("type") == "niche"]
    frames = [o for o in openings if o.get("type") == "frame"]

    # Net alan = oda alanı - duvar açıklıkları (zemine etkisiz, sembolik hesap)
    net_units2 = compute_net_area(outline_units, openings)
    net_area_m2 = round(net_units2, 4) if net_units2 else area_m2

    confidence_counts = {"high": 0, "medium": 0, "low": 0}
    for o in openings:
        c = o.get("confidence", "low")
        confidence_counts[c] = confidence_counts.get(c, 0) + 1

    meta = {
        "source": Path(source_path).name,
        "scale_unit": "OBJ",
        "scale_source": scale_source,
        "annotation_area_m2": None,
        "annotation_ceiling_height_m": None,
        "annotation_beam_height_m": None,
        "insunits": None,
        "scale_factor_to_meters": float(scale),
        "wall_width_units": round(width_m / scale, 4) if scale else width_m,
        "wall_height_units": round(height_m / scale, 4) if scale else height_m,
        "wall_width_m": round(width_m, 4),
        "wall_height_m": round(height_m, 4),
        "wall_thickness_units": 0.10 / scale if scale else 0.10,
        "wall_thickness_m": 0.10,
        "ceiling_height_units": round(height_m / scale, 4) if scale else height_m,
        "ceiling_height_m": round(height_m, 4),
        "wall_height_source": "mesh_extents_y",
        "origin": [round(float(bbox[0][0]), 4), round(float(bbox[0][2]), 4)],
        "geometry_mode": "mesh",
        "wall_tracer_version": "mesh-v1",
        "room_polygon_closed": bool(not outline.is_empty),
        "room_true_area_units2": round(area_m2 / (scale * scale), 4) if scale else area_m2,
        "room_true_area_m2": area_m2,
        "net_area_units2": round(net_area_m2 / (scale * scale), 4) if scale else net_area_m2,
        "net_area_m2": net_area_m2,
        "detection_summary": {
            "doors": len(doors),
            "windows": len(windows),
            "niches": len(niches),
            "frames": len(frames),
            "detail_polys": 0,
            "surface_segments": 0,
            "beams": 0,
        },
        "validation_summary": {
            "high": confidence_counts["high"],
            "medium": confidence_counts["medium"],
            "low": confidence_counts["low"],
            "low_confidence_ids": [o["id"] for o in openings if o.get("confidence") == "low"],
        },
        "mesh_validation": validation_report,
    }

    return {
        "meta": meta,
        "room_outline": [outline_units] if outline_units else [],
        "tiles": [],
        "floor_lines": [],
        "door_polys": [],
        "doors": doors,
        "windows": windows,
        "niches": niches,
        "frames": frames,
        "beams": [],
        "detail_polys": [],
        "surface_segments": [],
        "wall_segments": wall_segments,
        "features": openings,
        "walls_raw": [],
    }


def save_outputs(data: dict, base_name: str) -> None:
    """`{base_name}_geometry.json` + `{base_name}_building.json` üret."""
    geom_path = Path(f"{base_name}_geometry.json")
    build_path = Path(f"{base_name}_building.json")
    with open(geom_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    building = {
        "walls": [],
        "tiles": data.get("tiles", []),
        "floor": data.get("floor_lines", []),
        "doors": data.get("doors", []),
        "features": data.get("features", []),
        "windows": data.get("windows", []),
        "frames": data.get("frames", []),
        "surface_segments": data.get("surface_segments", []),
        "wall_segments": data.get("wall_segments", []),
        "wall_planes": data["meta"].get("wall_planes", []),
        "floor_polygon_3d": data["meta"].get("floor_polygon_3d", []),
        "meta": {
            "source": data["meta"]["source"],
            "geometry_mode": data["meta"].get("geometry_mode", "section"),
        },
    }
    with open(build_path, "w", encoding="utf-8") as f:
        json.dump(building, f, separators=(",", ":"), ensure_ascii=False)

    print(f"✓ {geom_path}")
    print(f"✓ {build_path}")


# ── Ana akış ──────────────────────────────────────────────────────────────────

def process(obj_path: str) -> Optional[dict]:
    """OBJ pipeline — face-based, mesh matematik 3D vektör → her co-planar
    grup ayrı surface (floor / ceiling / wall). Section/cluster/snap YOK.

    Akış:
      1. Mesh yükle + validate + normalize
      2. group_coplanar_faces → tüm planar grupları çıkar
      3. classify_horizontal / vertical → floor + ceiling + walls
      4. separate_inner_outer → iç yüzeyleri filtrele (mesh içine bakan face'ler)
      5. merge_coplanar_redundant_walls → ofset gürültüsünü gider
      6. extract_wall_quad_from_group → her duvar için 3D quad
      7. extract_floor_polygon_from_face_group → iç oda zemin polygon
      8. build_face_based_geometry_dict → meta.geometry_mode='mesh-face'
    """
    print(f"\n{'=' * 60}\n  Mesh dosyası: {obj_path}\n{'=' * 60}\n")

    mesh = load_mesh(obj_path)
    print(f"[Yükleme] vertex={len(mesh.vertices)}  face={len(mesh.faces)}")

    validation = validate_and_repair(mesh)
    print(f"[Validation] watertight={validation['is_watertight']}  "
          f"winding={validation['is_winding_consistent']}  "
          f"warnings={validation['warnings']}")

    # Eksen düzeltme: bazı mimari CAD/OBJ ihracı Z-up'tır; pipeline Y-up varsayar.
    # Doğrulanmış Z-up demo modelleri (Z_UP_MODELS) env bayrağı olmadan da otomatik
    # swap edilir; cube/5/banyo/egri Y-up olduğundan dokunulmaz. MESH_SWAP_YZ env'i
    # her modeli elle zorlar/iptal eder (kullanıcının kendi Z-up CAD'i için =1).
    # Otomatik genel tespit güvenilmediğinden (8/4) açık liste tercih edildi.
    _base = Path(obj_path).stem.lower()
    _env = os.environ.get("MESH_SWAP_YZ")  # "1" | "0" | None
    do_swap = (_env == "1") if _env is not None else (_base in Z_UP_MODELS)
    if do_swap:
        # Y ile Z yer değiştir (X etrafında -90°, proper rotation, mirror DEĞİL):
        # (x,y,z) → (x, z, -y). Eski Z (CAD'de yukarı) yeni Y (sahnede yukarı) olur.
        T = np.array([[1, 0, 0, 0],
                      [0, 0, 1, 0],
                      [0, -1, 0, 0],
                      [0, 0, 0, 1]], dtype=float)
        mesh.apply_transform(T)
        print(f"[Eksen] Y↔Z swap uygulandı (base={_base}, env={_env})")

    _, offset = normalize_mesh(mesh)
    print(f"[Normalize] offset={[round(float(o), 3) for o in offset]}  "
          f"yeni bbox Y_min={mesh.bounds[0][1]:.3f}")

    scale, scale_source = detect_scale(mesh)
    print(f"[Ölçek] 1 birim = {scale * 100:.4f} cm  ({scale_source})")

    # ── Face-based pipeline ──
    # Feature-flag (default = kanıtlanmış yol):
    #   MESH_SEG=bucket (default) | region (deneysel adjacency region-growing)
    #   MESH_INOUT=polygon (default) | raycast (deneysel ray occlusion)
    # NOT: region+raycast temiz watertight mesh'te (cube) çalışır, ancak gerçek
    # banyo mesh'lerinde (non-watertight, ince duvar iç+dış yüzeyleri) duvar
    # kopyaları üretir ve iç/dış ayrımı kusurludur. Polygon-containment iç/dış
    # tespiti bu mesh tipinde daha sağlamdır. Geliştirme tamamlanınca region
    # default yapılabilir.
    seg_mode = os.environ.get("MESH_SEG", "bucket").lower()
    inout_mode = os.environ.get("MESH_INOUT", "visible").lower()
    if seg_mode == "region":
        groups = segment_planar_regions(mesh)
    else:
        groups = group_coplanar_faces(mesh)
    floor_groups_all, ceiling_groups_all = classify_horizontal_all(groups)
    wall_groups_all = classify_vertical(groups)
    print(
        f"[Face Grouping] mode={seg_mode}  total_groups={len(groups)}  "
        f"floor_aday={len(floor_groups_all)}  "
        f"ceiling_aday={len(ceiling_groups_all)}  "
        f"wall_aday={len(wall_groups_all)}"
    )

    # Floor polygon — mesh.section yatay kesit (1.3m default, mesh içine alır)
    # Banyo gibi 'iç kaplama' mesh'lerde iç oda outline'ı 1.0-1.5m yüksekliğinde
    # net kesit verir; dış kabuğun alt kısımları (Y<0.5m) bbox kontur döner.
    floor_polygon, section_height_used = extract_outline_with_fallback(mesh)
    if floor_polygon is not None and not floor_polygon.is_empty:
        print(
            f"[Floor via Section] Y={section_height_used:.2f}m  "
            f"area={floor_polygon.area:.3f}m²  "
            f"corners={len(floor_polygon.exterior.coords) - 1}"
        )
    chosen_floor_group: Optional[dict] = None
    if floor_polygon is not None and not floor_polygon.is_empty:
        print(
            f"[Floor From Walls] area={floor_polygon.area:.3f}m²  "
            f"corners={len(floor_polygon.exterior.coords) - 1}  "
            f"source=wall_quads.bottom"
        )
    else:
        # Fallback: face-based Y-cluster
        chosen_floor_group = extract_inner_floor_faces_by_y_cluster(mesh)
        if chosen_floor_group:
            floor_polygon = extract_floor_polygon_from_face_group(chosen_floor_group, mesh)
            print(
                f"[Floor Y-Cluster fallback] face_count={len(chosen_floor_group['face_indices'])}  "
                f"y_level={chosen_floor_group.get('y_level', 0):.3f}m  "
                f"raw_area={chosen_floor_group['area']:.3f}m²"
            )

    # Zemin poligonu temizle: section iç+dış kabuğu kesip KENDİYLE KESİŞEN/geri-izleyen
    # outline üretebiliyor (model 1/3: ~25m çevre / 5.7m² = basit poligon için imkansız).
    # buffer(0) kendiyle kesişmeyi giderir, en büyük parça alınır, ~2cm toleransla
    # sadeleştirilir. Yalnız çevreyi DÜŞÜRÜP alanı koruyorsa uygulanır (gerçek
    # girinti/çıkıntı silinmez).
    if floor_polygon is not None and not floor_polygon.is_empty:
        try:
            fixed = floor_polygon.buffer(0)
            if isinstance(fixed, MultiPolygon):
                fixed = max(fixed.geoms, key=lambda g: g.area)
            if fixed and not fixed.is_empty and fixed.area > 1e-6:
                tol = 0.02 / scale if scale > 0 else 0.02
                simp = fixed.simplify(tol, preserve_topology=True)
                if not simp.is_empty and simp.area > fixed.area * 0.5:
                    fixed = simp
                shrunk = fixed.length <= floor_polygon.length + 1e-6
                kept_area = fixed.area > floor_polygon.area * 0.6
                if shrunk and kept_area:
                    print(f"[Floor Temizle] çevre {floor_polygon.length:.2f}→{fixed.length:.2f} "
                          f"birim, köşe {len(floor_polygon.exterior.coords)-1}→{len(fixed.exterior.coords)-1}")
                    floor_polygon = fixed
        except Exception as exc:
            print(f"[Floor Temizle] atlandı: {exc}")

    floor_area = float(floor_polygon.area) if floor_polygon and not floor_polygon.is_empty else 0.0
    print(
        f"[Floor Polygon] area={floor_area:.4f} m²  "
        f"corners={len(floor_polygon.exterior.coords) - 1 if floor_polygon and not floor_polygon.is_empty else 0}"
    )

    # İç/dış yüzey ayrımı — banyo iç kaplaması = içeride duran birinin GÖRDÜĞÜ
    # yüzeyler. Varsayılan: iç-görünürlük ray-cast (en sağlam; dış kabuk + arka
    # face + duvar kopyalarını otomatik eler). Fallback: polygon-distance / raycast-occlusion.
    visible_faces: set = set()
    if inout_mode == "visible":
        sample_pts = interior_sample_points(mesh, floor_polygon)
        visible_faces = compute_interior_visible_faces(mesh, sample_pts)
        print(f"[İç Görünürlük] örnek_nokta={len(sample_pts)}  "
              f"görünür_face={len(visible_faces)}/{len(mesh.faces)}")
        if len(visible_faces) < 3:
            print("[İç Görünürlük] yetersiz çarpma → polygon fallback")
            inout_mode = "polygon"

    def _sep(groups: list[dict]) -> tuple[list[dict], list[dict]]:
        if inout_mode == "visible":
            return filter_groups_by_visibility(groups, visible_faces)
        if inout_mode == "raycast":
            return separate_inner_outer_by_raycast(groups, mesh, room_polygon=floor_polygon)
        return separate_inner_outer_surfaces(groups, mesh, room_polygon=floor_polygon)

    inner_floors, outer_floors = _sep(floor_groups_all)
    inner_ceilings, outer_ceilings = _sep(ceiling_groups_all)
    inner_walls, outer_walls = _sep(wall_groups_all)
    
    # Fallback: inner boşsa outer'a düş (outside-modeled mesh)
    if not inner_floors and outer_floors:
        inner_floors = outer_floors
    if not inner_ceilings and outer_ceilings:
        inner_ceilings = outer_ceilings
    if not inner_walls and outer_walls:
        inner_walls = outer_walls
    # Floor için sıralama: face_count desc (en yoğun face grubu = iç zemin)
    inner_floors.sort(key=lambda g: -len(g.get("face_indices", [])))
    inner_ceilings.sort(key=lambda g: -len(g.get("face_indices", [])))
    print(
        f"[İç/Dış Filter] floor_inner={len(inner_floors)}/{len(floor_groups_all)}  "
        f"ceiling_inner={len(inner_ceilings)}/{len(ceiling_groups_all)}  "
        f"wall_inner={len(inner_walls)}/{len(wall_groups_all)}"
    )

    # Wall quad'ları önce çıkarmak gerek — floor polygon onlardan türetilir
    # (Banyo gibi 'iç kaplama' mesh'lerde face zemin DIŞ KABUK altı olabilir).
    wall_quad_list_pre: list[dict] = []
    for w in inner_walls:
        wq = extract_wall_quad_from_group(w, mesh, scale)
        if wq is not None:
            # Per-yüzey karar: tüm wall_planes iç duvar (dış kabuk hariç tutuldu).
            # tileable = iç + boyut eşiğini geçti (extract zaten min boyutu eledi).
            rc = w.get("raycast") or {}
            vis_frac = w.get("vis_frac")
            conf = vis_frac if vis_frac is not None else rc.get("confidence", 1.0)
            wq["decision"] = {
                "category": "wall",
                "side": "interior",
                "tileable": True,
                "confidence": round(float(conf), 3),
                "reason": rc.get("reason", f"vis_frac={vis_frac}" if vis_frac is not None else "geometry"),
                "source": w.get("interior_source", "raycast" if rc else "polygon"),
            }
            wall_quad_list_pre.append(wq)

    # Sıra önemli: ÖNCE eğri-merge (ham parçalar temiz, arc sürekliliği korunur),
    # SONRA coplanar-merge (kalan düz duvarlar). Coplanar önce çalışırsa yay
    # segmentlerinin bbox uçları kayıp arc zinciri kopar.
    wall_quad_list = wall_quad_list_pre
    curved_merged = merge_curved_wall_strips(wall_quad_list_pre)
    merged_walls = merge_coplanar_redundant_walls(curved_merged)
    # Çakışık zıt-yüz çiftlerini (ince duvarın iki tarafı) tekille → çift sayımı önle
    pre_dedup = len(merged_walls)
    merged_walls = dedup_opposite_face_walls(merged_walls, scale)
    if len(merged_walls) != pre_dedup:
        print(f"[Dedup] zıt-yüz çakışması: {pre_dedup} → {len(merged_walls)}")
    curved_count = sum(1 for w in merged_walls if w.get("kind") == "curved")
    print(f"[Wall Quads] ham={len(wall_quad_list)} adet")
    print(f"[Wall Merge] {len(wall_quad_list)} → {len(merged_walls)} "
          f"({curved_count} eğri yüzey)")

    # Ceiling quad'lar (opsiyonel — tile placement için kullanılmıyor ama meta'ya yazılır)
    ceiling_quad_list: list[dict] = []
    for c in inner_ceilings:
        cq = extract_wall_quad_from_group(c, mesh, scale)  # ceiling de wall quad gibi
        if cq is not None:
            ceiling_quad_list.append(cq)

    # Opening detection — eski placeholder, kalır
    openings: list[dict] = []
    wall_height_m = float(mesh.extents[1])
    for idx, wg in enumerate(wall_groups_all):
        wall_id = f"wall-{idx}"
        wall_openings = detect_openings_in_wall(mesh, wg, wall_id, wall_height_m)
        for op in wall_openings:
            op["surface_hint"] = wall_id
            openings.append(classify_opening(op, wall_height_m))

    # Build face-based geometry dict
    data = build_face_based_geometry_dict(
        mesh=mesh,
        source_path=obj_path,
        floor_polygon=floor_polygon,
        wall_quads=merged_walls,
        ceiling_quads=ceiling_quad_list,
        scale=scale,
        scale_source=scale_source,
        validation_report=validation,
        openings=openings,
    )
    # prepare_simulation normalize edilmiş mesh'i public/'a export etsin
    data["_mesh"] = mesh
    data["_offset"] = offset.tolist()
    # Reprodüksiyon + debug: hangi segmentasyon/iç-dış modu kullanıldı
    data["meta"]["segmentation_mode"] = seg_mode
    data["meta"]["inout_mode"] = inout_mode

    s = data["meta"]["surfaces"]
    print(
        f"[Face-Based Result] walls={len(s['walls'])}  "
        f"floors={len(s['floors'])}  ceilings={len(s['ceilings'])}  "
        f"floor_area={s['total_floor_area']:.3f}m²  "
        f"wall_total={s['total_wall_area']:.3f}m²  "
        f"surface_total={s['total_surface_area']:.3f}m²"
    )
    print(f"[Mode] geometry_mode={data['meta']['geometry_mode']}")
    return data


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Kullanım: python mesh_to_3d.py <obj_dosyası>")
    path = sys.argv[1]
    if not Path(path).exists():
        sys.exit(f"Dosya bulunamadı: {path}")

    result = process(path)
    if not result:
        sys.exit("İşlem başarısız.")

    base = Path(path).stem.lower()

    # Per-model mesh export: normalize edilmiş mesh'i {base}_mesh.obj olarak yaz.
    # MeshViewer bunu (v − roomCenterUnits) × scale ile çevirip duvarlarla hizalar.
    # Böylece her model KENDİ mesh'ini gösterir (paylaşımlı current_mesh.obj değil).
    norm_mesh = result.get("_mesh")
    if norm_mesh is not None:
        mesh_path = Path(f"{base}_mesh.obj")
        try:
            norm_mesh.export(str(mesh_path))
            result["meta"]["mesh_view_url"] = f"/{base}_mesh.obj"
            print(f"✓ {mesh_path}  (mesh_view_url=/{base}_mesh.obj)")
        except Exception as exc:
            print(f"[Uyarı] mesh export başarısız: {exc}")

    # Internal alanları JSON'dan önce temizle
    result.pop("_mesh", None)
    result.pop("_offset", None)
    result.pop("_section_height_m", None)

    save_outputs(result, base_name=base)
    print(f"\n[Tamam] mesh_to_3d → JSON çıktıları üretildi.\n")
