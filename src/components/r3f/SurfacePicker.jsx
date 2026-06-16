/**
 * SurfacePicker.jsx — Face Select: her duvar/zemin için tıklanabilir düzlem.
 *
 * Kaplı yüzeyler (tiledSurfaceIds) neredeyse görünmez (tile grid TileRegions'ta
 * çizilir). Kaplanmamış yüzeyler soluk gri + tıklanabilir (kullanıcı tıklayıp
 * ekler). Hover'da highlight. Tıklama window.__seramikcimToggleSurface ile
 * legacy state'i toggle eder ve re-simülasyon tetikler.
 *
 * Pipeline'ın önerdiği iç duvarlar (decision.tileable) zaten auto-tile ile
 * başlangıçta kaplı gelir; bu bileşen yalnız override (aç/kapa) sağlar.
 */
import React, { useState, useMemo } from 'react';
import { useLegacyState } from '../../hooks/useLegacyState.js';

const PICK_LIFT = 0.012; // tile fill'in (0.018) hafif altında — z-fight önle

function normalizeWall(w) {
  if (!w) return null;
  const rotationY = typeof w.rotationY === 'number' ? w.rotationY : w.rotation?.y ?? 0;
  const position = Array.isArray(w.position)
    ? { x: w.position[0], y: w.position[1], z: w.position[2] }
    : { x: w.position?.x ?? 0, y: w.position?.y ?? 0, z: w.position?.z ?? 0 };
  return { id: w.id, width: w.width, height: w.height, kind: w.kind, rotationY, position, arcPoints: w.arcPoints };
}

// Orbit (sürükleme) ile seçim (tık) ayrımı: R3F event'i `delta` = pointerdown'dan
// beri kat edilen piksel mesafesi. Eşik üstü hareket = kamera döndürme → toggle yok.
const CLICK_DRAG_PX = 6;

function PickPlane({ id, tiled, hovered, setHover, children, ...meshProps }) {
  const onClick = (e) => {
    e.stopPropagation();
    if (typeof e.delta === 'number' && e.delta > CLICK_DRAG_PX) return; // sürükleme
    if (typeof window !== 'undefined' && window.__seramikcimToggleSurface) {
      window.__seramikcimToggleSurface(id);
    }
  };
  // Kaplı: çok düşük opaklık (tile görünür). Kaplanmamış: soluk gri. Hover: highlight.
  const color = hovered ? '#4f9dff' : (tiled ? '#8aa39a' : '#9aa0a6');
  const opacity = hovered ? 0.30 : (tiled ? 0.0 : 0.22);
  return (
    <mesh
      {...meshProps}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); setHover(id); }}
      onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
      renderOrder={10}
    >
      {children}
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={2} />
    </mesh>
  );
}

export function SurfacePicker() {
  const legacy = useLegacyState();
  const [hovered, setHover] = useState(null);

  const tiledIds = useMemo(
    () => new Set(legacy?.settings?.tiledSurfaceIds || []),
    [legacy?.settings?.tiledSurfaceIds],
  );

  if (!legacy) return null;
  const walls = legacy.walls || [];
  const floor = legacy.floorSurface;
  const elements = [];

  // Zemin pickable (yatay düzlem)
  if (floor) {
    const fw = floor.width || 0;
    const fh = floor.height || 0;
    const cx = floor.centerX ?? 0;
    const cz = floor.centerZ ?? 0;
    if (fw > 0.05 && fh > 0.05) {
      elements.push(
        <PickPlane
          key="floor"
          id="floor"
          tiled={tiledIds.has('floor')}
          hovered={hovered === 'floor'}
          setHover={setHover}
          position={[cx, PICK_LIFT, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[fw, fh]} />
        </PickPlane>,
      );
    }
  }

  // Duvarlar pickable (dikey düzlem). Eğri duvar: segment planeleri.
  walls.forEach((raw) => {
    const w = normalizeWall(raw);
    if (!w || !w.width || !w.height) return;
    const tiled = tiledIds.has(w.id);
    const hov = hovered === w.id;

    if (w.kind === 'curved' && Array.isArray(w.arcPoints) && w.arcPoints.length >= 2) {
      // Eğri: her arc segmenti için ince pickable plane
      const arc = w.arcPoints;
      const baseY = arc[0][1];
      for (let i = 0; i < arc.length - 1; i += 1) {
        const a = arc[i];
        const b = arc[i + 1];
        const segW = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (segW < 0.02) continue;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[2] + b[2]) / 2;
        const rotY = -Math.atan2(b[2] - a[2], b[0] - a[0]);
        elements.push(
          <PickPlane
            key={`${w.id}-seg${i}`}
            id={w.id}
            tiled={tiled}
            hovered={hov}
            setHover={setHover}
            position={[mx, baseY + w.height / 2, mz]}
            rotation={[0, rotY, 0]}
          >
            <planeGeometry args={[segW, w.height]} />
          </PickPlane>,
        );
      }
      return;
    }

    elements.push(
      <PickPlane
        key={w.id}
        id={w.id}
        tiled={tiled}
        hovered={hov}
        setHover={setHover}
        position={[w.position.x, w.position.y, w.position.z]}
        rotation={[0, w.rotationY, 0]}
      >
        <planeGeometry args={[w.width, w.height]} />
      </PickPlane>,
    );
  });

  return <group>{elements}</group>;
}
