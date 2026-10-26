// Freezer tab: portions everywhere, frozen ago, use soon, planned/spare, grouping, item panel with Undo, Have it on…, Add from recipes.
// cooking mode (amounts per step, get everything out, timers that survive leaving, big steps,
// read aloud, method switch), finished screen (fridge, freezer, verdict, note), day panel, weeks.
const { chromium, devices, goTab } = require('./pw.cjs');
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
  chilli.instructions[3] =
    'Serve with rice. ' +
    'Spoon the chilli over the rice, scatter with chopped coriander and a spoonful of soured cream, and put the grated cheddar, lime wedges, sliced jalapeños and tortilla chips on the table so everyone can help themselves. '
      .repeat(2)
      .trim();
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
  s.batches.push({
    id: 'b5',
    name: 'Chilli con carne',
    recipeId: 'r-chilli',
    portions: 4,
    dateAdded: '2026-10-10T12:00:00.000Z',
  });
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
    await goTab(page, n);
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
  const item = (name) => `[data-freezer-item="${name}"]`;
  const batch = (st, id) => (st.batches || []).find((b) => b.id === id);
  const W = 'plan-2026-10-12';
  const mealOf = (st, day) => st.mealPlans.find((p) => p.id === W).days[day].meals[0];

  await tab('Freezer');
  await shot('01-freezer');
  check(
    /11 portions · about 5 meals for 2/.test(await text('[data-freezer-total]')),
    'header total in portions',
    await text('[data-freezer-total]'),
  );
  const order = await page
    .locator('[data-freezer-item]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-freezer-item')));
  check(
    JSON.stringify(order) === JSON.stringify(['Lentil soup', 'Spaghetti bolognese', 'Chilli con carne']),
    'oldest first',
    JSON.stringify(order),
  );
  check(
    (await page.locator(`${item('Lentil soup')} [data-use-soon]`).count()) === 1 &&
      (await page.locator(`${item('Chilli con carne')} [data-use-soon]`).count()) === 0,
    'over 3 months: Use soon',
  );
  check(
    /Frozen 3 months ago · one helping|Frozen 3 months ago · enough for 1 meal for 2/.test(
      await text(`${item('Lentil soup')} [data-freezer-age]`),
    ),
    'lentil soup: frozen 3 months ago, meals',
    await text(`${item('Lentil soup')} [data-freezer-age]`),
  );
  check(
    (await text(`${item('Chilli con carne')} [data-freezer-portions]`)) === '7' &&
      /oldest of 2/.test(await text(`${item('Chilli con carne')} [data-freezer-age]`)),
    'two chilli batches grouped: 7 portions',
    await text(item('Chilli con carne')),
  );
  check(
    /enough for 3 meals for 2, and 1 over/.test(await text(`${item('Chilli con carne')} [data-freezer-age]`)),
    'portions shown as meals for 2',
  );
  check(
    /Planned tomorrow \(2\) · 0 spare/.test(await text(`${item('Spaghetti bolognese')} [data-freezer-planned]`)),
    'what the plan wants',
    await text(`${item('Spaghetti bolognese')} [data-freezer-planned]`),
  );

  // ---- The panel: portions, date, note, remove with Undo ----
  await page.locator(`${item('Lentil soup')} [data-freezer-open]`).click();
  await page.waitForTimeout(300);
  await shot('02-panel');
  await page.locator('[data-freezer-sheet] button[aria-label="One more portion"]').click();
  await page.waitForTimeout(200);
  let st = await state();
  check(batch(st, 'b2').portions === 3, '+ adds a portion');
  await page.locator('[data-sheet-note]').fill('Garage freezer, blue tub');
  await page.locator('[data-sheet-date]').click(); // blur the note
  await page.waitForTimeout(200);
  st = await state();
  check(batch(st, 'b2').note === 'Garage freezer, blue tub', 'note saved');
  await page.locator('[data-sheet-date]').fill('2026-07-20');
  await page.waitForTimeout(200);
  st = await state();
  check(String(batch(st, 'b2').dateAdded).startsWith('2026-07-20'), 'frozen date changed', batch(st, 'b2').dateAdded);
  await page.locator('[data-sheet-remove]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(!batch(st, 'b2') && (await page.locator(item('Lentil soup')).count()) === 0, 'Remove takes it out');
  check(/Removed 3 portions of Lentil soup/.test(await text('[data-toast]')), 'and says so');
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    batch(st, 'b2')?.portions === 3 && batch(st, 'b2')?.note === 'Garage freezer, blue tub',
    'Undo puts it back as it was',
  );

  // − to 0 also removes, with Undo
  await page.locator(`${item('Spaghetti bolognese')} [data-freezer-open]`).click();
  await page.waitForTimeout(300);
  await page.locator('[data-freezer-sheet] button[aria-label="One fewer portion"]').click();
  await page.locator('[data-freezer-sheet] button[aria-label="One fewer portion"]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(!batch(st, 'b3') && /all gone/.test(await text('[data-toast]')), '− to nothing removes it, with Undo');
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  check(batch(await state(), 'b3')?.portions === 1, 'Undo brings back the last portion');
  if (await page.locator('[data-freezer-sheet]').count()) await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---- Have it on… ----
  await page.locator(`${item('Chilli con carne')} [data-freezer-plan]`).click();
  await page.waitForTimeout(300);
  await shot('03-have-it-on');
  check((await page.locator('[data-have-it-on] [data-have-on]').count()) >= 5, 'lists the days from today');
  check(
    /Replace/.test(await text('[data-have-on="2026-10-12:Saturday"]')),
    'a planned day says Replace',
    await text('[data-have-on="2026-10-12:Saturday"]'),
  );
  await page.locator('[data-have-on="2026-10-12:Saturday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  const sat = mealOf(st, 'Saturday');
  check(
    sat.type === 'batch' && sat.batchId === 'b1' && sat.recipeId === 'r-chilli' && sat.servings === 2,
    'Saturday is now chilli from the freezer (oldest batch)',
    JSON.stringify(sat),
  );
  check(
    /Chilli con carne on Sat instead of Takeaway/.test(await text('[data-toast]')),
    'toast says what it replaced',
    await text('[data-toast]'),
  );
  check(
    /Planned Sat \(2\) · 5 spare/.test(await text(`${item('Chilli con carne')} [data-freezer-planned]`)),
    'card shows it is planned',
    await text(item('Chilli con carne')),
  );
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  check(mealOf(await state(), 'Saturday').type === 'takeout', 'Undo puts the takeaway back');

  // ---- Add ----
  await page.locator('[data-freezer-add]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-add-name]').fill('chil');
  await page.waitForTimeout(150);
  check((await page.locator('[data-add-match="Chilli con carne"]').count()) === 1, 'suggests your recipes');
  await page.locator('[data-add-match="Chilli con carne"]').click();
  check((await page.locator('[data-add-linked]').count()) === 1, 'linked to the recipe');
  check(/enough for 2 meals for 2/.test(await text('[data-freezer-add-sheet]')), 'default 4 portions, shown as meals');
  await page.locator('[data-freezer-add-sheet] button[aria-label="One more portion"]').click();
  await page.locator('[data-add-note]').fill('Blue tub');
  await shot('04-add');
  await page.locator('[data-add-save]').click();
  await page.waitForTimeout(300);
  st = await state();
  const added = st.batches.find((b) => b.note === 'Blue tub');
  check(
    added && added.recipeId === 'r-chilli' && added.portions === 5 && String(added.dateAdded).startsWith('2026-10-14'),
    'added 5 portions of chilli, frozen today',
    JSON.stringify(added),
  );
  check((await text(`${item('Chilli con carne')} [data-freezer-portions]`)) === '12', 'chilli now 12');
  await page.locator('[data-freezer-add]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-add-name]').fill('Fish pie');
  check(/Not one of your recipes/.test(await text('[data-freezer-add-sheet]')), 'free text is fine');
  await page.locator('[data-add-save]').click();
  await page.waitForTimeout(300);
  st = await state();
  const pie = st.batches.find((b) => b.name === 'Fish pie');
  check(pie && !pie.recipeId && pie.portions === 4, 'added Fish pie (not a recipe)', JSON.stringify(pie));
  check((await page.locator(item('Fish pie')).count()) === 1, 'shows in the list');
  await shot('05-after');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
