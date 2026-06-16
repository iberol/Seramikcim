# Seramikcim — Release Notes (Demo-Ready)

## v3.0 — Face-Based Geometry Pipeline

OBJ mesh pipeline tamamen yeniden yazıldı: section/cluster/snap kaldırıldı,
**her co-planar face grubu = ayrı wall/floor/ceiling surface** (matematiksel 3D vektör).

### Phase A — Face-Based Geometry (Python)
- `mesh_to_3d.py` yeniden yazım:
  - `separate_inner_outer_surfaces(groups, mesh)` — group centroid → mesh centroid dot product; iç face (banyo iç kaplaması) / dış face ayrımı
  - `extract_wall_quad_from_group(group, mesh)` — local tangent/bitangent basis, UV projection, 2D bbox → 3D quad; Y bounds = gerçek vertex Y (çatıya taşmaz)
  - `merge_coplanar_redundant_walls(walls, tol=2°/5cm)` — residuel ofset gürültüsü birleştirme
  - `build_face_based_geometry_dict(...)` — `meta.geometry_mode='mesh-face'`, yeni `meta.surfaces.{floors,walls,ceilings}`, backward compat `wall_planes`+`floor_polygon_3d`
  - Floor polygon: `extract_outline_with_fallback(mesh)` (1.3m yatay kesit) — iç oda footprint
- Silinen: `cluster_confirmed_corners`, `score_clusters_with_section_prior`, `extract_floor_polygon_from_wireframe`, `extract_wall_planes_from_wireframe`, `compute_wireframe_surfaces`, `select_geometry_mode`, `extract_wireframe_edges`, `extract_boundary_loops`, `extract_wall_candidates_from_edges`, `extract_confirmed_wall_corners`, `cross_check_outline_with_corners`, `validate_wireframe_geometry`
- Banyo.obj: **mode=mesh-face, 10 duvar, zemin 5.28m²**

### Phase B — scene.js + main.js Adaptation
- `scene.js deriveSceneData`: `meta.surfaces.walls` → wall list, `meta.surfaces.floors[0].polygon` → floor polygon
- `main.js updateWireframeChip`: `mesh-face` mode → "✓ Face-based (N duvar · zemin X.XXm²)"

### Phase C — R3F Overlay Update
- `Scene.jsx`: `isFaceBasedMode` = `mesh-face` mode; default meshOpacity=0.35, showWallPlanes=true
- `WallPlanesOverlay.jsx`: `meta.surfaces.walls` okur, confidence renk kodlu
- `FloorPolygonOverlay.jsx`: `meta.floor_polygon_3d` overlay

### Phase D — Test Suite
- `tests/test_wireframe_geometry.py` SİLİNDİ (cluster/score/snap obsolete)
- `tests/test_mesh_to_3d.py` legacy wireframe test class'ları kaldırıldı (+`TestBackwardCompat` eklendi)
- pytest: 140 pass | vitest: 159 pass

---

## v2.0 — Wireframe-Driven Pipeline + Fluent Design + Playwright E2E

Büyük rewrite: tile placement + m² hesabı **mesh wireframe topolojisinden** çıkarılan
3D wall plane'lere ve floor polygon'a dayanır. Section pipeline fallback olarak korunur.

### Phase A — Wireframe-Driven Geometry (Python)
- `mesh_to_3d.py` yeni fonksiyonlar:
  - `cluster_confirmed_corners(corners, eps=0.10)` — Greedy ε-cluster, 54 corner → 9 cluster (Banyo)
  - `score_clusters_with_section_prior(...)` — section outline'a 30cm içinde match → +5.0 confidence; vertical edge connectivity → +0.1/match
  - `extract_floor_polygon_from_wireframe(...)` — **A) section outline'ı cluster'lara snap et** (precision boost) / **B) top-N angular sort** fallback / **C) convex hull failsafe** / **D) top-4 rectangle fit**
  - `extract_wall_planes_from_wireframe(...)` — floor polygon kenarlarından 3D quad'lar (min 0.15m, vertical edge confidence)
  - `compute_wireframe_surfaces(...)` — exact m² (areaScale gereksiz)
  - `select_geometry_mode(...)` — üçlü dispatch: **wireframe-driven** → **section** → **aabb**
