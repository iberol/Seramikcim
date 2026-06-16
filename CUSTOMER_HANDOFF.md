# Seramikcim — Customer Handoff

## 1. Project State

**Demo-ready / yerel kullanım.** Müşteri sunumu için stabil, doğrulanmış akış mevcut. Multi-tenant SaaS veya production deploy hedef **değildir** (bkz. roadmap).

## 2. What Is Working (doğrulanmış özellikler)

- DXF / DWG vektörel CAD dosyalarından oda geometrisi çıkarma (ezdxf + Shapely)
- DWG dönüşümü: LibreDWG / ODA / aspose-cad (üç alternatif, biri yeterli)
- OBJ mesh dosyasından section-based oda outline (trimesh + Shapely)
- 3D web render: React Three Fiber + Three.js 0.184; ham OBJ desteklenir
- Seramik kaplama hesabı: m², gerekli adet, fireli sipariş, kesim sayısı
- Yüzey editörü: zemin / seçili duvar / tüm duvarlar dropdown
- Yerel ürün katalog (10 ürün) + envanter yönetimi (localStorage persist)
- CAD kontrol paneli (2D çizim katman toggle, çizgi seç, boşluk öner)
- Konva CAD interaktif overlay (Ctrl+K) — snap-to-grid, undo/redo
- Tema toggle: açık ↔ koyu (persistent)
- Floating panel sistemi: sürüklenebilir, boyutlandırılabilir
- FastAPI catalog endpoint (GET/POST/PUT/DELETE) + Vite proxy
- Toast bildirim sistemi (geometri/katalog hata yönetimi)
- ErrorBoundary R3F crash koruması
- Otomatik test paketi: **252 test (115 vitest + 137 pytest)**

## 3. Validated Demo Scenarios

| # | Senaryo | Veri | Doğrulanan |
|---|---|---|---|
| 1 | DXF vektörel | `ornekler/test_a.dwg` | Alan 5.80 m², LibreDWG dönüşüm 3 sn, kapı+pencere+niş tespiti |
| 2 | OBJ mesh | `Obj/Banyo.obj` (2.27 MB, 37k face) | Section 1.3m, 8 duvar segmenti, alan 5.26 m², 4.4 sn |
| 3 | L-shape (yapay) | `public/test_complex_bathroom.json` | Alan 8.48 m² gross / 6.53 m² net, 1 kapı + 1 pencere + 2 niş |

Bu üç senaryo dışında **kapsamlı doğrulama yapılmamıştır**.

## 4. How to Run

```powershell
# 1. Kurulum (tek sefer)
npm install
python -m pip install -r requirements.txt
# (Opsiyonel) DWG için biri:
conda install -c conda-forge libredwg

# 2. Demo başlat
npm run dev
# → Vite (5173 dolu ise 5174) + FastAPI (8000) birlikte

# 3. Tarayıcı
# http://localhost:5173/  (veya 5174)

# 4. Demo akışı: DEMO_GUIDE.md
```

## 5. What NOT to Claim (henüz)

- **Otomatik kapı/pencere tespiti** — OBJ pipeline'da **placeholder**; manuel ekleme gerekir
- **SKP doğrudan desteği** — SketchUp dosyaları için **kullanıcı manuel OBJ export** yapmalı
- **Production SaaS** — yalnızca yerel demo; internet expose için CORS + auth + multi-tenant gerekir
- **Sınırsız OBJ boyutu** — 5+ MB için 10–20 sn pipeline süresi; UI uyarı toast'u var
- **Otomatik tile texture / PBR doku** — seramikler soyut renk; gerçek doku map yok
- **Çok dilli arayüz** — sadece Türkçe; i18n yok
- **Mobil uyumlu** — masaüstü tarayıcı odaklı; mobile responsive sınırlı
- **PDF rapor** — header'da buton var ama placeholder; PDF üretim yok

Detay: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)

## 6. Known Limitations (kategori özet)

