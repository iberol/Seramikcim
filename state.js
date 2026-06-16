import { logger } from './src/utils/logger.js';

const STORAGE_KEY = 'seramikcim.inventory.sim.v1';
const DEFAULT_DOOR_TRIM_M = 0.07;

const VALID_COMMERCE_TABS = new Set(['store', 'inventory', 'detail']);

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function fmt(value, digits = 2) {
  return Number(value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function cm(value) {
  return Math.round(Number(value || 0) * 100);
}

function hasSize(product) {
  return Number(product?.width_m) || Number(product?.height_m) || Number(product?.depth_m) || Number(product?.length_m);
}

export function formatProductSize(product) {
  if (!product) return '-';
  if (product.width_m && product.height_m) return `${cm(product.width_m)}x${cm(product.height_m)} cm`;
  if (product.width_m && product.depth_m) return `${cm(product.width_m)}x${cm(product.depth_m)} cm`;
  if (product.length_m) return `${cm(product.length_m)} cm`;
  if (product.width_m) return `${cm(product.width_m)} cm`;
  return '-';
}

export function formatProductType(product) {
  if (!product) return 'Urun';
  if (product.type === 'tile') return 'Seramik';
  if (product.type === 'fixture') return 'Armatur';
  return 'Aksesuar';
}

export function formatCurrency(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '-';
  return Number(value).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  });
}

export function getProductUsageLabel(product) {
  if (!product) return '-';
  if (product.type === 'tile') return 'Zemin ve duvar kaplamalari';
  if (product.fixtureKind === 'drain') return 'Yerlesim ve zemin detayi';
  if (product.id === 'accessory-niche-profile') return 'Nis ve kenar detayi';
  if (product.type === 'fixture') return 'Yerlesim urunu';
  return 'Tamamlayici urun';
}

