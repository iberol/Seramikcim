import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { escapeHtml } from './src/utils/escape.js';
import fallbackGeometryData from './banyo_geometry.json';
import fallbackBuildingData from './banyo_building.json';
import { createStateManager, fmt, cm, formatCurrency } from './state.js';
import { runSimulation } from './calculation.js';
import { createSceneController, deriveSceneData } from './scene-stub.js';
import { initTheme, mountThemeToggle } from './src/theme.js';
import { registerPanel, restoreAllPanels } from './src/floatingPanels.js';
import { setSimState } from './src/ui/simulationLifecycle.js';
import { mountSimulationToastBridge } from './src/ui/toastBridge.js';
import { mountTopMenuRestore } from './src/ui/topMenuRestore.js';
import { logger } from './src/utils/logger.js'; // MERKEZİ LOGGER

initTheme();
logger.info("Uygulama baslatiliyor (sayfa yuklenmesi)");

// Global hata yakalayici
window.onerror = (msg, src, line, col, err) => {
  logger.error(`[GlobalError] ${msg} @ ${src}:${line}:${col}`, err);
};
window.addEventListener('unhandledrejection', (ev) => {
  logger.error('[UnhandledRejection]', ev.reason);
});

const geometryModules = import.meta.glob('./*_geometry.json');
const buildingModules = import.meta.glob('./*_building.json');
const MODEL_STORAGE_KEY = 'seramikcim.active-model';

async function loadJsonResult(url, fallback) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) {
      return { data: await response.json(), fallbackUsed: false, url };
    }
    return { data: fallback, fallbackUsed: true, url, reason: `HTTP ${response.status}` };
  } catch (error) {
    logger.warn(`${url} okunamadi`, error);
    return { data: fallback, fallbackUsed: true, url, reason: String(error) };
  }
}

function modelIdFromGeometryPath(path) {
  return path.replace('./', '').replace('_geometry.json', '');
}

function formatModelLabel(modelId) {
  if (modelId === 'current') return 'Aktif CAD';
  return modelId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const availableBundledModelIds = Object.keys(geometryModules)
  .map(modelIdFromGeometryPath)
  .filter((id) => id !== 'current')
  .sort((a, b) => a.localeCompare(b, 'tr'));

const modelOptions = [
  { id: 'current', label: 'Aktif CAD' },
  ...availableBundledModelIds.map((id) => ({ id, label: formatModelLabel(id) })),
];

function readRequestedModelId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('model');
  if (fromUrl && modelOptions.some((option) => option.id === fromUrl)) return fromUrl;
  const fromStorage = localStorage.getItem(MODEL_STORAGE_KEY);
  if (fromStorage && modelOptions.some((option) => option.id === fromStorage)) return fromStorage;
  return 'current';
}

async function loadSelectedModel(modelId) {
  logger.info(`Model yukleniyor: ${modelId}`);
  if (modelId === 'current') {
    const [geometryResult, buildingResult] = await Promise.all([
      loadJsonResult('/current_geometry.json', fallbackGeometryData),
      loadJsonResult('/current_building.json', fallbackBuildingData),
    ]);
    return {
      geometryData: geometryResult.data,
      buildingData: buildingResult.data,
      activeModelId: 'current',
      dataFallbackUsed: geometryResult.fallbackUsed || buildingResult.fallbackUsed,
      dataLoadWarnings: [
        geometryResult.fallbackUsed ? `Aktif geometri okunamadi (${geometryResult.reason || geometryResult.url}); yedek banyo modeli kullaniliyor.` : null,
        buildingResult.fallbackUsed ? `Aktif CAD kontrol verisi okunamadi (${buildingResult.reason || buildingResult.url}); yedek CAD verisi kullaniliyor.` : null,
      ].filter(Boolean),
    };
  }

  const geometryLoader = geometryModules[`./${modelId}_geometry.json`];
  const buildingLoader = buildingModules[`./${modelId}_building.json`];
  if (!geometryLoader || !buildingLoader) {
    const current = await loadSelectedModel('current');
    return {
      ...current,
      dataFallbackUsed: true,
      dataLoadWarnings: [
        `Secilen model bulunamadi (${modelId}); aktif CAD verisine donuldu.`,
        ...(current.dataLoadWarnings || []),
      ],
    };
  }

  const [geometryModule, buildingModule] = await Promise.all([geometryLoader(), buildingLoader()]);
  return {
    geometryData: geometryModule.default || geometryModule,
    buildingData: buildingModule.default || buildingModule,
    activeModelId: modelId,
    dataFallbackUsed: false,
    dataLoadWarnings: [],
  };
}

const requestedModelId = readRequestedModelId();
let {
  geometryData,
  buildingData,
  activeModelId,
  dataFallbackUsed,
  dataLoadWarnings,
} = await loadSelectedModel(requestedModelId);
const catalogResult = await loadJsonResult('/catalog.json', { products: [] });
const catalog = catalogResult.data;
const products = catalog.products || [];
const tileProducts = products.filter((product) => product.type === 'tile');
const fixtureProducts = products.filter((product) => product.type === 'fixture' || product.type === 'accessory');
const runtimeWarnings = [
  ...(dataLoadWarnings || []),
  catalogResult.fallbackUsed ? `Urun katalogu okunamadi (${catalogResult.reason || catalogResult.url}); magaza bos acilacak.` : null,
  !products.length ? 'Urun katalogunda urun bulunamadi; envanter ve seramik secimi sinirli calisir.' : null,
].filter(Boolean);

