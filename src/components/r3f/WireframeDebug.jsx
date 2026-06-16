/**
 * WireframeDebug.jsx — wireframe wall candidate edge'lerini render eder.
 *
 * Pipeline'ın mesh_to_3d.extract_wall_candidates_from_edges çıktısını
 * (geometryData.wireframe_debug.wall_candidates) görselleştirir.
 * Default kapalı; Leva "Wireframe debug" toggle ile açılır.
 *
 * Dikey edge'ler yeşil, yatay edge'ler turuncu — duvar köşelerini tespit
 * için kullanışlı.
 */
import React, { useMemo } from 'react';

export function WireframeDebug({ geometryData, visible }) {
  const candidates = geometryData?.wireframe_debug?.wall_candidates || [];

  const { verticalBuffer, horizontalBuffer } = useMemo(() => {
    const v = [];
    const h = [];
    candidates.forEach((c) => {
      const target = c.is_vertical ? v : h;
      target.push(c.start[0], c.start[1], c.start[2]);
      target.push(c.end[0],   c.end[1],   c.end[2]);
    });
    return {
      verticalBuffer: new Float32Array(v),
      horizontalBuffer: new Float32Array(h),
    };
  }, [candidates]);

  if (!visible || !candidates.length) return null;

  return (
    <group>
      {verticalBuffer.length > 0 && (
        <lineSegments renderOrder={50}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[verticalBuffer, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#16A34A" depthTest={false} transparent opacity={0.9} />
        </lineSegments>
      )}
      {horizontalBuffer.length > 0 && (
        <lineSegments renderOrder={50}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[horizontalBuffer, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#D97706" depthTest={false} transparent opacity={0.7} />
        </lineSegments>
      )}
    </group>
  );
}
