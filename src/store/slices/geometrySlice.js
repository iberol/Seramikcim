/**
 * geometrySlice — oda geometrisi ve building (CAD katmanları) verisi
 *
 * loadGeometry(): fetchGeometry() servis çağrısını yapar.
 * geometrySignature() — geometri değişimini algılamak için (legacy
 * state.js'teki aynı isimli helper'ın port'u).
 */
import { geometryService } from '../../services/geometryService.js';

export function createGeometrySlice(set, get) {
  return {
    geometry: null,
    building: null,
    geometryLoading: false,
    geometryError: null,
    geometrySignature: '',

    async loadGeometry() {
      set({ geometryLoading: true, geometryError: null });
      try {
        const geometry = await geometryService.fetchGeometry();
        const building = await geometryService.fetchBuilding();
        const signature = computeGeometrySignature(geometry?.meta);
        set({
          geometry,
          building,
          geometrySignature: signature,
          geometryLoading: false,
        });
      } catch (err) {
        set({
          geometryError: err?.message || String(err),
          geometryLoading: false,
        });
      }
    },

    setGeometry(geometry, building = null) {
      set({
        geometry,
        building: building ?? get().building,
        geometrySignature: computeGeometrySignature(geometry?.meta),
      });
    },
  };
}

function computeGeometrySignature(meta) {
  if (!meta) return '';
  return [
    meta.source,
    meta.wall_width_m,
    meta.wall_height_m,
    meta.room_true_area_m2,
    meta.net_area_m2,
    meta.ceiling_height_m,
    meta.scale_source,
    meta.wall_height_source,
    meta.wall_tracer_version,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join('|');
}
