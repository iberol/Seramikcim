# Seramikcim — Test Raporu

## Özet

| Katman | Sayı |
|---|---|
| Vitest (JS/JSX) | **115** passed |
| Pytest (Python) | **137** passed |
| **Toplam otomatik test** | **252 passed** |
| Build (`npm run build`) | ✓ ~680 ms |
| Sözdizimi (py_compile) | ✓ |

## Test Dosyaları

### Vitest (14 spec dosyası)

| Spec | Test |
|---|---|
| calculator.test.js | 16 |
| builders.test.js | 14 |
| theme.test.js | 10 |
| icons.test.js | 9 |
| toast.test.js | 6 |
| floatingPanels.test.js | 7 |
| state-helpers.test.js | 13 |
| state-manager.test.js | 5 |
| store-inventory.test.js | 9 |
| store-surface.test.js | 6 |
| store-cad.test.js | 11 |
| store-geometry.test.js | 3 |
| useLegacyState.test.js | 3 |
| scene-stub.test.js | 6 |
| **Toplam** | **115** |

### Pytest (10 spec dosyası)

| Spec | Test | Hedef |
|---|---|---|
| test_geometry_compat.py | 13 | Shapely + compute_net_area |
| test_dxf_to_3d_core.py | 13 | dxf_to_3d matematik helper'ları |
| test_dxf_classification.py | 7 | classify_wall_polys |
| test_dxf_normalize.py | 10 | normalize_poly/_layer, merge_collinear_lines |
| test_prepare_simulation.py | 19 | analyze, choose, override + detect_format |
| test_libredwg_detection.py | 8 | DWG converter detection |
| test_api_endpoints.py | 12 | FastAPI TestClient |
| test_api_storage.py | 13 | storage CRUD |
| test_api_models.py | 12 | Pydantic validation |
| test_mesh_to_3d.py | **30** | mesh + section + normalize (yeni: +6) |
| **Toplam** | **137** | |

## Manuel Simülasyon Doğrulama (3 senaryo)

| # | Senaryo | Veri | Beklenti | Sonuç |
|---|---|---|---|---|
| 1 | DXF/DWG vektörel | `ornekler/test_a.dwg` | Alan 5.8 m², LibreDWG dönüşüm | ✓ Alan 5.80 m², kapı+pencere+niş tespit |
| 2 | OBJ mesh | `Obj/Banyo.obj` (2.27 MB, 37k face) | Section 1.3m, gerçek duvar tespit | ✓ Alan 5.26 m², **8 duvar segmenti** (önce 21 sahte) |
| 3 | L-shape karmaşık | `public/test_complex_bathroom.json` | Alan 8.48 m², 1 kapı + 1 pencere + 2 niş | ✓ Tüm meta alanları doğru |

## Phase 2A Bug Fix Doğrulama

**Önce:**
- Banyo.obj: 19238 co-planar grup, **3018 sahte duvar adayı** → MIN_WALL_AREA filtre sonrası **21 yanlış duvar**
- Outline ham mesh world coord'unda → MeshViewer auto-center ile uyumsuz → seramik uçuyor
- Süre: takılı kaldı (>60sn)

**Sonra (section-based + normalize):**
- Banyo.obj: 16 chain → 3 ana ring union → **8 duvar segmenti** (gerçek geometri)
- Outline merkez (-0.02, -0.06) ≈ (0, 0) — mesh ile birebir hizalı
- Süre: 4.4 sn

## Regression

| Test öncesi | Test sonrası | Kaybedilen |
|---|---|---|
| 244 passed | 252 passed | 0 |

Tüm mevcut testler hâlâ geçiyor. Yeni 8 test eklendi (TestNormalizeMesh + TestExtractOutlineViaSection + TestExtractOutlineWithFallback + TestProcessNormalizeIntegration).

## Kapsam Dışı (Roadmap)

- E2E (Playwright) — planda, kurulu değil
- ESLint / TypeScript — yok
- CI/CD config — yok
- Coverage hedefi (vitest %60, pytest %50) — ölçüm yapılmadı ama infra var (`test:coverage`, `test:py:coverage`)

## Doğrulama Komutları

```powershell
npm run test:all       # 252 test
npm run build          # ~680 ms
python -m py_compile dxf_to_3d.py prepare_simulation.py mesh_to_3d.py cad_loader_gui.py
```
