/**
 * panelRegistry.js — Tüm floating panel'lerin tek kaynağı.
 *
 * Her panel: id, title, icon, category, defaultPosition, closable,
 * minimizable, restoreFromTopMenu, selector (DOM bind).
 *
 * floatingPanels.js registerPanel() çağrılarını bu registry besler.
 */

export const PANELS = [
  {
    id: 'launcher',
    title: 'CAD Hazırlayıcı',
    icon: 'fileSearch',
    selector: '.launcher-panel',
    category: 'tools',
    defaultPosition: { left: 16, top: 198, width: 420, height: 280 },
    closable: true,
    minimizable: true,
    restoreFromTopMenu: true,
    dragHandle: '.launcher-toolbar',
  },
  {
    id: 'editor',
    title: 'Yüzey Editörü',
    icon: 'tool',
    selector: '.editor-panel',
    category: 'editor',
    defaultPosition: { right: 16, top: 72, width: 340, height: 620 },
    closable: true,
    minimizable: true,
    restoreFromTopMenu: true,
    dragHandle: '.panel-title',
  },
  {
    id: 'result',
    title: 'Sonuçlar',
    icon: 'grid',
    selector: '.result-panel',
    category: 'output',
    defaultPosition: { left: 16, bottom: 16, width: null /* full */, height: 260 },
    closable: true,
    minimizable: true,
    restoreFromTopMenu: true,
    dragHandle: '.result-grid',
  },
  {
    id: 'commerce',
    title: 'Ürün Yönetimi',
    icon: 'shoppingCart',
    selector: '.commerce-drawer',
    category: 'product',
    defaultPosition: { center: true, width: 1000, height: 750 },
    closable: true,
    minimizable: true,
    restoreFromTopMenu: true,
    dragHandle: '.commerce-toolbar',
  },
  {
    // Virtual panel: DOM selector yok, React state'le yönetilir (App.jsx cadOpen)
    id: 'konva-cad',
    title: 'Konva CAD (interaktif)',
    icon: 'crop',
    selector: null,
    virtual: true,
    category: 'tools',
    shortcut: 'Ctrl+K',
    defaultPosition: { center: true, width: 900, height: 580 },
    closable: true,
    minimizable: false,
    restoreFromTopMenu: true,
    eventName: 'seramikcim:konva-cad-toggle',
  },
];

const STORAGE_KEY = 'seramikcim.panels.v1';

/** id → panel meta */
export function getPanel(id) {
  return PANELS.find((p) => p.id === id) || null;
}

/** Restore-eligible olanlar (registry'de restoreFromTopMenu true) */
export function getRestorableAll() {
  return PANELS.filter((p) => p.restoreFromTopMenu);
}

/**
 * localStorage'tan kapalı/minimize panel id'lerini oku.
 * Dönüş: { id → { hidden: bool, minimized: bool } }
 */
export function readPanelStates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Virtual panel'ler için global flag (window). React App.jsx state'ini izler.
 * setVirtualPanelOpen(id, isOpen) — App.jsx cadOpen değiştiğinde çağırır.
 */
const virtualOpen = new Map();

export function setVirtualPanelOpen(id, isOpen) {
  virtualOpen.set(id, !!isOpen);
  try {
    window.dispatchEvent(new CustomEvent('seramikcim:panels-changed'));
  } catch {
    /* ignore */
  }
}

export function isVirtualPanelOpen(id) {
  return virtualOpen.get(id) === true;
}

function isPanelClosed(p, states) {
  if (p.virtual) return !isVirtualPanelOpen(p.id);
  const s = states[p.id];
  return Boolean(s && (s.hidden === true || s.minimized === true));
}

/** Restorable AND closed/minimized olanlar — top menu'de listelenir */
export function getRestorableClosedPanels() {
  const states = readPanelStates();
  return getRestorableAll().filter((p) => isPanelClosed(p, states));
}

/** Restorable AND görünür olanlar — top menu'de "açık" işaretli */
export function getVisiblePanels() {
  const states = readPanelStates();
  return getRestorableAll().filter((p) => !isPanelClosed(p, states));
}

/**
 * Bir panel'in defaultPosition'unu floatingPanels.registerPanel format'ına dönüştür.
 * `width: null` → result panel için runtime'da hesaplanır.
 */
export function buildRegisterOptions(panelMeta) {
  const p = panelMeta;
  const dp = p.defaultPosition || {};
  const defaults = {};
  if (dp.left != null) defaults.left = dp.left;
  if (dp.right != null) defaults.right = dp.right;
  if (dp.top != null) defaults.top = dp.top;
  if (dp.bottom != null) defaults.bottom = dp.bottom;
  if (dp.center) {
    const w = dp.width || 800;
    const h = dp.height || 600;
    defaults.left = Math.max(16, Math.round((window.innerWidth - w) / 2));
    defaults.top = Math.max(60, Math.round((window.innerHeight - h) / 2));
    defaults.width = w;
    defaults.height = h;
  } else {
    if (dp.width === null) defaults.width = Math.max(600, window.innerWidth - 380);
    else if (dp.width != null) defaults.width = dp.width;
    if (dp.height != null) defaults.height = dp.height;
  }
  return {
    id: p.id,
    el: document.querySelector(p.selector),
    defaults,
    dragHandle: p.dragHandle,
    resizable: p.resizable !== false,
    closable: p.closable !== false,
  };
}
