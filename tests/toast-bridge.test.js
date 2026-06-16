/**
 * toast-bridge.test.js — toastBridge + simulationLifecycle entegrasyonu
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mountSimulationToastBridge,
  unmountSimulationToastBridge,
} from '../src/ui/toastBridge.js';
import { setSimState, _resetSimLifecycle } from '../src/ui/simulationLifecycle.js';

beforeEach(() => {
  document.body.innerHTML = '';
  _resetSimLifecycle();
  vi.useFakeTimers();
  mountSimulationToastBridge();
});

afterEach(() => {
  unmountSimulationToastBridge();
  vi.useRealTimers();
});

describe('toastBridge', () => {
  it('success state → success toast', () => {
    setSimState('success', { products: 3, area: 5.8 });
    const el = document.querySelector('[data-toast-id="sim-success"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/3 ürün/);
    expect(el.textContent).toMatch(/5\.80 m²/);
  });

  it('warning state → warning toast', () => {
    setSimState('warning', { reason: 'no_tile_assigned' });
    const el = document.querySelector('[data-toast-id="sim-warning"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/seramik seçilmedi/);
  });

  it('error state → error toast', () => {
    setSimState('error', { message: 'Test failure' });
    const el = document.querySelector('[data-toast-id="sim-error"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/Test failure/);
  });

  it('calculating toast 1200ms auto-dismiss', () => {
    setSimState('calculating', { trigger: 'test' });
    let el = document.querySelector('[data-toast-id="sim-calculating"]');
    expect(el).toBeTruthy();
    vi.advanceTimersByTime(1500);
    // auto-dismiss tetiklenmiş olmalı (toast-dismissed class + 250ms sonra remove)
    vi.advanceTimersByTime(300);
    el = document.querySelector('[data-toast-id="sim-calculating"]');
    expect(el).toBeNull();
  });

  it('success payload wireframe_reliable=false suffix gösterir', () => {
    setSimState('success', { products: 1, wireframe_reliable: false });
    const el = document.querySelector('[data-toast-id="sim-success"]');
    expect(el.textContent).toMatch(/wireframe ⚠/);
  });

  it('success payload wireframe_reliable=true checkmark', () => {
    setSimState('success', { products: 1, wireframe_reliable: true });
    const el = document.querySelector('[data-toast-id="sim-success"]');
    expect(el.textContent).toMatch(/wireframe ✓/);
  });
});
