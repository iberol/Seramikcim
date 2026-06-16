/**
 * App.jsx — R3F sahne + Konva CAD paneli kapsayıcısı
 *
 * Zustand store'dan geometri/katalog yüklemesini tetikler.
 * R3F Scene tam ekran; Konva CadPanel toggle'lı overlay.
 */
import React, { useState } from 'react';
import { Leva } from 'leva';
import { Scene } from './components/Scene.jsx';
import { CadPanel } from './components/CadPanel.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { useAppStore } from './store/useAppStore.js';
import { useAppInitializer } from './hooks/useAppInitializer.js';
import { useErrorToasts } from './hooks/useErrorToasts.js';

export function App() {
  const geometry = useAppStore((s) => s.geometry);
  const loading = useAppStore((s) => s.geometryLoading);
  const geometryError = useAppStore((s) => s.geometryError);
  const [cadOpen, setCadOpen] = useState(false);
  const cadState = { cadOpen, setCadOpen };

  useAppInitializer(cadState);
  useErrorToasts();

  if (loading) {
    return <div className="r3f-loading">Yükleniyor…</div>;
  }
  if (!geometry) {
    return (
      <div className="r3f-error">
        {geometryError || 'Geometri yüklenemedi. Lütfen sayfayı yenileyin.'}
      </div>
    );
  }
  return (
    <ErrorBoundary>
      {/* Leva provider — explicit config: dev hint'leri kapalı, başlık özelleştirildi */}
      <Leva
        titleBar={{ filter: false, drag: true, title: 'Sahne Kontrolleri' }}
        hideCopyButton
        collapsed={false}
        oneLineLabels
      />
      <Scene geometryData={geometry} />
      {cadOpen && (
        <div className="cad-konva-overlay">
          <div className="cad-konva-header">
            <span>Konva CAD (FAZ 4) — Ctrl+K ile kapat</span>
            <button onClick={() => setCadOpen(false)} aria-label="Konva CAD'i kapat">×</button>
          </div>
          <CadPanel width={Math.min(900, window.innerWidth - 40)} height={520} />
        </div>
      )}
    </ErrorBoundary>
  );
}
