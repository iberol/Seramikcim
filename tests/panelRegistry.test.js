/**
 * panelRegistry.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PANELS,
  getPanel,
  getRestorableAll,
  readPanelStates,
  getRestorableClosedPanels,
  getVisiblePanels,
} from '../src/ui/panelRegistry.js';

beforeEach(() => {
  localStorage.clear();
});

describe('PANELS registry', () => {
  it('5 panel tanımlı (4 DOM + 1 virtual konva-cad)', () => {
    const ids = PANELS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'launcher', 'editor', 'result', 'commerce', 'konva-cad',
    ]));
    // Konva CAD virtual flag
    const konva = PANELS.find((p) => p.id === 'konva-cad');
    expect(konva.virtual).toBe(true);
    expect(konva.eventName).toBe('seramikcim:konva-cad-toggle');
  });

  it('her panel zorunlu alanları içerir', () => {
    PANELS.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.title).toBeTruthy();
      // Virtual panel selector null olabilir
      if (!p.virtual) expect(p.selector).toBeTruthy();
      expect(p.defaultPosition).toBeDefined();
      expect(typeof p.closable).toBe('boolean');
      expect(typeof p.restoreFromTopMenu).toBe('boolean');
    });
  });
});

describe('Virtual panel state', () => {
  it('setVirtualPanelOpen + isVirtualPanelOpen + closed/visible flow', async () => {
    const { setVirtualPanelOpen, isVirtualPanelOpen } = await import('../src/ui/panelRegistry.js');
    // Başlangıçta kapalı
    expect(isVirtualPanelOpen('konva-cad')).toBe(false);
    setVirtualPanelOpen('konva-cad', true);
    expect(isVirtualPanelOpen('konva-cad')).toBe(true);

    const closed = getRestorableClosedPanels();
    const ids = closed.map((p) => p.id);
    expect(ids).not.toContain('konva-cad'); // şu an açık

    setVirtualPanelOpen('konva-cad', false);
    const closedAfter = getRestorableClosedPanels();
    expect(closedAfter.map((p) => p.id)).toContain('konva-cad');
  });
});

describe('getPanel / getRestorableAll', () => {
  it('getPanel mevcut id için meta döner', () => {
    expect(getPanel('editor')?.title).toBe('Yüzey Editörü');
    expect(getPanel('nonexistent')).toBeNull();
  });

  it('getRestorableAll = restoreFromTopMenu true olanlar', () => {
    const all = getRestorableAll();
    expect(all.length).toBe(PANELS.length); // hepsi true
  });
});

describe('localStorage state filtering', () => {
  it('readPanelStates boş localStorage için {}', () => {
    expect(readPanelStates()).toEqual({});
  });

  it('getRestorableClosedPanels hidden true olanları döner', () => {
    localStorage.setItem('seramikcim.panels.v1', JSON.stringify({
      editor: { hidden: true },
      result: { hidden: false },
    }));
    const closed = getRestorableClosedPanels();
    const ids = closed.map((p) => p.id);
    expect(ids).toContain('editor');
    expect(ids).not.toContain('result');
  });

  it('getRestorableClosedPanels minimized true olanları da döner', () => {
    localStorage.setItem('seramikcim.panels.v1', JSON.stringify({
      launcher: { minimized: true },
    }));
    const closed = getRestorableClosedPanels();
    expect(closed.map((p) => p.id)).toContain('launcher');
  });

  it('getVisiblePanels kapalı/minimize olmayanları döner', () => {
    localStorage.setItem('seramikcim.panels.v1', JSON.stringify({
      editor: { hidden: true },
      commerce: { minimized: true },
    }));
    const visible = getVisiblePanels();
    const ids = visible.map((p) => p.id);
    expect(ids).not.toContain('editor');
    expect(ids).not.toContain('commerce');
    expect(ids).toContain('launcher');
  });
});
