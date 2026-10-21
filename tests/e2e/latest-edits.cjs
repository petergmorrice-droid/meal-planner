// Edits work from the latest data. A window left open while the other phone changes the same
// thing shows that change, and saving something in it doesn't undo the other phone's change.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const { createMockGist } = require('./mockgist.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const NOW = new Date('2026-10-14T16:30:00+01:00');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const mock = createMockGist({ 'family-meal-planner.json': JSON.stringify(reviewSeed()) });
  async function openPhone(who) {
    const ctx = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      serviceWorkers: 'block',
    });
    await ctx.route('https://api.github.com/**', (r) => mock.handle(r, who));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((who) => {
      if (!localStorage.getItem('github_pat')) {
        localStorage.setItem('github_pat', 'test-token');
        localStorage.setItem('github_gist_id', 'testgist123');
        localStorage.setItem('currentUser', who === 'A' ? 'P' : 'R');
      }
    }, who);
    const page = await ctx.newPage();
    await page.clock.install({ time: NOW });
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.goto(URL);
    await page.waitForTimeout(2500);
    return page;
  }
  const tabOn = async (page, n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(600);
  };
  const cacheOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  // Coming back to the app makes it sync straight away.
  const comeBack = async (page) => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(2500);
  };
  const openRecipe = async (page, name) => {
    await tabOn(page, 'Cookbook');
    await page.locator(`[data-recipe-card="${name}"]`).first().click();
    await page.waitForTimeout(500);
  };
  const bol = (st) => st.recipes.find((r) => r.name === 'Spaghetti bolognese');

  const A = await openPhone('A');
  const B = await openPhone('B');

  // ---------- A recipe left open on Peter's phone while Rachel adds a note ----------
  await openRecipe(A, 'Spaghetti bolognese');
  await openRecipe(B, 'Spaghetti bolognese');
  await B.locator('[data-recipe-notes] button', { hasText: /Add a note/ }).click();
  await B.waitForTimeout(200);
  await B.locator('[data-recipe-notes-input]').fill('Less salt');
  await B.locator('[data-recipe-notes-save]').click();
  await B.waitForTimeout(2000); // sent to the Gist
  await comeBack(A);
  check(
    /Less salt/.test(await A.locator('[data-recipe-notes]').innerText()),
    "Peter's open recipe shows Rachel's new note",
  );
  await A.screenshot({ path: `${OUT}/a-recipe-open.png` });
  await A.locator('[data-favourite-toggle]').click();
  await A.waitForTimeout(2000);
  await comeBack(B);
  const a1 = bol(await cacheOf(A)),
    b1 = bol(await cacheOf(B));
  check(
    a1.favourite === true && a1.notes === 'Less salt',
    "Peter's phone: favourite, and Rachel's note kept",
    JSON.stringify({ favourite: a1.favourite, notes: a1.notes }),
  );
  check(
    b1.favourite === true && b1.notes === 'Less salt',
    "Rachel's phone: the same",
    JSON.stringify({ favourite: b1.favourite, notes: b1.notes }),
  );

  // And the other way round: Rachel's recipe has been open all along; her next save mustn't undo
  // Peter's favourite.
  await B.locator('[data-recipe-notes-edit]').click();
  await B.waitForTimeout(200);
  await B.locator('[data-recipe-notes-input]').fill('Less salt, more garlic');
  await B.locator('[data-recipe-notes-save]').click();
  await B.waitForTimeout(2000);
  await comeBack(A);
  const a2 = bol(await cacheOf(A)),
    b2 = bol(await cacheOf(B));
  check(
    a2.favourite === true &&
      a2.notes === 'Less salt, more garlic' &&
      b2.favourite === true &&
      b2.notes === 'Less salt, more garlic',
    "Rachel's later note keeps Peter's favourite, on both phones",
    JSON.stringify({ a: [a2.favourite, a2.notes], b: [b2.favourite, b2.notes] }),
  );
  check(
    /Favourite/.test(await B.locator('[data-favourite-toggle]').innerText()),
    "and Rachel's open recipe shows it as a favourite",
  );

  check(A.errors.length === 0 && B.errors.length === 0, 'no page errors', [...A.errors, ...B.errors].join(' | '));
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
