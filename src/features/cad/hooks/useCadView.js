/**
 * useCadView.js — CAD paneli görüntü dönüşümü (scale, offset)
 *
 * CadPanel.jsx'teki view state ve computeFitView mantığını kapsüller.
 * building veya stage boyutları değiştiğinde otomatik sığdırır.
 */
import { useState, useEffect, useMemo } from 'react';
import { computeBounds, computeFitView } from '../utils/cadGeometry.js';

/**
 * @param {object|null} building - current_building.json verisi
 * @param {number} width - Stage genişliği (px)
 * @param {number} height - Stage yüksekliği (px)
 * @returns {{
 *   view: { scale: number, offsetX: number, offsetY: number },
 *   setView: function,
 *   bounds: { minX, maxX, minY, maxY },
 *   toScreenPoint: (x: number, y: number) => [number, number]
 * }}
 */
export function useCadView(building, width, height) {
  const bounds = useMemo(() => computeBounds(building), [building]);
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    if (!building) return;
    setView(computeFitView(bounds, width, height));
  }, [building, bounds, width, height]);

  const toScreenPoint = (x, y) => [
    x * view.scale + view.offsetX,
    y * view.scale + view.offsetY,
  ];

  return { view, setView, bounds, toScreenPoint };
}
