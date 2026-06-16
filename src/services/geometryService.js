/**
 * geometryService.js
 * 
 * Geometri ve building CAD verilerinin getirilmesi için service katmanı.
 * geometrySlice.js içerisindeki fetch/fallback logic buraya taşındı.
 */

async function fetchWithFallback(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {
      // Bir sonrakini dene
    }
  }
  return null;
}

/**
 * Aktif model id'sini main.js ile AYNI mantıkla çözer:
 *   1. ?model= URL parametresi
 *   2. localStorage 'seramikcim.active-model'
 *   3. 'current' (hazırlanan aktif CAD)
 * Böylece React'in yüklediği geometri (mesh URL + ölçek + merkez) legacy
 * bridge ile aynı modele işaret eder → mesh her modelde doğru değişir.
 */
function resolveModelId() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('model');
    if (fromUrl) return fromUrl;
    const fromStorage = window.localStorage?.getItem('seramikcim.active-model');
    if (fromStorage) return fromStorage;
  } catch {
    // Kısıtlı ortam — current'a düş
  }
  return 'current';
}

function modelUrls(suffix) {
  const id = resolveModelId();
  const urls = [];
  if (id && id !== 'current') urls.push(`/${id}_${suffix}.json`);
  urls.push(`/current_${suffix}.json`, `/banyo_${suffix}.json`);
  return urls;
}

export const geometryService = {
  /**
   * Geometri verisini getirir (aktif modele göre)
   */
  async fetchGeometry() {
    return await fetchWithFallback(modelUrls('geometry'));
  },

  /**
   * Building verisini getirir (aktif modele göre)
   */
  async fetchBuilding() {
    return await fetchWithFallback(modelUrls('building'));
  },
};
