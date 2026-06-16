/**
 * WallPlanesOverlay.jsx — Wireframe-driven mode'da meta.wall_planes overlay
 *
 * Her quad'ı yarı saydam mesh + LineLoop ile gösterir.
 * Phase C debug: leva "Wall Planes Debug" toggle ile açılır/kapanır.
 *
 * Confidence < 0.7 → kırmızı (low confidence), aksi → yeşil (high confidence).
 */
import React, { useMemo } from 'react';

export function WallPlanesOverlay({ geometryData, visible }) {
  const planes = geometryData?.meta?.wall_planes || [];

  const buffers = useMemo(() => {
    if (!planes.length) return { positions: null, indices: null, edges: null, colors: null };
    const positions = [];
    const indices = [];
    const colors = [];
    const edges = [];
    planes.forEach((plane, idx) => {
      const quad = plane.quad || [];
      if (quad.length !== 4) return;
      const base = idx * 4;
      const isHighConf = (plane.confidence || 0) >= 0.7;
      const color = isHighConf ? [0.13, 0.78, 0.13] : [0.85, 0.27, 0.27];
      quad.forEach(([x, y, z]) => {
        positions.push(x, y, z);
        colors.push(...color);
      });
      // Quad → 2 triangle: (0,1,2) (0,2,3)
      indices.push(base, base + 1, base + 2);
      indices.push(base, base + 2, base + 3);
      // Edge LineLoop pos: 4 corners + repeat first
      for (let i = 0; i < 4; i += 1) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        edges.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    });
    return {
      positions: new Float32Array(positions),
      indices: new Uint16Array(indices),
      colors: new Float32Array(colors),
      edges: new Float32Array(edges),
    };
  }, [planes]);

  if (!visible || !planes.length || !buffers.positions) return null;

  return (
    <group>
      <mesh renderOrder={49}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
          <bufferAttribute attach="index" args={[buffers.indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.18}
          depthTest={false}
          side={2}  // THREE.DoubleSide
        />
      </mesh>
      <lineSegments renderOrder={50}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#0078D4" depthTest={false} transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}
