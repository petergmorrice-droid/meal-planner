// Who changed it: Peter blue, Rachel pink — shopping list (added by you, notes, who ticked), meals, freezer.
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
  await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, S);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(600);
  };
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const iAm = async (who) => {
    await tab('Settings');
    await page.locator('[data-segmented="who"] button', { hasText: who }).click();
    await page.waitForTimeout(300);
  };
  const add = async (t) => {
    await page.locator('[data-quick-add]').fill(t);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    await page.locator('[data-quick-add]').blur();
    await page.waitForTimeout(250);
  };
  const cls = (loc) =>
    loc
      .first()
      .getAttribute('class')
      .catch(() => '');

  await iAm('Peter');
  await tab('Shop');
  // ---------- Added by you: who last added or changed it ----------
  await add('2 pints milk');
  check(
    (await page.locator('[data-item="Milk"] [data-person-mark="P"]').count()) === 1,
    'Peter adds milk: a blue P tick on the row',
  );
  check(/bg-blue-100/.test(await cls(page.locator('[data-item="Milk"] [data-person-mark]'))), 'blue');
  // Peter's note
  await page.locator('[data-item="Milk"] [data-open-item]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-item-sheet] [data-part] [data-person-mark="P"]').count()) === 1,
    'panel: "Added by you" with the blue P',
  );
  await page.locator('[data-item-note]').fill('semi-skimmed');
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(400);
  check(
    /text-blue-800/.test(await cls(page.locator('[data-item="Milk"] [data-item-note-line]'))),
    "Peter's note is blue",
  );
  await shot('p1-peter');
  // Rachel adds more and ticks something
  await iAm('Rachel');
  await tab('Shop');
  await add('milk');
  check(
    (await page.locator('[data-item="Milk"] [data-person-mark="R"]').count()) === 1 &&
      /bg-pink-100/.test(await cls(page.locator('[data-item="Milk"] [data-person-mark]'))),
    'Rachel adds more: the tick turns pink (R)',
  );
  check(
    /text-blue-800/.test(await cls(page.locator('[data-item="Milk"] [data-item-note-line]'))),
    "the note is still Peter's (blue)",
  );
  await page.locator('[data-item="Bananas"] [data-tick]').click();
  await page.waitForTimeout(400);
  let st = await state();
  const milk = st.shoppingList.filter((i) => i.name === 'Milk' && i.isAdhoc && !i.isRecurring);
  check(
    milk.length === 1 && milk[0].editedBy === 'R' && milk[0].noteBy === 'P',
    'saved: added/changed by Rachel, note by Peter (syncs with it)',
    JSON.stringify(milk.map((m) => [m.editedBy, m.noteBy])),
  );
  // (i): the lines in their colours
  await page.locator('[data-item="Milk"] [data-item-info]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-item-info-sheet] [data-info-who="R"]').count()) >= 1 &&
      (await page.locator('[data-item-info-sheet] [data-info-who="P"]').count()) >= 1,
    "(i): Rachel's line pink, Peter's note blue",
  );
  await shot('p2-info');
  await page.locator('[data-item-info-close]').click();
  await page.waitForTimeout(300);
  await shot('p2b-rachel-list');

  // ---------- Who ticked it, in shopping mode (Peter's phone sees Rachel's tick in pink) ----------
  await iAm('Peter');
  await tab('Shop');
  await page.locator('#btn-go-shopping').click();
  await page.waitForTimeout(700);
  await page.locator('[data-aisle-header="Fresh Produce"]').click();
  await page.waitForTimeout(300); // finished aisles fold away
  const tickedBy = page.locator('[data-ticked-by]').first();
  check(
    /Rachel/.test(await tickedBy.innerText().catch(() => '')) && /bg-pink-100/.test(await cls(tickedBy)),
    'shopping mode: "✓ Rachel" in pink',
  );
  check(
    (await page.locator('[data-row] [data-person-mark="R"]').count()) >= 1,
    'shopping mode rows show the pink R too',
  );
  await shot('p3-shopping-mode');
  await page.locator('[aria-label="Leave shopping mode"]').click();
  await page.waitForTimeout(500);

  // ---------- Meals: who last changed each day; notes in the writer's colour ----------
  await iAm('Rachel');
  await tab('Cook');
  await page.locator('[data-cook-add-note="Thursday"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-note-input]').fill('make extra rice');
  await page.locator('[data-note-save]').click();
  await page.waitForTimeout(500);
  const thu = page.locator('[data-cook-row="Thursday"]');
  check(
    (await thu.locator('[data-person-mark="R"]').count()) === 1,
    "Cook: Thursday shows Rachel's pink tick (she changed it)",
  );
  check(/text-pink-800/.test(await cls(thu.locator('[data-cook-note]'))), "Cook: Rachel's note is pink");
  check(
    (await page.locator('[data-cook-row="Friday"] [data-person-mark]').count()) === 0,
    'a day nobody has changed since: no tick',
  );
  await shot('p4-cook');
  st = await state();
  const thuDay = st.mealPlans.find((p) => p.days?.Thursday?.meals?.[0]?.note === 'make extra rice')?.days.Thursday;
  check(
    thuDay && thuDay.updatedBy === 'R' && thuDay.meals[0].noteBy === 'R',
    'saved with the day (syncs with it)',
    JSON.stringify(thuDay),
  );
  await tab('Planning');
  const planMark = await page
    .locator('[data-week-day="Thursday"] [data-person-mark="R"], [data-list-day="Thursday"] [data-person-mark="R"]')
    .count();
  check(planMark === 1, 'Planning: Thursday has the pink R too');
  await shot('p5-planning');

  // ---------- Freezer: who last changed it, notes ----------
  await tab('Freezer');
  const first = page.locator('[data-freezer-item]').first();
  const fname = await first.getAttribute('data-freezer-item');
  await first.locator('[data-freezer-open]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-sheet-note]').first().fill('garage freezer');
  await page.locator('[data-sheet-note]').first().blur();
  await page.waitForTimeout(400);
  await page
    .locator('[data-sheet-done]')
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);
  const card = page.locator(`[data-freezer-item="${fname}"]`);
  check((await card.locator('[data-person-mark="R"]').count()) === 1, `Freezer: ${fname} shows Rachel's pink tick`);
  check(
    /text-pink-800/.test(await cls(card.locator('[data-freezer-note]'))) &&
      /garage freezer/.test(await card.innerText()),
    "Freezer: Rachel's note shows, in pink",
  );
  await shot('p6-freezer');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
