# Seramikcim — UI Audit

Bu doküman mevcut tüm UI bileşenlerini envantere alır, amaç vs. mevcut durumu karşılaştırır ve kullanılabilirlik sorunlarını listeler.

**Kapsam:** 9 ana bileşen (header, launcher, editor, result, camera, commerce, cad, R3F Leva, Konva CAD).

**Tema durumu:** Tek tema (koyu). Renkler `style.css:1-13` arasında `:root` CSS değişkenleriyle tanımlı:
- `--bg: #101216` (arka plan, neredeyse siyah)
- `--text: #f3f1ea` (metin, kırık beyaz)
- `--panel: rgba(20,23,27,0.78)` (yarı saydam panel)
- `--green: #2f9f83`, `--gold: #e7a438`, `--red: #d96c54` (durum renkleri)

---

## Bileşen Envanteri

### 1. Header (Üst Menü)

- **Konum:** [index.html:13-29](../index.html#L13-L29)
- **CSS class:** `.app-header` ([style.css:146](../style.css#L146))
- **Amaç:** Marka, aktif model seçimi, CAD hazırla / ürün yönetimi / CAD / PDF butonları
- **Sorun:**
  - Aktif sekme görsel olarak belirgin değil (`#model-select` plain dropdown)
  - Sağdaki 4 buton (Hazırla / Urun Yonetimi / CAD / PDF) hepsi aynı `.icon-btn` class — ikon yok, sadece metin
  - Sticky değil; mobilde scroll ile kaçar
  - `id="source-label"` mevcut CAD adını gösteriyor, "CAD bekleniyor" placeholder net değil
- **Öncelik:** Orta

### 2. Launcher Panel (CAD Hazırlayıcı)

- **Konum:** [index.html:31-48](../index.html#L31-L48)
- **CSS class:** `.launcher-panel` (gizli, `id="launcher-panel"`)
- **Amaç:** CAD dosya listesi + `prepare_simulation.py` tetikleme
- **Sorun:**
  - Sabit konumda (sol-üst), kullanıcı taşıyamaz
  - X (Kapat) butonu küçük, fokus halkası yok
  - "Hazır dosya listesi yükleniyor..." status mesajı dinamik update'i belli değil
  - Loading state'i sırasında button disable olmaz, çift tıklama riski
- **Öncelik:** Orta

### 3. Editor Panel (Yüzey Editörü, Sağ)

- **Konum:** [index.html:50-142](../index.html#L50-L142)
- **CSS class:** `.editor-panel` ([style.css](../style.css))
- **Amaç:** Yüzey seçimi → ana seramik → derz/fire → başlangıç/yön → bölge / boşluk / fixture ekleme
- **Sorun:**
  - Tek uzun scroll; gruplama yok (Yüzey/Seramik/Boşluk/Bölge/Fixture aynı düz akışta)
  - Sayısal inputlar (Fire %, X/Y/W/H) stepper yok; sadece klavye + scroll
  - "Bölge Ekle", "Boşluk/Niş Ekle", "Eşyayı Yerleştir" formları benzer, görsel ayrım sadece `<div class="divider">`
  - Sabit konumda, kullanıcı taşıyamaz/boyutlandıramaz
  - Çok uzun olduğunda küçük ekranda scroll'da kaybolur
- **Öncelik:** Yüksek (kullanıcı en çok burada çalışır)

### 4. Result Panel (Sonuç, Alt)

- **Konum:** [index.html:144-183](../index.html#L144-L183)
- **CSS class:** `.result-panel`
- **Amaç:** 4 metrik (m², gerekli adet, fireli sipariş, kesim) + 3 grafik + 4 detay liste (envanter, kesim, artan, uyarılar)
- **Sorun:**
  - 4 metrik küçük, dikkat çekmiyor; "—" placeholder göze batar
  - Grafikler (`.bar-chart`) basit div'lerle yapılmış, etiket yok, renk anlamsız
  - 4 detay sütunu dar ekranda sıkışır
  - "Raporu İndir" butonu yok (PDF butonu header'da)
  - Metrik kart tıklanabilir değil — detay görmek için scroll gerekir
- **Öncelik:** Yüksek

### 5. Camera Panel (Görünüm Sekmeleri)

- **Konum:** [index.html:185-189](../index.html#L185-L189)
- **CSS class:** `.camera-panel`
- **Amaç:** Genel / Zemin / Seçili Duvar kamera preset'leri
- **Sorun:**
  - Üç chip-btn, aktif olan görsel olarak belirgin değil
  - Sabit konum (sol-üst), kullanıcı taşıyamaz
  - "Seçili Duvar" sekmesinde hangi duvar seçili belli değil
  - Toolbar değil, kayıp görünüm; 3D sahne üstünde araç çubuğu eksik (görünüm preset, ölçü göster/gizle, kamera reset)
- **Öncelik:** Orta

### 6. Commerce Drawer (Ürün Yönetimi)

- **Konum:** [index.html:191-279](../index.html#L191-L279)
- **CSS class:** `.commerce-drawer` (gizli, `id="commerce-drawer"`)
- **Amaç:** Mağaza, envanter, ürün detayı 3 sekme; ürün arama + ekleme + envanter yönetimi
- **Sorun:**
  - Sağdan slide-in büyük drawer; mobilde tüm ekranı kaplar
  - Sekme geçişi instant; transition yok
  - Filtre alanı (`.commerce-filters`) çok input içeriyor, görsel olarak yoğun
  - "CAD" shortcut butonu drawer üst-sağda; bağlam dışı
  - Ürün kartları grid ama hover state belirsiz
- **Öncelik:** Orta

### 7. CAD Drawer (Legacy CAD Kontrol)

- **Konum:** [index.html:281-322](../index.html#L281-L322)
- **CSS class:** `.cad-drawer` (gizli, `id="cad-panel"`)
- **Amaç:** Ham çizim 2D kontrol, katman toggle, çizgi seç/taşı/gizle, boşluk öner
- **Sorun:**
  - Modal-like overlay; ana sahneyi gizler
  - Toolbar (Sığdır/Geri Al/Sıfırla/X) küçük chip-btn'ler, ikon yok
  - "Seçili çizgi" info kutusu metinsel; görsel feedback yok
  - X/Y taşı inputları stepper yok
  - "Seçiliden Boşluk Öner" butonu seçim yokken disabled olmuyor → toast hata
- **Öncelik:** Orta (FAZ 4'te Konva versiyonu eklendi, ikisi paralel)

### 8. R3F Leva Panel (3D Kontroller)

- **Konum:** [src/components/Scene.jsx:21-31](../src/components/Scene.jsx#L21-L31), [src/components/Room.jsx:14-28](../src/components/Room.jsx#L14-L28)
- **CSS class:** Leva auto (`.leva-c-*`)
- **Amaç:** Sahne (ızgara/eksen/ışık), Oda (duvar/zemin renk, opaklık, görünürlük) Leva ile parametre kontrolü
- **Sorun:**
  - Sağ üstte sabit, kullanıcının commerce-drawer veya editor-panel ile çakışır
  - Türkçe olmayan etiket karışımı ("Görünüm/Sahne" vs "ambientIntensity")
  - Renk picker tema değişiminde reset olmuyor
  - Mobil ekranda dock yer kaplar
- **Öncelik:** Düşük

### 9. Konva CAD Overlay (FAZ 4)

- **Konum:** [src/components/CadPanel.jsx](../src/components/CadPanel.jsx)
- **CSS class:** (Ctrl+K ile açılır, henüz CSS finalize edilmedi)
- **Amaç:** İnteraktif 2D CAD; çoklu seçim, snap-to-grid (5mm), undo/redo (50 adım)
- **Sorun:**
  - Legacy CAD drawer ile dublike işlev — kullanıcı hangisini kullanacağını bilmiyor
  - Default konum/boyut tanımlı değil
  - Klavye kısayolu Ctrl+K dokümente değil
  - Etkileşim (drag/snap/undo) henüz tüm yüzeye uygulanmıyor; sadece walls layer
- **Öncelik:** Orta (FAZ 4 deferred)

---

## Genel Sorunlar (Cross-Cutting)

| Sorun | Etki | Öneri |
|---|---|---|
| Tek tema (koyu) | Erişilebilirlik, kullanıcı tercihi | Light/Dark toggle (ADIM 3a-b) |
| Sabit panel konumları | Mobilde/yan ekrana sığmaz, kullanıcı düzenleyemez | FloatingPanel sistemi (ADIM 3c) |
| İkon yok | Tüm butonlar metinsel; görsel hiyerarşi zayıf | Tabler ikonlar (ADIM 3d) |
| Stepper yok | Sayısal input UX'i zayıf | +/- butonlu input componenti |
| Accordion yok | Editor panel scroll yorucu | Grup başlığı toggle (ADIM 3e) |
| Toast yok | Hatalar sadece console.error | Toast slice (ADIM 5b) |
| ErrorBoundary yok | R3F crash whole-page beyaz | ErrorBoundary (ADIM 5b) |
| `aria-label` eksik | Ekran okuyucu erişilemez | Tüm icon-btn'lere ekle (ADIM 5d) |
| `:focus-visible` ring yok | Klavye kullanıcısı kaybolur | Global `:focus-visible` (ADIM 5d) |
| Tab sırası rastgele | Klavye nav zor | HTML order düzelt (ADIM 5d) |

## Sonraki Adımlar

Bu raporda tespit edilen sorunlar planlanan ADIM 2–5 ile kapatılacak:
- ADIM 2: Duvar render bug (Component 8 — R3F sahnesi)
- ADIM 3: Tema toggle + draggable paneller (1-7 hepsi)
- ADIM 5: Toast/ErrorBoundary/a11y (cross-cutting)
