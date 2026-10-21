// Lines added by hand before they were saved as products ("1" + "1 pack") add up to "2 packs" on opening the Shop.
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
  await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  const plan = S.mealPlans[0].id;
  S.groceryDatabase = [
    {
      id: 'gdb-custom-belvita',
      name: 'Belvita Breakfast Bar',
      unit: 'pack',
      increment: 1,
      category: 'Pantry, Oils & Spices',
      lastModifiedAt: 1,
    },
  ];
  const line = (id, unit) => ({
    id,
    name: 'Belvita Breakfast Bar',
    amount: 1,
    unit,
    category: 'Pantry, Oils & Spices',
    groceryId: 'gdb-custom-belvita',
    checked: false,
    isAdhoc: true,
    isBatch: false,
    planId: plan,
    weekLabel: 'Week of This Week',
  });
  S.shoppingList = [line('old-bare', ''), line('new-pack', 'pack')];
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
  await page.locator('nav button', { hasText: /^Shop$/ }).click();
  await page.waitForTimeout(900);
  const qty = (await page.locator('[data-item="Belvita Breakfast Bar"] [data-item-qty]').first().innerText()).trim();
  check(qty === '2 packs', 'a "1" from before it was a product and a "1 pack" show as 2 packs', qty);
  await page.screenshot({ path: `${OUT}/belvita.png` });
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const lines = st.shoppingList.filter((i) => i.name === 'Belvita Breakfast Bar');
  check(
    lines.every((i) => /^packs?$/.test(i.unit)),
    'the old line is now in packs (both phones get this)',
    JSON.stringify(lines.map((i) => [i.amount, i.unit])),
  );
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
