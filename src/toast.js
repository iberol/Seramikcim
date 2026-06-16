/**
 * toast.js — basit toast bildirimi (Vanilla JS)
 *
 * Kullanım:
 *   import { toast } from './toast.js';
 *   toast('Başarılı', 'success');
 *   toast('Hata: ...', 'error');
 *   toast('Uyarı', 'warning');
 *   toast('Bilgi', 'info');
 */
const CONTAINER_ID = 'seramikcim-toast-container';
const TYPES = new Set(['info', 'success', 'warning', 'error']);
const DURATION_MS = 4000;
const activeToasts = new Map(); // id → element (dedupe için)

function ensureContainer() {
  let c = document.getElementById(CONTAINER_ID);
  if (c) return c;
  c = document.createElement('div');
  c.id = CONTAINER_ID;
  c.setAttribute('aria-live', 'polite');
  c.setAttribute('aria-atomic', 'true');
  document.body.appendChild(c);
  return c;
}

export function toast(message, type = 'info', durationMs = DURATION_MS, opts = {}) {
  if (typeof document === 'undefined') return;
  const t = TYPES.has(type) ? type : 'info';
  const id = opts?.id || null;

  // ID-based dedupe: aynı id zaten gösteriliyorsa eskiyi kaldır, yenisini koy
  if (id && activeToasts.has(id)) {
    const old = activeToasts.get(id);
    if (old) old.remove();
    activeToasts.delete(id);
  }

  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${t}`;
  if (id) el.setAttribute('data-toast-id', id);
  el.setAttribute('role', t === 'error' || t === 'warning' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="toast-message">${String(message)}</span>
    <button class="toast-close" aria-label="Bildirimi kapat">×</button>
  `;
  el.querySelector('.toast-close').addEventListener('click', () => {
    if (id) activeToasts.delete(id);
    dismiss(el);
  });
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  if (id) activeToasts.set(id, el);
  if (durationMs > 0) {
    setTimeout(() => {
      if (id) activeToasts.delete(id);
      dismiss(el);
    }, durationMs);
  }
  return el;
}

function dismiss(el) {
  if (!el || el.classList.contains('toast-dismissed')) return;
  el.classList.add('toast-dismissed');
  setTimeout(() => el.remove(), 250);
}

export const toastSuccess = (m, d) => toast(m, 'success', d);
export const toastWarning = (m, d) => toast(m, 'warning', d);
export const toastError   = (m, d) => toast(m, 'error', d);
export const toastInfo    = (m, d) => toast(m, 'info', d);
