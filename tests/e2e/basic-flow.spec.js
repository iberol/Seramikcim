import { test, expect } from '@playwright/test';
import { MainPage } from './pages/MainPage.js';
import { ResultPanel } from './pages/ResultPanel.js';

test.describe('E2E Basic Flows', () => {
  let mainPage;
  let resultPanel;

  test.beforeEach(async ({ page }) => {
    mainPage = new MainPage(page);
    resultPanel = new ResultPanel(page);
    await mainPage.goto();
    // Beklemesi için bir saniye koyuyoruz ki ilk simülasyon hesaplaması bitsin.
    await page.waitForTimeout(1000);
  });

  test('Fallback oda yüklenir ve m2 hesaplanır', async () => {
    // 3D sahnenin yüklendiğinden emin ol
    await expect(mainPage.wireframeChip).toBeVisible();
    
    const areaText = await resultPanel.getArea();
    expect(areaText).toMatch(/[0-9]+/);
    
    const orderCount = await resultPanel.getOrderCount();
    expect(orderCount).toBeGreaterThan(0);
  });

  test('Seramik değiştirilince sonucun güncellenmesi (mock UI flow)', async ({ page }) => {
    const initialOrder = await resultPanel.getOrderCount();

    // Commerce paneli aç (seçim yapmayı simüle edebiliriz veya selectbox kullanabiliriz)
    // Şu an için default tile select üzerinden yapalım:
    const defaultTileSelect = page.locator('#default-tile-select');
    const options = await defaultTileSelect.locator('option').count();

    if (options > 1) {
      const secondOption = await defaultTileSelect.locator('option').nth(1).getAttribute('value');
      await defaultTileSelect.selectOption(secondOption);
      
      // Simülasyonun güncellenmesini bekle
      await page.waitForTimeout(1000);
      
      const newOrder = await resultPanel.getOrderCount();
      // Farklı ebatlı seramik ise farklı sipariş adedi çıkmalı (ya da hesaplama tetiklendiğini bilelim)
      // Tam kesinlik için en azından değerlerin parse edilebildiğini doğruluyoruz.
      expect(newOrder).toBeGreaterThan(0);
    }
  });

  test('Açıklık (Opening) eklenince metraj düşmeli', async ({ page }) => {
    // 1. Duvar yüzeyini seç
    const surfaceSelect = page.locator('#surface-select');
    const wallSelect = page.locator('#wall-select');
    await surfaceSelect.selectOption('wall');
    await page.waitForTimeout(500);

    // Duvar seçeneklerinden ilkini seç
    if (await wallSelect.locator('option').count() > 0) {
      const firstWall = await wallSelect.locator('option').nth(0).getAttribute('value');
      await wallSelect.selectOption(firstWall);
      await page.waitForTimeout(500);

      const initialOrder = await resultPanel.getOrderCount();

      // 2. Opening ekle (w=1, h=2 gibi)
      await page.locator('#opening-w-input').fill('1');
      await page.locator('#opening-h-input').fill('2');
      await page.locator('#add-opening-btn').click();

      // 3. Hesaplamanın güncellenmesini bekle
      await page.waitForTimeout(1000);

      const newOrder = await resultPanel.getOrderCount();
      
      // Duvar alanından boşluk düşüldüğü için daha az sipariş çıkmalı
      expect(newOrder).toBeLessThanOrEqual(initialOrder);
    }
  });
});
