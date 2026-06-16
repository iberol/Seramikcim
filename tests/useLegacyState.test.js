/**
 * useLegacyState.test.js — smoke testler (renderHook olmadan)
 *
 * Hook'lar useSyncExternalStore tabanlı; React render gerektirir.
 * @testing-library/react kurulmadığı için sadece:
 *  - export'ların function olduğunu doğrula
 *  - subscribe pattern'inin window event'leri ile çalıştığını doğrula
 */
import { describe, it, expect, vi } from 'vitest';
import {
  useLegacyState,
  useFixtures,
  useOpenings,
  useRegions,
  useProducts,
  useSimulation,
} from '../src/hooks/useLegacyState.js';

describe('useLegacyState exports', () => {
  it('tüm hook\'lar function tipinde export edilir', () => {
    expect(typeof useLegacyState).toBe('function');
    expect(typeof useFixtures).toBe('function');
    expect(typeof useOpenings).toBe('function');
    expect(typeof useRegions).toBe('function');
    expect(typeof useProducts).toBe('function');
    expect(typeof useSimulation).toBe('function');
  });
});

describe('seramikcim:state event mechanism', () => {
  it('window.dispatchEvent bir handler tetikleyebilir (subscribe pattern)', () => {
    const handler = vi.fn();
    window.addEventListener('seramikcim:state', handler);
    window.dispatchEvent(new CustomEvent('seramikcim:state', { detail: { seq: 1 } }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.seq).toBe(1);
    window.removeEventListener('seramikcim:state', handler);
  });

  it('window.__seramikcim doğrudan read edilebilir (getSnapshot pattern)', () => {
    window.__seramikcim = { seq: 5, fixtures: [{ id: 'f1' }] };
    expect(window.__seramikcim.seq).toBe(5);
    expect(window.__seramikcim.fixtures).toHaveLength(1);
    delete window.__seramikcim;
  });
});
