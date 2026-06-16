/**
 * inventorySlice — katalog ve envanter (kullanıcının seçtiği ürünler)
 *
 * Katalog ürünleri catalogService üzerinden yüklenir.
 * Envanter (kullanıcı seçimi) localStorage'a kalıcıdır.
 */
import { catalogService } from '../../services/catalogService.js';
import { logger } from '../../utils/logger.js';

export function createInventorySlice(set, get) {
  return {
    catalog: [],
    catalogLoading: false,
    catalogError: null,
    inventory: [],

    async loadCatalog() {
      set({ catalogLoading: true, catalogError: null });
      try {
        const catalog = await catalogService.fetchCatalog();
        set({ catalog, catalogLoading: false });
      } catch (err) {
        set({
          catalogError: err.message,
          catalogLoading: false,
        });
      }
    },

    addToInventory(productId, quantity = 1) {
      const product = get().catalog.find((p) => p.id === productId);
      if (!product) return;
      logger.success(`[Zustand] Envantere ürün eklendi: ${product.name} (ID: ${productId}, Miktar: ${quantity})`);
      set((state) => {
        const existing = state.inventory.find((item) => item.id === productId);
        if (existing) {
          return {
            inventory: state.inventory.map((item) =>
              item.id === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item,
            ),
          };
        }
        return {
          inventory: [
            ...state.inventory,
            { id: productId, quantity, addedAt: new Date().toISOString() },
          ],
        };
      });
    },

    removeFromInventory(productId) {
      const product = get().catalog.find((p) => p.id === productId);
      logger.warn(`[Zustand] Ürün envanterden silindi: ${product ? product.name : productId}`);
      set((state) => ({
        inventory: state.inventory.filter((item) => item.id !== productId),
      }));
    },

    setInventoryQuantity(productId, quantity) {
      if (quantity <= 0) {
        get().removeFromInventory(productId);
        return;
      }
      const product = get().catalog.find((p) => p.id === productId);
      logger.info(`[Zustand] Envanter ürün miktarı güncellendi: ${product ? product.name : productId}, Yeni miktar: ${quantity}`);
      set((state) => ({
        inventory: state.inventory.map((item) =>
          item.id === productId ? { ...item, quantity } : item,
        ),
      }));
    },

    clearInventory() {
      logger.warn('[Zustand] Envanter temizlendi.');
      set({ inventory: [] });
    },
  };
}

