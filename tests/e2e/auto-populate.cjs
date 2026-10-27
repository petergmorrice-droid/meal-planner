// Auto populate, end to end: the button under Past weeks (with Copy a week), last week's leftovers (an uncooked
// Thursday), the questions, suggestions that use them up (the uncooked meal itself comes first; the
// freezer on a busy night), Another,
// leaving a day empty, an idea from Gemini written and saved to the cookbook, putting it all on the
// week, and the leftovers coming off the shopping. Gemini is a stand-in that answers as scripted.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

function seed() {
  const s = reviewSeed();
  // Next week: just Monday planned, so there's a week to fill.
  const next = s.mealPlans[1];
  for (const d of Object.keys(next.days)) if (d !== 'Monday') next.days[d].meals = [];
  // Something that uses up chicken and coriander.
  s.recipes.push({
    id: 'r-stirfry',
    name: 'Chicken & coriander stir fry',
    description: '',
    servings: 2,
    prepTime: 10,
    cookTime: 10,
    ingredients: [
      { id: 'sf1', name: 'chicken breasts', amount: 2, unit: '', category: 'Meat & Seafood' },
      { id: 'sf2', name: 'coriander', amount: 1, unit: 'tbsp', category: 'Produce' },
      { id: 'sf3', name: 'egg noodles', amount: 200, unit: 'g' },
    ],
    instructions: ['Stir fry the chicken.', 'Add the noodles and coriander.'],
    tags: [],
  });
  return s;
}

