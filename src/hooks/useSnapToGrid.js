/**
 * useSnapToGrid — 5 mm hassasiyetinde grid snap helper
 *
 * Konva drag bound function olarak kullanılabilir veya doğrudan değer
 * üzerinde çağrılır. snapToGrid(12.7, 5) → 15 (5'in en yakın katı).
 */
import { useCallback } from 'react';

export function snapToGrid(value, gridSize = 5) {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point, gridSize = 5) {
  return {
    x: snapToGrid(point.x, gridSize),
    y: snapToGrid(point.y, gridSize),
  };
}

export function useSnapToGrid(gridSize = 5) {
  return useCallback(
    (pos) => snapPoint(pos, gridSize),
    [gridSize],
  );
}
