// A list sent before a fix to the shopping sums catches up: the Shop says which lines are out of
// date and "Update list" puts them right, keeping your ticks. The case found on a real phone:
// BBC Good Food's veggie shepherd's pie, whose "410g can green lentils" came out as "205 g canses"
// (a product made with Shop as -> new, unit "g can") and whose chopped tomatoes said "check amount".
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed, TEST_NOW } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

function seed() {
  const s = reviewSeed();
  s.recipes.push({
    id: 'r-pie',
    name: "Veggie shepherd's pie with sweet potato mash",
    description: '',
    servings: 4,
    prepTime: 10,
    cookTime: 60,
    ingredients: [
      { id: 'p1', name: 'chopped tomatoes', amount: 400, unit: 'g can', category: 'Pantry' },
      { id: 'p2', name: 'green lentils', amount: 410, unit: 'g can', category: 'Pantry', groceryId: 'gdb-custom-gl' },
      { id: 'p3', name: 'butter', amount: 25, unit: 'g', category: 'Dairy' },
    ],
    instructions: ['Make the pie.'],
    methodInstructions: { oven_hob: ['Make the pie.'] },
    cookingMethods: ['oven_hob'],
    tags: [],
    isVegetarian: true,
    isVegan: false,
  });
  // This week: just the pie, for 2, not sent yet.
  const week = s.mealPlans[0];
  for (const d of Object.keys(week.days)) week.days[d].meals = [];
  week.days.Thursday.meals = [{ id: 'pie', type: 'recipe', recipeId: 'r-pie', name: 'Veggie shepherd', servings: 2 }];
  week.status = 'draft';
  s.preferences.recurringItems = [];
  // What "Shop as -> new product" made before it learned to say "can".
  s.groceryOverrides = {
    'gdb-custom-gl': {
      id: 'gdb-custom-gl',
      name: 'Green Lentils',
      category: 'Pantry, Oils & Spices',
      unit: 'g can',
      increment: 1,
      cost: 0,
      aliases: ['green lentils', 'Green Lentils'],
    },
  };
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  await page.clock.install({ time: TEST_NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
  const qty = async (name) =>
    (
      await page
        .locator(`[data-item="${name}"] [data-item-qty]`)
        .first()
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  const row = async (name) =>
    (
      await page
        .locator(`[data-item="${name}"]`)
        .first()
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
  const notice = () => page.locator('[data-shop-out-of-date]');

  // Send the week with today's sums: right first time, nothing out of date.
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await tab('Planning');
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(400);
  await page
    .locator('button', { hasText: /^Send to shopping list$/ })
    .last()
    .click();
  await page.waitForTimeout(800);
  await tab('Shop');
  check(/^1 can/.test(await qty('Green Lentils')), 'sent now: Green Lentils is 1 can', await qty('Green Lentils'));
  check(
    /^1 can/.test(await qty('Chopped Tomatoes')) && !/check amount/.test(await row('Chopped Tomatoes')),
    'and Chopped Tomatoes is 1 can, with nothing to check',
    await row('Chopped Tomatoes'),
  );
  check((await notice().count()) === 0, 'an up-to-date list has no "out of date" note');

  // The same list as the old sums made it; Butter already ticked.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mealPlannerAppStateCache'));
    s.shoppingList = s.shoppingList.map((i) =>
      i.name === 'Green Lentils'
        ? { ...i, amount: 205, unit: 'g canses' }
        : i.name === 'Chopped Tomatoes'
          ? { ...i, needsCheck: true, quantityNote: "recipe says 200 g cans (Veggie shepherd's pie)" }
          : i.name === 'Butter'
            ? { ...i, checked: true }
            : i,
    );
    localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await tab('Shop');
  check(/205 g canses/.test(await qty('Green Lentils')), 'the old list: "205 g canses"', await qty('Green Lentils'));
  const said = (
    await notice()
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  check(
    /Some amounts are out of date/.test(said) && /Chopped Tomatoes and Green Lentils/.test(said),
    'the Shop says which lines are out of date',
    said,
  );
  await page.screenshot({ path: `${OUT}/out-of-date.png` });

  await page.locator('[data-shop-update-list]').click();
  await page.waitForTimeout(800);
  check(/^1 can/.test(await qty('Green Lentils')), 'Update list: Green Lentils is 1 can', await qty('Green Lentils'));
  check(
    !/check amount/.test(await row('Chopped Tomatoes')),
    'and "check amount" has gone from the tomatoes',
    await row('Chopped Tomatoes'),
  );
  check((await notice().count()) === 0, 'and the note has gone');
  const butter = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('mealPlannerAppStateCache')).shoppingList.find((i) => i.name === 'Butter')
        ?.checked,
  );
  check(butter === true, 'Butter is still ticked');
  await page.screenshot({ path: `${OUT}/updated.png` });

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
