import { subtractSingleRect } from './src/utils/geometry.js';
import { cm } from './state.js';

export function runSimulation({ stateManager }) {
  const state = stateManager.state;
  const settings = {
    groutMm: Number(state.settings.groutMm),
    wastePct: Number(state.settings.wastePct),
    origin: state.settings.origin,
    orientation: state.settings.orientation,
  };
  const regions = buildCalculationRegions(stateManager);
  const byProduct = new Map();
  let totalArea = 0;
  let full = 0;
  let cutPieces = [];
  let cutTiles = [];
  let required = 0;

  regions.forEach((region) => {
    const tile = stateManager.productById(region.productId);
    if (!tile || tile.type !== 'tile') return;
    const regionSettings = {
      ...settings,
      origin: region.origin || settings.origin,
      orientation: region.orientation || settings.orientation,
    };
    const result = dispatchSimulate(region, tile, regionSettings);
    totalArea += result.area;
    full += result.full;
    cutPieces = cutPieces.concat(result.cutPieces);
    cutTiles = cutTiles.concat(result.cutTiles.map((bin) => ({ ...bin, productId: tile.id, region: region.name })));
    // Alan-bazlı required (kullanıcı beklentisi ile uyumlu)
    const grout = settings.groutMm / 1000;
    const effW = (Number(tile.width_m) || 0) + grout;
    const effH = (Number(tile.height_m) || 0) + grout;
    const effArea = effW * effH;
    const areaRequired = effArea > 0 ? Math.ceil(result.area / effArea) : result.required;
    required += areaRequired;
    const entry = byProduct.get(tile.id) || {
      product: tile,
      area: 0,
      full: 0,
      cuts: 0,
      required: 0,
      order: 0,
      orderBoxes: 0,
      regions: [],
    };
    entry.area += result.area;
    entry.full += result.full;
    entry.cuts += result.cutPieces.length;
    entry.required += areaRequired;
    // Alan-bazlı fire: order = ceil(alan × (1+fire%) / karo_alanı)
    entry.order = effArea > 0
      ? Math.ceil(entry.area * (1 + settings.wastePct / 100) / effArea)
      : Math.ceil(entry.required * (1 + settings.wastePct / 100));
    // Kutu hesabı: catalog sqm_per_box değeri varsa kullan
    const sqmPerBox = Number(tile.sqm_per_box) || 0;
    const piecesPerBox = Math.max(1, Number(tile.pieces_per_box) || 1);
    entry.orderBoxes = sqmPerBox > 0
      ? Math.ceil(entry.area * (1 + settings.wastePct / 100) / sqmPerBox)
      : Math.ceil(entry.order / piecesPerBox);
    entry.regions.push({ region, result });
    byProduct.set(tile.id, entry);
    stateManager.ensureInventory(tile.id, region.name, {
      minimumQuantity: 1,
      lastAction: 'simulation-sync',
    });
  });

  // Alan-bazlı global fire: ürün bazında order toplamı
  let order = 0;
  byProduct.forEach((entry) => { order += entry.order; });
  if (order === 0) order = Math.ceil(required * (1 + settings.wastePct / 100));
  const reusable = cutTiles.flatMap((bin, index) => bin.free.map((free) => ({ ...free, bin: index + 1, productId: bin.productId })));
  const suggestions = reusable
    .map((free) => {
      const match = cutPieces.find((piece) => piece.productId === free.productId && piece.w <= free.w + 0.001 && piece.h <= free.h + 0.001);
      return match
        ? `${cm(free.w)}x${cm(free.h)} artik, ${match.region} icin kullanilabilir`
        : `${cm(free.w)}x${cm(free.h)} artik kullanim disi`;
    })
    .slice(0, 12);

  return { regions, byProduct, totalArea, full, cutPieces, cutTiles, required, order, suggestions };
}

// cm() artık state.js'den import ediliyor

function tilePiecesForLength(length, tile, grout, origin) {
  const count = Math.max(1, Math.ceil((length + grout) / (tile + grout)));
  const used = (count * tile) + ((count - 1) * grout);
  let lead = 0;
  if (origin === 'center-bottom') lead = Math.max(0, (used - length) / 2);
  if (origin === 'right-bottom') lead = Math.max(0, used - length);
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * (tile + grout) - lead;
    const end = start + tile;
    const clippedStart = Math.max(0, start);
    const clippedEnd = Math.min(length, end);
    if (clippedEnd > clippedStart + 0.001) pieces.push({ size: clippedEnd - clippedStart, start: clippedStart });
  }
  return pieces;
}

