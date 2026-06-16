# Seramikcim — Demo Rehberi

5–15 dakikalık müşteri demosu için stabil akış.

## 1. Kurulum (tek sefer)

```powershell
# Node bağımlılıkları
npm install

# Python bağımlılıkları (Python 3.10+)
python -m pip install -r requirements.txt

# (Opsiyonel) DWG desteği — biri yeterli
conda install -c conda-forge libredwg
# veya https://www.opendesign.com/guestfiles/oda_file_converter
```

## 2. Demo başlat

```powershell
npm run dev
```

Vite (port 5173 dolu ise 5174) + FastAPI (8000) birlikte başlar. Tarayıcı:
`http://localhost:5173/` veya `http://localhost:5174/`

## 3. Demo akışı

### 3a. DXF/DWG (vektörel) senaryo
1. **Hazırla** butonu → `ornekler/test_a.dwg` seç
2. ~3 sn pipeline; "Aktif CAD" header'da güncellenir
3. 3D sahnede dikdörtgen banyo (2.46 × 2.53 m, alan 5.80 m²)
4. **Yüzey Editörü** → Yüzey: `Zemin` → Ana seramik: `Bianco Mat`
5. Sonuç paneli: **66 adet / 5 kutu** (3 mm derz, %10 fire)

### 3b. OBJ mesh senaryo (yüksek detay)
1. **Hazırla** → `Obj/Banyo.obj` seç (~5 sn)
2. R3F sahnede **ham OBJ render** (mobilya, fixtures, detaylar dahil)
3. Section-based duvar tespiti: **8 duvar segmenti**, alan 5.26 m²
4. Yüzey Editörü → Duvar seç → seramik → konumlar duvarda hizalı

### 3c. L-şekilli karmaşık banyo (önceden hazır)
- `public/test_complex_bathroom.json` mevcut
- Manuel test için: `copy public\test_complex_bathroom.json public\current_geometry.json` (yedek al)
- Alan 8.48 m², net 6.53 m², 1 kapı + 1 pencere + 2 niş

## 4. Müşterinin görmesi gerekenler

- **3D oda** — gerçek banyo geometrisi (mesh için ham OBJ, DXF için duvar segmentleri)
- **Yüzey seçimi** — Zemin / Seçili duvar / Tüm duvarlar dropdown
- **Anlık hesap** — m², gerekli seramik adedi, fireli sipariş, kesim sayısı
- **Detay panel** — kesim planı, artan malzeme, uyarılar
- **CAD kontrol paneli** (header → CAD) — 2D çizim üzerinde katman toggle + çizgi seç + boşluk öner
- **Ürün Yönetimi** (header → Urun Yonetimi) — katalog 10 ürün (mağaza), envanter
- **Tema toggle** (header sağ üst) — açık ↔ koyu

## 5. Yedek demo yolu (canlı sahne yüklenmezse)

- `public/banyo_geometry.json` ve `public/banyo_building.json` fallback olarak yüklü
- Hiç CAD/OBJ olmadan da arayüz çalışır (sahne sabit fallback geometri)
- Toast bildirimi: "Geometri yüklenemedi: ... Fallback geometri kullanılıyor."

## 5.1. Pipeline süreleri (gerçekçi beklenti)

| Format | Tipik süre | Notlar |
|---|---|---|
| DXF | 2–5 sn | LibreDWG dönüşüm dahil; ezdxf parse hızlı |
| OBJ < 1 MB | 2–4 sn | Trimesh + Shapely; basit kutu odalar |
| OBJ 1–5 MB | 4–10 sn | Section + union; gerçek detaylı banyo |
| OBJ > 5 MB | 10–20 sn | Performans uyarı toast'u gösterir |

Demo sırasında müşteriyi bekletmemek için CAD'i önceden hazırlayın (aşağı bkz).

## 5.2. Demo öncesi yedek (önerilen)

```powershell
# Aktif simülasyon verisini yedekle (test sırasında üzerine yazılabilir)
Copy-Item public\current_geometry.json public\current_geometry.bak.json
Copy-Item public\current_building.json public\current_building.bak.json

# Demo sonrası restore
Copy-Item public\current_geometry.bak.json public\current_geometry.json -Force
Copy-Item public\current_building.bak.json public\current_building.json -Force
```

## 5.3. Canlı dönüşüm başarısız olursa

| Belirti | Söylenecek | Yapılacak |
|---|---|---|
| "Hazırla" sonsuz dönüyor | "Bu mesh için 1.3m section'da kapanmıyor; farklı bir export deneyelim" | DEMO_GUIDE 3c — `test_complex_bathroom.json`'a geç |
| Toast "Geometri yüklenemedi" | "Fallback banyo geometrisi devreye girdi; demo akışına devam ediyoruz" | Sayfa otomatik `banyo_geometry.json`'a düşer |
| OBJ render boş | "OBJ dosyası 1.3m yüksekliğinde kapalı duvar içermiyor" | `KNOWN_LIMITATIONS.md` referansı + DXF senaryosuna geç |
| DWG dönüşüm fail | "Bu format için LibreDWG/ODA gerekli; DXF dosyamızla ilerleyelim" | DEMO_GUIDE 3a → `test_a.dwg` |

## 6. Demo sırasında dikkat

| Konu | Mesaj |
|---|---|
| OBJ pipeline süresi | "Mesh dosyaları için 3–15 sn hesaplama; CAD anlık" |
| 21 → 8 duvar | "Section-based tespit ile mühendislik doğruluğu" |
| Konva CAD overlay | `Ctrl+K` — interaktif 2D çizim, snap-to-grid, undo/redo |
| Tema | "localStorage'da kalıcı; sayfa yenileme korur" |
| Floating paneller | "Tüm paneller başlığından sürüklenebilir, sağ alt köşeden boyutlandırılabilir" |

## 7. Sorun giderme

| Hata | Çözüm |
|---|---|
| `/api/catalog` ECONNREFUSED | FastAPI başlamamış; `npm run dev` Vite+API birlikte başlatır |
| OBJ yüklenmedi | `trimesh` + `rtree` kurulu mu? `pip install trimesh rtree manifold3d` |
| DWG dönüşüm fail | LibreDWG/ODA/aspose-cad'den en az biri kurulu olmalı |
| Sahne boş | Konsol toast oku; fallback geometri yüklenir |
| Konsol THREE deprecation | Zararsız (PCFSoftShadowMap, Clock) — R3F default'u |

## 8. Demo sonu özet konuları

- 244 → 252 otomatik test, build hatasız
- DXF + OBJ mühendislik doğruluğu (Shapely, section-based)
- 3 katmanlı pipeline: vektör (DXF) / mesh (OBJ) / hibrit
- Mevcut sınırlamalar: bkz. KNOWN_LIMITATIONS.md
