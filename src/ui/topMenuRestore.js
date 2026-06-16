/**
 * topMenuRestore.js — Header'a "Paneller" dropdown ekler.
 *
 * Kapalı/minimized panelleri restore eder + "Reset layout" aksiyonu sunar.
 * Standardize CSS: .app-panel + .app-btn ile uyumlu.
 */
import { iconHTML } from '../icons.js';
import {
  PANELS,
  getPanel,
  getRestorableAll,
  readPanelStates,
  isVirtualPanelOpen,
} from './panelRegistry.js';
import { showPanelAtDefault, resetPanelsToDefaults } from '../floatingPanels.js';

const MENU_ID = 'panels-restore-menu';

export function mountTopMenuRestore(container) {
  if (!container) return;
  if (container.querySelector('.panels-restore-btn')) return;

  // Buton
  const btn = document.createElement('button');
  btn.className = 'icon-btn app-btn app-btn--ghost panels-restore-btn';
  btn.setAttribute('aria-label', 'Panel yönetimi');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.title = 'Paneller';
  btn.innerHTML = `${iconHTML('grid')}<span class="btn-label">Paneller</span>`;
  container.appendChild(btn);

  // Dropdown
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'app-panel panels-restore-menu hidden';
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);

  function close() {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }
  function open() {
    rebuildMenu(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, r.right - 260)}px`;
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) close();
    else open();
  });
  document.addEventListener('click', (ev) => {
    if (!menu.contains(ev.target) && ev.target !== btn) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
  });

  // Panel state değişimlerinde menüyü tazele (sadece açıksa)
  window.addEventListener('seramikcim:panels-changed', () => {
    if (!menu.classList.contains('hidden')) rebuildMenu(menu);
  });
}

function rebuildMenu(menu) {
  const states = readPanelStates();
  const all = getRestorableAll();
  const closed = all.filter((p) => {
    const s = states[p.id];
    return s && (s.hidden === true || s.minimized === true);
  });
  const visible = all.filter((p) => !closed.includes(p));

  const items = [];

  items.push(`<div class="panels-restore-section-title">Kapalı / Küçültülmüş</div>`);
  if (!closed.length) {
    items.push(`<div class="panels-restore-empty">Tüm paneller açık</div>`);
  } else {
    closed.forEach((p) => {
      items.push(`
        <button class="panels-restore-item" data-restore="${p.id}" role="menuitem">
          ${iconHTML(p.icon || 'grid')}
          <span>${p.title}</span>
        </button>
      `);
    });
  }

  items.push(`<div class="panels-restore-section-title">Açık Paneller</div>`);
  visible.forEach((p) => {
    items.push(`
      <button class="panels-restore-item is-visible" data-restore="${p.id}" role="menuitem" title="Standart konuma sıfırla">
        ${iconHTML(p.icon || 'grid')}
        <span>${p.title}</span>
        <small class="panels-restore-hint">↺</small>
      </button>
    `);
  });

  items.push(`<div class="panels-restore-divider"></div>`);
  items.push(`
    <button class="panels-restore-item is-danger" data-restore="__reset__" role="menuitem">
      ${iconHTML('refresh')}
      <span>Düzeni Sıfırla</span>
    </button>
  `);

  menu.innerHTML = items.join('');

  menu.querySelectorAll('[data-restore]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-restore');
      if (id === '__reset__') {
        if (window.confirm('Tüm panellerin konum/boyut/açıklık durumu sıfırlansın mı?')) {
          resetPanelsToDefaults();
          window.dispatchEvent(new CustomEvent('seramikcim:panels-changed'));
        }
      } else {
        const p = getPanel(id);
        if (p?.virtual && p.eventName) {
          // Virtual panel — React state ile yönetilir; custom event yayınla
          window.dispatchEvent(new CustomEvent(p.eventName, { detail: { open: true } }));
        } else {
          showPanelAtDefault(id);
        }
      }
      menu.classList.add('hidden');
    });
  });
}
