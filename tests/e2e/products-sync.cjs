// Products and syncing: one shared product list (old data folded in), the Products page (what uses
// each product, Same as…, also-called names, tidy-up checks, removals that stick, reset), the Shop
// staples sheet and Planning sides reading the same list, and two phones syncing weeks day by day,
// staples item by item, and a phone that's been away for months.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500)); if (!ok) failures++; };

// Wednesday 14 Oct 2026, 4:30pm in London.
const NOW = new Date('2026-10-14T16:30:00+01:00');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function plan(monIso, meals, status) {
  const mon = new Date(monIso + 'T00:00:00');
  const days = {};
  DAYS.forEach((d, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); days[d] = { date: iso(x), meals: meals[d] || [] }; });
  return { id: `plan-${monIso}`, startDate: monIso, days, status, isCurrent: false, lastModifiedAt: 1 };
}
const meal = (id, type, recipeId, name, servings, extra = {}) => ({ id, type, recipeId, name, servings, ...extra });

function seed() {
  const s = reviewSeed();
  const chilli = s.recipes.find((r) => r.id === 'r-chilli');
  chilli.cookingMethods = ['oven_hob', 'ninja'];
  chilli.instructions[3] = 'Serve with rice. ' + 'Spoon the chilli over the rice, scatter with chopped coriander and a spoonful of soured cream, and put the grated cheddar, lime wedges, sliced jalapeños and tortilla chips on the table so everyone can help themselves. '.repeat(2).trim();
  chilli.methodInstructions.ninja = ['Fry the onions and peppers on Sear for 5 mins.', 'Add the mince and spices.', 'Add tomatoes and beans and slow cook for 30 mins.', 'Serve with rice.'];
  chilli.methodPrepTime = { oven_hob: 15, ninja: 10 };
  chilli.methodCookTime = { oven_hob: 60, ninja: 35 };
  s.mealPlans = [
    plan('2026-10-12', {
      Monday: [meal('m1', 'recipe', 'r-bol', 'Spaghetti bolognese', 2, { cooked: true })],
      Tuesday: [meal('m2', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
      Wednesday: [meal('m3', 'recipe', 'r-chilli', 'Chilli con carne', 2, { note: 'Batch cook: freeze 4' })],
      Thursday: [meal('m4', 'batch', 'r-bol', 'Batch: Spaghetti bolognese', 2, { batchId: 'b3' })],
      Friday: [meal('m5', 'leftover', 'r-chilli', 'Leftovers: Chilli con carne', 2)],
      Saturday: [meal('m6', 'takeout', undefined, 'Takeout', 2, { note: 'Pizza night' })],
      Sunday: [meal('m7', 'recipe', 'r-sausage', 'Sausage & mash', 2)],
    }, 'finalized'),
    plan('2026-10-19', {
      Monday: [meal('n1', 'recipe', 'r-fajita', 'Chicken fajitas', 2)],
      Wednesday: [meal('n3', 'recipe', 'r-chilli', 'Chilli con carne', 6, { note: 'Batch cook: freeze 4' })],
      Friday: [meal('n5', 'eating_out', undefined, 'Eating out', 2)],
    }, 'draft'),
  ];
  s.mealPlans.unshift(plan('2026-10-05', {
    Monday: [meal('p1', 'recipe', 'r-chilli', 'Chilli con carne', 2, { cooked: true })],
    Tuesday: [meal('p2', 'leftover', 'r-chilli', 'Leftovers: Chilli con carne', 2, { cooked: true, note: 'Reheat from Monday' })],
    Wednesday: [meal('p3', 'takeout', undefined, 'Takeout', 2)],
    Thursday: [meal('p4', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
  }, 'finalized'));
  s.recipes.find((r) => r.id === 'r-chilli').verdict = 'again';
  s.batches.push({ id: 'b3', name: 'Spaghetti bolognese', recipeId: 'r-bol', portions: 2, dateAdded: '2026-09-20' });
  return s;
}



const { createMockGist } = require('./mockgist.cjs');

function productSeed(old) {
  const s = seed();
  s.preferences = { ...(s.preferences || {}), catalogVersion: 3, recurringItems: [
    { id: 'st1', name: 'Tinned Toms', amount: 2, unit: 'can', category: 'Canned' },
    { id: 'st2', name: 'Milk', amount: 2, unit: 'pint', category: 'Dairy' },
  ] };
  s.recipes.push({ id: 'r-pesto', name: 'Pesto pasta', description: '', servings: 2, prepTime: 5, cookTime: 15, tags: [], instructions: ['Cook the pasta.', 'Stir through pesto and pine nuts.'],
    ingredients: [
      { id: 'i1', name: 'pine nuts', amount: 30, unit: 'g', groceryId: 'gdb-x-pine-nuts' },
      { id: 'i2', name: 'courgettes', amount: 2, unit: '', groceryId: 'gdb-custom-courgettes' },
      { id: 'i3', name: 'garlic', amount: 1, unit: 'clove', groceryId: 'gdb-2' },
      { id: 'i4', name: 'nduja', amount: 1, unit: 'tbsp', groceryId: 'gdb-custom-nduja' },
    ] });
  // An older app's data: the original list with free-text groups, changes kept separately,
  // a product only in those changes, and a built-in product deleted outright.
  s.groceryDatabase = [
    ...old.INITIAL_GROCERY_DATABASE.map((i) => ({ ...i, lastModifiedAt: 1000 })),
    { id: 'gdb-x-pine-nuts', name: 'Pine Nuts', unit: 'pack', increment: 1, category: 'Pantry', lastModifiedAt: 1000 },
    { id: 'gdb-custom-courgettes', name: 'Courgettes', unit: 'whole', increment: 1, category: 'Produce', lastModifiedAt: 1000 },
    { id: 'gdb-custom-basil', name: 'Fresh Basil', unit: 'bunch', increment: 1, category: 'Produce', lastModifiedAt: 1000 },
    { id: 'gdb-custom-toms', name: 'Tinned Toms', unit: 'can', increment: 1, category: 'Canned', lastModifiedAt: 1000 },
    { id: 'gdb-custom-mystery', name: 'Mystery Mix', unit: 'pack', increment: 1, category: '', lastModifiedAt: 1000 },
  ];
  s.groceryOverrides = { 'gdb-2': { increment: 2 }, 'gdb-custom-nduja': { id: 'gdb-custom-nduja', name: 'Nduja', unit: 'jar', increment: 1, category: 'Meat' } };
  s.syncMeta = { tombstones: { 'groceryDatabase:gdb-x-paprika': 1500 }, preferencesModifiedAt: 1000, preferencesFieldModifiedAt: {}, overridesModifiedAt: { 'gdb-2': 2000, 'gdb-custom-nduja': 2000 } };
  return s;
}

(async () => {
  const old = await import('./fixtures/old-shopping.mjs');
  const browser = await chromium.launch();

  // ======================= One phone: the product list =======================
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('planning_view', 'list'); localStorage.setItem('seeded', '1'); } }, productSeed(old));
    const page = await ctx.newPage();
    await page.clock.install({ time: NOW });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL); await page.waitForTimeout(1500);
    const tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(700); };
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
    const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
    const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const g = (st, id) => (st.groceryDatabase || []).find((x) => x.id === id);
    const AISLES = ['Fresh Produce', 'Bakery & Bread', 'Meat & Seafood', 'Dairy, Chilled & Eggs', 'Pasta, Rice & Grains', 'Canned & Jarred Goods', 'Pantry, Oils & Spices', 'Frozen Foods', 'Household & Other'];

    // ---- Old data folded into one list ----
    let st = await state();
    check(Object.keys(st.groceryOverrides || {}).length === 0, 'separate changes folded in (none left over)', JSON.stringify(st.groceryOverrides));
    check(g(st, 'gdb-2')?.increment === 2, 'Garlic keeps the change (sold in 2s)', JSON.stringify(g(st, 'gdb-2')));
    check(g(st, 'gdb-custom-nduja')?.name === 'Nduja' && g(st, 'gdb-custom-nduja').category === 'Meat & Seafood', 'Nduja (only in the changes) is now a product, in Meat & Seafood', JSON.stringify(g(st, 'gdb-custom-nduja')));
    check(g(st, 'gdb-x-paprika')?.removed === true, 'Paprika (deleted outright) is kept off with a marker', JSON.stringify(g(st, 'gdb-x-paprika')));
    check(g(st, 'gdb-x-ground-cumin') && !g(st, 'gdb-x-ground-cumin').removed, 'products added to the app since are in the list (Ground Cumin)');
    const live = (st.groceryDatabase || []).filter((x) => !x.removed);
    const offList = live.filter((x) => !AISLES.includes(x.category)).map((x) => x.name + ':' + x.category);
    check(offList.length === 1 && offList[0] === 'Mystery Mix:', 'every product is in one of the Shop aisles (Mystery Mix: none)', offList.join(', '));
    check(g(st, 'gdb-150').category === 'Dairy, Chilled & Eggs' && g(st, 'gdb-163').category === 'Household & Other', 'juice is chilled, shampoo is household', g(st, 'gdb-150').category + ' / ' + g(st, 'gdb-163').category);
    check(g(st, 'gdb-18')?.removed && g(st, 'gdb-18').mergedInto === 'gdb-17', 'built-in Zucchini merged into Courgette');
    // UK pack sizes, names and the grains aisle (once, on products you haven't changed)
    check(g(st, 'gdb-51').increment === 300 && g(st, 'gdb-5').unit === 'kg' && g(st, 'gdb-5').increment === 2.5, 'UK pack sizes: chicken breasts in 300 g, potatoes in 2.5 kg bags', JSON.stringify([g(st, 'gdb-51'), g(st, 'gdb-5')]));
    check(g(st, 'gdb-8').name === 'Peppers' && g(st, 'gdb-158').name === 'Washing-up Liquid' && g(st, 'gdb-133').name === 'Plain Flour', 'UK names', [g(st, 'gdb-8').name, g(st, 'gdb-158').name, g(st, 'gdb-133').name].join(', '));
    check(g(st, 'gdb-99').category === 'Pasta, Rice & Grains', 'rice in the Pasta, Rice & Grains aisle');
    check(['gdb-x-self-raising-flour', 'gdb-x-icing-sugar', 'gdb-x-chicken-stock', 'gdb-x-white-wine', 'gdb-x-yorkshire', 'gdb-x-crumpets', 'gdb-x-baby-potatoes'].every((id) => g(st, id) && !g(st, id).removed), 'separate and new UK products added');
    check(st.preferences.catalogVersion === 4, 'done once (version recorded)');

    // ---- Products page ----
    await tab('Settings');
    check(/products: how they're sold, which aisle, what uses them/.test(await text('[data-setting-link="products"]')), 'Products row', await text('[data-setting-link="products"]'));
    await page.locator('[data-setting-link="products"]').click(); await page.waitForTimeout(500);
    await shot('01-products');
    const count = async (id) => Number(await page.locator(`[data-check="${id}"]`).getAttribute('data-check-count'));
    check(await count('duplicates') >= 2, 'tidy-up: likely duplicates found', await text('[data-check="duplicates"]'));
    check(await count('no-aisle') === 1 && /1 product with no aisle/.test(await text('[data-check="no-aisle"]')), 'tidy-up: 1 with no aisle', await text('[data-check="no-aisle"]'));
    check(await count('unused') > 0 && /added by you/.test(await text('[data-check="unused"]')), 'tidy-up: not used yet (some added by you)', await text('[data-check="unused"]'));
    await page.locator('[data-products-search]').fill('nduja'); await page.waitForTimeout(200);
    check(/Used in 1 recipe/.test(await text('[data-product="Nduja"] [data-product-usage]')), 'a row says what uses it', await text('[data-product="Nduja"]'));
    await page.locator('[data-products-search]').fill('cumin'); await page.waitForTimeout(200);
    check(await page.locator('[data-product="Ground Cumin"]').count() === 1, 'built-in extras are on the page (Ground Cumin)');
    await page.locator('[data-products-search]').fill('paprika'); await page.waitForTimeout(200);
    check(await page.locator('[data-product="Paprika"]').count() === 0 && await page.locator('[data-product="Smoked Paprika"]').count() === 1, 'Paprika stays off; Smoked Paprika is there');
    await page.locator('[data-products-search]').fill(''); await page.waitForTimeout(150);
    await page.locator('[data-aisle-chip="frozen"]').click(); await page.waitForTimeout(200);
    const frozenRows = await page.locator('[data-products-list] [data-product]').evaluateAll((els) => els.map((e) => e.getAttribute('data-product')));
    check(frozenRows.includes('Frozen Peas') && !frozenRows.includes('Garlic'), 'aisle chips use the Shop aisles', frozenRows.join(', '));
    await page.locator('[data-aisle-chip="all"]').click(); await page.waitForTimeout(150);

    // ---- Likely duplicates: merge one pair, keep the other apart ----
    await page.locator('[data-check="duplicates"]').click(); await page.waitForTimeout(300);
    await shot('02-duplicates');
    const pairs = await page.locator('[data-dup-pair]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dup-pair')));
    check(pairs.some((p) => /Courgette\|Courgettes|Courgettes\|Courgette/.test(p)) && pairs.some((p) => /Basil/.test(p) && /Fresh Basil/.test(p)), 'pairs: Courgette/Courgettes and Basil/Fresh Basil', pairs.join('; '));
    const cPair = page.locator('[data-dup-pair*="Courgettes"]');
    await cPair.locator('[data-dup-keep="Courgette"]').click(); await page.waitForTimeout(200);
    check(/Courgettes becomes another name for Courgette/.test(await text('[data-confirm]')), 'merge explains what happens', await text('[data-confirm]'));
    await page.locator('[data-confirm-ok]').click(); await page.waitForTimeout(400);
    st = await state();
    check(g(st, 'gdb-custom-courgettes').removed && g(st, 'gdb-custom-courgettes').mergedInto === 'gdb-17', 'Courgettes merged into Courgette');
    check(st.recipes.find((r) => r.id === 'r-pesto').ingredients.find((i) => i.id === 'i2').groceryId === 'gdb-17', 'the recipe now uses Courgette');
    const bPair = page.locator('[data-dup-pair*="Fresh Basil"]');
    await bPair.locator('[data-dup-different]').click(); await page.waitForTimeout(300);
    st = await state();
    check(await page.locator('[data-dup-pair*="Fresh Basil"]').count() === 0 && (g(st, 'gdb-custom-basil').notSameAs || []).includes('gdb-32'), '"Not the same": the pair goes and is remembered', JSON.stringify(g(st, 'gdb-custom-basil')));
    await page.locator('[data-products-show-all]').click(); await page.waitForTimeout(300);
    await page.locator('[data-products-search]').fill('courgettes'); await page.waitForTimeout(200);
    const cRows = await page.locator('[data-products-list] [data-product]').evaluateAll((els) => els.map((e) => e.getAttribute('data-product')));
    check(cRows.join() === 'Courgette', 'searching Courgettes finds just Courgette now', cRows.join(', '));
    await page.locator('[data-products-search]').fill(''); await page.waitForTimeout(150);

    // ---- No aisle ----
    await page.locator('[data-check="no-aisle"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-product-set-aisle="Mystery Mix"]').selectOption('Pantry, Oils & Spices'); await page.waitForTimeout(300);
    st = await state();
    check(g(st, 'gdb-custom-mystery').category === 'Pantry, Oils & Spices', 'aisle set from the check');
    check(/Nothing left here/.test(await text('[data-products-list]')), 'nothing left without an aisle');
    await page.locator('[data-products-show-all]').click(); await page.waitForTimeout(300);
    check(/Every product has an aisle/.test(await text('[data-check="no-aisle"]')), 'check now says every product has an aisle');

    // ---- Also called ----
    await page.locator('[data-products-search]').fill('garlic'); await page.waitForTimeout(200);
    await page.locator('[data-product="Garlic"]').click(); await page.waitForTimeout(300);
    await shot('03-garlic');
    check(/used in 2 recipes \(Spaghetti bolognese, Pesto pasta\)/i.test(await text('[data-product-used]')), 'sheet says what uses it', await text('[data-product-used]'));
    check(await page.locator('[data-alias="garlic clove"]').count() === 1 && await page.locator('[data-alias="garlic paste"]').count() === 1, 'built-in other names are shown');
    await page.locator('[data-alias-remove="garlic paste"]').click();
    await page.locator('[data-alias-input]').fill('ajo'); await page.locator('[data-alias-add]').click();
    check(await page.locator('[data-alias="ajo"]').count() === 1, 'a name added');
    await page.locator('[data-product-save]').click(); await page.waitForTimeout(400);
    st = await state();
    check((g(st, 'gdb-2').hiddenAliases || []).includes('garlic paste') && (g(st, 'gdb-2').aliases || []).includes('ajo') && g(st, 'gdb-2').increment === 2, 'saved: garlic paste taken off, ajo added', JSON.stringify(g(st, 'gdb-2')));
    await page.locator('[data-products-search]').fill('ajo'); await page.waitForTimeout(200);
    check(await page.locator('[data-product="Garlic"]').count() === 1, 'search finds it by another name');

    // ---- Same as… ----
    await page.locator('[data-products-search]').fill('tinned toms'); await page.waitForTimeout(200);
    await page.locator('[data-product="Tinned Toms"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-product-same-as]').click(); await page.waitForTimeout(300);
    await page.locator('[data-merge-search]').fill('chopped'); await page.waitForTimeout(200);
    await shot('04-same-as');
    await page.locator('[data-merge-option="Chopped Tomatoes"]').click(); await page.waitForTimeout(200);
    check(/1 staple will use Chopped Tomatoes/.test(await text('[data-confirm]')), 'confirm says the staple moves', await text('[data-confirm]'));
    await page.locator('[data-confirm-ok]').click(); await page.waitForTimeout(400);
    st = await state();
    check(g(st, 'gdb-custom-toms').mergedInto === 'gdb-105', 'Tinned Toms merged into Chopped Tomatoes');
    const staple = st.preferences.recurringItems.find((x) => x.id === 'st1');
    check(staple.name === 'Chopped Tomatoes' && staple.category === 'Canned & Jarred Goods', 'the staple moved to Chopped Tomatoes', JSON.stringify(staple));

    // ---- Remove: warns, unlinks, Undo, and it sticks ----
    await page.locator('[data-products-search]').fill('pine'); await page.waitForTimeout(200);
    await page.locator('[data-product="Pine Nuts"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-product-remove]').click(); await page.waitForTimeout(200);
    check(/used in 1 recipe \(Pesto pasta\)/.test(await text('[data-confirm]')) && /matched by name instead/.test(await text('[data-confirm]')), 'remove warns what uses it', await text('[data-confirm]'));
    await page.locator('[data-confirm-ok]').click(); await page.waitForTimeout(400);
    st = await state();
    const pine = () => st.recipes.find((r) => r.id === 'r-pesto').ingredients.find((i) => i.id === 'i1');
    check(g(st, 'gdb-x-pine-nuts').removed === true && !pine().groceryId, 'removed, and the recipe unlinked');
    await page.locator('[data-toast-undo]').click(); await page.waitForTimeout(400);
    st = await state();
    check(!g(st, 'gdb-x-pine-nuts').removed && pine().groceryId === 'gdb-x-pine-nuts', 'Undo puts it and the link back');
    await page.locator('[data-product="Pine Nuts"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-product-remove]').click(); await page.locator('[data-confirm-ok]').click(); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(1500);
    st = await state();
    check(g(st, 'gdb-x-pine-nuts').removed === true, 'a removed built-in product stays removed after reopening');

    // ---- The Shop staples sheet and Planning sides read the same list ----
    await tab('Settings');
    await page.locator('[data-setting-link="staples"]').click(); await page.waitForTimeout(700);
    const quick = page.getByPlaceholder('Quick add staple item (e.g. Milk, Eggs)');
    await quick.fill('ndu'); await page.waitForTimeout(300);
    check(await page.getByRole('button', { name: /^Nduja/ }).count() >= 1, 'staples: suggests Nduja (was only in the separate changes)');
    await quick.fill('pine'); await page.waitForTimeout(300);
    check(await page.getByRole('button', { name: /^Pine Nuts/ }).count() === 0, 'staples: removed Pine Nuts not suggested');
    await shot('05-staples');
    await quick.fill('');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    { const c = page.locator('button[aria-label="Close"]:visible'); if (await c.count()) await c.first().click(); }
    await page.mouse.click(5, 5); await page.waitForTimeout(200);
    await tab('Planning');
    await page.locator('[data-list-day="Sunday"] button').first().click(); await page.waitForTimeout(400);
    await page.locator('[data-day-sides] button').click(); await page.waitForTimeout(400);
    const sides = page.getByPlaceholder('Search sides... (e.g. Peas, Salad)');
    await sides.fill('ndu'); await page.waitForTimeout(300);
    check(await page.getByRole('button', { name: /Nduja/ }).count() >= 1, 'Planning sides: finds Nduja');
    await sides.fill('cumin'); await page.waitForTimeout(300);
    check(await page.getByRole('button', { name: /Ground Cumin/ }).count() >= 1, 'Planning sides: finds built-in extras (Ground Cumin)');
    await sides.fill('pine'); await page.waitForTimeout(300);
    check(await page.getByRole('button', { name: /Pine Nuts/ }).count() === 0, 'Planning sides: removed Pine Nuts not offered');
    await shot('06-sides');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.reload(); await page.waitForTimeout(1500);

    // ---- Reset to built-in: a real reset ----
    await tab('Settings');
    await page.locator('[data-products-reset]').click(); await page.waitForTimeout(200);
    await page.locator('[data-confirm-ok]').click(); await page.waitForTimeout(400);
    st = await state();
    check(!g(st, 'gdb-x-pine-nuts').removed && g(st, 'gdb-2').increment === 1 && !g(st, 'gdb-2').hiddenAliases, 'built-in products back as they come (Pine Nuts back, Garlic reset)', JSON.stringify(g(st, 'gdb-2')));
    check(g(st, 'gdb-custom-nduja').removed && g(st, 'gdb-custom-mystery').removed, 'products you added are taken off');
    check(!st.recipes.find((r) => r.id === 'r-pesto').ingredients.find((i) => i.id === 'i4').groceryId, 'recipes linked to them are unlinked');
    check(errors.length === 0, 'no page errors (products)', errors.join(' | '));
    await ctx.close();
  }

  // ======================= Two phones syncing =======================
  {
    const start = seed();
    start.preferences = { ...(start.preferences || {}), recurringItems: [{ id: 'st2', name: 'Milk', amount: 2, unit: 'pint' }] };
    const mock = createMockGist({ 'family-meal-planner.json': JSON.stringify(start) });
    const offline = {};
    const phones = [];
    async function openPhone(who, { cache, lastSync } = {}) {
      const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
      await ctx.route('https://api.github.com/**', (r) => (offline[who] ? r.abort('internetdisconnected') : mock.handle(r, who)));
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await ctx.addInitScript(({ cache, lastSync }) => {
        if (!localStorage.getItem('github_pat')) {
          localStorage.setItem('github_pat', 'test-token');
          localStorage.setItem('github_gist_id', 'testgist123');
          if (cache) localStorage.setItem('mealPlannerAppStateCache', cache);
          if (lastSync) localStorage.setItem('last_sync_ok_at', String(lastSync));
        }
      }, { cache, lastSync });
      const page = await ctx.newPage();
      await page.clock.install({ time: NOW });
      page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
      await page.goto(URL); await page.waitForTimeout(2500);
      phones.push(page);
      return page;
    }
    const tabOn = async (page, n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(600); };
    const cacheOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
    const comeBack = async (page) => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(2500); };
    const week = (st) => st.mealPlans.find((p) => p.startDate === '2026-10-12');
    const noteOn = (st, d) => week(st)?.days?.[d]?.meals?.[0]?.note || '';
    const addNote = async (page, day, note) => {
      await tabOn(page, 'Cook');
      await page.locator(`[data-cook-add-note="${day}"]`).click(); await page.waitForTimeout(300);
      await page.locator('[data-note-input]').fill(note);
      await page.locator('[data-note-save]').click(); await page.waitForTimeout(500);
    };
    const addStaple = async (page, name) => {
      await tabOn(page, 'Settings');
      await page.locator('[data-setting-link="staples"]').click(); await page.waitForTimeout(700);
      const q = page.getByPlaceholder('Quick add staple item (e.g. Milk, Eggs)');
      await q.fill(name); await q.press('Enter'); await page.waitForTimeout(600);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      { const c = page.locator('button[aria-label="Close"]:visible'); if (await c.count()) await c.first().click(); }
      await page.mouse.click(5, 5); await page.waitForTimeout(200);
    };

    const a = await openPhone('A');
    const b = await openPhone('B');
    check(week(await cacheOf(a)) && week(await cacheOf(b)), 'both phones have the week');

    // Weeks, day by day: A (no signal) notes Sunday; B notes Thursday. Both kept.
    offline.A = true;
    await addNote(a, 'Sunday', 'Use the good sausages');
    await addNote(b, 'Thursday', 'Defrost in the morning');
    await b.waitForTimeout(1500);
    check(/Defrost/.test(noteOn(mock.state(), 'Thursday')), "B's Thursday note reached GitHub");
    offline.A = false;
    await comeBack(a); await comeBack(b); await comeBack(a);
    for (const [who, st] of [['A', await cacheOf(a)], ['B', await cacheOf(b)], ['GitHub', mock.state()]]) {
      check(/good sausages/.test(noteOn(st, 'Sunday')) && /Defrost/.test(noteOn(st, 'Thursday')), `${who}: both days' notes kept`, noteOn(st, 'Sunday') + ' | ' + noteOn(st, 'Thursday'));
    }

    // Staples, item by item: each phone adds one while A has no signal.
    offline.A = true;
    await addStaple(a, 'Bananas');
    await addStaple(b, 'Yogurt');
    await b.waitForTimeout(1500);
    offline.A = false;
    await comeBack(a); await comeBack(b); await comeBack(a);
    for (const [who, st] of [['A', await cacheOf(a)], ['B', await cacheOf(b)], ['GitHub', mock.state()]]) {
      const names = (st.preferences.recurringItems || []).map((x) => x.name).sort().join(', ');
      check(/Bananas/.test(names) && /Yogurt/.test(names) && /Milk/.test(names), `${who}: both new staples kept`, names);
    }

    // A phone away for over 3 months: deletions made meanwhile stay deleted, its own new change is kept.
    const day = 86_400_000;
    const now = NOW.getTime();
    const shared = mock.state();
    const stale = JSON.parse(JSON.stringify(shared));
    stale.recipes.push({ id: 'r-old', name: 'Old Curry', description: '', ingredients: [], instructions: [], prepTime: 0, cookTime: 0, servings: 2, tags: [], lastModifiedAt: now - 130 * day });
    stale.recipes.push({ id: 'r-soup', name: 'New Soup', description: '', ingredients: [], instructions: [], prepTime: 0, cookTime: 0, servings: 2, tags: [], lastModifiedAt: now - 2 * day });
    const c = await openPhone('C', { cache: JSON.stringify(stale), lastSync: now - 100 * day });
    await c.waitForTimeout(1500);
    const cs = await cacheOf(c);
    check(!cs.recipes.some((r) => r.id === 'r-old') && cs.recipes.some((r) => r.id === 'r-soup'), 'away 3+ months: the old deleted recipe stays gone, the new one is kept', cs.recipes.map((r) => r.name).join(', '));
    check(!mock.state().recipes.some((r) => r.id === 'r-old') && mock.state().recipes.some((r) => r.id === 'r-soup'), 'GitHub: same');
    await tabOn(c, 'Settings');
    check(/hadn't synced for over 3 months/.test(await c.locator('[data-sync-notice]').innerText().catch(() => '')), 'Settings says what happened');
    await c.screenshot({ path: `${OUT}/07-away-notice.png` });

    for (const p of phones) check(p.errors.length === 0, 'no page errors (sync)', p.errors.join(' | '));
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
