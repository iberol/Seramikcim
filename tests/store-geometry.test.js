/**
 * store-geometry.test.js — geometrySlice testleri (fetch mock'lu)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { createGeometrySlice } from '../src/store/slices/geometrySlice.js';

function makeStore() {
  return create((set, get) => ({
    ...createGeometrySlice(set, get),
  }));
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('loadGeometry', () => {
  it('current_geometry.json başarılı → geometry set edilir', async () => {
    const fakeGeo = { meta: { source: 'test', scale_factor_to_meters: 0.01 }, room_outline: [[]] };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => fakeGeo })   // geometry
      .mockResolvedValueOnce({ ok: true, json: async () => ({ walls: [] }) }); // building
    const s = makeStore();
    await s.getState().loadGeometry();
    expect(s.getState().geometry).toEqual(fakeGeo);
    expect(s.getState().geometryLoading).toBe(false);
    expect(s.getState().geometrySignature).toContain('test');
  });

  it('current başarısız → banyo fallback denenir', async () => {
    const fakeFallback = { meta: { source: 'banyo_fallback' }, room_outline: [[]] };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })                              // current_geometry fail
      .mockResolvedValueOnce({ ok: true, json: async () => fakeFallback }) // banyo_geometry
      .mockResolvedValueOnce({ ok: false })                              // current_building fail
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });      // banyo_building
    const s = makeStore();
    await s.getState().loadGeometry();
    expect(s.getState().geometry.meta.source).toBe('banyo_fallback');
  });
});

describe('setGeometry', () => {
  it('geometry doğrudan set edilir + signature hesaplanır', () => {
    const s = makeStore();
    s.getState().setGeometry({ meta: { source: 'manual', wall_height_m: 2.5 } });
    expect(s.getState().geometry.meta.source).toBe('manual');
    expect(s.getState().geometrySignature).toContain('manual');
    expect(s.getState().geometrySignature).toContain('2.5');
  });
});