const $ = (id) => document.getElementById(id);
const dom = {
  viewerCanvas: $('viewer-canvas'),
  loadingOverlay: $('loading-overlay'),
  launcherPanel: $('launcher-panel'),
  launcherOpenBtn: $('launcher-open-btn'),
  launcherCloseBtn: $('launcher-close-btn'),
  launcherCadSelect: $('launcher-cad-select'),
  launcherRefreshBtn: $('launcher-refresh-btn'),
  launcherRunBtn: $('launcher-run-btn'),
  launcherStatus: $('launcher-status'),
  modelSelect: $('model-select'),
  sourceLabel: $('source-label'),
  surfaceSelect: $('surface-select'),
  wallSelect: $('wall-select'),
  defaultTileSelect: $('default-tile-select'),
  regionTileSelect: $('region-tile-select'),
  groutSelect: $('grout-select'),
  wasteInput: $('waste-input'),
  originSelect: $('origin-select'),
  orientationSelect: $('orientation-select'),
  resultArea: $('result-area'),
  resultRequired: $('result-required'),
  resultOrder: $('result-order'),
  resultCuts: $('result-cuts'),
  cutPlanList: $('cut-plan-list'),
  reuseList: $('reuse-list'),
  warningList: $('warning-list'),
  productChart: $('product-chart'),
  reportInventoryList: $('report-inventory-list'),
  regionList: $('region-list'),
  openingList: $('opening-list'),
  fixtureList: $('fixture-list'),
  fixtureSelect: $('fixture-select'),
  commerceOpenBtn: $('commerce-open-btn'),
  commerceDrawer: $('commerce-drawer'),
  commerceCloseBtn: $('commerce-close-btn'),
  commerceQuery: $('commerce-query'),
  commerceCategory: $('commerce-category'),
  commerceType: $('commerce-type'),
  commerceSurface: $('commerce-surface'),
  commerceSize: $('commerce-size'),
  commerceSort: $('commerce-sort'),
  commerceStorePage: $('commerce-store-page'),
  commerceInventoryPage: $('commerce-inventory-page'),
  commerceDetailPage: $('commerce-detail-page'),
  commerceStoreList: $('commerce-store-list'),
  commerceInventoryList: $('commerce-inventory-list'),
  commerceDetailView: $('commerce-detail-view'),
  // SILINEN REFERANSLAR (CAD ve Camera panelleri kaldirildi)
};

// Model'e bağlı durum reload'suz model geçişi için `let` + setupModelState()
// içinde atanır (aşağıda). Olay dinleyicileri bu modül tanımlayıcılarını
// çalışma anında çözdüğü için yeniden atama otomatik olarak yeni modele geçer.
let sceneData;
let floorSurface;
let enrichedWalls;
let stateManager;

/**
 * buildWallsFromPlanes — Python pipeline'ın tespit ettiği wall_planes'tan
 * walls dizisi üretir. Plane verisi parçalı/eğri duvar parçalarını içerir.
 *
 * Her plane → bir wall:
 *  - quad (3D 4 köşe, dünya koordinatlarında metre)
 *  - width/height bu quad'tan hesaplanır
 *  - rotationY: alt kenarın XZ düzlemindeki açısı
 *  - position: bottom edge merkezi, yükseklik orta noktası
 *  - simulateQuad bunu polygon2D'ye dönüştürerek doğru tile yerleşimi yapar
 *
 * Plane verisi yoksa fallback olarak makeWallSegments sonucu kullanılır.
 */
