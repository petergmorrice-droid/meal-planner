// Every change is worked out from the latest data: two taps before the screen has redrawn both
// count. (A window left open while the other phone changes something: latest-edits.cjs.)
const { chromium } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};
const NOW = new Date('2026-10-18T12:00:00+01:00');

(async () => {
  const browser = await chromium.launch();

  {
    const S = reviewSeed();
    const nextId = S.mealPlans[1].id;
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 860 },
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    await ctx.clock.install({ time: NOW });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((s) => {
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
        localStorage.setItem('seeded', '1');
      }
    }, S);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForTimeout(1500);
    const tab = async (n) => {
      await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
      await page.waitForTimeout(700);
    };
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
    // Two taps in one go: the second comes before the screen has redrawn after the first.
    const twice = (sel) =>
      page.evaluate((s) => {
        const b = document.querySelector(s);
        b.click();
        b.click();
      }, sel);

    await tab('Shop');
    const milk = async () => (await state()).shoppingList.find((i) => i.planId === nextId && i.name === 'Milk');
    const m0 = (await milk()).amount;
    await page.locator('[data-item="Milk"] [data-open-item]').click();
    await page.waitForTimeout(400);
    await twice('[data-item-sheet] [data-part] [data-more]');
    await page.waitForTimeout(500);
    check((await milk()).amount === m0 + 2, 'Shop: + + on milk adds two', `${m0} -> ${(await milk()).amount}`);
    await page.locator('[data-item-done]').click();
    await page.waitForTimeout(300);

    await page.locator('#btn-shop-view-options').click();
    await page.waitForTimeout(250);
    await page.locator('#btn-weekly-staples').click();
    await page.waitForTimeout(400);
    const bananas = async () => (await state()).preferences.recurringItems.find((s) => s.name === 'Bananas').amount;
    const b0 = await bananas();
    await twice('[data-staple="Bananas"] [data-staple-more]');
    await page.waitForTimeout(500);
    check((await bananas()) === b0 + 2, 'Staples: + + on bananas adds two', `${b0} -> ${await bananas()}`);
    await page
      .locator('button', { hasText: /^Done$/ })
      .last()
      .click();
    await page.waitForTimeout(300);

    await tab('Freezer');
    const soup = async () => (await state()).batches.find((b) => b.name === 'Lentil soup').portions;
    const s0 = await soup();
    await page.locator('[data-freezer-item="Lentil soup"] [data-freezer-open]').click();
    await page.waitForTimeout(300);
    await twice('[data-freezer-sheet] button[aria-label="One more portion"]');
    await page.waitForTimeout(500);
    check((await soup()) === s0 + 2, 'Freezer: + + on lentil soup adds two portions', `${s0} -> ${await soup()}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await tab('Settings');
    const people = async () => (await state()).preferences.defaultServings || 2;
    const p0 = await people();
    await twice('[data-setting-people] button[aria-label="One more person"]');
    await page.waitForTimeout(500);
    check((await people()) === p0 + 2, 'Settings: + + on people adds two', `${p0} -> ${await people()}`);

    check(errors.length === 0, 'no page errors (quick taps)', errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  if (failures) {
    console.log(`\n${failures} FAILED`);
    process.exit(1);
  }
  console.log('\nall passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
