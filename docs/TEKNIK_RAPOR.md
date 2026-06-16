# Seramikcim — Teknik Rapor

**Yazılım:** Seramikcim — Seramik Metraj, Fire ve Kesim Optimizasyonu Simülatörü
**Sürüm:** 1.0.0
**Belge türü:** Teknik Rapor (mimari, algoritmalar, doğrulama)
**Tarih:** 2026

> Not: Bu rapor yazılımın çekirdek bileşenlerini ve özgün algoritmalarını
> belgeler; doçentlik "Yazılım Üreticiliği Kanıt Dosyası" ve Kültür Bakanlığı
> eser tescil başvurusu için teknik dayanak oluşturur.

---

## 1. Amaç ve Kapsam

Seramikcim, bir banyo/ıslak hacim odasının 3B modelinden (OBJ mesh veya DXF/DWG
CAD) hareketle **iç duvar ve zemin yüzeylerini otomatik tespit eden**, bu yüzeyler
için **seramik metrajı (m² ve adet)**, **fire (kesim kaybı)** ve **kesim
optimizasyonu** hesaplayan; sonucu gerçek zamanlı 3B sahnede gösteren bir karar
destek yazılımıdır.

Çözülen temel problem: bir oda modelinde *hangi yüzeylerin kaplanacağının* doğru
belirlenmesi (yalnız iç duvarlar) ve bu yüzeylerin gerçek 2B şekillerinden
(eğri, L, açılı, girintili) doğru metraj/fire çıkarılması.

## 2. Sistem Mimarisi

Hibrit iki katmanlı mimari:

```
  OBJ / DXF / DWG  ──►  Python Geometri İşlem Hattı  ──►  *_geometry.json + *_mesh.obj
   (oda modeli)          (mesh_to_3d.py / dxf_to_3d.py)         │
                                                                ▼
                          Tarayıcı Uygulaması  ◄───────────────┘
              ┌──────────────────────────────┬─────────────────────────┐
              │  Legacy katman (Vanilla JS)   │  React katmanı (R3F)     │
              │  main.js / state.js /         │  src/ — 3B sahne, mesh,  │
              │  calculation.js               │  yüzey editörü, tile     │
              │  • metraj/fire/kesim hesabı   │  render, Face Select     │
              │  • yüzey editörü, envanter    │                          │
              └───────────────┬───────────────┴────────────┬────────────┘
                              │   window.__seramikcim       │
                              └─────── (köprü) ─────────────┘
```

- **Python işlem hattı** (offline/önişleme): mesh → yüzey çıkarımı → `*_geometry.json`
  (duvar düzlemleri + 2B poligonlar + kararlar) ve normalize edilmiş `*_mesh.obj`.
- **Tarayıcı uygulaması:** `index.html` hem `main.js` (legacy: kenar çubuğu, metraj,
  envanter, kesim) hem `/src/main.jsx` (React Three Fiber: yalnız 3B kanvas) yükler.
  İki katman `window.__seramikcim` köprüsü ile haberleşir.

Teknoloji yığını: Python 3 (trimesh, shapely, numpy), JavaScript (ES modules,
React 18, React Three Fiber / three.js, Zustand, Vite), test (Vitest, Pytest,
Playwright), opsiyonel FastAPI servis katmanı.

## 3. Veri Akışı

1. `python mesh_to_3d.py Obj/<model>.obj` → mesh yüklenir, onarılır, normalize
   edilir (XZ-merkez, Y=0), ölçek tespit edilir.
2. İç-görünürlük analizi → iç yüzeyler seçilir.
3. Yüzeyler floor/ceiling/wall olarak sınıflanır; her duvar için 3B quad +
   gerçek 2B poligon çıkarılır; eğri parçalar birleştirilir, çakışık çiftler
   tekilleştirilir.
4. `*_geometry.json` (meta.wall_planes, meta.surfaces, floor_polygon) +
   `*_mesh.obj` üretilir.
5. Tarayıcıda `main.js` geometriyi yükler, duvarları dünya koordinatına çevirir,
   metraj/fire/kesim simülasyonunu çalıştırır, köprüye yayınlar.
6. React sahnesi mesh + tile + yüzey seçiciyi render eder.

## 4. Özgün Algoritmalar

### 4.1 İç-Yüzey Tespiti — Ray-Cast Görünürlük Analizi

**Problem:** Bir oda mesh'i hem iç hem dış yüzeyleri, duvar kalınlığı nedeniyle
çift kabukları ve tavan/soffit parçalarını içerir. Yalnız *içeride duran birinin
gördüğü* iç yüzeyler kaplanmalıdır.

**Yöntem** (`mesh_to_3d.py`):
- `interior_sample_points(mesh, floor_polygon)` — oda hacminin **içinde** garantili
  örnek noktalar üretir: zemin poligonunun temsilci noktası + poligona kırpılmış
  kaba ızgara, 3 farklı yükseklikte (L/U şekilli odaların tüm kollarını kapsar).
- `compute_interior_visible_faces(mesh, points, n_dirs=192)` — her örnek noktadan
  küre üzerinde ~eşit dağılımlı (Fibonacci) yönlerde ışın atar; her ışının **ilk
  çarptığı yüzey** iç-görünür kabul edilir. Dış kabuk ve arka yüzler içeriden
  görünmediği için doğal olarak elenir. Birim ölçeğinden ve watertight olup
  olmamasından bağımsızdır.
- `filter_groups_by_visibility(groups, visible, min_frac=0.25)` — bir düzlemsel
  yüzey grubunu, yüzlerinin yeterli oranı iç-görünürse iç kabul eder.
