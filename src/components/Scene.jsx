/**
 * Scene.jsx — R3F Canvas kapsayıcı + temel ışıklandırma + kamera kontrolleri.
 *
 * Leva paneli ile parametre değiştirme; Room bileşeni geometri verisinden
 * oda mesh'lerini oluşturur.
 */
import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useControls, folder } from 'leva';
import { deriveSceneData } from '../threejs/builders.js';
import { Room } from './Room.jsx';
import { Fixtures } from './r3f/Fixtures.jsx';
import { TileRegions } from './r3f/TileRegions.jsx';
import { Openings } from './r3f/Openings.jsx';
import { MeshViewer } from './r3f/MeshViewer.jsx';
import { WireframeDebug } from './r3f/WireframeDebug.jsx';
import { WallPlanesOverlay } from './r3f/WallPlanesOverlay.jsx';
import { FloorPolygonOverlay } from './r3f/FloorPolygonOverlay.jsx';
import { SurfacePicker } from './r3f/SurfacePicker.jsx';

/**
 * CameraRig — kamera/controls'a window üzerinden erişim + duvara dik bakış.
 *
 * window.__seramikcimCamera.faceWall(wallId): seçili duvara tam dik bakış.
 * window.__seramikcimCamera.lookAt(pos, target): genel kamera ayarı.
 * Debug/doğrulama için; OrbitControls makeDefault ile uyumlu.
 */
function CameraRig({ sceneData }) {
  const { camera, controls } = useThree();
  const ref = useRef({ camera, controls, sceneData });
  ref.current = { camera, controls, sceneData };

  useEffect(() => {
    const api = {
      lookAt(pos, target) {
        const c = ref.current;
        if (!c.camera) return;
        c.camera.position.set(pos[0], pos[1], pos[2]);
        if (c.controls?.target) {
          c.controls.target.set(target[0], target[1], target[2]);
          c.controls.update();
        } else {
          c.camera.lookAt(target[0], target[1], target[2]);
        }
        c.camera.updateProjectionMatrix();
      },
      // Header butonları (Genel/Üst/Zemin) → r3f:set-camera event'i ile çağrılır.
      setView(view) {
        const sd = ref.current.sceneData || {};
        const w = sd.roomWidthM || 3;
        const d = sd.roomDepthM || 3;
        const h = sd.wallHeight || 2.7;
        const span = Math.max(w, d);
        const dist = span * 1.5 + 1;
        const midY = h * 0.45;
        switch (view) {
          case 'top':
          case 'floor':
            // Kuşbakışı — zemin odaklı (z'de küçük offset gimbal lock'u önler)
            this.lookAt([0, span * 1.8 + 1, 0.001], [0, 0, 0]);
            break;
          case 'front':
            this.lookAt([0, midY, dist], [0, midY, 0]);
            break;
          case 'general':
          default:
            this.lookAt([dist, dist * 0.8, dist], [0, midY, 0]);
            break;
        }
      },
      faceWall(wallId) {
        const wall = window.__seramikcim?.walls?.find((w) => w.id === wallId);
        if (!wall) return false;
        const p = wall.position || [0, 1.3, 0];
        // Normal yönü (varsa) — duvara dik dış bakış mesafesi
        const n = wall.normal || [Math.sin(-wall.rotationY || 0), 0, Math.cos(-wall.rotationY || 0)];
        const dist = Math.max(wall.width || 2, wall.height || 2.7) * 1.4 + 1;
        const tx = p[0];
        const ty = p[1];
        const tz = p[2];
        // Kamera duvar normalinin TERS yönünde (dışarıdan içeri bakar)
        this.lookAt([tx + n[0] * dist, ty, tz + n[2] * dist], [tx, ty, tz]);
        return true;
      },
    };
    window.__seramikcimCamera = api;
    // Header view butonları → scene-stub r3f:set-camera event'i yayınlar
    const onSetCamera = (e) => api.setView(e.detail);
    window.addEventListener('r3f:set-camera', onSetCamera);
    return () => {
      window.removeEventListener('r3f:set-camera', onSetCamera);
      if (window.__seramikcimCamera === api) delete window.__seramikcimCamera;
    };
  }, []);

  return null;
}

