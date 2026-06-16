/**
 * simulation-lifecycle.test.js — surface editor calc lifecycle channel
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSimState,
  setSimState,
  subscribeSimState,
  _resetSimLifecycle,
} from '../src/ui/simulationLifecycle.js';

beforeEach(() => {
  _resetSimLifecycle();
});

describe('simulationLifecycle', () => {
  it('default state idle', () => {
    expect(getSimState().state).toBe('idle');
  });

  it('setSimState event fire', () => {
    const handler = vi.fn();
    const unsub = subscribeSimState(handler);
    const accepted = setSimState('calculating', { trigger: 'test' });
    expect(accepted).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].state).toBe('calculating');
    expect(handler.mock.calls[0][0].payload.trigger).toBe('test');
    unsub();
  });

  it('aynı state+payload dedupe — 2sn içinde 2. çağrı reddedilir', () => {
    const handler = vi.fn();
    const unsub = subscribeSimState(handler);
    setSimState('success', { products: 3, area: 5.8 });
    const second = setSimState('success', { products: 3, area: 5.8 });
    expect(second).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('farklı state değişimleri ardarda event fire eder', () => {
    const handler = vi.fn();
    const unsub = subscribeSimState(handler);
    setSimState('calculating');
    setSimState('success', { products: 1 });
    setSimState('warning', { reason: 'x' });
    setSimState('error', { message: 'oops' });
    expect(handler).toHaveBeenCalledTimes(4);
    unsub();
  });

  it('subscribe cleanup event\'i durdurur', () => {
    const handler = vi.fn();
    const unsub = subscribeSimState(handler);
    setSimState('success', { a: 1 });
    unsub();
    setSimState('warning', { a: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('aynı state farklı payload accept eder (dedupe key state+payload)', () => {
    const handler = vi.fn();
    const unsub = subscribeSimState(handler);
    setSimState('success', { products: 1 });
    setSimState('success', { products: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
    unsub();
  });
});
