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
module.exports = { chromium: pw.chromium, devices: pw.devices, goTab };
