// Voice in cooking mode: commands (next, back, repeat, timers, step N), chatter ignored, questions to Gemini (typed and spoken), and what happens without speech.
// cooking mode (amounts per step, get everything out, timers that survive leaving, big steps,
// read aloud, method switch), finished screen (fridge, freezer, verdict, note), day panel, weeks.
const { chromium, devices } = require('./pw.cjs');
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
  // Gemini: answer from the prompt so we can check what it was sent
  let lastPrompt = '';
  await ctx.route(/generativelanguage\.googleapis\.com/, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    lastPrompt = body?.contents?.[0]?.parts?.[0]?.text || '';
    const answer = /crème fraîche/i.test(lastPrompt)
      ? 'Yes, crème fraîche works well; stir in 150 ml at the end off the heat.'
      : 'Simmer until thick, about 45 minutes.';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }),
    });
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
      localStorage.setItem('gemini_api_key', 'test-key');
    }
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: (u) => {
          window.__spoken.push(u.text);
          setTimeout(() => {
            u.onstart?.();
            setTimeout(() => u.onend && u.onend(), 30);
          }, 5);
        },
        cancel: () => window.__spoken.push('|'),
        getVoices: () => [],
        resume: () => {},
      },
      configurable: true,
    });
    // A pretend microphone: window.__say('next') delivers a phrase to whichever recogniser is listening
    window.__recs = [];
    window.__starts = 0;
    class FakeRec {
      constructor() {
        this.running = false;
        window.__recs.push(this);
      }
      start() {
        this.running = true;
        window.__starts++;
        setTimeout(() => this.onstart && this.onstart(), 1);
      }
      stop() {
        this.abort();
      }
      abort() {
        if (!this.running) return;
        this.running = false;
        setTimeout(() => this.onend && this.onend(), 1);
      }
    }
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRec, configurable: true, writable: true });
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRec, configurable: true, writable: true });
    window.__say = (...alts) => {
      const rec = window.__recs.filter((r) => r.running).slice(-1)[0];
      if (!rec) return false;
      const result = alts.map((t) => ({ transcript: t }));
      result.isFinal = true;
      rec.onresult?.({ resultIndex: 0, results: [result] });
      return true;
    };
  }, seed());
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
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
  const lastReading = async () => {
    const sp = await page.evaluate(() => window.__spoken);
    const i = sp.lastIndexOf('|');
    return sp.slice(i + 1).join(' ');
  };
  const say = async (...alts) => {
    const ok = await page.evaluate((a) => window.__say(...a), alts);
    await page.waitForTimeout(250);
    return ok;
  };
  const stepNow = async () => await text('[data-cook-step]');

  await tab('Cook');
  await page.locator('[data-tonight-start]').click();
  await page.waitForTimeout(400);

  // ---- The controls fit on a phone ----
  const row = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-cook-big],[data-cook-read],[data-cook-voice],[data-cook-ask]')].map(
      (x) => x.getBoundingClientRect(),
    );
    return {
      right: Math.max(...b.map((r) => r.right)),
      top: new Set(b.map((r) => Math.round(r.top))).size,
      width: window.innerWidth,
    };
  });
  check(row.right <= row.width && row.top === 1, 'Big / Read / Voice / Ask fit on one row', JSON.stringify(row));

  // ---- Voice on ----
  await page.locator('[data-cook-voice]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-cook-voice][aria-pressed="true"]').count()) === 1, 'Voice turns on');
  check(/Listening/.test(await text('[data-voice-status]')), 'says it is listening', await text('[data-voice-status]'));
  await shot('01-listening');

  check(await say('next step'), 'microphone is listening');
  check(/Step 1 of 4/.test(await stepNow()), '"next step" moves on', await stepNow());
  await page.waitForTimeout(200);
  check(
    /^Step 1 of 4\. Fry the onions/.test(await lastReading()),
    'reads the new step out (hands-free)',
    await lastReading(),
  );
  check(
    /Heard “next step”/.test(await text('[data-voice-status]')),
    'shows what it heard',
    await text('[data-voice-status]'),
  );

  await say('necks', 'next'); // the second guess counts
  check(/Step 2 of 4/.test(await stepNow()), "uses the recogniser's second guess", await stepNow());
  await say('go back');
  check(/Step 1 of 4/.test(await stepNow()), '"go back" goes back', await stepNow());
  await say('we need to go next week to the shops');
  check(/Step 1 of 4/.test(await stepNow()), 'kitchen chatter is ignored', await stepNow());
  check(/not a command/.test(await text('[data-voice-status]')), 'says it heard something that was not a command');
  await page.waitForTimeout(300);
  await say('say that again');
  check(
    /^Step 1 of 4\. Fry the onions/.test(await lastReading()),
    '"say that again" repeats the step',
    await lastReading(),
  );
  await say('go to step three');
  check(/Step 3 of 4/.test(await stepNow()), '"go to step three"', await stepNow());

  // ---- Timers by voice ----
  await say('start the timer');
  check(
    (await page.locator('[data-timer-bar] [data-timer="Simmer"]').count()) === 1,
    '"start the timer" starts this step\'s timer',
    await text('[data-timer-bar]'),
  );
  await page.waitForTimeout(200);
  check(/Simmer timer started, 45 minutes/.test(await lastReading()), 'and says so', await lastReading());
  await say('how long left');
  await page.waitForTimeout(200);
  check(/Simmer, 45 minutes left/.test(await lastReading()), '"how long left"', await lastReading());
  await say('set a timer for 10 minutes');
  check((await page.locator('[data-timer-bar] [data-timer="Timer"]').count()) === 1, '"set a timer for 10 minutes"');
  await say('stop the timer');
  check(
    (await page.locator('[data-timer-bar] [data-timer="Timer"]').count()) === 0 &&
      (await page.locator('[data-timer-bar] [data-timer="Simmer"]').count()) === 1,
    '"stop the timer" stops the newest one',
  );
  await say('stop');
  check((await page.locator('[data-timer-bar]').count()) === 0, '"stop" stops the other');

  // ---- Questions by voice ----
  await say('question can I use crème fraîche instead of soured cream');
  await page.waitForTimeout(500);
  check(
    /Can I use crème fraîche instead of soured cream\?/.test(await text('[data-answer-q]')),
    'spoken question shown',
  );
  check(
    /crème fraîche works well/.test(await text('[data-answer-a]')),
    'Gemini answer shown',
    await text('[data-answer]'),
  );
  check(
    /Recipe: Chilli con carne/.test(lastPrompt) &&
      /Cooking for 4 people/.test(lastPrompt) &&
      /500 g beef mince/.test(lastPrompt) &&
      /on step 3 of 4/.test(lastPrompt),
    'Gemini is sent the recipe as being cooked (amounts, people, step)',
    lastPrompt.slice(0, 400),
  );
  await page.waitForTimeout(300);
  check(/crème fraîche works well/.test(await lastReading()), 'answer is read out', await lastReading());
  await shot('02-answer');
  await page.locator('[data-answer-close]').click();

  // ---- Voice off ----
  await page.locator('[data-cook-voice]').click();
  await page.waitForTimeout(200);
  check(!(await say('next')) && /Step 3 of 4/.test(await stepNow()), 'Voice off: not listening');

  // ---- Typed question ----
  await page.locator('[data-cook-ask]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-ask-input]').fill('How thick should it be?');
  await shot('03-ask');
  await page.locator('[data-ask-send]').click();
  await page.waitForTimeout(500);
  check(
    /Simmer until thick/.test(await text('[data-answer-a]')),
    'typed question answered',
    await text('[data-answer]'),
  );

  // ---- No Gemini key ----
  await page.evaluate(() => localStorage.removeItem('gemini_api_key'));
  await page.locator('[data-cook-ask]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-ask-sheet] button', { hasText: 'Can I freeze this?' }).click();
  await page.waitForTimeout(400);
  check(
    /add your Gemini key in Settings/.test(await text('[data-answer-a]')),
    'no key: says where to add it',
    await text('[data-answer]'),
  );
  await page.locator('[data-cook-close]').click();

  // ---- No speech recognition at all ----
  {
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
    await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx2.addInitScript((st) => {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(st));
      delete window.webkitSpeechRecognition;
      delete window.SpeechRecognition;
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    }, seed());
    const p2 = await ctx2.newPage();
    await p2.clock.install({ time: NOW });
    await p2.goto(URL);
    await p2.waitForTimeout(1200);
    await p2.locator('nav button', { hasText: /^Cook$/ }).click();
    await p2.waitForTimeout(500);
    await p2.locator('[data-tonight-start]').click();
    await p2.waitForTimeout(300);
    await p2.locator('[data-cook-voice]').click();
    await p2.waitForTimeout(300);
    const note = (
      await p2
        .locator('[data-read-note]')
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
    check(/Voice commands aren't available here/.test(note), 'no recognition: Voice explains', note);
    await ctx2.close();
  }

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
