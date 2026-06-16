/**
 * state-manager.test.js — createStateManager smoke testleri (localStorage mock)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createStateManager } from '../state.js';

const baseProducts = [
  { id: 'tile-1', type: 'tile', name: 'Beyaz Mat', width_m: 0.3, height_m: 0.6 },
  { id: 'tile-2', type: 'tile', name: 'Gri Mat', width_m: 0.2, height_m: 0.2 },
  { id: 'wc-1',   type: 'fixture', fixtureKind: 'toilet', name: 'WC Eco' },
  { id: 'sink-1', type: 'fixture', fixtureKind: 'sink',   name: 'Lavabo' },
  { id: 'drain-1',type: 'fixture', fixtureKind: 'drain',  name: 'Sifon' },
];

function buildStateManager(overrides = {}) {
  const meta = { source: 'test', scale_factor_to_meters: 0.01, ...overrides.meta };
  const geometryData = { features: [], doors: [], niches: [], windows: [], frames: [], ...overrides.geometryData };
  return createStateManager({
    meta,
    geometryData,
    products: baseProducts,
    tileProducts: baseProducts.filter((p) => p.type === 'tile'),
    fixtureProducts: baseProducts.filter((p) => p.type === 'fixture'),
    walls: [{ id: 'wall-0', name: 'Duvar 1' }, { id: 'wall-1', name: 'Duvar 2' }],
    floorSurface: { id: 'floor', kind: 'floor', width: 3, height: 3 },
    unitToMeters: 0.01,
    wallHeight: 2.6,
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('createStateManager — smoke', () => {
  it('manager objesi temel alanları içerir', () => {
    const m = buildStateManager();
    expect(m.state).toBeDefined();
    expect(m.products).toHaveLength(5);
    expect(m.tileProducts).toHaveLength(2);
    expect(m.fixtureProducts).toHaveLength(3);
    expect(typeof m.productById).toBe('function');
    expect(typeof m.saveState).toBe('function');
  });

  it('productById doğru ürünü döner', () => {
    const m = buildStateManager();
    expect(m.productById('tile-1').name).toBe('Beyaz Mat');
    expect(m.productById('unknown')).toBeUndefined();
  });

  it('state default ayarlar içerir (settings, ui)', () => {
    const m = buildStateManager();
    expect(m.state.settings).toBeDefined();
    expect(m.state.settings.groutMm).toBe(3);
    expect(m.state.settings.wastePct).toBe(10);
    expect(m.state.settings.orientation).toBe('horizontal');
    expect(m.state.settings.origin).toBe('left-bottom');
  });

  it('state.regions, openings, fixtures dizileri başlangıçta boş veya seed', () => {
    const m = buildStateManager();
    expect(Array.isArray(m.state.regions)).toBe(true);
    expect(Array.isArray(m.state.openings)).toBe(true);
    expect(Array.isArray(m.state.fixtures)).toBe(true);
  });

  it('saveState localStorage\'a yazar', () => {
    const m = buildStateManager();
    m.saveState();
    expect(localStorage.getItem('seramikcim.inventory.sim.v1')).toBeTruthy();
  });
});
