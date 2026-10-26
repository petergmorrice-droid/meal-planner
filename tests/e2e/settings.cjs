// Settings in four tabs (phone, household, shopping, sync & backup): this phone (who, Gemini key test), household, sync setup, shopping shortcuts, products, past weeks, backup & reset, version and the update banner.
// cooking mode (amounts per step, get everything out, timers that survive leaving, big steps,
// read aloud, method switch), finished screen (fridge, freezer, verdict, note), day panel, weeks.
const { chromium, devices, goTab, settingsTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

// Wednesday 14 Oct 2026, 4:30pm in London.
const NOW = new Date('2026-10-14T16:30:00+01:00');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function plan(monIso, meals, status) {
  const mon = new Date(monIso + 'T00:00:00');
  const days = {};
  DAYS.forEach((d, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    days[d] = { date: iso(x), meals: meals[d] || [] };
  });
  return { id: `plan-${monIso}`, startDate: monIso, days, status, isCurrent: false, lastModifiedAt: 1 };
}
const meal = (id, type, recipeId, name, servings, extra = {}) => ({ id, type, recipeId, name, servings, ...extra });

function seed() {
  const s = reviewSeed();
  const chilli = s.recipes.find((r) => r.id === 'r-chilli');
  chilli.cookingMethods = ['oven_hob', 'ninja'];
  chilli.instructions[3] =
    'Serve with rice. ' +
    'Spoon the chilli over the rice, scatter with chopped coriander and a spoonful of soured cream, and put the grated cheddar, lime wedges, sliced jalapeños and tortilla chips on the table so everyone can help themselves. '
      .repeat(2)
      .trim();
  chilli.methodInstructions.ninja = [
    'Fry the onions and peppers on Sear for 5 mins.',
    'Add the mince and spices.',
    'Add tomatoes and beans and slow cook for 30 mins.',
    'Serve with rice.',
  ];
  chilli.methodPrepTime = { oven_hob: 15, ninja: 10 };
  chilli.methodCookTime = { oven_hob: 60, ninja: 35 };
  s.mealPlans = [
    plan(
      '2026-10-12',
      {
        Monday: [meal('m1', 'recipe', 'r-bol', 'Spaghetti bolognese', 2, { cooked: true })],
        Tuesday: [meal('m2', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
        Wednesday: [meal('m3', 'recipe', 'r-chilli', 'Chilli con carne', 2, { note: 'Batch cook: freeze 4' })],
        Thursday: [meal('m4', 'batch', 'r-bol', 'Batch: Spaghetti bolognese', 2, { batchId: 'b3' })],
        Friday: [meal('m5', 'leftover', 'r-chilli', 'Leftovers: Chilli con carne', 2)],
        Saturday: [meal('m6', 'takeout', undefined, 'Takeout', 2, { note: 'Pizza night' })],
        Sunday: [meal('m7', 'recipe', 'r-sausage', 'Sausage & mash', 2)],
      },
      'finalized',
    ),
    plan(
      '2026-10-19',
      {
        Monday: [meal('n1', 'recipe', 'r-fajita', 'Chicken fajitas', 2)],
        Wednesday: [meal('n3', 'recipe', 'r-chilli', 'Chilli con carne', 6, { note: 'Batch cook: freeze 4' })],
        Friday: [meal('n5', 'eating_out', undefined, 'Eating out', 2)],
      },
      'draft',
    ),
  ];
  s.mealPlans.unshift(
    plan(
      '2026-10-05',
      {
        Monday: [meal('p1', 'recipe', 'r-chilli', 'Chilli con carne', 2, { cooked: true })],
        Tuesday: [
          meal('p2', 'leftover', 'r-chilli', 'Leftovers: Chilli con carne', 2, {
            cooked: true,
            note: 'Reheat from Monday',
          }),
        ],
        Wednesday: [meal('p3', 'takeout', undefined, 'Takeout', 2)],
        Thursday: [meal('p4', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
      },
      'finalized',
    ),
  );
  s.recipes.find((r) => r.id === 'r-chilli').verdict = 'again';
  s.batches.push({ id: 'b3', name: 'Spaghetti bolognese', recipeId: 'r-bol', portions: 2, dateAdded: '2026-09-20' });
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    acceptDownloads: true,
    serviceWorkers: 'block',
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let geminiMode = 'ok';
  await ctx.route(/generativelanguage\.googleapis\.com/, async (route) => {
    if (geminiMode === 'ok')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
      });
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
    });
  });
  let swVersion = null; // null = serve the real sw.js
  await ctx.route(/\/sw\.js\?check=/, async (route) => {
    if (!swVersion) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `const CACHE = 'meal-planner-${swVersion}';`,
    });
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const tab = async (n) => {
    await goTab(page, n);
    await page.waitForTimeout(700);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const text = async (sel) =>
    (
      await page
        .locator(sel)
        .first()
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();

  check((await page.locator('[data-update-banner]').count()) === 0, 'no update banner when up to date');

  // ---- The tab bar: five tabs, Freezer and Settings under More ----
  const navLabels = await page.locator('nav button[data-tab-tone]').allInnerTexts();
  check(
    navLabels.map((t) => t.trim()).join(',') === 'Cookbook,Planning,Shop,Cook,More',
    'tab bar: five tabs ending in More',
    navLabels.join(','),
  );
  const more = page.locator('nav button', { hasText: /^More$/ });
  await more.click();
  await page.waitForTimeout(200);
  check(
    (await page.locator('[data-more-menu] [data-more-item]').allInnerTexts()).join('|').replace(/\n/g, ' ') ===
      "Freezer What's in the freezer|Settings Reminders, sync, backup",
    'More: offers the Freezer and Settings',
    await page
      .locator('[data-more-menu]')
      .innerText()
      .catch(() => ''),
  );
  check((await more.getAttribute('aria-expanded')) === 'true', 'More: says its menu is open');
  await shot('00-more-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check((await page.locator('[data-more-menu]').count()) === 0, 'More: Escape closes the menu');
  await more.click();
  await page.mouse.click(20, 200);
  await page.waitForTimeout(200);
  check((await page.locator('[data-more-menu]').count()) === 0, 'More: tapping elsewhere closes the menu');
  check((await more.getAttribute('aria-current')) === null, 'More: not highlighted on another tab');
  await tab('Freezer');
  check(
    (await page.locator('[data-more-menu]').count()) === 0 && (await more.getAttribute('aria-current')) === 'page',
    'More: picking the Freezer opens it, and More shows as the current tab',
  );
  check((await more.getAttribute('data-tab-tone')) === 'cyan', "More: takes the Freezer's colour");

  await tab('Settings');
  await shot('01-settings-top');
  check(
    (await page.locator('[data-settings-tab]').allInnerTexts()).map((t) => t.trim()).join(',') ===
      'Phone,Household,Shopping,Sync & backup',
    'Settings: four tabs',
  );
  check(
    (await page.locator('[data-settings-tab="phone"][aria-selected="true"]').count()) === 1,
    'Settings: opens on Phone',
  );
  const sections = {
    phone: ['phone', 'about'],
    household: ['household', 'reminders', 'notifications', 'calendar', 'history'],
    shopping: ['shopping'],
    sync: ['sync', 'backup'],
  };
  for (const [id, secs] of Object.entries(sections)) {
    await settingsTab(page, id);
    const shown = await page.locator('[data-settings-panel] > section').evaluateAll((els) =>
      els.map((el) =>
        Object.keys(el.dataset)
          .find((k) => k.startsWith('settings'))
          .replace('settings', '')
          .toLowerCase(),
      ),
    );
    check(shown.join(',') === secs.join(','), `tab ${id}: ${secs.join(', ')}`, shown.join(','));
  }

  // ---- Reminders: what you're reminded about (both phones), then how this phone gets them ----
  const fs = require('fs');
  const calendarFile = async () => {
    const wait = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.locator('[data-reminders-add]').click();
    const f = await wait;
    return { name: f && f.suggestedFilename(), text: f ? fs.readFileSync(await f.path(), 'utf8') : '' };
  };
  await settingsTab(page, 'household');
  await page.locator('[data-settings-reminders]').scrollIntoViewIfNeeded();
  check(
    (await page.locator('[data-notify-needs-sync]').count()) === 1,
    'notifications: ask for Sync between phones first',
  );
  check(
    (await page.locator('[data-calendar-sync-needs]').count()) === 1,
    'calendar sync: asks for Sync between phones first',
  );
  await page.locator('[data-calendar-goto-sync]').click();
  await page.waitForTimeout(200);
  check(
    (await page.locator('[data-settings-tab="sync"][aria-selected="true"]').count()) === 1 &&
      (await page.locator('[data-settings-sync]').count()) === 1,
    'Set up sync: opens the Sync & backup tab',
  );
  await settingsTab(page, 'household');
  check(
    /mornings/.test(await text('[data-reminders-summary]')) &&
      /start-cooking/.test(await text('[data-reminders-summary]')),
    'reminders: says what is coming',
    await text('[data-reminders-summary]'),
  );
  await page.locator('[data-reminders-show]').click();
  const remList = await text('[data-reminders-list]');
  check(
    /Start cooking: Chilli con carne/.test(remList) &&
      /Take the Spaghetti bolognese out of the freezer/.test(remList) &&
      /Tomorrow 9am · Tonight: Spaghetti bolognese/.test(remList),
    "reminders: tonight's cook, tomorrow's freezer meal and tomorrow morning's heads-up",
    remList,
  );
  const cookItems = (await page.locator('[data-reminders-list] [data-reminder="cook"]').allInnerTexts()).join('|');
  check(!/Takeout|Takeaway|Eating out/.test(cookItems), 'reminders: no cooking for takeaways', cookItems);
  await shot('01b-reminders');
  await page.locator('[data-reminders-file-toggle]').click();
  let cal = await calendarFile();
  check(cal.name === 'meal-reminders-2026-10-14.ics', 'reminders: calendar file downloads', cal.name);
  check(
    /BEGIN:VCALENDAR/.test(cal.text) && /BEGIN:VALARM/.test(cal.text) && /TRIGGER:PT0M/.test(cal.text),
    'reminders: events with alerts',
    cal.text.slice(0, 300),
  );
  check(
    /SUMMARY:Dinner: /.test(cal.text),
    'reminders: the morning heads-up rides on the dinner',
    cal.text.slice(0, 600),
  );
  await page.locator('[data-segmented="reminder-cook"] button', { hasText: '10 mins' }).click();
  await page.waitForTimeout(300);
  check((await state()).preferences.reminderCookBefore === 10, 'reminders: alert 10 mins before is saved');
  cal = await calendarFile();
  check(/TRIGGER:-PT10M/.test(cal.text), 'reminders: file uses 10 mins before', cal.text.slice(0, 300));
  await page.locator('[data-setting-reminder-prep-switch]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-reminders-list] [data-reminder="prep"]').count()) === 0 &&
      (await page.locator('[data-reminders-list] [data-reminder="cook"]').count()) > 0,
    'reminders: night-before switched off',
  );
  await page.locator('[data-setting-reminder-prep-switch]').click();
  await page.locator('[data-setting-reminder-prep-at]').fill('23:00');
  await page.waitForTimeout(200);
  check(
    (await state()).preferences.reminderPrepAt !== '23:00',
    'reminders: night-before only when notifications can go out (not 11pm)',
  );
  await page.locator('[data-setting-reminder-prep-at]').fill('19:30');
  await page.waitForTimeout(200);
  check((await state()).preferences.reminderPrepAt === '19:30', 'reminders: night-before at 7:30pm');
  await page.locator('[data-setting-reminder-morning-switch]').click();
  await page.waitForTimeout(300);
  check(
    (await state()).preferences.notifyDinner === false &&
      (await page.locator('[data-reminders-list] [data-reminder="meal"]').count()) === 0,
    'reminders: morning heads-up switched off',
  );
  await page.locator('[data-setting-reminder-morning-switch]').click();
  await page.locator('[data-segmented="reminder-cook"] button', { hasText: 'At start' }).click();
  await page.waitForTimeout(300);
  // Plan next week: Friday 9am, since next week still has days with nothing planned
  const planItem = () => text('[data-reminders-list] [data-reminder="plan"]');
  check(
    /^Fri 16 Oct 9am · Plan next week/.test(await planItem()),
    'plan next week: Friday at 9am, as next week has empty days',
    await planItem(),
  );
  await page.locator('[data-setting-reminder-plan-day]').selectOption('Sunday');
  await page.waitForTimeout(300);
  check(
    (await state()).preferences.reminderPlanDay === 'Sunday' && /^Sun 18 Oct 9am/.test(await planItem()),
    'plan next week: moved to Sunday',
    await planItem(),
  );
  await page.locator('[data-setting-reminder-plan-switch]').click();
  await page.waitForTimeout(300);
  check(
    (await state()).preferences.reminderPlan === false &&
      (await page.locator('[data-reminders-list] [data-reminder="plan"]').count()) === 0,
    'plan next week: switched off',
  );
  await page.locator('[data-setting-reminder-plan-switch]').click();
  await page.locator('[data-setting-reminder-plan-day]').selectOption('Friday');
  await page.waitForTimeout(300);
  check(/Last added on this phone/.test(await text('[data-reminders-last-added]')), 'reminders: remembers when added');

  check(
    (await page.locator('text=Multi-Cooker Model').count()) === 0 &&
      (await page.locator('text=Multi-cooker').count()) === 0,
    'Multi-cooker model setting gone',
  );

  // ---- This phone ----
  await settingsTab(page, 'phone');
  await page.locator('[data-segmented="who"] button', { hasText: 'Rachel' }).click();
  await page.waitForTimeout(200);
  check((await page.evaluate(() => localStorage.getItem('currentUser'))) === 'R', "this is Rachel's phone");
  await page.locator('[data-segmented="who"] button', { hasText: 'Peter' }).click();
  await page.locator('[data-gemini-edit]').click();
  geminiMode = 'bad';
  await page.locator('[data-gemini-input]').fill('AIza-wrong');
  await page.locator('[data-gemini-save]').click();
  await page.waitForTimeout(600);
  check(
    /isn't valid/.test(await text('[data-gemini-status]')),
    'a bad key says so plainly',
    await text('[data-gemini-status]'),
  );
  geminiMode = 'ok';
  await page.locator('[data-gemini-test]').click();
  await page.waitForTimeout(600);
  check(/It works/.test(await text('[data-gemini-status]')), 'Test it: works', await text('[data-gemini-status]'));
  check((await page.evaluate(() => localStorage.getItem('gemini_api_key'))) === 'AIza-wrong', 'key kept on this phone');

  // ---- Household ----
  await settingsTab(page, 'household');
  await page.locator('[data-setting-people] button[aria-label="One more person"]').click();
  await page.waitForTimeout(200);
  let st = await state();
  check(st.preferences.defaultServings === 3 && (await text('[data-people-count]')) === '3', 'cooking for 3');
  await page.locator('[data-segmented="appliance"] button', { hasText: 'Ninja' }).click();
  await page.waitForTimeout(200);
  check((await state()).preferences.preferredCookingMethod === 'ninja', 'usual appliance: Ninja');
  await page.locator('[data-setting-eat-at-input]').fill('18:30');
  await page.waitForTimeout(200);
  check((await state()).preferences.eatAt === '18:30', 'eat at 6:30');

  // ---- Sync (not connected) ----
  await settingsTab(page, 'sync');
  check((await page.locator('[data-sync-setup]').count()) === 1, 'sync setup shown when not connected');
  await page.locator('[data-sync-connect]').click();
  await page.waitForTimeout(200);
  check(/Paste the GitHub token first/.test(await text('[data-sync-problem]')), 'connect without a token explains');
  await page.locator('[data-sync-code-input]').fill('abc123');
  check(/Connect to the other phone/.test(await text('[data-sync-connect]')), 'button says what it will do');
  await page.locator('[data-sync-code-input]').fill('');
  await shot('02-settings-sync');

  // ---- Shopping shortcuts ----
  await settingsTab(page, 'shopping');
  await page.locator('[data-setting-link="aisles"]').click();
  await page.waitForTimeout(700);
  check((await page.locator('[aria-label="Arrange aisles"]').count()) >= 1, 'Arrange aisles opens in Shop');
  await page.locator('[aria-label="Arrange aisles"] button[aria-label="Close"]').click();
  await page.waitForTimeout(200);
  await tab('Settings');
  check(
    (await page.locator('[data-settings-tab="shopping"][aria-selected="true"]').count()) === 1,
    'back in Settings: still on the Shopping tab',
  );
  await page.locator('[data-setting-link="staples"]').click();
  await page.waitForTimeout(700);
  check((await page.locator('h3', { hasText: 'Weekly staples' }).count()) >= 1, 'Weekly staples opens in Shop');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  {
    const c = page.locator('button[aria-label="Close"]:visible');
    if (await c.count()) await c.first().click();
  }
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  await tab('Settings');

  // ---- Products ----
  await page.locator('[data-setting-link="products"]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-products-page]').count()) === 1, 'Products page');
  await page.locator('[data-products-search]').fill('garlic');
  await page.waitForTimeout(200);
  check((await page.locator('[data-product="Garlic"]').count()) === 1, 'search finds Garlic');
  await shot('03-products');
  await page.locator('[data-product="Garlic"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-product-step]').fill('2');
  await page.locator('[data-product-save]').click();
  await page.waitForTimeout(300);
  st = await state();
  const garlic = (st.groceryDatabase || []).find((g) => g.id === 'gdb-2');
  check(
    garlic && garlic.increment === 2 && !Object.keys(st.groceryOverrides || {}).length,
    'change saved in the shared product list',
    JSON.stringify(garlic),
  );
  check(
    /sold in 2 bulb/.test(await text('[data-product="Garlic"]')),
    'list shows the change',
    await text('[data-product="Garlic"]'),
  );
  await page.locator('[data-product-add]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-product-name]').fill("Za'atar");
  await page.locator('[data-product-unit]').fill('jar');
  await page.locator('[data-product-save]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    (st.groceryDatabase || []).some((g) => g.name === "Za'atar" && g.unit === 'jar'),
    'product added',
  );
  await page.locator('[data-products-search]').fill('za');
  await page.waitForTimeout(150);
  await page.locator(`[data-product="Za'atar"]`).click();
  await page.waitForTimeout(200);
  await page.locator('[data-product-remove]').click();
  await page.locator('[data-confirm-ok]').click();
  await page.waitForTimeout(300);
  check(
    ((await state()).groceryDatabase || []).some((g) => g.name === "Za'atar" && g.removed),
    'product removed (kept as removed so it stays off)',
  );
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  check(
    ((await state()).groceryDatabase || []).some((g) => g.name === "Za'atar" && !g.removed),
    'Undo brings it back',
  );
  await page.locator('[data-settings-back]').click();
  await page.waitForTimeout(300);

  // ---- Past weeks ----
  await settingsTab(page, 'household');
  await page.locator('[data-setting-link="past-weeks"]').click();
  await page.waitForTimeout(400);
  const wk = await text('[data-history-week="2026-10-05"]');
  check(/5–11 Oct/.test(wk) && /3 cooked/.test(wk), 'past week with dates and cooked count', wk);
  check(
    /Chilli con carne/.test(await text('[data-history-week="2026-10-05"] [data-history-day="Monday"]')) &&
      (await page
        .locator('[data-history-week="2026-10-05"] [data-history-day="Monday"] [aria-label="Have it again"]')
        .count()) === 1,
    'Monday: chilli, have it again',
  );
  check(
    /Leftovers from Mon/i.test(await text('[data-history-week="2026-10-05"] [data-history-day="Tuesday"]')),
    'Tuesday says leftovers in words',
    await text('[data-history-week="2026-10-05"] [data-history-day="Tuesday"]'),
  );
  check(
    /Takeaway/.test(await text('[data-history-week="2026-10-05"] [data-history-day="Wednesday"]')),
    'Wednesday: Takeaway',
  );
  await shot('04-history');
  await page.locator('[data-history-copy]').click();
  await page.waitForTimeout(200);
  check(
    /Replaces 6 meals/.test(await text('[data-copy-to="2026-10-19"]')) ||
      /Replaces \d+ meals/.test(await text('[data-copy-to="2026-10-19"]')),
    'says it replaces next week',
    await text('[data-copy-to="2026-10-19"]'),
  );
  await page.locator('[data-copy-to="2026-10-19"]').click();
  await page.waitForTimeout(1200);
  st = await state();
  const nw = st.mealPlans.find((p) => p.startDate === '2026-10-19');
  check(
    nw &&
      nw.days.Monday.meals[0]?.name === 'Chilli con carne' &&
      !nw.days.Monday.meals[0]?.cooked &&
      nw.days.Wednesday.meals[0]?.type === 'takeout',
    'copied to next week, not cooked',
    JSON.stringify(nw?.days?.Monday),
  );
  check((await page.locator('[data-week-prev], [data-week-strip], [data-list-day]').count()) > 0, 'goes to Planning');
  await tab('Settings');

  // ---- Backup & reset ----
  await settingsTab(page, 'sync');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.locator('[data-backup-download]').click();
  const d = await dl;
  check(
    !!d && /meal-planner-backup-2026-10-14\.json/.test(d.suggestedFilename()),
    'backup downloads',
    d && d.suggestedFilename(),
  );
  check(
    /Last downloaded on this phone just now/.test(await text('[data-last-backup]')),
    'remembers when',
    await text('[data-last-backup]'),
  );
  const backupText = JSON.stringify(await state());
  await page
    .locator('[data-restore-input]')
    .setInputFiles({ name: 'meal-planner-backup.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
  await page.waitForTimeout(400);
  const parts = await text('[data-restore-parts]');
  check(
    /8 recipes/.test(parts) && /weeks/.test(parts) && /freezer items/.test(parts),
    'restore shows what is in the file first',
    parts,
  );
  await shot('05-restore');
  await page.locator('[data-restore-sheet] button', { hasText: 'Cancel' }).click();
  await page
    .locator('[data-restore-input]')
    .setInputFiles({ name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForTimeout(300);
  check(/isn't a backup from this app/.test(await text('[data-settings-backup]')), 'a wrong file is refused');
  await page.locator('[data-settings-reset]').click();
  await page.locator('[data-confirm-ok]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    st.preferences.defaultServings === 2 && !st.preferences.eatAt && (st.preferences.recurringItems || []).length === 3,
    'reset settings keeps staples',
    JSON.stringify({
      s: st.preferences.defaultServings,
      e: st.preferences.eatAt,
      r: (st.preferences.recurringItems || []).length,
    }),
  );

  // ---- Version and updates ----
  await settingsTab(page, 'phone');
  const ver = await text('[data-app-version]');
  check(/· [0-9a-f]{7}/.test(ver), 'shows the version', ver);
  await page.locator('[data-update-check]').click();
  await page.waitForTimeout(600);
  check(/latest version/.test(await text('[data-update-result]')), 'up to date', await text('[data-update-result]'));
  swVersion = 'ffffffffffff';
  await page.locator('[data-update-check]').click();
  await page.waitForTimeout(600);
  check(
    /newer version has been uploaded/.test(await text('[data-update-result]')),
    'spots a newer upload',
    await text('[data-update-result]'),
  );
  await shot('06-about');
  await page.reload();
  await page.waitForTimeout(1500);
  check(
    (await page.locator('[data-update-banner]').count()) === 1,
    'banner: a new version is ready',
    await text('[data-update-banner]'),
  );
  await shot('07-banner');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