// Gemini's answers: ideas, then the recipe it writes, then (maybe) product matches.
const IDEA = 'Creamy chicken & courgette pasta';
function geminiAnswer(prompt) {
  if (/Suggest 4 different dinners/.test(prompt)) {
    return {
      ideas: [
        { name: IDEA, description: 'A quick creamy pasta.', uses: ['about 2 chicken breasts'], minutes: 25 },
        { name: 'Courgette fritters', description: 'Crisp and green.', uses: ['2 courgette'], minutes: 30 },
      ],
    };
  }
  if (/Create an original/.test(prompt)) {
    return {
      name: IDEA,
      description: 'A quick creamy pasta.',
      ingredients: [
        {
          name: 'Chicken Breasts',
          amount: 2,
          unit: 'piece',
          category: 'Meat & Seafood',
          suggestedAisle: 'Meat & Seafood',
        },
        { name: 'Courgette', amount: 1, unit: 'piece', category: 'Produce', suggestedAisle: 'Produce' },
        { name: 'Double Cream', amount: 100, unit: 'ml', category: 'Dairy', suggestedAisle: 'Dairy' },
        { name: 'Penne', amount: 200, unit: 'g', category: 'Pantry', suggestedAisle: 'Pantry' },
      ],
      instructions: ['Cook the pasta.', 'Fry the chicken and courgette, add the cream, toss with the pasta.'],
      prepTime: 10,
      cookTime: 15,
      servings: 2,
      tags: ['Quick'],
      isVegetarian: false,
      isVegan: false,
    };
  }
  return { matches: [] };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  // Friday: Mon-Wed ticked as cooked, Thursday's tikka masala wasn't; the weekend is still to come.
  await ctx.clock.install({ time: new Date('2026-10-16T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const asked = [];
  await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
    asked.push(prompt);
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiAnswer(prompt)) }] } }] }),
    });
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('gemini_api_key', 'test-key');
      localStorage.setItem('seeded', '1');
    }
  }, seed());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const S = seed();
  const nextId = S.mealPlans[1].id;
  const sheet = page.locator('[data-auto-populate]');

  await page.locator('nav button', { hasText: /^Planning$/ }).click();
  await page.waitForTimeout(500);

  // ---- The buttons: in the week menu, Copy a week then Auto populate, underneath Past weeks ----
  await page.locator('[data-week-name]').click();
  await page.waitForTimeout(200);
  const menu = await page.evaluate(() => {
    const r = (e) => e && e.getBoundingClientRect();
    const past = [...document.querySelectorAll('button')].find((b) => /Past weeks/.test(b.textContent || ''));
    const copy = document.querySelector('[data-menu-action="copy"]');
    const auto = document.querySelector('[data-menu-action="auto-populate"]');
    return { past: r(past), copy: r(copy), auto: r(auto), copyOn: !copy?.disabled, autoOn: !auto?.disabled };
  });
  check(menu.past && menu.copy && menu.auto, 'week menu: Past weeks, Copy a week and Auto populate');
  check(menu.copy?.top >= menu.past?.bottom - 1, 'Copy a week is underneath Past weeks', JSON.stringify(menu));
  check(menu.auto?.top >= menu.copy?.bottom - 1, 'Auto populate is underneath Copy a week', JSON.stringify(menu));
  check(menu.copyOn && menu.autoOn, 'both can be used on a week with empty days');
  await page.locator('[data-menu-action="auto-populate"]').click();
  await page.waitForTimeout(300);

  // ---- Step 1: your week ----
  check((await sheet.getAttribute('data-auto-populate')) === 'week', 'opens on "Your week"');
  check(/step 1 of 3/.test(await sheet.innerText()), 'step 1 of 3 (with leftovers)');
  check(await page.locator('[data-fill-day="Monday"]').isDisabled(), 'Monday already has fajitas: left alone');
  check(
    (await page.locator('[data-fill-day="Tuesday"]').getAttribute('aria-pressed')) === 'true' &&
      (await page.locator('[data-fill-day="Sunday"]').getAttribute('aria-pressed')) === 'true',
    'the empty days are picked',
  );
  await page.locator('[data-busy-day="Wednesday"]').click();
  check(
    (await page.locator('[data-busy-day="Wednesday"]').getAttribute('aria-pressed')) === 'true',
    'Wednesday marked busy',
  );
  check((await page.locator('[data-people]').innerText()) === '2', 'your usual number of people');
  check(await page.locator('[data-use-leftovers]').isChecked(), "Use up last week's leftovers: on, as there are some");
  check(
    /Probably left: chicken breasts/.test(await page.locator('[data-leftovers-hint]').innerText()),
    'says what is probably left',
    await page.locator('[data-leftovers-hint]').innerText(),
  );
  await page.screenshot({ path: `${OUT}/auto-populate-2-week.png` });
  check((await page.locator('[data-ap-next]').innerText()).trim() === 'Next', 'Next: the leftovers');
  await page.locator('[data-ap-next]').click();

  // ---- Step 2: still got these? (using up leftovers) ----
  check((await sheet.getAttribute('data-auto-populate')) === 'left', 'then "Still got these?"');
  check(/step 2 of 3/.test(await sheet.innerText()), 'step 2 of 3');
  const leftovers = await page
    .locator('[data-leftover]')
    .evaluateAll((els) =>
      els.map((e) => ({ name: e.getAttribute('data-leftover'), text: e.innerText.replace(/\s+/g, ' ') })),
    );
  const chicken = leftovers.find((l) => l.name === 'Chicken Breasts');
  check(!!chicken, 'the chicken from the uncooked tikka masala', JSON.stringify(leftovers));
  check(
    /Chicken tikka masala on Thursday wasn't cooked/.test(chicken?.text || ''),
    'says why: Thursday not cooked',
    chicken?.text,
  );
  check(/Use first/i.test(chicken?.text || ''), 'meat: use first');
  check(
    leftovers.some((l) => l.name === 'Coriander'),
    'and the coriander',
    leftovers.map((l) => l.name),
  );
  check(!leftovers.some((l) => /onion|rice|tomato/i.test(l.name)), 'onions, rice and tins keep: not listed');
  check(!leftovers.some((l) => l.name === 'Milk'), 'milk is a weekly staple: not listed');
  const yogurt = leftovers.find((l) => /yog/i.test(l.name));
  check(
    !!yogurt,
    'the yogurt too',
    leftovers.map((l) => l.name),
  );
  if (yogurt) await page.locator(`[data-leftover="${yogurt.name}"]`).click();
  check(
    (await page.locator(`[data-leftover="${yogurt?.name}"]`).getAttribute('aria-checked')) === 'false',
    'untick: gone',
  );
  await page.locator('[aria-label="Anything else to use up?"]').fill('2 courgettes');
  await page.locator('[data-auto-populate] button[type="submit"]').click();
  check(/Courgette/.test(await page.locator('[data-typed-leftovers]').innerText()), 'typed one added');
  await page.screenshot({ path: `${OUT}/auto-populate-1-left.png` });
  check((await page.locator('[data-ap-next]').innerText()).trim() === 'Suggest meals', 'then Suggest meals');
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(200);

  // ---- Step 3: the suggestions ----
  check((await sheet.getAttribute('data-auto-populate')) === 'picks', 'step 3: suggested meals');
  const pick = async (day) => ({
    name: (await page.locator(`[data-pick-day="${day}"] [data-pick-name]`).allInnerTexts())[0] || '',
    why: (await page.locator(`[data-pick-day="${day}"] [data-pick-why]`).allInnerTexts())[0] || '',
  });
  // The tikka masala that wasn't cooked uses up everything it left, so it comes first.
  const tue = await pick('Tuesday');
  check(tue.name === 'Chicken tikka masala', 'Tuesday: the meal that uses most of what is left, first', tue.name);
  check(/Uses your chicken breasts, double cream and coriander/.test(tue.why), 'says what it uses up', tue.why);
  const wed = await pick('Wednesday');
  check(
    wed.name === 'Lentil soup' && /From the freezer/.test(wed.why),
    'busy Wednesday: from the freezer',
    JSON.stringify(wed),
  );
  const thuBefore = (await pick('Thursday')).name;
  await page.locator('[data-another="Thursday"]').click();
  const thuAfter = (await pick('Thursday')).name;
  check(thuAfter && thuAfter !== thuBefore, 'Another: something else for Thursday', `${thuBefore} -> ${thuAfter}`);
  await page.locator('[aria-label="Leave Sunday empty"]').click();
  check(/Left empty/.test(await page.locator('[data-pick-day="Sunday"]').innerText()), 'Sunday left empty');

  // ---- Gemini: an idea for what's left, written, saved, on Sunday ----
  await page.locator('[data-ask-ideas]').click();
  await page.locator('[data-idea]').first().waitFor({ timeout: 5000 });
  const ideasPrompt = asked.find((p) => /Suggest 4 different dinners/.test(p)) || '';
  check(/courgette/i.test(ideasPrompt), 'Gemini is asked about what is not used up (the courgettes)', ideasPrompt);
  check(!/natural yogh?urt/i.test(ideasPrompt), 'not the yogurt you said had gone', ideasPrompt);
  check((await page.locator('[data-idea]').count()) === 2, 'two idea cards');
  await page.locator(`[aria-label="Day for ${IDEA}"]`).selectOption('Sunday');
  await page.locator('[data-idea]').first().locator('[data-write-idea]').click();
  await page.locator('[data-add-recipe="review"]').waitFor({ timeout: 8000 });
  const writePrompt = asked.find((p) => /Create an original/.test(p)) || '';
  check(
    writePrompt.includes(IDEA) && /Use up/.test(writePrompt),
    'Gemini writes the idea, using up what is left',
    writePrompt,
  );
  await page.screenshot({ path: `${OUT}/auto-populate-3-review.png` });
  await page.locator('button', { hasText: /^Save to cookbook$/ }).click();
  await page.waitForTimeout(400);
  const sun = await pick('Sunday');
  check(sun.name === IDEA && /written by Gemini/.test(sun.why), 'the new recipe is Sunday’s meal', JSON.stringify(sun));
  check(
    /In your cookbook, on Sunday/.test(await page.locator('[data-ideas]').innerText()),
    'the idea says where it went',
  );
  await page.screenshot({ path: `${OUT}/auto-populate-4-picks.png` });

  const putLabel = await page.locator('[data-ap-next]').innerText();
  check(/^Put 6 on the week$/.test(putLabel.trim()), 'six days to put on the week', putLabel);
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(500);
  check(/Added 6 meals/.test(await page.locator('[data-notice]').innerText()), 'says how many, with Undo');

  let st = await state();
  const plan = st.mealPlans.find((p) => p.id === nextId);
  const meal = (d) => plan.days[d].meals[0];
  check(meal('Monday')?.recipeId === 'r-fajita', 'Monday kept its fajitas');
  check(meal('Tuesday')?.recipeId === 'r-tikka' && meal('Tuesday').servings === 2, 'Tuesday: tikka masala for 2');
  check(
    meal('Wednesday')?.type === 'batch' && meal('Wednesday').batchId === 'b2',
    'Wednesday: lentil soup from the freezer',
  );
  const written = st.recipes.find((r) => r.name === IDEA);
  check(!!written, 'the Gemini recipe is in the cookbook');
  check(meal('Sunday')?.recipeId === written?.id, 'and on Sunday');
  const onHand = (plan.onHand || []).map((h) => h.name);
  check(
    onHand.includes('Chicken Breasts') && onHand.includes('Courgette') && !onHand.some((n) => /yog/i.test(n)),
    'what you have is kept on the week (not the yogurt)',
    JSON.stringify(plan.onHand),
  );
  check((st.preferences.autoPlanBusyDays || []).join() === 'Wednesday', 'busy nights remembered for next time');

  // ---- The shopping: what you've got comes off ----
  await page.locator('[data-send-to-list]').click();
  await page.locator('[data-send-confirm]').click();
  await page.waitForTimeout(500);
  st = await state();
  const chickenLine = st.shoppingList.find((i) => i.planId === nextId && i.name === 'Chicken Breasts');
  check(!!chickenLine?.haveText, 'the chicken line says what you have', JSON.stringify(chickenLine));
  await page.locator('nav button', { hasText: /^Shop$/ }).click();
  await page.waitForTimeout(700);
  const haves = await page.locator('[data-item-have]').allInnerTexts();
  check(
    haves.some((t) => /^have /.test(t)),
    'the Shop shows "have …"',
    JSON.stringify(haves),
  );
  await page.screenshot({ path: `${OUT}/auto-populate-5-shop.png` });

  // ---- A full, sent week: Copy a week can still be used; Auto populate is greyed out, saying why ----
  await page.locator('nav button', { hasText: /^Planning$/ }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-week-name]').click();
  await page.waitForTimeout(200);
  const copyText = await page.locator('[data-menu-action="copy"]').innerText();
  const autoText = await page.locator('[data-menu-action="auto-populate"]').innerText();
  check(
    (await page.locator('[data-menu-action="copy"]').isEnabled()) && copyText.trim() === 'Copy a week',
    'sent week: Copy a week can still be used (the list then says Update list)',
    copyText,
  );
  check(
    (await page.locator('[data-menu-action="auto-populate"]').isDisabled()) &&
      /Every day already has a meal/.test(autoText),
    'full week: Auto populate greyed out, saying why',
    autoText,
  );
  await page.screenshot({ path: `${OUT}/auto-populate-6-menu-full-week.png` });
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);

  // ---- An empty week: the menu fits a small phone, and the row under the bar just counts ----
  await page.locator('[data-week-next]').click();
  await page.waitForTimeout(500);
  check(
    /0 of 7 planned/.test(await page.locator('[data-planned-count]').innerText()),
    'the row under the week bar shows the count',
  );
  // A short screen too: only the list of weeks scrolls; Copy a week and Auto populate always show.
  for (const [width, height] of [
    [390, 800],
    [360, 600],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    await page.locator('[data-week-name]').click();
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const r = (e) => e && e.getBoundingClientRect();
      const menu = document.querySelector('[data-week-menu]');
      return {
        menu: r(menu),
        copy: r(document.querySelector('[data-menu-action="copy"]')),
        auto: r(document.querySelector('[data-menu-action="auto-populate"]')),
        menuScrolls: menu.scrollHeight > menu.clientHeight + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    check(
      box.copy &&
        box.auto &&
        box.auto.right <= width &&
        box.auto.bottom <= Math.min(height, box.menu.bottom) &&
        box.copy.top >= Math.max(0, box.menu.top),
      `${width}x${height}: Copy a week and Auto populate show without scrolling`,
      JSON.stringify(box),
    );
    check(!box.menuScrolls, `${width}x${height}: only the list of weeks scrolls, not the menu`);
    check(box.overflow <= 0, `${width}px: no sideways scrolling`, box.overflow);
    await page.screenshot({ path: `${OUT}/auto-populate-7-menu-${width}x${height}.png` });
    if (width === 390) {
      await page.mouse.click(5, 5);
      await page.waitForTimeout(200);
    }
  }
  await page.locator('[data-menu-action="auto-populate"]').click();
  check((await sheet.getAttribute('data-auto-populate')) === 'week', 'opens from an empty week too');
  await page.locator('[data-auto-populate] [aria-label="Close"]').click();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);

  // ---- From a day's "Select meal": Auto populate just that day ----
  const emptyWeekId = (await state()).mealPlans
    .map((p) => p.id)
    .sort()
    .pop();
  await page.locator('[data-week-day="Monday"] button', { hasText: /Add meal/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/auto-populate-9-select-meal.png` });
  await page.locator('[data-picker-auto-populate]').click();
  await page.waitForTimeout(300);
  check((await sheet.getAttribute('data-auto-populate')) === 'week', 'Select meal: Auto populate opens it');
  check(/Auto populate Monday/.test(await sheet.innerText()), 'for Monday');
  check(
    (await page.locator('[data-fill-day="Monday"]').getAttribute('aria-pressed')) === 'true' &&
      (await page.locator('[data-fill-day="Tuesday"]').getAttribute('aria-pressed')) === 'false',
    'just Monday picked',
  );
  // Not about leftovers this time: two steps
  if (await page.locator('[data-use-leftovers]').isChecked()) await page.locator('[data-use-leftovers]').uncheck();
  check(
    /step 1 of 2/.test(await sheet.innerText()) &&
      (await page.locator('[data-ap-next]').innerText()).trim() === 'Suggest meals',
    'leftovers off: two steps, straight to the suggestions',
  );
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(200);
  check((await sheet.getAttribute('data-auto-populate')) === 'picks', 'suggestions');
  // Gemini still offers new meals, without leftovers
  const before = asked.length;
  await page.locator('[data-ask-ideas]').click();
  await page.locator('[data-idea]').first().waitFor({ timeout: 5000 });
  const newIdeas = asked.slice(before).find((p) => /Suggest 4 different dinners/.test(p)) || '';
  check(
    /new ideas for our cookbook/.test(newIdeas) && !/leftovers/.test(newIdeas),
    'Gemini ideas without leftovers: new meals for the cookbook',
    newIdeas,
  );
  check((await page.locator('[data-pick-day]').count()) === 1, 'one suggestion, for Monday');
  const monPick = (await page.locator('[data-pick-day="Monday"] [data-pick-name]').allInnerTexts())[0] || '';
  check(/^Put 1 on the week$/.test((await page.locator('[data-ap-next]').innerText()).trim()), 'Put 1 on the week');
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(400);
  let monday = (await state()).mealPlans.find((p) => p.id === emptyWeekId).days.Monday.meals[0];
  check(!!monPick && monday?.name.endsWith(monPick), 'Monday gets the suggestion', `${monPick} / ${monday?.name}`);

  // ---- Change meal → Auto populate: replaces that day's meal ----
  await page.locator('[data-week-day="Monday"]').click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /^Change meal$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('[data-picker-auto-populate]').click();
  await page.waitForTimeout(300);
  check(
    !(await page.locator('[data-fill-day="Monday"]').isDisabled()) &&
      (await page.locator('[data-fill-day="Monday"]').getAttribute('aria-pressed')) === 'true',
    "Monday can be picked although it has a meal (it's replaced)",
  );
  if (await page.locator('[data-use-leftovers]').isChecked()) await page.locator('[data-use-leftovers]').uncheck();
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(200);
  const newPick = (await page.locator('[data-pick-day="Monday"] [data-pick-name]').allInnerTexts())[0] || '';
  await page.locator('[data-ap-next]').click();
  await page.waitForTimeout(400);
  monday = (await state()).mealPlans.find((p) => p.id === emptyWeekId).days.Monday.meals;
  check(monday.length === 1 && monday[0].name.endsWith(newPick), 'the meal is replaced', JSON.stringify(monday));
  check(/^Replaced .+ on Monday/.test(await page.locator('[data-notice]').innerText()), 'says what it replaced');

  // ---- The List view: the week bar is near the top, so the menu opens below it, all on screen ----
  await page.evaluate(() => localStorage.setItem('planning_view', 'list'));
  await page.reload();
  await page.waitForTimeout(1000);
  await page.locator('nav button', { hasText: /^Planning$/ }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-week-name]').click();
  await page.waitForTimeout(250);
  const listMenu = await page.evaluate(() => {
    const m = document.querySelector('[data-week-menu]')?.getBoundingClientRect();
    const bar = document.querySelector('[data-week-name]')?.getBoundingClientRect();
    return { top: m?.top, bottom: m?.bottom, barBottom: bar?.bottom, vh: innerHeight };
  });
  check(
    listMenu.top >= listMenu.barBottom && listMenu.bottom <= listMenu.vh,
    'List view: the week menu opens below the bar, on screen',
    JSON.stringify(listMenu),
  );
  await page.screenshot({ path: `${OUT}/auto-populate-8-list-menu.png` });

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
