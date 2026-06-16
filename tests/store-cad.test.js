/**
 * store-cad.test.js — cadSlice testleri (layer visibility, selection, undo/redo)
 */
import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { createCadSlice } from '../src/store/slices/cadSlice.js';

function makeStore() {
  return create((set, get) => ({
    ...createCadSlice(set, get),
  }));
}

describe('toggleCadLayer', () => {
  it('default visibility true, toggle ile false olur', () => {
    const s = makeStore();
    expect(s.getState().cadLayerVisibility.walls).toBe(true);
    s.getState().toggleCadLayer('walls');
    expect(s.getState().cadLayerVisibility.walls).toBe(false);
  });

  it('setCadLayerVisibility açıkça set eder', () => {
    const s = makeStore();
    s.getState().setCadLayerVisibility('walls', false);
    expect(s.getState().cadLayerVisibility.walls).toBe(false);
  });
});

describe('selectCadLine', () => {
  it('multi=false tek seçim', () => {
    const s = makeStore();
    s.getState().selectCadLine('walls:0');
    s.getState().selectCadLine('walls:1');
    expect(s.getState().cadSelectedLineIds).toEqual(['walls:1']);
  });

  it('multi=true seçimleri toggle eder', () => {
    const s = makeStore();
    s.getState().selectCadLine('walls:0', true);
    s.getState().selectCadLine('walls:1', true);
    expect(s.getState().cadSelectedLineIds.length).toBe(2);
    s.getState().selectCadLine('walls:0', true); // deselect
    expect(s.getState().cadSelectedLineIds).toEqual(['walls:1']);
  });

  it('clearCadSelection seçimleri boşaltır', () => {
    const s = makeStore();
    s.getState().selectCadLine('walls:0');
    s.getState().clearCadSelection();
    expect(s.getState().cadSelectedLineIds).toEqual([]);
  });
});

describe('moveCadLine + history', () => {
  it('offset uygulanır, undoCad ile sıfır offset\'e geri döner', () => {
    const s = makeStore();
    s.getState().moveCadLine('walls:0', 0.1, 0.2);
    expect(s.getState().cadLineOverrides['walls:0']).toEqual({
      offsetX: 0.1,
      offsetY: 0.2,
    });
    s.getState().undoCad();
    // before default {offsetX:0, offsetY:0} → undo onu restore eder
    expect(s.getState().cadLineOverrides['walls:0']).toEqual({
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('redoCad undo sonrası geri uygular', () => {
    const s = makeStore();
    s.getState().moveCadLine('walls:0', 0.1, 0.2);
    s.getState().undoCad();
    s.getState().redoCad();
    expect(s.getState().cadLineOverrides['walls:0']).toEqual({
      offsetX: 0.1,
      offsetY: 0.2,
    });
  });

  it('history cursor geri/ileri doğru hareket eder', () => {
    const s = makeStore();
    expect(s.getState().cadHistoryCursor).toBe(-1);
    s.getState().moveCadLine('walls:0', 0.1, 0);
    expect(s.getState().cadHistoryCursor).toBe(0);
    s.getState().moveCadLine('walls:0', 0.1, 0);
    expect(s.getState().cadHistoryCursor).toBe(1);
    s.getState().undoCad();
    expect(s.getState().cadHistoryCursor).toBe(0);
  });
});

describe('hideCadLine', () => {
  it('hidden:true set edilir', () => {
    const s = makeStore();
    s.getState().hideCadLine('walls:0');
    expect(s.getState().cadLineOverrides['walls:0'].hidden).toBe(true);
  });
});

describe('resetCadEdits', () => {
  it('overrides, history, selection sıfırlanır', () => {
    const s = makeStore();
    s.getState().moveCadLine('walls:0', 1, 1);
    s.getState().selectCadLine('walls:0');
    s.getState().resetCadEdits();
    expect(s.getState().cadLineOverrides).toEqual({});
    expect(s.getState().cadHistory).toEqual([]);
    expect(s.getState().cadHistoryCursor).toBe(-1);
    expect(s.getState().cadSelectedLineIds).toEqual([]);
  });
});
