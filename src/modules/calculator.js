/**
 * calculator.js — pure tile calculation functions
 *
 * Legacy calculation.js stateManager'a bağımlıyken bu modül pure'dır:
 * yalnızca parametre alır, sonuç döner. Store'dan habersizdir.
 *
 * Şu an için temel hesaplar; kompleks rejyon hesabı (bin packing, fire
 * önerileri) FAZ 4 ile birlikte calculation.js'ten kademeli port edilecek.
 */

/**
 * tileCount — kaplama alanı için gerekli tam karo adedi.
 *
 * @param {number} surfaceAreaM2 - yüzey alanı (m²)
 * @param {object} tile - { width_m, height_m }
 * @param {object} settings - { groutMm, wastePct }
 * @returns {{ raw: number, withWaste: number, boxes: number|null }}
 */
export function tileCount(surfaceAreaM2, tile, settings = {}) {
  const groutMm = Number(settings.groutMm) || 0;
  const wastePct = Number(settings.wastePct) || 0;
  const pattern = settings.pattern || 'straight';
  const w = Number(tile?.width_m) || 0;
  const h = Number(tile?.height_m) || 0;
  if (!surfaceAreaM2 || surfaceAreaM2 <= 0 || w <= 0 || h <= 0) {
    return { raw: 0, withWaste: 0, boxes: null };
  }
  const effW = w + groutMm / 1000;
  const effH = h + groutMm / 1000;
  const tileArea = effW * effH;
  // Epsilon ile floating-point yuvarlama: 99.9999... → 100, 110.0000001 → 110
  const EPS = 1e-9;
  const raw = Math.ceil(surfaceAreaM2 / tileArea - EPS);
  // Fire, daha doğru sonuç için ALAN üzerinden hesaplanır (raw üzerinden değil).
  // Sebep: raw zaten yuvarlanmış; raw × wastePct uygulamak aşırı sipariş verir.
  // Örnek: 10.1m² / 1m²/tile → raw=11, 11×1.1 → withWaste=13 (yanlış)
  //        10.1×1.1 / 1m²/tile → withWaste=12 (doğru)
  // Desen bazlı minimum fire oranı da burada uygulanır.
  const patternMinWastePct = (wasteMultiplier(pattern) - 1) * 100;
  const effectiveWastePct = Math.max(wastePct, patternMinWastePct);
  const withWaste = Math.ceil((surfaceAreaM2 * (1 + effectiveWastePct / 100)) / tileArea - EPS);
  const piecesPerBox = Number(tile?.pieces_per_box) || null;
  const boxes = piecesPerBox ? Math.ceil(withWaste / piecesPerBox) : null;
  return { raw, withWaste, boxes, effectiveWastePct };
}

/**
 * wasteMultiplier — desen tipine göre tipik fire katsayısı.
 *
 * @param {'straight'|'diagonal'|'herringbone'|string} pattern
 * @returns {number} — 1.0+ aralığında çarpan (1.10 = %10 fire)
 */
export function wasteMultiplier(pattern) {
  switch (pattern) {
    case 'diagonal':
      return 1.15;
    case 'herringbone':
      return 1.2;
    case 'straight':
    default:
      return 1.1;
  }
}

/**
 * computeNetArea — brüt yüzey alanından açıklık alanlarını çıkar.
 *
 * Python tarafı dxf_to_3d.compute_net_area() ile uyumlu:
 * Shapely benzeri davranış (kesişim oranı kullanılır, dışarıdaki
 * açıklıklar etkisiz). Pure: sadece sayı işleme.
 *
 * @param {number} grossAreaM2
 * @param {Array<{w:number,h:number,subtract?:boolean}>} openings
 * @returns {number}
 */
export function computeNetArea(grossAreaM2, openings = []) {
  if (!grossAreaM2) return 0;
  const cut = (openings || [])
    .filter((op) => op?.subtract !== false)
    .reduce((sum, op) => sum + (Number(op.w) || 0) * (Number(op.h) || 0), 0);
  return Math.max(grossAreaM2 - cut, 0);
}

/**
 * cuttingPlanSummary — kesim parçası listesinden özet.
 *
 * @param {Array<{w:number,h:number,count?:number}>} pieces
 * @returns {{ totalPieces:number, uniqueSizes:number, totalAreaM2:number }}
 */
export function cuttingPlanSummary(pieces) {
  const safe = Array.isArray(pieces) ? pieces : [];
  const totalPieces = safe.reduce((sum, p) => sum + Math.max(0, p.count ?? 1), 0);
  const sizes = new Set(safe.map((p) => `${p.w}x${p.h}`));
  const totalAreaM2 = safe.reduce(
    (sum, p) => sum + (p.w || 0) * (p.h || 0) * (p.count || 1),
    0,
  );
  return {
    totalPieces,
    uniqueSizes: sizes.size,
    totalAreaM2,
  };
}
