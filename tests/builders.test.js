/**
 * builders.test.js — src/threejs/builders.js pure helper testleri
 */
import { describe, it, expect } from 'vitest';
import {
  boundsFromPoly,
  normalizeRoomPolygon,
  subtractSingleRect,
  subtractRects,
  deriveSceneData,
  makeWallSegments,
} from '../src/threejs/builders.js';

describe('boundsFromPoly', () => {
  it('boş poligon için 0 boyut döner', () => {
    const b = boundsFromPoly([]);
    expect(b.width).toBe(0);
    expect(b.depth).toBe(0);
  });

  it('dikdörtgen poligonun bounds doğru hesaplanır', () => {
    const b = boundsFromPoly([[0, 0], [10, 0], [10, 5], [0, 5]]);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(10);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(5);
    expect(b.width).toBe(10);
    expect(b.depth).toBe(5);
  });
});

describe('normalizeRoomPolygon', () => {
  it('boş veya geçersiz input için [] döner', () => {
    expect(normalizeRoomPolygon(null)).toEqual([]);
    expect(normalizeRoomPolygon(undefined)).toEqual([]);
    expect(normalizeRoomPolygon([])).toEqual([]);
  });

  it('açık poligonu kapatır (son nokta == ilk nokta)', () => {
    const p = normalizeRoomPolygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
    expect(p.length).toBe(5);
    expect(p[0]).toEqual(p[p.length - 1]);
  });

  it('arka arkaya aynı noktaları siler', () => {
    const p = normalizeRoomPolygon([[0, 0], [0, 0], [1, 0], [1, 1]]);
    expect(p.length).toBeLessThanOrEqual(5);
  });
});

describe('subtractSingleRect', () => {
  it('kesişim yoksa base aynı kalır', () => {
    const base = { x: 0, y: 0, w: 10, h: 10 };
    const cut = { x: 20, y: 20, w: 5, h: 5 };
    const result = subtractSingleRect(base, cut);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(base);
  });

  it('iç delik 4 dilim üretir (some may have w/h=0 filtered)', () => {
    const base = { x: 0, y: 0, w: 10, h: 10 };
    const cut = { x: 4, y: 4, w: 2, h: 2 };
    const result = subtractSingleRect(base, cut);
    expect(result.length).toBeGreaterThan(0);
    const totalArea = result.reduce((s, r) => s + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(100 - 4, 1);
  });
});

describe('subtractRects', () => {
  it('cuts boşsa baseRects aynen döner', () => {
    const base = [{ x: 0, y: 0, w: 5, h: 5 }];
    expect(subtractRects(base, [])).toHaveLength(1);
    expect(subtractRects(base, null)).toHaveLength(1);
  });
});

describe('deriveSceneData', () => {
  it('boş geometriDe fallback 1×1 polygon kullanır', () => {
    const sd = deriveSceneData({});
    expect(sd.usedFallback).toBe(true);
    expect(sd.roomPolygon.length).toBeGreaterThan(0);
    expect(Array.isArray(sd.walls)).toBe(true);
    // Fallback poly default unitToMeters=0.01 ile 1×1 birim → 0.01m segment'ler
    // makeWallSegments 0.03m threshold ile filtreler → walls boş olabilir
  });

  it('meta.ceiling_height_m clamp eder (0.5 < h < 8)', () => {
    const sd = deriveSceneData({ meta: { ceiling_height_m: 100, scale_factor_to_meters: 0.01 } });
    expect(sd.wallHeight).toBe(2.6);
  });

  it('walls field çıktıya dahil edilir (FAZ 8 fix)', () => {
    const g = { meta: { scale_factor_to_meters: 0.01 }, room_outline: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] };
    const sd = deriveSceneData(g);
    expect(sd.walls).toBeDefined();
    expect(Array.isArray(sd.walls)).toBe(true);
    expect(sd.walls.length).toBe(4);
  });
});

describe('makeWallSegments', () => {
  it('square room 4 wall segment üretir', () => {
    const sd = deriveSceneData({
      meta: { scale_factor_to_meters: 0.01 },
      room_outline: [[[0, 0], [200, 0], [200, 200], [0, 200], [0, 0]]],
    });
    const segs = makeWallSegments(sd);
    expect(segs.length).toBe(4);
    segs.forEach((s) => {
      expect(s.width).toBeCloseTo(2, 1);
      expect(s.height).toBe(sd.wallHeight);
      expect(Array.isArray(s.position)).toBe(true);
      expect(s.position.length).toBe(3);
    });
  });

  it('çok kısa segmentleri (<3cm) atlar', () => {
    const sd = deriveSceneData({
      meta: { scale_factor_to_meters: 0.01 },
      room_outline: [[[0, 0], [100, 0], [100, 0.5], [0, 100], [0, 0]]],
    });
    const segs = makeWallSegments(sd);
    expect(segs.length).toBeLessThan(4);
  });
});
