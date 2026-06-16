/**
 * appPanel.js — Vanilla JS yardımcıları
 *
 * React-bağımsız factory'ler; legacy main.js + new React kodu aynı atomic
 * sınıfları kullanır. Daha karmaşık React component'leri yerine basit
 * HTML factory'leri tutarlı render üretir.
 */
import { iconHTML } from '../icons.js';

/** AppPanel chrome — başlık + body. Mevcut <aside> içine inject edilir. */
export function applyAppPanelStyle(el, { title, subtitle, icon, actions = [] } = {}) {
  if (!el) return;
  el.classList.add('app-panel');
}

/** AppButton HTML — `class="app-btn app-btn--{variant}"` */
export function buttonHTML({ label, variant = 'secondary', icon, iconOnly = false, ariaLabel } = {}) {
  const classes = ['app-btn', `app-btn--${variant}`];
  if (iconOnly) classes.push('app-btn--icon');
  const aria = ariaLabel || label;
  const iconSvg = icon ? iconHTML(icon) : '';
  const labelHtml = iconOnly ? '' : `<span>${label}</span>`;
  return `<button class="${classes.join(' ')}" aria-label="${aria}">${iconSvg}${labelHtml}</button>`;
}

/** AppToggle HTML — checkbox + switch. */
export function toggleHTML({ id, label, checked = false } = {}) {
  return `
    <label class="app-toggle" for="${id}">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
      <span class="app-toggle__switch"></span>
      <span>${label}</span>
    </label>
  `;
}

/** Mevcut DOM input/select/buton'larına standardize sınıf uygula. */
export function normalizeFormControls(root) {
  if (!root) return;
  root.querySelectorAll('input.number-field, input.text-field, input[type="number"], input[type="text"]').forEach((el) => {
    el.classList.add('app-input');
  });
  root.querySelectorAll('select.select-field, select').forEach((el) => {
    el.classList.add('app-select');
  });
  root.querySelectorAll('button.primary-btn').forEach((el) => {
    el.classList.add('app-btn', 'app-btn--primary');
  });
  root.querySelectorAll('button.secondary-btn').forEach((el) => {
    el.classList.add('app-btn', 'app-btn--secondary');
  });
  root.querySelectorAll('button.chip-btn').forEach((el) => {
    el.classList.add('app-chip');
  });
  root.querySelectorAll('button.icon-btn').forEach((el) => {
    el.classList.add('app-btn', 'app-btn--ghost');
    if (!el.querySelector('.btn-label')) el.classList.add('app-btn--icon');
  });
}
