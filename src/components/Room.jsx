/**
 * Room.jsx — sceneData'dan zemin ve duvar mesh'lerini oluşturur.
 *
 * Duvar segmentleri makeWallSegments() ile hesaplanır; Leva paneli ile
 * duvar görünürlüğü ve doku rengi değiştirilebilir.
 */
import React, { useMemo } from 'react';
import { useControls, folder } from 'leva';
import { makeWallSegments } from '../threejs/builders.js';
import { logger } from '../utils/logger.js';

export function Room({ sceneData }) {
  const walls = useMemo(() => {
    const segs = sceneData?.walls || makeWallSegments(sceneData);
    if (!segs.length) {
      logger.warn('[Room] Wall segments boş — geometriyi kontrol edin.');
    }
    return segs;
  }, [sceneData]);

  const { wallColor, floorColor, wallOpacity, showWalls, showFloor } = useControls(
    'Oda',
    {
      Renkler: folder({
        wallColor: { value: '#dcdcd2', label: 'Duvar' },
        floorColor: { value: '#a89881', label: 'Zemin' },
      }),
      Görünüm: folder({
        showWalls: { value: true, label: 'Duvarlar' },
        showFloor: { value: true, label: 'Zemin' },
        wallOpacity: { value: 0.95, min: 0.1, max: 1, step: 0.05, label: 'Duvar opaklık' },
      }),
    },
    { collapsed: false },
  );

  const { roomWidthM, roomDepthM, wallHeight } = sceneData;

  return (
    <group>
      {showFloor && (
        <mesh
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomWidthM, roomDepthM]} />
          <meshStandardMaterial color={floorColor} roughness={0.8} />
        </mesh>
      )}

      {showWalls &&
        walls.map((wall) => (
          <mesh
            key={wall.id}
            position={wall.position}
            rotation={[0, wall.rotationY, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wall.width, wall.height, 0.10]} />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.6}
              transparent={wallOpacity < 1}
              opacity={wallOpacity}
            />
          </mesh>
        ))}

      {/* Bilgi: oda boyutları */}
      <mesh position={[0, wallHeight + 0.3, 0]} visible={false}>
        <sphereGeometry args={[0.1]} />
      </mesh>
    </group>
  );
}
