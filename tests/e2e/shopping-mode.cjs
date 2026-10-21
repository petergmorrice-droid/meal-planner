// Shopping mode: tidier header, undo last, aisles fold, out of stock, ticked by, reopen, no signal,
// milestones, personal best, history, learned route.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  const nextId = S.mealPlans[1].id;
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
    window.__buzz = 0;
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        window.__buzz++;
        return true;
      },
      configurable: true,
    });
  }, S);
  const page = await ctx.newPage();
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
  const sub = async () =>
    (
      await page
        .locator('[data-shop-mode-sub]')
        .innerText()
        .catch(() => '')
    ).trim();
  const percent = async () => (await page.locator('[data-percent]').innerText()).trim();
  const row = (name) => page.locator('[data-row]', { hasText: name }).first();
  const hold = async (name) => {
    await row(name).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await row(name).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  // Send next week, then go shopping
  await tab('Planning');
  const dow = new Date('2026-10-18T12:00:00+01:00').getDay();
  if (!(dow === 0 || dow >= 5)) {
    await page.locator('[data-week-next]').click();
    await page.waitForTimeout(400);
  }
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(800);
  await page
    .locator('button', { hasText: /^Send to shopping list$/ })
    .last()
    .click();
  await page.waitForTimeout(900);
  await tab('Shop');
  await page.locator('#btn-go-shopping').click();
  await page.waitForTimeout(700);

  // ---------- Tidier header: week + count in the green bar; filters in the menu ----------
  const total = await page.locator('[data-row]').count();
  check(/^Next week · 0 of \d+ ticked$/.test(await sub()), 'header: "Next week · 0 of N items ticked"', await sub());
  check((await page.locator('[data-filter]').count()) === 0, 'no All / To buy / Bought tabs on the screen');
  await page.locator('#btn-shopping-mode-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('[data-filter="to_buy"]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-filter-note]').count()) === 1,
    'filter chosen from the menu, with a "Show all" note',
  );
  await page.locator('[data-filter-note] button').click();
  await page.waitForTimeout(250);
  await shot('m1-header');

  // ---------- Undo the last tick from the bottom bar, even after it has moved ----------
  const firstName = (await page.locator('[data-row]').first().innerText()).split('\n')[0].trim();
  await page.locator('[data-row]').first().click();
  await page.waitForTimeout(4700);
  check(
    /Undo/.test(await page.locator('[data-undo-last]').innerText()) &&
      (await page.locator('[data-undo-last]').innerText()).includes(firstName),
    `bottom bar: "Undo ${firstName}"`,
  );
  await page.locator('[data-undo-last]').click();
  await page.waitForTimeout(400);
  check(
    (await percent()) === '0%' && (await page.locator('[data-undo-last]').count()) === 0,
    'undo after it moved: back to 0%',
  );

  // ---------- Finished aisles fold away; milestone at 25% ----------
  const produce = page.locator('[data-aisle="produce"] [data-row]');
  const nProduce = await produce.count();
  for (let i = 0; i < nProduce; i++) {
    await produce.nth(i).click();
    await page.waitForTimeout(120);
  }
  const ms = await page
    .locator('[data-milestone]')
    .innerText()
    .catch(() => '');
  check(nProduce / total < 0.5 && /A quarter done!/.test(ms), `milestone in the header: "${ms}"`, ms);
  check((await page.evaluate(() => window.__buzz)) >= 1, 'a buzz on phones that can');
  await shot('m2-milestone');
  await page.waitForTimeout(4700);
  check(
    (await page.locator('[data-aisle="produce"][data-aisle-done]').count()) === 1 && (await produce.count()) === 0,
    'Fresh Produce done: folded away to one line',
  );
  check(
    /done/.test(await page.locator('[data-aisle="produce"] [data-aisle-header]').innerText()),
    'its header says done',
  );
  await shot('m3-folded');
  await page.locator('[data-aisle="produce"] [data-aisle-header]').click();
  await page.waitForTimeout(300);
  check((await produce.count()) === nProduce, 'tap to open it again');
  await page.locator('[data-aisle="produce"] [data-aisle-header]').click();
  await page.waitForTimeout(300);

  // ---------- Out of stock: press and hold ----------
  const beforePct = await percent();
  await hold('Soured Cream');
  check(
    (await row('Soured Cream').locator('[data-out-of-stock]').count()) === 1,
    'press and hold: Soured Cream out of stock',
  );
  check(
    new RegExp(`of ${total - 1} ticked`).test(await sub()),
    "out of stock doesn't count against the %",
    (await sub()) +
      ' / total ' +
      total +
      ' / milestone ' +
      (await page
        .locator('[data-milestone]')
        .innerText()
        .catch(() => '')),
  );
  check(
    /Undo out of stock: Soured Cream/.test(await page.locator('[data-undo-last]').innerText()),
    'bottom bar can undo it',
  );
  let st = await state();
  check(
    st.shoppingList.some((i) => i.planId === nextId && i.name === 'Soured Cream' && i.outOfStock && !i.checked),
    'saved (the other phone sees it)',
  );
  await page.locator('[data-undo-last]').click();
  await page.waitForTimeout(300);
  check(
    (await row('Soured Cream').locator('[data-out-of-stock]').count()) === 0 && (await percent()) === beforePct,
    'undo: back on the list',
  );
  await hold('Soured Cream');
  await row('Soured Cream').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    st.shoppingList.some((i) => i.planId === nextId && i.name === 'Soured Cream' && i.checked && !i.outOfStock),
    'tapping an out-of-stock item ticks it (there after all)',
  );
  await hold('Parmesan');
  await shot('m4-out-of-stock');

  // ---------- Ticked by the other phone; reopens into shopping mode ----------
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('mealPlannerAppStateCache'));
    s.shoppingList = s.shoppingList.map((i) =>
      i.planId === id && i.name === 'Cheddar Cheese' ? { ...i, checked: true, checkedBy: 'R' } : i,
    );
    localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
  }, nextId);
  await page.reload();
  await page.waitForTimeout(1800);
  check(
    (await page.locator('[data-done-shopping]').count()) === 1,
    'reopening the app goes straight back into shopping mode',
  );
  check(
    /✓ Rachel/.test(await row('Cheddar Cheese').innerText()),
    'Cheddar shows "✓ Rachel" (ticked on her phone)',
    await row('Cheddar Cheese').innerText(),
  );
  check(
    (await row('Parmesan').locator('[data-out-of-stock]').count()) === 1,
    'out of stock is still marked after reopening',
  );

  // ---------- No signal ----------
  await ctx.setOffline(true);
  await page.waitForTimeout(400);
  check((await page.locator('[data-offline]').count()) === 1, 'no signal: a note says ticks are saved');
  await shot('m5-offline');
  await ctx.setOffline(false);
  await page.waitForTimeout(400);
  check((await page.locator('[data-offline]').count()) === 0, 'back online: the note goes');

  // ---------- Done shopping: out of stock not moved unless asked; history; best; route ----------
  await page.evaluate((id) => localStorage.setItem('shop_started_' + id, String(Date.now() - 23 * 60000)), nextId);
  await page.locator('[data-done-shopping]').click();
  await page.waitForTimeout(400);
  const doneOut = await page.locator('[data-done-out]').innerText();
  check(
    /Out of stock:\s*Parmesan/.test(doneOut) && !(await page.locator('[data-done-out-next]').isChecked()),
    'Done: Parmesan listed as out of stock, not ticked to move',
    doneOut,
  );
  check(
    /first timed shop|personal best/i.test(
      await page
        .locator('[data-done-best]')
        .innerText()
        .catch(() => ''),
    ),
    'first timed shop is the time to beat',
  );
  await shot('m6-done');
  await page.locator('[data-done="move"]').click();
  await page.waitForTimeout(800);
  st = await state();
  const following = st.mealPlans.find((p) => p.startDate > S.mealPlans[1].startDate);
  check(
    !!following && st.shoppingList.some((i) => i.planId === following.id && i.name === 'Kidney Beans'),
    'not-ticked things moved to the following week',
  );
  check(
    st.shoppingList.some((i) => i.planId === nextId && i.name === 'Parmesan' && i.outOfStock) &&
      !st.shoppingList.some((i) => i.planId === following.id && i.name === 'Parmesan'),
    "Parmesan (out of stock) stays on this week's list, not moved",
  );
  const h = st.preferences.shopHistory || [];
  check(
    h.length === 1 && h[0].minutes === 23 && h[0].by === 'P',
    'shop saved to history: 23 min, by Peter',
    JSON.stringify(h),
  );
  check(
    st.preferences.shopRoute && st.preferences.shopRoute.shops === 1 && st.preferences.shopRoute.aisles.produce === 0,
    'route learned: produce first',
    JSON.stringify(st.preferences.shopRoute && st.preferences.shopRoute.aisles),
  );
  check((await page.locator('[data-done-shopping]').count()) === 0, 'back on the list');
  check(
    (await page.locator('[data-group="out-of-stock"] [data-item="Parmesan"]').count()) === 1,
    'the list shows Parmesan under "Out of stock"',
  );
  await page.reload();
  await page.waitForTimeout(1500);
  check(
    (await page.locator('[data-done-shopping]').count()) === 0,
    'finished: reopening does not go back into shopping mode',
  );

  // ---------- Past shops ----------
  await tab('Shop');
  await page.locator('#btn-shop-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-shop-history').click();
  await page.waitForTimeout(400);
  const hist = await page.locator('[data-history-sheet]').innerText();
  check(
    /23 min/.test(hist) && /Peter/.test(hist),
    'Past shops lists it: Peter, 23 min',
    hist.replace(/\s+/g, ' ').slice(0, 200),
  );
  await shot('m7-history');
  await page.locator('[data-history-sheet] button[aria-label="Close"]').click();
  await page.waitForTimeout(300);

  // ---------- Arrange aisles says the order was learned ----------
  await page.locator('#btn-shop-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-arrange-aisles').click();
  await page.waitForTimeout(400);
  check(
    /learned from 1 shop/.test(
      await page
        .locator('[data-learned-note]')
        .innerText()
        .catch(() => ''),
    ),
    'Arrange aisles: "learned from 1 shop"',
  );
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
