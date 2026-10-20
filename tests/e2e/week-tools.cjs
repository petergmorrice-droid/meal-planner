// "Next" update, end to end: one-tap meals, copy a week, cupboard check, compact rows, aisle order.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed, iso, mondayOf } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 400)); if (!ok) failures++; };

function seed() {
  const s = reviewSeed();
  s.preferences.defaultServings = 3;
  const next = s.mealPlans[1];
  // An empty week after next, for "Copy a week"
  const m = new Date(next.startDate + 'T00:00:00'); m.setDate(m.getDate() + 7);
  const days = {};
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((d, i) => { const x = new Date(m); x.setDate(m.getDate() + i); days[d] = { date: iso(x), meals: [] }; });
  s.mealPlans.push({ id: `plan-${iso(m)}`, startDate: iso(m), days, status: 'draft', isCurrent: false, lastModifiedAt: 1 });
  // Extra milk added by hand, next to the weekly staple milk
  s.shoppingList.push({ id: 'adhoc-milk', name: 'Milk', amount: 2, unit: 'pints', category: 'Dairy', checked: false, isAdhoc: true, planId: next.id });
  return s;
}

async function open(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('seeded', '1'); } }, seed());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  page.tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(700); };
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const S = seed();
  const nextId = S.mealPlans[1].id, laterId = S.mealPlans[2].id;

  // ---------- 1. Add a meal in one tap ----------
  {
    const { ctx, page } = await open(browser);
    await page.tab('Planning');
    await page.locator('[data-week-strip] [aria-label^="Add a meal on"]').first().click(); await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + '/n1-picker.png' });
    await page.locator('button:visible', { hasText: /^Cheese omelette/ }).first().click(); await page.waitForTimeout(400);
    const toast = await page.body();
    check(/Added Cheese omelette to Sunday for 3/.test(toast), 'toast: "Added Cheese omelette to Sunday for 3"', (toast.match(/Added[^.]{0,60}/) || ['none'])[0]);
    await page.waitForTimeout(500);
    const dialogs = await page.locator('button:visible', { hasText: /Save Sides|^Done$/ }).count();
    check(dialogs === 0, 'no sides or people dialog after picking the recipe', dialogs + ' dialog buttons');
    const st = await page.state();
    const sun = st.mealPlans.find((p) => p.id === nextId).days.Sunday.meals;
    check(sun.length === 1 && sun[0].name === 'Cheese omelette' && sun[0].servings === 3, 'meal saved for your usual 3 people', JSON.stringify(sun));
    await page.screenshot({ path: OUT + '/n1-added.png' });
    // People and sides can still be changed from the card
    check(/\b3\b/.test(await page.locator('[data-week-day="Sunday"]').innerText()), 'the day card shows 3 people');
    check(page.errors.length === 0, 'no page errors (planning)', page.errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. Copy a week ----------
  {
    const { ctx, page } = await open(browser);
    await page.tab('Planning');
    // switch to the empty week after next
    await page.locator('button', { hasText: /^Next Week$/ }).first().click().catch(() => {});
    await page.locator('div.absolute button', { hasText: /0 meals planned/ }).first().click(); await page.waitForTimeout(600);
    const copyBtn = page.locator('button:visible', { hasText: /^Copy a week$/ });
    check(await copyBtn.count() === 1, '"Copy a week" shown on an empty week');
    await copyBtn.click(); await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '/n2-copy-dialog.png' });
    const dlg = page.locator('[role="dialog"][aria-label="Copy a week"]');
    const options = await dlg.locator('button').evaluateAll((bs) => bs.map((b) => b.innerText.split('\n')[0]).filter(Boolean));
    check(options.includes('This Week') && options.includes('Next Week'), 'dialog lists the weeks with meals', JSON.stringify(options));
    await dlg.locator('button', { hasText: /^This Week/ }).first().click(); await page.waitForTimeout(600);
    let st = await page.state();
    const src = st.mealPlans.find((p) => p.id === S.mealPlans[0].id);
    const dst = st.mealPlans.find((p) => p.id === laterId);
    const names = (p) => Object.values(p.days).flatMap((d) => d.meals.map((m) => m.name));
    check(JSON.stringify(names(dst)) === JSON.stringify(names(src)), 'all 7 meals copied day by day', JSON.stringify(names(dst)));
    const dstMeals = Object.values(dst.days).flatMap((d) => d.meals);
    check(dstMeals.every((m) => !m.cooked), 'copied meals are not marked cooked');
    check(dstMeals.every((m) => !Object.values(src.days).flatMap((d) => d.meals).some((s) => s.id === m.id)), 'copied meals get their own ids');
    check(dst.id === laterId && dst.status === 'draft', 'same week, still a draft');
    // Replacing a week that already has meals asks first
    await page.locator('button', { hasText: /Week|Oct|Nov/ }).filter({ has: page.locator('svg.lucide-chevron-down') }).first().click(); await page.waitForTimeout(400);
    await page.locator('button:visible', { hasText: /^Copy meals from another week$/ }).click(); await page.waitForTimeout(400);
    await page.locator('[role="dialog"] button', { hasText: /^Next Week/ }).first().click(); await page.waitForTimeout(400);
    const confirmText = await page.body();
    check(/Replace this week's meals\?/.test(confirmText) && /The 7 meals planned/.test(confirmText), 'asks before replacing 7 planned meals');
    await page.screenshot({ path: OUT + '/n2-replace.png' });
    await page.locator('[role="dialog"] button', { hasText: /^Replace$/ }).click(); await page.waitForTimeout(600);
    st = await page.state();
    check(JSON.stringify(names(st.mealPlans.find((p) => p.id === laterId))) === JSON.stringify(names(st.mealPlans.find((p) => p.id === nextId))), 'replaced with next week\'s meals');
    check(page.errors.length === 0, 'no page errors (copy)', page.errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3-5. Shop: cupboard check, compact rows, aisle order, grouped ticks ----------
  {
    const { ctx, page } = await open(browser);
    await page.tab('Planning');
    await page.locator('[data-send-to-list]').click(); await page.waitForTimeout(700);
    await page.locator('button:visible', { hasText: /^Send to shopping list$/ }).last().click(); await page.waitForTimeout(1200);
    await page.tab('Shop');
    await page.screenshot({ path: OUT + '/n3-shop.png' });
    let body = await page.body();
    const m = body.match(/(\d+) items? you may already have/);
    const n = m ? +m[1] : 0;
    check(n >= 5, 'cupboard card: items you may already have', body.slice(0, 300));
    await page.locator('#btn-cupboard-check').click(); await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '/n3-cupboard.png' });
    const rows = await page.locator('[data-cupboard-row]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-cupboard-row')));
    console.log('     cupboard rows:', JSON.stringify(rows));
    const answer = async (name, which) => page.locator(`[data-cupboard-row="${name}"] button`, { hasText: new RegExp('^' + which + '$') }).click();
    await answer('Ground Cumin', 'Have it'); await page.waitForTimeout(250);
    await answer('Chilli Powder', 'Have it'); await page.waitForTimeout(250);
    await answer('Basmati Rice', 'Need it'); await page.waitForTimeout(250);
    body = await page.body();
    check(/3 of \d+ checked · 2 off the list/.test(body), 'sheet shows progress "3 of N checked · 2 off the list"', (body.match(/\d+ of \d+ checked[^D]*/) || [''])[0]);
    // change of mind inside the sheet
    await answer('Chilli Powder', 'Have it'); await page.waitForTimeout(250);
    await answer('Chilli Powder', 'Have it'); await page.waitForTimeout(250);
    await page.locator('[role="dialog"] button', { hasText: /^Done$/ }).click(); await page.waitForTimeout(500);
    let st = await page.state();
    const item = (name) => st.shoppingList.filter((i) => i.planId === nextId && i.name === name);
    check(item('Ground Cumin').every((i) => i.cupboard === 'have') && item('Basmati Rice').every((i) => i.cupboard === 'need'), 'answers saved on the items (shared with the other phone)');
    check(item('Chilli Powder').every((i) => i.cupboard === 'have'), 'tapping again toggles, last answer kept');
    body = await page.body();
    check(new RegExp(`${n - 3} items? you may already have`).test(body), `card now shows ${n - 3} left to check`);
    check(/Already in the cupboard\s*2/i.test(body), '"Already in the cupboard 2" section');
    await page.screenshot({ path: OUT + '/n3-after-check.png' });

    // Shopping mode: compact rows by default; cupboard items gone
    await page.locator('#btn-go-shopping').click(); await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '/n4-shopping-compact.png' });
    body = await page.body();
    check(!/Ground Cumin/.test(body) && !/Chilli Powder/.test(body), 'items you have are not in shopping mode');
    check(new RegExp(`${n - 3} cupboard items? to check`).test(body), 'shopping mode reminds about the rest');
    const compactRows = page.locator('[data-row="compact"]');
    const count = await compactRows.count();
    const heights = await compactRows.evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect().height));
    const visible = await compactRows.evaluateAll((xs) => xs.filter((x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length);
    check(count > 20 && Math.max(...heights) <= 60 && Math.min(...heights) >= 44, `compact rows: ${count} rows, ${Math.round(Math.min(...heights))}-${Math.round(Math.max(...heights))}px tall`);
    const screens = await page.evaluate(() => { const el = [...document.querySelectorAll('div.overflow-y-auto')].find((d) => d.querySelector('[data-row]')); return el.scrollHeight / el.clientHeight; });
    check(screens <= 4.5, `(with the Done shopping bar) whole list is ${screens.toFixed(1)} screens of scrolling (${visible} rows on the first screen)`);
    const riceRow = page.locator('[data-row="compact"]', { hasText: 'Basmati Rice' });
    check(await riceRow.count() === 1 && !(await riceRow.innerText()).includes('cupboard'), 'rice (Need it) shows without the cupboard label');
    // Grouped item ticks fully in the aisle view (bug fix)
    await page.locator('button[aria-label="Mark Milk as bought"]').first().click(); await page.waitForTimeout(3500);
    st = await page.state();
    const milk = st.shoppingList.filter((i) => i.planId === nextId && i.name === 'Milk');
    check(milk.length === 2 && milk.every((i) => i.checked), 'ticking Milk ticks both the staple and the extra milk', JSON.stringify(milk.map((i) => [i.id, i.checked])));
    // Detailed rows switch
    await page.locator('#btn-shopping-mode-view-options').click(); await page.waitForTimeout(300);
    await page.locator('#toggle-compact-rows').uncheck(); await page.waitForTimeout(400);
    check(await page.locator('[data-row="compact"]').count() === 0, 'detailed rows when compact is switched off');
    const screensDetailed = await page.evaluate(() => { const el = [...document.querySelectorAll('div.overflow-y-auto')].find((d) => d.querySelector('button[aria-label^="Mark "]')); return el.scrollHeight / el.clientHeight; });
    console.log(`     detailed rows: ${screensDetailed.toFixed(1)} screens`);
    await page.screenshot({ path: OUT + '/n4-shopping-detailed.png' });
    await page.reload(); await page.waitForTimeout(1500);
    check(await page.evaluate(() => localStorage.getItem('shop_compact_rows')) === '0', 'row choice remembered on this phone');
    await page.evaluate(() => localStorage.setItem('shop_compact_rows', '1'));
    await page.reload(); await page.waitForTimeout(1500);
    // Mid-shop, the app reopens in shopping mode; leave it
    check(await page.locator('#btn-exit-shopping-mode').count() === 1, 'reopened straight into shopping mode');
    await page.locator('#btn-exit-shopping-mode').click(); await page.waitForTimeout(400);

    // Undo a "have it"
    await page.tab('Shop');
    await page.locator('button', { hasText: /Already in the cupboard/ }).click(); await page.waitForTimeout(300);
    await page.locator('li', { hasText: 'Ground Cumin' }).locator('button', { hasText: 'Need it after all' }).click(); await page.waitForTimeout(500);
    st = await page.state();
    check(st.shoppingList.filter((i) => i.planId === nextId && i.name === 'Ground Cumin').every((i) => i.cupboard === 'need'), '"Need it after all" puts cumin back on the list');

    // Aisle order
    await page.locator('#btn-shop-view-options').click(); await page.waitForTimeout(300);
    await page.locator('#btn-arrange-aisles').click(); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/n5-aisles.png' });
    await page.locator('button[aria-label="Move Meat & Seafood earlier"]').click(); await page.waitForTimeout(150);
    await page.locator('button[aria-label="Move Meat & Seafood earlier"]').click(); await page.waitForTimeout(150);
    await page.locator('[role="dialog"] button', { hasText: /^Save order$/ }).click(); await page.waitForTimeout(500);
    st = await page.state();
    check(Array.isArray(st.preferences.aisleOrder) && st.preferences.aisleOrder[0] === 'meat_seafood', 'aisle order saved in shared settings', JSON.stringify(st.preferences.aisleOrder));
    await page.locator('#btn-go-shopping').click(); await page.waitForTimeout(700);
    const firstAisle = await page.locator('[data-aisle-header]').first().getAttribute('data-aisle-header');
    check(firstAisle.trim() === 'Meat & Seafood', 'shopping mode starts with Meat & Seafood', firstAisle);
    await page.screenshot({ path: OUT + '/n5-shopping-aisles.png' });
    await page.locator('#btn-exit-shopping-mode').click(); await page.waitForTimeout(400);
    await page.locator('#btn-shop-view-options').click(); await page.waitForTimeout(300);
    await page.locator('#btn-arrange-aisles').click(); await page.waitForTimeout(300);
    await page.locator('[role="dialog"] button', { hasText: /^Usual order$/ }).click();
    await page.locator('[role="dialog"] button', { hasText: /^Save order$/ }).click(); await page.waitForTimeout(500);
    st = await page.state();
    check(!st.preferences.aisleOrder, 'back to the usual order');
    check(page.errors.length === 0, 'no page errors (shop)', page.errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
