// Safety: one tab going wrong doesn't take the app down; a full phone says so; old shopping weeks are
// cleared (and the old duplicate saved copies go).
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
  const S = reviewSeed();
  const line = (id, planId, extra = {}) => ({
    id,
    name: 'Kitchen roll',
    amount: 1,
    unit: 'pack',
    category: 'Household & Other',
    checked: true,
    isAdhoc: true,
    isBatch: false,
    planId,
    weekLabel: '',
    lastModifiedAt: 1,
    ...extra,
  });
  S.shoppingList = [
    ...(S.shoppingList || []),
    line('old-1', 'plan-2026-05-04'),
    line('old-2', 'plan-2026-06-01'),
    line('recent', 'plan-2026-09-28'),
  ];

  const open = async ({ breakTab = null, fullAfterLoad = false } = {}) => {
    const ctx = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      serviceWorkers: 'block',
    });
    await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(
      ({ s, breakTab, fullAfterLoad }) => {
        if (!localStorage.getItem('seeded')) {
          localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
          // copies the first version of the app also kept
          localStorage.setItem('mealPlannerMealPlans', JSON.stringify(s.mealPlans));
          localStorage.setItem('mealPlannerState', JSON.stringify({ groceryDatabase: [], groceryOverrides: {} }));
          localStorage.setItem('seeded', '1');
        }
        if (breakTab) localStorage.setItem('test_break_tab', breakTab);
        if (fullAfterLoad) {
          const real = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (window.__full && k === 'mealPlannerAppStateCache')
              throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            return real.call(this, k, v);
          };
        }
      },
      { s: S, breakTab, fullAfterLoad },
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForTimeout(1500);
    return { ctx, page, errors };
  };
  const tab = (page, n) =>
    page
      .locator('nav button', { hasText: new RegExp('^' + n + '$') })
      .click()
      .then(() => page.waitForTimeout(600));
  const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));

  // ---------- Old shopping weeks cleared; old duplicate copies gone ----------
  {
    const { ctx, page, errors } = await open();
    await page.waitForTimeout(1500);
    const st = await state(page);
    const ids = st.shoppingList.map((i) => i.id);
    check(
      !ids.includes('old-1') && !ids.includes('old-2') && ids.includes('recent'),
      'lines from more than 10 weeks ago are cleared; recent ones kept',
      JSON.stringify(ids.filter((i) => /old|recent/.test(i))),
    );
    check(
      !!st.syncMeta?.tombstones?.['shoppingList:old-1'],
      'cleared the normal way, so the other phone clears them too',
    );
    const legacy = await page.evaluate(() => [
      localStorage.getItem('mealPlannerMealPlans'),
      localStorage.getItem('mealPlannerState'),
    ]);
    check(legacy[0] === null && legacy[1] === null, 'the two old duplicate copies are gone (one copy saved now)');
    await tab(page, 'Shop');
    check((await page.locator('[data-group]').count()) > 0, 'the Shop still knows its products (aisles shown)');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
    await ctx.close();
  }

  // ---------- One tab going wrong ----------
  {
    const { ctx, page } = await open({ breakTab: 'planning' });
    await tab(page, 'Planning');
    check(
      (await page.locator('[data-tab-error="Planning"]').count()) === 1 &&
        /Something went wrong on Planning/.test(await page.locator('[data-tab-error]').innerText()),
      'Planning failing shows a short message, not a blank app',
    );
    await page.screenshot({ path: `${OUT}/tab-error.png` });
    await tab(page, 'Shop');
    check(
      (await page.locator('[data-tab-error]').count()) === 0 && (await page.locator('[data-group]').count()) > 0,
      'the other tabs still work',
    );
    await tab(page, 'Planning');
    await page.evaluate(() => localStorage.removeItem('test_break_tab'));
    await page.locator('[data-tab-error-retry]').click();
    await page.waitForTimeout(600);
    check(
      (await page.locator('[data-tab-error]').count()) === 0 && (await page.locator('[data-week-next]').count()) >= 1,
      '"Try again" brings Planning back',
    );
    const err = await page.evaluate(() => localStorage.getItem('last_app_error'));
    check(/Planning/.test(err || ''), 'what went wrong is noted for looking into later');
    await ctx.close();
  }

  // ---------- Phone storage full ----------
  {
    const { ctx, page } = await open({ fullAfterLoad: true });
    await tab(page, 'Shop');
    check((await page.locator('[data-save-problem]').count()) === 0, 'no warning while saving works');
    await page.evaluate(() => {
      window.__full = true;
    });
    await page.locator('[data-quick-add]').fill('2 pints milk');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const banner = page.locator('[data-save-problem]');
    check(
      (await banner.count()) === 1 &&
        /couldn't save your latest changes/.test(await banner.innerText()) &&
        (await banner.locator('[data-save-problem-backup]').count()) === 1,
      'storage full: a clear warning with a Backup button',
    );
    await page.screenshot({ path: `${OUT}/save-problem.png` });
    await page.evaluate(() => {
      window.__full = false;
    });
    await page.locator('[data-quick-add]').fill('1 pint milk');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    check((await banner.count()) === 0, 'the warning goes once saving works again');
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
