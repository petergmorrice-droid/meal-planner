// Add a recipe → Ask Gemini to write one → "Not sure? Let Gemini suggest some": ideas that use up
// this week's leftovers (or new ones), quick or vegetarian, going by what you typed; Write it writes
// the one you pick, you check it and save it. Gemini is a stand-in that answers as scripted.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

const IDEA = 'Chicken & coriander noodles';
function geminiAnswer(prompt) {
  if (/Suggest 4 different dinners/.test(prompt)) {
    return /leftovers/.test(prompt)
      ? {
          ideas: [
            { name: IDEA, description: 'Quick noodles.', uses: ['about 2 chicken breasts'], minutes: 20 },
            { name: 'Creamy chicken bake', description: 'Comforting.', uses: ['about 2 chicken breasts'], minutes: 40 },
          ],
        }
      : { ideas: [{ name: 'Halloumi traybake', description: 'Easy.', uses: ['halloumi', 'peppers'], minutes: 30 }] };
  }
  if (/Create an original/.test(prompt)) {
    return {
      name: IDEA,
      description: 'Quick noodles.',
      ingredients: [
        {
          name: 'Chicken Breasts',
          amount: 2,
          unit: 'piece',
          category: 'Meat & Seafood',
          suggestedAisle: 'Meat & Seafood',
        },
        { name: 'Coriander', amount: 1, unit: 'bunch', category: 'Produce', suggestedAisle: 'Produce' },
        { name: 'Egg Noodles', amount: 200, unit: 'g', category: 'Pantry', suggestedAisle: 'Pantry' },
      ],
      instructions: ['Cook the noodles.', 'Stir fry the chicken, toss with the noodles and coriander.'],
      prepTime: 10,
      cookTime: 10,
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
  // Friday: Thursday's tikka masala wasn't cooked, so its chicken and coriander are left.
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
  }, reviewSeed());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  const ideasAsked = () => asked.filter((p) => /Suggest 4 different dinners/.test(p));

  await page.locator('nav button', { hasText: /^Cookbook$/ }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-add-recipe-button]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-recipe-ideas]').count()) === 0, 'not on "Paste a recipe"');
  await page.getByRole('tab', { name: 'Ask Gemini to write one' }).click();
  const section = page.locator('[data-recipe-ideas]');
  check((await section.count()) === 1, '"Not sure? Let Gemini suggest some" on Ask Gemini to write one');
  check(
    (await page.locator('[data-wish="leftovers"]').getAttribute('aria-pressed')) === 'true',
    "Use up what's left: on, as there are leftovers",
  );
  check(
    /chicken breasts/.test(await page.locator('[data-wish-leftovers]').innerText()),
    'says what is left (the chicken from the uncooked tikka masala)',
    await page.locator('[data-wish-leftovers]').innerText(),
  );
  await page.locator('[data-wish="quick"]').click();
  await page.locator('[aria-label="What should Gemini write?"]').fill('no mushrooms');
  await page.screenshot({ path: `${OUT}/recipe-ideas-1.png` });

  // Ideas that use up what's left, quick, going by what you typed
  await page.locator('[data-suggest-ideas]').click();
  await page.locator('[data-idea]').first().waitFor({ timeout: 5000 });
  let prompt = ideasAsked()[0] || '';
  check(/use up these leftovers/.test(prompt) && /chicken breasts/.test(prompt), 'asks to use up what is left', prompt);
  check(
    /What we'd like: quick: 30 minutes or less in all; no mushrooms\./.test(prompt),
    'quick, and what you typed',
    prompt,
  );
  check((await page.locator('[data-idea]').count()) === 2, 'two idea cards');
  check(
    /Uses about 2 chicken breasts/.test(await page.locator('[data-idea]').first().innerText()),
    'each says what it uses',
  );
  await page.screenshot({ path: `${OUT}/recipe-ideas-2-cards.png` });

  // Without the leftovers: new ideas
  await page.locator('[data-wish="leftovers"]').click();
  await page.locator('[data-suggest-ideas]').click();
  await page.waitForFunction(() => /Halloumi/.test(document.querySelector('[data-ideas]')?.textContent || ''));
  prompt = ideasAsked()[1] || '';
  check(/new ideas for our cookbook/.test(prompt) && !/leftovers/.test(prompt), 'without leftovers: new ideas', prompt);
  check(
    /With halloumi, peppers/.test(await page.locator('[data-idea]').first().innerText()),
    'says what it is made with',
  );

  // Back to the leftover ideas, and write one
  await page.locator('[data-wish="leftovers"]').click();
  await page.locator('[data-suggest-ideas]').click();
  await page.waitForFunction(
    (name) => (document.querySelector('[data-ideas]')?.textContent || '').includes(name),
    IDEA,
  );
  await page.locator('[data-idea]').first().locator('[data-write-idea]').click();
  await page.locator('[data-add-recipe="review"]').waitFor({ timeout: 8000 });
  const write = asked.find((p) => /Create an original/.test(p)) || '';
  check(
    write.includes(IDEA) && /Use up about 2 chicken breasts/.test(write) && /Quick: 30 minutes or less/.test(write),
    'Gemini writes the idea, using up what is left, quick',
    write,
  );
  await page.locator('button', { hasText: /^Save to cookbook$/ }).click();
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  check(
    st.recipes.some((r) => r.name === IDEA),
    'saved to the cookbook',
  );
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
