# Seramikcim — Next Phase Plan

5 kontrollü gelecek faz. Her biri **explicit onay** gerektirir. Mevcut demo-ready durum bozulmaz.

---

## Phase 1 — Opening Detection (kapı/pencere otomatik tespit)

**Objective**
OBJ mesh'inde duvar deliklerini (kapı, pencere) section delta yöntemiyle otomatik tespit et. Niş ve mobilya hariç tutulur.

**Files likely affected**
- `mesh_to_3d.py` — `detect_openings_in_wall()` revize, yeni `extract_openings_by_section_delta()`
- `tests/test_mesh_to_3d.py` — yeni test sınıfı `TestOpeningDetection`
- `tests/conftest.py` — `obj_with_door_window` fixture

**Implementation steps**
1. Mevcut section yüksekliği 1.3m → 4 yüksekliğe genişlet: 0.5 / 1.0 / 1.3 / 1.8 m
2. Her yükseklikteki outline'ın **dış kontur uzunluk farkı** kapı/pencere işaretidir (kapı tabanda yok)
3. Section'lar arası `Polygon.difference()` ile delik bölgeleri hesapla
4. Delik dimensions + zemin offseti → `classify_opening()` ile kapı/pencere/niş ayrımı
5. Manuel override fallback korunur (Yüzey Editörü)

**Tests**
- Yapay kutu + 1 kapı kesip OBJ export → tespit doğrulama
- Banyo.obj smoke — en az 1 kapı tespit edilmeli
- `classify_opening()` mevcut testleri korunur

**Risks**
- False positive: mobilya cavity (lavabo arkası, dolap içi) kapı olarak sınıflandırılabilir
- Section düzlemi mesh kenarına çok yakınsa polygon kapanmaz
- Karmaşık open-plan'da section deltası tutarsız

**Done criteria**
- Banyo.obj 1+ kapı tespiti
- Manuel override hâlâ çalışıyor (kullanıcı silebilir/ekleyebilir)
- 252 → 252+5 test passed; regresion yok

---

## Phase 2 — E2E Demo Tests (Playwright)

**Objective**
Demo akışının otomatik regression koruması. 3 doğrulanmış senaryo headless'ta çalışır, screenshot artifact üretir.

**Files likely affected**
- `tests/e2e/load_render.spec.js` — DXF + L-shape senaryosu
- `tests/e2e/obj_pipeline.spec.js` — OBJ senaryosu
- `playwright.config.js` — yeni
- `package.json` — `test:e2e` + `playwright` devDependency

**Implementation steps**
1. `npm install -D @playwright/test playwright` + `npx playwright install chromium`
2. Playwright config: baseURL `http://localhost:5173`, webServer otomatik `npm run dev`
3. Spec 1: DXF — page.goto, Hazırla butonu, test_a.dwg seç, beklenen alan 5.80 m² assert
4. Spec 2: OBJ — Banyo.obj, beklenen 8 duvar
5. Spec 3: L-shape JSON kopyala + page reload, beklenen 8.48 m²
6. Her senaryo screenshot + console error toplama

**Tests**
- 3 spec; `npm run test:e2e` 3/3 passed
- CI komutu: `npm run test:e2e -- --reporter=github`

**Risks**
- Headless'ta WebGL desteği (Chrome `--use-gl=swiftshader` flag gerekebilir)
- Vite startup 5+ sn (`webServer.timeout` ayarı)
- Demo veri public/ üzerine yazılması — test isolation gerekir

**Done criteria**
- `npm run test:e2e` 3/3 passed
- Screenshot artifact'ları `test-results/` altında
- Mevcut 252 test korunur

---

## Phase 3 — Performance

**Objective**
- OBJ pipeline orta dosyalarda < 2 sn
- İlk web yükleme initial bundle < 300 KB (gzip)
- Lighthouse LCP < 2.5 s

**Files likely affected**
- `mesh_to_3d.py` — opsiyonel decimation
- `vite.config.js` — `manualChunks` revize, R3F lazy chunk
- `src/main.jsx` — `React.lazy(() => import('./App.jsx'))`
- `src/components/Scene.jsx` — R3F/drei dinamik import

**Implementation steps**
1. **Pipeline:** trimesh `simplify_quadric_decimation(face_count=10000)` opsiyonel — face count > 30k için tetikle
2. **Bundle:** `manualChunks` — `three`, `@react-three/*`, `leva` ayrı chunk; index < 300 KB
3. **Lazy loading:** App.jsx splash + lazy Scene; ilk paint 500 ms altı
4. **Asset opt:** OBJ static serve `Cache-Control: public, max-age=3600`

