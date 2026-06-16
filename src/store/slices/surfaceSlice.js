/**
 * surfaceSlice — yüzey seçimi ve seramik ayarları
 *
 * surfaceSettings: yüzey başına derz, fire %, başlangıç, yön, tile id.
 * selectedSurfaceId: aktif düzenleme yapılan yüzey.
 */

const DEFAULT_SETTINGS = {
  groutMm: 3,
  wastePct: 10,
  origin: 'left-bottom',
  orientation: 'horizontal',
  tileId: null,
};

export function createSurfaceSlice(set, get) {
  return {
    selectedSurfaceId: 'floor',
    // surfaceSettings: { [surfaceId]: { groutMm, wastePct, ... } }
    surfaceSettings: {},

    selectSurface(surfaceId) {
      set({ selectedSurfaceId: surfaceId });
    },

    getSurfaceSettings(surfaceId) {
      const all = get().surfaceSettings || {};
      return { ...DEFAULT_SETTINGS, ...(all[surfaceId] || {}) };
    },

    updateSurfaceSettings(surfaceId, patch) {
      set((state) => {
        const current = state.surfaceSettings[surfaceId] || {};
        return {
          surfaceSettings: {
            ...state.surfaceSettings,
            [surfaceId]: { ...current, ...patch },
          },
        };
      });
    },

    resetSurfaceSettings(surfaceId) {
      set((state) => {
        const { [surfaceId]: _removed, ...rest } = state.surfaceSettings;
        return { surfaceSettings: rest };
      });
    },
  };
}