function buildWallsFromPlanes(meta, sceneData) {
  const planes = Array.isArray(meta?.wall_planes) ? meta.wall_planes : [];
  if (!planes.length) return null;
  const u2m = Number(meta?.scale_factor_to_meters) || 1;
  // Wall_planes koordinatları mesh'in ham koordinat sisteminde (örn. y=0..2.77).
  // makeWallSegments ise roomCenterUnits'e göre ORTALANMIŞ koordinatlar kullanır.
  // Aynı dünya frame'inde olmaları için aynı offset'i uygula.
  const offsetX = sceneData?.roomCenterUnits?.x || 0;
  const offsetZ = sceneData?.roomCenterUnits?.y || 0; // roomCenterUnits.y = z-axis in plan
  // floor_y_m varsa onu y=0 referansı yap
  const floorY = Number(meta?.floor_y_m || 0);
  // Plane'i metre koordinatlarına çevir + merkeze kaydır
  const out = [];
  // Ham (normalize) → dünya (merkez + metre) dönüşümü
  const toWorld = ([x, y, z]) => [
    (x - offsetX) * u2m,
    (y - floorY) * u2m,
    (z - offsetZ) * u2m,
  ];
  planes.forEach((p, idx) => {
    // ── Eğri duvar: arc_points + arc uzunluğu (quad'dan türetilmez) ──────────
    if (p.kind === 'curved' && Array.isArray(p.arc_points_3d) && p.arc_points_3d.length >= 2) {
      const arc = p.arc_points_3d.map(toWorld);
      const width = Number(p.width || 0) * u2m;   // arc uzunluğu (m)
      const height = Number(p.height || 0) * u2m;
      if (width < 0.03 || height < 0.03) return;
      // Temsilî pozisyon/rotasyon (kamera/etiket için): yay orta noktası + uç yönü
      const mid = arc[Math.floor(arc.length / 2)];
      const a0 = arc[0];
      const aN = arc[arc.length - 1];
      const rotationY = -Math.atan2(aN[2] - a0[2], aN[0] - a0[0]);
      const polygon2D = Array.isArray(p.polygon_2d)
        ? p.polygon_2d.map(([u, v]) => [u * u2m, v * u2m])
        : null;
      out.push({
        id: p.id || `wall-${idx}`,
        name: `Eğri Duvar ${idx + 1}`,
        kind: 'curved',
        width,
        height,
        position: [mid[0], height / 2, mid[2]],
        rotationY,
        arcPoints: arc,            // dünya koord — TileRegions tile'ları yay boyunca dizer
        polygon2D,                 // açılmış (unrolled) dikdörtgen
        area: Number(p.area || 0) * u2m * u2m,
        bottomY: Math.min(...arc.map((q) => q[1])),
        topY: Math.min(...arc.map((q) => q[1])) + height,
        confidence: p.confidence,
        normal: p.normal,
        plane_id: p.id,
        decision: p.decision || null,
      });
      return;
    }

    const rawQuad = Array.isArray(p.quad) ? p.quad : [];
    if (rawQuad.length !== 4) return;
    const quad = rawQuad.map(toWorld);
    const [v0, v1, v2, v3] = quad;
    const dx = v1[0] - v0[0];
    const dz = v1[2] - v0[2];
    const width = Math.hypot(dx, dz);
    const height = Math.max(
      Math.abs(v3[1] - v0[1]),
      Math.abs(v2[1] - v1[1]),
    );
    if (width < 0.03 || height < 0.03) return;
    // Bottom edge midpoint
    const cx = (v0[0] + v1[0]) / 2;
    const cz = (v0[2] + v1[2]) / 2;
    const bottomY = Math.min(v0[1], v1[1]);
    const topY = Math.max(v2[1], v3[1]);
    const centerY = (bottomY + topY) / 2;
    const rotationY = -Math.atan2(dz, dx);
    // Gerçek duvar şekli: Python polygon_2d (eğimli/parçalı) varsa kullan,
    // yoksa simulateQuad quad'dan dikdörtgen türetir.
    // polygon_2d Python'da (u,v) = (0..width_raw, 0..height_raw) ham birimde.
    // Metreye çevir (u2m). Origin zaten 0 → sadece ölçekle.
    let polygon2D = null;
    if (Array.isArray(p.polygon_2d) && p.polygon_2d.length >= 4) {
      polygon2D = p.polygon_2d.map(([u, v]) => [u * u2m, v * u2m]);
    }

    out.push({
      id: p.id || `wall-${idx}`,
      name: `Duvar ${idx + 1}`,
      kind: 'wall',
      width,
      height,
      position: [cx, centerY, cz],
      rotationY,
      quad,                                     // 3D world (m)
      polygon2D,                                // gerçek 2D şekil (varsa)
      area: Number(p.area || 0) * u2m * u2m,
      bottomY,
      topY,
      confidence: p.confidence,
      normal: p.normal,
      plane_id: p.id,
      decision: p.decision || null,
    });
  });
  if (!out.length) return null;
  // Yüzey editörü kullanılabilirliği: duvarları alana göre BÜYÜKTEN küçüğe sırala
  // (ana duvarlar "Duvar 1, 2…" olur; tavan şeridi/soffit gibi küçük yüzeyler sona
  // gider). id korunur (Face Select/tiled state etkilenmez), yalnız sıra + etiket değişir.
  out.sort((a, b) => (b.area || 0) - (a.area || 0));
  let wn = 0;
  let cn = 0;
  out.forEach((w) => {
    w.name = w.kind === 'curved' ? `Eğri Duvar ${++cn}` : `Duvar ${++wn}`;
  });
  return out;
}

/**
 * setupModelState — aktif geometryData'dan model'e bağlı tüm durumu (sceneData,
 * floorSurface, enrichedWalls, stateManager) yeniden kurar. İlk açılışta ve her
 * reload'suz model geçişinde (switchModel) çağrılır. wall_planes ASIL kaynaktır;
 * makeWallSegments yalnız wall_planes yoksa fallback.
 */
function setupModelState() {
  sceneData = deriveSceneData(geometryData);
  // floorSurface deriveSceneData'dan gelmez; HAM polygon merkeze ötelenip metreye
  // çevrilir (makeWallSegments.toWorld ile aynı frame) → scale=1 ve inch/cm tutarlı.
  const u2m = sceneData.unitToMeters || 1;
  const ctr = sceneData.roomCenterUnits || { x: 0, y: 0 };
  const floorPolygonM = (sceneData.roomPolygon || []).map(([x, z]) => [
    (x - ctr.x) * u2m,
    (z - ctr.y) * u2m,
  ]);
  floorSurface = {
    id: 'floor',
    kind: 'floor',
    name: 'Zemin',
    width: sceneData.roomWidthM,
    height: sceneData.roomDepthM,
    centerX: 0,
    centerZ: 0,
    polygon: floorPolygonM,
  };
  const planeWalls = buildWallsFromPlanes(sceneData.meta, sceneData);
  enrichedWalls = planeWalls && planeWalls.length > 0
    ? planeWalls
    : (sceneData.walls || []);
  sceneData.walls = enrichedWalls; // bridge zengin veriyi taşısın
  stateManager = createStateManager({
    meta: sceneData.meta,
    geometryData,
    products,
    tileProducts,
    fixtureProducts,
    walls: enrichedWalls,
    floorSurface,
    unitToMeters: sceneData.unitToMeters,
    wallHeight: sceneData.wallHeight,
  });
}

setupModelState();

const sceneController = createSceneController({
  THREE,
  OrbitControls,
  canvas: dom.viewerCanvas,
  stateManager,
  sceneData,
});

const GROUT_OPTIONS = [0, 2, 3, 4, 5, 8, 10];

let simulation = null;
let commerceController = null;
let commerceModulePromise = null;
let launcherFiles = [];

function productById(id) {
  return stateManager.productById(id);
}

function setLauncherStatus(text) {
  if (dom.launcherStatus) dom.launcherStatus.textContent = text;
}

