// Planning: today/past/cooked, labels, day panel, move/swap with leftovers, Undo, week arrows and
// glance, filter buttons, "This week" cards, send to list, "Update list" (Planning and Shop), List view, tablet.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

async function open(browser, viewport) {
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    ...(viewport ? { viewport } : {}),
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
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
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
  return { ctx, page };
}
const card = (page, day) => page.locator(`[data-week-day="${day}"]`);
const cardText = async (page, day) => (await card(page, day).innerText()).replace(/\s+/g, ' ').trim();
const openDay = async (page, day) => {
  await card(page, day).locator('button').first().click();
  await page.waitForTimeout(350);
};
const toast = async (page) =>
  (
    await page
      .locator('[data-toast]')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
const weekName = async (page) => (await page.locator('[data-week-name]').innerText()).trim();

(async () => {
  const browser = await chromium.launch();
  const S = reviewSeed();
  const thisId = S.mealPlans[0].id,
    nextId = S.mealPlans[1].id;
  const { page } = await open(browser);
  const dow = new Date('2026-10-18T12:00:00+01:00').getDay();

  // ---------- Week: opens on the right one; arrows ----------
  check(
    (await weekName(page)) === (dow === 0 || dow >= 5 ? 'Next Week' : 'This Week'),
    'opens on next week Fri–Sun, this week Mon–Thu',
    await weekName(page),
  );
  if ((await weekName(page)) === 'Next Week') {
    await page.locator('[data-week-prev]').click();
    await page.waitForTimeout(600);
  }
  check((await weekName(page)) === 'This Week', '‹ goes to This Week');
  await page.screenshot({ path: OUT + '/w1-this-week.png' });

  // ---------- Today, past days, cooked, labels ----------
  const todayDay = await page.locator('[data-week-day][data-today]').getAttribute('data-week-day');
  check(!!todayDay && /today/i.test(await cardText(page, todayDay)), 'today is marked "Today"', todayDay);
  const vis = await page.evaluate((d) => {
    const s = document.querySelector('[data-week-strip]');
    const c = document.querySelector(`[data-week-day="${d}"]`);
    const a = s.getBoundingClientRect(),
      b = c.getBoundingClientRect();
    return b.left >= a.left - 2 && b.right <= a.right + 2;
  }, todayDay);
  check(vis, 'the strip opens scrolled to today');
  check((await card(page, 'Monday').getAttribute('data-past')) === 'true', 'days gone are marked as past');
  check(
    /Cooked/.test(await cardText(page, 'Monday')) &&
      /Cooked/.test(await cardText(page, 'Tuesday')) &&
      !/Cooked/.test(await cardText(page, 'Thursday')),
    'cooked meals show ✓ Cooked',
  );
  check(
    /Leftovers from Mon/.test(await cardText(page, 'Wednesday')),
    'Wednesday: "Leftovers from Mon"',
    await cardText(page, 'Wednesday'),
  );
  check(
    /Cook for 4: leftovers Wed/.test(await cardText(page, 'Monday')),
    'Monday: "Cook for 4: leftovers Wed"',
    await cardText(page, 'Monday'),
  );
  check(
    /Takeaway/.test(await cardText(page, 'Friday')) &&
      /Pizza night/.test(await cardText(page, 'Friday')) &&
      !/Side/.test(await cardText(page, 'Friday')),
    'Friday: Takeaway, its note, no "+ Side"',
    await cardText(page, 'Friday'),
  );
  check((await page.locator('[data-week-strip] [aria-label="Remove meal"]').count()) === 0, 'no bins on the day cards');

  // ---------- Week at a glance ----------
  check(/7 of 7 planned/.test(await page.locator('[data-planned-count]').innerText()), '"7 of 7 planned"');
  await page.locator('[data-glance-day="Monday"]').click();
  await page.waitForTimeout(700);
  check(
    (await page.locator('[data-week-strip]').evaluate((e) => e.scrollLeft)) < 20,
    'tap M jumps the strip to Monday',
  );

  // ---------- Day panel on a sent week: people + notes; then "Update list" ----------
  await openDay(page, 'Thursday');
  check((await page.locator('[data-day-sheet="Thursday"]').count()) === 1, 'tap a day: one panel for it');
  await page.screenshot({ path: OUT + '/w2-day-panel.png' });
  await page.locator('[aria-label="One more person"]').click();
  await page.locator('textarea[aria-label="Notes"]').fill('Use thighs');
  await page.locator('[data-day-done]').click();
  await page.waitForTimeout(500);
  let st = await page.state();
  let thu = st.mealPlans.find((p) => p.id === thisId).days.Thursday.meals[0];
  check(thu.servings === 3 && thu.note === 'Use thighs', 'people and notes saved', JSON.stringify(thu));
  check((await page.getByText('Confirm Plan Change').count()) === 0, 'no "Confirm Plan Change" pop-up on a sent week');
  check(
    (await page.locator('[data-update-list]').count()) === 1 &&
      /1/.test(await page.locator('[data-update-list]').innerText()),
    '"Update list · 1" appears',
  );
  await page.screenshot({ path: OUT + '/w3-update-list.png' });

  // Shop shows it too
  await page.tab('Shop');
  // Shop may show next week by default; switch it to this week via its own week control if needed
  if ((await page.locator('[data-shop-out-of-date]').count()) === 0) {
    await page.tab('Planning');
  } else {
    check(
      /Thursday changed/.test(await page.locator('[data-shop-out-of-date]').innerText()),
      'Shop: "The meal plan has changed · Update list"',
    );
    await page.screenshot({ path: OUT + '/w4-shop-note.png' });
    await page.tab('Planning');
  }
  if ((await weekName(page)) !== 'This Week') {
    await page.locator('[data-week-prev]').click();
    await page.waitForTimeout(500);
  }
  await page.locator('[data-update-list]').click();
  await page.waitForTimeout(600);
  check(
    /Shopping list updated/.test(await toast(page)) && (await page.locator('[data-sent]').count()) === 1,
    'Update list: list rebuilt, button back to "Sent"',
  );

  // ---------- Move and swap with leftovers following ----------
  await openDay(page, 'Monday');
  await page.locator('[data-move-meal]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/w5-move.png' });
  await page.locator('[data-move-to="Tuesday"]').click();
  await page.waitForTimeout(500);
  st = await page.state();
  let days = st.mealPlans.find((p) => p.id === thisId).days;
  check(
    days.Monday.meals[0].recipeId === 'r-salmon' && days.Tuesday.meals[0].recipeId === 'r-bol',
    'swap Monday and Tuesday',
  );
  check(
    /Leftovers from Tue/.test(await cardText(page, 'Wednesday')),
    "Wednesday's leftovers now come from Tuesday",
    await cardText(page, 'Wednesday'),
  );
  check(
    /Swapped Monday and Tuesday/.test(await toast(page)) &&
      (await page.locator('[data-toast-action]').innerText()) === 'Undo',
    'toast offers Undo',
  );
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(500);
  days = (await page.state()).mealPlans.find((p) => p.id === thisId).days;
  check(
    days.Monday.meals[0].recipeId === 'r-bol' && days.Tuesday.meals[0].recipeId === 'r-salmon',
    'Undo puts it back',
  );
  await openDay(page, 'Monday');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-move-to="Thursday"]').click();
  await page.waitForTimeout(500);
  days = (await page.state()).mealPlans.find((p) => p.id === thisId).days;
  check(
    days.Wednesday.meals[0].type === 'recipe' && /Wednesday now cooked fresh/.test(await toast(page)),
    'a leftover day left before its cook becomes a fresh cook, and the toast says so',
    await toast(page),
  );
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(400);

  // ---------- Next week: remove + Undo, move to a free day, panel buttons ----------
  await page.locator('[data-week-next]').click();
  await page.waitForTimeout(600);
  check((await weekName(page)) === 'Next Week', '› goes to Next Week');
  await openDay(page, 'Tuesday');
  await page.locator('[data-remove-meal]').click();
  await page.waitForTimeout(400);
  days = (await page.state()).mealPlans.find((p) => p.id === nextId).days;
  check(
    days.Tuesday.meals.length === 0 && /Removed Aubergine/.test(await toast(page)),
    'Remove (from the panel) with "Removed … · Undo"',
    await toast(page),
  );
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(400);
  days = (await page.state()).mealPlans.find((p) => p.id === nextId).days;
  check(days.Tuesday.meals[0]?.recipeId === 'r-aub', 'Undo brings it back');
  await openDay(page, 'Monday');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-move-to="Sunday"]').click();
  await page.waitForTimeout(400);
  days = (await page.state()).mealPlans.find((p) => p.id === nextId).days;
  check(
    days.Monday.meals.length === 0 &&
      days.Sunday.meals[0]?.recipeId === 'r-fajita' &&
      /Moved to Sunday/.test(await toast(page)),
    'move to a free day',
  );
  await openDay(page, 'Thursday');
  await page.locator('[data-day-sides] button').click();
  await page.waitForTimeout(400);
  check((await page.getByText('Sides for Spaghetti bolognese').count()) === 1, 'Sides from the panel');
  await page.keyboard.press('Escape');
  await page
    .locator('button', { hasText: /^Cancel$/ })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
  await openDay(page, 'Thursday');
  await page.locator('[data-change-meal]').click();
  await page.waitForTimeout(300);
  check((await page.getByText('Select Meal for Thursday').count()) === 1, 'Change meal opens the meal chooser');
  check(
    (await page.getByText('Takeaway', { exact: true }).count()) >= 1 &&
      (await page.getByText('Takeout', { exact: true }).count()) === 0,
    'chooser says Takeaway, not Takeout',
  );
  await page
    .locator('button[aria-label="Close"]')
    .last()
    .click()
    .catch(() => {});
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  await openDay(page, 'Thursday');
  await page.locator('[data-open-recipe]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-recipe-popup] h2').innerText()) === 'Spaghetti bolognese',
    'Open the recipe from the panel',
  );
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.waitForTimeout(300);

  // ---------- Recipes area ----------
  check(
    /This week: Tue/.test(await page.locator('[data-recipe-card="Aubergine & chickpea curry"]').innerText()),
    'cards: "This week: Tue" for the week on screen',
  );
  await page.locator('[data-filter="veggie"]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-recipe-card]').count()) === 2 &&
      /2 of 8 meals/.test(await page.locator('[data-filter-status]').innerText()),
    'filter buttons in the title row (Veggie: 2 of 8)',
  );
  await page.locator('[data-filter="veggie"]').click();
  check((await page.getByRole('button', { name: /Filter meals by options/ }).count()) === 0, 'old Filter menu gone');

  // ---------- Send to the shopping list ----------
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(400);
  check(
    (await page.getByText('Send this week to the shopping list').count()) === 1,
    'the check pop-up says "Send this week to the shopping list"',
  );
  await page.screenshot({ path: OUT + '/w6-send.png' });
  await page
    .locator('button:visible', { hasText: /^Send to shopping list$/ })
    .last()
    .click();
  await page.waitForTimeout(800);
  check(
    /Sent: the ingredients are on the shopping list/.test(await toast(page)) &&
      (await page.locator('[data-toast-action]').innerText()) === 'See the list',
    'sent: a short message with "See the list" (no "Okay" pop-up)',
  );
  check((await page.getByText('Plan Finalized').count()) === 0, 'no "Plan Finalized" pop-up');
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(700);
  check(
    (await page.locator('[data-shop-week-name]').count()) === 1 && (await page.locator('[data-item]').count()) > 0,
    'See the list opens Shop, on the list',
  );
  // Change the sent week, then Shop says so and can update
  await page.tab('Planning');
  if ((await weekName(page)) !== 'Next Week') {
    await page.locator('[data-week-next]').click();
    await page.waitForTimeout(500);
  }
  await openDay(page, 'Tuesday');
  await page.locator('[aria-label="One more person"]').click();
  await page.locator('[data-day-done]').click();
  await page.waitForTimeout(400);
  await page.tab('Shop');
  const note = page.locator('[data-shop-out-of-date]');
  check(
    (await note.count()) === 1 && /Tuesday changed since this list was made/.test(await note.innerText()),
    'Shop: "The meal plan has changed · Update list"',
    (await note.count()) ? await note.innerText() : 'no note',
  );
  await page.screenshot({ path: OUT + '/w4-shop-note.png' });
  await page.locator('[data-shop-update-list]').click();
  await page.waitForTimeout(600);
  check((await page.locator('[data-shop-out-of-date]').count()) === 0, 'Shop: Update list brings it up to date');
  await page.tab('Planning');

  // ---------- List view ----------
  await page.locator('button[title="View options"]').click();
  await page.locator('#planning-view-list').click();
  await page.waitForTimeout(500);
  if ((await weekName(page)) !== 'This Week') {
    await page.locator('[data-week-prev]').click();
    await page.waitForTimeout(500);
  }
  check(
    (await page.locator('[data-list-day][data-today]').count()) === 1 &&
      (await page.locator('[data-list-day="Monday"][data-past]').count()) === 1,
    'List: today highlighted, past days marked',
  );
  check(/Cooked/.test(await page.locator('[data-list-day="Monday"]').innerText()), 'List: ✓ Cooked');
  await page.locator('[data-list-day="Thursday"] button').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-day-sheet="Thursday"]').count()) === 1, 'List: tap a planned day for its panel');
  await page.locator('[data-day-done]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/w7-list.png' });
  await page.locator('button[title="View options"]').click();
  await page.locator('#planning-view-classic').click();
  await page.waitForTimeout(300);

  check(page.errors.length === 0, 'no page errors', page.errors.join(' | '));

  // ---------- Tablet: the whole week fits ----------
  const t = await open(browser, { width: 1024, height: 768 });
  const fits = await t.page.locator('[data-week-strip]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  check(fits, 'tablet: all seven days fit without scrolling');
  await t.page.screenshot({ path: OUT + '/w8-tablet.png' });

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
