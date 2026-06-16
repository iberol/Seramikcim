/**
 * cadGeometry.js — CAD panel geometri yardımcıları
 *
 * CadPanel.jsx'ten çıkarıldı. Saf hesaplama fonksiyonları —
 * React bağımlılığı yok, test edilebilir.
 */

/**
 * Polygon noktalarını Konva'nın beklediği düz dizi formatına çevirir.
 * [[x0,y0],[x1,y1],...] → [x0,y0,x1,y1,...]
 * @param {Array<[number,number]>} poly
 * @returns {number[]}
 */
export function flattenPoly(poly) {
  return poly.flatMap((p) => [p[0], p[1]]);
}

/**
 * Building verisinden tüm poligonların sınırlayıcı kutusunu hesaplar.
 * Sıfır boyutlu veri durumunda güvenli bir varsayılan döner.
 *
 * @param {object|null} building - current_building.json verisi
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function computeBounds(building) {
  if (!building) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };

  const polys = [];
  ['walls', 'tiles', 'floor', 'features'].forEach((key) => {
    const items = building[key];
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      if (Array.isArray(item)) polys.push(item);
      else if (Array.isArray(item?.points)) polys.push(item.points);
      else if (Array.isArray(item?.outline)) polys.push(item.outline);
    });
  });

  if (!polys.length) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  polys.forEach((poly) =>
    poly.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }),
  );

  return { minX, maxX, minY, maxY };
}

/**
 * Stage koordinat dönüşümü — veri noktasını ekran koordinatına çevirir.
 * @param {number} x - Veri X koordinatı
 * @param {number} y - Veri Y koordinatı
 * @param {{ scale: number, offsetX: number, offsetY: number }} view
 * @returns {[number, number]}
 */
export function toScreenPoint(x, y, view) {
  return [
    x * view.scale + view.offsetX,
    y * view.scale + view.offsetY,
  ];
}

/**
 * Building verisi için polyline ID üretir.
 * @param {string} layerId
 * @param {number} index
 * @returns {string}
 */
export function makeLineId(layerId, index) {
  return `${layerId}:${index}`;
}

/**
 * Bir katman öğesinin poligon noktalarını alır, override'ı uygular.
 * @param {string} layerId
 * @param {number} index
 * @param {object|null} building
 * @param {object} overrides - { [lineId]: { offsetX, offsetY, hidden } }
 * @returns {Array<[number,number]>}
 */
export function getLinePoly(layerId, index, building, overrides) {
  const raw = (() => {
    const items = building?.[layerId];
    if (!Array.isArray(items)) return [];
    const item = items[index];
    if (Array.isArray(item)) return item;
    if (Array.isArray(item?.points)) return item.points;
    if (Array.isArray(item?.outline)) return item.outline;
    return [];
  })();

  const id = makeLineId(layerId, index);
  const ov = overrides[id];
  if (ov && (ov.offsetX || ov.offsetY)) {
    return raw.map(([x, y]) => [x + (ov.offsetX || 0), y + (ov.offsetY || 0)]);
  }
  return raw;
}

/**
 * Otomatik sığdır view hesabı — içerik bounds'u stage'e sığdırır.
 * @param {{ minX,maxX,minY,maxY }} bounds
 * @param {number} stageWidth
 * @param {number} stageHeight
 * @param {number} [padding=20]
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function computeFitView(bounds, stageWidth, stageHeight, padding = 20) {
  const innerW = stageWidth - padding * 2;
  const innerH = stageHeight - padding * 2;
  const dataW = bounds.maxX - bounds.minX || 1;
  const dataH = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(innerW / dataW, innerH / dataH);
  return {
    scale,
    offsetX: padding - bounds.minX * scale,
    offsetY: padding - bounds.minY * scale,
  };
}