function renderLauncherFileOptions() {
  if (!dom.launcherCadSelect) return;
  dom.launcherCadSelect.innerHTML = launcherFiles.length
    ? launcherFiles.map((file) => `<option value="${escapeHtml(file.relativePath)}">${escapeHtml(file.relativePath)}</option>`).join('')
    : '<option value="">CAD dosyasi bulunamadi</option>';
  dom.launcherRunBtn.disabled = !launcherFiles.length;
}

async function loadLauncherFiles() {
  setLauncherStatus('CAD dosya listesi yukleniyor...');
  logger.info("API Istegi: /api/cad-files");
  try {
    const response = await fetch('/api/cad-files', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    launcherFiles = data.files || [];
    renderLauncherFileOptions();
    if (!launcherFiles.length) {
      setLauncherStatus('Calisma klasorunde DWG/DXF dosyasi bulunamadi.');
      return;
    }
    setLauncherStatus(`Hazir ${launcherFiles.length} CAD dosyasi bulundu. Istediginizi secip hazirlayabilirsiniz.`);
    logger.success("CAD dosya listesi basariyla yuklendi.");
  } catch (error) {
    launcherFiles = [];
    renderLauncherFileOptions();
    setLauncherStatus(`Hazirlayici API erisilemedi.\n${String(error)}`);
    logger.error("API Hatasi (/api/cad-files): ", error);
  }
}

async function runPrepareFromLauncher() {
  const cadFile = dom.launcherCadSelect?.value;
  if (!cadFile) return;
  if(dom.launcherRunBtn) dom.launcherRunBtn.disabled = true;
  setLauncherStatus(`Hazirlaniyor...\n${cadFile}`);
  logger.info(`CAD isleme sureci baslatildi: ${cadFile}`);
  try {
    const response = await fetch('/api/prepare-simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadFile }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.stderr || data.error || `HTTP ${response.status}`);
    }
    localStorage.setItem(MODEL_STORAGE_KEY, 'current');
    setLauncherStatus(`Hazirlama tamamlandi.\n${(data.stdout || '').trim() || cadFile}\nAktif CAD yukleniyor...`);
    logger.success(`CAD isleme sureci basariyla tamamlandi: ${cadFile}`);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('model', 'current');
    window.location.href = nextUrl.toString();
  } catch (error) {
    setLauncherStatus(`Hazirlama basarisiz.\n${String(error)}`);
    logger.error("CAD isleme sureci basarisiz: ", error);
    if(dom.launcherRunBtn) dom.launcherRunBtn.disabled = false;
  }
}

function openLauncherPanel() {
  if (dom.launcherPanel) dom.launcherPanel.classList.remove('d-none');
  if (!launcherFiles.length) void loadLauncherFiles();
}

function closeLauncherPanel() {
  if (dom.launcherPanel) dom.launcherPanel.classList.add('d-none');
}

function ensureInventory(productId, context, options) {
  return stateManager.ensureInventory(productId, context, options);
}

/**
 * applySurfaceSelection — "Yüzey" dropdown'unu (Zemin / Seçili duvar / Tüm
 * duvarlar / Zemin+duvarlar) GERÇEKTEN kaplamaya bağlar. tiledSurfaceIds'ı
 * topluca ayarlar (Face Select 3D tıklaması tek tek ince ayar yapar; bu ikisi
 * aynı kümeyi düzenler). Önceden dropdown selectedSurface'i değiştiriyordu ama
 * selectedSurfaces() artık tiledSurfaceIds'ı kullandığı için etkisizdi.
 */
function applySurfaceSelection() {
  const st = stateManager.state.settings;
  const wallIds = (sceneData.walls || []).map((w) => w.id);
  let ids;
  switch (st.selectedSurface) {
    case 'floor':
      ids = ['floor'];
      break;
    case 'wall':
      ids = st.selectedWallId ? [st.selectedWallId] : [];
      break;
    case 'walls':
      ids = [...wallIds];
      break;
    case 'all':
    default:
      ids = ['floor', ...wallIds];
      break;
  }
  st.tiledSurfaceIds = ids;
  st.tiledModelKey = sceneData.meta?.source || '';
}

function addRegion() {
  const state = stateManager.state;
  const surface = state.settings.selectedSurface === 'floor' ? 'floor' : state.settings.selectedWallId;
  const region = {
    id: crypto.randomUUID(),
    name: $('region-name-input').value.trim() || 'Ozel bolge',
    surfaceId: surface,
    tileId: dom.regionTileSelect.value || state.settings.defaultTileId,
    x: Number($('region-x-input').value || 0),
    y: Number($('region-y-input').value || 0),
    w: Math.max(0.05, Number($('region-w-input').value || 1)),
    h: Math.max(0.05, Number($('region-h-input').value || 1)),
    origin: state.settings.origin,
    orientation: state.settings.orientation,
  };
  state.regions.push(region);
  logger.info(`Yeni bolge eklendi: ${region.name} (${region.w}x${region.h}m)`);
  ensureInventory(region.tileId, region.name, {
    minimumQuantity: 1,
    lastAction: 'region-add',
  });
  renderAll();
}

function addOpening() {
  const opening = {
    id: crypto.randomUUID(),
    type: $('opening-type-select').value,
    surfaceId: stateManager.state.settings.selectedWallId,
    x: Number($('opening-x-input').value || 0),
    y: Number($('opening-y-input').value || 0),
    w: Math.max(0.05, Number($('opening-w-input').value || 0.8)),
    h: Math.max(0.05, Number($('opening-h-input').value || 1)),
    subtract: $('opening-subtract-input').checked,
    source: 'manual',
  };
  stateManager.state.openings.push(opening);
  logger.info(`Yeni bosluk/nis eklendi: ${opening.type}`);
  renderAll();
}

function addFixture() {
  const product = productById(dom.fixtureSelect.value);
  if (!stateManager.isPlaceableProduct(product)) return;
  const fixture = {
    id: crypto.randomUUID(),
    productId: product.id,
    x: Number($('fixture-x-input').value || 0),
    z: Number($('fixture-z-input').value || 0),
    rotation: 0,
  };
  stateManager.state.fixtures.push(fixture);
  logger.info(`Yeni esya yerlestirildi: ${product.name}`);
  ensureInventory(product.id, 'Yerlesim', {
    minimumQuantity: 1,
    lastAction: 'fixture-add',
  });
  renderAll();
}

function renderEditableLists() {
  if (!dom.regionList || !dom.openingList || !dom.fixtureList) return;
  dom.regionList.innerHTML = stateManager.state.regions.map((region) => `
    <div class="d-flex justify-content-between mb-1"><span>${escapeHtml(region.name)} • ${fmt(region.w)}x${fmt(region.h)} m</span><button class="btn btn-sm text-danger p-0" data-remove-region="${escapeHtml(region.id)}">x</button></div>
  `).join('');
  dom.openingList.innerHTML = stateManager.state.openings.map((opening) => `
    <div class="d-flex justify-content-between mb-1"><span>${escapeHtml(opening.type)} • ${fmt(opening.w)}x${fmt(opening.h)} m ${opening.subtract ? '• dusulsun' : ''}</span><button class="btn btn-sm text-danger p-0" data-remove-opening="${escapeHtml(opening.id)}">x</button></div>
  `).join('');
  dom.fixtureList.innerHTML = stateManager.state.fixtures.map((fixture) => {
    const product = productById(fixture.productId);
    return `<div class="d-flex justify-content-between mb-1"><span>${escapeHtml(product?.name || 'Esya')} • X ${fmt(fixture.x)} / Z ${fmt(fixture.z)}</span><button class="btn btn-sm text-danger p-0" data-remove-fixture="${escapeHtml(fixture.id)}">x</button></div>`;
  }).join('');
  
  document.querySelectorAll('[data-remove-region]').forEach((button) => button.addEventListener('click', () => {
    stateManager.state.regions = stateManager.state.regions.filter((region) => region.id !== button.dataset.removeRegion);
    logger.info(`Bolge silindi: ${button.dataset.removeRegion}`);
    renderAll();
  }));
  document.querySelectorAll('[data-remove-opening]').forEach((button) => button.addEventListener('click', () => {
    stateManager.state.openings = stateManager.state.openings.filter((opening) => opening.id !== button.dataset.removeOpening);
    logger.info(`Bosluk/nis silindi: ${button.dataset.removeOpening}`);
    renderAll();
  }));
  document.querySelectorAll('[data-remove-fixture]').forEach((button) => button.addEventListener('click', () => {
    stateManager.state.fixtures = stateManager.state.fixtures.filter((fixture) => fixture.id !== button.dataset.removeFixture);
    logger.info(`Esya silindi: ${button.dataset.removeFixture}`);
    renderAll();
  }));
}

function renderControls() {
  stateManager.syncSelections();
  const selectableTiles = stateManager.getSelectableTiles();
  const selectableFixtures = stateManager.getSelectableFixtures();

  if(dom.wallSelect) dom.wallSelect.innerHTML = sceneData.walls.map((wall) => `<option value="${wall.id}">${wall.name}</option>`).join('');
  if(dom.defaultTileSelect) dom.defaultTileSelect.innerHTML = selectableTiles.map((tile) => `<option value="${tile.id}">${tile.name}</option>`).join('');
  if(dom.regionTileSelect) dom.regionTileSelect.innerHTML = selectableTiles.map((tile) => `<option value="${tile.id}">${tile.name}</option>`).join('');
  if(dom.groutSelect) dom.groutSelect.innerHTML = GROUT_OPTIONS.map((mm) => `<option value="${mm}">${mm} mm</option>`).join('');
  if(dom.fixtureSelect) dom.fixtureSelect.innerHTML = selectableFixtures.map((product) => `<option value="${product.id}">${product.name}</option>`).join('');

  if(dom.surfaceSelect) dom.surfaceSelect.value = stateManager.state.settings.selectedSurface;
  if(dom.wallSelect) dom.wallSelect.value = stateManager.state.settings.selectedWallId;
  if(dom.defaultTileSelect) dom.defaultTileSelect.value = stateManager.state.settings.defaultTileId;
  if(dom.regionTileSelect) dom.regionTileSelect.value = stateManager.state.settings.defaultTileId;
  if(dom.groutSelect) dom.groutSelect.value = String(stateManager.state.settings.groutMm);
  if(dom.wasteInput) dom.wasteInput.value = String(stateManager.state.settings.wastePct);
  if(dom.originSelect) dom.originSelect.value = stateManager.state.settings.origin;
  if(dom.orientationSelect) dom.orientationSelect.value = stateManager.state.settings.orientation;
  if(dom.fixtureSelect) dom.fixtureSelect.value = stateManager.state.settings.selectedFixtureId || selectableFixtures[0]?.id || '';
}

function renderSharedInventorySummary() {
  const rows = stateManager.getInventoryRows(simulation);
  if (!dom.reportInventoryList) return;
  dom.reportInventoryList.innerHTML = rows.map((row) => `
    <div class="mb-2 pb-2 border-bottom">
      <strong class="d-block">${row.product.name}</strong>
      <span class="d-block">${row.product.type === 'tile' ? `${row.orderQuantity} adet (fireli) / ${row.orderBoxes} kutu` : `${row.entry.quantity} adet`}</span>
      <small class="d-block text-muted">${row.usageContexts.join(', ') || row.usageLabel}</small>
      <small class="d-block text-success fw-bold">${formatCurrency(row.estimatedCost)}</small>
    </div>
  `).join('') || '<p class="text-muted small">Henüz ürün seçilmedi.</p>';
}

function renderBarChart(el, data) {
  if (!el) return;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  el.innerHTML = data.map(item => {
    const pct = Math.round((item.value / maxVal) * 100);
    return `
      <div class="bar-row">
        <span title="${item.label}">${item.label}</span>
        <div><i style="width: ${pct}%"></i></div>
        <b>${item.value}</b>
      </div>
    `;
  }).join('') || '<p class="text-muted small">Veri yok.</p>';
}

function renderResults() {
  if (!dom.resultArea) return;
  if (!simulation) {
    dom.resultArea.textContent = '—';
    if (dom.resultRequired) dom.resultRequired.textContent = '—';
    if (dom.resultOrder) dom.resultOrder.textContent = '—';
    if (dom.resultCuts) dom.resultCuts.textContent = '—';
    renderSharedInventorySummary();
    return;
  }
  // Toplam kutu sayısı (fireli sipariş bazında)
  let totalOrderBoxes = 0;
  simulation.byProduct.forEach((entry) => { totalOrderBoxes += entry.orderBoxes || 0; });

  dom.resultArea.textContent = `${fmt(simulation.totalArea)} m²`;
  dom.resultRequired.textContent = `${simulation.required.toLocaleString('tr-TR')} adet`;
  dom.resultOrder.textContent = totalOrderBoxes > 0
    ? `${simulation.order.toLocaleString('tr-TR')} adet · ${totalOrderBoxes} kutu`
    : `${simulation.order.toLocaleString('tr-TR')} adet`;
  dom.resultCuts.textContent = simulation.cutTiles.length > 0
    ? `${simulation.cutTiles.length.toLocaleString('tr-TR')} seramik`
    : '—';
  
  if (dom.cutPlanList) {
    dom.cutPlanList.innerHTML = simulation.cutTiles.map((bin, index) => {
      const pieces = bin.pieces.map((piece) => `${cm(piece.w)}x${cm(piece.h)} ${escapeHtml(piece.region)}`).join(' + ');
      const free = bin.free.map((item) => `${cm(item.w)}x${cm(item.h)} artik`).join(' + ') || 'artik yok';
      return `<div class="mb-2"><strong class="d-block">Seramik #${index + 1}</strong><span>${pieces}</span><small class="d-block text-muted">${free}</small></div>`;
    }).join('') || '<p class="text-muted small">Kesim yok.</p>';
  }
  
  if (dom.reuseList) {
    dom.reuseList.innerHTML = simulation.suggestions.map((text) => `<div class="mb-1">${escapeHtml(text)}</div>`).join('') || '<p class="text-muted small">Artan malzeme yok.</p>';
  }
  
  if (dom.warningList) {
    const warnings = [...runtimeWarnings, ...sceneController.getWarnings()];
    dom.warningList.innerHTML = warnings.map((text) => `<div class="text-warning mb-1">${escapeHtml(text)}</div>`).join('') || '<p class="text-muted small">Uyari yok.</p>';
  }

  // Bar chart grafikleri
  if (dom.productChart) {
    renderBarChart(dom.productChart, [...simulation.byProduct.values()].map((entry) => ({ label: escapeHtml(entry.product.name), value: entry.required })));
  }

  renderSharedInventorySummary();
}

function renderAll() {
  stateManager.saveState();
  setSimState('calculating', { trigger: 'renderAll' });
  try {
    simulation = runSimulation({ stateManager });
    const productCount = simulation?.byProduct
      ? (simulation.byProduct instanceof Map
          ? simulation.byProduct.size
          : Object.keys(simulation.byProduct).length)
      : 0;
    if (!simulation || productCount === 0) {
      setSimState('warning', { reason: 'no_tile_assigned' });
    } else {
      const totalArea = Number(simulation.totalArea || 0);
      const meta = sceneData?.meta || geometryData?.meta || {};
      const wfReliable = meta?.wireframe?.tile_placement_reliable;
      const payload = { products: productCount, area: totalArea };
      if (typeof wfReliable === 'boolean') payload.wireframe_reliable = wfReliable;
      setSimState('success', payload);
    }
  } catch (err) {
    logger.error('[renderAll] runSimulation hatası:', err);
    simulation = null;
    setSimState('error', { message: String(err?.message || err) });
  }
  stateManager.saveState();
  sceneController.renderStructureModel();
  renderControls();
  renderEditableLists();
  renderResults();
  sceneController.renderLayouts(simulation);
  sceneController.renderFixtures();
  if (commerceController) commerceController.render();
  publishLegacyState();
}

// Face Select köprüsü: R3F sahnesinden yüzey kaplama durumunu toggle et + re-sim.
window.__seramikcimToggleSurface = (surfaceId) => {
  if (!surfaceId) return;
  stateManager.toggleTiledSurface(surfaceId);
  logger.info(`[Face Select] yüzey toggle: ${surfaceId}`);
  renderAll();
};

let __stateChangeSeq = 0;
function publishLegacyState() {
  __stateChangeSeq += 1;
  window.__seramikcim = {
    seq: __stateChangeSeq,
    sceneData,
    meta: sceneData.meta,
    unitToMeters: sceneData.unitToMeters,
    wallHeight: sceneData.wallHeight,
    walls: sceneData.walls,
    floorSurface,          // lokal olarak oluşturduğumuz nesne (sceneData.floorSurface undefined)
    halfW: sceneData.halfW,
    halfD: sceneData.halfD,
    products,
    fixtures: stateManager.state.fixtures.slice(),
    openings: stateManager.state.openings.slice(),
    regions: stateManager.state.regions.slice(),
    inventory: { ...stateManager.state.inventory },
    settings: { ...stateManager.state.settings },
    simulation,
  };
  try {
    window.dispatchEvent(new CustomEvent('seramikcim:state', {
      detail: { seq: __stateChangeSeq },
    }));
  } catch {
    /* SSR vb. */
  }
  try { updateWireframeChip(sceneData.meta); } catch {}
}

if (typeof window !== 'undefined') {
  window.__wireframeDebug = () => {
    const meta = stateManager.geometryData?.meta;
    if (!meta) return logger.warn('[wireframe] meta yok');
    logger.info('wireframe meta:', meta.wireframe);
    return meta;
  };
}

function updateWireframeChip(meta) {
  const chip = document.getElementById('wireframe-status-chip');
  if (!chip) return;
  const wf = meta?.wireframe;
  const mode = meta?.geometry_mode;
  const meshModes = new Set(['mesh', 'mesh-face', 'wireframe-driven', 'section', 'aabb']);
  if (!meshModes.has(mode)) {
    chip.classList.add('d-none');
    chip.textContent = '';
    return;
  }
  chip.classList.remove('d-none');
  if (mode === 'mesh-face') {
    chip.className = 'badge bg-success';
    chip.textContent = `✓ Face-based`;
    return;
  }
  if (!wf) {
    chip.classList.add('d-none');
    chip.textContent = '';
    return;
  }
  if (mode === 'wireframe-driven') {
    chip.className = 'badge bg-success';
    chip.textContent = `✓ Wireframe-driven`;
  } else if (wf.tile_placement_reliable === true) {
    chip.className = 'badge bg-success';
    chip.textContent = '✓ Wireframe doğrulandı';
  } else if (wf.tile_placement_reliable === false) {
    chip.className = 'badge bg-warning text-dark';
    chip.textContent = `⚠ Wireframe uyumsuz`;
  } else {
    chip.className = 'badge bg-secondary';
    chip.textContent = 'Wireframe: bilinmiyor';
  }
}

function getSimulation() {
  return simulation;
}

async function ensureCommerceController() {
  if (commerceController) return commerceController;
  if (!commerceModulePromise) {
    commerceModulePromise = import('./commerce.js');
  }
  const { createCommerceController } = await commerceModulePromise;
  commerceController = createCommerceController({
    dom: {
      ...dom,
    },
    stateManager,
    getSimulation,
    renderAll,
  });
  return commerceController;
}

async function openCommerceDrawer(tab = stateManager.state.ui.activeCommerceTab || 'store') {
  const controller = await ensureCommerceController();
  controller.open(tab);
}

function setClickOrigin(event) {
  if (dom.originSelect.value !== 'click') return;
  const rect = dom.viewerCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * sceneController.metrics.roomWidthM;
  const y = ((event.clientY - rect.top) / rect.height) * sceneController.metrics.roomDepthM;
  if($('region-x-input')) $('region-x-input').value = fmt(Math.max(0, Math.min(sceneController.metrics.roomWidthM, x)), 2);
  if($('region-y-input')) $('region-y-input').value = fmt(Math.max(0, Math.min(sceneController.metrics.roomDepthM, y)), 2);
}

function setupEvents() {
  if(dom.launcherOpenBtn) dom.launcherOpenBtn.addEventListener('click', openLauncherPanel);
  if(dom.launcherCloseBtn) dom.launcherCloseBtn.addEventListener('click', closeLauncherPanel);
  if(dom.launcherRefreshBtn) dom.launcherRefreshBtn.addEventListener('click', () => void loadLauncherFiles());
  if(dom.launcherRunBtn) dom.launcherRunBtn.addEventListener('click', () => void runPrepareFromLauncher());
  if(dom.modelSelect) dom.modelSelect.addEventListener('change', () => {
    void switchModel(dom.modelSelect.value || 'current');
  });
  if(dom.surfaceSelect) dom.surfaceSelect.addEventListener('change', () => {
    stateManager.state.settings.selectedSurface = dom.surfaceSelect.value;
    applySurfaceSelection();
    renderAll();
  });
  if(dom.wallSelect) dom.wallSelect.addEventListener('change', () => {
    stateManager.state.settings.selectedWallId = dom.wallSelect.value;
    // "Seçili duvar" modundayken duvar değişince kaplama o duvara odaklanır
    if (stateManager.state.settings.selectedSurface === 'wall') applySurfaceSelection();
    renderAll();
  });
  if(dom.defaultTileSelect) dom.defaultTileSelect.addEventListener('change', () => {
    stateManager.setDefaultTile(dom.defaultTileSelect.value, 'Ana kaplama');
    renderAll();
  });
  if(dom.groutSelect) dom.groutSelect.addEventListener('change', () => {
    stateManager.state.settings.groutMm = Number(dom.groutSelect.value);
    renderAll();
  });
  if(dom.wasteInput) dom.wasteInput.addEventListener('input', () => {
    stateManager.state.settings.wastePct = Number(dom.wasteInput.value || 0);
    renderAll();
  });
  if(dom.originSelect) dom.originSelect.addEventListener('change', () => {
    stateManager.state.settings.origin = dom.originSelect.value;
    renderAll();
  });
  if(dom.orientationSelect) dom.orientationSelect.addEventListener('change', () => {
    stateManager.state.settings.orientation = dom.orientationSelect.value;
    renderAll();
  });
  if(dom.fixtureSelect) dom.fixtureSelect.addEventListener('change', () => {
    stateManager.state.settings.selectedFixtureId = dom.fixtureSelect.value;
    stateManager.saveState();
  });
  if(dom.commerceOpenBtn) dom.commerceOpenBtn.addEventListener('click', () => void openCommerceDrawer());
  if($('add-region-btn')) $('add-region-btn').addEventListener('click', addRegion);
  if($('add-opening-btn')) $('add-opening-btn').addEventListener('click', addOpening);
  if($('add-fixture-btn')) $('add-fixture-btn').addEventListener('click', addFixture);
  if($('print-report-btn')) $('print-report-btn').addEventListener('click', () => window.print());
  // Kamera view butonları (yeni HTML'de data-view attribute'u header'da)
  document.querySelectorAll('.chip-btn[data-view]').forEach((button) => button.addEventListener('click', () => {
    sceneController.setCamera(button.dataset.view);
  }));
  // Konva CAD toggle butonu (yeni header)
  if($('cad-toggle-btn')) $('cad-toggle-btn').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('seramikcim:konva-cad-toggle'));
  });
  if(dom.viewerCanvas) dom.viewerCanvas.addEventListener('click', setClickOrigin);
}