- `meta.geometry_mode` üçlü, yeni alanlar: `wall_planes`, `floor_polygon_3d`, `wireframe_surfaces`, `wireframe.clusters`, `wireframe.mean_wall_confidence`
- Banyo.obj sonuç: **5.35m² zemin + 28.80m² duvarlar (7 plane) = 34.15m² toplam**, `tile_placement_reliable=true`, mean_conf=0.80

### Phase B — Calculation.js Surface Model
- Yeni: `simulatePolygon` (floor için bbox grid + ray-cast point-in-polygon filter), `simulateQuad` (wall için u/v parametric), `dispatchSimulate` (kind dispatch + legacy fallback), `pointInPolygon` (export)
- `runSimulation` artık `dispatchSimulate` kullanıyor
- Backward compat: surface.kind undefined → eski `simulateRect` + areaScale (mevcut 44 mesh testi korunur)

### Phase D — Fluent Design 2 Tokens
- `style.css :root`: accent #2563EB → **#0078D4**, radius 10/14 → **4/4/8**, shadow lift 1px → **2px 8px**, transition cubic-bezier, --acrylic-blur 20px
- Dark mode mirror: accent #4CC2FF, surface #2B2B2B
- `appPanel.css` Fluent overrides: acrylic panel (graceful fallback + mobile off), 40×20 toggle, 2px focus border, primary button hover lift

### Phase C — R3F Surface UI
- `src/components/r3f/WallPlanesOverlay.jsx` (yeni) — wall_planes quad'larını yarı saydam mesh + LineLoop overlay, confidence renk kodlu (≥0.7 yeşil, <0.7 kırmızı)
- `Scene.jsx` Leva "Wall Planes (wireframe-driven)" debug toggle
- `scene.js` `deriveSceneData`: wireframe-driven mode'da floorSurface.polygon + walls[i].kind/quad/area inject
- `main.js updateWireframeChip` wireframe-driven mode mesaj: "✓ Wireframe-driven (mean conf XX%)"
- `window.__wireframeDebug()` devtools helper

