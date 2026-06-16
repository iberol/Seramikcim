// banyo-only.spec.js — Banyo.obj tek model durumunda doğrulama
import { test, expect } from '@playwright/test';

test('Banyo-only model + wall planes correct', async ({ page, context }) => {
  test.setTimeout(60000);
  await context.clearCookies();
  await page.addInitScript(() => {
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (_) {}
  });

  await page.goto('/?model=Banyo');
  await page.waitForSelector('#model-select', { timeout: 15000 });
  await page.waitForTimeout(4500);

  // Model dropdown options
  const options = await page.evaluate(() => {
    const sel = document.getElementById('model-select');
    if (!sel) return [];
    return Array.from(sel.options).map((o) => o.text);
  });
  console.log('MODEL OPTIONS:', JSON.stringify(options));

  // Banyo seçili olmalı
  const meta = await page.evaluate(() => {
    const dbg = typeof window.__wireframeDebug === 'function' ? window.__wireframeDebug() : null;
    return dbg ? {
      source: dbg.source,
      mode: dbg.geometry_mode,
      walls: (dbg.wall_planes || []).length,
      floor: dbg.wireframe_surfaces?.floor?.area,
      total: dbg.wireframe_surfaces?.total_surface_area,
      wall_height: dbg.wireframe_wall_height_m,
    } : null;
  });
  console.log('META:', JSON.stringify(meta));

  // Tam sayfa screenshot
  await page.screenshot({ path: 'tests/e2e/banyo-only-default.png', fullPage: false });

  // Yukarıdan bakış
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 300, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/banyo-only-top.png', fullPage: false });

  expect(meta?.mode).toMatch(/wireframe-driven|mesh-face/);
  expect(meta?.walls).toBeGreaterThanOrEqual(4);
  expect(meta?.wall_height).toBeLessThan(2.5);  // çatıya çıkmıyor
  expect(meta?.wall_height).toBeGreaterThan(1.5);
});
