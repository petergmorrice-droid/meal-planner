// "Change it with Gemini" in the recipe window: only what the edit changed is saved. A recipe for 4
// with oven and Ninja steps, a favourite with notes and linked products keeps all of that.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

function seed() {
  const s = reviewSeed();
  const t = s.recipes.find((r) => r.id === 'r-tikka');
  t.servings = 4;
  t.cookingMethods = ['oven_hob', 'ninja'];
  t.methodInstructions = {
    oven_hob: [...t.instructions],
    ninja: ['Combi Crisp the chicken for 12 mins.', 'Add the sauce.'],
  };
  t.favourite = true;
  t.notes = 'Less chilli for the kids';
  t.notesBy = 'R';
  t.ingredients = t.ingredients.map((i, n) => ({ ...i, groceryId: `gdb-test-${n}` }));
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-14T16:30:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let asked = '';
  await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    asked = body.contents?.[0]?.parts?.[0]?.text || '';
    const recipe = JSON.parse(asked.slice(asked.indexOf('{'), asked.lastIndexOf('}') + 1));
    // Gemini's answer: the same recipe with coriander taken out of the oven steps, both appliances given.
    const answer = {
      ...recipe,
      ingredients: recipe.ingredients.filter((i) => i.name !== 'coriander'),
      methodInstructions: {
        oven_hob: recipe.methodInstructions.oven_hob.map((s) => s.replace('Scatter with coriander and serve', 'Serve')),
        ninja: recipe.methodInstructions.ninja,
      },
      isVegetarian: false,
      isVegan: false,
    };
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
    });
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('gemini_api_key', 'test-key');
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.locator('nav button', { hasText: /^Cookbook$/ }).click();
  await page.waitForTimeout(500);
  await page.locator('[data-recipe-card="Chicken tikka masala"]').first().click();
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="Edit recipe"]').click();
  await page.locator('button[aria-label="Change it with Gemini"]').click();
  await page.locator('[aria-label="What should Gemini change?"]').fill('leave out the coriander');
  await page.locator('button', { hasText: /^Change$/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/gemini-edit.png` });

  check(/serves 4/.test(asked) && /oven_hob, ninja/.test(asked), 'Gemini is told it serves 4 and has both appliances');
  check(!/gdb-test|favourite|notesBy/.test(asked), "Gemini only sees the recipe, not the app's bookkeeping");
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const t = st.recipes.find((r) => r.id === 'r-tikka');
  check(
    !t.ingredients.some((i) => i.name === 'coriander'),
    'the coriander is gone',
    JSON.stringify(t.ingredients.map((i) => i.name)),
  );
  check(
    !/coriander/.test(t.methodInstructions.oven_hob.join(' ')),
    'and from the oven steps',
    t.methodInstructions.oven_hob.join(' | '),
  );
  check(t.servings === 4, 'still serves 4', t.servings);
  check(
    JSON.stringify(t.cookingMethods) === '["oven_hob","ninja"]' && t.methodInstructions.ninja?.length === 2,
    'Ninja steps kept',
    JSON.stringify(t.methodInstructions),
  );
  check(
    t.favourite === true && t.notes === 'Less chilli for the kids' && t.notesBy === 'R',
    'favourite and notes kept',
    JSON.stringify([t.favourite, t.notes, t.notesBy]),
  );
  check(
    t.ingredients.every((i) => /^gdb-test-/.test(i.groceryId || '')),
    'every ingredient still linked to its product',
    JSON.stringify(t.ingredients.map((i) => i.groceryId)),
  );
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
