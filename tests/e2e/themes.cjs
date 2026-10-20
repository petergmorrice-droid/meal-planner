// Colour themes: Settings → This phone → Colour theme. Each phone keeps its own; Tab colours follow the tab.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500)); if (!ok) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('seeded', '1'); } }, S);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  const tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(600); };
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const look = () => page.evaluate(() => {
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : '');
    return { theme: document.documentElement.dataset.theme, tab: document.documentElement.dataset.tab, page: bg(document.querySelector('main .app-page')), bar: bg(document.querySelector('main .app-bar')), nav: bg(document.querySelector('nav')), card: bg(document.querySelector('[data-settings-phone] > div')) };
  });
  // Clean is the default and looks as before
  await tab('Shop');
  let l = await look();
  check(l.theme === 'clean' && l.page === 'rgb(250, 250, 250)' && l.bar === 'rgb(255, 255, 255)', 'default: Clean (white bar, light grey page, as before)', JSON.stringify(l));
  await shot('t0-clean-shop');
  // Choose Tab colours
  await tab('Settings');
  check(await page.locator('[data-theme-choice]').count() === 4, 'Settings → This phone: four colour themes');
  await page.locator('[data-theme-choice="tabs"]').click(); await page.waitForTimeout(300);
  check(await page.locator('[data-theme-choice="tabs"][aria-pressed="true"]').count() === 1, 'Tab colours chosen');
  await shot('t1-settings-chooser');
  l = await look();
  check(l.theme === 'tabs' && l.bar === 'rgb(228, 228, 231)', 'Settings in grey', JSON.stringify(l));
  const expect = { Shop: 'rgb(219, 234, 254)', Planning: 'rgb(209, 250, 229)', Cook: 'rgb(255, 237, 213)', Cookbook: 'rgb(254, 243, 199)', Freezer: 'rgb(207, 250, 254)' };
  for (const [name, colour] of Object.entries(expect)) {
    await tab(name); l = await look();
    check(l.bar === colour, `Tab colours: ${name}'s bar in its colour`, JSON.stringify(l));
    await shot(`t2-tabs-${name.toLowerCase()}`);
  }
  // Warm kitchen: cream cards, oat page, terracotta-tint bars; remembered after reopening
  await tab('Settings');
  await page.locator('[data-theme-choice="warm"]').click(); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1500);
  l = await look();
  check(l.theme === 'warm', 'Warm kitchen remembered after reopening (this phone)', JSON.stringify(l));
  await tab('Shop'); l = await look();
  check(l.page === 'rgb(244, 237, 226)' && l.bar === 'rgb(246, 220, 203)', 'Warm kitchen: oat page, terracotta-tint bar', JSON.stringify(l));
  const rowBg = await page.locator('[data-group]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check(rowBg === 'rgb(255, 253, 248)', 'cards are cream, not white', rowBg);
  const tick = await page.locator('#btn-go-shopping, [data-go-shopping]').first().evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '');
  check(/rgb\(0, 1[0-9]{2}, /.test(tick) || /oklch/.test(tick) || tick === 'rgb(5, 150, 105)', 'Go shopping stays green', tick);
  await shot('t3-warm-shop');
  await tab('Planning'); await shot('t3-warm-planning');
  // Sage garden
  await tab('Settings');
  await page.locator('[data-theme-choice="sage"]').click(); await page.waitForTimeout(300);
  await tab('Shop'); l = await look();
  check(l.theme === 'sage' && l.page === 'rgb(237, 243, 234)' && l.bar === 'rgb(217, 232, 210)', 'Sage garden: soft green page and bar', JSON.stringify(l));
  await shot('t4-sage-shop');
  await page.locator('#btn-go-shopping').click(); await page.waitForTimeout(700);
  await shot('t4-sage-shopping-mode');
  await page.locator('[aria-label="Leave shopping mode"]').click(); await page.waitForTimeout(500);
  // Back to Clean
  await page.reload(); await page.waitForTimeout(1500);
  await tab('Settings');
  await page.locator('[data-theme-choice="clean"]').click(); await page.waitForTimeout(300);
  l = await look();
  check(l.theme === 'clean' && l.bar === 'rgb(255, 255, 255)', 'back to Clean', JSON.stringify(l));
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
