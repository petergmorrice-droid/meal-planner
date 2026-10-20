// Ratings (Peter and Rachel each rate) and suggested weekly staples.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 600)); if (!ok) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-14T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  // Hummus added by hand three weeks running (this week and two before)
  const thisPlan = S.mealPlans[0].id; // plan-2026-10-12
  const line = (id, planId, extra = {}) => ({ id, name: 'Hummus', amount: 1, unit: 'tub', category: 'Dairy, Chilled & Eggs', checked: true, isAdhoc: true, isBatch: false, planId, weekLabel: '', lastModifiedAt: 1, ...extra });
  S.shoppingList = [...(S.shoppingList || []), line('h1', thisPlan, { checked: false }), line('h2', 'plan-2026-10-05'), line('h3', 'plan-2026-09-28')];
  S.mealPlans[0].days.Monday.meals[0].cooked = true;
  await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s)); localStorage.setItem('seeded', '1'); } }, S);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  const tab = async (n) => { await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await page.waitForTimeout(700); };
  const iAm = async (who) => { await tab('Settings'); await page.locator('[data-segmented="who"] button', { hasText: who }).click(); await page.waitForTimeout(300); };
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));

  // ---------- Ratings ----------
  await iAm('Peter');
  await tab('Cook');
  const mon = page.locator('[data-cook-row="Monday"]');
  check(await mon.locator('[data-cook-rate]').count() === 1 && /Rate it/.test(await mon.innerText()), 'Cook: a cooked meal has "Rate it"');
  await mon.locator('[data-cook-rate]').click(); await page.waitForTimeout(300);
  check(await page.locator('[data-rate-sheet] [data-rating-row]').count() === 2, 'rate sheet: a row each');
  await page.locator('[data-rate-sheet] [data-rating-row="P"] [data-star="4"]').click(); await page.waitForTimeout(250);
  await shot('r1-rate-sheet');
  await page.locator('[data-rate-done]').click(); await page.waitForTimeout(300);
  check(await mon.locator('[data-rating-chip] [data-rating-p]').innerText() === '4' && !/Rate it/.test(await mon.innerText()), "Peter's 4 shows on the day (blue); no more Rate it for him");
  // Rachel rates the same meal
  await iAm('Rachel');
  await tab('Cook');
  check(/Rate it/.test(await mon.innerText()), 'Rachel still gets "Rate it"');
  await mon.locator('[data-cook-rate]').click(); await page.waitForTimeout(300);
  check(await page.locator('[data-rate-sheet] [data-rating-row="P"] [data-stars="4"]').count() === 1, "she sees Peter's 4 stars");
  await page.locator('[data-rate-sheet] [data-rating-row="R"] [data-star="5"]').click(); await page.waitForTimeout(250);
  await page.locator('[data-rate-done]').click(); await page.waitForTimeout(300);
  check(await mon.locator('[data-rating-p]').innerText() === '4' && await mon.locator('[data-rating-r]').innerText() === '5', 'the day shows 4 (blue) and 5 (pink)');
  let st = await state();
  check((st.preferences.ratings || []).length === 2, 'saved: one rating each (they sync separately)', JSON.stringify(st.preferences.ratings));
  // Recipe pop-up and cards
  await mon.locator('[data-cook-open]').click(); await page.waitForTimeout(300); await page.locator('[data-open-recipe]').click(); await page.waitForTimeout(500);
  check(await page.locator('[data-recipe-ratings] [data-rating-row="R"] [data-stars="5"]').count() === 1 && await page.locator('[data-recipe-ratings] [data-rating-row="P"] [data-stars="4"]').count() === 1, 'recipe pop-up: Our ratings, both');
  await shot('r2-popup');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const close = page.locator('button[aria-label="Close"]:visible'); if (await close.count()) await close.first().click();
  await tab('Cookbook');
  const card = page.locator('[data-recipe-card="Spaghetti bolognese"]');
  check(await card.locator('[data-rating-chip]').count() === 1, 'Cookbook card shows ★ 4 5');
  await page.locator('[data-recipe-card]').first().scrollIntoViewIfNeeded();
  await shot('r3-cookbook');

  // ---------- Suggested staples ----------
  await tab('Shop');
  let name = await page.locator('[data-shop-week-name]').innerText();
  if (name !== 'This week') { await page.locator('[aria-label="Previous week"]').first().click(); await page.waitForTimeout(400); name = await page.locator('[data-shop-week-name]').innerText(); }
  const card2 = page.locator('[data-staple-suggestions]');
  check(await card2.count() === 1 && await card2.locator('[data-suggest-staple="Hummus"]').count() === 1 && /3 of 6 weeks/.test(await card2.innerText()), 'Shop: "Add every week?" suggests Hummus (3 of 6 weeks)', await card2.innerText().catch(() => name));
  await shot('s1-suggestion');
  await card2.locator('[data-suggest-staple="Hummus"]').click(); await page.waitForTimeout(300);
  check(await page.locator('[data-staple-sheet="Hummus"]').count() === 1 && /1\s*tub/.test(await page.locator('[data-staple-amount]').innerText()), 'sheet: every week 1 tub');
  await page.locator('[aria-label="More each week"]').click();
  await shot('s2-sheet');
  await page.locator('[data-staple-add]').click(); await page.waitForTimeout(600);
  st = await state();
  const rec = (st.preferences.recurringItems || []).find((r) => r.name === 'Hummus');
  check(rec && rec.amount === 2 && /tub/.test(rec.unit), 'a weekly staple: 2 tubs', JSON.stringify(rec));
  const lines = st.shoppingList.filter((i) => i.planId === thisPlan && i.name === 'Hummus');
  check(lines.length === 1 && lines[0].isRecurring, "this week's hand-added line became the staple's line (once on the list)", JSON.stringify(lines));
  check(await page.locator('[data-staple-suggestions]').count() === 0, 'no longer suggested');
  check(/Hummus is now a weekly staple/.test(await page.locator('[data-toast]').innerText().catch(() => '')), 'message says so');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
