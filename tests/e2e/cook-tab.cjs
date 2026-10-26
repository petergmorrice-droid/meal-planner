// Cook tab: tonight card, start-by, tomorrow's prep, compact week, freezer on tick (with undo),
// cooking mode (amounts per step, get everything out, timers that survive leaving, big steps,
// read aloud, method switch), finished screen (fridge, freezer, verdict, note), day panel, weeks.
const { chromium, devices, goTab } = require('./pw.cjs');
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
  s.batches.push({ id: 'b3', name: 'Spaghetti bolognese', recipeId: 'r-bol', portions: 2, dateAdded: '2026-09-20' });
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
    window.__buzz = 0;
    window.__spoken = [];
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        window.__buzz++;
        return true;
      },
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: (u) => window.__spoken.push(u.text),
        cancel: () => window.__spoken.push('|'),
        getVoices: () => [],
        resume: () => {},
      },
      configurable: true,
    });
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
  const mealOf = (st, planId, day) => st.mealPlans.find((p) => p.id === planId).days[day].meals[0];
  const batch = (st, id) => (st.batches || []).find((b) => b.id === id);
  const W = 'plan-2026-10-12';

  await tab('Cook');
  await shot('01-cook-tab');

  // ---- Header and the compact week ----
  check(
    (await text('[data-cook-week-name]')) === 'This week',
    'header says This week',
    await text('[data-cook-week-name]'),
  );
  check(
    /12–18 Oct · 2 of 6 cooked/.test(await text('[data-cook-week-status]')),
    'header: dates and cooked count',
    await text('[data-cook-week-status]'),
  );
  check(
    (await page.locator('[data-cook-row]').count()) === 7,
    'all seven days, Monday to Sunday',
    await page.locator('[data-cook-row]').count(),
  );
  const order = await page
    .locator('[data-cook-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-cook-row')).join(','));
  check(order === 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 'in order Monday to Sunday', order);
  const tops = await page.evaluate(() => {
    const box = document.querySelector('[data-cook-scroll]').getBoundingClientRect();
    const el = document.querySelector('[data-cook-row="Wednesday"]').getBoundingClientRect();
    return { off: el.top - box.top, scroll: document.querySelector('[data-cook-scroll]').scrollTop };
  });
  check(tops.scroll > 100 && tops.off >= 0 && tops.off < 40, "opens scrolled to today's card", JSON.stringify(tops));
  // Every card's buttons fit inside it, even on a narrow phone
  const overflow = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-cook-row]')].flatMap((card) => {
        const c = card.getBoundingClientRect();
        return [...card.querySelectorAll('button')]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width && (r.right > c.right + 0.5 || r.left < c.left - 0.5);
          })
          .map((b) => card.getAttribute('data-cook-row') + ':' + b.innerText);
      }),
    );
  check((await overflow()).length === 0, 'buttons fit on the cards (390px)', JSON.stringify(await overflow()));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300);
  check((await overflow()).length === 0, 'buttons fit on the cards (320px)', JSON.stringify(await overflow()));
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(300);
  check(/Today/i.test(await text('[data-cook-row="Wednesday"]')), 'today is labelled Today');
  check(
    /Takeaway/.test(await text('[data-cook-row="Saturday"]')),
    'takeout reads Takeaway',
    await text('[data-cook-row="Saturday"]'),
  );
  check(
    /Leftovers from Wed/i.test(await text('[data-cook-row="Friday"]')),
    'leftovers say where from',
    await text('[data-cook-row="Friday"]'),
  );
  check(
    /freeze 4/.test(await text('[data-cook-row="Wednesday"]')),
    'batch cook shows freeze 4',
    await text('[data-cook-row="Wednesday"]'),
  );

  // ---- Today's card: more than the others ----
  check(
    /Chilli con carne/.test(await text('[data-cook-row="Wednesday"] [data-cook-open]')),
    "today's card shows the meal",
  );
  check(
    /Cook for 4 \(2 for Fri\)/.test(await text('[data-cook-row="Wednesday"] [data-cook-extra]')),
    'today: cook for 4 incl. 2 for Friday',
    await text('[data-cook-row="Wednesday"] [data-cook-people]'),
  );
  check(
    /Start by 4:45pm to eat at 6pm/.test(await text('[data-start-by]')),
    'default 6pm: start by 4:45pm',
    await text('[data-start-by]'),
  );
  check(
    (await page.locator('[data-cook-row="Wednesday"] [data-start-by]').count()) === 1 &&
      (await page.locator('[data-start-by]').count()) === 1,
    'start time only on today',
  );
  check(/Batch cook: freeze 4/.test(await text('[data-cook-note="Wednesday"]')), 'today shows the note');
  check(
    (await page.locator('[data-cook-row="Wednesday"] [data-tonight-start]').count()) === 1,
    'today has a big Start cooking',
  );
  await page.locator('[data-dinner-time]').click();
  await page.locator('[data-dinner-input]').fill('19:30');
  await page.locator('[data-dinner-input]').press('Enter');
  await page.waitForTimeout(300);
  check(
    /Start by 6:15pm to eat at 7:30pm/.test(await text('[data-start-by]')),
    'dinner time change moves start-by',
    await text('[data-start-by]'),
  );
  let prefs = (await state()).preferences;
  check(
    prefs.eatAtTonight?.time === '19:30' && prefs.eatAtTonight?.date === '2026-10-14' && !prefs.eatAt,
    'changed just for tonight (usual time untouched)',
    JSON.stringify(prefs.eatAtTonight),
  );
  check(
    /Just tonight · usually 6pm/.test(await text('[data-eat-at-tonight]')),
    'says just tonight, usually 6pm',
    await text('[data-start-by]'),
  );
  await page.locator('[data-eat-at-reset]').click();
  await page.waitForTimeout(300);
  check(
    /Start by 4:45pm to eat at 6pm/.test(await text('[data-start-by]')) && !(await state()).preferences.eatAtTonight,
    'back to the usual 6pm',
    await text('[data-start-by]'),
  );
  // The usual time lives in Settings → my household
  await tab('Settings');
  check((await page.locator('[data-setting-eat-at-input]').inputValue()) === '18:00', 'Settings shows 6pm by default');
  await page.locator('[data-setting-eat-at-input]').fill('18:30');
  await page.waitForTimeout(300);
  check((await state()).preferences.eatAt === '18:30', 'Settings saves the usual time');
  await tab('Cook');
  check(
    /Start by 5:15pm to eat at 6:30pm/.test(await text('[data-start-by]')),
    'Cook tab uses the Settings time',
    await text('[data-start-by]'),
  );
  await tab('Settings');
  await page.locator('[data-setting-eat-at-input]').fill('19:30');
  await page.waitForTimeout(300);
  await tab('Cook');
  check(/Tmrw/i.test(await text('[data-cook-row="Thursday"]')), 'tomorrow is labelled');
  check(
    /For tomorrow: Take the Spaghetti bolognese out of the freezer tonight/.test(
      await text('[data-cook-row="Wednesday"] [data-prep-tonight]'),
    ),
    "today's card: take it out of the freezer for tomorrow",
    await text('[data-prep-tonight]'),
  );
  await shot('02-tonight');

  // ---- Freezer meal ticked: portions come off (batch used up, then put back) ----
  await page.locator('[data-cook-tick="Thursday"]').click();
  await page.waitForTimeout(300);
  let st = await state();
  check(
    mealOf(st, W, 'Thursday').cooked === true && !batch(st, 'b3'),
    'ticking a freezer meal takes it out (batch used up)',
    JSON.stringify(st.batches),
  );
  check(
    /Took 2 portions of Spaghetti bolognese out of the freezer · none left/.test(await text('[data-toast]')),
    'toast says what came out',
    await text('[data-toast]'),
  );
  await shot('03-freezer-tick');
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    mealOf(st, W, 'Thursday').cooked === false &&
      batch(st, 'b3')?.portions === 2 &&
      batch(st, 'b3')?.name === 'Spaghetti bolognese',
    'undo puts it back in the freezer',
    JSON.stringify(st.batches),
  );
  check(!mealOf(st, W, 'Thursday').tookFromFreezer, 'undo clears the record');

  // ---- Cooking mode ----
  await page.locator('[data-tonight-start]').click();
  await page.waitForTimeout(500);
  check((await text('[data-cook-title]')) === 'Chilli con carne', 'cook mode title');
  check(
    /Prep 15 · cook 60 min · Wednesday/.test(await text('[data-cook-times]')),
    'prep and cook times shown',
    await text('[data-cook-times]'),
  );
  check(/for 4/.test(await text('[data-cook-servings]')), 'cooking for 4', await text('[data-cook-servings]'));
  check(
    /Cook for 4: 2 extra for Friday/.test(await text('[data-cook-banner]')),
    'banner: extra for Friday',
    await text('[data-cook-banner]'),
  );
  check(
    /500 g beef mince/.test(await text('[data-get-out]')),
    'get everything out: scaled amounts',
    await text('[data-get-out]'),
  );
  check((await page.locator('[data-cook-method]').count()) === 1, 'oven/Ninja switch shown');
  const step2 = await text('[data-step="2"]');
  check(
    /500g mince/.test(step2) && /beef mince/.test(await text('[data-step="2"] [data-step-needs]')),
    'step 2 scaled, with what it needs',
    step2,
  );
  await shot('04-cook-mode');
  // Get everything out ticks
  await page.locator('[data-get-out] button').first().click();
  check(/1 of 8/.test(await text('[data-step="0"]')), 'ticking things out counts', await text('[data-step="0"]'));
  // Timer on step 3
  await page.locator('[data-step="3"] [data-start-timer="45"]').click();
  await page.waitForTimeout(700);
  check(
    (await page.locator('[data-timer-bar] [data-timer="Simmer"]').count()) === 1,
    'named timer "Simmer" started',
    await text('[data-timer-bar]'),
  );
  check(
    /44:5\d|45:00/.test(await text('[data-timer-bar] [data-timer-left]')),
    'timer counts down from 45:00',
    await text('[data-timer-bar] [data-timer-left]'),
  );
  check(
    (await page.locator('[data-step="3"] [data-step-timer-running]').count()) === 1,
    'step shows its running timer',
  );
  await page.locator('[data-step="1"] [data-start-timer="8"]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-timer-bar] [data-timer]').count()) === 2, 'two timers at once');
  await page.locator('[data-timer="Fry the onions"] button[aria-label^="Stop"]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-timer-bar] [data-timer]').count()) === 1, 'a timer can be stopped');
  await shot('05-timer');
  // Leave cooking mode: the timer keeps going on the Cook tab and on other tabs
  await page.locator('[data-cook-close]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-timer-bar] [data-timer="Simmer"]').count()) === 1,
    'timer still running on the Cook tab',
  );
  await tab('Shop');
  check((await page.locator('[data-timer-dock] [data-timer="Simmer"]').count()) === 1, 'timer shown on other tabs');
  await page.clock.fastForward('45:05');
  await page.waitForTimeout(2200);
  check(
    (await page.locator('[data-timer-dock] [data-timer-ringing]').count()) === 1,
    'timer rings when done (on another tab)',
  );
  check((await page.evaluate(() => window.__buzz)) > 0, 'it buzzes');
  await shot('06-ringing');
  await page.locator('[data-timer-dock] button', { hasText: '+1 min' }).click();
  await page.waitForTimeout(700);
  check(
    /^(0:5\d|1:00)$/.test(await text('[data-timer-dock] [data-timer-left]')),
    '+1 min restarts it with a minute',
    await text('[data-timer-dock] [data-timer-left]'),
  );
  await page.locator('[data-timer-dock] button[aria-label^="Stop"]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-timer-dock]').count()) === 0, 'stopped timer goes');
  await tab('Cook');

  // Big steps + read aloud + method switch
  await page.locator('[data-tonight-start]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-cook-big]').click();
  await page.waitForTimeout(300);
  check(/Get everything out/.test(await text('[data-big-step]')), 'big steps starts with get everything out');
  await page.locator('[data-big-next]').click();
  await page.waitForTimeout(300);
  check(
    /Fry the onions and peppers for 8 mins/.test(await text('[data-big-text]')),
    'big steps: next shows step 1',
    await text('[data-big-text]'),
  );
  check((await page.evaluate(() => localStorage.getItem('cook_big_steps'))) === '1', 'big steps remembered');
  const fits = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-big-fit]');
      return {
        fits: el.scrollHeight <= el.clientHeight + 1,
        size: parseFloat(getComputedStyle(el).getPropertyValue('--fit')),
      };
    });
  const nextH = await page.locator('[data-big-next]').evaluate((b) => b.getBoundingClientRect().height);
  check(nextH <= 60, 'Next is a normal-sized button', nextH);
  let f = await fits();
  check(f.fits && f.size === 30, 'a short step fits at full size', JSON.stringify(f));
  await shot('07-big-steps');
  // Read aloud: reads straight away from the tap, then each step you move to
  const lastReading = async () => {
    const sp = await page.evaluate(() => window.__spoken);
    const i = sp.lastIndexOf('|');
    return sp.slice(i + 1).join(' ');
  };
  await page.locator('[data-cook-read]').click();
  await page.waitForTimeout(300);
  check(
    /^Step 1 of 4\. Fry the onions and peppers/.test(await lastReading()),
    'read aloud reads the step',
    await lastReading(),
  );
  check(/Read it again/.test(await text('[data-read-on]')), 'shows Read it again while on');
  await page.locator('[data-big-next]').click();
  await page.waitForTimeout(300);
  check(
    /^Step 2 of 4\. Add 500 grams mince/.test(await lastReading()),
    'reads each step as you go (scaled)',
    await lastReading(),
  );
  const before = (await page.evaluate(() => window.__spoken)).length;
  await page.locator('[data-read-again]').click();
  await page.waitForTimeout(200);
  check(
    (await page.evaluate(() => window.__spoken)).length > before && /^Step 2 of 4/.test(await lastReading()),
    'Read it again repeats the step',
  );
  // A long step shrinks to fit
  await page.locator('[data-big-next]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-big-next]').click();
  await page.waitForTimeout(400);
  check(/Step 4 of 4/.test(await text('[data-big-step]')), 'on the long last step');
  check(
    /^Step 4 of 4\. Serve with rice\./.test(await lastReading()) &&
      (await page.evaluate(() => window.__spoken)).slice(-3).every((x) => x !== '|'),
    'a long step is read in pieces',
    await lastReading(),
  );
  f = await fits();
  check(f.fits && f.size < 30 && f.size >= 17, 'a long step shrinks to fit the screen', JSON.stringify(f));
  await shot('07b-big-long-step');
  await page.locator('[data-big-back]').click();
  await page.locator('[data-big-back]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-cook-read]').click();
  await page.locator('[data-cook-method] button', { hasText: 'Ninja' }).click();
  await page.waitForTimeout(300);
  check(/Prep 10 · cook 35 min/.test(await text('[data-cook-times]')), 'Ninja times', await text('[data-cook-times]'));
  check(/Get everything out/.test(await text('[data-big-step]')), 'switching method starts again at the top');
  await page.locator('[data-cook-big]').click();
  await page.waitForTimeout(200);
  check(/Sear for 5 mins/.test(await text('[data-step="1"]')), 'Ninja steps shown', await text('[data-step="1"]'));
  await page.locator('[data-cook-method] button', { hasText: 'Oven/Hob' }).click();
  await page.waitForTimeout(200);

  // Finish: fridge, freezer, verdict, note
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-cook-next]').click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  check((await page.locator('[data-finished]').count()) === 1, 'finished screen');
  check(
    /Put 2 portions in the fridge for Friday/.test(await text('[data-finished-fridge]')),
    'fridge line',
    await text('[data-finished-fridge]'),
  );
  check((await text('[data-freeze-count]')) === '4', 'freezer count from the note', await text('[data-freeze-count]'));
  check(
    (await page.locator('[data-finished-rating] [data-rating-row]').count()) === 2,
    'How was it? a row each for Peter and Rachel',
  );
  await page.locator('[data-finished-rating] [data-star="4"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-finished-note]').fill('More cumin next time');
  await shot('08-finished');
  await page.locator('[data-finished-done]').click();
  await page.waitForTimeout(500);
  st = await state();
  const m3 = mealOf(st, W, 'Wednesday');
  const frozen = m3.froze && batch(st, m3.froze.batchId);
  check(
    m3.cooked === true && frozen && frozen.portions === 4 && frozen.recipeId === 'r-chilli',
    'done: ticked and 4 portions in the freezer',
    JSON.stringify({ m3, batches: st.batches }),
  );
  const chilli = st.recipes.find((r) => r.id === 'r-chilli');
  const myStars = (st.preferences.ratings || []).find((r) => r.recipeId === 'r-chilli');
  check(
    myStars && myStars.stars === 4 && /More cumin next time/.test(chilli.notes || ''),
    'rating (4 stars, yours) and note saved',
    JSON.stringify({ r: st.preferences.ratings, n: chilli.notes }),
  );
  check((await page.locator('[data-freeze-prompt]').count()) === 0, 'no second freezer question');
  check(
    /4 portions in the freezer/.test(await text('[data-toast]')),
    'toast after cooking',
    await text('[data-toast]'),
  );

  // Untick takes those portions back off; ticking from the list asks about the freezer
  await page.locator('[data-cook-tick="Wednesday"]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(
    !mealOf(st, W, 'Wednesday').cooked && !batch(st, m3.froze.batchId) && !mealOf(st, W, 'Wednesday').froze,
    'untick takes the frozen portions back off',
    JSON.stringify(st.batches),
  );
  await page.locator('[data-cook-tick="Wednesday"]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-freeze-prompt]').count()) === 1 && (await text('[data-freeze-prompt-count]')) === '4',
    'ticking a batch cook asks about the freezer',
  );
  await shot('09-freeze-prompt');
  await page.locator('[data-freeze-prompt] button[aria-label="One fewer"]').click();
  await page.locator('[data-freeze-prompt-add]').click();
  await page.waitForTimeout(300);
  st = await state();
  const m3b = mealOf(st, W, 'Wednesday');
  check(
    m3b.cooked && m3b.froze?.portions === 3 && batch(st, m3b.froze.batchId)?.portions === 3,
    'added 3 portions',
    JSON.stringify(m3b),
  );

  // Day panel (same as Planning) with Start cooking; move with undo
  await page.locator('[data-cook-row="Sunday"] button').first().click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-day-sheet="Sunday"] [data-day-start-cooking]').count()) === 1,
    'day panel has Start cooking',
  );
  await shot('10-day-panel');
  await page.locator('[data-move-meal]').click();
  await page.locator('[data-move-to="Saturday"]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    mealOf(st, W, 'Saturday').name === 'Sausage & mash' && mealOf(st, W, 'Sunday').type === 'takeout',
    'swap Saturday and Sunday',
  );
  await page.locator('[data-toast-undo]').click();
  await page.waitForTimeout(300);
  st = await state();
  check(mealOf(st, W, 'Sunday').name === 'Sausage & mash', 'undo the swap');

  // Recipe pop-up shows the verdict
  await page.locator('[data-cook-row="Wednesday"] button').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-open-recipe]').click();
  await page.waitForTimeout(500);
  check((await page.locator('[data-recipe-ratings] [data-stars="4"]').count()) === 1, 'recipe shows your 4 stars');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const close = page.locator('button[aria-label="Close"]:visible');
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(300);

  // Next week
  await page.locator('[data-cook-week-next]').click();
  await page.waitForTimeout(300);
  check(
    (await text('[data-cook-week-name]')) === 'Next week' && (await page.locator('[data-tonight]').count()) === 0,
    'next week: no tonight card',
  );
  check(
    /freeze 4/.test(await text('[data-cook-row="Wednesday"]')) &&
      /Eating out/.test(await text('[data-cook-row="Friday"]')),
    'next week rows',
    await text('[data-cook-week]'),
  );
  await shot('11-next-week');

  // Cookbook cooking still works (no tick)
  await tab('Cookbook');
  await page.locator('text=Cheese omelette').first().click();
  await page.waitForTimeout(500);
  const startCook = page.locator('button', { hasText: /Start cooking|Cook mode|Cook this/i }).first();
  if (await startCook.count()) {
    await startCook.click();
    await page.waitForTimeout(400);
    check((await text('[data-cook-title]')) === 'Cheese omelette', 'cookbook opens cooking mode');
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-cook-next]').click();
      await page.waitForTimeout(100);
    }
    check(
      /^Done$/.test(await text('[data-finished-done]')),
      'cookbook finish is just Done',
      await text('[data-finished-done]'),
    );
    await page.locator('[data-finished-done]').click();
    await page.waitForTimeout(300);
    check((await page.locator('[data-cook-mode]').count()) === 0, 'closes');
  } else check(false, 'cookbook start cooking button found');

  // A browser without speech (some apps' built-in browsers): Read says why instead of doing nothing
  {
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
    await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx2.addInitScript((st) => {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(st));
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    }, seed());
    const p2 = await ctx2.newPage();
    await p2.clock.install({ time: NOW });
    await p2.goto(URL);
    await p2.waitForTimeout(1200);
    await p2.locator('nav button', { hasText: /^Cook$/ }).click();
    await p2.waitForTimeout(500);
    await p2.locator('[data-tonight-start]').click();
    await p2.waitForTimeout(300);
    await p2.locator('[data-cook-read]').click();
    await p2.waitForTimeout(300);
    const note = (
      await p2
        .locator('[data-read-note]')
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
    check(
      /isn't available here/.test(note) && (await p2.locator('[data-cook-read][aria-pressed="true"]').count()) === 0,
      'no speech: Read explains instead of doing nothing',
      note,
    );
    await p2.screenshot({ path: `${OUT}/12-no-speech.png` });
    await ctx2.close();
  }

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