### Phase E — Playwright E2E
- `@playwright/test` kurulu, chromium browser indirildi (~120MB)
- `playwright.config.js` — port 5173 reuseExistingServer
- `tests/e2e/smoke.spec.js` — 6 case: header, wireframe chip, surface m², surface değişim, paneller dropdown, console error filter
- Yeni scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:debug`, `test:full`

### Phase F — CLI Logging + Diagnostics
- `scripts/dev-logged.js` (yeni) — cross-platform Node tee (PS 5.1/7 + macOS/Linux uyumlu), `logs/dev.log`
- `npm run dev:logged` scripti
- Pipeline diagnostic log: `[Wireframe-Driven] clusters=N floor_area=X.XXX walls=N mode=...` + `[Diag] surface_total snap_applied`
- `.gitignore`: `logs/*.log`, `playwright-report/`, `test-results/`

### Test Sonuçları
- pytest: 151 → **171** (+20 wireframe geometry: cluster, score, floor polygon, wall planes, surfaces, mode dispatch, Banyo smoke)
- vitest: 147 → **159** (+12 wireframe surface: pointInPolygon, simulatePolygon×3, simulateQuad×3, dispatch×3)
- Playwright e2e: **6 smoke spec** (manuel çalıştırma)
- Mevcut 298 testin tümü korundu

### Bilinen sınırlar
- Mobile (≤768px) acrylic blur kapalı (perf)
- Banyo.obj 2/7 outline match → snap stratejisi outline+cluster precision koruyor; düşük confidence yüzeyler için section fallback hâlâ aktif
- Playwright sadece chromium (firefox/webkit eklenmedi)

---

## v1.4 — Critical UX Fixes + Wall Segment Noise Cleanup

### Düzeltmeler
- **Paneller dropdown kapanmıyordu** — `.hidden` global CSS rule yoktu, eklendi (`src/ui/appPanel.css`)
- **Menü scroll'u eksik** — commerce/cad/launcher inner container'lara `overflow-y: auto` (`style.css`)
- **Header wireframe status chip** — OBJ yüklendiğinde `⚠ Wireframe uyumsuz (2/7)` veya `✓ Wireframe doğrulandı` (`index.html` + `main.js updateWireframeChip`)
- **Result m² tooltip** — "Kaplanacak m² ⓘ" hover hint
- **Wall segment noise cleanup** (`mesh_to_3d.extract_wall_segments`):
  - `min_length_m: 0.20` (önce 0.01) — kısa noise edge'leri eler
  - `collinear_angle_deg: 5.0` — ardışık aynı yönlü segment'leri birleştirir
  - `simplify_tolerance: 0.02 → 0.05` — outline polygon daha temiz
  - Banyo.obj: **8 → 6 wall_segment** (gerçek duvarlar, 0.6m+ uzunluk)

### Test
- 298 stabil (147 vitest + 151 pytest)

---

## v1.3 — Demo Polish: Toast UX + Leva Config + AppPanel JSX + Wireframe Warning

### Yeni
- **AppPanel JSX library** (`src/ui/components/AppPanel.jsx`) — 10 React component (AppPanel/Header/Body/Section/Row/Slider/Select/Toggle/Button/Close+Minimize) atomic CSS class'larını semantic JSX'e sarar. Yeni React panel'leri bu library'i kullanır; legacy DOM panel'ler dokunulmaz.
- **Wireframe reliability warning** (`src/App.jsx`) — OBJ yüklenince `meta.wireframe.tile_placement_reliable === false` ise warning toast: "Mesh wireframe uyumsuz (2/8 köşe eşleşti)..." (id-dedupe, 1 kez)
- **Toast success suffix** — wireframe_reliable: true → "wireframe ✓", false → "wireframe ⚠"

### Düzeltmeler
- **Calculating toast 1200 ms auto-dismiss** (önce sticky `durationMs=0`) — block etmiyor, success'le otomatik değişiyor
- **Leva config explicit** — `<Leva titleBar={{ filter: false, title: 'Sahne Kontrolleri' }} hideCopyButton oneLineLabels />` ile "Open filter with CMD+SHIFT+L" hint kaldırıldı
- **`main.js` setSimState('success')** — payload'a `wireframe_reliable` bool eklendi (OBJ mesh meta'sından)

### Test
- 283 → **297 test** (+14): toast-bridge (6), appPanel-components (8)
- Build hatasız (586 ms)

---

## v1.2 — Toast Lifecycle + Panel Registry + Top Menu Restore

### Yeni
- **Calculation lifecycle channel** (`src/ui/simulationLifecycle.js`): surface editor hesabı için `idle|calculating|success|warning|error|stale` state machine. Custom event `seramikcim:sim-state`. 2 sn dedupe window.
- **Toast bridge** (`src/ui/toastBridge.js`): lifecycle transition → toast. Her state için sabit id (`sim-success`, `sim-warning`, `sim-error`) → spam yok.
- **Panel registry** (`src/ui/panelRegistry.js`): 6 panel için tek kaynak metadata (defaultPosition, icon, restoreFromTopMenu). Her panel id + selector + closable/minimizable flag.
- **Top menu "Paneller" dropdown** (`src/ui/topMenuRestore.js`): header'a icon button; kapalı/minimize panel listesi + "Düzeni Sıfırla" (confirm). Standart konuma açar.
- **`showPanelAtDefault(id)`** — `src/floatingPanels.js`'e eklendi. localStorage state'i temizleyip default'a açar.
- **Toast id dedupe** — `toast(msg, type, dur, {id})` opsiyonel id ile aynı bildirim 2 kez gösterilmez.

### `renderAll` Wrap
`main.js`'in `runSimulation` çağrısı `try/catch` + lifecycle event'leriyle sarmalandı. Surface editor değişimlerinde gerçek hesap durumuna göre toast atılır:
- Başarılı: "Hesap güncellendi: 2 ürün · 5.80 m²"
- Tile yok: warning "Hesap için seramik seçilmedi"
- Exception: error toast

### Test
- 266 → **283 test** (+17): simulation-lifecycle (6), panelRegistry (8), toast dedupe (3)
- Build hatasız (515 ms)

### Standard Default Positions
| Panel | Konum |
|---|---|
| launcher | left:16 top:96 420×280 |
| editor | right:16 top:80 340×600 |
| result | left:16 bottom:16 (full-w) 280h |
| camera | left:16 top:16 240×56 |
| commerce | center 900×700 |
| cad | left:60 top:80 1100×700 |

### Kısıtlar
- Konva CAD overlay (Ctrl+K) registry dışı — ayrı paradigm
- Leva panel external lib — dokunulmadı
- Mobile responsive style.css'te mevcut media query'ler kalır

---

## v1.1 — Wireframe Geometry + Unified UI System

### Yeni
- **Wireframe/topology geometri** (`mesh_to_3d.py`):
  - `extract_wireframe_edges` — feature edges (face_adjacency_angles > 30°)
  - `extract_boundary_loops` — co-planar facet boundary loops
  - `extract_wall_candidates_from_edges` — dikey/yatay edge cluster'ları → duvar adayları
  - `validate_wireframe_geometry` — sanity check
  - `process()` artık geometry_mode dispatch: **wireframe** (default) → fail → **section** fallback
  - `meta.wireframe` field: feature_edges count, boundary_loops, wall_candidates, vertical_edges, warnings
- **WireframeDebug R3F bileşeni** — Leva "Debug → Wireframe Geometry Debug" toggle; dikey edge'ler yeşil, yatay turuncu
- **UI Design System** (`src/ui/appPanel.css` + `.js`):
  - Atomic sınıflar: `.app-panel`, `.app-section`, `.app-row`, `.app-btn`, `.app-input`, `.app-select`, `.app-toggle`, `.app-slider`, `.app-tabs`, `.app-chip`
  - `normalizeFormControls()` mevcut legacy `.icon-btn`/`.primary-btn`/`.number-field`/`.select-field` → atomic class'ları otomatik ekler
  - main.js'te 7 panele uygulanır (header, editor, result, camera, launcher, commerce, cad)
  - Sonuç: tutarlı buton/input/select/toggle stilleri tüm panellerde

### Test
- 252 → **261 test** (+9 wireframe: TestWireframeEdges, BoundaryLoops, WallCandidates, ValidateWireframe, ProcessGeometryMode)
- Banyo.obj: 3882 feature edge, 9494 boundary loop, 215 wall candidate (73 vertical) — wireframe path aktif

### Hardening
- `numpy.bool_` JSON serialize fix (`is_vertical = bool(...)`)
- Wireframe meta tüm değerler explicit `int()` cast
- Mevcut section pipeline korunur (fallback)

---



## Bu sürümde yeni

### OBJ Pipeline — section-based duvar tespiti
- **Yeni:** `mesh_to_3d.extract_outline_via_section()` — `trimesh.Trimesh.section()` ile yatay düzlemde kesit alır, mesh topolojisinden gerçek oda outline'ı çıkarır
- **Yeni:** `normalize_mesh()` — mesh X-Z merkez + Y=0 zemine; pipeline + R3F MeshViewer **aynı origin'i paylaşır**
- Banyo.obj testi: **21 sahte duvar → 8 gerçek duvar segmenti** (alan 5.26 m²)
- Outline mesh ile birebir hizalı → seramikler doğru duvarda render olur

### Frontend — ham OBJ render
- `MeshViewer.jsx` auto-center kaldırıldı (pipeline normalize ettiği için ek transform gereksiz)
- "Çıkarılan kabuk" konsepti kaldırıldı: mesh modunda **her zaman ham OBJ** render edilir
- Leva Sahne paneli: Opaklık + Wireframe toggle (mesh inspection için)

### Test
- 244 → **252 test** (+8 yeni: section + normalize integration)
- Pytest test_mesh_to_3d: 24 → 30 test

### Docs
- `DEMO_GUIDE.md`, `KNOWN_LIMITATIONS.md`, `TEST_REPORT.md`, `requirements.txt` eklendi

## Düzeltmeler

- `prepare_simulation._prepare_mesh` — internal `_mesh` field artık JSON serialize öncesi temizleniyor (önce `TypeError: Object of type Trimesh is not JSON serializable`)
- `mesh_to_3d` CLI — aynı temizlik
- Section coord uyumu — `path2d.polygons_full` yerine `section.discrete` (X-Z world coord)
- 16 mesh chain → `unary_union` ile en büyük 3 → temiz oda outline (iç+dış duvar konturu sorunu çözüldü)

## Bağımlılık güncelleme

`requirements.txt` eklendi:
- trimesh ≥ 4.0 + rtree ≥ 1.0 + manifold3d ≥ 3.0 (mesh section için)
- shapely, ezdxf, fastapi, uvicorn, pytest

## Build / Performans

- Build: ✓ 684 ms
- Banyo.obj (2.27 MB / 37k face) pipeline: **4.4 sn** (önce >60 sn timeout)

## Bilinen sınırlamalar

`KNOWN_LIMITATIONS.md` — özet: opening detection placeholder, SKP yok, ESLint/TS yok, E2E yok.

## Kısıtlar

- Bu sürüm **yerel demo** için optimize edildi (FastAPI CORS sadece localhost)
- Internet üzerinde host edilmesi için ek CORS + auth + multi-tenant gerekli (roadmap)
