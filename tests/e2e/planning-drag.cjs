// Classic view: drag a recipe card onto Sunday (HTML5 drag and drop, as before).
const { chromium } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, reviewSeed());
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(1500);
  await page
    .locator('nav button', { hasText: /^Planning$/ })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  const card = page.locator('[draggable="true"]', { hasText: 'Cheese omelette' }).first();
  console.log('draggable cards:', await page.locator('[draggable="true"]').count());
  const sunday = page.locator('[data-drop-day="Sunday"]');
  await card.dragTo(sunday);
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const sun = st.mealPlans[1].days.Sunday.meals.map((m) => m.name);
  console.log(
    sun.includes('Cheese omelette') ? 'PASS classic drag onto Sunday' : 'FAIL classic drag',
    JSON.stringify(sun),
  );
  await page.screenshot({ path: process.argv[2] + '/classic-drag.png' });
  await browser.close();
})();
