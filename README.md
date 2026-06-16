# Seramikcim CAD Kaplama Simülasyonu

Seramikcim, DWG/DXF tabanlı banyo çizimlerini simülasyon verisine çeviren ve bu veriyi web arayüzünde 3D oda, CAD kontrol ekranı, seramik kaplama hesabı ve envanter yönetimi olarak gösteren yerel bir uygulamadır.

## Projenin Amacı

Bu proje, CAD çiziminden banyo geometrisini çıkarmak ve seramik kaplama kararlarını görsel olarak kontrol edilebilir hale getirmek için geliştirilmiştir.

Ana yetenekler:

- DWG veya DXF dosyasından oda geometrisi çıkarma.
- Odayı web arayüzünde 3D olarak gösterme.
- Zemin ve iç duvarlar için seramik kaplama hesabı yapma.
- Seramik, lavabo, WC, rezervuar, duş teknesi ve aksesuarları yerel katalogdan seçip envantere ekleme.
- Bölgesel seramik uygulamaları tanımlama.
- Kapı, pencere ve niş gibi boşlukları kaplama hesabından düşme.
- Kesim, fire ve artan parça önerilerini hesaplama.
- CAD kontrol panelinde ham çizimi 2D inceleme ve simülasyon düzeltmeleri yapma.

## Çalışma Prensibi

Sistem iki ana parçadan oluşur: Python hazırlama akışı ve web simülasyon arayüzü.
      
1. Kullanıcı CAD dosyasını Tkinter arayüzünden veya komut satırından seçer.
2. `prepare_simulation.py` seçilen dosyayı işler.
3. Dosya DWG ise LibreDWG, ODA File Converter veya aspose-cad ile geçici DXF dosyasına    çevrilir. Dosya zaten DXF ise doğrudan okunur.
4. `dxf_to_3d.py`, DXF içindeki polyline verilerini ve katmanları analiz eder.
5. Oda sınırı, zemin çizgileri, kapı çizgileri ve dekor/yardımcı çizimler ayrıştırılır.
6. İki ana JSON üretilir:
   - `public/current_geometry.json`: 3D oda ve kaplama simülasyonu için normalize edilmiş geometri.
   - `public/current_building.json`: CAD kontrol panelinde gösterilecek ham çizim katmanları.
7. Web arayüzü `main.js` içinde bu JSON dosyalarını, `public/catalog.json` ürün kataloğunu ve kullanıcı seçimlerini birleştirir.
8. Three.js ile 3D oda oluşturulur; canvas tabanlı CAD panelinde 2D çizim gösterilir.
9. Seramik hesabı seçilen yüzey, ürün ölçüsü, derz boşluğu, başlangıç noktası, yön, boşluklar ve özel bölgeler üzerinden hesaplanır.

## Kurulum

Node bağımlılıklarını yükleyin:

```powershell
npm install
```

Python tarafında DXF okumak için `ezdxf` gerekir:

```powershell
python -m pip install ezdxf
```

## Desteklenen Dosya Formatları

| Format | Akış | Bağımlılık |
|---|---|---|
| `.dxf` | DXF parser → polyline analizi | `ezdxf` (zorunlu) |
| `.dwg` | DWG → DXF dönüşümü → polyline | LibreDWG / ODA / aspose-cad (biri) |
| `.obj` | Mesh → yüzey gruplama → oda extraction | `trimesh` + `shapely` |
| `.skp` | Doğrudan desteklenmez — SketchUp Pro'dan **File → Export → 3D Model → Wavefront OBJ** yapın | (manuel) |

### OBJ Mesh Pipeline (mühendislik doğruluğunda)

`pip install trimesh shapely manifold3d` ile kurun. Akış:
- Watertight + manifold validation (gerekirse repair)
- Auto-scale tespiti (mm/cm/m, bbox bazlı)
- Co-planar face gruplama (1° açı + 1 cm offset toleransı)
- Zemin/tavan/duvar sınıflandırma (normal vektör yönüne göre)
- Concave oda outline (L-şekilli destekli, Shapely)
- Opening boyut-tabanlı sınıflandırma (kapı/pencere/niş)
- Çıktı: `dxf_to_3d.process()` ile birebir aynı kontrat

Doğrulama: `python prepare_simulation.py oda.obj` veya GUI dosya seçici.

---

DWG dosyası okumak için aşağıdaki seçeneklerden **biri** yeterlidir (öncelik sırası):