function simulateRect(rect, tile, settings) {
  const grout = settings.groutMm / 1000;
  const tw = settings.orientation === 'vertical' ? tile.height_m : tile.width_m;
  const th = settings.orientation === 'vertical' ? tile.width_m : tile.height_m;
  const areaScale = Number.isFinite(Number(rect.areaScale)) ? Math.max(0.01, Math.min(1, Number(rect.areaScale))) : 1;
  const widths = tilePiecesForLength(rect.w, tw, grout, settings.origin);
  const heights = tilePiecesForLength(rect.h, th, grout, 'left-bottom');
  const cutPieces = [];
  let full = 0;
  widths.forEach((w) => {
    heights.forEach((h) => {
      const isFull = w.size >= tw - 0.001 && h.size >= th - 0.001;
      if (isFull) full += 1;
      else cutPieces.push({ w: w.size, h: h.size, region: rect.name, productId: tile.id });
    });
  });
  const cutTiles = packCutPieces(cutPieces, tw, th);
  const rawRequired = full + cutTiles.length;
  const required = Math.ceil(rawRequired * areaScale);
  return {
    full: Math.floor(full * areaScale),
    cutPieces,
    cutTiles,
    required,
    area: rect.w * rect.h * areaScale,
    widths,
    heights,
    tw,
    th,
    areaScale,
    // Not: simulateRect validPairs döndürmez (widths/heights kullanılır)
  };
}

function packCutPieces(pieces, tileW, tileH) {
  const bins = [];
  const sorted = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h);
  sorted.forEach((piece) => {
    let placed = false;
    for (const bin of bins) {
      const slotIndex = bin.free.findIndex((slot) => piece.w <= slot.w + 0.001 && piece.h <= slot.h + 0.001);
      if (slotIndex >= 0) {
        const slot = bin.free.splice(slotIndex, 1)[0];
        bin.pieces.push(piece);
        const right = { w: slot.w - piece.w, h: piece.h };
        const bottom = { w: slot.w, h: slot.h - piece.h };
        if (right.w > 0.02 && right.h > 0.02) bin.free.push(right);
        if (bottom.w > 0.02 && bottom.h > 0.02) bin.free.push(bottom);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({
        w: tileW,
        h: tileH,
        pieces: [piece],
        free: [
          { w: tileW - piece.w, h: piece.h },
          { w: tileW, h: tileH - piece.h },
        ].filter((slot) => slot.w > 0.02 && slot.h > 0.02),
      });
    }
  });
  return bins;
}

// ── Phase B: Wireframe-driven surface modeli ──────────────────────────────────
// Yeni surface schema:
//   { kind: 'floor', polygon: [[x,z],...], area }  → simulatePolygon
//   { kind: 'wall',  quad: [[x,y,z]×4], width, height, area } → simulateQuad
// Legacy {width, height, areaScale?} → simulateRect (mevcut)

/** Ray casting point-in-polygon. polygon: [[x,z],...] (kapalı veya açık). */
export function pointInPolygon(x, z, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const zi = polygon[i][1];
    const xj = polygon[j][0];
    const zj = polygon[j][1];
    const intersect = ((zi > z) !== (zj > z))
      && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Polygon bbox: [[xmin, zmin], [xmax, zmax]]. */
function polygonBounds(polygon) {
  let xmin = Infinity, zmin = Infinity, xmax = -Infinity, zmax = -Infinity;
  polygon.forEach(([x, z]) => {
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (z < zmin) zmin = z;
    if (z > zmax) zmax = z;
  });
  return { xmin, zmin, xmax, zmax, w: xmax - xmin, h: zmax - zmin };
}

/** Shoelace area (m²). polygon: [[x,z],...] */
function polygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let s = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    s += (polygon[j][0] * polygon[i][1]) - (polygon[i][0] * polygon[j][1]);
  }
  return Math.abs(s) / 2;
}

/**
 * polygonRectClip — polygon ile eksen-hizalı dikdörtgenin kesişim
 * POLYGON'unu döndürür (Sutherland-Hodgman clipping).
 *
 * Tile dikdörtgenini (convex) clip penceresi olarak kullanır.
 * Çıktı: kesişim polygon köşeleri [[x,y],...] (absolute koordinat).
 * Kesişim yoksa boş dizi.
 *
 * Bu, kesik tile'ın GERÇEK kesim şeklini (üçgen/yamuk) verir →
 * görsel ile hesap birebir uyumlu olur.
 */
