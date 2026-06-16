/**
 * useAppInitializer.js — Uygulama başlangıç side effect'leri
 *
 * App.jsx'teki geometri/katalog yükleme ve CAD panel event listener'larını
 * tek hook'ta toplar.
 *
 * Sorumluluklar:
 *  1. loadGeometry() + loadCatalog() mount'ta tetikle
 *  2. Ctrl+K ile CAD paneli aç/kapat
 *  3. seramikcim:konva-cad-toggle custom event'ini dinle
 *  4. cadOpen değişimini panelRegistry'e bildir
 */
import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { setVirtualPanelOpen } from '../ui/panelRegistry.js';
import { useKeyboardShortcut } from './useKeyboardShortcut.js';

/**
 * @param {{ cadOpen: boolean, setCadOpen: function }} cadState
 */
export function useAppInitializer(cadState) {
  const { cadOpen, setCadOpen } = cadState;
  const loadGeometry = useAppStore((s) => s.loadGeometry);
  const loadCatalog  = useAppStore((s) => s.loadCatalog);

  // Geometri + katalog yükleme (mount'ta bir kez)
  useEffect(() => {
    loadGeometry();
    loadCatalog();
  }, [loadGeometry, loadCatalog]);

  // Reload'suz model geçişi: legacy main.js switchModel sonrası bu event'i atar.
  // React store yeni modele (?model= güncellendi) yeniden yüklenir → mesh + sceneData
  // aynı WebGL context'inde güncellenir (sayfa yenilenmez).
  useEffect(() => {
    const onModelChanged = () => loadGeometry();
    window.addEventListener('seramikcim:model-changed', onModelChanged);
    return () => window.removeEventListener('seramikcim:model-changed', onModelChanged);
  }, [loadGeometry]);

  // Ctrl+K → CAD paneli toggle
  useKeyboardShortcut(
    { ctrlKey: true, key: 'k' },
    () => setCadOpen((v) => !v),
  );

  // Top menu "Paneller" → Konva CAD virtual panel event
  useEffect(() => {
    const handler = (e) => {
      const next = e.detail?.open;
      setCadOpen(typeof next === 'boolean' ? next : (v) => !v);
    };
    window.addEventListener('seramikcim:konva-cad-toggle', handler);
    return () => window.removeEventListener('seramikcim:konva-cad-toggle', handler);
  }, [setCadOpen]);

  // cadOpen → panel registry senkronizasyonu
  useEffect(() => {
    setVirtualPanelOpen('konva-cad', cadOpen);
  }, [cadOpen]);
}