**Tests**
- Benchmark spec: 100/1k/10k face baseline (mevcut benchmark altyapısı)
- Lighthouse CI (opsiyonel)
- Mevcut 252 korunur

**Risks**
- Decimation oda outline detayını bozabilir (kullanıcı uyarısı + flag)
- Lazy load FOUC (flash of unstyled content)
- Bundle analyzer çalıştırılmazsa hangi paketin büyüdüğü belirsiz

**Done criteria**
- Banyo.obj pipeline < 2 sn
- Vite preview Lighthouse LCP < 2.5 s
- Initial JS chunk gzip < 300 KB

---

## Phase 4 — Architecture Cleanup

**Objective**
Legacy `state.js createStateManager` + Zustand store çift kaynak sorununu çöz. Tek state kaynağı = Zustand.

**Files likely affected**
- `main.js` (605 satır) — state init, event setup
- `state.js` (677 satır) — `createStateManager` aşamalı silinir
- `src/store/useAppStore.js` + slices — genişler
- `commerce.js`, `cad.js` — Zustand consumer'a port
- `src/hooks/useLegacyState.js` — window bridge kaldırılır

**Implementation steps**
1. **Karar matrisi:** Zustand kazanır (modern, test edilebilir, persist hazır)
2. **Aşamalı migrasyon:**
   - Settings → surfaceSlice (zaten kısmen)
   - Inventory → inventorySlice (zaten)
   - Regions / openings / fixtures → yeni slice
   - UI state (commerce drawer açık, vs.) → uiSlice
3. **Bridge kaldırma:** `publishLegacyState` + `useLegacyState` artık gereksiz
4. **Legacy controllers (commerce.js, cad.js):** Zustand `subscribe` ile yenidan tasarım veya React component'e port
5. **Adapter pattern:** Mevcut state.js fonksiyonları Zustand wrapper ile geçici

**Tests**
- Mevcut 252 test korunur (CRITICAL)
- Store integration testleri genişler: regions/openings/fixtures slice
- `state.js` test'leri Zustand muadiline taşınır

**Risks**
- **Geniş refactor** — main.js + 3 controller dosyası etkilenir
- localStorage migration: eski `seramikcim.inventory.sim.v1` + Zustand persist key uyumu
- Event listener'ların re-binding'i (panel'ler arası senkron)

**Done criteria**
- `state.js` ≤ 50 satır (sadece pure helper'lar, createStateManager silinmiş)
- `useLegacyState.js` silinmiş
- `window.__seramikcim` bridge yok
- Tüm 252 test geçer + yeni store testleri

---

## Phase 5 — Commercial Polish

**Objective**
- PBR doku pipeline (gerçek seramik dokusu)
- Multilingual UI: TR / EN / AR (RTL desteği dahil)
- Production deployment hazır (CORS, env, prod build)

**Files likely affected**
- `public/catalog.json` — texture URL alanları
- `src/components/r3f/TileRegions.jsx` — TextureLoader entegrasyonu
- `src/i18n/{tr,en,ar}.json` — yeni locale dosyaları
- `src/main.jsx` — i18next provider
- Header / Editor / Result panel'leri — `t()` çağrıları
- `api/main.py` — CORS env var
- `vite.config.js` — production base path

**Implementation steps**
1. **PBR:** `MeshStandardMaterial` + `map`, `roughnessMap`, `normalMap`; `useLoader(TextureLoader, url)`
2. **i18n:** `react-i18next` + 3 locale; key extraction script
3. **RTL:** Arapça için `dir="rtl"` body attribute; CSS logical properties (margin-inline)
4. **CORS:** `CORS_ALLOWED_ORIGINS` env var; default localhost
5. **Production build:** `vite build` + Caddy/Nginx static serve guide
6. **Deployment:** Docker compose (uvicorn + nginx)

**Tests**
- i18n key coverage testi (eksik anahtar fail)
- Texture loading smoke (404 fallback)
- Mevcut testler korunur
- E2E (Phase 2 sonrası) — 3 dilin toggle testi

**Risks**
- Texture asset toplam boyut (>10 MB) → CDN gerekli
- RTL layout (Arapça) — mevcut CSS LTR varsayıyor; logical properties refactor
- Production CORS yanlış konfigürasyon güvenlik açığı

**Done criteria**
- 3 dil toggle çalışır; sayfa yenilemede dil korunur
- 1+ seramik dokulu render (Bianco Mat texture map)
- `docker compose up` sonrası demo erişilebilir
- Prod build initial bundle hâlâ < 500 KB
