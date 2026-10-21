// Recipe cards and the one-page recipe pop-up, end to end on an iPhone-sized screen.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 400)); if (!ok) failures++; };

function seed() {
  const s = reviewSeed();
  const om = s.recipes.find((r) => r.id === 'r-omelette');
  om.prepTime = 0; om.cookTime = 0; // no times written down
  return s;
}

const NINJA_STEPS = ['Put the marinated chicken in the Ninja on Combi Crisp, 200C, 12 mins.', 'Add the sauce and cook 6 mins more.'];
const COPIED = {
  name: 'Lemon pasta', description: 'Zingy and quick.', servings: 2, prepTime: 5, cookTime: 10,
  ingredients: [{ name: 'spaghetti', amount: 200, unit: 'g', note: '' }, { name: 'lemon', amount: 1, unit: '', note: 'zested' }],
  instructions: ['Boil the pasta.', 'Toss with lemon.'], isVegetarian: true, isVegan: false,
};

async function open(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const reply = (r, obj) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
  await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
    if (/Translate the cooking instructions/.test(prompt)) return reply(r, { instructions: NINJA_STEPS, prepTime: 10, cookTime: 18 });
    if (/Grocery-list products:/.test(prompt)) return reply(r, { matches: [] });
    return reply(r, COPIED);
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('seeded', '1'); }
    if (!localStorage.getItem('gemini_api_key')) localStorage.setItem('gemini_api_key', 'test-key');
  }, seed());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  page.tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(700); };
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return { ctx, page };
}
const cardText = async (page, name) => (await page.locator(`[data-recipe-card="${name}"]`).first().innerText()).replace(/\s+/g, ' ').trim();
const popup = (page) => page.locator('[data-recipe-popup]');
const popupText = async (page) => (await popup(page).innerText()).replace(/\s+/g, ' ');

