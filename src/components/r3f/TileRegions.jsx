/**
 * TileRegions.jsx — seramik kaplama preview (zemin + duvar)
 *
 * Her tile DOLU gerçek şekliyle render edilir (tam gerçekçilik):
 *  - Tam tile  → dikdörtgen, seramik rengi dolgu + derz hattı
 *  - Kesik tile → polygon-clip gerçek şekli (üçgen/yamuk), kırmızı kenar
 *
 * Hesap (calculation.js validPairs[].clip) ile görsel birebir uyumludur:
 * her validPair bir seramiğe karşılık gelir, clip şekli gerçek kesimi gösterir.
 *
 * Yüzeyler:
 *  - 'floor' → yatay düzlem (y≈0)
 *  - wall id → duvarın pozisyon/rotasyonunda dikey düzlem
 */
import React, { useMemo } from 'react';
import { useSimulation, useLegacyState } from '../../hooks/useLegacyState.js';

const LIFT_FILL = 0.018;
const LIFT_LINE = 0.026;
const LIFT_OUTLINE = 0.030;
const FILL_OPACITY = 0.55;
const LINE_OPACITY = 0.5;
const CUT_COLOR = '#ff5252';

function getSurface(s, surfaceId) {
  if (!s) return null;
  if (!surfaceId || surfaceId === 'floor') return s.floorSurface;
  return s.walls?.find((w) => w.id === surfaceId) || s.floorSurface;
}

function normalizeWall(w) {
  if (!w) return null;
  const rotationY =
    typeof w.rotationY === 'number' ? w.rotationY : w.rotation?.y ?? 0;
  const position = Array.isArray(w.position)
    ? { x: w.position[0], y: w.position[1], z: w.position[2] }
    : { x: w.position?.x ?? 0, y: w.position?.y ?? 0, z: w.position?.z ?? 0 };
  return {
    id: w.id,
    width: w.width,
    height: w.height,
    kind: w.kind || 'wall',
    rotationY,
    position,
  };
}

/**
 * tileLocalPolygon — bir validPair'in tile-local 2D poligonunu döndürür.
 * clip varsa gerçek kesim şekli; yoksa tam dikdörtgen.
 * Koordinatlar rect-relative: (w.start + u, h.start + v).
 */
function tileLocalPolygon(pair) {
  const { w, h, clip } = pair;
  if (Array.isArray(clip) && clip.length >= 3) {
    return clip.map(([u, v]) => [w.start + u, h.start + v]);
  }
  // Tam tile dikdörtgeni
  return [
    [w.start, h.start],
    [w.start + w.size, h.start],
    [w.start + w.size, h.start + h.size],
    [w.start, h.start + h.size],
  ];
}

/**
 * buildTileGeometry — validPairs'ten dolu tile mesh + kenar çizgileri üretir.
 *
 * @param {Array} pairs validPairs (her biri {w,h,isCut,clip})
 * @param {Function} toWorld (u, v) → [x, y, z] (rect-local → dünya)
 * @returns { fillPos, fullEdge, cutEdge }
 */
function buildTileGeometry(pairs, toWorld) {
  const fillPos = [];
  const fullEdge = [];
  const cutEdge = [];
  (pairs || []).forEach((pair) => {
    const poly = tileLocalPolygon(pair);
    if (poly.length < 3) return;
    // Dünya koordinatları
    const wp = poly.map(([u, v]) => toWorld(u, v, LIFT_FILL));
    // Triangle fan dolgu
    for (let i = 1; i < wp.length - 1; i += 1) {
      fillPos.push(...wp[0], ...wp[i], ...wp[i + 1]);
    }
    // Kenar çizgileri (kapalı loop)
    const edgeTarget = pair.isCut ? cutEdge : fullEdge;
    const we = poly.map(([u, v]) => toWorld(u, v, LIFT_LINE));
    for (let i = 0; i < we.length; i += 1) {
      const a = we[i];
      const b = we[(i + 1) % we.length];
      edgeTarget.push(...a, ...b);
    }
  });
  return {
    fillPos: new Float32Array(fillPos),
    fullEdge: new Float32Array(fullEdge),
    cutEdge: new Float32Array(cutEdge),
  };
}

/* ─────────────────────────── FLOOR ─────────────────────────── */

function FloorRegion({ pairs, color, floor }) {
  const left = (floor?.centerX ?? 0) - (floor?.width ?? 0) / 2;
  const back = (floor?.centerZ ?? 0) - (floor?.height ?? 0) / 2;

  const geo = useMemo(() => {
    const toWorld = (u, v, lift) => [left + u, lift, back + v];
    return buildTileGeometry(pairs, toWorld);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, left, back]);

  return <TileMeshGroup geo={geo} color={color} outline={floor?.outlineWorld} />;
}

/* ─────────────────────────── WALL ─────────────────────────── */

