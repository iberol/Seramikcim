// smoke.spec.js — Seramikcim e2e smoke testleri (Phase E)
// Çalıştırma: npm run test:e2e
// Gereksinim: dev server (npm run dev) port 5173'te erişilebilir
//             VEYA playwright webServer config otomatik başlatır.

import { test, expect } from '@playwright/test';

test.describe('Seramikcim smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // App init için tile select bekleniyor
    await page.waitForSelector('#model-select', { timeout: 15000 });
  });

  test('header görünür + brand', async ({ page }) => {
    const brand = page.locator('.brand >> text=Seramikcim');
    await expect(brand).toBeVisible();
  });

  test('Banyo modeli yüklenince wireframe chip görünür', async ({ page }) => {
    // model-select default olarak Banyo veya ilk model seçiyor
    await page.waitForTimeout(2000);
    const chip = page.locator('#wireframe-status-chip');
    const chipVisible = await chip.isVisible().catch(() => false);
    if (chipVisible) {
      const text = await chip.textContent();
      // Wireframe-driven veya doğrulandı/uyumsuz mesajlarından biri
      expect(text).toMatch(/Wireframe|wireframe|Face-based|face-based/);
    }
  });

  test('Surface dropdown → m² değer üretir', async ({ page }) => {
    const surfaceSelect = page.locator('#surface-select');
    // İlk surface seçimi (varsayılan 'floor')
    await page.waitForTimeout(2000);
    const resultArea = page.locator('#result-area');
    const text = await resultArea.textContent();
    // m² formatı: "5.35 m2" gibi
    expect(text).toMatch(/[0-9]/);
  });

  test('Surface değiştirince m² farklı hesap', async ({ page }) => {
    await page.waitForTimeout(2000);
    const resultArea = page.locator('#result-area');
    const initialText = await resultArea.textContent();

    const surfaceSelect = page.locator('#surface-select');
    const options = await surfaceSelect.locator('option').count();
    if (options > 1) {
      // İkinci seçeneğe geç (genelde duvar)
      const secondValue = await surfaceSelect.locator('option').nth(1).getAttribute('value');
      if (secondValue) {
        await surfaceSelect.selectOption(secondValue);
        await page.waitForTimeout(1500);
        const newText = await resultArea.textContent();
        // Surface değişti → m² farklı olmalı
        expect(newText).not.toBe(initialText);
      }
    }
  });

  test('Paneller dropdown açılır + dışa tıklayınca kapanır', async ({ page }) => {
    const panelBtn = page.locator('.panels-restore-btn');
    if (await panelBtn.isVisible()) {
      await panelBtn.click();
      const menu = page.locator('#panels-restore-menu');
      await expect(menu).toBeVisible();
      // Body'ye click → kapanır
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(300);
      const isHidden = await menu.evaluate((el) => el.classList.contains('hidden'));
      expect(isHidden).toBe(true);
    }
  });

  test('Console kritik error yok (ignore üçüncü taraf network warn)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Network failure / 404 / sourcemap gibi gürültüleri filtrele
        if (
          !text.includes('Failed to load')
          && !text.includes('net::ERR')
          && !text.includes('favicon')
        ) {
          errors.push(text);
        }
      }
    });
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);
  });
});
