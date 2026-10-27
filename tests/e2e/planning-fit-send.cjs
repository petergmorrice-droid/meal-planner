// Planning week cards fit; leftover/freezer days coloured; Send to list shows the whole week; Our notes always there.
const { chromium, devices, goTab, toThisWeek } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 600));
  if (!ok) failures++;
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...(devices['Galaxy S9+'] || devices['Pixel 7']),
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
  await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  S.mealPlans[0].days.Sunday.meals = [
    { id: 'fz1', type: 'batch', batchId: 'b1', recipeId: 'r-chilli', name: 'Chilli con carne', servings: 2 },
  ];
  S.mealPlans[1].days.Tuesday.meals[0].note =
    'Make double and keep half for Thursday lunch, with extra coriander and lime on the side';
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
    await goTab(page, n);
    await page.waitForTimeout(700);
  };
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

  // ---------- Cook: leftover day amber, freezer day ice blue ----------
  await tab('Cook');
  check(
    (await page.locator('[data-cook-row="Wednesday"][data-day-tone="leftover"]').count()) === 1 &&
      /bg-amber-100/.test(await page.locator('[data-cook-row="Wednesday"]').getAttribute('class')),
    'Cook: the leftover day is amber',
  );
  check(
    (await page.locator('[data-cook-row="Sunday"][data-day-tone="freezer"]').count()) === 1 &&
      /bg-cyan-50/.test(await page.locator('[data-cook-row="Sunday"]').getAttribute('class')),
    'Cook: the freezer meal day is faint blue',
  );
  check((await page.locator('[data-cook-row="Thursday"][data-day-tone]').count()) === 0, 'a cooking day stays white');
  await page.locator('[data-cook-row="Sunday"]').scrollIntoViewIfNeeded();
  await shot('c1-cook-tones');

  // ---------- Recipe pop-up: Our notes is always there ----------
  await page.locator('[data-cook-row="Thursday"] [data-cook-recipe]').click();
  await page.waitForTimeout(600);
  check(
    (await page.locator('[data-recipe-notes]').count()) === 1 &&
      (await page.locator('[data-recipe-notes-add]').count()) === 1,
    'a recipe with no notes yet: "Our notes" at the top with "Add a note"',
  );
  await shot('c2-popup-empty-notes');
  await page.locator('[data-recipe-notes-add]').click();
  await page.locator('[data-recipe-notes-input]').fill('Use the mild paste');
  await page.locator('[data-recipe-notes-save]').click();
  await page.waitForTimeout(500);
  check(
    /Use the mild paste/.test(await page.locator('[data-recipe-notes]').innerText()) &&
      (await page.locator('[data-recipe-notes] [data-person-mark]').count()) === 1,
    'saved right there, with who wrote it',
  );
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  check(
    st.recipes.find((r) => r.id === 'r-tikka')?.notes === 'Use the mild paste',
    'saved to the recipe (both phones)',
  );
  await shot('c3-popup-notes');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page
    .locator('[aria-label="Close"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);

  // ---------- Planning: week cards fit, nothing cut off; tones ----------
  // On a Wednesday: Planning and the Shop open on next week, the Cook tab on this week.
  const weekName = (sel) =>
    page
      .locator(sel)
      .first()
      .innerText()
      .then((t) => t.trim())
      .catch(() => '');
  await tab('Shop');
  check(
    /^next week$/i.test(await weekName('[data-shop-week-name]')),
    'Shop opens on next week',
    await weekName('[data-shop-week-name]'),
  );
  await tab('Cook');
  check(
    /^this week$/i.test(await weekName('[data-cook-week-name]')),
    'Cook opens on this week',
    await weekName('[data-cook-week-name]'),
  );
  await tab('Planning');
  check(
    /^next week$/i.test(await weekName('[data-week-name]')),
    'Planning opens on next week',
    await weekName('[data-week-name]'),
  );
  await toThisWeek(page);
  const strip = page.locator('[data-week-strip]');
  if (!(await strip.count())) {
    await page
      .locator('[data-view-classic], button:has-text("Classic")')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  check(
    (await page.locator('[data-week-day="Wednesday"][data-day-tone="leftover"]').count()) === 1,
    'Planning: the leftover day is amber',
  );
  check(
    (await page.locator('[data-week-day="Sunday"][data-day-tone="freezer"]').count()) === 1,
    'Planning: the freezer meal day is faint blue',
  );
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const card of document.querySelectorAll('[data-week-day]')) {
      const box = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('span, button')) {
        if (!el.textContent.trim() || el.children.length > 2) continue;
        const r = el.getBoundingClientRect();
        if (r.height && r.bottom > box.bottom - 1)
          out.push(card.dataset.weekDay + ': ' + el.textContent.trim().slice(0, 30));
      }
      const title = card.querySelector('button > span');
      if (title && title.scrollHeight > title.clientHeight + 2) out.push(card.dataset.weekDay + ' title squashed');
    }
    return out;
  });
  check(clipped.length === 0, 'Planning: every day card fits (nothing cut off at the bottom)', JSON.stringify(clipped));
  await page.locator('[data-week-day="Wednesday"]').scrollIntoViewIfNeeded();
  await shot('c4-planning-strip');
  await page.locator('[data-week-day="Sunday"]').scrollIntoViewIfNeeded();
  await shot('c4b-planning-strip-end');

  // ---------- Send to list: the whole week, in full ----------
  await page.locator('[data-week-next]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(700);
  const rows = page.locator('[data-send-breakdown] [data-send-day]');
  check((await rows.count()) === 7, 'Send to list: all 7 days');
  const tue = (await page.locator('[data-send-day="Tuesday"]').innerText()).replace(/\s+/g, ' ');
  check(
    /Aubergine & chickpea curry/.test(tue) &&
      /keep half for Thursday lunch, with extra coriander and lime on the side/.test(tue),
    'full meal names and the whole note, not cut off',
    tue,
  );
  const wed = (await page.locator('[data-send-day="Wednesday"]').innerText()).replace(/\s+/g, ' ');
  check(/Chilli con carne/.test(wed) && /Batch cook: freeze 4/.test(wed), 'Wednesday: the batch cook note', wed);
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('[data-send-breakdown] *')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible')
      .map((e) => e.textContent.slice(0, 40)),
  );
  check(cut.length === 0, 'nothing in the breakdown is cut off with …', JSON.stringify(cut));
  await shot('c5-send-summary');
  await page.locator('[data-send-day="Sunday"]').scrollIntoViewIfNeeded();
  await shot('c5b-send-summary-end');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