function WallRegion({ pairs, color, wall }) {
  const W = normalizeWall(wall);
  const geo = useMemo(() => {
    if (!W || !W.width || !W.height) return null;
    const cosY = Math.cos(W.rotationY);
    const sinY = Math.sin(W.rotationY);
    // Rect-local (u,v) → dünya: u duvar genişliği, v dikey
    const toWorld = (u, v, lift) => {
      const lx = -W.width / 2 + u;
      const ly = -W.height / 2 + v;
      return [
        W.position.x + lx * cosY + lift * sinY,
        W.position.y + ly,
        W.position.z - lx * sinY + lift * cosY,
      ];
    };
    const g = buildTileGeometry(pairs, toWorld);
    // Duvar dış hattı (polygon2D varsa)
    let outline = null;
    const poly = wall?.polygon2D;
    if (Array.isArray(poly) && poly.length >= 2) {
      const arr = new Float32Array(poly.length * 3);
      for (let i = 0; i < poly.length; i += 1) {
        const [x, y, z] = toWorld(poly[i][0], poly[i][1], LIFT_OUTLINE);
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      outline = arr;
    }
    g.outline = outline;
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, wall, W?.width, W?.height, W?.rotationY, W?.position?.x, W?.position?.y, W?.position?.z]);

  if (!geo) return null;
  return <TileMeshGroup geo={geo} color={color} outline={geo.outline} />;
}

/* ─────────────────────────── CURVED WALL ─────────────────────────── */

/**
 * arcSampler — yay polyline'ı (bottom, dünya XZ) boyunca u-mesafesindeki
 * 3D noktayı ve yerel dışa-normali döndürür. u: 0..arcLength.
 */
function makeArcSampler(arcPoints) {
  const pts = arcPoints.map((p) => [p[0], p[2]]); // XZ
  const segLen = [];
  const cum = [0];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segLen.push(d);
    cum.push(cum[i] + d);
  }
  const total = cum[cum.length - 1] || 1;
  return (u) => {
    const uu = Math.max(0, Math.min(total, u));
    // u'nun düştüğü segmenti bul
    let s = 0;
    while (s < segLen.length - 1 && cum[s + 1] < uu) s += 1;
    const t = segLen[s] > 1e-9 ? (uu - cum[s]) / segLen[s] : 0;
    const ax = pts[s][0], az = pts[s][1];
    const bx = pts[s + 1][0], bz = pts[s + 1][1];
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // Segment tanjantı → dışa normal (XZ'de 90° döndür)
    const tx = bx - ax, tz = bz - az;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl; // sol-normal
    return { x, z, nx, nz };
  };
}

function CurvedWallRegion({ pairs, color, wall }) {
  const geo = useMemo(() => {
    const arc = wall?.arcPoints;
    if (!Array.isArray(arc) || arc.length < 2) return null;
    const sampler = makeArcSampler(arc);
    const baseY = arc[0][1]; // taban y
    // u: yay boyunca mesafe, v: dikey. lift: dışa normal yönünde küçük ofset.
    const toWorld = (u, v, lift) => {
      const { x, z, nx, nz } = sampler(u);
      return [x + nx * lift, baseY + v, z + nz * lift];
    };
    const g = buildTileGeometry(pairs, toWorld);
    // Dış hat: yay boyunca alt + üst kenar
    const H = wall.height || 0;
    const outPts = [];
    const N = arc.length;
    // alt kenar
    for (let i = 0; i < N; i += 1) outPts.push([arc[i][0], baseY + LIFT_OUTLINE, arc[i][2]]);
    // üst kenar (geri)
    for (let i = N - 1; i >= 0; i -= 1) outPts.push([arc[i][0], baseY + H, arc[i][2]]);
    outPts.push([arc[0][0], baseY + LIFT_OUTLINE, arc[0][2]]);
    g.outline = new Float32Array(outPts.flat());
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, wall]);

  if (!geo) return null;
  return <TileMeshGroup geo={geo} color={color} outline={geo.outline} />;
}

/* ─────────────────────── ORTAK RENDER ─────────────────────── */

function TileMeshGroup({ geo, color, outline }) {
  if (!geo) return null;
  return (
    <group>
      {geo.fillPos.length > 0 && (
        <mesh renderOrder={16}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[geo.fillPos, 3]} />
          </bufferGeometry>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={FILL_OPACITY}
            depthTest={false}
            depthWrite={false}
            side={2}
          />
        </mesh>
      )}
      {geo.fullEdge.length > 0 && (
        <lineSegments renderOrder={20}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[geo.fullEdge, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#ffffff" transparent opacity={LINE_OPACITY} depthTest={false} />
        </lineSegments>
      )}
      {geo.cutEdge.length > 0 && (
        <lineSegments renderOrder={21}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[geo.cutEdge, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={CUT_COLOR} transparent opacity={0.95} depthTest={false} />
        </lineSegments>
      )}
      {outline && outline.length > 0 && (
        <line renderOrder={22}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[outline, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd000" depthTest={false} transparent opacity={1} />
        </line>
      )}
    </group>
  );
}

/* ─────────────────────────── DISPATCH ─────────────────────────── */

function RegionRender({ region, result, color, surface, floor }) {
  const validPairs = result?.validPairs || null;
  const rect = region?.drawRect || region;

  if (!surface) return null;
  if (!rect?.w || !rect?.h) return null;
  if (!validPairs || validPairs.length === 0) return null;

  if (surface.kind === 'floor') {
    return <FloorRegion pairs={validPairs} color={color} floor={floor} />;
  }
  if (surface.kind === 'curved' && Array.isArray(surface.arcPoints)) {
    return <CurvedWallRegion pairs={validPairs} color={color} wall={surface} />;
  }
  return <WallRegion pairs={validPairs} color={color} wall={surface} />;
}

export function TileRegions() {
  const legacy = useLegacyState();
  const simulation = useSimulation();

  if (!legacy || !simulation?.byProduct) return null;

  const elements = [];
  const entries = simulation.byProduct instanceof Map
    ? Array.from(simulation.byProduct.entries())
    : Object.entries(simulation.byProduct || {});

  for (const [, entry] of entries) {
    const color = entry?.product?.color || '#8aa39a';
    (entry?.regions || []).forEach((wrap, idx) => {
      const region = wrap.region;
      const result = wrap.result;
      const surface = getSurface(legacy, region?.surfaceId);
      elements.push(
        <RegionRender
          key={`${entry.product.id}:${region?.id || idx}`}
          region={region}
          result={result}
          color={color}
          surface={surface}
          floor={legacy.floorSurface}
        />,
      );
    });
  }
  return <group>{elements}</group>;
}
