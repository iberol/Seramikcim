/**
 * simulationLifecycle.js — Surface editor hesaplama lifecycle channel
 *
 * State: 'idle' | 'calculating' | 'success' | 'warning' | 'error' | 'stale'
 *
 * Dedupe: aynı state + payload key 2 sn içinde tekrar set edilirse ignore.
 * Custom event: 'seramikcim:sim-state' { detail: { state, payload, ts } }
 */
const EVENT_NAME = 'seramikcim:sim-state';
const DEDUPE_MS = 2000;

let current = { state: 'idle', payload: null, ts: 0 };
let lastKey = null;
let lastKeyTs = 0;

function buildKey(state, payload) {
  let p = '';
  try {
    p = payload ? JSON.stringify(payload) : '';
  } catch {
    p = '';
  }
  return `${state}|${p}`;
}

export function getSimState() {
  return { ...current };
}

export function setSimState(next, payload = null) {
  const key = buildKey(next, payload);
  const now = Date.now();
  if (key === lastKey && now - lastKeyTs < DEDUPE_MS) {
    return false;
  }
  lastKey = key;
  lastKeyTs = now;
  current = { state: next, payload, ts: now };
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ...current } }));
  } catch {
    /* SSR / non-browser ignore */
  }
  return true;
}

export function subscribeSimState(handler) {
  const wrapped = (ev) => handler(ev.detail);
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

/** Test/reset için — dedupe state'i temizler. */
export function _resetSimLifecycle() {
  current = { state: 'idle', payload: null, ts: 0 };
  lastKey = null;
  lastKeyTs = 0;
}