1. **OBJ pipeline:** section yüksekliği fallback (1.3 → 1.0 → 0.5 m); açık-plan modeller başarısız olabilir
2. **DWG converter:** harici araç gerektirir (3 alternatif, biri kurulu olmalı)
3. **Frontend:** tek dil, bundle 913 KB (ilk yükleme 1–2 sn), state çift kaynaklı
4. **Test/CI:** ESLint yok, TypeScript yok, E2E yok, CI/CD yok
5. **Production:** CORS sadece localhost, auth yok, multi-tenant yok

Tam liste: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)

## 7. Backup Demo Procedure

Canlı dönüşüm başarısız olursa:

1. **Fallback geometri** otomatik devreye girer (`banyo_geometry.json`) — toast bilgilendirir
2. **Format değiştir:** DXF fail → OBJ; OBJ fail → DXF
3. **L-shape statik:**
   ```powershell
   Copy-Item public\test_complex_bathroom.json public\current_geometry.json
   # tarayıcı yenile
   ```
4. **Müşteriye söz:** "Bu format/mesh için %100 otomatik dönüşüm garanti edilmez. Önceden hazırladığımız 3 doğrulanmış senaryoda devam edelim."

Detay: [DEMO_GUIDE.md §5.3](DEMO_GUIDE.md)

## 8. Suggested Demo Script (10 dakika)

```
00:00 — Açılış (1 dk)
   "Seramikcim — banyo CAD/3D çizimlerini seramik kaplama
    hesabına dönüştüren yerel masaüstü aracı"

01:00 — DXF senaryosu (3 dk)
   Hazırla → ornekler/test_a.dwg
   3D sahnede oda göster — duvarlar, zemin, açıklıklar
   Yüzey Editörü → Zemin → Bianco Mat
   Sonuç paneli: 66 adet / 5 kutu, derz 3mm, %10 fire

04:00 — OBJ senaryosu (3 dk)
   Hazırla → Obj/Banyo.obj
   Ham mesh — gerçek banyo detayı (mobilya, fixtures)
   Section-based duvar tespiti — 8 segment
   Seramik ekle → duvarda hizalı

07:00 — Karmaşık L-shape (1 dk, opsiyonel)
   test_complex_bathroom.json kopyala → 8.48 m²
   2 niş + 1 kapı + 1 pencere visible

08:00 — Ürün Yönetimi (1 dk)
   Header → Urun Yonetimi → katalog 10 ürün
   Tema toggle (açık/koyu) demo

09:00 — Soru-cevap (1 dk)
   Roadmap kısa özet: opening detection, multi-language, deploy
```

## 9. Next Phase Options

Müşteri 5 kontrollü gelecek faz seçebilir (her biri **explicit onay** sonrası başlatılır):

| Faz | Süre tahmini | Değer |
|---|---|---|
| **1. Opening Detection** | 1-2 hafta | OBJ'de otomatik kapı/pencere — manuel iş yükü azalır |
| **2. E2E Demo Tests** | 1 hafta | Playwright + 3 senaryo; regresion koruması |
| **3. Performance** | 1-2 hafta | Pipeline < 2 sn, bundle < 300 KB, Lighthouse LCP < 2.5s |
| **4. Architecture Cleanup** | 2-3 hafta | Legacy state.js silme, tek Zustand kaynak |
| **5. Commercial Polish** | 3-4 hafta | PBR doku + TR/EN/AR + production deploy |

Detay: [NEXT_PHASE_PLAN.md](NEXT_PHASE_PLAN.md)

## 10. Contact / Support

- Demo dosyaları: `ornekler/` ve `Obj/` klasörleri
- Yedek geometri: `public/banyo_geometry.json`, `public/banyo_building.json`
- Sorun giderme: `DEMO_GUIDE.md §7`
- Tam test raporu: `TEST_REPORT.md`
- Sürüm notları: `RELEASE_NOTES.md`
