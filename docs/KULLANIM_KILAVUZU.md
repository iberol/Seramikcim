# Seramikcim — Kullanım Kılavuzu

**Sürüm:** 1.0.0

Bu kılavuz, Seramikcim seramik metraj ve kesim optimizasyonu yazılımının kurulumunu
ve adım adım kullanımını açıklar.

---

## 1. Sistem Gereksinimleri

- **Node.js** 18+ ve **npm**
- **Python** 3.10+ (mesh işleme için: `pip install -r requirements.txt`)
- Modern bir tarayıcı (WebGL destekli — Chrome/Edge/Firefox)

## 2. Kurulum

```bash
# 1) Bağımlılıklar
npm install
pip install -r requirements.txt

# 2) Geliştirme sunucusu
npm run dev          # tarayıcıda http://localhost:5173 açılır
```

Üretim derlemesi: `npm run build` → çıktı `dist/` klasöründe; `npm run preview`
ile önizlenir.

## 3. Model Hazırlama (OBJ)

Hazır demo modeller `Obj/` klasöründedir (cube, 1–5, Banyo, egri). Kendi modelinizi
eklemek için:

```bash
python mesh_to_3d.py Obj/<model_adi>.obj
```

Bu komut `<model_adi>_geometry.json` ve `<model_adi>_mesh.obj` üretir. Yeni model
otomatik olarak üst menüdeki **MODEL** açılır listesine düşer.

> İpucu: OBJ birimi (mm/cm/inch/m) otomatik algılanır; modelin oda yüksekliği
> gerçekçi (≈2.7 m) olmalıdır.

## 4. Arayüz Genel Bakış

- **Üst menü:** MODEL seçimi, kamera görünümleri (**Genel / Üst / Zemin**),
  Hazırla, Ürünler, CAD, PDF.
- **Sol panel (Yüzey Editörü):** kaplanacak yüzeyler, seramik, derz, fire, başlangıç/yön;
  Bölge Ekle; Boşluk/Niş; Eşya Yerleşimi.
- **Orta:** 3B sahne (fareyle döndür/yakınlaştır) + Sahne Kontrolleri (opaklık, ışık).
- **Alt panel:** Kaplanacak m², Gerekli adet, Fireli sipariş, Kesim; envanter, kesim
  planı, ürün dağılımı, uyarılar.

## 5. Adım Adım Kullanım

### 5.1 Model Seçme
Üst menüden **MODEL** listesinden bir oda seçin. Geçiş **sayfa yenilenmeden** olur;
3B mesh, duvarlar ve hesaplar anında güncellenir.

### 5.2 Kaplanacak Yüzeyleri Belirleme
İki yöntem birlikte çalışır:
- **Yüzey Editörü → Yüzey** açılır listesi (toplu seçim):
  - *Zemin* → yalnız zemin
  - *Seçili duvar* → **Duvar** listesinden seçilen tek duvar
  - *Tüm duvarlar* → bütün iç duvarlar
  - *Zemin + duvarlar* → hepsi
- **3B Face Select** (tek tek): sahnede bir yüzeye **tıklayarak** kaplamayı aç/kapat.
  (Kamerayı döndürmek için **sürükleyin** — sürükleme seçim yapmaz.)

Seçim değiştikçe alttaki **Kaplanacak m²** ve adet anında güncellenir.

### 5.3 Seramik, Derz ve Fire
- **Ana Seramik:** karoyu seçin (boyut katalogdan gelir).
- **Derz (mm):** karo araları; etkin karo alanını ve adedi etkiler.
- **Fire %:** kullanıcı fire oranı. Düz desende en az %10 kesim fire'si uygulanır
  (diyagonal %15, balıksırtı %20); girilen değer bu tabandan düşükse taban kullanılır.
- **Başlangıç / Yön:** karo yerleşim başlangıç köşesi ve yönü (yatay/düşey).

### 5.4 Bölge Ekleme (Farklı Seramik)
"WC arkası", "duş önü" gibi bir bölgeye farklı seramik için: ad, seramik ve X/Y/G/Y
(metre) girip **+ Bölge Ekle**. Bölge 3B'de ayrı render edilir ve metraja katkı verir.
Listeden **x** ile silinir.

### 5.5 Boşluk / Niş
Kapı/pencere/niş için tip + X/Y/G/Y (metre) girin. **Düş** açıksa açıklık alanı
kaplama metrajından çıkarılır. **+ Boşluk / Niş** ile eklenir.

### 5.6 Eşya Yerleşimi
Lavabo/WC/duş teknesi/süzgeç seçip X/Z (metre) konum verip **+ Eşyayı Yerleştir**.
3B sahnede ilgili eşya modeli görünür.

### 5.7 Sonuçları Okuma
Alt panel:
- **Kaplanacak m²** — net kaplama alanı (açıklıklar düşülmüş).
- **Gerekli adet** — fire öncesi ham karo adedi.
- **Fireli sipariş** — fire dahil adet ve kutu sayısı.
- **Kesim** — kesilecek karo adedi; **Kesim Planı** sütununda detay.
- **Artan / Uyarı** — yeniden kullanılabilir artık parçalar ve uyarılar.

### 5.8 Kamera Görünümleri
**Genel** (izometrik), **Üst** (kuşbakışı), **Zemin** (zemin odaklı). Fareyle de
serbest döndürme/yakınlaştırma yapılabilir.

### 5.9 Rapor / Çıktı
**PDF** düğmesi tarayıcının yazdır/PDF akışını açar; metraj ve kesim özeti yazdırılabilir.

## 6. Sık Karşılaşılan Durumlar

- **Mesh görünmüyor / yanlış:** modeli `python mesh_to_3d.py` ile yeniden üretin;
  Vite önbelleğini temizleyin (`node_modules/.vite` silip `npm run dev`).
- **Kaplanacak m² 0:** Yüzey Editörü'nde en az bir yüzey seçili olmalı (örn. "Zemin
  + duvarlar").
- **3B sahne donarsa:** sayfayı yeni sekmede açın (WebGL bağlam sınırı).

## 7. Komut Özeti

| Komut | İşlev |
|-------|-------|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm test` | JS birim testleri |
| `npm run test:py` | Python testleri |
| `python mesh_to_3d.py Obj/X.obj` | Model geometrisi üret |
