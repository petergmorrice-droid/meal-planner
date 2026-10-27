// Settings → Calendar: with calendar sync on, each upload to the sync Gist also writes two calendar
// feeds, just the dinners and the dinners with the reminders as alerts, which each person's calendar
// subscribes to; changes made on either phone reach them, and switching it off takes them away.
const { chromium, devices, goTab, settingsTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const { createMockGist } = require('./mockgist.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const NOW = new Date('2026-10-14T16:30:00+01:00');
const FEED = 'meal-planner-calendar.ics';
const ALERTS = 'meal-planner-calendar-alerts.ics';
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
  const settings = async (page) => {
    await goTab(page, 'Settings');
    await page.waitForTimeout(600);
    await settingsTab(page, 'alerts');
    await page.locator('[data-calendar-sync]').scrollIntoViewIfNeeded();
  };
  const comeBack = async (page) => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(2500);
  };
  const feed = () => mock.gist.files[FEED] || '';
  const alerts = () => mock.gist.files[ALERTS] || '';

  const A = await openPhone('A');
  const B = await openPhone('B');

  // ---------- Peter turns it on ----------
  await settings(A);
  check(!feed() && !alerts(), 'no feeds in the Gist before it is turned on');
  await A.locator('[data-calendar-sync-on]').click();
  await A.waitForTimeout(2500); // sent to the Gist
  check(
    /BEGIN:VCALENDAR/.test(feed()) && /BEGIN:VCALENDAR/.test(alerts()),
    'turning it on writes both calendar feeds to the Gist',
    Object.keys(mock.gist.files).join(', '),
  );
  check(
    /SUMMARY:Dinner: /.test(feed()) && !/SUMMARY:Start cooking: /.test(feed()) && !/BEGIN:VALARM/.test(feed()),
    'one has just the planned dinners',
    feed().slice(0, 800),
  );
  check(
    /SUMMARY:Dinner: /.test(alerts()) && /SUMMARY:Start cooking: /.test(alerts()) && /BEGIN:VALARM/.test(alerts()),
    'the other has the dinners and the reminders with alerts',
    alerts().slice(0, 800),
  );
  check(
    (await A.locator('[data-segmented="calendar-feed"] button[aria-pressed="true"]').innerText()) === 'With reminders',
    'a phone without notifications is offered the feed with reminders',
  );
  const url = await A.locator('[data-calendar-sync-url]').innerText();
  check(url === `https://gist.githubusercontent.com/testuser/testgist123/raw/${ALERTS}`, 'shows its link', url);
  await A.locator('[data-segmented="calendar-feed"] button', { hasText: 'Just the dinners' }).click();
  check(
    (await A.locator('[data-calendar-sync-url]').innerText()) ===
      `https://gist.githubusercontent.com/testuser/testgist123/raw/${FEED}`,
    'or just the dinners',
  );
  await A.locator('[data-segmented="calendar-feed"] button', { hasText: 'With reminders' }).click();
  check(
    (await A.locator('[data-calendar-sync-apple]').getAttribute('href')).startsWith('webcal://gist.githubusercontent'),
    'iPhone / Mac button subscribes with webcal://',
  );
  check(
    /calendar\.google\.com\/calendar\/r\?cid=webcal/.test(
      await A.locator('[data-calendar-sync-google]').getAttribute('href'),
    ),
    'Google Calendar button adds it by link',
  );
  await A.locator('[data-calendar-sync-how]').click();
  await A.screenshot({ path: `${OUT}/a-calendar-sync-on.png` });

  // ---------- Rachel's phone: already on, same link; her change reaches the feed ----------
  await comeBack(B);
  await settings(B);
  check(
    (await B.locator('[data-calendar-sync-url]').innerText()) === url,
    "Rachel's phone shows it on with the same link",
  );
  check(!/TRIGGER:-PT30M/.test(alerts()), 'alerts at the start time to begin with');
  await B.locator('[data-segmented="reminder-cook"] button', { hasText: '30 mins' }).click();
  await B.waitForTimeout(2500);
  check(/TRIGGER:-PT30M/.test(alerts()), "Rachel's change to the alert time updates the feed", alerts().slice(0, 600));
  await B.screenshot({ path: `${OUT}/b-calendar-sync.png` });

  // ---------- A Gist from before there were two feeds gets the new one at the next sync ----------
  delete mock.gist.files[ALERTS];
  await comeBack(A);
  check(
    /BEGIN:VALARM/.test(alerts()),
    'the missing feed is written without waiting for a change',
    Object.keys(mock.gist.files).join(', '),
  );

  // ---------- Turned off: the feed goes from the Gist ----------
  await B.locator('[data-calendar-sync-off]').click();
  await B.waitForTimeout(2500);
  check(!(FEED in mock.gist.files) && !(ALERTS in mock.gist.files), 'turning it off removes both feeds from the Gist');
  check((await B.locator('[data-calendar-sync-on]').count()) === 1, 'and offers to turn it on again');
  check('family-meal-planner.json' in mock.gist.files, 'the app data is still there');

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
