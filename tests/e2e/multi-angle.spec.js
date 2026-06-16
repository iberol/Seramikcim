// multi-angle.spec.js — wall_planes overlay'i 4 farklı açıdan capture
// Fresh state (localStorage clear) + orbit drag ile gerçek user davranışı
import { test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('multi-angle wall planes capture', async ({ page, context }) => {
  test.setTimeout(60000);
  // Fresh state — localStorage temizle
  await context.clearCookies();
  await page.addInitScript(() => {
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (_) {}
  });

  await page.goto('/');
  await page.waitForSelector('#model-select', { timeout: 15000 });
  await page.waitForTimeout(4500);

  const meta = await page.evaluate(() => {
    const dbg = typeof window.__wireframeDebug === 'function' ? window.__wireframeDebug() : null;
    return dbg ? {
      mode: dbg.geometry_mode,
      walls: (dbg.wall_planes || []).length,
      floor_area: dbg.wireframe_surfaces?.floor?.area,
      wall_total: dbg.wireframe_surfaces?.total_wall_area,
      wall_height: dbg.wireframe_wall_height_m,
      floor_y: dbg.floor_y_m,
      ceiling_y: dbg.ceiling_y_m,
    } : null;
  });
  console.log('META:', JSON.stringify(meta));

  // Canvas bounds
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas yok');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Default — center start
  await page.screenshot({ path: 'tests/e2e/angle-default.png' });

  // Yukarıdan: mouse drag up
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 250, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/angle-top.png' });

  // Yan açı: drag right
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 250, cy + 80, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/angle-side.png' });

  // Yakın çekim: wheel zoom in
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/angle-close.png' });

  // Tüm yüzeyler seçimi → tüm wall planes görünür
  await page.evaluate(() => {
    const surfaceSelect = document.getElementById('surface-select');
    if (surfaceSelect) {
      const lastOption = surfaceSelect.options[surfaceSelect.options.length - 1];
      surfaceSelect.value = lastOption.value;
      surfaceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1500);
  // Reset zoom + look down
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/angle-all-surfaces.png' });
});
