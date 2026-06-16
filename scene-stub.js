/**
 * scene-stub.js — FAZ 2 köprüsü: vanilla Three.js sahne kontrolcüsü
 * R3F bileşenlerine devredildi; bu shim mevcut main.js API çağrılarını
 * koruyarak rendering operasyonlarını no-op'a indirger.
 *
 * deriveSceneData scene.js'ten yeniden ihraç edilir (R3F bileşenleri de
 * src/threejs/builders.js içinden kendi pure helper'larıyla okur).
 *
 * setCamera('top'|'front'|...) çağrıldığında 'r3f-set-camera' custom event
 * yayınlanır; gelecekte R3F SceneControls bileşeni bunu dinleyip kamerayı
 * konumlandırır.
 */
export { deriveSceneData } from './src/threejs/builders.js';

export function createSceneController({ sceneData }) {
  const metrics = {
    roomWidthM: sceneData?.roomWidthM ?? 0,
    roomDepthM: sceneData?.roomDepthM ?? 0,
  };

  function publishCamera(view) {
    try {
      window.dispatchEvent(new CustomEvent('r3f:set-camera', { detail: view }));
    } catch {
      /* SSR ya da non-browser context */
    }
  }

  return {
    metrics,
    getWarnings: () => [],
    renderStructureModel: () => {},
    renderLayouts: () => {},
    renderFixtures: () => {},
    setCamera: publishCamera,
    addRoomModel: () => {},
    resize: () => {},
    start: () => {},
  };
}
