# Doçentlik Başvurusu — "Yazılım Üreticiliği" Kanıt Dosyası (TASLAK)

> **TASLAKTIR.** Köşeli parantezli `[...]` alanları başvuran doldurur. Doçentlik
> başvuru kategorisi, puanlama ve kanıt biçimi için **YÖK doçentlik kriterleri** ve
> başvuranın **temel alanı** esas alınmalıdır; bu dosya teknik kanıtları derler.
> Akademik dürüstlük gereği, yazılımın hazırlanmasında alınan yapay zekâ destekli
> kod yardımının kurum/YÖK politikası uyarınca **şeffaf biçimde beyan edilmesi**
> önerilir (bu depo git geçmişinde yardım izleri kayıtlıdır).

---

## 1. Başvuran ve Eser

| Alan | Değer |
|------|-------|
| Ad Soyad / Unvan | [AD SOYAD], [UNVAN] |
| Kurum / Bölüm | [..................] |
| Temel alan / başvuru kategorisi | [..................] |
| Eser adı | Seramikcim — Seramik Metraj, Fire ve Kesim Optimizasyonu Simülatörü |
| Sürüm / tarih | 1.0.0 / [2026] |
| Erişim | GitHub: [repo URL]  •  Sürüm etiketi: `v1.0.0` (commit `2d56553`) |

## 2. Özet (Beyan Cümlesi)

> "*Seramikcim v1.0.0*, tarafımdan tasarlanıp geliştirilen; 3B oda modelinden iç
> yüzeyleri otomatik tespit ederek seramik metrajı, fire ve kesim optimizasyonu
> yapan özgün bir bilgisayar yazılımıdır. Yazılım test edilmiş, sürümlenmiş ve
> kamuya açık biçimde yayımlanmıştır."

## 3. Yazılımın Amacı ve Yenilik Değeri

İnşaat/iç mimari uygulamada seramik metrajı elle ve hata payı yüksek yapılır.
Seramikcim, oda 3B modelinden **kaplanacak iç yüzeyleri otomatik belirleyip**
metraj/fire/kesim hesabını standartlaştırır. Yenilik değeri taşıyan özgün
bileşenler:

1. **Ray-cast iç-görünürlük analizi** ile iç/dış yüzey ayrımı (dış kabuk ve kopya
   duvarların otomatik elenmesi) — birim ölçeğinden bağımsız.
2. **Per-yüzey 2B şekil çıkarımı** (eğri/L/açılı/girintili duvarların gerçek poligonu).
3. **Desen-bazlı fire modeli** + artık-parça yeniden kullanımlı **kesim optimizasyonu**.

Teknik ayrıntı: `docs/TEKNIK_RAPOR.md`.

## 4. Başvuranın Katkısı (doldurulacak)

| Bileşen | Katkı düzeyi |
|---------|--------------|
| Kavramsal tasarım / problem tanımı | [tam / kısmi] |
| Algoritma tasarımı (iç-görünürlük, 2B çıkarım, fire, kesim) | [...] |
| Yazılım mimarisi ve kodlama | [...] |
| Test ve doğrulama | [...] |
| Dokümantasyon | [...] |

> Ortak geliştirici/danışman varsa katkı oranlarıyla belirtiniz.

## 5. Teknik Olgunluk Kanıtları

- **Kod tabanı:** ~[N] dosya; Python + JavaScript/React; modüler mimari.
- **Testler:** 169 JavaScript (Vitest) + 141 Python (Pytest) birim testi — **tümü
  geçer**; Playwright uçtan uca senaryolar; üretim derlemesi (`npm run build`) başarılı.
- **Sürüm yönetimi:** Git; etiket `v1.0.0`; zaman damgalı commit geçmişi.
- **Doğrulama:** 8 farklı oda modelinde (küp, L-şekilli, eğri duvarlı, gerçek banyo)
  görsel + sayısal doğrulama (bkz. Teknik Rapor §6).

## 6. Yaygınlaştırma / Erişilebilirlik

- Kamuya açık kaynak kod deposu (GitHub) ve sürüm yayını (release).
- Kullanım kılavuzu (`docs/KULLANIM_KILAVUZU.md`) ve teknik rapor.
- (Planlanıyorsa) Kültür ve Turizm Bakanlığı eser kayıt-tescili —
  `docs/TESCIL_BASVURU_DOSYASI.md`.

## 7. Ekler (kanıt listesi)

- **EK-1:** Teknik Rapor — `docs/TEKNIK_RAPOR.md`
- **EK-2:** Kullanım Kılavuzu — `docs/KULLANIM_KILAVUZU.md`
- **EK-3:** Sürüm Notları — `RELEASE_NOTES.md` (v1.0.0)
- **EK-4:** Test çıktıları — `npm test` (169 geçer) + `npm run test:py` (141 geçer);
  ekran görüntüleri/log eklenebilir (`TEST_REPORT.md`).
- **EK-5:** Git sürüm kanıtı — `git show v1.0.0`, commit `2d56553`.
- **EK-6:** Eser kayıt-tescil başvuru dosyası (varsa tescil belgesi) —
  `docs/TESCIL_BASVURU_DOSYASI.md`.
- **EK-7:** Kaynak kod deposu bağlantısı — [repo URL].
- **EK-8:** Ekran görüntüleri (3B sahne, metraj/kesim panelleri) — [eklenecek].

## 8. Doğrulama Komutları (jüri/değerlendirici için)

```bash
npm install && pip install -r requirements.txt
npm test            # 169 JS testi
npm run test:py     # 141 Python testi
npm run build       # üretim derlemesi
npm run dev         # canlı uygulama (http://localhost:5173)
```

---

> Bu dosya teknik kanıtları derler; resmî doçentlik beyan/forma uyarlanması ve
> kategori-puan eşlemesi başvuran sorumluluğundadır.
