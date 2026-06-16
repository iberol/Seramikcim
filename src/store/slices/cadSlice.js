/**
 * cadSlice — CAD paneli durumu
 *
 * Katman görünürlüğü, seçili çizgi, command history (undo/redo).
 * Konva-tabanlı CadPanel.jsx bu slice'tan okur/yazar.
 */

const HISTORY_LIMIT = 50;

const DEFAULT_LAYER_VISIBILITY = {
  walls: true,
  doors: true,
  floor: true,
  tiles: true,
  features: true,
};

export function createCadSlice(set, get) {
  return {
    cadLayerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
    cadSelectedLineIds: [],
    cadLineOverrides: {}, // { lineId: { offsetX, offsetY, hidden } }
    cadHistory: [],       // [{ type, payload, before, after }]
    cadHistoryCursor: -1, // -1 = no history

    toggleCadLayer(layerId) {
      set((state) => ({
        cadLayerVisibility: {
          ...state.cadLayerVisibility,
          [layerId]: !state.cadLayerVisibility[layerId],
        },
      }));
    },

    setCadLayerVisibility(layerId, visible) {
      set((state) => ({
        cadLayerVisibility: {
          ...state.cadLayerVisibility,
          [layerId]: !!visible,
        },
      }));
    },

    selectCadLine(lineId, multi = false) {
      set((state) => {
        if (!multi) return { cadSelectedLineIds: [lineId] };
        const exists = state.cadSelectedLineIds.includes(lineId);
        return {
          cadSelectedLineIds: exists
            ? state.cadSelectedLineIds.filter((id) => id !== lineId)
            : [...state.cadSelectedLineIds, lineId],
        };
      });
    },

    clearCadSelection() {
      set({ cadSelectedLineIds: [] });
    },

    moveCadLine(lineId, dx, dy) {
      const before = get().cadLineOverrides[lineId] || { offsetX: 0, offsetY: 0 };
      const after = {
        ...before,
        offsetX: (before.offsetX || 0) + dx,
        offsetY: (before.offsetY || 0) + dy,
      };
      get()._pushCadHistory({ type: 'move', lineId, before, after });
      set((state) => ({
        cadLineOverrides: { ...state.cadLineOverrides, [lineId]: after },
      }));
    },

    hideCadLine(lineId) {
      const before = get().cadLineOverrides[lineId] || {};
      const after = { ...before, hidden: true };
      get()._pushCadHistory({ type: 'hide', lineId, before, after });
      set((state) => ({
        cadLineOverrides: { ...state.cadLineOverrides, [lineId]: after },
      }));
    },

    _pushCadHistory(entry) {
      set((state) => {
        const truncated = state.cadHistory.slice(0, state.cadHistoryCursor + 1);
        const next = [...truncated, entry].slice(-HISTORY_LIMIT);
        return {
          cadHistory: next,
          cadHistoryCursor: next.length - 1,
        };
      });
    },

    undoCad() {
      const { cadHistory, cadHistoryCursor, cadLineOverrides } = get();
      if (cadHistoryCursor < 0) return;
      const entry = cadHistory[cadHistoryCursor];
      const updated = { ...cadLineOverrides };
      if (entry.before && Object.keys(entry.before).length) {
        updated[entry.lineId] = entry.before;
      } else {
        delete updated[entry.lineId];
      }
      set({
        cadLineOverrides: updated,
        cadHistoryCursor: cadHistoryCursor - 1,
      });
    },

    redoCad() {
      const { cadHistory, cadHistoryCursor, cadLineOverrides } = get();
      if (cadHistoryCursor >= cadHistory.length - 1) return;
      const entry = cadHistory[cadHistoryCursor + 1];
      set({
        cadLineOverrides: {
          ...cadLineOverrides,
          [entry.lineId]: entry.after,
        },
        cadHistoryCursor: cadHistoryCursor + 1,
      });
    },

    resetCadEdits() {
      set({
        cadLineOverrides: {},
        cadHistory: [],
        cadHistoryCursor: -1,
        cadSelectedLineIds: [],
      });
    },
  };
}
