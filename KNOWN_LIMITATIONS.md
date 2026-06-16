# Seramikcim — Bilinen Sınırlamalar

Bu doküman müşteriye sunulurken **net** olarak ifade edilmelidir.

## OBJ pipeline

| Sınırlama | Etki | Geçici çözüm |
|---|---|---|
| Section-based outline `1.3 m → 1.0 m → 0.5 m` fallback | Garaj/depo/açık plan gibi 1.3m'de duvar olmayan OBJ'lerde boş outline → SystemExit | Mesh'i SketchUp/Blender'da duvarlı bir bölgede kapatın |
| Mobilya/dekor mesh `unary_union` | İç+dış duvar konturu birleşip iç çıkıntı kaybedilebilir | OBJ'de duvarları tek katman (solid wall) modelleyin |
| Opening tespiti (kapı/pencere/niş) | Şu an placeholder — 0 açıklık tespit edilir | Manuel olarak Yüzey Editörü'nden ekleyin |
| Büyük mesh (>5 MB / >50k face) | Pipeline 10–20 sn sürebilir | OBJ'yi decimation ile 20–40k face'e düşürün |
| MTL/texture | Mesh material referansları okunmaz | Sadece geometri kullanılır |

## SKP (SketchUp)

- **Doğrudan desteklenmiyor.** Otomatik SKP→OBJ dönüşüm yok.
- SketchUp Pro: `File → Export → 3D Model → Wavefront OBJ (*.obj)` → sonra OBJ yükleyin.

## DWG/DXF pipeline

| Sınırlama | Etki |
|---|---|
| DWG dönüşümü harici araç gerektirir | LibreDWG / ODA File Converter / aspose-cad'den biri **kurulu olmalı** |
| Layer adı tabanlı sınıflandırma | DWG'de "WALLS" / "DOORS" gibi standart layer adları yoksa fallback heuristic kullanılır |
| Anotasyon olmayan DXF | $INSUNITS yoksa scale tahmin edilir; cm/mm karışırsa hatalı ölçek |

## Frontend / UI

| Sınırlama | Etki |
|---|---|
| Tek dil (Türkçe) | i18n yok; UI sadece TR |
| Bundle 913 KB (R3F chunk, gzip 244 KB) | İlk yükleme 1–2 sn yavaş; LCP optimizasyonu eksik |
| State çift kaynaklı: legacy `createStateManager` + Zustand | `window.__seramikcim` bridge ile senkron; SSR/karmaşık test izolasyon zor |
| Konva CAD overlay legacy CAD ile paralel | Kullanıcı hangisini kullanacağını seçmek zorunda (Ctrl+K vs CAD button) |
| Three.js deprecation uyarıları konsola düşer | Zararsız (PCFSoftShadowMap, Clock) — R3F default'larından |

## Test / CI

| Sınırlama | Etki |
|---|---|
| **ESLint yok** | Kod stili manuel; CI'da lint adımı eklenmedi |
| **Type checking yok** | TypeScript'e geçilmedi; JS only |
| **E2E test yok** | Playwright planlı, kurulu değil; sadece manuel demo doğrulama |
| **CI/CD config yok** | GitHub Actions vb. yok; deploy manuel |

## Veri / Catalog

| Sınırlama | Etki |
|---|---|
| Katalog 10 ürün (statik seed) | Üretim için SQLite/PostgreSQL migration planı eksik |
| Material/texture render | Seramik dokular soyut renk olarak temsil edilir; gerçek doku map yok |
| Mağaza canlı API'sine bağlı değil | `public/catalog.json` yerel; üretici/fiyat senkronu yok |

## Performans

| Sınırlama | Etki |
|---|---|
| OBJ pipeline O(N²) yerine hash-based O(N), ama hâlâ 5–15 sn büyük mesh için | Loading state UI'da gösterilmeli (toast var) |
| Sahne re-render | Her seramik ekleme/silme tam re-render; React.memo eksik bazı bileşenlerde |
| Mesh decimation otomatik değil | Çok detaylı OBJ'ler için manuel ön-işleme önerilir |

## Güvenlik / Production

| Sınırlama | Etki |
|---|---|
| Yalnızca yerel kullanım hedefli | FastAPI CORS sadece `localhost:5173/5174`; internete açılması için CORS + auth gerekli |
| Auth / kullanıcı sistemi yok | Tek-makinede tek kullanıcı; multi-tenant değil |
| Dosya yükleme validation | Vite middleware `/api/prepare-simulation` sadece `.dwg/.dxf/.obj/.skp` filter; boyut limiti yok |
| Hardcoded paths | Bazı GUI/script'lerde mutlak yol varsayımı (Windows merkezli) |

## Wireframe Geometry Mode

`mesh_to_3d.process()` artık iki yol kullanır:

| Mode | Tetikleyici | Avantaj | Risk |
|---|---|---|---|
| **wireframe** (default) | feature_edges≥12, vertical_edges≥3 | Topology tabanlı; mobilya edge'leri ayrıştırılabilir | Çok temiz solid mesh gerekir |
| **section** (fallback) | wireframe validation fail | Her zaman çalışır (yatay kesit) | Detaylı mobilyalı mesh'lerde sahte segment |

Aktif mode `meta.wireframe.active` field'ında belirtilir. `meta.wireframe.fallback_used: true` ise kullanıcıya gösterilebilir uyarı (toast).

**Sınırlamalar:**
- Wireframe yine de **outline** için section kullanır — sadece duvar **adayları** wireframe'den gelir
- Tile placement koordinatları section outline'a bağlıdır (wireframe doğrulama amaçlı)
- Otomatik duvar plane projeksiyonu **henüz** placement coord üretmiyor (Phase 1 follow-up: NEXT_PHASE_PLAN)

## Canlı Demo Fail Prosedürü

Müşteri demosunda dönüşüm/yükleme hatası olursa **panik yok**, hazır fallback:

1. **`banyo_geometry.json` fallback** — geometri yüklenemezse arayüz otomatik fallback'e düşer; toast bilgilendirir
2. **DXF/OBJ swap** — biri başarısızsa diğer formatla devam et:
   - DXF fail → OBJ Banyo.obj
   - OBJ fail → DXF test_a.dwg
3. **L-shape statik fallback** — `public/test_complex_bathroom.json`'ı `current_geometry.json` üzerine kopyala (DEMO_GUIDE.md §5.2)
4. **Müşteriye söylenecek:** "Bu mesh/format için %100 otomatik dönüşüm garantili değil — `KNOWN_LIMITATIONS.md`'de açıklanan sınırlamalar var. Önceden hazırladığımız 3 doğrulanmış senaryo üzerinden devam edelim."

## Roadmap (kapsam dışı, sonraki sürümler)

- Otomatik opening detection (mesh hole analysis)
- Multi-language (EN, AR)
- SQLite/PostgreSQL catalog migration
- Electron desktop packaging
- E2E test paketi (Playwright)
- CI/CD pipeline (GitHub Actions)
- Material/texture pipeline (PBR doku map)
- SKP otomatik dönüştürme (pyslapi veya SketchUp SDK)
- Multi-tenant + auth
