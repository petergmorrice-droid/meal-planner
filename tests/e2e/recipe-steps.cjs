// Editing a recipe's method: move steps up and down, put a new step in between, and the Pasta /
// Curry diet tags.
const { chromium, devices, goTab } = require('./pw.cjs');
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
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, reviewSeed());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  await goTab(page, 'Cookbook');
  await page.waitForTimeout(700);
  const bol = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('mealPlannerAppStateCache')).recipes.find((r) => r.id === 'r-bol'),
    );
  const stepTexts = () => page.locator('[data-recipe-method] textarea').evaluateAll((els) => els.map((e) => e.value));

  await page.locator('[data-recipe-card="Spaghetti bolognese"]').click();
  await page.waitForTimeout(500);
  await page.locator('[aria-label="Edit recipe"]').click();
  await page.waitForTimeout(400);

  // Diet tags
  check(
    (await page.locator('[data-edit-tag="pasta"]').count()) === 1 &&
      (await page.locator('[data-edit-tag="curry"]').count()) === 1,
    'Pasta and Curry chips under Diet',
  );
  await page.locator('[data-edit-tag="pasta"]').click();
  check((await page.locator('[data-edit-tag="pasta"]').getAttribute('aria-pressed')) === 'true', 'Pasta switched on');

  // Move and insert
  const before = await stepTexts();
  check(before.length === 4, '4 steps to start with', before.length);
  check(await page.locator('[aria-label="Move step 1 up"]').isDisabled(), 'the first step cannot go up');
  check(await page.locator('[aria-label="Move step 4 down"]').isDisabled(), 'the last step cannot go down');
  await page.locator('[aria-label="Move step 2 up"]').click();
  await page.waitForTimeout(200);
  let now = await stepTexts();
  check(now[0] === before[1] && now[1] === before[0], 'step 2 moved up to step 1', JSON.stringify(now));
  check(
    (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Move step 1 up' ||
      (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Move step 1 down',
    'focus follows the moved step',
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
  );
  await page.locator('[aria-label="Move step 3 down"]').click();
  await page.waitForTimeout(200);
  now = await stepTexts();
  check(now[3] === before[2] && now[2] === before[3], 'step 3 moved down to step 4', JSON.stringify(now));

  check(
    (await page.locator('[aria-label="Add a step after step 4"]').count()) === 0,
    'no in-between button after the last step (Add step does that)',
  );
  await page.locator('[aria-label="Add a step after step 1"]').click();
  await page.waitForTimeout(250);
  check(
    (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Step 2',
    'the new step 2 is ready to type in',
  );
  await page.keyboard.type('Season well.');
  now = await stepTexts();
  check(
    now.length === 5 && now[1] === 'Season well.' && now[2] === before[0],
    'new step put in as step 2',
    JSON.stringify(now),
  );
  await page.locator('[data-step-row="2"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + '/steps-edit.png' });

  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.waitForTimeout(800);
  const saved = await bol();
  check(
    JSON.stringify(saved.methodInstructions.oven_hob) ===
      JSON.stringify([before[1], 'Season well.', before[0], before[3], before[2]]),
    'saved in the new order',
    JSON.stringify(saved.methodInstructions.oven_hob),
  );
  check((saved.tags || []).includes('Pasta'), 'Pasta saved as a tag', JSON.stringify(saved.tags));
  check(
    /Pasta/.test(await page.locator('[data-recipe-card="Spaghetti bolognese"]').first().innerText()),
    'Pasta on the card',
  );
  check(errors.length === 0, 'no page errors', errors.join('; '));

  await browser.close();
  process.exit(failures ? 1 : 0);
})();
