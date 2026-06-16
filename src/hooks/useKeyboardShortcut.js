/**
 * useKeyboardShortcut.js — Tekrarlayan keyboard event listener pattern'i
 *
 * App.jsx ve CadPanel.jsx'teki addEventListener/removeEventListener
 * kalıplarını tek hook'ta toplar.
 *
 * Kullanım:
 *   useKeyboardShortcut({ ctrlKey: true, key: 'k' }, () => setCadOpen(v => !v));
 *   useKeyboardShortcut({ ctrlKey: true, key: 'z' }, undo);
 */
import { useEffect } from 'react';

/**
 * @param {object} combo - Tuş kombinasyonu tanımı
 * @param {boolean} [combo.ctrlKey] - Ctrl veya Meta tuşu gereksinimi
 * @param {boolean} [combo.shiftKey] - Shift tuşu gereksinimi
 * @param {boolean} [combo.altKey] - Alt tuşu gereksinimi
 * @param {string}  combo.key - e.key değeri (toLowerCase ile karşılaştırılır)
 * @param {function} handler - Çağrılacak fonksiyon
 * @param {object}  [options]
 * @param {boolean} [options.preventDefault=true] - event.preventDefault() çağır
 * @param {boolean} [options.enabled=true] - false iken hook pasif kalır
 */
export function useKeyboardShortcut(combo, handler, options = {}) {
  const { preventDefault = true, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const listener = (e) => {
      const ctrlMatch = combo.ctrlKey ? (e.ctrlKey || e.metaKey) : true;
      const shiftMatch = combo.shiftKey ? e.shiftKey : true;
      const altMatch = combo.altKey ? e.altKey : true;
      const keyMatch = e.key.toLowerCase() === combo.key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        if (preventDefault) e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [combo.key, combo.ctrlKey, combo.shiftKey, combo.altKey, handler, preventDefault, enabled]);
}
