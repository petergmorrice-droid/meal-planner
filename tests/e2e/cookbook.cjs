// Cookbook: search, one-tap filters, favourites, share, and the new add-recipe flow (paste, link, photo,
// check screen with Shop as, duplicates), plus Android share target. iPhone-sized screen, Gemini simulated.
const { chromium, devices, goTab } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

function seed({ empty = false } = {}) {
  const s = reviewSeed();
  if (empty) {
    s.recipes = [];
    return s;
  }
  const R = (id) => s.recipes.find((r) => r.id === id);
  R('r-salmon').prepTime = 0;
  R('r-salmon').cookTime = 0; // no time written down
  R('r-fajita').cookingMethods = ['oven_hob', 'ninja'];
  R('r-fajita').methodInstructions.ninja = ['Air fry the chicken and peppers for 12 mins.'];
  R('r-chilli').cookingMethods = ['oven_hob', 'ninja']; // marked Ninja but no Ninja steps
  R('r-sausage').notes = 'The kids love this one.';
  R('r-chilli').tags = [...(R('r-chilli').tags || []), 'Slow cooker']; // slow cook, worked out from its tags
  return s;
}

const PAGE_TEXT =
  'Lemon nduja spaghetti\nServes 2\n200g spaghetti\n1 tbsp olive oil\n1 tbsp nduja\n1 tsp gochujang\n1 onion\nBoil the pasta. Fry the onion and nduja. Toss together.';
let copied = (name) => ({
  name,
  description: 'Quick and fiery.',
  servings: 2,
  prepTime: 5,
  cookTime: 12,
  ingredients: [
    { name: 'spaghetti', amount: 200, unit: 'g', note: '' },
    { name: 'olive oil', amount: 1, unit: 'tbsp', note: '' },
    { name: 'nduja', amount: 1, unit: 'tbsp', note: '' },
    { name: 'gochujang', amount: 1, unit: 'tsp', note: '' },
    { name: 'onion', amount: 1, unit: '', note: 'sliced' },
  ],
  instructions: ['Boil the pasta.', 'Fry the onion and nduja.', 'Toss together.'],
  isVegetarian: false,
  isVegan: false,
});

async function open(browser, { s = seed(), url = URL, pageRead = 'ok' } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const calls = [];
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const json = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
  ctx.nextName = 'Lemon nduja spaghetti';
  await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    const parts = body.contents?.[0]?.parts || [];
    const prompt = parts.map((p) => p.text || '').join('\n');
    if (body.tools) {
      calls.push({ kind: 'page', prompt, tools: body.tools, config: body.generationConfig });
      if (pageRead === 'limit-busy')
        return /gemini-3\.8-flash/.test(r.request().url())
          ? r.fulfill({
              status: 429,
              contentType: 'application/json',
              body: JSON.stringify({
                error: {
                  status: 'RESOURCE_EXHAUSTED',
                  message: 'You exceeded your current quota.',
                  details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
                },
              }),
            })
          : r.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'The model is overloaded.' } }),
            });
      if (pageRead === 'fail')
        return reply(r, {
          candidates: [
            {
              content: { parts: [{ text: 'Lemon pasta: boil pasta.' }] },
              urlContextMetadata: {
                urlMetadata: [{ retrievedUrl: 'x', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR' }],
              },
            },
          ],
        });
      return reply(r, {
        candidates: [
          {
            content: { parts: [{ text: PAGE_TEXT }] },
            urlContextMetadata: {
              urlMetadata: [{ retrievedUrl: 'x', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }],
            },
          },
        ],
      });
    }
    const img = parts.find((p) => p.inlineData || p.inline_data);
    if (img) {
      calls.push({
        kind: 'photo',
        mime: (img.inlineData || img.inline_data).mimeType,
        bytes: (img.inlineData || img.inline_data).data.length,
      });
      return reply(r, { candidates: [{ content: { parts: [{ text: PAGE_TEXT }] } }] });
    }
    if (/Grocery-list products:/.test(prompt)) {
      calls.push({ kind: 'suggest' });
      return reply(r, json({ matches: [] }));
    }
    if (/Create an original/.test(prompt)) {
      calls.push({ kind: 'write', prompt });
      const people = /for 4\b/.test(prompt) ? 4 : 2;
      return reply(
        r,
        json({
          ...copied('Macaroni cheese'),
          servings: people,
          ingredients: [
            { name: 'macaroni', amount: 100 * people, unit: 'g', category: 'Pantry', suggestedAisle: 'Pantry' },
          ],
          instructions: ['Boil the macaroni.'],
        }),
      );
    }
    calls.push({ kind: 'copy', prompt, body });
    return reply(r, json(copied(ctx.nextName)));
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
      localStorage.setItem('gemini_api_key', 'test-key');
    }
    window.__shared = [];
    navigator.share = async (d) => {
      window.__shared.push(d);
    };
  }, s);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  page.tab = async (n) => {
    await goTab(page, n);
    await page.waitForTimeout(700);
  };
  page.state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  page.cards = () =>
    page.locator('[data-recipe-card]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-recipe-card')));
  return { ctx, page, calls };
}