export function Scene({ geometryData }) {
  const sceneData = useMemo(() => deriveSceneData(geometryData), [geometryData]);
  const geometryMode = geometryData?.meta?.geometry_mode;
  // mesh-derived modlar: mesh-face (face-based v3), wireframe-driven, section, legacy 'mesh', aabb
  const isMeshMode = (
    geometryMode === 'mesh'
    || geometryMode === 'mesh-face'
    || geometryMode === 'wireframe-driven'
    || geometryMode === 'section'
    || geometryMode === 'aabb'
  );
  const isFaceBasedMode = ['mesh-face', 'wireframe-driven', 'section'].includes(geometryMode);
  const meshUrl = geometryData?.meta?.mesh_view_url || '/current_mesh.obj';

  const {
    showGrid, showAxes, ambientIntensity, dirIntensity,
    meshOpacity, meshWireframe, showWireframeDebug, showWallPlanes, showFloorPolygon,
  } = useControls(
    'Sahne',
    {
      Görünüm: folder({
        showGrid: { value: true, label: 'Izgara' },
        showAxes: { value: true, label: 'Eksen Yardımcısı' },
      }),
      Işık: folder({
        ambientIntensity: { value: 0.6, min: 0, max: 2, step: 0.05, label: 'Ortam' },
        dirIntensity: { value: 0.9, min: 0, max: 3, step: 0.05, label: 'Yönlü' },
      }),
      'OBJ Görüntü': folder({
        // Face-based mode'da mesh yarı saydam default → tile overlay görünür
        meshOpacity: { value: isFaceBasedMode ? 0.55 : 1.0, min: 0.1, max: 1, step: 0.05, label: 'Opaklık' },
        meshWireframe: { value: false, label: 'Wireframe' },
      }),
      'Debug': folder(
        {
          showWireframeDebug: { value: false, label: 'Wireframe Geometry Debug', hint: 'Pipeline duvar edge tespitini overlay olarak göster' },
          showWallPlanes: { value: false, label: 'Wall Planes (face-based)', hint: 'Face-based mode\'da çıkarılan 3D duvar quad\'larını göster' },
          showFloorPolygon: { value: false, label: 'Floor Polygon (turuncu)', hint: 'Tile placement zemin sınırını göster' },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

  const cameraDist = Math.max(sceneData.roomWidthM, sceneData.roomDepthM) * 1.5 + 1;

  // WebGL context yönetimi: context kaybında donmayı önle + unmount'ta
  // context'i AKTİF serbest bırak (model değiştirme = reload; tarayıcının
  // ~16 context limitine ardışık yüklemelerde takılmasını engeller).
  const handleCreated = ({ gl }) => {
    const canvas = gl.domElement;
    const onLost = (e) => {
      e.preventDefault(); // tarayıcı restore deneyebilsin (donma yerine)
      // eslint-disable-next-line no-console
      console.warn('[Scene] WebGL context kaybedildi — restore bekleniyor.');
    };
    canvas.addEventListener('webglcontextlost', onLost, false);
    // Sayfa kapanış/yenilemede context'i hemen bırak → GPU kaynağı serbest
    const release = () => {
      try { gl.forceContextLoss(); } catch { /* ignore */ }
      try { gl.dispose(); } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', release, { once: true });
  };

  return (
    <Canvas
      shadows
      camera={{ position: [cameraDist, cameraDist * 0.8, cameraDist], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ powerPreference: 'high-performance', antialias: true, preserveDrawingBuffer: false }}
      onCreated={handleCreated}
    >
      <color attach="background" args={['#1a1d24']} />
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={dirIntensity}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Render stratejisi:
          - Mesh modu (OBJ)  → ham OBJ doğrudan render edilir (gerçek detay)
          - CAD modu (DXF)   → Room.jsx (duvar segment kutuları)
          Pipeline mesh için sadece ölçüm verisi üretir; render asla kabuk değildir.
      */}
      {isMeshMode ? (
        <MeshViewer
          url={meshUrl}
          scaleFactor={sceneData.unitToMeters}
          roomCenter={sceneData.roomCenterUnits}
          opacity={meshOpacity}
          showWireframe={meshWireframe}
        />
      ) : (
        <Room sceneData={sceneData} />
      )}
      <Fixtures />
      <Openings sceneData={sceneData} />
      <TileRegions />
      <SurfacePicker />
      <WireframeDebug geometryData={geometryData} visible={showWireframeDebug} />
      <WallPlanesOverlay geometryData={geometryData} visible={showWallPlanes} />
      <FloorPolygonOverlay geometryData={geometryData} visible={showFloorPolygon} />
      {showGrid && (
        <gridHelper args={[20, 20, '#444', '#2a2a2a']} position={[0, 0, 0]} />
      )}
      {showAxes && (
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ff5252', '#7fff7f', '#4f9dff']} labelColor="#fff" />
        </GizmoHelper>
      )}
      <OrbitControls makeDefault target={[0, 1, 0]} />
      <CameraRig sceneData={sceneData} />
    </Canvas>
  );
}
