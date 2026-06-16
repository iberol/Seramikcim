/**
 * floatingPanels.js — Vanilla JS panel sistemi: sürükle + boyutlandır + konum persistence
 *
 * Mevcut DOM panellerini (`.editor-panel`, `.launcher-panel`, vb.) wrapping
 * yapmadan, sadece position/size'larını yönetir. localStorage'a kaydeder.
 *
 * Kullanım:
 *   import { registerPanel, restoreAllPanels } from './floatingPanels.js';
 *   registerPanel({ id:'editor', el:document.querySelector('.editor-panel'),
 *     defaults:{ right:16, top:80, width:340, height:600 },
 *     dragHandle:'.panel-title' });
 *   restoreAllPanels(); // tüm panellerin localStorage state'ini uygula
 */
const STORAGE_KEY = 'seramikcim.panels.v1';
const Z_BASE = 90;
const Z_TOP = 220; // commerce/cad drawer'lardan az (130) yüksek olsun
let topZ = Z_BASE;
const panels = new Map();

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAll(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function applyState(panel, state) {
  const el = panel.el;
  if (state.x != null) {
    el.style.left = state.x + 'px';
    el.style.right = 'auto';
  }
  if (state.y != null) {
    el.style.top = state.y + 'px';
    el.style.bottom = 'auto';
  }
  if (state.width != null) el.style.width = state.width + 'px';
  if (state.height != null) el.style.height = state.height + 'px';
  if (state.minimized) el.classList.add('panel-minimized');
  else el.classList.remove('panel-minimized');
}

function applyDefaults(panel) {
  const el = panel.el;
  const d = panel.defaults || {};
  // Sadece floating:true olan panellere position:fixed uygula.
  // Bootstrap grid içindeki paneller (editor, result) etkilenmez.
  if (panel.floating) {
    if (d.left != null) el.style.left = d.left + 'px';
    if (d.right != null) el.style.right = d.right + 'px';
    if (d.top != null) el.style.top = d.top + 'px';
    if (d.bottom != null) el.style.bottom = d.bottom + 'px';
    if (d.width) el.style.width = d.width + 'px';
    if (d.height) el.style.height = d.height + 'px';
    el.style.position = 'fixed';
  }
}

function persist(panelId, patch) {
  const all = loadAll();
  all[panelId] = { ...(all[panelId] || {}), ...patch };
  saveAll(all);
}

function bringToFront(panel) {
  topZ = Math.min(topZ + 1, Z_TOP);
  panel.el.style.zIndex = String(topZ);
}

function startDrag(panel, ev) {
  if (ev.button !== undefined && ev.button !== 0) return;
  ev.preventDefault();
  bringToFront(panel);
  const rect = panel.el.getBoundingClientRect();
  const startX = ev.clientX;
  const startY = ev.clientY;
  const baseLeft = rect.left;
  const baseTop = rect.top;
  panel.el.classList.add('panel-dragging');

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nx = clamp(baseLeft + dx, 0, window.innerWidth - 40);
    const ny = clamp(baseTop + dy, 0, window.innerHeight - 40);
    panel.el.style.left = nx + 'px';
    panel.el.style.top = ny + 'px';
    panel.el.style.right = 'auto';
    panel.el.style.bottom = 'auto';
  };
  const onUp = (e) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    panel.el.classList.remove('panel-dragging');
    const r = panel.el.getBoundingClientRect();
    persist(panel.id, { x: Math.round(r.left), y: Math.round(r.top) });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startResize(panel, ev) {
  ev.preventDefault();
  bringToFront(panel);
  const rect = panel.el.getBoundingClientRect();
  const startX = ev.clientX;
  const startY = ev.clientY;
  const baseW = rect.width;
  const baseH = rect.height;
  panel.el.classList.add('panel-resizing');

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const w = clamp(baseW + dx, 200, window.innerWidth - 40);
    const h = clamp(baseH + dy, 80, window.innerHeight - 40);
    panel.el.style.width = w + 'px';
    panel.el.style.height = h + 'px';
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    panel.el.classList.remove('panel-resizing');
    const r = panel.el.getBoundingClientRect();
    persist(panel.id, { width: Math.round(r.width), height: Math.round(r.height) });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function createControls(panel) {
  const wrap = document.createElement('div');
  wrap.className = 'floating-panel-controls';
  wrap.setAttribute('data-no-drag', '1');

  const minBtn = document.createElement('button');
  minBtn.className = 'icon-btn floating-panel-btn';
  minBtn.title = 'Küçült';
  minBtn.setAttribute('aria-label', 'Paneli küçült');
  minBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const minimized = panel.el.classList.toggle('panel-minimized');
    persist(panel.id, { minimized });
  });
  wrap.appendChild(minBtn);

  if (panel.closable !== false) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn floating-panel-btn';
    closeBtn.title = 'Kapat';
    closeBtn.setAttribute('aria-label', 'Paneli kapat');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.el.classList.add('hidden');
      persist(panel.id, { hidden: true });
    });
    wrap.appendChild(closeBtn);
  }

  return wrap;
}