function polygonRectClip(polygon, rx, ry, rw, rh) {
  if (!polygon || polygon.length < 3) return [];
  const rxMax = rx + rw;
  const ryMax = ry + rh;
  let poly = polygon.map((p) => [p[0], p[1]]);
  if (poly.length > 1) {
    const a = poly[0];
    const b = poly[poly.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) {
      poly = poly.slice(0, -1);
    }
  }
  const lerpX = (a, b, x) => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + t * (b[1] - a[1])];
  };
  const lerpY = (a, b, y) => {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  };
  const clip = (pts, inside, intersect) => {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const cur = pts[i];
      const prev = pts[(i + n - 1) % n];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersect(prev, cur));
      }
    }
    return out;
  };
  poly = clip(poly, (p) => p[0] >= rx, (a, b) => lerpX(a, b, rx));
  if (poly.length < 3) return [];
  poly = clip(poly, (p) => p[0] <= rxMax, (a, b) => lerpX(a, b, rxMax));
  if (poly.length < 3) return [];
  poly = clip(poly, (p) => p[1] >= ry, (a, b) => lerpY(a, b, ry));
  if (poly.length < 3) return [];
  poly = clip(poly, (p) => p[1] <= ryMax, (a, b) => lerpY(a, b, ryMax));
  if (poly.length < 3) return [];
  return poly;
}

/** Polygon alanı (shoelace). polygon: [[x,y],...] açık. */
function polygonShoelaceArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(s) / 2;
}

/** polygon ∩ rect kesişim alanı (m²). */
function polygonRectIntersectionArea(polygon, rx, ry, rw, rh) {
  return polygonShoelaceArea(polygonRectClip(polygon, rx, ry, rw, rh));
}

/** Floor polygon için tile yerleşimi. surface.polygon: [[x,z],...] (kapalı veya açık) */
export function simulatePolygon(surface, tile, settings) {
  const grout = settings.groutMm / 1000;
  const tw = settings.orientation === 'vertical' ? tile.height_m : tile.width_m;
  const th = settings.orientation === 'vertical' ? tile.width_m : tile.height_m;
  const polygon = surface.polygon || [];
  if (polygon.length < 3) {
    return { full: 0, cutPieces: [], cutTiles: [], required: 0, area: 0, tw, th };
  }
  const bb = polygonBounds(polygon);
  const widths = tilePiecesForLength(bb.w, tw, grout, settings.origin);
  const heights = tilePiecesForLength(bb.h, th, grout, 'left-bottom');
  const cutPieces = [];
  // validPairs: tile pozisyonu + isCut bayrağı (TileRegions görselleştirme için)
  const validPairs = [];
  let full = 0;
  // En küçük anlamlı örtüşme eşiği: tile alanının %2'si (gürültü/teğet temas filtrele)
  const COVER_EPS = 0.02;
  widths.forEach((w) => {
    heights.forEach((h) => {
      const rectArea = w.size * h.size;
      if (rectArea <= 0) return;
      // Tile dikdörtgeni ile polygon kesişim (dünya koord — bb offset ekle)
      const rx = bb.xmin + w.start;
      const ry = bb.zmin + h.start;
      const clipPts = polygonRectClip(polygon, rx, ry, w.size, h.size);
      const inter = polygonShoelaceArea(clipPts);
      const coverage = inter / rectArea;
      if (coverage < COVER_EPS) return; // ihmal edilebilir → tile yok
      // Tam tile: grid-tam (size≈tw,th) VE polygon-tam (coverage≈1)
      const gridFull = w.size >= tw - 0.001 && h.size >= th - 0.001;
      const isFull = gridFull && coverage > 0.999;
      if (isFull) full += 1;
      else cutPieces.push({ w: w.size, h: h.size, region: surface.name, productId: tile.id });
      // Kesik tile gerçek şekli (tile-local 0..size)
      const clipLocal = (!isFull && clipPts.length >= 3)
        ? clipPts.map(([px, py]) => [px - rx, py - ry])
        : null;
      validPairs.push({
        w: { start: w.start, size: w.size },
        h: { start: h.start, size: h.size },
        isCut: !isFull,
        clip: clipLocal,
      });
    });
  });
  const cutTiles = packCutPieces(cutPieces, tw, th);
  const required = full + cutTiles.length;
  const area = Number.isFinite(surface.area) ? Number(surface.area) : polygonArea(polygon);
  return { full, cutPieces, cutTiles, required, area, tw, th, areaScale: 1, validPairs };
}