- `dedup_opposite_face_walls(walls, scale)` — sıfır/ince kalınlıktaki bir duvarın
  iki yüzü (zıt normal + ~aynı merkez) çift sayımı önlemek için tekilleştirilir.

**Sonuç:** Banyo modelinde duvar sayısı 9→5, L-şekilli modelde 11→5'e düşmüş;
yalnız gerçek iç duvarlar kalmıştır (bkz. §6).

### 4.2 Per-Yüzey 2B Çıkarım

`extract_wall_quad_from_group` her duvar grubunu yerel düzleme projekte eder
(tanjant = normal × Ŷ, bitanjant = Ŷ), 2B sınır kutusundan 3B quad üretir ve aynı
düzleme ait tüm üçgenleri Shapely `unary_union` ile birleştirerek **gerçek dış
hattı (`polygon_2d`)** çıkarır. Dikdörtgen-dışı yüzeylerde (eğimli üst, L, girinti)
gerçek poligon; tam dikdörtgenlerde quad kullanılır. Eğri duvarlar
`merge_curved_wall_strips` ile yay zinciri olarak birleştirilip açılır (unroll).

### 4.3 Ölçek Tespiti (Birimden Bağımsızlık)

`detect_scale` mesh'in dikey boyutunu m/inch/cm/mm varsayımlarıyla metreye çevirip
tipik oda yüksekliğine (hedef 2.7 m, aralık 1.5–4.6 m) en yakın olanı seçer.
Böylece mm/cm/inch/m cinsinden modellenmiş OBJ'ler doğru ölçeklenir.

### 4.4 Metraj ve Fire Hesabı

`src/modules/calculator.js`:
- `computeNetArea(gross, openings)` — kapı/pencere/niş açıklıkları brüt alandan düşülür.
- `tileCount(area, tile, {groutMm, wastePct, pattern})` — etkin karo alanı (karo +
  derz) üzerinden ham adet `ceil(alan / karoAlanı)`; fire **alan üzerinden**
  uygulanır (ham adet × oran değil — aşırı sipariş önlenir).
- Desen-bazlı **minimum fire**: `wasteMultiplier` ile düz %10, diyagonal %15,
  balıksırtı %20; kullanıcı fire'si bu tabandan düşük olamaz
  (`effectiveWastePct = max(wastePct, patternMin)`).
- Kutu adedi `ceil(fireliAdet / kutudakiAdet)`.

### 4.5 Yüzey Bazlı Seçim ve Kesim Optimizasyonu

`state.js` `tiledSurfaceIds` kümesi hangi yüzeylerin kaplanacağını tutar; varsayılan
tüm iç duvarlar + zemin. Yüzey Editörü dropdown'u (Zemin / Seçili duvar / Tüm
duvarlar / Zemin+duvarlar) ve 3B Face Select tıklaması aynı kümeyi düzenler.
Simülasyon her yüzey için kesim parçalarını hesaplar, **artık parçaları** uygun
başka kesimlerde yeniden kullanarak toplam fireyi düşürür ve bir kesim planı üretir.

## 5. Doğrulama (Test Stratejisi)

- **Birim testleri:** 169 JavaScript (Vitest) + 141 Python (Pytest) — tümü geçer.
  Metraj/fire formülleri, ölçek tespiti, yüzey gruplama, sınıflandırma, durum
  yönetimi ve katalog/envanter mantığı kapsanır.
- **Uçtan uca (E2E):** Playwright senaryoları (temel akış, çok-açılı görünüm).
- **Üretim derlemesi:** `npm run build` başarılı.
- **Görsel doğrulama:** 8 demo model (cube, 1–5, Banyo, egri) tarayıcıda çok
  açıdan incelendi; tile yalnız iç duvar+zeminde, mesh ile hizalı.

## 6. Örnek Sonuçlar (Model Bazlı)

| Model | Tür | Ham duvar grubu | Tespit edilen iç duvar | Zemin alanı |
|-------|-----|-----------------|------------------------|-------------|
| cube  | Küp (referans) | 4 | 4 | 9.00 m² |
| Banyo | Gerçek banyo (açılı duvarlı) | 20 | 5 | 5.18 m² |
| 4     | L-şekilli | 15 | 5 | 8.57 m² |
| egri  | Eğri duvarlı | 14 | 4 (1 eğri) | 8.09 m² |

İç-görünürlük analizi sayesinde dış kabuk/kopya duvarlar elenmiş, yalnız gerçek
iç yüzeyler metraja dahil edilmiştir.

## 7. Bilinen Sınırlar

Ayrıntı için `KNOWN_LIMITATIONS.md`. Özetle: çok ince tessellation'lı mesh'lerde
görünürlük eşiği ayarı gerekebilir; DWG girişi üçüncü taraf `libredwg` ikilisine
bağlıdır (depoya dahil değildir, ayrıca indirilir); aynı modelde tüm yüzeyler elle
kapatılırsa boş seçim korunur.

## 8. Dizin Yapısı (Özet)

- `mesh_to_3d.py` — OBJ işlem hattı (iç-görünürlük, 2B çıkarım, ölçek).
- `dxf_to_3d.py`, `prepare_simulation.py` — DXF/DWG hattı ve hazırlama.
- `main.js`, `state.js`, `calculation.js` — legacy hesap + UI katmanı.
- `src/` — React Three Fiber 3B sahne, Zustand store, hesap modülleri.
- `tests/` — Vitest + Pytest + Playwright.
- `docs/` — bu rapor, kullanım kılavuzu, tescil ve kanıt dosyaları.