function updateSourceLabel() {
  const fallbackLabel = dataFallbackUsed ? ' • fallback veri' : '';
  // Boyut etiketi: gerçek net alan göster, bounding-box değil
  const netArea = sceneData.meta?.net_area_m2;
  const dimStr = netArea
    ? `${fmt(netArea)} m²`
    : `${fmt(sceneData.roomWidthM)} × ${fmt(sceneData.roomDepthM)} m`;
  if (dom.sourceLabel) {
    dom.sourceLabel.textContent =
      `${formatModelLabel(activeModelId)}${fallbackLabel} • ${sceneData.meta.source || 'CAD'} • ${dimStr}`;
  }
}

/**
 * switchModel — sayfayı YENİDEN YÜKLEMEDEN aktif modeli değiştirir.
 * Geometriyi yükler, model'e bağlı durumu yeniden kurar, bridge'i yeniden
 * yayınlar ve React store'a haber verir. Tek WebGL context korunur → donma yok.
 */
async function switchModel(modelId) {
  const id = modelId || 'current';
  if(dom.loadingOverlay) dom.loadingOverlay.classList.remove('d-none');
  try {
    const loaded = await loadSelectedModel(id);
    ({ geometryData, buildingData, activeModelId, dataFallbackUsed, dataLoadWarnings } = loaded);
    setupModelState();
    commerceController = null; // yeni stateManager ile tekrar bağlansın (sonraki açılışta)
    localStorage.setItem(MODEL_STORAGE_KEY, activeModelId);
    const url = new URL(window.location.href);
    url.searchParams.set('model', activeModelId);
    history.replaceState(null, '', url.toString());
    updateSourceLabel();
    ensureInventory(stateManager.state.settings.defaultTileId, 'Ana kaplama', {
      minimumQuantity: 1,
      lastAction: 'switch-default-tile',
    });
    renderAll();
    // React store aynı modele yeniden yüklensin (mesh + sceneData güncellensin)
    window.dispatchEvent(new CustomEvent('seramikcim:model-changed', { detail: activeModelId }));
  } catch (err) {
    logger.error('[switchModel] model yüklenemedi:', err);
  } finally {
    if(dom.loadingOverlay) dom.loadingOverlay.classList.add('d-none');
  }
}

