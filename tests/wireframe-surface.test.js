/**
 * wireframe-surface.test.js — Phase B calculation surface model
 *
 * Test çıkış noktaları:
 * - pointInPolygon: ray casting doğru
 * - simulatePolygon: floor için bbox grid + filter
 * - simulateQuad: wall için width × height grid
 * - dispatchSimulate: kind dispatch + legacy fallback
 */
import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  simulatePolygon,
  simulateQuad,
  dispatchSimulate,
} from '../calculation.js';

const tile60x60 = {
  id: 'tile-1',
  type: 'tile',
  width_m: 0.6,
  height_m: 0.6,
  pieces_per_box: 4,
};

const defaultSettings = {
  groutMm: 3,
  wastePct: 5,
  origin: 'left-bottom',
  orientation: 'horizontal',
};

describe('pointInPolygon', () => {
  const square = [[0, 0], [3, 0], [3, 2], [0, 2]];

  it('iç nokta true döner', () => {
    expect(pointInPolygon(1.5, 1, square)).toBe(true);
  });

  it('dış nokta false döner', () => {
    expect(pointInPolygon(5, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 1, square)).toBe(false);
  });

  it('L-shape concave polygon', () => {
    const L = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2]];
    expect(pointInPolygon(0.5, 0.5, L)).toBe(true);   // alt sol
    expect(pointInPolygon(2, 0.5, L)).toBe(true);     // alt sağ
    expect(pointInPolygon(2, 1.5, L)).toBe(false);    // L'nin oyuk kısmı
  });
});

describe('simulatePolygon', () => {
  it('3×2 zemin kare → tile count > 0', () => {
    const surface = {
      kind: 'floor',
      name: 'Zemin',
      polygon: [[0, 0], [3, 0], [3, 2], [0, 2]],
      area: 6.0,
    };
    const r = simulatePolygon(surface, tile60x60, defaultSettings);
    expect(r.required).toBeGreaterThan(0);
    expect(r.area).toBe(6.0);
    expect(r.areaScale).toBe(1);  // exact, no scale
  });

  it('boş polygon → required 0', () => {
    const surface = { kind: 'floor', polygon: [], area: 0 };
    const r = simulatePolygon(surface, tile60x60, defaultSettings);
    expect(r.required).toBe(0);
  });

  it('L-shape polygon dış oyuk hariç tile sayar', () => {
    const surfaceL = {
      kind: 'floor',
      name: 'L-zemin',
      polygon: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2]],
      area: 4.0,  // 3×1 + 1×1 = 4
    };
    const surfaceRect = {
      kind: 'floor',
      name: 'Rect',
      polygon: [[0, 0], [3, 0], [3, 2], [0, 2]],
      area: 6.0,
    };
    const rL = simulatePolygon(surfaceL, tile60x60, defaultSettings);
    const rRect = simulatePolygon(surfaceRect, tile60x60, defaultSettings);
    expect(rL.required).toBeLessThan(rRect.required);
  });
});

describe('simulateQuad', () => {
  it('3m × 2.5m duvar → tile count > 0', () => {
    const surface = {
      kind: 'wall',
      name: 'Duvar 1',
      width: 3.0,
      height: 2.5,
      area: 7.5,
    };
    const r = simulateQuad(surface, tile60x60, defaultSettings);
    expect(r.required).toBeGreaterThan(0);
    expect(r.area).toBe(7.5);
    expect(r.areaScale).toBe(1);
  });

  it('çok küçük yüzey → 0 tile', () => {
    const surface = { kind: 'wall', width: 0.01, height: 0.01, area: 0 };
    const r = simulateQuad(surface, tile60x60, defaultSettings);
    expect(r.required).toBe(0);
  });

  it('cutPieces non-tam bölünür duvarda > 0', () => {
    const surface = {
      kind: 'wall',
      name: 'Duvar L',
      width: 1.7,  // 60cm tile'a tam bölünmez
      height: 2.5,
      area: 4.25,
    };
    const r = simulateQuad(surface, tile60x60, defaultSettings);
    expect(r.cutPieces.length).toBeGreaterThan(0);
  });
});

describe('dispatchSimulate', () => {
  it('kind=floor + polygon → simulatePolygon', () => {
    const surface = {
      kind: 'floor',
      name: 'Z',
      polygon: [[0, 0], [3, 0], [3, 2], [0, 2]],
      area: 6.0,
    };
    const r = dispatchSimulate(surface, tile60x60, defaultSettings);
    expect(r.areaScale).toBe(1);
  });

  it('kind=wall + width/height → simulateQuad', () => {
    const surface = { kind: 'wall', width: 3, height: 2.5, area: 7.5 };
    const r = dispatchSimulate(surface, tile60x60, defaultSettings);
    expect(r.areaScale).toBe(1);
  });

  it('legacy region (kind yok, w/h var) → simulateRect (areaScale uygulanır)', () => {
    const legacyRegion = {
      name: 'Legacy',
      w: 3,
      h: 2.5,
      areaScale: 0.8,  // mevcut floorAreaScale çıktısı
    };
    const r = dispatchSimulate(legacyRegion, tile60x60, defaultSettings);
    expect(r.areaScale).toBe(0.8);
    // simulateRect alanı w×h×areaScale ile hesaplar
    expect(r.area).toBeCloseTo(3 * 2.5 * 0.8, 3);
  });
});
