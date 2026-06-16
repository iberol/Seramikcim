/**
 * store-inventory.test.js — inventorySlice testleri (mini store ile)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { createInventorySlice } from '../src/store/slices/inventorySlice.js';

function makeStore() {
  return create((set, get) => ({
    ...createInventorySlice(set, get),
  }));
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('loadCatalog', () => {
  it('FastAPI başarılıysa products dizisini set eder', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [{ id: 'p1', type: 'tile', name: 'Test' }] }),
    });
    const store = makeStore();
    await store.getState().loadCatalog();
    // validateProducts geçerli ürün için id + type + name şart koşar
    expect(store.getState().catalog).toEqual([{ id: 'p1', type: 'tile', name: 'Test' }]);
    expect(store.getState().catalogLoading).toBe(false);
  });

  it('FastAPI fail → catalog.json fallback denenir', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'p2', type: 'tile', name: 'Fallback' }],
      });
    const store = makeStore();
    await store.getState().loadCatalog();
    expect(store.getState().catalog).toEqual([{ id: 'p2', type: 'tile', name: 'Fallback' }]);
  });

  it('her iki fail → catalogError set edilir', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const store = makeStore();
    await store.getState().loadCatalog();
    expect(store.getState().catalogError).toBeTruthy();
    expect(store.getState().catalog).toEqual([]);
  });
});

describe('addToInventory', () => {
  it('catalog\'ta olmayan ürün eklenmez', () => {
    const store = makeStore();
    store.getState().addToInventory('nonexistent');
    expect(store.getState().inventory).toEqual([]);
  });

  it('yeni ürün quantity=1 ile eklenir', () => {
    const store = makeStore();
    store.setState({ catalog: [{ id: 'p1', name: 'Test' }] });
    store.getState().addToInventory('p1');
    expect(store.getState().inventory).toHaveLength(1);
    expect(store.getState().inventory[0].quantity).toBe(1);
  });

  it('var olan ürün quantity artar', () => {
    const store = makeStore();
    store.setState({ catalog: [{ id: 'p1', name: 'Test' }] });
    store.getState().addToInventory('p1', 2);
    store.getState().addToInventory('p1', 3);
    expect(store.getState().inventory[0].quantity).toBe(5);
  });
});

describe('removeFromInventory', () => {
  it('ürün filtrelenir', () => {
    const store = makeStore();
    store.setState({ inventory: [{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }] });
    store.getState().removeFromInventory('p1');
    expect(store.getState().inventory).toHaveLength(1);
    expect(store.getState().inventory[0].id).toBe('p2');
  });
});

describe('setInventoryQuantity', () => {
  it('quantity <= 0 ise remove tetiklenir', () => {
    const store = makeStore();
    store.setState({ inventory: [{ id: 'p1', quantity: 3 }] });
    store.getState().setInventoryQuantity('p1', 0);
    expect(store.getState().inventory).toEqual([]);
  });

  it('positive quantity güncellenir', () => {
    const store = makeStore();
    store.setState({ inventory: [{ id: 'p1', quantity: 3 }] });
    store.getState().setInventoryQuantity('p1', 10);
    expect(store.getState().inventory[0].quantity).toBe(10);
  });
});

describe('clearInventory', () => {
  it('inventory boşaltılır', () => {
    const store = makeStore();
    store.setState({ inventory: [{ id: 'p1', quantity: 5 }] });
    store.getState().clearInventory();
    expect(store.getState().inventory).toEqual([]);
  });
});
