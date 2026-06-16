import {
  cm,
  fmt,
  formatCurrency,
  formatProductSize,
  formatProductType,
  getProductUsageLabel,
} from './state.js';
import { escapeHtml } from './src/utils/escape.js';

export function createCommerceController({ dom, stateManager, getSimulation, renderAll, onOpenCad }) {
  const drawer = dom.commerceDrawer;

  function open(tab = stateManager.state.ui.activeCommerceTab || 'store') {
    stateManager.state.ui.commerceDrawerOpen = true;
    stateManager.state.ui.activeCommerceTab = tab;
    drawer.classList.remove('hidden');
    document.body.classList.add('commerce-open');
    render();
  }

  function close() {
    stateManager.state.ui.commerceDrawerOpen = false;
    drawer.classList.add('hidden');
    document.body.classList.remove('commerce-open');
    stateManager.saveState();
  }

  function updateFilter(name, value) {
    stateManager.state.ui.commerceFilters[name] = value;
    stateManager.state.ui.activeCommerceTab = 'store';
    stateManager.saveState();
    render();
  }

  function matchesFilter(product, filters) {
    const query = filters.query.trim().toLocaleLowerCase('tr');
    const sizeLabel = formatProductSize(product);
    const surfaceText = product.surface || '';
    const haystack = [
      product.name,
      product.sku,
      formatProductType(product),
      sizeLabel,
      surfaceText,
      getProductUsageLabel(product),
    ].join(' ').toLocaleLowerCase('tr');

    if (query && !haystack.includes(query)) return false;
    if (filters.category !== 'all' && product.type !== filters.category) return false;
    if (filters.type !== 'all' && product.type !== filters.type) return false;
    if (filters.surface !== 'all') {
      if (filters.surface === 'mat' && product.surface !== 'mat') return false;
      if (filters.surface === 'parlak' && product.surface !== 'parlak') return false;
      if (filters.surface === 'saten' && product.surface !== 'saten') return false;
      if (filters.surface === 'placement' && product.type === 'tile') return false;
    }
    if (filters.size !== 'all') {
      const maxSideCm = Math.max(cm(product.width_m), cm(product.height_m), cm(product.depth_m), cm(product.length_m));
      if (filters.size === 'small' && maxSideCm >= 40) return false;
      if (filters.size === 'medium' && (maxSideCm < 40 || maxSideCm > 80)) return false;
      if (filters.size === 'large' && maxSideCm <= 80) return false;
    }
    return true;
  }

  function sortProducts(rows, sort) {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === 'price') return Number(a.price || 0) - Number(b.price || 0);
      if (sort === 'size') return Math.max(cm(a.width_m), cm(a.height_m), cm(a.depth_m)) - Math.max(cm(b.width_m), cm(b.height_m), cm(b.depth_m));
      if (sort === 'box') return Number(a.sqm_per_box || 0) - Number(b.sqm_per_box || 0);
      return a.name.localeCompare(b.name, 'tr');
    });
    return sorted;
  }

  function openDetail(productId, fromTab = stateManager.state.ui.activeCommerceTab || 'store') {
    stateManager.state.ui.selectedProductId = productId;
    stateManager.state.ui.activeCommerceTab = 'detail';
    stateManager.state.ui.lastCommerceTab = fromTab;
    stateManager.saveState();
    render();
  }

  function handleProductAction(productId, action) {
    if (action === 'default-tile') stateManager.setDefaultTile(productId, 'Ana kaplama');
    if (action === 'inventory-add') stateManager.addInventoryProduct(productId, 'Envanter');
    if (action === 'prepare-placement') stateManager.preparePlacement(productId);
    stateManager.saveState();
    renderAll();
  }

  function renderStore() {
    const simulation = getSimulation();
    const filters = stateManager.state.ui.commerceFilters;
    const filtered = sortProducts(
      stateManager.products.filter((product) => matchesFilter(product, filters)),
      filters.sort,
    );

    dom.commerceStoreList.innerHTML = filtered.map((product) => {
      const row = stateManager.getProductRow(product.id, simulation);
      return `
        <article class="commerce-card${stateManager.state.ui.selectedProductId === product.id ? ' active' : ''}">
          <button class="commerce-card-main" data-product-detail="${product.id}">
            <span class="swatch" style="background:${product.color || '#888'}"></span>
            <span class="commerce-card-copy">
              <strong>${escapeHtml(product.name)}</strong>
              <small>${escapeHtml(product.sku || '')} • ${escapeHtml(formatProductType(product))}</small>
              <small>${escapeHtml(formatProductSize(product))}${product.sqm_per_box ? ` • ${escapeHtml(String(product.sqm_per_box))} m2/kutu` : ''}</small>
              <small>${escapeHtml(getProductUsageLabel(product))}</small>
            </span>
          </button>
          <div class="commerce-card-meta">
            <span>${formatCurrency(product.price)}</span>
            <span>${row ? `${row.required || row.entry.quantity} ihtiyac` : 'Katalog urunu'}</span>
          </div>
          <div class="commerce-card-actions">
            ${product.type === 'tile' ? `<button class="chip-btn" data-product-action="default-tile" data-product-id="${product.id}">Ana kaplama olarak sec</button>` : ''}
            <button class="chip-btn" data-product-action="inventory-add" data-product-id="${product.id}">Envantere ekle</button>
            ${stateManager.isPlaceableProduct(product) ? `<button class="chip-btn" data-product-action="prepare-placement" data-product-id="${product.id}">Yerlesime hazirla</button>` : ''}
          </div>
        </article>
      `;
    }).join('') || '<p class="muted">Filtrelere uygun urun bulunamadi.</p>';

    drawer.querySelectorAll('[data-product-detail]').forEach((button) => button.addEventListener('click', () => {
      openDetail(button.dataset.productDetail, 'store');
    }));
    drawer.querySelectorAll('[data-product-action]').forEach((button) => button.addEventListener('click', () => {
      handleProductAction(button.dataset.productId, button.dataset.productAction);
    }));
  }

  function renderInventory() {
    const simulation = getSimulation();
    const rows = stateManager.getInventoryRows(simulation);
    dom.commerceInventoryList.innerHTML = rows.map((row) => `
      <article class="inventory-row">
        <div>
          <strong>${escapeHtml(row.product.name)}</strong>
          <small>${escapeHtml(row.product.sku || '')} • ${escapeHtml(row.typeLabel)} • ${escapeHtml(row.sizeLabel)}</small>
          <small>${escapeHtml(row.usageContexts.join(', ') || row.usageLabel)}</small>
        </div>
        <div>
          <strong>${row.product.type === 'tile' ? `${row.required} adet / ${row.requiredBoxes} kutu` : `${row.entry.quantity} adet`}</strong>
          <small>${row.product.type === 'tile' ? `Fireli siparis: ${row.orderQuantity} adet / ${row.orderBoxes} kutu` : `Yerlesim: ${row.placementCount} kez`}</small>
        </div>
        <div>
          <strong>${formatCurrency(row.estimatedCost)}</strong>
          <small>${row.product.type === 'tile' ? `${row.calc?.regions.length || 0} uygulama bolgesi` : `${row.entry.manualQuantity} manuel miktar`}</small>
        </div>
        <div class="inventory-actions">
          <button class="chip-btn" data-qty="${row.product.id}" data-delta="1">+1</button>
          <button class="chip-btn" data-qty="${row.product.id}" data-delta="-1">-1</button>
          <button class="chip-btn" data-open-detail="${row.product.id}">Detay</button>
          ${row.product.type === 'tile'
            ? `<button class="chip-btn" data-product-action="default-tile" data-product-id="${row.product.id}">Varsayilan yap</button>`
            : (row.canPlace ? `<button class="chip-btn" data-product-action="prepare-placement" data-product-id="${row.product.id}">Yerlesime hazirla</button>` : '')}
          <button class="chip-btn danger" data-remove-product="${row.product.id}">Kaldir</button>
        </div>
      </article>
    `).join('') || '<p class="muted">Henüz envanter kaydi yok.</p>';

    drawer.querySelectorAll('[data-qty]').forEach((button) => button.addEventListener('click', () => {
      stateManager.updateInventoryQuantity(button.dataset.qty, Number(button.dataset.delta));
      stateManager.saveState();
      renderAll();
    }));
    drawer.querySelectorAll('[data-remove-product]').forEach((button) => button.addEventListener('click', () => {
      stateManager.removeInventoryProduct(button.dataset.removeProduct);
      stateManager.saveState();
      renderAll();
    }));
    drawer.querySelectorAll('[data-open-detail]').forEach((button) => button.addEventListener('click', () => {
      openDetail(button.dataset.openDetail, 'inventory');
    }));
    drawer.querySelectorAll('[data-product-action]').forEach((button) => button.addEventListener('click', () => {
      handleProductAction(button.dataset.productId, button.dataset.productAction);
    }));
  }

  function renderDetail() {
    const simulation = getSimulation();
    const product = stateManager.productById(stateManager.state.ui.selectedProductId);
    if (!product) {
      dom.commerceDetailView.innerHTML = '<p class="muted">Urun secimi bulunamadi.</p>';
      return;
    }
    const row = stateManager.getProductRow(product.id, simulation);
    const calcRegions = row?.calc?.regions || [];
    dom.commerceDetailView.innerHTML = `
      <article class="detail-hero">
        <div class="detail-hero-header">
          <span class="swatch large" style="background:${product.color || '#888'}"></span>
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.sku || '')} • ${escapeHtml(formatProductType(product))} • ${escapeHtml(formatProductSize(product))}</p>
          </div>
        </div>
        <div class="detail-stats">
          <div><strong>${formatCurrency(product.price)}</strong><span>Birim fiyat</span></div>
          <div><strong>${product.pieces_per_box || '-'}</strong><span>Kutu icerigi</span></div>
          <div><strong>${product.sqm_per_box || '-'}</strong><span>m2 / kutu</span></div>
          <div><strong>${escapeHtml(getProductUsageLabel(product))}</strong><span>Kullanim baglami</span></div>
        </div>
      </article>
      <div class="detail-columns-2">
        <section class="detail-card">
          <h4>Teknik bilgiler</h4>
          <p>Olcu: ${escapeHtml(formatProductSize(product))}</p>
          <p>Yuzey: ${escapeHtml(product.surface || '-')}</p>
          <p>Tip: ${escapeHtml(formatProductType(product))}</p>
        </section>
        <section class="detail-card">
          <h4>Maliyet ve stok</h4>
          <p>Envanter miktari: ${row ? row.entry.quantity : 0}</p>
          <p>Gerekli miktar: ${row ? row.required : 0}</p>
          <p>Fireli siparis: ${row ? (product.type === 'tile' ? `${row.orderQuantity} adet / ${row.orderBoxes} kutu` : `${row.orderQuantity} adet`) : '-'}</p>
          <p>Tahmini maliyet: ${formatCurrency(row?.estimatedCost)}</p>
        </section>
      </div>
      <section class="detail-card">
        <h4>Uygulama ve kullanim</h4>
        <p>${escapeHtml(row?.usageContexts.join(', ') || getProductUsageLabel(product))}</p>
        <div class="detail-tags">
          ${calcRegions.map((entry) => `<span>${escapeHtml(entry.region.name)}</span>`).join('') || '<span>Henüz uygulama yok</span>'}
        </div>
      </section>
      <div class="commerce-card-actions">
        ${product.type === 'tile' ? `<button class="chip-btn" data-product-action="default-tile" data-product-id="${product.id}">Ana kaplama olarak sec</button>` : ''}
        <button class="chip-btn" data-product-action="inventory-add" data-product-id="${product.id}">Envantere ekle</button>
        ${stateManager.isPlaceableProduct(product) ? `<button class="chip-btn" data-product-action="prepare-placement" data-product-id="${product.id}">Yerlesime hazirla</button>` : ''}
        <button class="chip-btn" id="detail-back-btn">Geri don</button>
      </div>
    `;

    drawer.querySelectorAll('[data-product-action]').forEach((button) => button.addEventListener('click', () => {
      handleProductAction(button.dataset.productId, button.dataset.productAction);
    }));
    dom.commerceDetailView.querySelector('#detail-back-btn')?.addEventListener('click', () => {
      stateManager.state.ui.activeCommerceTab = stateManager.state.ui.lastCommerceTab || 'store';
      stateManager.saveState();
      render();
    });
  }

  function renderTabs() {
    drawer.querySelectorAll('[data-commerce-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.commerceTab === stateManager.state.ui.activeCommerceTab);
    });
    dom.commerceStorePage.classList.toggle('active', stateManager.state.ui.activeCommerceTab === 'store');
    dom.commerceInventoryPage.classList.toggle('active', stateManager.state.ui.activeCommerceTab === 'inventory');
    dom.commerceDetailPage.classList.toggle('active', stateManager.state.ui.activeCommerceTab === 'detail');
  }

  function render() {
    renderTabs();
    renderStore();
    renderInventory();
    renderDetail();
    drawer.classList.toggle('hidden', !stateManager.state.ui.commerceDrawerOpen);
    document.body.classList.toggle('commerce-open', stateManager.state.ui.commerceDrawerOpen);
  }

  drawer.querySelectorAll('[data-commerce-tab]').forEach((button) => button.addEventListener('click', () => {
    stateManager.state.ui.activeCommerceTab = button.dataset.commerceTab;
    stateManager.saveState();
    render();
  }));

  dom.commerceCloseBtn?.addEventListener('click', close);
  dom.commerceQuery?.addEventListener('input', () => updateFilter('query', dom.commerceQuery.value));
  dom.commerceCategory?.addEventListener('change', () => updateFilter('category', dom.commerceCategory.value));
  dom.commerceType?.addEventListener('change', () => updateFilter('type', dom.commerceType.value));
  dom.commerceSurface?.addEventListener('change', () => updateFilter('surface', dom.commerceSurface.value));
  dom.commerceSize?.addEventListener('change', () => updateFilter('size', dom.commerceSize.value));
  dom.commerceSort?.addEventListener('change', () => updateFilter('sort', dom.commerceSort.value));
  dom.openCadFromCommerce?.addEventListener('click', onOpenCad);

  const filters = stateManager.state.ui.commerceFilters;
  if (dom.commerceQuery) dom.commerceQuery.value = filters.query;
  if (dom.commerceCategory) dom.commerceCategory.value = filters.category;
  if (dom.commerceType) dom.commerceType.value = filters.type;
  if (dom.commerceSurface) dom.commerceSurface.value = filters.surface;
  if (dom.commerceSize) dom.commerceSize.value = filters.size;
  if (dom.commerceSort) dom.commerceSort.value = filters.sort;

  return { open, close, render };
}
