// The windows that moved out of the two big screens (Planning and Shop) into their own files:
// each one opened and used, so a slip in the split shows up here.
// Planning: takeaway/no meal with a note, Undo, a freezer batch, "How are you having it?",
// "Remove Leftovers?", the week menu's "Plan the week after", "Add a meal first", the freezer
// corner. Shop: "Less than your meals need", "Bring back…", the products list, a recipe's ingredients.
const { chromium } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500)); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') }); // a Sunday: Planning opens on next week
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  const nextId = S.mealPlans[1].id;
  await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('seeded', '1'); } }, S);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  const tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(700); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const plan = async (id = nextId) => (await state()).mealPlans.find((p) => p.id === id);
  const meal = async (day, id) => (await plan(id)).days[day].meals[0] || null;
  const toast = async () => (await page.locator('[data-toast]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const openDay = async (day) => { await page.locator(`[data-week-day="${day}"] button`).first().click(); await page.waitForTimeout(350); };
  const changeDay = async (day) => { await openDay(day); await page.locator('[data-change-meal]').click(); await page.waitForTimeout(350); };
  const people = Number(S.preferences.defaultServings) || 2;

  await tab('Planning');
  check((await page.locator('[data-week-name]').innerText()).trim() === 'Next Week', 'Planning opens on next week');

  // ---------- Takeaway with a note and people (Sunday is free) ----------
  await page.locator('[data-week-day="Sunday"] button[aria-label="Add a meal on Sunday"]').click(); await page.waitForTimeout(350);
  check(/Select Meal for Sunday/.test(await page.locator('body').innerText()), '"Select meal for Sunday" opens');
  await page.locator('button', { hasText: 'Takeaway' }).filter({ hasText: 'Add note' }).click(); await page.waitForTimeout(300);
  check(!/Select Meal for Sunday/.test(await page.locator('body').innerText()) && /This note will appear in the Cook tab/.test(await page.locator('body').innerText()), 'Takeaway: the picker closes and asks for a note');
  await page.locator('textarea').fill('Curry house');
  await page.locator('button[title="Increase people"]').click();
  await shot('p1-takeaway');
  await page.locator('button', { hasText: /^Add to the week$/ }).click(); await page.waitForTimeout(500);
  let m = await meal('Sunday');
  check(m && m.type === 'takeout' && m.name === 'Takeaway' && m.note === 'Curry house' && m.servings === people + 1, 'Sunday: Takeaway, the note, one more person', JSON.stringify(m));
  check(new RegExp(`Added Takeaway to Sunday for ${people + 1}`).test(await toast()), 'says what was added', await toast());

  // ---------- No meal replaces it; Undo puts it back ----------
  await changeDay('Sunday');
  await page.locator('button', { hasText: 'No Meal' }).filter({ hasText: 'Add note' }).click(); await page.waitForTimeout(300);
  check(!/People/.test(await page.locator('body').innerText()), 'No meal: no people to choose');
  await page.locator('button', { hasText: /^Add to the week$/ }).click(); await page.waitForTimeout(500);
  m = await meal('Sunday');
  check(m && m.type === 'no_meal' && m.servings === 0, 'Sunday: No meal (nobody to cook for)', JSON.stringify(m));
  check(/Replaced Takeaway with No meal on Sunday/.test(await toast()), 'says what it replaced', await toast());
  await page.locator('[data-toast-undo]').click(); await page.waitForTimeout(500);
  m = await meal('Sunday');
  check(m && m.type === 'takeout' && m.note === 'Curry house', 'Undo: the takeaway is back', JSON.stringify(m));

  // ---------- A freezer batch from the picker ----------
  await changeDay('Sunday');
  check(/Freezer Batches/i.test(await page.locator('body').innerText()), 'the picker lists the freezer batches');
  await page.locator('button', { hasText: 'Lentil soup' }).filter({ hasText: 'portions available' }).click(); await page.waitForTimeout(500);
  m = await meal('Sunday');
  check(m && m.type === 'batch' && m.name === 'Batch: Lentil soup' && m.note === 'Heat up a premade batch', 'Sunday: Lentil soup from the freezer', JSON.stringify(m));
  check(!/Select Meal for Sunday/.test(await page.locator('body').innerText()), 'and the picker closes');

  // ---------- "How are you having it?" then "Remove Leftovers?" ----------
  await changeDay('Tuesday');
  check(await page.locator('[data-picker-earlier]', { hasText: 'Chicken fajitas' }).count() === 1, 'Tuesday: Chicken fajitas under "Cooked earlier this week"');
  await page.locator('[data-picker-earlier] button', { hasText: 'Chicken fajitas' }).click(); await page.waitForTimeout(350);
  check(await page.locator('[data-how-question]').count() === 1 && /Leftovers from Monday/.test(await page.locator('[data-how-question]').innerText()), 'asks how: leftovers from Monday');
  check(/Select Meal for Tuesday/.test(await page.locator('body').innerText()), 'the picker stays behind the question');
  await shot('p2-how');
  await page.locator('[data-how="leftover"]').click(); await page.waitForTimeout(500);
  m = await meal('Tuesday');
  check(m && m.type === 'leftover' && m.name === 'Leftovers: Chicken fajitas' && m.note === 'Reheat from Monday', 'Tuesday: leftovers from Monday', JSON.stringify(m));
  check(!/Select Meal for Tuesday/.test(await page.locator('body').innerText()), 'answering closes the picker too');

  await openDay('Monday');
  await page.locator('[data-remove-meal]').click(); await page.waitForTimeout(400);
  const ask = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/Remove Leftovers\?/.test(ask) && /leftovers for Tuesday/.test(ask), 'removing Monday asks about Tuesday\'s leftovers');
  await shot('p3-remove-leftovers');
  await page.locator('button', { hasText: /^Remove Leftovers$/ }).click(); await page.waitForTimeout(500);
  check(!(await meal('Monday')) && !(await meal('Tuesday')), 'Monday and its leftovers on Tuesday both gone');
  check(/Removed, with the leftovers on Tuesday/.test(await toast()), 'says so, with Undo', await toast());
  await page.locator('[data-toast-undo]').click(); await page.waitForTimeout(500);
  check((await meal('Monday'))?.name === 'Chicken fajitas' && (await meal('Tuesday'))?.name === 'Leftovers: Chicken fajitas', 'Undo brings both back');

  // ---------- The freezer corner ----------
  check(/Freezer Status/i.test(await page.locator('body').innerText()) && /5 Meals left/i.test(await page.locator('body').innerText()), 'the freezer corner: 5 meals left');

  // ---------- Week menu: plan the week after; "Add a meal first" ----------
  await page.locator('[data-week-name]').click(); await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'Plan the week after' }).click(); await page.waitForTimeout(600);
  const st = await state();
  const after = st.mealPlans.find((p) => p.startDate === '2026-10-26');
  check(!!after && !/Next Week/.test(await page.locator('[data-week-name]').innerText()), 'the week after is made and shown', await page.locator('[data-week-name]').innerText());
  await page.locator('button[title="Plan at least one meal first"]').click(); await page.waitForTimeout(300);
  check(/Add a meal first/.test(await page.locator('body').innerText()), 'Send to list on an empty week: "Add a meal first"');
  await page.locator('button', { hasText: /^Okay$/ }).click(); await page.waitForTimeout(300);
  check(!/Add a meal first/.test(await page.locator('body').innerText()), 'Okay closes it');
  await page.locator('[data-week-prev]').click(); await page.waitForTimeout(500);

  // ---------- Send next week, then the Shop's windows ----------
  await page.locator('[data-send-to-list]').click(); await page.waitForTimeout(500);
  check(await page.locator('[data-send-breakdown] [data-send-day]').count() === 7, 'Send to list: all seven days shown');
  await page.locator('button', { hasText: /^Send to shopping list$/ }).last().click(); await page.waitForTimeout(900);
  check((await plan()).status === 'finalized', 'next week sent');
  await tab('Shop');
  check((await page.locator('[data-shop-week-name]').innerText()).trim() === 'Next week', 'Shop opens on next week');

  // "Less than your meals need": − on a meal line asks first; Keep, then Use less anyway
  const onion = () => page.locator('[data-item="Onion"] [data-open-item]');
  const onionLines = async () => (await state()).shoppingList.filter((i) => i.planId === nextId && i.name === 'Onion' && !i.isAdhoc);
  const before = (await onionLines())[0];
  await onion().click(); await page.waitForTimeout(400);
  await page.locator('[data-item-sheet] [data-part] [data-less]').first().click(); await page.waitForTimeout(400);
  check(await page.locator('[data-below-needed]').count() === 1, '− below what the meals need asks first');
  await shot('s1-below-needed');
  await page.locator('[data-below-needed] button', { hasText: /^Keep/ }).click(); await page.waitForTimeout(400);
  check((await onionLines())[0].amount === before.amount, 'Keep: the amount stays', JSON.stringify(await onionLines()));
  await page.locator('[data-item-sheet] [data-part] [data-less]').first().click(); await page.waitForTimeout(400);
  await page.locator('[data-below-needed] button', { hasText: 'Use less anyway' }).click(); await page.waitForTimeout(400);
  const less = (await onionLines())[0];
  check(less.amount < before.amount && less.userAdjusted === true, 'Use less anyway: one less, and kept as you set it', JSON.stringify(less));
  await page.locator('[data-item-done]').click(); await page.waitForTimeout(300);

  // Take a meal ingredient off, then "Bring back meal ingredients you removed"
  await onion().click(); await page.waitForTimeout(400);
  await page.locator('[data-remove-item]').click(); await page.waitForTimeout(500);
  check((await onionLines()).length === 0, 'Onion taken off');
  const bringBack = page.locator('button', { hasText: 'Bring back meal ingredients you removed' });
  check(await bringBack.count() === 1, '"Bring back meal ingredients you removed" offered');
  await bringBack.click(); await page.waitForTimeout(600);
  check((await onionLines()).length === 1, 'Onion is back on the list');

  // The products list: type something new and press Enter
  await page.locator('[data-browse-items]').click(); await page.waitForTimeout(500);
  await page.locator('input[placeholder="Search or type new item..."]').fill('Birthday candles');
  await page.locator('input[placeholder="Search or type new item..."]').press('Enter'); await page.waitForTimeout(500);
  const candles = (await state()).shoppingList.find((i) => i.planId === nextId && i.name === 'Birthday candles');
  check(candles && candles.isAdhoc && candles.amount === 1, 'products list: added to next week\'s list', JSON.stringify(candles));

  // A recipe's ingredients (not on the plan)
  await page.locator('[data-add-recipe-ingredients]').click(); await page.waitForTimeout(500);
  await page.locator('[role="button"]', { hasText: 'Cheese omelette' }).first().click(); await page.waitForTimeout(400);
  await shot('s2-recipe-ingredients');
  await page.locator('button', { hasText: /^Add \d+ to the list$/ }).click(); await page.waitForTimeout(600);
  const omelette = (await state()).shoppingList.filter((i) => i.planId === nextId && i.isBatch && i.batchRecipeName === 'Cheese omelette');
  check(omelette.length > 0, "a recipe's ingredients go on as their own lines", omelette.length);
  check(/for Cheese omelette/.test((await page.locator('[data-shop-toast]').innerText().catch(() => '')).replace(/\s+/g, ' ')), 'and it says so');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log('\nall passed');
})().catch((e) => { console.error(e); process.exit(1); });
