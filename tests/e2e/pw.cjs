// Playwright for the browser tests: the project's own copy if installed (npm i -D playwright),
// otherwise one named by PLAYWRIGHT_MODULE (a path to an installed playwright package).
function load() {
  const tries = ['playwright', '@playwright/test', process.env.PLAYWRIGHT_MODULE].filter(Boolean);
  for (const name of tries) {
    try { return require(name); } catch { /* try the next */ }
  }
  throw new Error('Playwright is needed for the browser tests: run "npm i -D playwright && npx playwright install chromium".');
}
const pw = load();
module.exports = { chromium: pw.chromium, devices: pw.devices };
