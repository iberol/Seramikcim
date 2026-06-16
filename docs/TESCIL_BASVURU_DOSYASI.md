# Kültür ve Turizm Bakanlığı — Yazılım Eseri Kayıt-Tescil Başvuru Dosyası (TASLAK)

> **ÖNEMLİ — TASLAKTIR.** Bu belge, Telif Hakları Genel Müdürlüğü'ne yapılacak
> *isteğe bağlı kayıt-tescil* başvurusu için **hazırlık taslağıdır**. Köşeli
> parantezli `[...]` alanlar başvuru sahibi tarafından doldurulmalı; resmî form,
> güncel evrak listesi ve ücret bilgisi başvuru anında Bakanlık'ın yürürlükteki
> mevzuatından (5846 sayılı FSEK) teyit edilmelidir. Hukuki beyan ve imzalar
> yalnızca eser sahibi tarafından verilir.

---

## 1. Eser Bilgileri

| Alan | Değer |
|------|-------|
| Eser adı | Seramikcim — Seramik Metraj, Fire ve Kesim Optimizasyonu Simülatörü |
| Eser türü | Bilgisayar programı (FSEK m.2/1 — ilim ve edebiyat eseri) |
| Sürüm | 1.0.0 |
| Programlama dilleri | Python 3, JavaScript (ES Modules), JSX |
| Çatılar/kütüphaneler | React, React Three Fiber/three.js, Zustand, Vite; trimesh, shapely, numpy |
| Oluşturulma yılı | [2025–2026] |
| İlk yayım | GitHub deposu, sürüm etiketi `v1.0.0` |

## 2. Eser Sahibi / Hak Sahibi (doldurulacak)

| Alan | Değer |
|------|-------|
| Ad Soyad | [AD SOYAD] |
| T.C. Kimlik No | [..................] |
| Unvan / Kurum | [..................] |
| Adres | [..................] |
| E-posta / Telefon | [..................] |
| Eser sahipliği oranı | %100 (tek sahip) / [ortaklık varsa belirtiniz] |

## 3. Eserin Tanımı ve Özgünlüğü

Seramikcim, bir ıslak hacim odasının 3B modelinden (OBJ/DXF) **iç duvar ve zemin
yüzeylerini otomatik tespit eden** ve bu yüzeyler için seramik **metrajı, fire ve
kesim optimizasyonu** hesaplayan özgün bir karar destek yazılımıdır.

Özgün teknik katkılar (ayrıntı: `docs/TEKNIK_RAPOR.md`):
1. **İç-yüzey tespiti için ray-cast görünürlük yöntemi** — oda hacmi içinden atılan
   ışınların ilk çarptığı yüzeylerin iç yüzey kabul edilmesi; dış kabuk/kopya
   duvarların otomatik elenmesi (birim ve mesh kalitesinden bağımsız).
2. **Per-yüzey 2B şekil çıkarımı** — her yüzeyin kendi düzlemine projeksiyonu ve
   gerçek poligonunun (eğri/L/açılı/girintili) çıkarılması.
3. **Desen-bazlı minimum fire modeli** ve alan-tabanlı metraj hesabı.
4. **Artık-parça yeniden kullanımıyla kesim optimizasyonu.**

Bu bileşenler özgün olarak tasarlanıp kodlanmıştır; kullanılan açık kaynak
kütüphaneler yalnız altyapı (mesh G/Ç, geometri, render) içindir.

## 4. Başvuruya Eklenecek Belgeler (kontrol listesi)

- [ ] Kayıt-tescil başvuru formu (Bakanlık güncel formu)
- [ ] Eser sahibi kimlik belgesi / beyanı ([T.C. kimlik])
- [ ] **Eserin kopyası** — kaynak kod (dijital ortam/CD veya istenen sayfa örneği).
      Bu depo: `v1.0.0` etiketi; commit `2d56553`. Önerilen kapsam: tüm kaynak
      (`mesh_to_3d.py`, `dxf_to_3d.py`, `src/`, `main.js`, `state.js`,
      `calculation.js`, `tests/`) — üçüncü taraf ikili dosyalar (libredwg) hariç.
- [ ] Mali hak/eser sahipliği beyannamesi (sahiplik %100 ise tek imza)
- [ ] Taahhütname (eserin başvurana ait ve özgün olduğu beyanı)
- [ ] Ücret ödeme dekontu (güncel tarife)
- [ ] (Varsa) çalışır sürüm/ekran görüntüleri ve teknik rapor (`docs/TEKNIK_RAPOR.md`)

## 5. Sürüm/Bütünlük Kanıtı

- Git deposu sürüm etiketi: **v1.0.0**
- Etiketli commit: **2d56553** (sürüm), kök commit **b2bb035**
- Bütünlük: `git log`, `git show v1.0.0` ile doğrulanabilir; her commit zaman
  damgalıdır. (GitHub'a yüklendikten sonra ek olarak yayım tarihi de kanıt oluşturur.)

## 6. Beyan (eser sahibi tarafından doldurulup imzalanır)

> "Yukarıda tanımlanan *Seramikcim v1.0.0* adlı bilgisayar programının özgün eseri
> olduğumu, eser üzerindeki mali ve manevi hakların tarafıma ait olduğunu beyan
> ederim."
>
> Ad Soyad: [..............]   Tarih: [....../....../........]   İmza: __________

---

### Uyarı
Kayıt-tescil, FSEK kapsamında eser üzerindeki hakları **kurmaz**; haklar eserin
oluşturulmasıyla doğar. Kayıt-tescil yalnızca **ispat kolaylığı** sağlar. Güncel
prosedür ve evrak için Telif Hakları Genel Müdürlüğü'nün resmî duyurularını esas
alınız.
