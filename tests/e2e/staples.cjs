// Weekly staples, one way everywhere (src/staples.ts): the staples window starts a new staple at
// one pack, never makes two of the same, takes over a line you added by hand, and changing a staple
// doesn't bring back lines you took off the week.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  const nextId = S.mealPlans[1].id;
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
  const lines = async (name) =>
    (await state()).shoppingList.filter((i) => i.planId === nextId && i.name.toLowerCase() === name.toLowerCase());
  const staples = async () => (await state()).preferences.recurringItems;
  const openStaples = async () => {
    await page.locator('#btn-shop-view-options').click();
    await page.waitForTimeout(250);
    await page.locator('#btn-weekly-staples').click();
    await page.waitForTimeout(400);
  };
  const quick = () => page.getByPlaceholder('Quick add staple item (e.g. Milk, Eggs)');

  await tab('Shop');
  check(
    (await lines('Bread')).length === 1 && (await lines('Milk')).length === 1,
    "the staples are on next week's list",
  );

  // Take Bread off this week, and add butter by hand
  await page.locator('[data-item="Bread"] [data-open-item]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-remove-item]').click();
  await page.waitForTimeout(500);
  check((await lines('Bread')).length === 0, 'Bread taken off next week');
  await page.locator('[data-quick-add-box] input').first().fill('butter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  check(
    (await lines('Butter')).some((i) => i.isAdhoc),
    'butter added by hand',
  );

  // The staples window: butter as a staple starts at one pack and takes over the line added by hand
  await openStaples();
  await quick().fill('butter');
  await quick().press('Enter');
  await page.waitForTimeout(600);
  const butter = (await staples()).find((s) => s.name === 'Butter');
  check(
    butter && butter.amount === 250 && butter.unit === 'g',
    'Butter staple: 250 g (one pack), not 1 g',
    JSON.stringify(butter),
  );
  const butterLines = await lines('Butter');
  check(
    butterLines.length === 1 && butterLines[0].isRecurring,
    "next week: one butter line, the staple's (not two)",
    JSON.stringify(butterLines),
  );
  check((await lines('Bread')).length === 0, 'Bread is still off next week');
  await page.screenshot({ path: `${OUT}/staples-window.png` });

  // No second milk
  await quick().fill('milk');
  await quick().press('Enter');
  await page.waitForTimeout(600);
  check(
    (await staples()).filter((s) => s.name.toLowerCase() === 'milk').length === 1,
    "adding milk again doesn't make a second Milk staple",
  );
  check((await lines('Milk')).length === 1, 'and the list still has one milk line');

  // + on Bananas, then remove Bananas: Bread stays off the whole time
  await page.locator('[data-staple="Bananas"] [data-staple-more]').click();
  await page.waitForTimeout(500);
  const bananas = (await staples()).find((s) => s.name === 'Bananas');
  check(bananas && bananas.amount === 7 && bananas.unit === 'items', 'Bananas +: 7 items', JSON.stringify(bananas));
  check((await lines('Bananas'))[0]?.amount === 7, "next week's list follows: 7 bananas");
  check((await lines('Bread')).length === 0, "changing a staple doesn't bring Bread back");
  await page.locator('[data-staple="Bananas"] [data-staple-remove]').click();
  await page.waitForTimeout(500);
  check(
    !(await staples()).some((s) => s.name === 'Bananas') && (await lines('Bananas')).length === 0,
    'Bananas removed: off the staples and the list',
  );
  check((await lines('Bread')).length === 0, 'Bread is still off');
  await page
    .locator('button', { hasText: /^Done$/ })
    .last()
    .click();
  await page.waitForTimeout(400);

  // The week after (made later) gets the staples, Bread included: it was only taken off next week
  check(!(await page.locator('[data-item="Bread"]').count()), 'the list shows no Bread');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
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
