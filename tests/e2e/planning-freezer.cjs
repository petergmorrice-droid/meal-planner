// Planning: adding a recipe that's in the freezer asks "leftovers / from the freezer / cook it fresh".
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 400));
  if (!ok) failures++;
};

async function open(browser, opts) {
  const ctx = await browser.newContext({ ...opts, locale: 'en-GB', timezoneId: 'Europe/London' });
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
  await page
    .locator('nav button', { hasText: /^Planning$/ })
    .first()
    .click();
  await page.waitForTimeout(700);
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  return { ctx, page };
}
const howText = async (page) => (await page.locator('[data-how-question]').innerText()).replace(/\s+/g, ' ');

(async () => {
  const browser = await chromium.launch();
  const S = reviewSeed();
  const nextId = S.mealPlans[1].id;
  const day = async (page, d) => (await page.state()).mealPlans.find((p) => p.id === nextId).days[d].meals;

  // ---------- Classic (computer): drag ----------
  const { page } = await open(browser, { viewport: { width: 1280, height: 860 } });
  const drag = async (name, d) => {
    await page
      .locator('[draggable="true"]', { hasText: name })
      .first()
      .dragTo(page.locator(`[data-drop-day="${d}"]`));
    await page.waitForTimeout(600);
  };

  // Sunday: Wednesday cooks chilli and there are 3 portions frozen -> all three choices
  await drag('Chilli con carne', 'Sunday');
  check((await page.locator('[data-how-question]').count()) === 1, 'chilli onto Sunday asks how you are having it');
  let t = await howText(page);
  check(/Chilli con carne/.test(t) && /How are you having it on Sunday\?/.test(t), 'names the recipe and the day', t);
  check(/Leftovers from Wednesday/.test(t), 'offers leftovers from Wednesday', t);
  check(/From the freezer.*3 portions in the freezer/.test(t), 'offers the freezer, with 3 portions', t);
  check(/Cook it fresh/.test(t) && /Cancel/.test(t), 'offers cook it fresh and cancel', t);
  check(
    JSON.stringify(
      await page.locator('[data-how]').evaluateAll((els) => els.map((e) => e.getAttribute('data-how'))),
    ) === '["leftover","freezer","fresh"]',
    'in that order',
  );
  await page.screenshot({ path: OUT + '/fz1-three-choices.png' });
  await page.locator('[data-how="freezer"]').click();
  await page.waitForTimeout(600);
  let sun = await day(page, 'Sunday');
  check(
    sun.length === 1 &&
      sun[0].type === 'batch' &&
      sun[0].batchId === 'b1' &&
      sun[0].recipeId === 'r-chilli' &&
      sun[0].name === 'Batch: Chilli con carne',
    'Sunday saved as chilli from the freezer (batch b1)',
    JSON.stringify(sun),
  );
  const sunCard = (await page.locator('[data-week-day="Sunday"]').innerText()).replace(/\s+/g, ' ');
  check(
    /Chilli con carne/.test(sunCard) && /Freezer/i.test(sunCard),
    'Sunday card: Chilli con carne, Freezer',
    sunCard,
  );
  const toastText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(
    /Added Chilli con carne from the freezer to Sunday/.test(toastText),
    'toast: Added Chilli con carne from the freezer to Sunday',
    (toastText.match(/Added[^.]{0,60}/) || ['none'])[0],
  );
  check(
    !/Cook for/.test((await page.locator('[data-week-day="Wednesday"]').innerText()).replace(/\s+/g, ' ')),
    'Wednesday does not cook extra for it',
  );
  await page.screenshot({ path: OUT + '/fz2-freezer-sunday.png' });

  // Monday: nothing earlier in the week -> freezer or fresh only. Choose fresh.
  await drag('Chilli con carne', 'Monday');
  t = await howText(page);
  check(
    !/Leftovers from/.test(t) && /From the freezer/.test(t) && /Cook it fresh/.test(t),
    'Monday: no leftovers choice, just freezer or fresh',
    t,
  );
  await page.locator('[data-how="fresh"]').click();
  await page.waitForTimeout(600);
  let mon = await day(page, 'Monday');
  check(
    mon.length === 1 && mon[0].type === 'recipe' && mon[0].recipeId === 'r-chilli',
    'Monday saved as a fresh cook of the chilli (replaced the fajitas)',
    JSON.stringify(mon),
  );

  // Cancel leaves the day alone
  await drag('Chilli con carne', 'Saturday');
  await page.locator('[data-how-question] button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(400);
  const sat = await day(page, 'Saturday');
  check(
    sat.length === 1 && sat[0].recipeId === 'r-salmon' && (await page.locator('[data-how-question]').count()) === 0,
    'Cancel: Saturday is still salmon',
    JSON.stringify(sat),
  );

  // A recipe with nothing frozen and no earlier cook: no question
  await drag('Cheese omelette', 'Tuesday');
  check((await page.locator('[data-how-question]').count()) === 0, 'omelette (nothing frozen) goes straight in');
  check((await day(page, 'Tuesday'))[0]?.name === 'Cheese omelette', 'Tuesday is the omelette');
  check(page.errors.length === 0, 'no page errors (computer)', page.errors.join(' | '));

  // ---------- List (phone): tap a day, pick ----------
  const p2 = (await open(browser, devices['iPhone 13'])).page;
  await p2.locator('button[title="View options"]').click();
  await p2.waitForTimeout(300);
  await p2.locator('#planning-view-list').click();
  await p2.waitForTimeout(400);
  await p2.locator('[aria-label="Add a meal on Sunday"]').click();
  await p2.waitForTimeout(500);
  await p2.locator('[aria-label="Search recipes"]').fill('chilli');
  await p2.waitForTimeout(300);
  await p2.locator('[data-picker-recipes] button', { hasText: 'Chilli con carne' }).click();
  await p2.waitForTimeout(500);
  check((await p2.locator('[data-how]').count()) === 3, 'phone: the same three choices from the picker');
  const box = await p2.locator('[data-how-question]').boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= 390, 'phone: question fits the screen', JSON.stringify(box));
  await p2.screenshot({ path: OUT + '/fz3-phone-question.png' });
  await p2.locator('[data-how="leftover"]').click();
  await p2.waitForTimeout(600);
  sun = await day(p2, 'Sunday');
  check(
    sun[0]?.type === 'leftover' && sun[0]?.note === 'Reheat from Wednesday',
    'phone: leftovers from Wednesday',
    JSON.stringify(sun),
  );

  // The freezer section of the picker adds straight from the freezer (no question), now linked to the recipe
  await p2.locator('[data-list-day="Sunday"] button').first().click();
  await p2.waitForTimeout(400);
  await p2.locator('[data-change-meal]').click();
  await p2.waitForTimeout(400);
  const fz = p2.locator('button', { hasText: /Chilli con carne/ }).filter({ has: p2.locator('text=/portion|meal/i') });
  if (await fz.count()) {
    await fz.last().click();
    await p2.waitForTimeout(600);
  }
  sun = await day(p2, 'Sunday');
  check(
    (await p2.locator('[data-how-question]').count()) === 0 &&
      sun[0]?.type === 'batch' &&
      sun[0]?.recipeId === 'r-chilli',
    'picker freezer section: straight in, linked to the recipe',
    JSON.stringify(sun),
  );
  await p2.screenshot({ path: OUT + '/fz4-phone-after.png' });
  check(p2.errors.length === 0, 'no page errors (phone)', p2.errors.join(' | '));

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
