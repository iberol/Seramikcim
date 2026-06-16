/**
 * MainPage.js - POM for the main layout and generic controls
 */
export class MainPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.modelSelect = page.locator('#model-select');
    this.surfaceSelect = page.locator('#surface-select');
    this.launcherBtn = page.locator('#launcher-open-btn');
    this.commerceBtn = page.locator('#commerce-open-btn');
    this.wireframeChip = page.locator('#wireframe-status-chip');
    this.resultArea = page.locator('#result-area');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector('#model-select', { timeout: 15000 });
  }

  async selectSurface(value) {
    await this.surfaceSelect.selectOption(value);
  }

  async selectModel(modelId) {
    await this.modelSelect.selectOption(modelId);
  }

  async openLauncher() {
    await this.launcherBtn.click();
    await this.page.waitForSelector('.launcher-panel', { state: 'visible' });
  }

  async openCommerce() {
    await this.commerceBtn.click();
    await this.page.waitForSelector('.commerce-drawer', { state: 'visible' });
  }
}
