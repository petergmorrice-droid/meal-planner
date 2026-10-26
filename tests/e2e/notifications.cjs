// Settings → On this phone: turning notifications on signs this phone up with the notification sender
// (on Netlify) under a household key in the synced settings; the reminders (Settings → Reminders) go to
// the sender as a schedule; adding things by hand sends a message; Send test and Turn off. The sender
// and the phone's push system are stood in for.
const { chromium, devices, goTab, settingsTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const { createMockGist } = require('./mockgist.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const NOW = new Date('2026-10-14T16:30:00+01:00');
const API = 'https://morrice-meal-planner-push.netlify.app/api';
let failures = 0;
// The time a notification goes off on the phone (London, like the test phone).
const londonTime = (ms) =>
  new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  // Next Thursday's dinner from the freezer, so there's something to take out the night before.
  const seed = reviewSeed();
  seed.mealPlans[1].days.Thursday.meals = [
    { id: 'n4', type: 'batch', batchId: 'b1', name: 'Batch: Chilli con carne', servings: 2 },
  ];
  const mock = createMockGist({ 'family-meal-planner.json': JSON.stringify(seed) });
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
  });
  await ctx.grantPermissions(['notifications'], { origin: new globalThis.URL(URL).origin });
  await ctx.route('https://api.github.com/**', (r) => mock.handle(r, 'A'));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const calls = [];
  await ctx.route(`${API}/**`, async (route) => {
    const action = route.request().url().split('/').pop();
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ action, body });
    const reply =
      action === 'key'
        ? { publicKey: 'BAeSRHH8itchCnRy8VVEhypQLEOcjoBMKmOldN622KA-qig8kwR6eN3N8yne6eo34QGZcRdcV0KYX48H8fBFTcg' }
        : action === 'notify'
          ? { ok: true, sent: body.test ? 2 : 1 }
          : action === 'test-later'
            ? { ok: true, in: 45 }
            : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  // The phone's push system: a stand-in sign-up, since the real one needs a push service.
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('github_pat')) {
      localStorage.setItem('github_pat', 'test-token');
      localStorage.setItem('github_gist_id', 'testgist123');
      localStorage.setItem('currentUser', 'P');
    }
    let current = null;
    const sub = {
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-phone',
        keys: { p256dh: 'BPx', auth: 'au' },
      }),
      unsubscribe: async () => ((current = null), true),
    };
    window.__pushSubscribeCalls = 0;
    const reg = {
      pushManager: {
        getSubscription: async () => current,
        subscribe: async () => {
          window.__pushSubscribeCalls++;
          return (current = sub);
        },
      },
    };
    if (navigator.serviceWorker)
      Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve(reg) });
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(2500);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const text = (sel) =>
    page
      .locator(sel)
      .first()
      .innerText()
      .catch(() => '');

  // ---------- Turn on ----------
  await goTab(page, 'Settings');
  await page.waitForTimeout(600);
  await settingsTab(page, 'household');
  await page.locator('[data-settings-notifications]').scrollIntoViewIfNeeded();
  check(
    /Rachel adds things to the shopping list/.test(await text('[data-settings-notifications]')),
    'says who you hear about',
  );
  await page.locator('[data-notify-on]').click();
  await page.waitForTimeout(800);
  const subscribe = calls.find((c) => c.action === 'subscribe');
  const household = (await state()).preferences.pushHousehold;
  check(/^[0-9a-f]{32}$/.test(household || ''), 'a household key is made and saved (synced)', household);
  check(
    subscribe &&
      subscribe.body.household === household &&
      subscribe.body.who === 'P' &&
      /fcm\.googleapis\.com/.test(subscribe.body.subscription.endpoint),
    'this phone signs up with the sender',
    JSON.stringify(subscribe),
  );
  check(calls[0].action === 'key', "the sender's public key is fetched first");
  check(
    /^On\. The reminders, and Rachel adding things/.test(await text('[data-notify-status]')),
    'shows it is on',
    await text('[data-notify-status]'),
  );
  await page.screenshot({ path: `${OUT}/n1-on.png` });

  // ---------- Send test ----------
  await page.locator('[data-notify-test]').click();
  await page.waitForTimeout(600);
  const t = calls.find((c) => c.action === 'notify' && c.body.test);
  check(t && t.body.household === household && /Test from Peter/.test(t.body.body), 'Send test', JSON.stringify(t));
  check(/Test sent to 2 phones/.test(await page.locator('body').innerText()), 'says how many phones it reached');

  // ---------- Delayed test, for checking with the app closed ----------
  await page.locator('[data-notify-test-later]').click();
  await page.waitForTimeout(600);
  const later = calls.find((c) => c.action === 'test-later');
  check(
    later && later.body.household === household && /Delayed test from Peter/.test(later.body.body),
    'Test in 45 seconds',
    JSON.stringify(later),
  );
  check(/close the app now/.test(await page.locator('body').innerText()), 'says to close the app');

  // ---------- The reminders: sent to the sender as a schedule ----------
  await page.clock.runFor(6000);
  await page.waitForTimeout(400);
  const schedules = () => calls.filter((c) => c.action === 'schedule');
  const kind = (notes, k) => (notes || []).filter((n) => n.id.endsWith(`-${k}`));
  const sched = schedules().at(-1);
  check(
    sched && sched.body.household === household && sched.body.notes.some((n) => n.title === "Tonight's dinner"),
    "the coming days' reminders are sent to the sender",
    JSON.stringify(sched && sched.body.notes.slice(0, 2)),
  );
  const notes = sched ? sched.body.notes : [];
  check(
    kind(notes, 'dinner').length > 0 && kind(notes, 'dinner').every((n) => londonTime(n.at) === '09:00'),
    'each morning at 9am',
    JSON.stringify(kind(notes, 'dinner').map((n) => londonTime(n.at))),
  );
  check(
    kind(notes, 'cook').length > 0 &&
      kind(notes, 'cook').every((n) => /^Start|^Heat/.test(n.title) && /:(00|15|30|45)$/.test(londonTime(n.at))),
    'time to start cooking, on the quarter hour',
    JSON.stringify(kind(notes, 'cook').map((n) => `${londonTime(n.at)} ${n.title}`)),
  );
  check(
    kind(notes, 'prep').length > 0 && kind(notes, 'prep').every((n) => londonTime(n.at) === '20:00'),
    'the night before at 8pm',
    JSON.stringify(kind(notes, 'prep').map((n) => londonTime(n.at))),
  );
  check(
    (await page.locator('[data-reminder-cook-window]').count()) === 1,
    'says start-cooking notifications only go out 3pm to 9:45pm',
  );
  await page.locator('[data-setting-reminder-morning-at]').fill('07:30');
  await page.locator('[data-setting-reminder-prep-switch]').click();
  await page.waitForTimeout(300);
  await page.clock.runFor(6000);
  await page.waitForTimeout(400);
  const after = schedules().at(-1);
  check(
    after !== sched &&
      kind(after.body.notes, 'prep').length === 0 &&
      kind(after.body.notes, 'dinner').every((n) => londonTime(n.at) === '07:30'),
    'night-before switched off and morning time changed: the schedule follows (the same settings as the calendar)',
    JSON.stringify(after && after.body.notes),
  );
  check((await state()).preferences.notifyMorningAt === '07:30', 'saved (both phones)');
  await page.locator('[data-setting-reminder-prep-switch]').click();
  await page.locator('[data-setting-reminder-morning-at]').fill('09:00');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/n2-reminders.png`, fullPage: false });

  // ---------- The calendar: just the dinners for a phone with notifications ----------
  await page.locator('[data-calendar-sync-on]').click();
  await page.waitForTimeout(2500);
  await page.locator('[data-calendar-sync]').scrollIntoViewIfNeeded();
  check(
    (await page.locator('[data-segmented="calendar-feed"] button[aria-pressed="true"]').innerText()) ===
      'Just the dinners',
    'calendar: just the dinners, since this phone has notifications',
  );
  check(
    /raw\/meal-planner-calendar\.ics$/.test(await text('[data-calendar-sync-url]')),
    'calendar: the dinners-only feed link',
    await text('[data-calendar-sync-url]'),
  );
  await page.screenshot({ path: `${OUT}/n3-calendar.png`, fullPage: false });

  // ---------- Adding things by hand: sent straight away, each listing what was added just before ----------
  await goTab(page, 'Shop');
  await page.waitForTimeout(600);
  const listNotes = () => calls.filter((c) => c.action === 'notify' && !c.body.test);
  await page.locator('[data-quick-add]').fill('bin bags');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(
    listNotes().length === 1 &&
      /^Peter added Bin Bags$/i.test(listNotes()[0].body.body) &&
      listNotes()[0].body.from === 'P',
    'sent straight away: "Peter added Bin Bags"',
    JSON.stringify(listNotes()),
  );
  await page.locator('[data-quick-add]').fill('eggs');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(
    listNotes().length === 2 && /^Peter added Bin Bags and Eggs$/i.test(listNotes()[1].body.body),
    'the next one lists both (it replaces the first on the other phone)',
    JSON.stringify(listNotes()),
  );
  // Morning time: only 6am to 11:45am
  await goTab(page, 'Settings');
  await page.waitForTimeout(600);
  await page.locator('[data-setting-reminder-morning-at]').fill('14:00');
  await page.waitForTimeout(300);
  check((await state()).preferences.notifyMorningAt !== '14:00', 'an afternoon time is not taken');

  // ---------- Turn off ----------
  await page.locator('[data-notify-off]').click();
  await page.waitForTimeout(600);
  check(
    calls.some((c) => c.action === 'unsubscribe' && c.body.household === household),
    'Turn off: this phone signs off',
  );
  check((await page.locator('[data-notify-on]').count()) === 1, 'and offers to turn it on again');
  check(
    (await page.locator('[data-segmented="calendar-feed"] button[aria-pressed="true"]').innerText()) ===
      'With reminders' && /meal-planner-calendar-alerts\.ics$/.test(await text('[data-calendar-sync-url]')),
    'calendar: now offers the feed with the reminders as alerts',
    await text('[data-calendar-sync-url]'),
  );

  check(errors.length === 0, 'no page errors', errors.join(' | '));
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
