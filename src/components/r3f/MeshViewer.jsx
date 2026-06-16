/**
 * MeshViewer.jsx — ham OBJ mesh viewer (Three.js OBJLoader)
 *
 * Pipeline ile paralel: extracted oda geometrisi yerine ya da yanında
 * orijinal OBJ dosyasını olduğu gibi gösterir. Vite static serve eder
 * (/current_mesh.obj). Pipeline tarafından kopyalanır
 * (prepare_simulation._prepare_mesh).
 *
 * Otomatik:
 *  - Mesh center → sahne origin
 *  - Auto-fit: scale uygulanır, oda kabuğu Room.jsx ile aynı ölçekte
 *  - Material: default OBJ material yoksa cream PBR fallback
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e8e2d4',
  roughness: 0.62,
  metalness: 0.02,
  side: THREE.DoubleSide,
});

/**
 * Mesh otomatik merkezleme + scale.
 * scale_factor_to_meters varsa o uygulanır (mesh_to_3d auto-scale tespit etti).
 */
function MeshContent({ url, scaleFactor, roomCenter, opacity, showWireframe }) {
  const obj = useLoader(OBJLoader, url);

  const prepared = useMemo(() => {
    if (!obj) return null;
    const clone = obj.clone(true);

    // Material atama: orijinal yoksa default
    clone.traverse((child) => {
      if (child.isMesh) {
        if (!child.material || child.material.length === 0) {
          child.material = DEFAULT_MATERIAL.clone();
        } else if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.transparent = opacity < 1;
            m.opacity = opacity;
            m.wireframe = showWireframe;
            m.side = THREE.DoubleSide;
          });
        } else {
          const m = child.material;
          m.transparent = opacity < 1;
          m.opacity = opacity;
          m.wireframe = showWireframe;
          m.side = THREE.DoubleSide;
        }
        // Shadow KAPALI: aşırı ölçek farkında (örn. 0.0254) shadow camera
        // frustum'u dejenere olup render thread'i kilitleyebiliyor.
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    // {base}_mesh.obj normalize edilmiş (XZ-merkez, Y=0) HAM birim mesh'tir;
    // wall_planes ile AYNI frame'de. buildWallsFromPlanes duvarları
    // (x − roomCenterUnits) × scale ile çeviriyor → mesh'e AYNI transform'u
    // uygula ki tile duvarlarıyla birebir hizalansın.
    // world = v*scale − center*scale  ⇒  scale.setScalar(s); position = −center*s
    const s = scaleFactor && scaleFactor > 0 ? scaleFactor : 1;
    const cx = roomCenter?.x || 0;
    const cz = roomCenter?.y || 0; // roomCenterUnits.y = z ekseni (plan)
    clone.scale.setScalar(s);
    clone.position.set(-cx * s, 0, -cz * s);

    return clone;
  }, [obj, scaleFactor, roomCenter?.x, roomCenter?.y, opacity, showWireframe]);

  if (!prepared) return null;
  return <primitive object={prepared} />;
}

export function MeshViewer({ url, scaleFactor = 1, roomCenter = null, opacity = 1, showWireframe = false }) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    // URL erişilebilir mi diye HEAD ile kontrol
    let cancelled = false;
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled && !r.ok) setErrored(true);
      })
      .catch(() => !cancelled && setErrored(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (errored) return null;

  return (
    <React.Suspense fallback={null}>
      <MeshContent
        url={url}
        scaleFactor={scaleFactor}
        roomCenter={roomCenter}
        opacity={opacity}
        showWireframe={showWireframe}
      />
    </React.Suspense>
  );
}
