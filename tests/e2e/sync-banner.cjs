// The sync warning on every tab: straight away when GitHub turns the token down; after two days
// without a sync when it's just no internet; and before the token runs out, when GitHub says when.
// Fix opens Settings → Sync & backup; Later hides it.
const { chromium, devices, goTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const { createMockGist } = require('./mockgist.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const NOW = new Date('2026-10-14T16:30:00+01:00');
const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const mock = createMockGist({ 'family-meal-planner.json': JSON.stringify(reviewSeed()) });
  const errors = [];
  /** A phone with sync set up: `token` (the mock only takes "test-token"), last synced `lastOkAgo` ago. */
  async function openPhone({ token = 'test-token', lastOkAgo = 60 * 60 * 1000, offline = false } = {}) {
    const ctx = await browser.newContext({
      ...devices['Pixel 7'],
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      serviceWorkers: 'block',
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route('https://api.github.com/**', (r) =>
      offline ? r.abort('internetdisconnected') : mock.handle(r, 'A'),
    );
    await ctx.addInitScript(
      ({ token, lastOk }) => {
        if (!localStorage.getItem('github_pat')) {
          localStorage.setItem('github_pat', token);
          localStorage.setItem('github_gist_id', 'testgist123');
          localStorage.setItem('currentUser', 'P');
          localStorage.setItem('last_sync_ok_at', String(lastOk));
        }
      },
      { token, lastOk: NOW.getTime() - lastOkAgo },
    );
    const page = await ctx.newPage();
    await page.clock.install({ time: NOW });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForTimeout(2500);
    return page;
  }
  const banner = (page) => page.locator('[data-sync-banner]');
  const bannerText = async (page) => ((await banner(page).count()) ? await banner(page).innerText() : '');

  // ---------- All well: no banner ----------
  let page = await openPhone();
  check((await banner(page).count()) === 0, 'synced: no warning');
  await page.context().close();

  // ---------- GitHub turns the token down: straight away, on every tab ----------
  page = await openPhone({ token: 'expired-token' });
  check(
    (await banner(page).getAttribute('data-sync-banner')) === 'token' &&
      /Sync has stopped: GitHub didn't accept the token/.test(await bannerText(page)) &&
      /Last synced 1 hour ago/.test(await bannerText(page)),
    'token turned down: says so straight away, and since when',
    await bannerText(page),
  );
  await goTab(page, 'Shop');
  await page.waitForTimeout(300);
  check((await banner(page).count()) === 1, 'shown on the Shop too');
  await page.screenshot({ path: `${OUT}/a-token.png` });
  await page.locator('[data-sync-banner-fix]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-settings-tab="sync"][aria-selected="true"]').count()) === 1 &&
      (await page.locator('[data-settings-sync]').count()) === 1,
    'Fix: opens Settings → Sync & backup',
  );
  check(/Not syncing right now/.test(await page.locator('[data-sync-status]').innerText()), 'which says what is wrong');
  await page.locator('[data-sync-banner-later]').click();
  await page.waitForTimeout(200);
  check((await banner(page).count()) === 0, 'Later: hidden');
  await goTab(page, 'Planning');
  await page.waitForTimeout(300);
  check((await banner(page).count()) === 0, 'and stays hidden on other tabs');
  await page.context().close();

  // ---------- No internet: nothing for a while, then after two days without a sync ----------
  page = await openPhone({ offline: true });
  check((await banner(page).count()) === 0, 'offline, synced an hour ago: no warning');
  await page.context().close();
  page = await openPhone({ offline: true, lastOkAgo: 3 * DAY });
  check(
    (await banner(page).getAttribute('data-sync-banner')) === 'stale' &&
      /^Last synced 3 days ago\. No internet just now/.test(await bannerText(page)),
    'offline, last synced 3 days ago: says so',
    await bannerText(page),
  );
  await page.screenshot({ path: `${OUT}/b-stale.png` });
  await page.context().close();

  // ---------- The token runs out soon (GitHub says when) ----------
  mock.tokenExpires = '2026-10-24 10:00:00 UTC';
  page = await openPhone();
  check(
    (await banner(page).getAttribute('data-sync-banner')) === 'expiring' &&
      /runs out on Sat 24 Oct/.test(await bannerText(page)),
    'token running out in 10 days: warned beforehand',
    await bannerText(page),
  );
  await page.locator('[data-sync-banner-fix]').click();
  await page.waitForTimeout(400);
  check(
    /The GitHub token runs out on Sat 24 Oct 2026/.test(await page.locator('[data-sync-token-expires]').innerText()),
    'Settings → Sync says when the token runs out',
  );
  await page.screenshot({ path: `${OUT}/c-expiring.png` });
  await page.context().close();
  mock.tokenExpires = '2027-10-24 10:00:00 UTC';
  page = await openPhone();
  check((await banner(page).count()) === 0, 'a year left: no warning');
  await page.context().close();

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
