// Playwright for the browser tests: the project's own copy if installed (npm i -D playwright),
// otherwise one named by PLAYWRIGHT_MODULE (a path to an installed playwright package).
function load() {
  const tries = ['playwright', '@playwright/test', process.env.PLAYWRIGHT_MODULE].filter(Boolean);
  for (const name of tries) {
    try {
      return require(name);
    } catch {
      /* try the next */
    }
  }
  throw new Error(
    'Playwright is needed for the browser tests: run "npm i -D playwright && npx playwright install chromium".',
  );
}
const pw = load();
/** Go to a tab by its name. Freezer and Settings are under the More tab, so that opens first. */
const MORE_ITEMS = { Freezer: 'batch', Settings: 'settings' };
async function goTab(page, name) {
  if (MORE_ITEMS[name]) {
    await page.locator('nav button', { hasText: /^More$/ }).click();
    await page.locator(`[data-more-item="${MORE_ITEMS[name]}"]`).click();
  } else {
    await page.locator('nav button', { hasText: new RegExp('^' + name + '$') }).click();
  }
}
/** Open one of Settings' own tabs: phone, alerts, household, shopping or sync. */
async function settingsTab(page, id) {
  await page.locator(`[data-settings-tab="${id}"]`).click();
  await page.waitForTimeout(200);
}
/** Planning and the Shop open on next week: step back to this week. */
async function toThisWeek(page) {
  await page.locator('[data-week-prev], [data-shop-week-prev]').first().click();
  await page.waitForTimeout(300);
}
module.exports = { chromium: pw.chromium, devices: pw.devices, goTab, settingsTab, toThisWeek };
