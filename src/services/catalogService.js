/**
 * catalogService.js
 * 
 * Katalog verilerinin getirilmesi için service katmanı.
 * inventorySlice.js içerisindeki fetch/fallback logic buraya taşındı.
 */

function validateProducts(raw) {
  const list = Array.isArray(raw) ? raw : raw?.products || [];
  return list.filter((p) => p?.id && p?.type && p?.name);
}

export const catalogService = {
  async fetchCatalog() {
    for (const url of ['/api/catalog', '/catalog.json']) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          console.warn(`[catalogService] ${url} → HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        return validateProducts(data);
      } catch (err) {
        console.warn(`[catalogService] ${url} başarısız:`, err.message);
      }
    }
    throw new Error('Katalog yüklenemedi (API ve fallback başarısız).');
  },
};