function createResizeHandle(panel) {
  const handle = document.createElement('div');
  handle.className = 'floating-panel-resize';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('pointerdown', (ev) => startResize(panel, ev));
  return handle;
}

export function registerPanel(opts) {
  const { id, el, defaults = {}, dragHandle, resizable = true, closable = true, floating = true } = opts;
  if (!el || !id) return;
  const panel = { id, el, defaults, closable, floating };
  panels.set(id, panel);

  applyDefaults(panel);
  bringToFront(panel);
  el.classList.add('floating-panel');

  // Drag handle
  const handle = dragHandle ? el.querySelector(dragHandle) : el;
  if (handle) {
    handle.classList.add('floating-panel-drag-handle');
    handle.addEventListener('pointerdown', (ev) => {
      const noDrag = ev.target.closest('[data-no-drag], button, input, select, textarea, a');
      if (noDrag) return;
      startDrag(panel, ev);
    });
  }

  // Controls (min + close)
  if (handle) {
    const controls = createControls(panel);
    handle.appendChild(controls);
  }

  // Resize handle
  if (resizable) {
    el.appendChild(createResizeHandle(panel));
  }

  // Bring to front on click
  el.addEventListener('pointerdown', () => bringToFront(panel));
}

export function restoreAllPanels() {
  const all = loadAll();
  for (const [id, panel] of panels) {
    const state = all[id];
    if (state) {
      applyState(panel, state);
      if (state.hidden) panel.el.classList.add('hidden');
    }
  }
}

export function resetPanelsToDefaults() {
  saveAll({});
  for (const panel of panels.values()) {
    panel.el.classList.remove('panel-minimized', 'hidden');
    panel.el.style.left = '';
    panel.el.style.right = '';
    panel.el.style.top = '';
    panel.el.style.bottom = '';
    panel.el.style.width = '';
    panel.el.style.height = '';
    applyDefaults(panel);
  }
}

export function showPanel(id) {
  const p = panels.get(id);
  if (!p) return;
  p.el.classList.remove('hidden', 'panel-minimized');
  bringToFront(p);
  persist(id, { hidden: false, minimized: false });
  notify();
}

export function hidePanel(id) {
  const p = panels.get(id);
  if (!p) return;
  p.el.classList.add('hidden');
  persist(id, { hidden: true });
  notify();
}

/**
 * Paneli aç ve **standart default konuma** sıfırla.
 * Top menu restore "Reset position" akışı için.
 */
export function showPanelAtDefault(id) {
  const p = panels.get(id);
  if (!p) return;
  // localStorage'taki x/y/width/height/minimized'ı sil; defaults yeniden uygulanır
  const all = loadAll();
  if (all[id]) {
    delete all[id];
    saveAll(all);
  }
  p.el.classList.remove('hidden', 'panel-minimized');
  p.el.style.left = '';
  p.el.style.right = '';
  p.el.style.top = '';
  p.el.style.bottom = '';
  p.el.style.width = '';
  p.el.style.height = '';
  applyDefaults(p);
  bringToFront(p);
  notify();
}

/** Panel registry değişimlerinde top menu güncellenir. */
function notify() {
  try {
    window.dispatchEvent(new CustomEvent('seramikcim:panels-changed'));
  } catch {
    /* ignore */
  }
}
