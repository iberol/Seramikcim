/**
 * useAppStore.js — Zustand merkezi state store
 *
 * Slice mimarisi: her sorumluluk alanı kendi slice'ında.
 * persist middleware ile localStorage; backward compat için legacy
 * state.js ile aynı STORAGE_KEY ('seramikcim.inventory.sim.v1') kullanılır.
 *
 * FAZ 3 kademeli: şu an aktif slice'lar — geometry, inventory, surface.
 * Diğerleri (cad, openings) FAZ 4 ile birlikte tamamlanacak.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createGeometrySlice } from './slices/geometrySlice.js';
import { createInventorySlice } from './slices/inventorySlice.js';
import { createSurfaceSlice } from './slices/surfaceSlice.js';
import { createCadSlice } from './slices/cadSlice.js';

const LEGACY_STORAGE_KEY = 'seramikcim.inventory.sim.v1';
const STORE_VERSION = 1;

export const useAppStore = create(
  persist(
    (set, get) => ({
      ...createGeometrySlice(set, get),
      ...createInventorySlice(set, get),
      ...createSurfaceSlice(set, get),
      ...createCadSlice(set, get),
    }),
    {
      name: `${LEGACY_STORAGE_KEY}.zustand`,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        inventory: state.inventory,
        surfaceSettings: state.surfaceSettings,
        selectedSurfaceId: state.selectedSurfaceId,
        cadLayerVisibility: state.cadLayerVisibility,
        cadLineOverrides: state.cadLineOverrides,
      }),
    },
  ),
);

export function useGeometry() {
  return useAppStore((s) => s.geometry);
}

export function useInventory() {
  return useAppStore((s) => s.inventory);
}

export function useSurfaceSettings() {
  return useAppStore((s) => s.surfaceSettings);
}
