/**
 * ResultPanel.js - POM for the result and calculations panel
 */
export class ResultPanel {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.panel = page.locator('.result-panel');
    this.area = page.locator('#result-area');
    this.required = page.locator('#result-required');
    this.order = page.locator('#result-order');
    this.cuts = page.locator('#result-cuts');
    this.cutPlanList = page.locator('#cut-plan-list');
    this.reuseList = page.locator('#reuse-list');
  }

  async getArea() {
    return await this.area.textContent();
  }

  async getRequiredCount() {
    const text = await this.required.textContent();
    return parseInt(text.replace(/[^0-9]/g, ''), 10);
  }

  async getOrderCount() {
    const text = await this.order.textContent();
    return parseInt(text.replace(/[^0-9]/g, ''), 10);
  }

  async getCutCount() {
    const text = await this.cuts.textContent();
    return parseInt(text.replace(/[^0-9]/g, ''), 10);
  }
}