(async () => {
  const browser = await chromium.launch();
  const S = seed();
  const nextId = S.mealPlans[1].id;
  const { page } = await open(browser);

  // ---------- Cards ----------
  await page.tab('Cookbook');
  check(await page.locator('[data-recipe-card]').count() === 8, 'Cookbook: 8 recipe cards');
  check(await page.locator('[aria-label^="Delete "]').count() === 0, 'no bin on the cards');
  let t = await cardText(page, 'Chicken tikka masala');
  check(/45 min/.test(t) && /Oven\/Hob/.test(t) && !/Ninja/.test(t) && !/Prep|Cook:|Total/.test(t), 'tikka card: one time, only Oven/Hob, no Prep/Cook/Total', t);
  check(/Last had \d+ days? ago|Last had yesterday|Last had .*weeks? ago/.test(t), 'tikka card: last had', t);
  t = await cardText(page, 'Chilli con carne');
  check(/1 hr 15 min/.test(t) && /3 in freezer/.test(t) && /Planned/.test(t), 'chilli card: 1 hr 15 min, planned, 3 in freezer', t);
  t = await cardText(page, 'Cheese omelette');
  check(!/min|hr/.test(t) && /Veggie/.test(t) && /Not had yet/.test(t), 'omelette card: no made-up time, Veggie, Not had yet', t);
  t = await cardText(page, 'Aubergine & chickpea curry');
  check(/Vegan/.test(t) && !/Veggie/.test(t), 'aubergine card: Vegan', t);
  await page.screenshot({ path: OUT + '/r1-cookbook.png' });

  // Sort: not had lately (shared with Planning, remembered on this phone)
  await page.locator('button[aria-label="Sort and display options"]').click(); await page.waitForTimeout(300);
  const sortBtn = page.locator('[data-sort="not_lately"]');
  await sortBtn.click(); await page.waitForTimeout(300);
  await page.mouse.click(10, 560); await page.waitForTimeout(300);
  check(await page.locator('[data-sort]').count() === 0, 'options panel closes when tapping outside');
  let order = await page.locator('[data-recipe-card]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-recipe-card')));
  check(order[0] === 'Cheese omelette' && /Chilli|Fajitas|Aubergine|Salmon|bolognese/.test(order[order.length - 1]), 'Not had lately: never-had first, planned ones last', JSON.stringify(order));
  check(await page.evaluate(() => localStorage.getItem('recipe_sort')) === 'not_lately', 'sort remembered');

  // ---------- Pop-up ----------
  await page.locator('[data-recipe-card="Chicken tikka masala"]').click(); await page.waitForTimeout(600);
  let p = await popupText(page);
  check(!/\bInfo\b/.test(p) && !/Instructions/.test(p), 'one page: no Info / Instructions tabs');
  const summary = (await page.locator('[data-recipe-summary]').innerText()).replace(/\s+/g, ' ');
  check(/45 min/.test(summary) && /15 prep, 30 cook/.test(summary) && /Serves 4/.test(summary) && /Oven\/Hob/.test(summary) && !/Ninja|Vegetarian|Vegan/.test(summary), 'summary: 45 min (15 prep, 30 cook), Serves 4, Oven/Hob only', summary);
  check(/Last had/.test(await page.locator('[data-recipe-context]').innerText()), 'context line: last had');
  const ings = await page.locator('[data-recipe-ingredients] li').allInnerTexts();
  check(ings.length === 9 && /^4 chicken breasts/.test(ings[0].trim()) && /cut into chunks/.test(ings[0]), 'ingredients on the first page, amount first, note underneath', JSON.stringify(ings.slice(0, 2)));
  check(!/MEAT & SEAFOOD|Meat & Seafood|PANTRY/.test(p), 'no aisle labels on ingredients');
  await page.locator('[aria-label="One more person"]').click(); await page.waitForTimeout(200);
  const ing5 = (await page.locator('[data-recipe-ingredients] li').first().innerText()).trim();
  check(/^5 chicken breasts/.test(ing5) && /Recipe makes 4/.test(await popupText(page)), 'cooking for 5: amounts adjusted', ing5);
  await page.locator('[data-recipe-ingredients] li button').nth(1).click();
  check(await page.locator('[data-recipe-ingredients] li button').nth(1).getAttribute('aria-pressed') === 'true' && await page.getByText('Clear ticks').count() === 1, 'tick an ingredient, "Clear ticks" appears');
  const steps = await page.locator('[data-recipe-method] ol li').count();
  check(steps === 4, '4 method steps on the same page', steps);
  await page.locator('[data-recipe-method] ol li button').first().click();
  check(await page.locator('[data-recipe-method] ol li button').first().getAttribute('aria-pressed') === 'true', 'tap a step to tick it');
  check(await page.getByRole('button', { name: /Start cooking/ }).count() === 1 && await page.getByRole('button', { name: /Add to a day/ }).count() === 1, 'Cookbook pop-up: Start cooking and Add to a day');
  await page.screenshot({ path: OUT + '/r2-popup.png' });

  // Gemini writes the Ninja steps
  await page.locator('[data-write-method="ninja"]').click(); await page.waitForTimeout(1200);
  check(await page.getByRole('tab', { name: /Ninja/ }).count() === 1, 'Ninja steps written: Oven/Hob | Ninja switch appears');
  check(/Combi Crisp/.test(await page.locator('[data-recipe-method]').innerText()), 'showing the Ninja steps');
  let st = await page.state();
  let tikka = st.recipes.find((r) => r.id === 'r-tikka');
  check(tikka.methodInstructions?.ninja?.length === 2 && tikka.cookingMethods.includes('ninja'), 'Ninja steps saved to the recipe', JSON.stringify(tikka.cookingMethods));
  await page.getByRole('tab', { name: /Oven\/Hob/ }).click(); await page.waitForTimeout(200);
  check(/Mix the chicken/.test(await page.locator('[data-recipe-method]').innerText()), 'switch back to Oven/Hob steps');
  await page.screenshot({ path: OUT + '/r3-ninja.png' });

  // Edit: notes and website; then delete another recipe
  await page.locator('[aria-label="Edit recipe"]').click(); await page.waitForTimeout(300);
  await page.locator('[aria-label="Our notes"]').fill('We use half the tikka paste.');
  await page.locator('input[aria-label="Website"]').fill('https://www.bbcgoodfood.com/recipes/chicken-tikka-masala');
  await page.locator('input[aria-label="Ingredient"]').first().fill('chicken thighs');
  await page.screenshot({ path: OUT + '/r4-edit.png' });
  await page.getByRole('button', { name: 'Save recipe' }).click(); await page.waitForTimeout(400);
  p = await popupText(page);
  check(/Our notes ([PR] )?(Change )?We use half the tikka paste\./i.test(p) && /From bbcgoodfood\.com/.test(p), 'notes and website shown after saving', p.slice(0, 300));
  check(await page.locator('[data-recipe-source]').getAttribute('target') === '_blank', 'website opens in a new tab');
  st = await page.state();
  tikka = st.recipes.find((r) => r.id === 'r-tikka');
  check(tikka.notes === 'We use half the tikka paste.' && tikka.sourceUrl === 'https://www.bbcgoodfood.com/recipes/chicken-tikka-masala' && tikka.ingredients[0].name === 'chicken thighs', 'saved: notes, website, ingredient', JSON.stringify({ n: tikka.notes, u: tikka.sourceUrl, i: tikka.ingredients[0].name }));
  // Cancel discards
  await page.locator('[aria-label="Edit recipe"]').click(); await page.waitForTimeout(200);
  await page.locator('[aria-label="Recipe name"]').fill('Something else');
  await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(200);
  check(/Chicken tikka masala/.test(await page.locator('[data-recipe-popup] h2').innerText()) && (await page.state()).recipes.find((r) => r.id === 'r-tikka').name === 'Chicken tikka masala', 'Cancel throws the edit away');
  await page.locator('[aria-label="Close"]').first().click(); await page.waitForTimeout(300);

  await page.locator('[data-recipe-card="Sausage & mash"]').click(); await page.waitForTimeout(400);
  await page.locator('[aria-label="Edit recipe"]').click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Delete this recipe/ }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Delete$/ }).click(); await page.waitForTimeout(400);
  check(!(await page.state()).recipes.some((r) => r.id === 'r-sausage') && await page.locator('[data-recipe-card="Sausage & mash"]').count() === 0, 'delete from edit mode (after confirming)');

  // ---------- Add to a day (from the Cookbook) ----------
  await page.locator('[data-recipe-card="Cheese omelette"]').click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Add to a day/ }).click(); await page.waitForTimeout(900);
  check(await page.locator('[data-add-to-day]').count() === 1 && await page.locator('[data-week-strip], [data-day-list]').count() === 1, 'Add to a day: goes to Planning with the day chooser open');
  await page.screenshot({ path: OUT + '/r5-addday.png' });
  await page.locator('[data-week-chip="Next Week"]').click(); await page.waitForTimeout(300);
  await page.locator('[data-add-day="Sunday"]').click(); await page.waitForTimeout(600);
  check(/Added Cheese omelette to Sunday for 2/.test(await page.body()), 'toast: Added Cheese omelette to Sunday for 2');
  st = await page.state();
  check(st.mealPlans.find((x) => x.id === nextId).days.Sunday.meals[0]?.recipeId === 'r-omelette', 'saved on next week\'s Sunday');

  // ---------- Planning: card, pop-up, add to a day with leftovers ----------
  check(await page.locator('[data-recipe-card]').first().getAttribute('data-recipe-card') === 'Cheese omelette' ? false : true, 'Planning uses the same sort (omelette is now planned, so not first)');
  t = await cardText(page, 'Cheese omelette');
  check(/This week: Sun|Planned/.test(t), 'omelette card now says it is planned (This week: Sun)', t);
  await page.locator('[data-recipe-card="Salmon traybake"]').click(); await page.waitForTimeout(500);
  check(await page.getByRole('button', { name: /Start cooking/ }).count() === 0 && await page.getByRole('button', { name: /Add to a day/ }).count() === 1, 'Planning pop-up: Add to a day only (no empty bar)');
  await page.screenshot({ path: OUT + '/r6-planning-popup.png' });
  await page.getByRole('button', { name: /Add to a day/ }).click(); await page.waitForTimeout(500);
  await page.locator('[data-add-day="Sunday"]').click(); await page.waitForTimeout(600);
  check(await page.locator('[data-how="leftover"]').count() === 1, 'Salmon on Sunday after Saturday\'s salmon: asks if it\'s leftovers');
  await page.locator('[data-how="leftover"]').click(); await page.waitForTimeout(600);
  st = await page.state();
  const sun = st.mealPlans.find((x) => x.id === nextId).days.Sunday.meals;
  check(sun.length === 1 && sun[0].type === 'leftover' && sun[0].recipeId === 'r-salmon', 'Sunday is now salmon leftovers (replaced the omelette)', JSON.stringify(sun));

  // Rows of 1 still drags (wide cards)
  check(await page.locator('[data-recipe-card][draggable="true"]').count() === 7, 'Planning cards can be dragged');

  check(page.errors.length === 0, 'no page errors', page.errors.join(' | '));

  // ---------- Import keeps the website ----------
  await page.tab('Cookbook');
  await page.getByRole('button', { name: 'Add Recipe' }).click(); await page.waitForTimeout(500);
  await page.locator('textarea').fill('Lemon pasta\nhttps://www.example.com/lemon-pasta\nServes 2\n200g spaghetti\n1 lemon, zested\nBoil the pasta. Toss with lemon.');
  await page.locator('[data-add-go]').click(); await page.waitForTimeout(2500);
  const web = page.locator('input[aria-label="Website"]');
  check(await web.count() === 1 && await web.inputValue() === 'https://www.example.com/lemon-pasta', 'review: Website filled in from the pasted link', await web.count() ? await web.inputValue() : 'no field');
  await page.screenshot({ path: OUT + '/r7-import-review.png' });
  await page.locator('[data-save-recipe]').click(); await page.waitForTimeout(1000);
  st = await page.state();
  const lemon = st.recipes.find((r) => r.name === 'Lemon pasta');
  check(lemon?.sourceUrl === 'https://www.example.com/lemon-pasta', 'imported recipe keeps its website', JSON.stringify(lemon && lemon.sourceUrl));

  check(page.errors.length === 0, 'no page errors (import)', page.errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
