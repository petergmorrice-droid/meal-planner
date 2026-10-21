// Planning: Classic (default, drag and drop) and List (tap a day). Picker search and leftovers.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 400));
  if (!ok) failures++;
};

async function open(browser) {
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
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  page.tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return { ctx, page };
}
const row = (page, day) => page.locator(`[data-list-day="${day}"]`);
const rowText = async (page, day) => (await row(page, day).innerText()).replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const S = reviewSeed();
  const nextId = S.mealPlans[1].id;
  const { page } = await open(browser);
  await page.tab('Planning');

  // ---------- Classic is the default ----------
  check(
    (await page.locator('[aria-label="Search meals"]:visible').count()) === 1,
    'Classic by default: meal search is there',
  );
  check((await page.locator('[data-list-day]').count()) === 0, 'Classic by default: no day list');
  await page.screenshot({ path: OUT + '/l0-classic.png' });

  // ---------- Switch to List ----------
  await page.locator('button[title="View options"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/l1-view-menu.png' });
  await page.locator('#planning-view-list').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-list-day]').count()) === 7,
    'List: seven days',
    await page.locator('[data-list-day]').count(),
  );
  check(
    (await page.locator('[aria-label="Search meals"]').count()) === 0 &&
      (await page.locator('[aria-label="Filter meals by options"]').count()) === 0,
    'List: no meal search or filter (they belong to Classic)',
  );
  check((await page.evaluate(() => localStorage.getItem('planning_view'))) === 'list', 'List remembered on this phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'List: no sideways scrolling', overflow);
  check(
    /Chicken fajitas/.test(await rowText(page, 'Monday')),
    'Monday shows Chicken fajitas',
    await rowText(page, 'Monday'),
  );
  check(/Eating out/.test(await rowText(page, 'Friday')), 'Friday shows Eating out', await rowText(page, 'Friday'));
  check(
    /Batch cook: freeze 4/.test(await rowText(page, 'Wednesday')),
    'Wednesday shows its note',
    await rowText(page, 'Wednesday'),
  );
  check(/Add meal/.test(await rowText(page, 'Sunday')), 'Sunday is empty: "Add meal"', await rowText(page, 'Sunday'));
  await page.screenshot({ path: OUT + '/l2-list.png' });

  await page.reload();
  await page.waitForTimeout(1500);
  await page.tab('Planning');
  check((await page.locator('[data-list-day]').count()) === 7, 'List still chosen after reopening the app');

  // ---------- Tap Sunday: picker with search ----------
  await page.locator('[aria-label="Add a meal on Sunday"]').click();
  await page.waitForTimeout(500);
  check(
    (await page.getByText('Select Meal for Sunday').count()) === 1,
    'tapping Sunday opens "Select Meal for Sunday"',
  );
  check(
    (await page.getByText('Pick a recipe or a quick option').count()) === 1,
    'empty day: subtitle does not say "replaces"',
  );
  const earlier = await page.locator('[data-picker-earlier] button').allInnerTexts();
  check(
    earlier.length === 2 &&
      /Salmon traybake/.test(earlier[0]) &&
      /Saturday/.test(earlier[0]) &&
      /Spaghetti bolognese/.test(earlier[1]) &&
      /Thursday/.test(earlier[1]),
    'cooked earlier this week (last 3 days, nearest first): Salmon (Sat), Bolognese (Thu)',
    JSON.stringify(earlier),
  );
  const focused = await page.evaluate(
    () => document.activeElement && document.activeElement.getAttribute('aria-label'),
  );
  check(focused !== 'Search recipes', 'search box does not pop the keyboard up on its own');
  await page.screenshot({ path: OUT + '/l3-picker.png' });
  await page.locator('[aria-label="Search recipes"]').fill('kidney');
  await page.waitForTimeout(300);
  let names = await page.locator('[data-picker-recipes] button').allInnerTexts();
  check(
    names.length === 1 && /Chilli con carne/.test(names[0]),
    'search by ingredient: "kidney" finds Chilli con carne',
    JSON.stringify(names),
  );
  await page.locator('[aria-label="Search recipes"]').fill('zzz');
  await page.waitForTimeout(200);
  check((await page.getByText('No recipes match "zzz".').count()) === 1, 'no match says so');
  await page.locator('[aria-label="Clear search"]').click();
  await page.waitForTimeout(200);
  names = await page.locator('[data-picker-recipes] button').allInnerTexts();
  check(
    names.length === 6 && /^Aubergine/.test(names[0].trim()),
    'cleared: the rest of the book A-Z',
    JSON.stringify(names.map((n) => n.split('\n')[0])),
  );
  await page.locator('[aria-label="Search recipes"]').fill('omel');
  await page.screenshot({ path: OUT + '/l4-search.png' });
  await page.locator('[data-picker-recipes] button', { hasText: 'Cheese omelette' }).click();
  await page.waitForTimeout(400);
  check(
    /Added Cheese omelette to Sunday for 2/.test(await page.body()),
    'toast: Added Cheese omelette to Sunday for 2',
  );
  check(
    /Cheese omelette/.test(await rowText(page, 'Sunday')),
    'Sunday row shows Cheese omelette',
    await rowText(page, 'Sunday'),
  );
  let st = await page.state();
  check(st.mealPlans.find((p) => p.id === nextId).days.Sunday.meals[0]?.name === 'Cheese omelette', 'saved');

  // ---------- Leftovers: change Sunday to Thursday's bolognese ----------
  await page.locator('[data-list-day="Sunday"] button', { hasText: 'Cheese omelette' }).click();
  await page.waitForTimeout(500);
  check((await page.locator('[data-day-sheet="Sunday"]').count()) === 1, 'tapping a planned day opens its panel');
  await page.locator('[data-change-meal]').click();
  await page.waitForTimeout(400);
  check(
    (await page.getByText('Replaces the meal already on this day').count()) === 1,
    'day with a meal: subtitle says it replaces it',
  );
  await page.locator('[data-picker-earlier] button', { hasText: 'Spaghetti bolognese' }).click();
  await page.waitForTimeout(500);
  check((await page.locator('[data-how="leftover"]').count()) === 1, 'asks whether it is leftovers');
  await page.screenshot({ path: OUT + '/l5-leftover-q.png' });
  await page.locator('[data-how="leftover"]').click();
  await page.waitForTimeout(600);
  check(
    /Spaghetti bolognese.*Leftovers from Thu/.test(await rowText(page, 'Sunday')),
    'Sunday: Spaghetti bolognese, Leftovers from Thu',
    await rowText(page, 'Sunday'),
  );
  check(
    /Cook for 4: leftovers Sun/.test(await rowText(page, 'Thursday')),
    'Thursday: Cook for 4: leftovers Sun',
    await rowText(page, 'Thursday'),
  );
  st = await page.state();
  const sun = st.mealPlans.find((p) => p.id === nextId).days.Sunday.meals;
  check(
    sun.length === 1 && sun[0].type === 'leftover' && sun[0].recipeId === 'r-bol',
    'saved as leftovers of the bolognese',
    JSON.stringify(sun),
  );
  await page.screenshot({ path: OUT + '/l6-leftovers.png' });

  // ---------- People button ----------
  await page.locator('[data-list-day="Thursday"] button').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-day-people]').count()) === 1, 'the day panel has people');
  await page.locator('[data-day-done]').click();
  await page.waitForTimeout(300);

  // ---------- Remove ----------
  await page.locator('[data-list-day="Sunday"] button').click();
  await page.waitForTimeout(300);
  await page.locator('[data-remove-meal]').click();
  await page.waitForTimeout(600);
  check(/Add meal/.test(await rowText(page, 'Sunday')), 'bin empties Sunday', await rowText(page, 'Sunday'));
  check(
    !/Cook for/.test(await rowText(page, 'Thursday')),
    'Thursday no longer says it cooks for leftovers',
    await rowText(page, 'Thursday'),
  );

  // ---------- Quick option from the list ----------
  await page.locator('[aria-label="Add a meal on Sunday"]').click();
  await page.waitForTimeout(400);
  await page
    .locator('button', { hasText: /^Takeaway/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const save = page.locator('button:visible', { hasText: /^(Save|Add|Confirm)/ }).last();
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(500);
  }
  check(
    /Takeaway|Takeout/i.test(await rowText(page, 'Sunday')),
    'takeaway added from the list',
    await rowText(page, 'Sunday'),
  );

  // ---------- This week (finalised) in List ----------
  await page.screenshot({ path: OUT + '/l7-after.png' });

  // ---------- Back to Classic ----------
  await page.locator('button[title="View options"]').click();
  await page.waitForTimeout(300);
  await page.locator('#planning-view-classic').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[aria-label="Search meals"]:visible').count()) === 1 &&
      (await page.locator('[data-list-day]').count()) === 0,
    'back to Classic: meals to drag, week strip below',
  );
  check((await page.evaluate(() => localStorage.getItem('planning_view'))) === 'classic', 'Classic remembered');
  await page.screenshot({ path: OUT + '/l8-classic-again.png' });

  check(page.errors.length === 0, 'no page errors', page.errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
