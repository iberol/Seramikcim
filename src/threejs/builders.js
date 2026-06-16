/**
 * builders.js — scene.js'ten port edilmiş pure helper fonksiyonları
 *
 * R3F bileşenleri tarafından kullanılır. Three.js objelerini oluştururken
 * import edilen `THREE` parametre olarak alınır (R3F'in `useThree` ile
 * sağlanan instance ile uyumlu kalmak için).
 */

import { logger } from '../utils/logger.js';

export function boundsFromPoly(poly) {
  if (!poly?.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, depth: 0 };
  }
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
}

export function normalizeRoomPolygon(poly) {
  if (!Array.isArray(poly) || !poly.length) return [];
  const cleaned = poly.filter(
    (point, index) =>
      index === 0 ||
      point[0] !== poly[index - 1][0] ||
      point[1] !== poly[index - 1][1],
  );
  if (!cleaned.length) return [];
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) cleaned.push([...first]);
  return cleaned;
}

export function subtractSingleRect(base, cut) {
  const x1 = Math.max(base.x, cut.x);
  const y1 = Math.max(base.y, cut.y);
  const x2 = Math.min(base.x + base.w, cut.x + cut.w);
  const y2 = Math.min(base.y + base.h, cut.y + cut.h);
  if (x2 <= x1 || y2 <= y1) return [base];
  return [
    { x: base.x, y: base.y, w: x1 - base.x, h: base.h },
    { x: x2, y: base.y, w: base.x + base.w - x2, h: base.h },
    { x: x1, y: base.y, w: x2 - x1, h: y1 - base.y },
    { x: x1, y: y2, w: x2 - x1, h: base.y + base.h - y2 },
  ].filter((rect) => rect.w > 0.02 && rect.h > 0.02);
}

export function subtractRects(baseRects, cuts) {
  let remaining = [...baseRects];
  (cuts || []).forEach((cut) => {
    remaining = remaining.flatMap((rect) => subtractSingleRect(rect, cut));
  });
  return remaining.filter((rect) => rect.w > 0.02 && rect.h > 0.02);
}

/**
 * deriveSceneData — geometryData (current_geometry.json) → sahne parametreleri.
 * Pure: yalnızca veri dönüştürür, Three.js bağımlılığı yoktur.
 */
export function deriveSceneData(geometryData) {
  const meta = geometryData?.meta || {};
  const unitToMeters = Number(meta.scale_factor_to_meters) || 0.01;
  const wallHeight =
    meta.ceiling_height_m > 0.5 && meta.ceiling_height_m < 8.0
      ? meta.ceiling_height_m
      : 2.6;
  const wallThickness =
    meta.wall_thickness_m > 0.05 && meta.wall_thickness_m < 0.8
      ? meta.wall_thickness_m
      : 0.13;
  const rawPoly = geometryData?.room_outline?.[0] || [];
  const roomPolygon = normalizeRoomPolygon(rawPoly);
  const usedFallback = !roomPolygon.length;
  if (usedFallback) {
    logger.warn(
      '[builders.deriveSceneData] room_outline boş, fallback 1×1 polygon kullanılıyor. ' +
        'current_geometry.json kontrol edin.',
    );
  }
  const fallbackPoly = roomPolygon.length
    ? roomPolygon
    : [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const roomBounds = boundsFromPoly(fallbackPoly);
  const roomWidth = roomBounds.width;
  const roomDepth = roomBounds.depth;
  const roomWidthM = roomWidth * unitToMeters;
  const roomDepthM = roomDepth * unitToMeters;
  const roomCenterUnits = {
    x: (roomBounds.minX + roomBounds.maxX) / 2,
    y: (roomBounds.minY + roomBounds.maxY) / 2,
  };

  const base = {
    meta,
    unitToMeters,
    wallHeight,
    wallThickness,
    roomPolygon: fallbackPoly,
    roomBounds,
    roomWidthM,
    roomDepthM,
    roomCenterUnits,
    halfW: roomWidthM / 2,
    halfD: roomDepthM / 2,
    usedFallback,
  };
  // FAZ 8: walls'ı sceneData içine dahil et — Openings/Fixtures/TileRegions için
  base.walls = makeWallSegments(base);
  return base;
}

/**
 * makeWallSegments — oda polygon'undan duvar segmentleri (R3F için).
 *
 * Her segment: { id, position [m,m,m], rotationY (rad), width (m), height (m) }
 * R3F tarafında <mesh position rotation> ile doğrudan kullanılabilir.
 */
export function makeWallSegments(sceneData) {
  const { roomPolygon, roomCenterUnits, unitToMeters, wallHeight } = sceneData;
  const segments = [];
  const toWorld = (point) => [
    (point[0] - roomCenterUnits.x) * unitToMeters,
    0,
    (point[1] - roomCenterUnits.y) * unitToMeters,
  ];

  for (let i = 0; i < roomPolygon.length - 1; i += 1) {
    const a = roomPolygon[i];
    const b = roomPolygon[i + 1];
    const [ax, , az] = toWorld(a);
    const [bx, , bz] = toWorld(b);
    const dx = bx - ax;
    const dz = bz - az;
    const width = Math.hypot(dx, dz);
    if (width < 0.03) continue;
    const rotationY = -Math.atan2(dz, dx);
    segments.push({
      id: `wall-${segments.length}`,
      kind: 'wall',
      name: `Duvar ${segments.length + 1}`,
      width,
      height: wallHeight,
      position: [(ax + bx) / 2, wallHeight / 2, (az + bz) / 2],
      rotationY,
      start: [ax, 0, az],
      end: [bx, 0, bz],
    });
  }

  return segments;
}
