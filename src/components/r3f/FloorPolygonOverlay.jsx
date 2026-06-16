/**
 * FloorPolygonOverlay.jsx — Wireframe-driven floor polygon overlay
 *
 * meta.floor_polygon_3d'yi yerde mavi LineLoop olarak çizer.
 * Wall planes'in başlangıç noktasını net gösterir → tile placement boundary visible.
 */
import React, { useMemo } from 'react';

export function FloorPolygonOverlay({ geometryData, visible }) {
  const poly = geometryData?.meta?.floor_polygon_3d || [];

  const buffer = useMemo(() => {
    if (poly.length < 3) return null;
    const positions = [];
    for (let i = 0; i < poly.length - 1; i += 1) {
      const a = poly[i];
      const b = poly[i + 1];
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    return new Float32Array(positions);
  }, [poly]);

  if (!visible || !buffer) return null;

  return (
    <lineSegments renderOrder={48}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffer, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#FF8C00" depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  );
}
