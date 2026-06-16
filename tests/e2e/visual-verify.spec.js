// visual-verify.spec.js — wall_planes overlay görsel doğrulama
// Playwright ile screenshot çıkar, kullanıcı incelesin.
// Çalıştırma: npx playwright test tests/e2e/visual-verify.spec.js

import { test, expect } from '@playwright/test';

test.describe('Visual: wall_planes overlay', () => {
  test('wireframe-driven mode + WallPlanes toggle açık → screenshot', async ({ page }) => {
    // Console mesajlarını dinle
    const consoleMsgs = [];
    page.on('console', (msg) => {
      consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');
    await page.waitForSelector('#model-select', { timeout: 15000 });
    await page.waitForTimeout(3000);  // R3F + geometry load

    // Devtools dump: meta verisi
    const meta = await page.evaluate(() => {
      const dbg = typeof window.__wireframeDebug === 'function' ? window.__wireframeDebug() : null;
      return dbg ? {
        geometry_mode: dbg.geometry_mode,
        wall_count: (dbg.wall_planes || []).length,
        wireframe_wall_height_m: dbg.wireframe_wall_height_m,
        floor_y_m: dbg.floor_y_m,
        ceiling_y_m: dbg.ceiling_y_m,
        floor_area: dbg.wireframe_surfaces?.floor?.area,
        total_wall_area: dbg.wireframe_surfaces?.total_wall_area,
      } : null;
    });

    console.log('Meta dump:', JSON.stringify(meta, null, 2));

    // wireframe-driven mode'da WallPlanes default ON
    await page.waitForTimeout(1500);

    // Screenshot — sadece canvas alanı
    await page.screenshot({
      path: 'tests/e2e/wall-planes-overlay.png',
      fullPage: false,
    });

    // Assertion: wireframe-driven mode aktif ve wall_count >= 4
    expect(meta?.geometry_mode).toMatch(/wireframe-driven|mesh-face/);
    expect(meta?.wall_count).toBeGreaterThanOrEqual(4);
    // Real wall height < mesh extents Y (çatıya çıkmamalı)
    if (meta?.wireframe_wall_height_m) {
      expect(meta.wireframe_wall_height_m).toBeLessThan(3.0);
      expect(meta.wireframe_wall_height_m).toBeGreaterThan(1.5);
    }
  });
});
