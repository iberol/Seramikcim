import { describe, it, expect } from 'vitest';
import { subtractSingleRect, subtractRects, boundsFromPoints } from '../src/utils/geometry';

describe('geometry.js', () => {
  describe('subtractSingleRect', () => {
    it('returns original rect if cut is outside', () => {
      const base = { x: 0, y: 0, w: 10, h: 10 };
      const cut = { x: 20, y: 20, w: 5, h: 5 };
      const res = subtractSingleRect(base, cut);
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual(base);
    });

    it('splits base rect into pieces if cut intersects', () => {
      const base = { x: 0, y: 0, w: 10, h: 10 };
      const cut = { x: 2, y: 2, w: 6, h: 6 };
      const res = subtractSingleRect(base, cut);
      // It should produce 4 surrounding rectangles
      expect(res.length).toBeGreaterThan(0);
      
      // Top rect
      expect(res).toContainEqual({ x: 2, y: 0, w: 6, h: 2 });
      // Bottom rect
      expect(res).toContainEqual({ x: 2, y: 8, w: 6, h: 2 });
      // Left rect
      expect(res).toContainEqual({ x: 0, y: 0, w: 2, h: 10 });
      // Right rect
      expect(res).toContainEqual({ x: 8, y: 0, w: 2, h: 10 });
    });

    it('filters out extremely thin slices (< 0.02)', () => {
      const base = { x: 0, y: 0, w: 10, h: 10 };
      // Cut almost same size, leaves 0.01 gap on left/top
      const cut = { x: 0.01, y: 0.01, w: 10, h: 10 };
      const res = subtractSingleRect(base, cut);
      // 0.01 gap is < 0.02, so it should be filtered out
      expect(res).toHaveLength(0);
    });
  });

  describe('subtractRects', () => {
    it('subtracts multiple cuts from multiple base rects', () => {
      const baseRects = [{ x: 0, y: 0, w: 10, h: 10 }];
      const cuts = [
        { x: 0, y: 0, w: 5, h: 5 }, // Removes top-left quadrant
        { x: 5, y: 5, w: 5, h: 5 }, // Removes bottom-right quadrant
      ];
      const res = subtractRects(baseRects, cuts);
      // Expecting remaining area to be top-right and bottom-left quadrants
      // The exact pieces might be split, but total area should be 50.
      const totalArea = res.reduce((sum, r) => sum + r.w * r.h, 0);
      expect(totalArea).toBeCloseTo(50);
    });
  });

  describe('boundsFromPoints', () => {
    it('calculates bounding box correctly', () => {
      const points = [[1, 2], [5, 6], [0, 8], [4, 1]];
      const bounds = boundsFromPoints(points);
      expect(bounds).toEqual({
        minX: 0,
        maxX: 5,
        minY: 1,
        maxY: 8,
        width: 5,
        height: 7
      });
    });

    it('handles empty points', () => {
      const bounds = boundsFromPoints([]);
      expect(bounds).toEqual({
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1,
        width: 1,
        height: 1
      });
    });
  });
});
