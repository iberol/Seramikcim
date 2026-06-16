/**
 * toastBridge.js — Simulation lifecycle → toast köprüsü
 *
 * Surface editor calc state transition'larında uygun toast tetikler.
 * Her state için sabit `id` ile dedupe (örn. 'sim-success') → spam yok.
 *
 * Çağrı: mountSimulationToastBridge() once at boot.
 */
import { subscribeSimState } from './simulationLifecycle.js';
import { toast } from '../toast.js';

const TOAST_IDS = {
  calculating: 'sim-calculating',
  success:     'sim-success',
  warning:     'sim-warning',
  error:       'sim-error',
};

const SUCCESS_DURATION = 2200;
const WARNING_DURATION = 4500;
const ERROR_DURATION = 6000;
const CALCULATING_DURATION = 1200; // auto-dismiss; success/error gelirse zaten dedupe ile değişir

function formatSuccess(payload) {
  if (!payload) return 'Hesap güncellendi.';
  const parts = [];
  if (payload.products) parts.push(`${payload.products} ürün`);
  if (payload.area) parts.push(`${Number(payload.area).toFixed(2)} m²`);
  let base = parts.length ? `Hesap güncellendi: ${parts.join(' · ')}` : 'Hesap güncellendi.';
  if (payload.wireframe_reliable === true) base += ' · wireframe ✓';
  else if (payload.wireframe_reliable === false) base += ' · wireframe ⚠';
  return base;
}

function formatWarning(payload) {
  const r = payload?.reason;
  if (r === 'no_tile_assigned') return 'Hesap için seramik seçilmedi.';
  if (r === 'no_surface') return 'Hesaplama için yüzey seçilmedi.';
  if (r === 'invalid_dimensions') return 'Geçersiz seramik boyutu.';
  if (r === 'fallback_geometry') return 'Yedek geometri kullanılıyor.';
  return payload?.message || 'Hesap kısmi sonuç verdi.';
}

function formatError(payload) {
  const msg = payload?.message || 'Bilinmeyen hata';
  return `Hesap hatası: ${msg.slice(0, 120)}`;
}

let unsubscribe = null;

export function mountSimulationToastBridge() {
  if (unsubscribe) return; // double-mount guard
  unsubscribe = subscribeSimState(({ state, payload }) => {
    switch (state) {
      case 'calculating':
        // Hafif gürültüsüz — sadece long-running için (5+ sn gösterimi simplify olarak yapmıyoruz şimdi)
        // İsteğe bağlı: hafif "Hesaplanıyor…" mesajı; spam riski olmaz çünkü id dedupe
        toast('Hesaplanıyor…', 'info', CALCULATING_DURATION, { id: TOAST_IDS.calculating });
        break;
      case 'success':
        toast(formatSuccess(payload), 'success', SUCCESS_DURATION, { id: TOAST_IDS.success });
        // calculating'i kaldır
        const calcEl = document.querySelector(`[data-toast-id="${TOAST_IDS.calculating}"]`);
        if (calcEl) calcEl.remove();
        break;
      case 'warning':
        toast(formatWarning(payload), 'warning', WARNING_DURATION, { id: TOAST_IDS.warning });
        break;
      case 'error':
        toast(formatError(payload), 'error', ERROR_DURATION, { id: TOAST_IDS.error });
        break;
      case 'idle':
      case 'stale':
      default:
        // sessizce geç
        break;
    }
  });
}

export function unmountSimulationToastBridge() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
