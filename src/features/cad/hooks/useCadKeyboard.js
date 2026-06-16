/**
 * useCadKeyboard.js — CAD paneli klavye kısayolları
 *
 * CadPanel.jsx'teki Ctrl+Z / Ctrl+Y keyboard listener'larını
 * bağımsız hook'a çıkarır.
 */
import { useKeyboardShortcut } from '../../../hooks/useKeyboardShortcut.js';

/**
 * @param {function} undo - undoCad aksiyonu
 * @param {function} redo - redoCad aksiyonu
 * @param {boolean} [enabled=true]
 */
export function useCadKeyboard(undo, redo, enabled = true) {
  useKeyboardShortcut({ ctrlKey: true, key: 'z' }, undo, { enabled });
  useKeyboardShortcut({ ctrlKey: true, key: 'y' }, redo, { enabled });
}