/**
 * quadToPolygon2D — 3D wall quad'ı 2D UV koordinatlarına dönüştürür.
 *
 * Quad: [v0, v1, v2, v3] (3D köşeler).
 *   v0,v1 = alt kenar (sol→sağ)
 *   v2,v3 = üst kenar (sağ→sol)
 *
 * Çıktı: [(u,v),...] sırasıyla v0,v1,v2,v3'ün UV projeksiyonu + kapanış.
 * u = sol kenardan yatay mesafe (duvar genişliği yönü)
 * v = alt kenardan dikey mesafe (duvar yüksekliği yönü)
 *
 * Eğri/parçalı duvarlarda quad'ın 4 köşesi dikdörtgen oluşturmuyorsa
 * (örn. eğimli üst kenar), elde edilen polygon gerçek duvar şeklini yansıtır.
 */
export function quadToPolygon2D(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return null;
  const [v0, v1, v2, v3] = quad;
  // U yönü vektörü: v0→v1 (alt kenar)
  const ux = v1[0] - v0[0];
  const uy = v1[1] - v0[1];
  const uz = v1[2] - v0[2];
  const uLen = Math.hypot(ux, uy, uz);
  if (uLen < 1e-6) return null;
  const uHat = [ux / uLen, uy / uLen, uz / uLen];
  // V yönü: v0→v3 (sol kenar — dikey)
  const vx = v3[0] - v0[0];
  const vy = v3[1] - v0[1];
  const vz = v3[2] - v0[2];
  // V'yi U'ya ortogonalleştir (Gram-Schmidt)
  const dotVU = vx * uHat[0] + vy * uHat[1] + vz * uHat[2];
  const vOrtho = [vx - dotVU * uHat[0], vy - dotVU * uHat[1], vz - dotVU * uHat[2]];
  const vLen = Math.hypot(vOrtho[0], vOrtho[1], vOrtho[2]);
  if (vLen < 1e-6) return null;
  const vHat = [vOrtho[0] / vLen, vOrtho[1] / vLen, vOrtho[2] / vLen];
  // Her köşeyi (u,v)'ye projekte et — v0'a göreli
  const toUV = (p) => {
    const dx = p[0] - v0[0];
    const dy = p[1] - v0[1];
    const dz = p[2] - v0[2];
    return [
      dx * uHat[0] + dy * uHat[1] + dz * uHat[2],
      dx * vHat[0] + dy * vHat[1] + dz * vHat[2],
    ];
  };
  const polygon = [toUV(v0), toUV(v1), toUV(v2), toUV(v3)];
  polygon.push([...polygon[0]]); // kapanış
  return polygon;
}

/**
 * simulateQuad — Duvar yüzeyi tile simülasyonu (polygon-tabanlı).
 *
 * Tek birleşik tile grid: tüm duvar üzerinde tile'lar yerleştirilir,
 * ardından her tile'ın merkezi şu kontrollerden geçer:
 *  1. Duvar polygon'u içinde mi? (eğri/parçalı duvarlar için)
 *  2. Herhangi bir açıklık (kapı/pencere) içinde mi?
 *
 * surface.polygon2D: [[u,v],...] — duvar şekli (yoksa rect varsayılır)
 * surface.openings: [{x,y,w,h}] — duvar-yerel koordinatlarda dışlanacak bölgeler
 */
