/**
 * store-surface.test.js — surfaceSlice testleri
 */
import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { createSurfaceSlice } from '../src/store/slices/surfaceSlice.js';

function makeStore() {
  return create((set, get) => ({
    ...createSurfaceSlice(set, get),
  }));
}

describe('selectSurface', () => {
  it('selectedSurfaceId güncellenir', () => {
    const s = makeStore();
    s.getState().selectSurface('wall-1');
    expect(s.getState().selectedSurfaceId).toBe('wall-1');
  });

  it('default floor', () => {
    expect(makeStore().getState().selectedSurfaceId).toBe('floor');
  });
});

describe('getSurfaceSettings', () => {
  it('boş slice için default values döner', () => {
    const s = makeStore();
    const settings = s.getState().getSurfaceSettings('floor');
    expect(settings.groutMm).toBe(3);
    expect(settings.wastePct).toBe(10);
    expect(settings.origin).toBe('left-bottom');
    expect(settings.orientation).toBe('horizontal');
  });

  it('updateSurfaceSettings sonrası özelleştirilmiş değer', () => {
    const s = makeStore();
    s.getState().updateSurfaceSettings('wall-1', { groutMm: 5 });
    const settings = s.getState().getSurfaceSettings('wall-1');
    expect(settings.groutMm).toBe(5);
    expect(settings.wastePct).toBe(10); // default korunur
  });
});

describe('updateSurfaceSettings', () => {
  it('patch merge edilir, diğer ayarlar korunur', () => {
    const s = makeStore();
    s.getState().updateSurfaceSettings('floor', { groutMm: 7 });
    s.getState().updateSurfaceSettings('floor', { wastePct: 15 });
    const set = s.getState().getSurfaceSettings('floor');
    expect(set.groutMm).toBe(7);
    expect(set.wastePct).toBe(15);
  });
});

describe('resetSurfaceSettings', () => {
  it('belirli yüzey ayarları silinir, default geri döner', () => {
    const s = makeStore();
    s.getState().updateSurfaceSettings('floor', { groutMm: 8 });
    s.getState().resetSurfaceSettings('floor');
    expect(s.getState().getSurfaceSettings('floor').groutMm).toBe(3);
  });
});