**1. LibreDWG** — açık kaynak, ücretsiz (önerilen):
```powershell
conda install -c conda-forge libredwg
```
Veya [GitHub Releases](https://github.com/LibreDWG/libredwg/releases) sayfasından Windows ikili paketini indirin; `dwg2dxf.exe` dosyasının `PATH`'te olması yeterlidir.

**2. ODA File Converter** — ücretsiz, tescilli:
[opendesign.com](https://www.opendesign.com/guestfiles/oda_file_converter) adresinden indirip kurun.

**3. aspose-cad** — ticari:
```powershell
python -m pip install aspose-cad
```

Üçü de yoksa yalnızca DXF dosyaları desteklenir; DWG verildiğinde kurulum talimatları hata mesajında gösterilir.

GUI uygulamasını exe olarak paketlemek isterseniz `pyinstaller` da kurabilirsiniz:

```powershell
python -m pip install pyinstaller
```

## Çalıştırma

Web arayüzünü geliştirme modunda başlatmak için:

```powershell
npm run dev
```

Tkinter CAD yükleyici arayüzünü açmak için:

```powershell
npm run gui
```

Bir CAD dosyasını doğrudan komut satırından simülasyona hazırlamak için:

```powershell
python prepare_simulation.py "C:\dosya_yolu\banyo.dwg"
```

DXF dosyaları da aynı komutla verilebilir:

```powershell
python prepare_simulation.py "C:\dosya_yolu\banyo.dxf"
```

Üretim build'i almak için:

```powershell
npm run build
```

Build çıktısını önizlemek için:

```powershell
npm run preview
```

## Dosya Yapısı

Temiz kaynak yapısında temel dosyalar şunlardır:

- `index.html`: Web arayüzünün HTML iskeleti.
- `main.js`: 3D sahne, CAD kontrol paneli, envanter ve seramik simülasyonu mantığı.
- `style.css`: Arayüz stilleri.
- `vite.config.js`: Vite build ayarları.
- `cad_loader_gui.py`: CAD dosyası seçmek, simülasyon verisini hazırlamak ve arayüzü başlatmak için Tkinter GUI.
- `prepare_simulation.py`: DWG/DXF dosyasını simülasyon JSON dosyalarına dönüştüren hazırlama scripti.
- `dxf_to_3d.py`: DXF okuma, katman analizi, geometri sınıflandırma ve raporlama mantığı.
- `public/catalog.json`: Yerel ürün kataloğu.
- `public/current_geometry.json`: Arayüzün kullandığı aktif 3D geometri verisi.
- `public/current_building.json`: CAD kontrol panelinin kullandığı aktif ham çizim verisi.
- `public/current_comparison.json`: Çoklu CAD yüklemede üretilen çizim karşılaştırma raporu.
- `banyo_geometry.json`: Web arayüzü için fallback geometri verisi.
- `banyo_building.json`: CAD kontrol paneli için fallback çizim verisi.
- `dist/`: `npm run build` ile üretilen dağıtım çıktısıdır; geliştirme modunun runtime veri kaynağı değildir.
- `package.json` ve `package-lock.json`: Node/Vite bağımlılık ve script tanımları.

## Kullanım Akışı

1. `npm install` ile Node bağımlılıklarını kurun.
2. Python bağımlılıklarını kurun.
3. `npm run gui` ile CAD yükleyiciyi açın.
4. DWG veya DXF dosyanızı seçin.
5. "Simülasyona Hazırla" işlemini çalıştırın.
6. Web arayüzünü `npm run dev` veya GUI içindeki başlatma butonu ile açın.
7. Dijital mağazadan seramik ve diğer ürünleri envantere ekleyin.
8. Yüzey editöründe zemin, seçili iç duvar veya tüm duvarlar için kaplama ayarlarını yapın.
9. Bölge ekleyerek WC arkası, duş önü veya lavabo arkası gibi farklı seramik uygulamaları tanımlayın.
10. Kapı, pencere veya niş boşluklarını kontrol edin.
11. Üst menüdeki CAD panelinden ham çizimi inceleyin ve gerekirse simülasyon içinde çizgi gizleme/taşıma veya boşluk önerisi yapın.
12. Sonuç panelinden metrekare, gerekli seramik adedi, kesim planı, fire ve artan parça önerilerini kontrol edin.

## CAD Kontrol Paneli

CAD paneli, `public/current_building.json` içindeki ham çizim katmanlarını 2D olarak gösterir.

Panelde:

- Duvar, kapı, zemin ızgara ve dekor katmanları açılıp kapatılabilir.
- Çizgiler seçilebilir.
- Seçili çizginin nokta sayısı, ölçüsü ve yaklaşık uzunluğu görülebilir.
- Seçili çizgi simülasyon içinde taşınabilir veya gizlenebilir.
- Seçili çizgiden kapı/pencere boşluğu önerisi üretilebilir.

Bu düzenlemeler DWG dosyasının kendisini değiştirmez; simülasyon üzerinde kontrol ve düzeltme katmanı olarak çalışır.

## Bilinen Varsayımlar

- Ürün kataloğu canlı mağaza API'sinden değil, yerel `public/catalog.json` dosyasından okunur.
- Geliştirme sunucusunda aktif CAD ve katalog verileri `public/` klasöründen servis edilir; `dist/` sadece build çıktısıdır.
- DWG dosyası okumak için LibreDWG (`dwg2dxf`), ODA File Converter veya `aspose-cad`'dan biri gerekir; öncelik sırası bu sıradadır.
- DXF dosyaları `ezdxf` ile doğrudan okunabilir.
- Temizlik sonrası `node_modules` klasörü yoktur; ilk çalıştırmadan önce `npm install` yapılmalıdır.
- CAD'den katman bilgisi güvenilir gelmezse sistem geometri tabanlı fallback sınıflandırma kullanır.
- CAD panelindeki düzenlemeler kaynak DWG/DXF dosyasını fiziksel olarak değiştirmez.

## Doğrulama

Python dosyalarını sözdizimi açısından kontrol etmek için:

```powershell
python -m py_compile cad_loader_gui.py prepare_simulation.py dxf_to_3d.py
```

Web projesinin build alıp almadığını kontrol etmek için:

```powershell
npm run build
```

Temiz kaynak yapısında `npm run build` çalıştırmadan önce `npm install` yapılmış olmalıdır.

## Geliştirici Kurulumu (özet)

```powershell
# 1. Node bağımlılıkları
npm install

# 2. Python bağımlılıkları
python -m pip install ezdxf shapely fastapi "uvicorn[standard]" pytest pytest-cov
# (opsiyonel) DWG için: aspose-cad veya https://github.com/LibreDWG/libredwg/releases

# 3. Ortam dosyası
copy .env.example .env

# 4. Geliştirme modunda Vite + FastAPI birlikte (default)
npm run dev
# Sadece Vite (API down debug için):
npm run dev:vite
```

## Ortam Değişkenleri

`.env.example` dosyasından `.env`'e kopyalayıp düzenleyin:

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `VITE_API_BASE_URL` | FastAPI catalog endpoint | `http://localhost:8000` |
| `VITE_APP_VERSION` | Uygulama sürümü (UI'da gösterilir) | `1.0.0` |
| `VITE_MAX_FILE_SIZE_MB` | Geometri JSON için uyarı eşiği | `50` |
| `VITE_CATALOG_PATH` | Statik katalog fallback yolu | `./public/catalog.json` |

## Tema ve UI

- **Tema toggle:** Header'da güneş/ay ikonu — açık ↔ koyu (varsayılan: açık). Tercih `localStorage`'da saklanır.
- **Floating paneller:** Tüm yan paneller (editor, result, camera, launcher, commerce, cad) başlığından sürüklenebilir, sağ alt köşeden boyutlandırılabilir. Konum ve boyut `localStorage`'da kalıcı.
- **Konva CAD overlay:** `Ctrl+K` ile aç/kapat — legacy CAD drawer'a alternatif interaktif görünüm.

## Bilinen Sınırlamalar

- DWG dosyası okumak için LibreDWG (`dwg2dxf`), ODA File Converter, veya `aspose-cad` (en az biri) kurulu olmalı.
- `catalog.json` 500 ürün üzerinde yavaşlama olabilir (virtual scroll henüz yok).
- Tkinter GUI Python 3.8+ gerektirir.
- R3F sahnesinde state senkronizasyonu `window.__seramikcim` bridge ile yapılır; FAZ 3 deferred: tam Zustand birleştirme.

## Doğrulanmış Demo Senaryoları (Validated Scenarios)

| # | Senaryo | Dosya | Beklenen sonuç |
|---|---|---|---|
| 1 | DXF/DWG vektörel | `ornekler/test_a.dwg` | 5.80 m², LibreDWG dönüşüm, kapı+pencere+niş otomatik tespit |
| 2 | OBJ mesh (gerçek banyo) | `Obj/Banyo.obj` (2.27 MB, 37k face) | Section 1.3m, 8 duvar segmenti, alan 5.26 m², 4.4 sn |
| 3 | L-şekilli yapay senaryo | `public/test_complex_bathroom.json` | 8.48 m² gross / 6.53 m² net, 4 açıklık |

Doğrulanmamış / kapsam dışı: opening detection (mesh için placeholder), SKP otomatik dönüşüm, multi-tenant, deploy production. Detay için [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Yayına Alma Kontrol Listesi

- [ ] `.env` dolduruldu
- [ ] `npm run build` başarılı
- [ ] `npm run test` 16+ vitest geçti
- [ ] `npm run test:py` pytest geçti (13+ test)
- [ ] `python -m py_compile dxf_to_3d.py prepare_simulation.py cad_loader_gui.py`
- [ ] `public/current_geometry.json` < 1 MB (büyükse uyarı toast'u gösterir)
- [ ] Tema toggle çalışıyor (light + dark)
- [ ] Karmaşık banyo testi (docs/TEST_COMPLEX_BATHROOM.md) PASS
- [ ] FastAPI `/api/catalog` 200 dönüyor, 10 ürün
- [ ] Console'da production'da error/warn yok (Three.js deprecation uyarıları hariç)

## Test ve Doğrulama

```powershell
npm run build              # Vite build
npm run test               # Vitest (calculator + diğer JS testleri)
npm run test:py            # pytest (geometry compat)
npm run test:all           # ikisi bir arada
python -m py_compile dxf_to_3d.py prepare_simulation.py cad_loader_gui.py
```

Karmaşık banyo senaryosunu görsel olarak test etmek için: [docs/TEST_COMPLEX_BATHROOM.md](docs/TEST_COMPLEX_BATHROOM.md)
