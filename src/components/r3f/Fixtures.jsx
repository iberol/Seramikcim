/**
 * Fixtures.jsx — R3F fixture render bileşenleri
 *
 * legacy scene.js'teki addSinkMesh/addToiletMesh/addShowerMesh/addDrainMesh
 * mantığını React + R3F'e port eder. Legacy state'in fixtures listesini
 * useFixtures() ile okur ve her birini fixtureKind'e göre çizer.
 */
import React from 'react';
import { useFixtures, useProducts } from '../../hooks/useLegacyState.js';

const MAT_FIXTURE = { color: '#f0ece6', roughness: 0.32, metalness: 0.05 };
const MAT_METAL   = { color: '#a8a8a8', roughness: 0.25, metalness: 0.85 };
const MAT_DRAIN   = { color: '#3a3d40', roughness: 0.5,  metalness: 0.6 };

function Sink() {
  return (
    <group>
      {/* base box */}
      <mesh position={[0, 0.27, 0]} castShadow>
        <boxGeometry args={[0.62, 0.54, 0.42]} />
        <meshStandardMaterial {...MAT_FIXTURE} />
      </mesh>
      {/* basin cylinder (oval) */}
      <mesh position={[0, 0.62, 0]} scale={[1, 1, 0.72]} castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.13, 36]} />
        <meshStandardMaterial {...MAT_FIXTURE} />
      </mesh>
      {/* tap torus */}
      <mesh position={[0, 0.74, -0.18]} rotation={[Math.PI / 2, 0, Math.PI]}>
        <torusGeometry args={[0.075, 0.012, 12, 24, Math.PI]} />
        <meshStandardMaterial {...MAT_METAL} />
      </mesh>
    </group>
  );
}

function Toilet() {
  return (
    <group>
      {/* bowl */}
      <mesh position={[0, 0.28, 0.05]} scale={[1, 1, 1.28]} castShadow>
        <cylinderGeometry args={[0.23, 0.18, 0.34, 36]} />
        <meshStandardMaterial {...MAT_FIXTURE} />
      </mesh>
      {/* tank */}
      <mesh position={[0, 0.72, -0.34]} castShadow>
        <boxGeometry args={[0.48, 0.42, 0.16]} />
        <meshStandardMaterial {...MAT_FIXTURE} />
      </mesh>
    </group>
  );
}

function Shower({ product }) {
  const w = Number(product?.width_m) || 0.9;
  const d = Number(product?.depth_m) || 0.9;
  return (
    <mesh position={[0, 0.04, 0]} castShadow>
      <boxGeometry args={[w, 0.08, d]} />
      <meshStandardMaterial {...MAT_FIXTURE} />
    </mesh>
  );
}

function Drain() {
  return (
    <mesh position={[0, 0.022, 0]} castShadow>
      <cylinderGeometry args={[0.105, 0.105, 0.018, 36]} />
      <meshStandardMaterial {...MAT_DRAIN} />
    </mesh>
  );
}

function FixtureMesh({ fixture, product }) {
  const kind = product?.fixtureKind || 'drain';
  return (
    <group position={[fixture.x || 0, 0, fixture.z || 0]}>
      {kind === 'sink' && <Sink />}
      {kind === 'toilet' && <Toilet />}
      {kind === 'shower' && <Shower product={product} />}
      {!['sink', 'toilet', 'shower'].includes(kind) && <Drain />}
    </group>
  );
}

export function Fixtures() {
  const fixtures = useFixtures();
  const products = useProducts();

  return (
    <group>
      {fixtures.map((fixture) => {
        const product = products.find((p) => p.id === fixture.productId);
        if (!product) return null;
        return (
          <FixtureMesh
            key={fixture.id || `${fixture.productId}:${fixture.x}:${fixture.z}`}
            fixture={fixture}
            product={product}
          />
        );
      })}
    </group>
  );
}
