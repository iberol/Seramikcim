/**
 * test_calculator.test.js — pure calculator helpers için Vitest testleri
 */
import { describe, it, expect } from 'vitest';
import {
  tileCount,
  wasteMultiplier,
  computeNetArea,
  cuttingPlanSummary,
} from '../src/modules/calculator.js';

describe('tileCount', () => {
  it('returns 0 when inputs missing', () => {
    expect(tileCount(0, { width_m: 0.3, height_m: 0.3 }).raw).toBe(0);
    expect(tileCount(10, null).raw).toBe(0);
    expect(tileCount(10, { width_m: 0, height_m: 0.3 }).raw).toBe(0);
  });

  it('computes raw count for 10 m² with 30×30 cm tile', () => {
    const result = tileCount(10, { width_m: 0.3, height_m: 0.3 });
    expect(result.raw).toBe(112);  // 10 / 0.09 = 111.11 → ceil
    // withWaste: kullanıcı fire'si 0 olsa da düz (straight) desen için %10
    // minimum kesim fire'si uygulanır: ceil(10 × 1.10 / 0.09) = ceil(122.2) = 123
    expect(result.withWaste).toBe(123);
    expect(result.effectiveWastePct).toBeCloseTo(10, 6);
  });

  it('applies grout to effective tile size', () => {
    // 30×30 + 3 mm grout = 0.303 × 0.303 = 0.0918 m²
    // 10 m² / 0.0918 ≈ 108.93 → 109
    const result = tileCount(10, { width_m: 0.3, height_m: 0.3 }, { groutMm: 3 });
    expect(result.raw).toBe(109);
  });

  it('applies waste percentage', () => {
    // raw 100 + %10 fire = 110
    const result = tileCount(9, { width_m: 0.3, height_m: 0.3 }, { wastePct: 10 });
    expect(result.raw).toBe(100);
    expect(result.withWaste).toBe(110);
  });

  it('computes box count when pieces_per_box provided', () => {
    const result = tileCount(
      10,
      { width_m: 0.3, height_m: 0.3, pieces_per_box: 12 },
      { wastePct: 10 },
    );
    expect(result.boxes).toBe(Math.ceil(result.withWaste / 12));
    expect(result.boxes).toBeGreaterThan(0);
  });

  it('boxes is null when pieces_per_box missing', () => {
    const result = tileCount(10, { width_m: 0.3, height_m: 0.3 });
    expect(result.boxes).toBeNull();
  });
});

describe('wasteMultiplier', () => {
  it('returns higher multiplier for diagonal vs straight', () => {
    expect(wasteMultiplier('straight')).toBe(1.1);
    expect(wasteMultiplier('diagonal')).toBe(1.15);
    expect(wasteMultiplier('herringbone')).toBe(1.2);
  });

  it('defaults to straight for unknown pattern', () => {
    expect(wasteMultiplier('unknown')).toBe(1.1);
    expect(wasteMultiplier(undefined)).toBe(1.1);
  });
});

describe('computeNetArea', () => {
  it('returns gross when no openings', () => {
    expect(computeNetArea(10)).toBe(10);
    expect(computeNetArea(10, [])).toBe(10);
  });

  it('subtracts opening area', () => {
    // 10 m² brüt - 0.8×2 m kapı = 8.4 m²
    expect(computeNetArea(10, [{ w: 0.8, h: 2 }])).toBeCloseTo(8.4);
  });

  it('skips openings with subtract: false (e.g., niches)', () => {
    expect(computeNetArea(10, [{ w: 0.8, h: 2, subtract: false }])).toBe(10);
  });

  it('clamps to 0 if openings exceed gross', () => {
    expect(computeNetArea(1, [{ w: 5, h: 5 }])).toBe(0);
  });

  it('handles multiple openings', () => {
    const net = computeNetArea(20, [
      { w: 0.8, h: 2 },     // 1.6
      { w: 1.2, h: 1.5 },   // 1.8
    ]);
    expect(net).toBeCloseTo(16.6);
  });
});

describe('cuttingPlanSummary', () => {
  it('returns zero summary for empty input', () => {
    const s = cuttingPlanSummary([]);
    expect(s.totalPieces).toBe(0);
    expect(s.uniqueSizes).toBe(0);
    expect(s.totalAreaM2).toBe(0);
  });

  it('counts unique sizes and total pieces', () => {
    const s = cuttingPlanSummary([
      { w: 0.3, h: 0.3, count: 5 },
      { w: 0.3, h: 0.3, count: 3 },
      { w: 0.15, h: 0.3, count: 2 },
    ]);
    expect(s.totalPieces).toBe(10);
    expect(s.uniqueSizes).toBe(2);
    expect(s.totalAreaM2).toBeCloseTo(0.3 * 0.3 * 8 + 0.15 * 0.3 * 2);
  });

  it('treats missing count as 1', () => {
    const s = cuttingPlanSummary([{ w: 0.3, h: 0.3 }]);
    expect(s.totalPieces).toBe(1);
  });
});
