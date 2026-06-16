/**
 * useLegacyState.js — legacy main.js state bridge için React hook'u
 *
 * main.js renderAll() sonunda window.__seramikcim'i günceller ve
 * 'seramikcim:state' event'i fırlatır. Bu hook event'i dinler ve
 * useSyncExternalStore ile React re-render tetikler.
 *
 * Dönüş objesi:
 *   { seq, sceneData, walls, fixtures, openings, regions, products, simulation, ... }
 *   veya null (legacy state henüz yayınlanmadıysa)
 */
import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  const handler = () => callback();
  window.addEventListener('seramikcim:state', handler);
  return () => window.removeEventListener('seramikcim:state', handler);
}

function getSnapshot() {
  return window.__seramikcim?.seq ?? 0;
}

function getServerSnapshot() {
  return 0;
}

export function useLegacyState() {
  // seq'i dinle → her artışta yeniden render
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return window.__seramikcim || null;
}

export function useFixtures() {
  const s = useLegacyState();
  return s?.fixtures || [];
}

export function useOpenings() {
  const s = useLegacyState();
  return s?.openings || [];
}

export function useRegions() {
  const s = useLegacyState();
  return s?.regions || [];
}

export function useProducts() {
  const s = useLegacyState();
  return s?.products || [];
}

export function useSimulation() {
  const s = useLegacyState();
  return s?.simulation || null;
}
