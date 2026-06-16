# Seramikcim — Test Rehberi

## Genel Bakış

- **Vitest** (JavaScript): `tests/*.test.js` — jsdom ortamı, v8 coverage
- **Pytest** (Python): `tests/test_*.py` — fixtures `tests/conftest.py`'de
- **Toplam:** 115 vitest + 101 pytest = **216 test**

## Komutlar

```powershell
# Tek koşum
npm run test           # vitest tüm spec'ler
npm run test:py        # pytest tüm spec'ler
npm run test:all       # ikisi sırayla

# Watch / coverage
npm run test:watch     # vitest watch mode
npm run test:coverage  # vitest + v8 coverage raporu (coverage/)
npm run test:py:coverage  # pytest + html raporu (coverage/python/)
npm run test:all:coverage  # ikisi birden

# CI pipeline
npm run test:ci        # npm run build && npm run test:all
```

## Vitest Spec Envanteri

| Spec dosyası | Hedef modül | Test sayısı |
|---|---|---|
| `calculator.test.js` | `src/modules/calculator.js` | 16 |
| `builders.test.js` | `src/threejs/builders.js` | 14 |
| `theme.test.js` | `src/theme.js` | 10 |
| `icons.test.js` | `src/icons.js` | 9 |
| `toast.test.js` | `src/toast.js` | 6 |
| `floatingPanels.test.js` | `src/floatingPanels.js` | 7 |
| `state-helpers.test.js` | `state.js` formatters | 13 |
| `state-manager.test.js` | `state.js` `createStateManager` | 5 |
| `store-inventory.test.js` | `inventorySlice` | 9 |
| `store-surface.test.js` | `surfaceSlice` | 6 |
| `store-cad.test.js` | `cadSlice` | 11 |
| `store-geometry.test.js` | `geometrySlice` | 3 |
| `useLegacyState.test.js` | `useLegacyState` hook (smoke) | 3 |
| `scene-stub.test.js` | `scene-stub.js` | 6 |
| **Toplam Vitest** | | **115** |

## Pytest Spec Envanteri

| Spec dosyası | Hedef modül | Test sayısı |
|---|---|---|
| `test_geometry_compat.py` | `dxf_to_3d.compute_net_area`, Shapely vs Shoelace | 13 |
| `test_dxf_to_3d_core.py` | `dxf_to_3d` matematik helper'ları | 13 |
| `test_dxf_classification.py` | `classify_wall_polys` | 7 |
| `test_dxf_normalize.py` | `normalize_poly/_layer`, `merge_collinear_lines` | 10 |
| `test_prepare_simulation.py` | `prepare_simulation` (analyze, choose, override) | 13 |
| `test_libredwg_detection.py` | DWG converter detection | 8 |
| `test_api_endpoints.py` | FastAPI endpoint'leri (TestClient) | 12 |
| `test_api_storage.py` | `api/storage.py` | 13 |
| `test_api_models.py` | Pydantic modeller | 12 |
| **Toplam Pytest** | | **101** |

## Fixture'lar (`conftest.py`)

- `simple_room_dxf` — 200×150 cm dikdörtgen DXF (session scope, programatik üretilir)
- `l_shaped_room_dxf` — L-şekilli oda DXF (test_complex_bathroom benzeri)
- `temp_catalog_file` — FastAPI testleri için geçici catalog.json
- `fixtures_dir` — session lifetime test fixture dizini

## Mock Pattern'leri

### Vitest

```js
// fetch mock
import { vi, beforeEach } from 'vitest';
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products: [] }),
  });
});

// localStorage temizliği
beforeEach(() => {
  localStorage.clear();
});

// Zustand slice testi (mini store)
import { create } from 'zustand';
const store = create((set, get) => ({ ...createMySlice(set, get) }));
```

### Pytest

```python
# Tmp catalog + storage izolasyonu
@pytest.fixture(autouse=True)
def isolate_storage(tmp_path, monkeypatch):
    f = tmp_path / "catalog.json"
    f.write_text(json.dumps({"products": []}))
    monkeypatch.setattr(storage, "CATALOG_PATH", f)
    storage.reload()
```

## Yeni Test Eklemek

1. Hedef modülün dosyasını belirle (`src/...js` veya `dxf_to_3d.py`)
2. `tests/` altında `<module>.test.js` veya `tests/test_<module>.py` aç
3. Mevcut pattern'i kopyala (mock, fixture, describe/it veya class/method)
4. `npm run test` (JS) veya `npm run test:py` (Python) çalıştır
5. Geçerse `npm run test:all` ile bütüne ekle

## Coverage Hedefleri

| Katman | Hedef | Notlar |
|---|---|---|
| Vitest line coverage (`src/`) | ≥ %60 | `npm run test:coverage` HTML raporu `coverage/` |
| Pytest line coverage (`dxf_to_3d`, `prepare_simulation`, `api`) | ≥ %50 | `npm run test:py:coverage` HTML `coverage/python/` |
| Module smoke import | %100 | Her spec'in en az 1 testi `import` doğrular |

## Kapsam Dışı

- **R3F bileşenleri (Scene/Room/Fixtures/Openings/TileRegions):** Three.js full mock maliyetli, smoke import yeterli
- **commerce.js, cad.js (legacy controller'lar):** DOM-heavy, integration test daha uygun, bu sprint dışı
- **Playwright E2E:** ayrı sprint (FAZ 5 deferred)
- **R3F state bridge tam senkronizasyon:** legacy + Zustand birleştirmesi planda (FAZ 3 deferred)

## Bilinen Sorunlar

- `Three.js` deprecation uyarıları test çıktısında görünür (PCFSoftShadowMap, Clock) — etkisiz
- `pyparsing` `ezdxf` import sırasında deprecation warning verir — etkisiz