function buildScene() {
  if(dom.modelSelect) {
    dom.modelSelect.innerHTML = modelOptions
      .map((option) => `<option value="${option.id}">${option.label}</option>`)
      .join('');
    dom.modelSelect.value = activeModelId;
  }
  localStorage.setItem(MODEL_STORAGE_KEY, activeModelId);
  updateSourceLabel();
  sceneController.addRoomModel();
  ensureInventory(stateManager.state.settings.defaultTileId, 'Ana kaplama', {
    minimumQuantity: 1,
    lastAction: 'boot-default-tile',
  });
  setupEvents();
  renderAll();
  if(dom.loadingOverlay) dom.loadingOverlay.classList.add('d-none');
  void loadLauncherFiles();
  if (stateManager.state.ui.commerceDrawerOpen) {
    void openCommerceDrawer(stateManager.state.ui.activeCommerceTab || 'store');
  }
}

window.addEventListener('resize', () => {
  sceneController.resize();
});

buildScene();
sceneController.start();

try {
  const themeMount = document.querySelector('.project-meta');
  // Header'daki sağ taraf — proje-meta yoksa header'ın sonuna ekle
  const mountTarget = themeMount || document.querySelector('.app-header');
  if (mountTarget) {
    mountTopMenuRestore(mountTarget);
    mountThemeToggle(mountTarget);
  }
} catch (err) {
  logger.warn('[theme] mount başarısız:', err);
}

try {
  mountSimulationToastBridge();
} catch (err) {
  logger.warn('[toastBridge] mount başarısız:', err);
}

// RESTORED FLOATING PANELS - Sadece commerce drawer (editor/result artik Bootstrap layout icinde)
try {
  // NOT: commerce paneli floatingPanels'a KAYITLI DEĞİL. Kayıtlı olursa
  // floatingPanels native header'a kendi (−,×) kontrollerini enjekte edip
  // native × ile çakışıyor + minimize CSS'i .floating-drawer__header'ı kapsamadığı
  // için paneli tümden gizliyordu. Panel ortalı modal olarak .floating-drawer CSS'i
  // ile konumlanır, native commerce-close-btn ile kapanır (commerce.js close()).
  registerPanel({
    id: 'launcher',
    el: document.querySelector('#launcher-panel'),
    defaults: { center: true, width: 420, height: 320 },
    dragHandle: '.floating-drawer__header',
    floating: true,
  });
  restoreAllPanels();
} catch (err) {
  logger.warn('[floatingPanels] register başarısız:', err);
}
