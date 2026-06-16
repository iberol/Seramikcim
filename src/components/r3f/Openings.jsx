/**
 * Openings.jsx — kapı/pencere/niş/pervaz outline çizimi
 *
 * Legacy scene.js'teki drawOpenings() port'u. Her opening duvar yüzeyine
 * dikdörtgen kenar olarak çizilir; tip ve confidence'a göre renk değişir.
 */
import React from 'react';
import { useLegacyState, useOpenings } from '../../hooks/useLegacyState.js';

const LIFT = 0.035;

/**
 * normalizeWall — legacy (Vector3/Euler) ve R3F native (array/number) wall
 * formatlarını ortak bir format'a indirir.
 */
function normalizeWall(w) {
  if (!w) return null;
  const rotationY =
    typeof w.rotationY === 'number'
      ? w.rotationY
      : w.rotation?.y ?? 0;
  const position = Array.isArray(w.position)
    ? { x: w.position[0], y: w.position[1], z: w.position[2] }
    : { x: w.position?.x ?? 0, y: w.position?.y ?? 0, z: w.position?.z ?? 0 };
  return {
    id: w.id,
    width: w.width,
    height: w.height,
    rotationY,
    position,
  };
}

function colorFor(opening) {
  if (opening.confidence === 'low') return '#d96c54';
  const t = opening.type || '';
  if (t.includes('window')) return '#5ec4ff';
  if (t.includes('frame'))  return '#b8c2c6';
  if (t === 'niche')        return '#e0b07a';
  return '#e7a438'; // door default
}

function OpeningOutline({ opening, wall }) {
  const W = normalizeWall(wall);
  if (!W) return null;
  const cosY = Math.cos(W.rotationY);
  const sinY = Math.sin(W.rotationY);

  const localX = -W.width / 2 + opening.x + opening.w / 2;
  const localY = -W.height / 2 + opening.y + opening.h / 2;

  const off = (lx, ly, lz) => [
    W.position.x + lx * cosY + lz * sinY,
    W.position.y + ly,
    W.position.z - lx * sinY + lz * cosY,
  ];
  const center = off(localX, localY, LIFT);

  return (
    <mesh position={center} rotation={[0, W.rotationY, 0]}>
      <planeGeometry args={[opening.w, opening.h]} />
      <meshBasicMaterial
        color={colorFor(opening)}
        transparent
        opacity={opening.confidence === 'low' ? 0.35 : 0.55}
        depthTest={false}
        wireframe
      />
    </mesh>
  );
}

function NicheMesh({ opening, wall }) {
  const W = normalizeWall(wall);
  if (!W) return null;
  const cosY = Math.cos(W.rotationY);
  const sinY = Math.sin(W.rotationY);
  const width = Math.min(W.width, opening.w);
  const height = Math.min(W.height, opening.h);
  const depth = Math.max(0.06, opening.d || 0.12);

  const localX = -W.width / 2 + opening.x + width / 2;
  const localY = -W.height / 2 + opening.y + height / 2;

  const offX = W.position.x + localX * cosY;
  const offY = W.position.y + localY;
  const offZ = W.position.z - localX * sinY;

  return (
    <group position={[offX, offY, offZ]} rotation={[0, W.rotationY, 0]}>
      {/* arka panel (niş içi) */}
      <mesh position={[0, 0, -depth / 2]}>
        <boxGeometry args={[width, height, 0.02]} />
        <meshStandardMaterial color="#cfc7b6" roughness={0.55} />
      </mesh>
      {/* kenar çerçevesi */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#e0b07a" wireframe transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

export function Openings({ sceneData }) {
  const legacy = useLegacyState();
  const openings = useOpenings();

  // FAZ 8: legacy state henüz yayınlanmadıysa sceneData.walls'a düş
  const walls = legacy?.walls?.length ? legacy.walls : sceneData?.walls || [];
  if (!walls.length || !openings?.length) return null;

  return (
    <group>
      {openings.map((opening) => {
        const wall = walls.find((w) => w.id === opening.surfaceId);
        if (!wall) return null;
        if (opening.type === 'niche') {
          return <NicheMesh key={opening.id} opening={opening} wall={wall} />;
        }
        return <OpeningOutline key={opening.id} opening={opening} wall={wall} />;
      })}
    </group>
  );
}
