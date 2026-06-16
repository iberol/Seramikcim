/**
 * floatingPanels.test.js — src/floatingPanels.js drag/resize testleri (jsdom)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPanel,
  restoreAllPanels,
  showPanel,
  hidePanel,
  resetPanelsToDefaults,
} from '../src/floatingPanels.js';

function makeEl(id) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'test-panel';
  const handle = document.createElement('div');
  handle.className = 'panel-title';
  handle.textContent = 'Test Panel';
  el.appendChild(handle);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('registerPanel', () => {
  it('panel elementine floating-panel class ekler', () => {
    const el = makeEl('p1');
    registerPanel({ id: 'p1', el, defaults: { left: 10, top: 20, width: 300, height: 200 } });
    expect(el.classList.contains('floating-panel')).toBe(true);
    expect(el.style.position).toBe('fixed');
  });

  it('null el için güvenli (no-op)', () => {
    expect(() => registerPanel({ id: 'x', el: null })).not.toThrow();
  });

  it('drag handle bulunursa floating-panel-drag-handle class alır', () => {
    const el = makeEl('p2');
    registerPanel({
      id: 'p2',
      el,
      dragHandle: '.panel-title',
      defaults: { left: 0, top: 0, width: 200, height: 100 },
    });
    expect(el.querySelector('.panel-title.floating-panel-drag-handle')).toBeTruthy();
  });

  it('resizable: true için resize handle eklenir', () => {
    const el = makeEl('p3');
    registerPanel({ id: 'p3', el, resizable: true });
    expect(el.querySelector('.floating-panel-resize')).toBeTruthy();
  });
});

describe('show/hide/restorePanel', () => {
  it('hidePanel hidden class ekler, showPanel kaldırır', () => {
    const el = makeEl('p4');
    registerPanel({ id: 'p4', el });
    hidePanel('p4');
    expect(el.classList.contains('hidden')).toBe(true);
    showPanel('p4');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('resetPanelsToDefaults localStorage temizler', () => {
    const el = makeEl('p5');
    registerPanel({ id: 'p5', el });
    hidePanel('p5');
    expect(localStorage.getItem('seramikcim.panels.v1')).toBeTruthy();
    resetPanelsToDefaults();
    expect(localStorage.getItem('seramikcim.panels.v1')).toBe('{}');
  });
});