export function createStateManager({
  meta,
  geometryData,
  products,
  tileProducts,
  fixtureProducts,
  walls,
  floorSurface,
  unitToMeters,
  wallHeight,
}) {
  function productById(id) {
    return products.find((product) => product.id === id);
  }

  function geometrySignature() {
    return [
      meta.source,
      meta.wall_width_m,
      meta.wall_height_m,
      meta.room_true_area_m2,
      meta.ceiling_height_m,
      meta.scale_source,
      meta.wall_height_source,
      meta.wall_tracer_version,
    ].filter((value) => value !== undefined && value !== null).join('|');
  }

  function isPlaceableProduct(product) {
    return Boolean(product && (product.type === 'fixture' || product.fixtureKind === 'drain'));
  }

  function defaultSettings() {
    return {
      defaultTileId: tileProducts[0]?.id || '',
      selectedFixtureId: fixtureProducts.find(isPlaceableProduct)?.id || fixtureProducts[0]?.id || '',
      groutMm: 3,
      wastePct: 10,
      origin: 'left-bottom',
      orientation: 'horizontal',
      selectedWallId: walls[0]?.id || 'wall-0',
      selectedSurface: 'floor',
      // Auto-tile: pipeline'ın 'tileable' işaretlediği iç duvarlar + zemin
      // başlangıçta kaplı. Face Select bu kümeyi tıklayarak değiştirir.
      // (Set yerine dizi — JSON-serileştirilebilir.)
      tiledSurfaceIds: ['floor', ...walls
        .filter((w) => w && w.decision?.tileable !== false)
        .map((w) => w.id)],
      // Hangi modele ait (meta.source) — model değişince auto-tile sıfırlanır
      tiledModelKey: meta?.source || '',
    };
  }

  function defaultUi() {
    return {
      commerceDrawerOpen: false,
      activeCommerceTab: 'store',
      selectedProductId: tileProducts[0]?.id || products[0]?.id || '',
      commerceFilters: {
        query: '',
        category: 'all',
        type: 'all',
        surface: 'all',
        size: 'all',
        sort: 'name',
      },
    };
  }

  function surfaceById(surfaceId) {
    if (surfaceId === 'floor') return floorSurface;
    return walls.find((wall) => wall.id === surfaceId) || walls[0] || floorSurface;
  }

  function seedOpenings() {
    if (Array.isArray(geometryData.features) && geometryData.features.length) {
      return geometryData.features
        .filter((feature) => ['door', 'window', 'niche', 'frame'].includes(feature.feature_type))
        .flatMap((feature) => createOpeningsFromFeature(feature));
    }
    const openings = (geometryData.doors || []).map((door) => ({
      id: crypto.randomUUID(),
      type: 'door',
      surfaceId: door.surface_hint || walls[0]?.id || 'wall-0',
      x: (door.x || 0) * unitToMeters,
      y: (door.y || 0) * unitToMeters,
      w: Math.max(0.3, (door.w || 35) * unitToMeters),
      h: Math.max(2.0, Math.min(wallHeight, (door.h || 86) * unitToMeters)),
      subtract: true,
      source: 'cad',
    }));
    const trimOpenings = openings.flatMap((doorOpening) => createDoorTrimOpenings(doorOpening));
    (geometryData.niches || []).forEach((niche) => {
      openings.push({
        id: crypto.randomUUID(),
        type: 'niche',
        surfaceId: niche.surface_hint || walls[0]?.id || 'wall-0',
        x: (niche.x || 0) * unitToMeters,
        y: Math.max(0.9, Math.min(1.3, (niche.y || 35) * unitToMeters)),
        w: Math.max(0.2, (niche.w || 25) * unitToMeters),
        h: Math.max(0.2, (niche.h || 35) * unitToMeters),
        d: Math.max(0.08, (niche.depth || 12) * unitToMeters),
        subtract: false,
        source: 'cad',
      });
    });
    return [...openings, ...trimOpenings];
  }

  function createOpeningsFromFeature(feature) {
    const surfaceId = feature.surface_hint || walls[0]?.id || 'wall-0';
    const confidence = feature.confidence || 'medium';
    const base = {
      id: feature.id || crypto.randomUUID(),
      surfaceId,
      source: feature.deduced_from === 'plan_direct' ? 'cad-feature' : 'cad-derived-feature',
      confidence,
      validationFlags: [...(feature.validation_flags || [])],
      featureType: feature.feature_type,
      featureSubtype: feature.subtype || feature.feature_type,
      parentOpeningId: feature.parent_id || null,
    };
    const metricRect = {
      x: Number(feature.x || 0) * unitToMeters,
      y: Number((feature.sill_h ?? feature.y) || 0) * unitToMeters,
      w: Math.max(0.05, Number(feature.w || 0.8) * unitToMeters),
      h: Math.max(0.05, Number(feature.h || 1) * unitToMeters),
      d: Math.max(0, Number(feature.depth || feature.thickness || 0) * unitToMeters),
    };
    if (feature.feature_type === 'niche') {
      return [{
        ...base,
        type: 'niche',
        subtract: false,
        ...metricRect,
      }];
    }
    if (feature.feature_type === 'frame') {
      const prefix = String(feature.subtype || '').includes('window') ? 'window' : 'door';
      return [{
        ...base,
        type: `${prefix}-frame`,
        subtract: confidence === 'high',
        ...metricRect,
      }];
    }
    return [{
      ...base,
      type: feature.feature_type,
      subtract: confidence === 'high',
      ...metricRect,
    }];
  }

  function createDoorTrimOpenings(doorOpening) {
    const surface = surfaceById(doorOpening.surfaceId);
    if (!surface) return [];
    const trimWidth = Math.min(
      DEFAULT_DOOR_TRIM_M,
      Math.max(0.045, Number(doorOpening.w || 0) * 0.1),
    );
    const leftX = Math.max(0, doorOpening.x - trimWidth);
    const rightX = Math.min(surface.width, doorOpening.x + doorOpening.w);
    const leftWidth = Math.max(0, Math.min(trimWidth, doorOpening.x));
    const rightWidth = Math.max(0, Math.min(trimWidth, surface.width - rightX));
    const topY = Math.max(0, doorOpening.y + doorOpening.h);
    const topHeight = Math.max(0, Math.min(trimWidth, surface.height - topY));
    const topX = leftX;
    const topWidth = Math.max(0, Math.min(surface.width - topX, doorOpening.w + leftWidth + rightWidth));
    const base = {
      surfaceId: doorOpening.surfaceId,
      type: 'door-frame',
      subtract: true,
      source: 'cad-auto-frame',
      parentOpeningId: doorOpening.id,
    };
    return [
      leftWidth > 0 ? {
        ...base,
        id: crypto.randomUUID(),
        x: leftX,
        y: doorOpening.y,
        w: leftWidth,
        h: doorOpening.h,
      } : null,
      rightWidth > 0 ? {
        ...base,
        id: crypto.randomUUID(),
        x: rightX,
        y: doorOpening.y,
        w: rightWidth,
        h: doorOpening.h,
      } : null,
      topHeight > 0 && topWidth > 0 ? {
        ...base,
        id: crypto.randomUUID(),
        x: topX,
        y: topY,
        w: topWidth,
        h: topHeight,
      } : null,
    ].filter(Boolean);
  }

  function defaultState() {
    return {
      geometrySource: geometrySignature(),
      inventory: {},
      regions: [],
      openings: seedOpenings(),
      fixtures: [],
      cadEdits: {
        selected: null,
        offsets: {},
        hidden: {},
        layerVisibility: { walls: true, tiles: false, floor: true, doors: true },
        history: [],
      },
      settings: defaultSettings(),
      ui: defaultUi(),
    };
  }

  function normalizeInventoryEntry(entry, productId) {
    const product = productById(productId);
    if (!product) return null;
    const applications = uniqueStrings(entry?.applications || []);
    const usageContexts = uniqueStrings([...(entry?.usageContexts || []), ...applications]);
    const quantity = Math.max(0, Number(entry?.quantity || 0));
    const manualQuantity = Math.max(0, Number(entry?.manualQuantity ?? quantity));
    return {
      productId,
      quantity,
      applications,
      usageContexts,
      lastAction: entry?.lastAction || 'normalized',
      manualQuantity,
    };
  }

  function normalizeRegion(region) {
    const surface = surfaceById(region.surfaceId);
    const w = Math.min(Math.max(0.05, Number(region.w || 1)), surface.width);
    const h = Math.min(Math.max(0.05, Number(region.h || 1)), surface.height);
    const tileId = productById(region.tileId)?.type === 'tile'
      ? region.tileId
      : defaultSettings().defaultTileId;
    return {
      ...region,
      tileId,
      w,
      h,
      x: clamp(Number(region.x || 0), 0, Math.max(0, surface.width - w)),
      y: clamp(Number(region.y || 0), 0, Math.max(0, surface.height - h)),
    };
  }

  function normalizeOpening(opening) {
    const surface = surfaceById(opening.surfaceId);
    const w = Math.min(Math.max(0.05, Number(opening.w || 0.8)), surface.width);
    const h = Math.min(Math.max(0.05, Number(opening.h || 1)), surface.height);
    const centeredX = Math.max(0, (surface.width - w) / 2);
    return {
      ...opening,
      confidence: opening.confidence || 'high',
      validationFlags: opening.validationFlags || [],
      featureType: opening.featureType || opening.type,
      w,
      h,
      d: Math.max(0, Number(opening.d || 0)),
      x: opening.x < 0 ? centeredX : clamp(Number(opening.x || 0), 0, Math.max(0, surface.width - w)),
      y: clamp(Number(opening.y || 0), 0, Math.max(0, surface.height - h)),
    };
  }

  function normalizeState(nextState) {
    const base = defaultState();
    const normalized = {
      ...base,
      ...nextState,
      settings: {
        ...base.settings,
        ...(nextState?.settings || {}),
      },
      ui: {
        ...base.ui,
        ...(nextState?.ui || {}),
        commerceFilters: {
          ...base.ui.commerceFilters,
          ...(nextState?.ui?.commerceFilters || {}),
        },
      },
      cadEdits: {
        selected: nextState?.cadEdits?.selected || null,
        offsets: nextState?.cadEdits?.offsets || {},
        hidden: nextState?.cadEdits?.hidden || {},
        layerVisibility: {
          walls: true,
          tiles: false,
          floor: true,
          doors: true,
          ...(nextState?.cadEdits?.layerVisibility || {}),
        },
        history: nextState?.cadEdits?.history || [],
      },
    };

    normalized.inventory = Object.fromEntries(
      Object.entries(nextState?.inventory || {})
        .map(([productId, entry]) => [productId, normalizeInventoryEntry(entry, productId)])
        .filter(([, entry]) => entry),
    );
    normalized.regions = (nextState?.regions || []).map(normalizeRegion);
    normalized.openings = (nextState?.openings || []).map(normalizeOpening);
    normalized.fixtures = (nextState?.fixtures || [])
      .filter((fixture) => productById(fixture.productId))
      .map((fixture) => ({
        id: fixture.id || crypto.randomUUID(),
        productId: fixture.productId,
        x: Number(fixture.x || 0),
        z: Number(fixture.z || 0),
        rotation: Number(fixture.rotation || 0),
      }));

    if (!VALID_COMMERCE_TABS.has(normalized.ui.activeCommerceTab)) {
      normalized.ui.activeCommerceTab = 'store';
    }

    if (!productById(normalized.settings.defaultTileId) || productById(normalized.settings.defaultTileId)?.type !== 'tile') {
      normalized.settings.defaultTileId = tileProducts[0]?.id || '';
    }
    if (!productById(normalized.settings.selectedFixtureId)) {
      normalized.settings.selectedFixtureId = fixtureProducts.find(isPlaceableProduct)?.id || fixtureProducts[0]?.id || '';
    }
    if (!walls.some((wall) => wall.id === normalized.settings.selectedWallId)) {
      normalized.settings.selectedWallId = walls[0]?.id || 'wall-0';
    }
    if (!['floor', 'wall', 'walls', 'all'].includes(normalized.settings.selectedSurface)) {
      normalized.settings.selectedSurface = 'floor';
    }
    // Auto-tile sıfırlama mantığı:
    // - tiledSurfaceIds yoksa (eski state) VEYA
    // - kayıtlı model anahtarı mevcut modelden farklıysa (model değişti)
    //   → decision'dan yeniden doldur. Aksi halde (aynı model) kullanıcının
    //   Face Select seçimlerini koru, yalnız geçerli id'lere filtrele.
    const curKey = meta?.source || '';
    const sameModel = normalized.settings.tiledModelKey === curKey;
    if (!Array.isArray(normalized.settings.tiledSurfaceIds) || !sameModel) {
      normalized.settings.tiledSurfaceIds = ['floor', ...walls
        .filter((w) => w && w.decision?.tileable !== false)
        .map((w) => w.id)];
      normalized.settings.tiledModelKey = curKey;
    } else {
      const valid = new Set(['floor', ...walls.map((w) => w.id)]);
      normalized.settings.tiledSurfaceIds = normalized.settings.tiledSurfaceIds.filter((id) => valid.has(id));
    }

    if (!productById(normalized.ui.selectedProductId)) {
      normalized.ui.selectedProductId = normalized.settings.defaultTileId || products[0]?.id || '';
    }

    Object.values(normalized.inventory).forEach((entry) => {
      entry.applications = uniqueStrings(entry.applications);
      entry.usageContexts = uniqueStrings([...(entry.usageContexts || []), ...entry.applications]);
    });

    return normalized;
  }

  function loadState() {
    try {
      const sig = geometrySignature();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.geometrySource === sig) return normalizeState(saved);
      if (saved && saved.geometrySource !== sig) {
        // Yeni model algılandı (reload'suz geçiş dahil): confirm YOK. Yerleşim
        // (bölge/boşluk/eşya/tiledSurfaceIds) sıfırlanır, envanter korunur.
        return normalizeState({
          ...defaultState(),
          inventory: saved.inventory || {},
          geometrySource: sig,
        });
      }
    } catch {
      // ignore broken storage
    }
    return normalizeState(defaultState());
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function selectedWall() {
    return walls.find((wall) => wall.id === state.settings.selectedWallId) || walls[0];
  }

  function selectedSurfaces() {
    // Face Select / auto-tile: tiledSurfaceIds kümesi varsa onu kullan
    // (per-yüzey toggle). Boşsa eski mod mantığına düş (geriye uyumlu).
    const ids = state.settings.tiledSurfaceIds;
    if (Array.isArray(ids)) {
      const all = [floorSurface, ...walls].filter(Boolean);
      return all.filter((s) => ids.includes(s.id));
    }
    if (state.settings.selectedSurface === 'floor') return [floorSurface];
    if (state.settings.selectedSurface === 'wall') {
      const wall = selectedWall();
      return wall ? [wall] : [];
    }
    if (state.settings.selectedSurface === 'walls') return walls.filter(Boolean);
    return [floorSurface, ...walls].filter(Boolean);
  }

  /** Face Select: bir yüzeyin kaplama durumunu aç/kapa. */
  function toggleTiledSurface(surfaceId) {
    if (!surfaceId) return;
    const ids = Array.isArray(state.settings.tiledSurfaceIds)
      ? state.settings.tiledSurfaceIds.slice()
      : [];
    const i = ids.indexOf(surfaceId);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(surfaceId);
    state.settings.tiledSurfaceIds = ids;
  }

  function ensureInventory(productId, context, options = {}) {
    const {
      increment = 0,
      minimumQuantity = 0,
      lastAction = 'sync',
      manualDelta = 0,
    } = options;
    const current = normalizeInventoryEntry(state.inventory[productId], productId) || normalizeInventoryEntry({}, productId);
    if (!current) return null;
    current.quantity = Math.max(minimumQuantity, current.quantity + increment);
    current.manualQuantity = Math.max(0, current.manualQuantity + manualDelta);
    if (current.quantity === 0 && minimumQuantity > 0) current.quantity = minimumQuantity;
    if (context && !current.applications.includes(context)) current.applications.push(context);
    if (context && !current.usageContexts.includes(context)) current.usageContexts.push(context);
    current.lastAction = lastAction;
    state.inventory[productId] = current;
    return current;
  }

  function syncSelections() {
    const inventoryTileIds = Object.values(state.inventory)
      .map((entry) => entry.productId)
      .filter((id) => productById(id)?.type === 'tile');
    const selectableTiles = inventoryTileIds.length
      ? tileProducts.filter((tile) => inventoryTileIds.includes(tile.id))
      : tileProducts;
    if (!selectableTiles.some((tile) => tile.id === state.settings.defaultTileId)) {
      state.settings.defaultTileId = selectableTiles[0]?.id || tileProducts[0]?.id || '';
    }

    const inventoryFixtureIds = Object.values(state.inventory)
      .map((entry) => entry.productId)
      .filter((id) => isPlaceableProduct(productById(id)));
    const selectableFixtures = inventoryFixtureIds.length
      ? fixtureProducts.filter((product) => inventoryFixtureIds.includes(product.id) && isPlaceableProduct(product))
      : fixtureProducts.filter(isPlaceableProduct);
    if (!selectableFixtures.some((product) => product.id === state.settings.selectedFixtureId)) {
      state.settings.selectedFixtureId = selectableFixtures[0]?.id || fixtureProducts.find(isPlaceableProduct)?.id || '';
    }
    if (!productById(state.ui.selectedProductId)) {
      state.ui.selectedProductId = state.settings.defaultTileId || selectableTiles[0]?.id || products[0]?.id || '';
    }
  }

  function addInventoryProduct(productId, context = 'Envanter') {
    const product = productById(productId);
    if (!product) return;
    logger.success(`Envantere ürün eklendi: ${product.name} (ID: ${productId}, Bağlam: ${context})`);
    ensureInventory(productId, context, {
      increment: 1,
      minimumQuantity: 1,
      lastAction: 'inventory-add',
      manualDelta: 1,
    });
    if (isPlaceableProduct(product)) state.settings.selectedFixtureId = product.id;
    state.ui.selectedProductId = product.id;
    syncSelections();
  }

  function setDefaultTile(productId, context = 'Ana kaplama') {
    const product = productById(productId);
    if (!product || product.type !== 'tile') return;
    logger.info(`Ana seramik değiştirildi: ${product.name} (ID: ${productId}, Bağlam: ${context})`);
    state.settings.defaultTileId = productId;
    ensureInventory(productId, context, {
      minimumQuantity: 1,
      lastAction: 'default-tile',
    });
    state.ui.selectedProductId = productId;
    syncSelections();
  }

  function preparePlacement(productId) {
    const product = productById(productId);
    if (!isPlaceableProduct(product)) return;
    logger.info(`Yerleşim hazırlığı yapıldı: ${product.name} (ID: ${productId})`);
    state.settings.selectedFixtureId = productId;
    ensureInventory(productId, 'Yerlesim', {
      minimumQuantity: 1,
      lastAction: 'prepare-placement',
    });
    state.ui.selectedProductId = productId;
    syncSelections();
  }

  function updateInventoryQuantity(productId, delta) {
    const product = productById(productId);
    if (!product) return;
    logger.info(`Envanter ürün miktarı güncellendi: ${product.name} (ID: ${productId}), Değişim: ${delta}`);
    const entry = ensureInventory(productId, null, {
      increment: delta,
      minimumQuantity: 0,
      lastAction: delta > 0 ? 'quantity-increase' : 'quantity-decrease',
      manualDelta: delta,
    });
    if (!entry) return;
    if (entry.quantity <= 0) {
      removeInventoryProduct(productId);
      return;
    }
    state.inventory[productId] = entry;
    syncSelections();
  }

  function removeInventoryProduct(productId) {
    const product = productById(productId);
    logger.warn(`Ürün envanterden silindi: ${product ? product.name : productId}`);
    delete state.inventory[productId];
    state.fixtures = state.fixtures.filter((fixture) => fixture.productId !== productId);

    if (product?.type === 'tile') {
      const fallbackTileId = tileProducts.find((tile) => tile.id !== productId)?.id || '';
      if (state.settings.defaultTileId === productId) state.settings.defaultTileId = fallbackTileId;
      state.regions = state.regions.map((region) => ({
        ...region,
        tileId: region.tileId === productId ? (fallbackTileId || region.tileId) : region.tileId,
      }));
    }
    if (state.settings.selectedFixtureId === productId) {
      state.settings.selectedFixtureId = fixtureProducts.find((item) => item.id !== productId && isPlaceableProduct(item))?.id || '';
    }
    if (state.ui.selectedProductId === productId) {
      state.ui.selectedProductId = state.settings.defaultTileId || products.find((item) => item.id !== productId)?.id || '';
    }
    syncSelections();
  }

  function getSelectableTiles() {
    syncSelections();
    const inventoryTileIds = Object.values(state.inventory)
      .map((entry) => entry.productId)
      .filter((id) => productById(id)?.type === 'tile');
    return inventoryTileIds.length
      ? tileProducts.filter((tile) => inventoryTileIds.includes(tile.id))
      : tileProducts;
  }

  function getSelectableFixtures() {
    syncSelections();
    const inventoryFixtureIds = Object.values(state.inventory)
      .map((entry) => entry.productId)
      .filter((id) => isPlaceableProduct(productById(id)));
    const placeableProducts = fixtureProducts.filter(isPlaceableProduct);
    return inventoryFixtureIds.length
      ? placeableProducts.filter((product) => inventoryFixtureIds.includes(product.id))
      : placeableProducts;
  }

  function getInventoryRows(simulation) {
    syncSelections();
    return Object.values(state.inventory)
      .map((entry) => {
        const product = productById(entry.productId);
        if (!product) return null;
        const calc = simulation?.byProduct.get(product.id);
        const required = product.type === 'tile' ? Number(calc?.required || 0) : entry.quantity;
        const requiredBoxes = product.type === 'tile'
          ? Math.ceil(required / Math.max(1, Number(product.pieces_per_box || 1)))
          : null;
        // Alan-bazlı fire hesabı (calculation.js ile tutarlı)
        const orderQuantity = product.type === 'tile'
          ? (calc?.order ?? Math.ceil(required * (1 + Number(state.settings.wastePct || 0) / 100)))
          : entry.quantity;
        const orderBoxes = product.type === 'tile'
          ? (calc?.orderBoxes ?? Math.ceil(orderQuantity / Math.max(1, Number(product.pieces_per_box || 1))))
          : null;
        const estimatedCost = product.type === 'tile'
          ? orderBoxes * Number(product.price || 0)
          : entry.quantity * Number(product.price || 0);
        const usageContexts = uniqueStrings([
          ...(entry.usageContexts || []),
          ...(calc?.regions.map((regionEntry) => regionEntry.region.name) || []),
        ]);
        const placementCount = state.fixtures.filter((fixture) => fixture.productId === product.id).length;
        return {
          product,
          entry,
          calc,
          required,
          requiredBoxes,
          orderQuantity,
          orderBoxes,
          estimatedCost,
          usageContexts,
          placementCount,
          isDefaultTile: state.settings.defaultTileId === product.id,
          isSelectedFixture: state.settings.selectedFixtureId === product.id,
          typeLabel: formatProductType(product),
          sizeLabel: formatProductSize(product),
          usageLabel: getProductUsageLabel(product),
          canPlace: isPlaceableProduct(product),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'tr'));
  }

  function getProductRow(productId, simulation) {
    return getInventoryRows(simulation).find((row) => row.product.id === productId) || null;
  }

  function getDetectedFeatures() {
    if (Array.isArray(geometryData.features) && geometryData.features.length) return geometryData.features;
    return [];
  }

  return {
    get state() {
      return state;
    },
    set state(nextState) {
      state = normalizeState(nextState);
    },
    meta,
    products,
    tileProducts,
    fixtureProducts,
    walls,
    floorSurface,
    geometryData,
    productById,
    surfaceById,
    selectedWall,
    selectedSurfaces,
    toggleTiledSurface,
    saveState,
    normalizeState,
    ensureInventory,
    addInventoryProduct,
    setDefaultTile,
    preparePlacement,
    updateInventoryQuantity,
    removeInventoryProduct,
    isPlaceableProduct,
    getSelectableTiles,
    getSelectableFixtures,
    getInventoryRows,
    getProductRow,
    getDetectedFeatures,
    syncSelections,
    formatProductType,
    formatProductSize,
    formatCurrency,
    getProductUsageLabel,
  };
}