export function simulateQuad(surface, tile, settings) {
  const grout = settings.groutMm / 1000;
  const tw = settings.orientation === 'vertical' ? tile.height_m : tile.width_m;
  const th = settings.orientation === 'vertical' ? tile.width_m : tile.height_m;
  const width = Number(surface.width || 0);
  const height = Number(surface.height || 0);
  if (width <= 0.02 || height <= 0.02) {
    return { full: 0, cutPieces: [], cutTiles: [], required: 0, area: 0, tw, th, validPairs: [] };
  }
  // Duvar şekli: polygon2D varsa kullan, yoksa rect varsay
  const wallPolygon = Array.isArray(surface.polygon2D) && surface.polygon2D.length >= 3
    ? surface.polygon2D
    : null;
  // Açıklıklar: kapı, pencere, özel bölge alanları (rect ya da polygon)
  const exclusions = (surface.openings || []).filter(
    (op) => (Number(op.w) || 0) > 0.005 && (Number(op.h) || 0) > 0.005,
  );

  const widths = tilePiecesForLength(width, tw, grout, settings.origin);
  const heights = tilePiecesForLength(height, th, grout, 'left-bottom');
  const cutPieces = [];
  const validPairs = [];
  let full = 0;
  let wallArea = 0;
  const COVER_EPS = 0.02; // tile alanının %2'sinden az örtüşme → yok say

  widths.forEach((w) => {
    heights.forEach((h) => {
      const rectArea = w.size * h.size;
      if (rectArea <= 0) return;
      const cx = w.start + w.size / 2;
      const cy = h.start + h.size / 2;

      // 1. Açıklık içinde mi? (merkez testi — açıklıklar dikdörtgen)
      const inExclusion = exclusions.some((op) => {
        const ox = Number(op.x) || 0;
        const oy = Number(op.y) || 0;
        const ow = Number(op.w) || 0;
        const oh = Number(op.h) || 0;
        return cx >= ox && cx <= ox + ow && cy >= oy && cy <= oy + oh;
      });
      if (inExclusion) return;

      // 2. Duvar polygon'u ile kesişim (eğimli/parçalı kenarlarda kısmi tile yakalar)
      let coverage = 1;
      let coveredArea = rectArea;
      let clipLocal = null; // kesik tile gerçek şekli (tile-local 0..size)
      if (wallPolygon) {
        const clipPts = polygonRectClip(wallPolygon, w.start, h.start, w.size, h.size);
        coveredArea = polygonShoelaceArea(clipPts);
        coverage = coveredArea / rectArea;
        if (coverage < COVER_EPS) return; // ihmal edilebilir örtüşme → tile yok
        // Tile-local koordinata çevir (sol-alt köşe origin)
        if (coverage <= 0.999) {
          clipLocal = clipPts.map(([px, py]) => [px - w.start, py - h.start]);
        }
      }

      // Tam tile: grid-tam VE polygon-tam
      const gridFull = w.size >= tw - 0.001 && h.size >= th - 0.001;
      const isFull = gridFull && coverage > 0.999;
      if (isFull) full += 1;
      else cutPieces.push({ w: w.size, h: h.size, region: surface.name || 'Duvar', productId: tile.id });
      validPairs.push({
        w: { start: w.start, size: w.size },
        h: { start: h.start, size: h.size },
        isCut: !isFull,
        clip: clipLocal, // null → tam dikdörtgen; dolu → gerçek kesim şekli
      });
      wallArea += coveredArea; // gerçek kaplanan alan (polygon-clipped)
    });
  });

  const cutTiles = packCutPieces(cutPieces, tw, th);
  const required = full + cutTiles.length;
  // Alan: polygon ya da açıklık varsa hesaplanmış tile alanı, yoksa surface.area
  const useComputedArea = !!wallPolygon || exclusions.length > 0;
  const area = useComputedArea
    ? wallArea
    : (Number.isFinite(surface.area) ? Number(surface.area) : width * height);
  return { full, cutPieces, cutTiles, required, area, tw, th, areaScale: 1, validPairs, wallPolygon };
}

/** Surface.kind'a göre yönlendirme. Backward compat: kind yoksa → simulateRect. */
export function dispatchSimulate(surface, tile, settings) {
  if (surface.kind === 'floor' && Array.isArray(surface.polygon) && surface.polygon.length >= 3) {
    return simulatePolygon(surface, tile, settings);
  }
  if (surface.kind === 'wall' && Number.isFinite(surface.width) && Number.isFinite(surface.height)) {
    return simulateQuad(surface, tile, settings);
  }
  // Legacy yol
  return simulateRect(surface, tile, settings);
}

function rectIntersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function buildCalculationRegions(stateManager) {
  const state = stateManager.state;
  const regions = [];
  const surfaces = stateManager.selectedSurfaces();
  surfaces.forEach((surface) => {
    const surfaceId = surface.id || 'floor';
    const baseOpenings = state.openings.filter((opening) => (
      opening.surfaceId === surfaceId
      && opening.type !== 'niche'
      && shouldSubtractOpening(opening)
    ));
    const overlayRegions = state.regions.filter((region) => region.surfaceId === surfaceId);
    const baseTile = stateManager.productById(state.settings.defaultTileId) || stateManager.tileProducts[0];
    if (baseTile) {
      if ((surface.kind === 'wall' || surface.kind === 'curved')
          && Number.isFinite(surface.width) && Number.isFinite(surface.height)) {
        // ── Duvar (düz/eğri): tek birleşik grid + polygon + açıklık maskesi ──
        // Eğri duvar 'unrolled' (açılmış) düz yüzey gibi sayılır: width=arc uzunluğu.
        // Karmaşık duvarlar için 2D polygon (UV) kullanılır:
        //  - surface.polygon2D varsa doğrudan kullan
        //  - surface.quad varsa quadToPolygon2D ile türet (3D köşeler)
        //  - hiçbiri yoksa rect varsayılır (geriye uyumlu)
        const polygon2D = Array.isArray(surface.polygon2D) && surface.polygon2D.length >= 3
          ? surface.polygon2D
          : (Array.isArray(surface.quad) && surface.quad.length === 4 ? quadToPolygon2D(surface.quad) : null);

        const wallRegion = {
          id: `${surfaceId}-base`,
          surfaceId,
          name: `${surface.name || 'Duvar'} ana kaplama`,
          productId: baseTile.id,
          x: 0, y: 0,
          w: surface.width,
          h: surface.height,
          kind: 'wall',
          width: surface.width,
          height: surface.height,
          // Açıklıklar: kapılar/pencereler + overlay bölge alanları
          openings: [
            ...baseOpenings,
            ...overlayRegions.map((r) => ({ x: r.x || 0, y: r.y || 0, w: r.w || 0, h: r.h || 0 })),
          ],
          areaScale: 1,
          drawRect: { x: 0, y: 0, w: surface.width, h: surface.height },
        };
        if (polygon2D) wallRegion.polygon2D = polygon2D;
        if (surface.quad) wallRegion.quad = surface.quad;
        if (surface.area) wallRegion.area = surface.area;
        regions.push(wallRegion);
      } else {
        // ── Zemin (polygon) veya legacy rect ──────────────────────────────────
        const baseRects = subtractExclusionsFromRect(
          { x: 0, y: 0, w: surface.width, h: surface.height },
          [...baseOpenings, ...overlayRegions],
        );
        const areaScale = surfaceId === 'floor' ? floorAreaScale(stateManager, surface) : 1;
        const useSurfaceShape = (
          surface.kind === 'floor' && Array.isArray(surface.polygon) && surface.polygon.length >= 3
        ) && baseRects.length === 1;
        baseRects.forEach((rect, index) => {
          const region = {
            id: `${surfaceId}-base-${index}`,
            surfaceId,
            name: `${surface.name || 'Zemin'} ana kaplama`,
            productId: baseTile.id,
            ...rect,
            areaScale,
            drawRect: rect,
          };
          if (useSurfaceShape) {
            region.kind = surface.kind;
            if (surface.polygon) region.polygon = surface.polygon;
            if (surface.quad) region.quad = surface.quad;
            if (surface.area) region.area = surface.area;
            region.areaScale = 1;
          }
          regions.push(region);
        });
      }
    }
    overlayRegions.forEach((region) => regions.push({ ...region, productId: region.tileId, drawRect: region }));
    state.openings
      .filter((opening) => opening.surfaceId === surfaceId && opening.type === 'niche')
      .forEach((niche) => {
        const tile = stateManager.productById(state.settings.defaultTileId) || stateManager.tileProducts[0];
        if (tile) {
          regions.push({
            ...niche,
            id: `${niche.id}-niche-back`,
            name: 'Nis arka yuzeyi',
            productId: tile.id,
            drawRect: niche,
          });
        }
      });
  });
  return regions.filter((region) => region.w > 0.02 && region.h > 0.02);
}

function floorAreaScale(stateManager, surface) {
  const trueArea = Number(stateManager.geometryData?.meta?.room_true_area_m2 || 0);
  const rectArea = Number(surface.width || 0) * Number(surface.height || 0);
  if (!trueArea || !rectArea) return 1;
  return Math.max(0.01, Math.min(1, trueArea / rectArea));
}

function shouldSubtractOpening(opening) {
  return Boolean(opening.subtract && (opening.confidence || 'high') === 'high');
}

function subtractExclusionsFromRect(baseRect, exclusions) {
  let remaining = [baseRect];
  exclusions.forEach((exclusion) => {
    remaining = remaining.flatMap((rect) => subtractSingleRect(rect, exclusion));
  });
  return remaining.filter((rect) => rect.w > 0.02 && rect.h > 0.02);
}

// subtractSingleRect() artık src/utils/geometry.js'den import ediliyor
