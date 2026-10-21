// Cook tab day cards (more info, Swap and Note on each day) and notes that stick.
// Based on flow16's seed. Cook tab: tonight card, start-by, tomorrow's prep, compact week, freezer on tick (with undo),
// cooking mode (amounts per step, get everything out, timers that survive leaving, big steps,
// read aloud, method switch), finished screen (fridge, freezer, verdict, note), day panel, weeks.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

// Wednesday 14 Oct 2026, 4:30pm in London.
const NOW = new Date('2026-10-14T16:30:00+01:00');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function plan(monIso, meals, status) {
  const mon = new Date(monIso + 'T00:00:00');
  const days = {};
  DAYS.forEach((d, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    days[d] = { date: iso(x), meals: meals[d] || [] };
  });
  return { id: `plan-${monIso}`, startDate: monIso, days, status, isCurrent: false, lastModifiedAt: 1 };
}
const meal = (id, type, recipeId, name, servings, extra = {}) => ({ id, type, recipeId, name, servings, ...extra });

function seed() {
  const s = reviewSeed();
  const chilli = s.recipes.find((r) => r.id === 'r-chilli');
  chilli.cookingMethods = ['oven_hob', 'ninja'];
  chilli.methodInstructions.ninja = [
    'Fry the onions and peppers on Sear for 5 mins.',
    'Add the mince and spices.',
    'Add tomatoes and beans and slow cook for 30 mins.',
    'Serve with rice.',
  ];
  chilli.methodPrepTime = { oven_hob: 15, ninja: 10 };
  chilli.methodCookTime = { oven_hob: 60, ninja: 35 };
  s.mealPlans = [
    plan(
      '2026-10-12',
      {
        Monday: [meal('m1', 'recipe', 'r-bol', 'Spaghetti bolognese', 2, { cooked: true })],
        Tuesday: [meal('m2', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
        Wednesday: [meal('m3', 'recipe', 'r-chilli', 'Chilli con carne', 2, { note: 'Batch cook: freeze 4' })],
        Thursday: [meal('m4', 'batch', 'r-bol', 'Batch: Spaghetti bolognese', 2, { batchId: 'b3' })],
        Friday: [meal('m5', 'leftover', 'r-chilli', 'Leftovers: Chilli con carne', 2)],
        Saturday: [meal('m6', 'takeout', undefined, 'Takeout', 2, { note: 'Pizza night' })],
        Sunday: [meal('m7', 'recipe', 'r-sausage', 'Sausage & mash', 2)],
      },
      'finalized',
    ),
    plan(
      '2026-10-19',
      {
        Monday: [meal('n1', 'recipe', 'r-fajita', 'Chicken fajitas', 2)],
        Wednesday: [meal('n3', 'recipe', 'r-chilli', 'Chilli con carne', 6, { note: 'Batch cook: freeze 4' })],
        Friday: [meal('n5', 'eating_out', undefined, 'Eating out', 2)],
      },
      'draft',
    ),
  ];
  s.batches.push({ id: 'b3', name: 'Spaghetti bolognese', recipeId: 'r-bol', portions: 2, dateAdded: '2026-09-20' });
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const text = async (sel) =>
    (
      await page
        .locator(sel)
        .first()
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  const W = 'plan-2026-10-12';
  const mealOf = (st, day, planId = W) => st.mealPlans.find((p) => p.id === planId).days[day].meals[0];

  await tab('Cook');
  // ---- Day cards show more ----
  const wed = await text('[data-cook-row="Wednesday"]');
  check(/WED/i.test(wed) && /14/.test(wed) && /75 min/.test(wed), 'Wednesday card: date and time', wed);
  check(
    /Cook for 4 \(2 for Fri\)/.test(await text('[data-cook-row="Wednesday"] [data-cook-extra]')),
    'Wednesday card: cook extra for Friday',
  );
  check(/Batch cook: freeze 4/.test(await text('[data-cook-note="Wednesday"]')), 'Wednesday card shows its note');
  check(
    (await page.locator('[data-cook-start="Wednesday"]').count()) === 1 &&
      (await page.locator('[data-cook-recipe="Wednesday"]').count()) === 1,
    'Wednesday card: Start cooking and recipe buttons',
  );
  check(
    (await page.locator('[data-cook-row="Monday"] [data-cook-actions]').count()) === 0 &&
      (await page.locator('[data-cook-tick="Monday"]').count()) === 1,
    'past days: just the tick',
  );
  const thu = await text('[data-cook-row="Thursday"]');
  check(/Tmrw/i.test(thu) && /Freezer/i.test(thu) && /2 people/.test(thu), 'Thursday card: tomorrow, freezer', thu);
  const heights = await page
    .locator('[data-cook-row]')
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((e) => [e.getAttribute('data-cook-row'), Math.round(e.getBoundingClientRect().height)]),
      ),
    );
  // Monday is cooked, so it also has the small "Rate it" button.
  check(heights.Thursday <= 130 && heights.Monday <= 100, 'cards are compact', JSON.stringify(heights));
  check((await page.locator('[data-cook-move]').count()) >= 5, 'every planned day has Swap');
  await page.locator('[data-cook-row="Sunday"]').scrollIntoViewIfNeeded();
  await shot('01-day-cards');

  // ---- Add a note from the card ----
  await page.locator('[data-cook-add-note="Sunday"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-note-input]').fill('Use the good sausages');
  await page.locator('[data-note-save]').click();
  await page.waitForTimeout(400);
  check(
    /Use the good sausages/.test(await text('[data-cook-note="Sunday"]')),
    'note shows on the card',
    await text('[data-cook-row="Sunday"]'),
  );
  check(mealOf(await state(), 'Sunday').note === 'Use the good sausages', 'note saved');
  await shot('02-note');
  await page.locator('[data-cook-note="Sunday"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-note-remove]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-cook-note="Sunday"]').count()) === 0 && !mealOf(await state(), 'Sunday').note,
    'note removed',
  );

  // ---- Note added in the day panel shows on the card ----
  await page.locator('[data-cook-row="Sunday"] [data-cook-open]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-day-sheet] textarea').fill('Gravy from the jar');
  await page.locator('[data-day-done]').click();
  await page.waitForTimeout(400);
  check(/Gravy from the jar/.test(await text('[data-cook-note="Sunday"]')), 'panel note shows on the card');

  // ---- Note then tick (in the panel): the note is kept ----
  await page.locator('[data-cook-row="Sunday"] [data-cook-open]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-day-sheet] textarea').fill('Gravy from the jar, extra onions');
  await page.locator('[data-day-tick]').click();
  await page.waitForTimeout(400);
  let st = await state();
  check(
    mealOf(st, 'Sunday').cooked === true && mealOf(st, 'Sunday').note === 'Gravy from the jar, extra onions',
    'note kept when ticking from the panel',
    JSON.stringify(mealOf(st, 'Sunday')),
  );
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);

  // ---- Swap from the card ----
  await page.locator('[data-cook-move="Thursday"]').click();
  await page.waitForTimeout(300);
  check(/Swap/.test(await text('[data-move-sheet-to="Saturday"]')), 'move sheet lists days with Swap');
  await shot('03-swap');
  await page.locator('[data-move-sheet-to="Saturday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    mealOf(st, 'Saturday').type === 'batch' && mealOf(st, 'Thursday').type === 'takeout',
    'Thursday and Saturday swapped',
    JSON.stringify([mealOf(st, 'Thursday').name, mealOf(st, 'Saturday').name]),
  );
  check(/Swapped Thursday and Saturday/.test(await text('[data-toast]')), 'toast says swapped');
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(mealOf(st, 'Thursday').type === 'batch' && mealOf(st, 'Saturday').type === 'takeout', 'undo the swap');

  // ---- Note then move (in the panel): the note goes with it ----
  await page.locator('[data-cook-row="Sunday"] [data-cook-open]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-day-sheet] textarea').fill('Moved with the meal');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-day-sheet] [data-move-to="Saturday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    mealOf(st, 'Saturday').name === 'Sausage & mash' && mealOf(st, 'Saturday').note === 'Moved with the meal',
    'note kept when moving from the panel',
    JSON.stringify(mealOf(st, 'Saturday')),
  );
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);

  // ---- Cook and recipe buttons on a card ----
  await page.locator('[data-cook-recipe="Sunday"]').click();
  await page.waitForTimeout(500);
  check((await page.locator('[data-favourite-toggle]').count()) === 1, 'recipe button opens the recipe');
  await page.locator('button', { hasText: 'Start cooking' }).last().click();
  await page.waitForTimeout(400);
  check(
    (await text('[data-cook-title]')) === 'Sausage & mash',
    "the recipe's Start cooking opens cooking mode for that day",
  );
  check(/Sunday/.test(await text('[data-cook-times]')), 'cooking mode knows the day', await text('[data-cook-times]'));
  await page.locator('[data-cook-close]').click();
  await page.waitForTimeout(300);

  // ---- Next week cards: free days say Plan a meal; swap to a free day ----
  await page.locator('[data-cook-week-next]').click();
  await page.waitForTimeout(300);
  check(/Nothing planned/.test(await text('[data-cook-row="Tuesday"]')), 'free day says nothing planned');
  await page.locator('[data-cook-move="Monday"]').click();
  await page.waitForTimeout(300);
  check(/Move here/.test(await text('[data-move-sheet-to="Tuesday"]')), 'free day offers Move here');
  await page.locator('[data-move-sheet-to="Tuesday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    mealOf(st, 'Tuesday', 'plan-2026-10-19')?.name === 'Chicken fajitas' && !mealOf(st, 'Monday', 'plan-2026-10-19'),
    'moved to a free day',
  );
  await shot('04-next-week');

  // ---- Planning: a note typed in the day panel survives Move ----
  await tab('Planning');
  await page
    .locator('[data-week-prev]')
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
  const day = page.locator('[data-week-day="Sunday"], [data-list-day="Sunday"]').first();
  await day.click();
  await page.waitForTimeout(400);
  await page.locator('[data-day-sheet] textarea').fill('Planning note');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-day-sheet] [data-move-to="Saturday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    mealOf(st, 'Saturday').note === 'Planning note',
    'Planning: note kept when moving',
    JSON.stringify(mealOf(st, 'Saturday')),
  );

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
