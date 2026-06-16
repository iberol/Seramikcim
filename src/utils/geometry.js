/**
 * geometry.js — Ortak geometri yardımcıları
 *
 * scene.js, calculation.js ve cad.js tarafından paylaşılan
 * geometri hesaplama fonksiyonları. DRY prensibine uyum için
 * tek kaynaktan sağlanır.
 */

/**
 * İki dikdörtgenin farkını hesapla (CSG subtract).
 * Base rect'ten cut rect'i çıkarır; kalan parçaları döner.
 * @param {{ x: number, y: number, w: number, h: number }} base
 * @param {{ x: number, y: number, w: number, h: number }} cut
 * @returns {Array<{ x: number, y: number, w: number, h: number }>}
 */
export function subtractSingleRect(base, cut) {
  const x1 = Math.max(base.x, cut.x);
  const y1 = Math.max(base.y, cut.y);
  const x2 = Math.min(base.x + base.w, cut.x + cut.w);
  const y2 = Math.min(base.y + base.h, cut.y + cut.h);
  if (x2 <= x1 || y2 <= y1) return [base];

  return [
    { x: base.x, y: base.y, w: x1 - base.x, h: base.h },
    { x: x2, y: base.y, w: (base.x + base.w) - x2, h: base.h },
    { x: x1, y: base.y, w: x2 - x1, h: y1 - base.y },
    { x: x1, y: y2, w: x2 - x1, h: (base.y + base.h) - y2 },
  ].filter((rect) => rect.w > 0.02 && rect.h > 0.02);
}

/**
 * Birden fazla dikdörtgeni bir base rect listesinden çıkar.
 * @param {Array<{ x: number, y: number, w: number, h: number }>} baseRects
 * @param {Array<{ x: number, y: number, w: number, h: number }>} cuts
 * @returns {Array<{ x: number, y: number, w: number, h: number }>}
 */
export function subtractRects(baseRects, cuts) {
  let remaining = [...baseRects];
  cuts.forEach((cut) => {
    remaining = remaining.flatMap((rect) => subtractSingleRect(rect, cut));
  });
  return remaining.filter((rect) => rect.w > 0.02 && rect.h > 0.02);
}

/**
 * Nokta dizisinden bounding box hesapla.
 * @param {Array<[number, number]>} points — [[x, y], ...]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, width: number, height: number }}
 */
export function boundsFromPoints(points) {
  if (!points || !points.length) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1, width: 1, height: 1 };
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}
