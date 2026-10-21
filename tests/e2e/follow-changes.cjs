// Things the app does by itself when something arrives or changes: old shopping lines are cleared
// soon after opening, a recipe shared to the app opens "Add a recipe" once, cooking mode opens on the
// method you prefer and keeps the one you pick, and (two phones) a recipe edit in progress survives a
// sync and only what was edited is saved.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed, iso, mondayOf, TEST_NOW } = require('./review-seed.cjs');
const { createMockGist } = require('./mockgist.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const NOW = new Date('2026-10-14T16:30:00+01:00');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};
const meal = (id, type, recipeId, name, servings, extra = {}) => ({ id, type, recipeId, name, servings, ...extra });

function seed() {
  const s = reviewSeed();
  const chilli = s.recipes.find((r) => r.id === 'r-chilli');
  chilli.cookingMethods = ['oven_hob', 'ninja'];
  chilli.methodInstructions.ninja = [
    'Fry the onions and peppers on Sear for 5 mins.',
    'Add the mince and spices.',
    'Slow cook for 30 mins.',
  ];
  s.preferences.preferredCookingMethod = 'ninja';
  // Tonight (Wednesday): chilli, which has Ninja steps as well.
  s.mealPlans[0].days.Wednesday.meals = [meal('w1', 'recipe', 'r-chilli', 'Chilli con carne', 2)];
  // A line from 12 weeks ago (long gone) and one for this week.
  const old = mondayOf(TEST_NOW);
  old.setDate(old.getDate() - 7 * 12);
  s.shoppingList = [
    {
      id: 'old-line',
      name: 'Plain flour',
      amount: 1,
      unit: 'bag',
      category: 'Pantry',
      checked: true,
      isAdhoc: true,
      planId: `plan-${iso(old)}`,
    },
    {
      id: 'this-line',
      name: 'Kitchen roll',
      amount: 1,
      unit: '',
      category: 'Household',
      checked: false,
      isAdhoc: true,
      planId: s.mealPlans[0].id,
    },
  ];
  return s;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- One phone that doesn't sync ----------
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
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speak: () => {}, cancel: () => {}, getVoices: () => [], resume: () => {} },
      configurable: true,
    });
  }, seed());
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cache = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const lineIds = async () => ((await cache()).shoppingList || []).map((i) => i.id);
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(600);
  };
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

  // Old shopping lines: cleared shortly after opening, not straight away (a syncing phone gives
  // the first sync its chance first).
  await page.goto(URL);
  await page.waitForTimeout(300);
  check((await lineIds()).includes('old-line'), 'just opened: the old line is still there', (await lineIds()).join());
  await page.waitForTimeout(2200);
  const ids = await lineIds();
  check(
    !ids.includes('old-line') && ids.includes('this-line'),
    "a moment later: the old line is cleared and this week's is kept",
    ids.join(),
  );

  // Cooking mode: opens on the method you prefer; the one you pick then stays as you go.
  await tab('Cook');
  await page.locator('[data-tonight-start]').first().click();
  await page.waitForTimeout(500);
  const picked = () => text('[data-cook-method] button[aria-pressed="true"]');
  const currentStep = () =>
    page.evaluate(() => document.querySelector('[data-step].ring-1')?.getAttribute('data-step'));
  check((await picked()) === 'Ninja', 'chilli opens on Ninja (the method you prefer)', await picked());
  check(
    /Sear for 5 mins/.test(await text('[data-step="1"]')),
    'showing the Ninja steps',
    await text('[data-step="1"]'),
  );
  await page.locator('[data-cook-method] button', { hasText: 'Oven/Hob' }).click();
  await page.waitForTimeout(200);
  await page.locator('[data-cook-next]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-cook-next]').click();
  await page.waitForTimeout(250);
  check(
    (await picked()) === 'Oven/Hob' && (await currentStep()) === '2',
    'Oven/Hob stays picked as you move on',
    `${await picked()} step ${await currentStep()}`,
  );
  check(
    /Add 750g mince|mince and brown/.test(await text('[data-step="2"]')),
    'with the Oven/Hob steps',
    await text('[data-step="2"]'),
  );
  await page.screenshot({ path: `${OUT}/cook-method-kept.png` });
  await page.locator('button[aria-label="Leave cooking mode"]').click();
  await page.waitForTimeout(400);

  // A recipe shared to the app: Cookbook opens "Add a recipe" with it, once.
  const shared = 'https://www.bbcgoodfood.com/recipes/easy-chicken-curry';
  await page.goto(URL + '?share_text=' + encodeURIComponent('Try this one ' + shared));
  await page.waitForTimeout(1200);
  check((await page.locator('[data-add-recipe="input"]').count()) === 1, 'a shared recipe opens Add a recipe');
  const typed = await page
    .locator('[data-add-recipe] textarea')
    .first()
    .inputValue()
    .catch(() => '');
  check(typed === shared, 'with the link in it', typed);
  check(
    (await page.evaluate(() => location.search)) === '',
    "and the address is tidied (a reload won't add it again)",
    await page.evaluate(() => location.search),
  );
  await page.locator('[data-add-recipe] button[aria-label="Close"]').click();
  await page.waitForTimeout(300);
  await tab('Planning');
  await tab('Cookbook');
  check(
    (await page.locator('[data-add-recipe]').count()) === 0,
    "closed, it doesn't open again when you come back to the Cookbook",
  );
  check(errors.length === 0, 'no page errors (one phone)', errors.join(' | '));
  await ctx.close();

  // ---------- Two phones: an edit in progress survives a sync ----------
  const mock = createMockGist({ 'family-meal-planner.json': JSON.stringify(reviewSeed()) });
  async function openPhone(who) {
    const c = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      serviceWorkers: 'block',
    });
    await c.route('https://api.github.com/**', (r) => mock.handle(r, who));
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.addInitScript((who) => {
      if (!localStorage.getItem('github_pat')) {
        localStorage.setItem('github_pat', 'test-token');
        localStorage.setItem('github_gist_id', 'testgist123');
        localStorage.setItem('currentUser', who === 'A' ? 'P' : 'R');
      }
    }, who);
    const p = await c.newPage();
    await p.clock.install({ time: NOW });
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    await p.goto(URL);
    await p.waitForTimeout(2500);
    return p;
  }
  const tabOn = async (p, n) => {
    await p.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await p.waitForTimeout(600);
  };
  const cacheOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const comeBack = async (p) => {
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p.waitForTimeout(2500);
  };
  const openRecipe = async (p, name) => {
    await tabOn(p, 'Cookbook');
    await p.locator(`[data-recipe-card="${name}"]`).first().click();
    await p.waitForTimeout(500);
  };
  const bol = (st) => st.recipes.find((r) => r.id === 'r-bol');

  const A = await openPhone('A');
  const B = await openPhone('B');
  await openRecipe(A, 'Spaghetti bolognese');
  await A.locator('button[aria-label="Edit recipe"]').click();
  await A.waitForTimeout(300);
  await A.locator('input[aria-label="Recipe name"]').fill('Spag bol');
  await openRecipe(B, 'Spaghetti bolognese');
  await B.locator('[data-recipe-notes] button', { hasText: /Add a note/ }).click();
  await B.waitForTimeout(200);
  await B.locator('[data-recipe-notes-input]').fill('Less salt');
  await B.locator('[data-recipe-notes-save]').click();
  await B.waitForTimeout(2000);
  await comeBack(A);
  check(bol(await cacheOf(A)).notes === 'Less salt', "Peter's phone has Rachel's note", bol(await cacheOf(A)).notes);
  check(
    (await A.locator('input[aria-label="Recipe name"]').inputValue()) === 'Spag bol',
    "Peter's edit in progress is kept when her note arrives",
    await A.locator('input[aria-label="Recipe name"]').inputValue(),
  );
  await A.locator('button', { hasText: /^Save recipe$/ }).click();
  await A.waitForTimeout(2000);
  await comeBack(B);
  const a = bol(await cacheOf(A)),
    b = bol(await cacheOf(B));
  check(
    a.name === 'Spag bol' && a.notes === 'Less salt' && b.name === 'Spag bol' && b.notes === 'Less salt',
    'saving keeps her note: only the name he changed is saved, on both phones',
    JSON.stringify({ a: [a.name, a.notes], b: [b.name, b.notes] }),
  );
  check(/Spag bol/.test(await B.locator('h2').first().innerText()), "and Rachel's open recipe shows the new name");
  check(
    A.errors.length === 0 && B.errors.length === 0,
    'no page errors (two phones)',
    [...A.errors, ...B.errors].join(' | '),
  );

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
