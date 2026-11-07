// Leftovers carried over from Sunday into next week: Sunday's cook on Tuesday next week is offered as
// "Leftovers from Sunday"; next week's list has nothing for it, this week's buys for it ("Update list"
// appears there); the Cook tab says so; removing Sunday asks about Tuesday, moving it to Saturday
// cooks Tuesday fresh, and Undo puts back both weeks.
const { chromium, goTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 400));
  if (!ok) failures++;
};

// This week (12–18 Oct) was sent to the list, with a record of what it was made from.
function seed() {
  const s = reviewSeed();
  const sig = (m) => [m.type, m.recipeId || (m.name || '').toLowerCase(), m.servings || 0, ''].join('|');
  const snap = {};
  for (const [d, dp] of Object.entries(s.mealPlans[0].days)) snap[d] = (dp.meals || []).map(sig).join('+');
  s.mealPlans[0].lastFinalizedSnapshot = JSON.stringify(snap);
  return s;
}

async function open(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
  // Sunday 18 Oct: the sausage & mash is tonight, and Planning opens on next week.
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.tab = async (n) => {
    await goTab(page, n);
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
  const S = seed();
  const thisId = S.mealPlans[0].id;
  const nextId = S.mealPlans[1].id;
  const { page } = await open(browser);
  const days = async (id) => (await page.state()).mealPlans.find((p) => p.id === id).days;
  const listFor = async (id) => (await page.state()).shoppingList.filter((i) => i.planId === id);
  const forSausage = (lines) => lines.filter((i) => (i.recipeNames || []).includes('Sausage & mash'));

  await page.tab('Planning');
  check((await weekName(page)) === 'Next Week', 'Planning opens on next week', await weekName(page));

  // ---------- Next week: Sunday's sausage & mash onto Tuesday ----------
  await page
    .locator('[draggable="true"]', { hasText: 'Sausage & mash' })
    .first()
    .dragTo(page.locator('[data-drop-day="Tuesday"]'));
  await page.waitForTimeout(600);
  const how = (
    await page
      .locator('[data-how-question]')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  check(
    /Leftovers from Sunday/.test(how) && /Cook extra on Sun 18 Oct/.test(how),
    'asks how: offers leftovers from last Sunday, by its date',
    how,
  );
  check((await page.locator('[data-how-last-week]').count()) === 1, 'the leftovers choice is from last week');
  await page.screenshot({ path: OUT + '/co1-how.png' });
  await page.locator('[data-how="leftover"]').click();
  await page.waitForTimeout(600);
  let tue = (await days(nextId)).Tuesday.meals[0];
  check(
    tue?.type === 'leftover' && tue.recipeId === 'r-sausage' && tue.note === 'Reheat from Sunday',
    'Tuesday saved as leftovers, reheated from Sunday',
    JSON.stringify(tue),
  );
  check(/Leftovers from Sun/.test(await cardText(page, 'Tuesday')), 'Tuesday card: Leftovers from Sun');

  // Moving another meal next week keeps them as leftovers
  await openDay(page, 'Monday');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-move-to="Sunday"]').click();
  await page.waitForTimeout(500);
  tue = (await days(nextId)).Tuesday.meals[0];
  check(tue?.type === 'leftover' && !/cooked fresh/.test(await toast(page)), 'a move next week keeps them leftovers');

  // Sent to the list: nothing to buy for Tuesday
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(500);
  const sendDay = (await page.locator('[data-send-day="Tuesday"]').innerText()).replace(/\s+/g, ' ');
  check(/Leftovers from Sun/.test(sendDay), 'send window: Tuesday is leftovers from Sun', sendDay);
  await page.locator('[data-send-confirm]').click();
  await page.waitForTimeout(700);
  const nextLines = await listFor(nextId);
  check(
    nextLines.length > 0 && forSausage(nextLines).length === 0,
    "next week's list has nothing for Tuesday",
    JSON.stringify(forSausage(nextLines).map((i) => i.name)),
  );

  // ---------- This week: Sunday buys for Tuesday ----------
  await page.locator('[data-week-prev]').click();
  await page.waitForTimeout(600);
  check((await weekName(page)) === 'This Week', '‹ goes to This Week');
  const sun = await cardText(page, 'Sunday');
  check(/Cook for 4/.test(sun) && /Tue 20 Oct/.test(sun), 'Sunday: Cook for 4, leftovers Tue 20 Oct', sun);
  check((await page.locator('[data-update-list]').count()) === 1, '"Update list" appears on this week');
  await page.screenshot({ path: OUT + '/co2-this-week.png' });
  await page.locator('[data-update-list]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-send-confirm]').click();
  await page.waitForTimeout(700);
  const sausages = forSausage(await listFor(thisId)).find((i) => /sausage/i.test(i.name));
  // The recipe is 8 sausages for 4: Sunday's 2 people and Tuesday's 2 (bought in packs).
  check(sausages?.neededText === '8', "this week's list: sausages for 4 (8)", JSON.stringify(sausages));
  check((await page.locator('[data-update-list]').count()) === 0, 'Update list done');

  // ---------- Cook tab: tonight cooks for 4 ----------
  await page.tab('Cook');
  const extra = (
    await page
      .locator('[data-cook-row="Sunday"] [data-cook-extra]')
      .innerText()
      .catch(() => '')
  ).trim();
  check(extra === 'Cook for 4 (2 for Tue 20 Oct)', 'Cook: Cook for 4 (2 for Tue 20 Oct)', extra);
  await page.screenshot({ path: OUT + '/co3-cook.png' });

  // ---------- Removing Sunday asks about Tuesday; Undo puts back both ----------
  await page.tab('Planning');
  if ((await weekName(page)) !== 'This Week') {
    await page.locator('[data-week-prev]').click();
    await page.waitForTimeout(600);
  }
  await openDay(page, 'Sunday');
  await page.locator('[data-remove-meal]').click();
  await page.waitForTimeout(400);
  const q = (
    await page
      .locator('[data-remove-leftovers-question]')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  check(/Tue 20 Oct/.test(q), 'remove Sunday: asks about the leftovers on Tue 20 Oct', q);
  await page.screenshot({ path: OUT + '/co4-remove.png' });
  await page.locator('[data-remove-leftovers]').click();
  await page.waitForTimeout(500);
  check(
    (await days(thisId)).Sunday.meals.length === 0 && (await days(nextId)).Tuesday.meals.length === 0,
    'Sunday and Tuesday next week both removed',
  );
  check(/Removed, with the leftovers on Tue 20 Oct/.test(await toast(page)), 'toast says so', await toast(page));
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(500);
  tue = (await days(nextId)).Tuesday.meals[0];
  check(
    (await days(thisId)).Sunday.meals[0]?.recipeId === 'r-sausage' && tue?.type === 'leftover',
    'Undo puts back both weeks',
    JSON.stringify(tue),
  );

  // ---------- Moving Sunday to Saturday: Tuesday is too far, so it's cooked fresh ----------
  await openDay(page, 'Sunday');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-move-to="Saturday"]').click();
  await page.waitForTimeout(500);
  tue = (await days(nextId)).Tuesday.meals[0];
  check(
    tue?.type === 'recipe' && /Tue 20 Oct now cooked fresh/.test(await toast(page)),
    'swap to Saturday: Tuesday next week cooked fresh, and the toast says so',
    await toast(page),
  );
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(500);
  check((await days(nextId)).Tuesday.meals[0]?.type === 'leftover', 'Undo: leftovers again');

  check(page.errors.length === 0, 'no page errors', page.errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
