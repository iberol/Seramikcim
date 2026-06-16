/**
 * useErrorToasts.js — Hata ve uyarı toast bildirimleri
 *
 * App.jsx'teki geometri hatası, katalog hatası ve büyük geometri
 * uyarısı useEffect'lerini tek hook'ta toplar.
 *
 * Her hata değişiminde tekrar gösterilmemesi için ref tabanlı
 * deduplication kullanır.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { toastError, toastWarning } from '../toast.js';

const MAX_FILE_SIZE_MB = Number(import.meta.env.VITE_MAX_FILE_SIZE_MB) || 50;

export function useErrorToasts() {
  const geometry      = useAppStore((s) => s.geometry);
  const error         = useAppStore((s) => s.geometryError);
  const catalogError  = useAppStore((s) => s.catalogError);

  const lastErrorRef        = useRef(null);
  const lastCatalogErrorRef = useRef(null);
  const lastReliableRef     = useRef(undefined);

  // Geometri hatası toast
  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      toastError(`Geometri yüklenemedi: ${error}`);
    }
  }, [error]);

  // Katalog hatası toast
  useEffect(() => {
    if (catalogError && catalogError !== lastCatalogErrorRef.current) {
      lastCatalogErrorRef.current = catalogError;
      toastWarning(`Katalog yüklenemedi: ${catalogError}`);
    }
  }, [catalogError]);

  // Büyük geometri uyarısı
  useEffect(() => {
    if (!geometry) return;
    try {
      const size = JSON.stringify(geometry).length;
      if (size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toastWarning(
          `Geometri verisi büyük (${(size / 1024 / 1024).toFixed(1)} MB). Performans etkilenebilir.`,
        );
      }
    } catch { /* ignore */ }
  }, [geometry]);

  // Wireframe güvenilirlik uyarısı (mesh modu + reliable=false, bir kez)
  useEffect(() => {
    const wf = geometry?.meta?.wireframe;
    if (!wf) return;
    const reliable = wf.tile_placement_reliable;
    if (reliable === lastReliableRef.current) return;
    lastReliableRef.current = reliable;
    if (reliable === false) {
      const matched = wf.outline_match?.matched ?? 0;
      const total   = wf.outline_match?.outline_corners ?? 0;
      toastWarning(
        `Mesh wireframe uyumsuz (${matched}/${total} köşe eşleşti). Tile placement section outline'a dayanıyor.`,
        6000,
        { id: 'wireframe-unreliable' },
      );
    }
  }, [geometry]);
}
