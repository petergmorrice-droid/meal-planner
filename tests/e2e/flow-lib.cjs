// Shared helpers for driving the app through its UI with a simulated Gemini.
const { chromium, devices } = require('./pw.cjs');

// What Gemini returns when asked to COPY the flow4 recipe: everything exactly as written (serves 4).
const GEMINI_RECIPE = {
  name: 'Chicken & chorizo pasta bake',
  description: '',
  servings: 4,
  prepTime: 0,
  cookTime: 0,
  ingredients: [
    { name: 'olive oil', amount: 1, unit: 'tbsp', note: '' },
    { name: 'onion', amount: 1, unit: '', note: '' },
    { name: 'garlic cloves', amount: 2, unit: '', note: '' },
    { name: 'chorizo', amount: 100, unit: 'g', note: '' },
    { name: 'chicken breasts', amount: 2, unit: '', note: '' },
    { name: 'chopped tomatoes', amount: 1, unit: '400g can', note: '' },
    { name: 'penne', amount: 300, unit: 'g', note: '' },
    { name: 'mozzarella', amount: 125, unit: 'g', note: '' },
    { name: 'basil', amount: 1, unit: 'small bunch', note: '' },
  ],
  instructions: ['fry, simmer, bake.'],
  isVegetarian: false,
  isVegan: false,
};

// Answers the second, small request ("which grocery product is each of these?").
// `suggest` maps ingredient name -> product name ('' = no product).
const askedNames = (prompt) =>
  ((prompt.split('Recipe ingredients:')[1] || '').split('Grocery-list products:')[0] || '')
    .split('\n')
    .map((l) => l.replace(/^- /, '').trim())
    .filter(Boolean);

async function openApp({
  url = process.env.APP_URL || 'http://127.0.0.1:4173/',
  gemini = GEMINI_RECIPE,
  geminiFails = false,
  suggest = {},
  suggestFails = false,
} = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const geminiCalls = [];
  const reply = (r, obj) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
    });
  const quota = (r) =>
    r.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }),
    });
  await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
    const system = body.systemInstruction?.parts?.[0]?.text || '';
    const isSuggest = /Grocery-list products:/.test(prompt);
    geminiCalls.push({
      kind: isSuggest ? 'suggest' : 'recipe',
      url: r
        .request()
        .url()
        .replace(/key=[^&]+/, 'key=…'),
      prompt,
      system,
      temperature: body.generationConfig?.temperature,
      asked: isSuggest ? askedNames(prompt) : undefined,
    });
    if (isSuggest) {
      if (suggestFails) return quota(r);
      return reply(r, { matches: askedNames(prompt).map((n) => ({ ingredient: n, product: suggest[n] ?? '' })) });
    }
    if (geminiFails) return quota(r);
    return reply(r, gemini);
  });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('gemini_api_key')) localStorage.setItem('gemini_api_key', 'test-key');
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text()))
      page.errors.push('console: ' + m.text().slice(0, 200));
  });
  await page.goto(url);
  await page.waitForTimeout(1200);
  return { browser, page, geminiCalls };
}

const tab = async (page, name) => {
  await page.locator('nav button', { hasText: new RegExp('^' + name + '$') }).click();
  await page.waitForTimeout(600);
};
const buttons = (page) =>
  page
    .locator('button:visible')
    .evaluateAll((bs) =>
      bs
        .map((b) =>
          (b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText)
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 40),
        )
        .filter(Boolean),
    );
const fields = (page) =>
  page
    .locator('input:visible, textarea:visible, select:visible')
    .evaluateAll((xs) => xs.map((x) => `${x.tagName.toLowerCase()}[${x.name || x.placeholder || x.type}]`));
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache') || 'null'));
const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

module.exports = { openApp, tab, buttons, fields, state, text, GEMINI_RECIPE };