(async () => {
  const browser = await chromium.launch();

  // ================= Finding recipes =================
  {
    const { ctx, page } = await open(browser);
    await page.tab('Cookbook');
    check((await page.locator('[data-recipe-count]').innerText()) === '8 recipes', 'recipe count next to the title');
    check((await page.locator('[data-add-recipe-button]').innerText()) === 'Add recipe', 'button says "Add recipe"');
    await page.screenshot({ path: OUT + '/c1-cookbook.png' });

    await page.getByRole('button', { name: 'Search recipes' }).click();
    await page.locator('input[aria-label="Search recipes"]').fill('rice');
    await page.waitForTimeout(300);
    let cards = await page.cards();
    check(
      cards.length === 2 && cards.includes('Chilli con carne') && cards.includes('Chicken tikka masala'),
      'search "rice" finds recipes with rice in the ingredients',
      JSON.stringify(cards),
    );
    const header = await page.locator('.border-b').first().innerText();
    check(!/"rice"/.test(header), 'no stray copy of the search word next to the title', header);
    check(/2 of 8 recipes/.test(await page.locator('[data-filter-status]').innerText()), '"2 of 8 recipes · Clear"');
    await page.screenshot({ path: OUT + '/c2-search.png' });
    await page.locator('input[aria-label="Search recipes"]').fill('kids');
    await page.waitForTimeout(200);
    check(JSON.stringify(await page.cards()) === '["Sausage & mash"]', 'search finds words in your notes');
    await page.getByRole('button', { name: 'Close search' }).click();
    await page.waitForTimeout(200);

    const only = async (f) => {
      await page.locator(`[data-filter="${f}"]`).click();
      await page.waitForTimeout(200);
      const c = await page.cards();
      await page.locator(`[data-filter="${f}"]`).click();
      await page.waitForTimeout(150);
      return c;
    };
    let c = await only('quick');
    check(
      JSON.stringify(c.sort()) === JSON.stringify(['Cheese omelette', 'Chicken fajitas']),
      'Under 30 min: omelette and fajitas; salmon (no time) is not counted',
      JSON.stringify(c),
    );
    c = await only('veggie');
    check(
      JSON.stringify(c.sort()) === JSON.stringify(['Aubergine & chickpea curry', 'Cheese omelette']),
      'Veggie',
      JSON.stringify(c),
    );
    c = await only('ninja');
    check(
      JSON.stringify(c) === '["Chicken fajitas"]',
      'Ninja: only recipes with Ninja steps (chilli is marked Ninja but has none)',
      JSON.stringify(c),
    );
    c = await only('slow_cook');
    check(JSON.stringify(c) === '["Chilli con carne"]', 'Slow cook: the chilli (says slow cooker)', JSON.stringify(c));
    check(
      (await page.locator('[data-recipe-card="Chilli con carne"] [data-card-slow-cook]').count()) === 1 &&
        (await page.locator('[data-card-slow-cook]').count()) === 1,
      'Slow cook shows on its card only',
    );
    c = await only('freezer');
    check(JSON.stringify(c) === '["Chilli con carne"]', 'In the freezer', JSON.stringify(c));
    c = await only('not_lately');
    check(
      JSON.stringify(c) === '["Cheese omelette"]',
      'Not had lately: not in the last 4 weeks and not planned',
      JSON.stringify(c),
    );
    await page.locator('[data-filter="veggie"]').click();
    await page.locator('[data-filter="quick"]').click();
    await page.waitForTimeout(200);
    check(
      JSON.stringify(await page.cards()) === '["Cheese omelette"]' &&
        /1 of 8 recipes/.test(await page.locator('[data-filter-status]').innerText()),
      'filters combine: Veggie + Under 30 min, "1 of 8 recipes"',
    );
    check(
      (await page.locator('[data-filter="veggie"]').getAttribute('aria-pressed')) === 'true',
      'switched-on filters show as on',
    );
    await page.screenshot({ path: OUT + '/c3-filters.png' });
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.waitForTimeout(200);
    check(
      (await page.cards()).length === 8 && (await page.locator('[data-filter-status]').count()) === 0,
      'Clear shows everything again',
    );
    await page.locator('[data-filter="favourites"]').click();
    await page.waitForTimeout(200);
    check(
      /No favourites yet/.test(await page.locator('[data-no-match]').innerText()),
      'Favourites with none yet: says how to add one',
    );
    await page.locator('[data-filter="favourites"]').click();

    // Options: sort and show on cards only (no Dietary / Category)
    await page.getByRole('button', { name: 'Sort and display options' }).click();
    await page.waitForTimeout(200);
    const opts = await page.locator('[data-cookbook-options]').innerText();
    check(
      /sort/i.test(opts) &&
        /favourites first/i.test(opts) &&
        /show on cards/i.test(opts) &&
        !/Category|Dietary|COOKING METHOD/i.test(opts),
      'options: sort, favourites first, show on cards; no Category row',
      opts.replace(/\s+/g, ' '),
    );
    await page.screenshot({ path: OUT + '/c4-options.png' });
    await page.mouse.click(10, 600);
    await page.waitForTimeout(200);

    // Favourites
    await page.locator('[data-recipe-card="Chicken tikka masala"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-favourite-toggle]').click();
    await page.waitForTimeout(200);
    check(
      /Favourite/.test(await page.locator('[data-favourite-toggle]').innerText()) &&
        (await page.state()).recipes.find((r) => r.id === 'r-tikka').favourite === true,
      'star a recipe from its page (saved, so it syncs)',
    );

    // Share
    await page.locator('[data-share-recipe]').click();
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() => window.__shared);
    const st = shared[0]?.text || '';
    check(
      shared.length === 1 &&
        shared[0].title === 'Chicken tikka masala' &&
        /Serves 4/.test(st) &&
        /- 4 chicken breasts, cut into chunks/.test(st) &&
        /1\. Mix the chicken/.test(st),
      "Share sends the recipe as text to the phone's share sheet",
      st.slice(0, 300),
    );
    await page.screenshot({ path: OUT + '/c5-recipe-page.png' });
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(300);
    check(
      (await page.locator('[data-recipe-card="Chicken tikka masala"] [aria-label="Favourite"]').count()) === 1,
      'star on the card',
    );
    await page.locator('[data-filter="favourites"]').click();
    await page.waitForTimeout(200);
    check(JSON.stringify(await page.cards()) === '["Chicken tikka masala"]', 'Favourites filter');
    await page.locator('[data-filter="favourites"]').click();
    await page.getByRole('button', { name: 'Sort and display options' }).click();
    await page.waitForTimeout(150);
    await page.locator('[data-fav-first]').check();
    await page.mouse.click(10, 600);
    await page.waitForTimeout(200);
    check((await page.cards())[0] === 'Chicken tikka masala', 'Favourites first puts it at the top');

    // Editing a saved recipe shows Shop as too
    await page.locator('[data-recipe-card="Spaghetti bolognese"]').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Edit recipe' }).click();
    await page.waitForTimeout(300);
    check(
      (await page.locator('[data-shop-as]').count()) >= 5,
      'recipe edit shows "Shop as" for each ingredient',
      await page.locator('[data-shop-as]').count(),
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();

    // Planning: same fixes
    await page.tab('Planning');
    await page.locator('[aria-label="Search meals"]').click();
    await page.waitForTimeout(200);
    await page.keyboard.type('rice');
    await page.waitForTimeout(300);
    const pc = await page.cards();
    check(pc.length === 2, 'Planning search also looks in ingredients', JSON.stringify(pc));
    check(page.errors.length === 0, 'no page errors (finding)', page.errors.join(' | '));
    await ctx.close();
  }

  // ================= Adding recipes =================
  {
    const { ctx, page, calls } = await open(browser);
    await page.tab('Cookbook');
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(400);
    check(
      (await page.getByRole('tab', { name: 'Paste a recipe' }).getAttribute('aria-selected')) === 'true' &&
        (await page.getByRole('tab', { name: 'Ask Gemini to write one' }).count()) === 1,
      'modes: "Paste a recipe" / "Ask Gemini to write one"',
    );
    check(
      (await page.locator('[data-appliance="oven_hob"]').getAttribute('aria-checked')) === 'true',
      'Oven/Hob already chosen',
    );
    await page.screenshot({ path: OUT + '/a1-add.png' });
    await page.locator('[data-appliance="ninja"]').click();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(200);
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    check(
      (await page.locator('[data-appliance="ninja"]').getAttribute('aria-checked')) === 'true',
      'remembers the last appliance (Ninja)',
    );
    await page.locator('[data-appliance="oven_hob"]').click();

    // Paste button
    await page.evaluate(() =>
      navigator.clipboard.writeText('https://www.bbcgoodfood.com/recipes/lemon-nduja-spaghetti'),
    );
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await page.waitForTimeout(300);
    check(
      (await page.locator('textarea[aria-label="Recipe text or link"]').inputValue()) ===
        'https://www.bbcgoodfood.com/recipes/lemon-nduja-spaghetti',
      'Paste fills the box from the clipboard',
    );
    check(
      /Gemini will open bbcgoodfood\.com/.test(await page.locator('[data-link-hint]').innerText()) &&
        /Get the recipe from this page/.test(await page.locator('[data-add-go]').innerText()),
      'a link is recognised: "Gemini will open bbcgoodfood.com…"',
    );
    await page.screenshot({ path: OUT + '/a2-link.png' });
    await page.locator('[data-add-go]').click();
    await page.waitForTimeout(2500);
    const pageCall = calls.find((c) => c.kind === 'page');
    check(
      !!pageCall &&
        JSON.stringify(pageCall.tools) === '[{"url_context":{}}]' &&
        /lemon-nduja-spaghetti/.test(pageCall.prompt),
      'link: Gemini asked to open the page (URL context tool)',
    );
    check(
      JSON.stringify(pageCall?.config) === '{"thinkingConfig":{"thinkingLevel":"low"}}',
      'and to think only briefly, with no temperature (so it answers quickly)',
      JSON.stringify(pageCall?.config),
    );
    check(
      calls
        .filter((c) => c.kind === 'copy')
        .every(
          (c) =>
            c.body.generationConfig?.thinkingConfig?.thinkingLevel === 'low' &&
            !/temperature/.test(JSON.stringify(c.body)),
        ),
      'the copy into fields is quick too, with no temperature',
    );
    check(
      calls.some((c) => c.kind === 'copy' && /Lemon nduja spaghetti\nServes 2/.test(c.prompt)),
      "then the page's recipe text goes through the usual exact copy",
    );
    check((await page.locator('[data-add-recipe="review"]').count()) === 1, 'check screen opens');
    check(
      (await page.locator('input[aria-label="Website"]').inputValue()) ===
        'https://www.bbcgoodfood.com/recipes/lemon-nduja-spaghetti',
      'website filled in from the link',
    );
    await page.screenshot({ path: OUT + '/a3-check.png' });

    // Shop as
    const shopText = async (name) => (await page.locator(`[data-shop-as="${name}"]`).innerText()).replace(/\s+/g, ' ');
    check(
      /Shop as: Olive Oil/i.test(await shopText('olive oil')),
      'known ingredient: Shop as Olive Oil',
      await shopText('olive oil'),
    );
    check(
      /not on your list/.test(await shopText('nduja')) && /not on your list/.test(await shopText('gochujang')),
      'unknown ingredients say they are not on your list',
    );
    check(
      /ingredients aren't on your grocery list yet/.test(await page.locator('[data-unlinked-note]').innerText()),
      'a note explains why (right aisle)',
    );
    check((await page.getByText('Map Ingredient').count()) === 0, 'no separate Map Ingredient pop-up');
    await page.locator('[data-shop-as="nduja"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '/a4-shop-as.png' });
    await page.locator('select[aria-label="Aisle"]').selectOption('meat_seafood');
    await page.locator('[data-add-new-product]').click();
    await page.waitForTimeout(300);
    check(/Shop as: Nduja/.test(await shopText('nduja')), 'nduja added as a new grocery item');
    let s1 = await page.state();
    const newItem = (s1.groceryDatabase || []).find((o) => o.name === 'Nduja');
    check(
      newItem && newItem.category === 'Meat & Seafood' && newItem.aliases.includes('nduja'),
      'new item saved in the Meat & Seafood aisle',
      JSON.stringify(newItem),
    );
    await page.locator('[data-shop-as="gochujang"]').click();
    await page.waitForTimeout(300);
    await page.locator('input[aria-label="Search your grocery list"]').fill('chilli');
    await page.waitForTimeout(300);
    const first = page.locator('[data-shop-as-sheet] [data-product]').first();
    const chosen = await first.getAttribute('data-product');
    await first.click();
    await page.waitForTimeout(300);
    check(
      new RegExp('Shop as: ' + chosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await shopText('gochujang')),
      `gochujang shopped as ${chosen}`,
    );
    s1 = await page.state();
    const aliasOk = (s1.groceryDatabase || []).some((o) => (o.aliases || []).includes('gochujang'));
    check(aliasOk, '"Remember for next time" adds gochujang as another name for it');
    await page.locator('[data-shop-as="onion"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-keep-as-written]').click();
    await page.waitForTimeout(300);
    check(/not on your list/.test(await shopText('onion')), '"Just put onion on the list" leaves it as written');

    check(
      (await page.locator('input[aria-label="What should Gemini change?"]').count()) === 0,
      'Ask Gemini to change it is folded away',
    );
    await page.locator('[data-save-recipe]').click();
    await page.waitForTimeout(600);
    let st = await page.state();
    const lemon = st.recipes.find((r) => r.name === 'Lemon nduja spaghetti');
    check(
      !!lemon &&
        lemon.sourceUrl === 'https://www.bbcgoodfood.com/recipes/lemon-nduja-spaghetti' &&
        lemon.ingredients.find((i) => i.name === 'nduja').groceryId === newItem.id,
      'saved with its website and Shop as choices',
    );
    check(
      (await page.locator('[data-recipe-popup]').count()) === 1 &&
        /Lemon nduja spaghetti/.test(await page.locator('[data-recipe-popup] h2').innerText()) &&
        (await page.getByRole('button', { name: /Add to a day/ }).count()) === 1,
      'after saving, the new recipe opens (Add to a day is one tap away)',
    );
    await page.screenshot({ path: OUT + '/a5-saved.png' });
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(200);

    // Photo
    ctx.nextName = 'Chicken tikka masala';
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    await page
      .locator('[data-photo-input]')
      .setInputFiles(require('path').join(__dirname, '../../public/icon-512.png'));
    await page.waitForTimeout(3000);
    const photoCall = calls.find((c) => c.kind === 'photo');
    check(
      !!photoCall && photoCall.mime === 'image/jpeg' && photoCall.bytes > 1000,
      'photo: sent to Gemini as a JPEG',
      JSON.stringify(photoCall),
    );
    check((await page.locator('[data-add-recipe="review"]').count()) === 1, 'photo → check screen');
    check(
      /You already have “Chicken tikka masala”/.test(await page.locator('[data-dup-note]').innerText()),
      'duplicate spotted on the check screen',
    );
    const before = (await page.state()).recipes.length;
    await page.locator('[data-save-recipe]').click();
    await page.waitForTimeout(300);
    check((await page.locator('[data-dup-dialog]').count()) === 1, 'Save asks: replace or keep both');
    await page.screenshot({ path: OUT + '/a6-duplicate.png' });
    await page.getByRole('button', { name: 'Replace it' }).click();
    await page.waitForTimeout(500);
    st = await page.state();
    const tikka = st.recipes.find((r) => r.id === 'r-tikka');
    check(
      st.recipes.length === before && tikka.ingredients.some((i) => i.name === 'gochujang'),
      'Replace: same recipe (same id, so plans stay linked), new content',
    );
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(200);

    // Keep both
    ctx.nextName = 'Chicken tikka masala';
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    await page.locator('textarea[aria-label="Recipe text or link"]').fill(PAGE_TEXT);
    check(/Copy this recipe/.test(await page.locator('[data-add-go]').innerText()), 'pasted text: "Copy this recipe"');
    await page.locator('[data-add-go]').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-save-recipe]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Keep both' }).click();
    await page.waitForTimeout(500);
    check((await page.state()).recipes.length === before + 1, 'Keep both adds a second one');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(200);
    check(page.errors.length === 0, 'no page errors (adding)', page.errors.join(' | '));
    await ctx.close();
  }

  // Ask Gemini to write one, for 4: it's written for 4 (not always 2)
  {
    const { ctx, page, calls } = await open(browser);
    await page.tab('Cookbook');
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Ask Gemini to write one' }).click();
    await page.locator('textarea[aria-label="What should Gemini write?"]').fill('Macaroni cheese for 4');
    await page.locator('[data-add-go]').click();
    await page.waitForTimeout(1500);
    const write = calls.find((c) => c.kind === 'write');
    check(
      !!write &&
        /says how many people it is for, write it for exactly that many/.test(write.prompt) &&
        !/for 2 adults/.test(write.prompt),
      'Gemini is told to write it for the number asked for (no more "always 2")',
      write?.prompt.slice(-400),
    );
    check(
      (await page.locator('input[aria-label="Serves"]').inputValue()) === '4',
      '"Macaroni cheese for 4" comes back serving 4',
      await page.locator('input[aria-label="Serves"]').inputValue(),
    );
    await ctx.close();
  }

  // Link that Gemini can't open
  {
    const { ctx, page } = await open(browser, { pageRead: 'fail' });
    await page.tab('Cookbook');
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    await page.locator('textarea[aria-label="Recipe text or link"]').fill('https://www.example.com/members-only/pie');
    await page.locator('[data-add-go]').click();
    await page.waitForTimeout(1500);
    const err = await page
      .locator('[data-add-error]')
      .innerText()
      .catch(() => '');
    check(
      /couldn't read a recipe from that page/.test(err) && /copy the recipe and paste it here/.test(err),
      'page not readable: says to paste the text instead (no guessed recipe)',
      err,
    );
    check((await page.locator('[data-add-recipe="review"]').count()) === 0, 'and nothing is made up');
    await page.screenshot({ path: OUT + '/a7-link-fail.png' });
    await ctx.close();
  }

  // Gemini can't answer: the first model's free allowance is used up and the second is busy
  {
    const { ctx, page } = await open(browser, { pageRead: 'limit-busy' });
    await page.tab('Cookbook');
    await page.locator('[data-add-recipe-button]').click();
    await page.waitForTimeout(300);
    await page.locator('textarea[aria-label="Recipe text or link"]').fill('https://www.bbcgoodfood.com/recipes/pie');
    await page.locator('[data-add-go]').click();
    // Each busy model is asked twice, a couple of seconds apart.
    await page.locator('[data-add-error]').waitFor({ timeout: 20000 });
    const err = await page
      .locator('[data-add-error]')
      .innerText()
      .catch(() => '');
    check(
      /Gemini couldn't open that page: Google's Gemini service is busy just now/.test(err) &&
        !/no connection/.test(err),
      'Gemini can\'t answer: the real reason (busy), not "no connection"',
      err,
    );
    const detail = await page
      .locator('[data-add-error-detail]')
      .innerText()
      .catch(() => '');
    check(
      /3\.8 Flash: free limit for today reached \(429 RESOURCE_EXHAUSTED\)/.test(detail) &&
        /3\.6 Flash: busy \(503 UNAVAILABLE\)/.test(detail) &&
        /3\.1 Flash-Lite: busy \(503 UNAVAILABLE\)/.test(detail),
      'with what happened on each model in the small print',
      detail,
    );
    check(
      (await page.locator('textarea[aria-label="Recipe text or link"]').inputValue()) ===
        'https://www.bbcgoodfood.com/recipes/pie',
      'the link is still there to try again',
    );
    await page.screenshot({ path: OUT + '/a7b-gemini-busy.png' });
    await ctx.close();
  }

  // Android share target
  {
    const { ctx, page } = await open(browser, {
      url: URL + '?share_title=Pie&share_text=Look%20at%20this%20https%3A%2F%2Fwww.example.com%2Fpie',
    });
    check((await page.locator('[data-add-recipe="input"]').count()) === 1, 'shared page opens "Add a recipe"');
    check(
      (await page.locator('textarea[aria-label="Recipe text or link"]').inputValue()) === 'https://www.example.com/pie',
      'with the shared link in the box',
    );
    check((await page.evaluate(() => location.search)) === '', 'and the address is tidied (no re-import on refresh)');
    await page.screenshot({ path: OUT + '/a8-shared.png' });
    await ctx.close();
  }

  // Empty cookbook
  {
    const { ctx, page } = await open(browser, { s: seed({ empty: true }) });
    await page.tab('Cookbook');
    check(
      /Your cookbook is empty/.test(await page.locator('[data-empty-cookbook]').innerText()) &&
        (await page.locator('[data-add-recipe-button]').count()) === 0,
      'empty cookbook: a welcome card with "Add your first recipe"',
    );
    await page.screenshot({ path: OUT + '/a9-empty.png' });
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
