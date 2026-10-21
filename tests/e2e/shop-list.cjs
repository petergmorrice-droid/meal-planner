// Shop tab: week header, aisles, rows + item panel, notes, progress, add box, share, Done shopping.
const { chromium, devices } = require('./pw.cjs');
const { reviewSeed } = require('./review-seed.cjs');
const OUT = process.argv[2];
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : String(detail).slice(0, 500));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: new Date('2026-10-18T12:00:00+01:00') });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const S = reviewSeed();
  const thisId = S.mealPlans[0].id,
    nextId = S.mealPlans[1].id;
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
      localStorage.setItem('seeded', '1');
    }
    // Copy instead of the share sheet, and count screen-awake requests
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (t) => {
          window.__copied = t;
        },
      },
      configurable: true,
    });
    window.__wake = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          window.__wake++;
          return { release: async () => {} };
        },
      },
      configurable: true,
    });
  }, S);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const tab = async (n) => {
    await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click();
    await page.waitForTimeout(700);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mealPlannerAppStateCache')));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const rowQty = async (name) =>
    (await page.locator(`[data-item="${name}"] [data-item-qty]`).first().innerText()).trim();
  const progress = async () => (await page.locator('[data-shop-progress]').innerText()).replace(/\s+/g, ' ').trim();
  const toast = async () =>
    (
      (await page
        .locator('[data-shop-toast]')
        .innerText()
        .catch(() => '')) || ''
    ).replace(/\s+/g, ' ');

  // Send next week from Planning (Planning opens on next week Fri–Sun; make sure)
  await tab('Planning');
  const dow = new Date('2026-10-18T12:00:00+01:00').getDay();
  if (!(dow === 0 || dow >= 5)) {
    await page.locator('[data-week-next]').click();
    await page.waitForTimeout(400);
  }
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(800);
  await page
    .locator('button', { hasText: /^Send to shopping list$/ })
    .last()
    .click();
  await page.waitForTimeout(900);

  // ---------- Opens on the week with things to buy; header like Planning ----------
  await tab('Shop');
  check(
    (await page.locator('[data-shop-week-name]').innerText()) === 'Next week',
    'opens on next week (sent, things to buy)',
    await page.locator('[data-shop-week-name]').innerText(),
  );
  check(
    /Sent/.test(await page.locator('[data-shop-week-status]').innerText()),
    'header says it was sent',
    await page.locator('[data-shop-week-status]').innerText(),
  );
  check(
    (await page.locator('#btn-week-selector').count()) === 0 &&
      (await page.locator('#btn-header-add-batch').count()) === 0,
    'no week dropdown, no snowflake button',
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'no sideways scrolling', overflow);
  // What the meals actually use, when you buy more
  const needs = await page
    .locator('[data-item-need]')
    .evaluateAll((els) => els.map((e) => `${e.closest('[data-item]').getAttribute('data-item')}: ${e.textContent}`));
  check(
    needs.length > 0 && needs.every((t) => /: need \S/.test(t)),
    'rows say what the meals use when you buy more',
    needs.join('; '),
  );
  const needName = needs[0]?.split(':')[0];
  if (needName) {
    await page.locator(`[data-item="${needName}"] [data-open-item]`).click();
    await page.waitForTimeout(400);
    const sheetNeed = (
      await page
        .locator('[data-item-sheet-need]')
        .innerText()
        .catch(() => '')
    ).trim();
    const partText = (
      await page
        .locator('[data-item-sheet] [data-part]')
        .first()
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
    check(
      /^Your meals use \S/.test(sheetNeed) && /\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\): \S/.test(partText),
      'item panel: what the meals use, per recipe',
      sheetNeed + ' | ' + partText,
    );
    await page.screenshot({ path: OUT + '/00-need.png' });
    await page.locator('[data-item-done]').click();
    await page.waitForTimeout(300);
  }
  await page.locator('[data-shop-week-prev]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-shop-week-name]').innerText()) === 'This week', '‹ goes to this week');
  await page.locator('[data-shop-week-next]').click();
  await page.waitForTimeout(400);
  await shot('s1-open');

  // ---------- Aisles by default (remembered per phone) ----------
  const groups = await page.locator('[data-group]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-group')));
  check(
    groups[0] === 'produce' && groups.includes('dairy_eggs'),
    'grouped by aisle by default',
    JSON.stringify(groups),
  );
  await page.locator('#btn-shop-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('#view-option-sections').click();
  await page.waitForTimeout(300);
  const srcGroups = await page.locator('[data-group]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-group')));
  check(
    JSON.stringify(srcGroups) === '["recurring","planned"]',
    "by where it's from: only sections with something in them (no empty Batch box)",
    JSON.stringify(srcGroups),
  );
  await page.reload();
  await page.waitForTimeout(1500);
  await tab('Shop');
  check(
    (await page.locator('[data-group]').first().getAttribute('data-group')) === 'recurring',
    'layout remembered after reopening',
  );
  await page.locator('#btn-shop-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('#view-option-foodtype').click();
  await page.waitForTimeout(300);

  // ---------- Rows: tick with the circle; bought go to the end; progress ----------
  const n = await page.locator('[data-group] [data-item]').count();
  check(new RegExp(`^0 of ${n} bought$`).test(await progress()), `progress "0 of ${n} bought"`, await progress());
  check(
    (await page.locator('[data-item] svg.lucide-heart').count()) === 0 &&
      (await page.locator('[data-item] svg.lucide-trash-2').count()) === 0,
    'no hearts or bins on the rows',
  );
  await page.locator('[data-item="Aubergine"] [data-tick]').click();
  await page.waitForTimeout(400);
  check(
    new RegExp(`^1 of ${n} bought$`).test(await progress()),
    'ticking Aubergine: 1 bought straight away',
    await progress(),
  );
  check(
    (await page.locator('[data-group] [data-item="Aubergine"][data-just-ticked] [data-undo-tick]').count()) === 1,
    'Aubergine stays in place for now, crossed out, with Undo',
  );
  await page.locator('[data-item="Aubergine"] [data-undo-tick]').click();
  await page.waitForTimeout(300);
  check(
    new RegExp(`^0 of ${n} bought$`).test(await progress()) &&
      (await page.locator('[data-item="Aubergine"][data-just-ticked]').count()) === 0,
    'Undo: not bought after all',
  );
  await page.locator('[data-item="Aubergine"] [data-tick]').click();
  await page.waitForTimeout(4600);
  check(
    (await page.locator('[data-group] [data-item="Aubergine"]').count()) === 0 &&
      /bought\s*1/i.test(await page.locator('[data-bought]').innerText()),
    'a few seconds later it moves to "Bought 1" at the end',
  );
  await page.locator('[data-bought-toggle]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-bought] [data-item="Aubergine"] [data-tick]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-group] [data-item="Aubergine"]').count()) === 1, 'untick puts it back');

  // ---------- Add box ----------
  const add = async (t) => {
    await page.locator('[data-quick-add]').fill(t);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
  };
  await add('2 pints milk');
  check(/Milk: added 2 pints more/.test(await toast()), 'toast: "Milk: added 2 pints more"', await toast());
  check((await rowQty('Milk')) === '6 pints', 'Milk row: 4 pints staple + 2 = 6 pints', await rowQty('Milk'));
  await add('bin bags');
  check(/Added Bin Bags · 1 pack/.test(await toast()), 'toast: "Added Bin Bags · 1 pack"', await toast());
  await add('6 eggs');
  check((await rowQty('Eggs')) === '6 eggs', '"6 eggs" = 6 eggs', await rowQty('Eggs'));
  await page.locator('[data-quick-add]').fill('coco');
  await page.waitForTimeout(300);
  const sug = (await page.locator('[data-suggestion="Coconut Milk"]').innerText()).replace(/\s+/g, ' ');
  check(/On the list: 1 can/.test(sug), 'suggestion says Coconut Milk is on the list: 1 can', sug);
  await shot('s2-suggest');
  await page.locator('[data-suggestion="Coconut Milk"]').click();
  await page.waitForTimeout(400);
  check((await rowQty('Coconut Milk')) === '2 cans', 'picking it adds one more: 2 cans', await rowQty('Coconut Milk'));
  await add('birthday candles');
  let st = await state();
  const chips = st.shoppingList.find((i) => i.planId === nextId && i.name === 'Birthday candles');
  check(
    chips && chips.isAdhoc && !chips.groceryId,
    'unknown "birthday candles" is its own item',
    JSON.stringify(chips),
  );
  // Something new: the question pops up straight away
  const ask = page.locator('[data-save-product-sheet="Birthday candles"][data-just-added]');
  check((await ask.count()) === 1, 'something new: asks straight away');
  const askText = (await ask.innerText()).replace(/\s+/g, ' ');
  check(
    /Added Birthday candles to the list/.test(askText) && /Save it as a product for future shops\?/.test(askText),
    'says it was added and asks "Save it as a product for future shops?"',
    askText.slice(0, 200),
  );
  check(
    (await ask.locator('[data-new-product-staple] input').count()) === 1 &&
      (await ask.locator('[data-new-product-favourite] input').count()) === 1,
    'with options: weekly staple, favourite',
  );
  check(
    (await ask.locator('[data-new-product-staple-amount]').count()) === 0,
    'how many each week only shows once you tick weekly staple',
  );
  check(
    (await ask.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(255, 255, 255)',
    'the question is light, not dark',
  );
  check(
    await page.evaluate(() => !document.activeElement || !document.activeElement.hasAttribute('data-quick-add')),
    'the keyboard is put away so the whole question shows',
  );
  check((await page.locator('[data-toast]').count()) === 0, 'no other message on top of it');
  await shot('s1a-ask-new-product');
  await page.locator('[data-new-product-later]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-save-product-sheet]').count()) === 0 && /Added Birthday candles/.test(await toast()),
    '"Not now": closes; the message says it was added',
    await toast(),
  );
  await shot('s1b-notice');
  const noticeLook = await page.locator('[data-toast]').evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { bg: getComputedStyle(e).backgroundColor, top: r.top, h: window.innerHeight };
  });
  check(
    noticeLook.bg === 'rgb(255, 255, 255)' && noticeLook.top > noticeLook.h / 2,
    'the message is light, at the bottom (never a dark box over the add box)',
    JSON.stringify(noticeLook),
  );
  check(
    (await page.locator('[data-new-products] [data-save-product="Birthday candles"]').count()) === 1,
    'after "Not now": still offered at the top of the list until you answer',
  );
  await add('birthday candles');
  check(
    (await page.locator('[data-save-product-sheet]').count()) === 0 &&
      /Birthday candles: added 1 more/.test(await toast()),
    'adding more of it: not asked again straight away',
    await toast(),
  );
  await page.locator('[data-quick-add]').blur();
  await page.locator('[data-item="Birthday candles"] [data-open-item]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-item-save-product]').count()) === 1, "a new item's panel offers to save it too");
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);

  // ---------- Item panel ----------
  await page.locator('[data-item="Milk"] [data-open-item]').click();
  await page.waitForTimeout(400);
  const parts = await page.locator('[data-item-sheet] [data-part]').count();
  const sheetText = (await page.locator('[data-item-sheet]').innerText()).replace(/\s+/g, ' ');
  check(
    parts === 2 && /Weekly staple/.test(sheetText) && /Added by you/.test(sheetText),
    'Milk panel: weekly staple + added by you',
    sheetText.slice(0, 200),
  );
  check((await page.locator('[data-item-sheet] [data-manage-staples]').count()) === 1, 'link to change weekly staples');
  await page.locator('[data-item-note]').fill('semi-skimmed');
  await shot('s3-panel');
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(400);
  check(
    /semi-skimmed/.test(await page.locator('[data-item="Milk"] [data-item-sub]').innerText()),
    'the row shows the note',
  );
  st = await state();
  check(
    st.shoppingList.filter((i) => i.planId === nextId && i.name === 'Milk').every((i) => i.note === 'semi-skimmed'),
    'note saved (synced to the other phone)',
  );

  await page.locator('[data-item="Onion"] [data-open-item]').click();
  await page.waitForTimeout(400);
  const onionSheet = (await page.locator('[data-item-sheet]').innerText()).replace(/\s+/g, ' ');
  check(
    /For Chilli con carne \(Wed\): 2, Spaghetti bolognese \(Thu\): ½/.test(onionSheet) &&
      /3 on the list Your meals use 2½/.test(onionSheet),
    'Onion panel: which meals, which days, how much each (2½ of 3 used)',
    onionSheet.slice(0, 160),
  );
  await page.locator('[data-item-sheet] [data-part] [data-more]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-item-sheet] [data-part] [data-amount]').inputValue()) === '4', 'Onion + : 4');
  // "Added by you" is always there, so you can add one of your own on top of the meals
  const extra = () => page.locator('[data-item-sheet] [data-part-extra]');
  check(
    (await extra().count()) === 1 && /Added by you\s*0/.test(await extra().innerText()),
    'Onion panel: "Added by you 0" even when you have not added any',
    await extra()
      .innerText()
      .catch(() => ''),
  );
  await extra().locator('[data-more]').click();
  await page.waitForTimeout(400);
  const onionParts = page.locator('[data-item-sheet] [data-part]');
  check(
    (await extra().count()) === 0 &&
      (await onionParts.count()) === 2 &&
      /Added by you/.test(await onionParts.nth(1).innerText()) &&
      (await onionParts.nth(1).locator('[data-amount]').inputValue()) === '1',
    '+ adds 1 of your own, under the meals',
  );
  check((await rowQty('Onion')) === '5', 'the row: 5', await rowQty('Onion'));
  await onionParts.nth(1).locator('[data-less]').click();
  await page.waitForTimeout(400);
  check(
    (await extra().count()) === 1 && (await onionParts.count()) === 1 && (await rowQty('Onion')) === '4',
    '− on it takes it off again: back to "Added by you 0", row 4',
    await rowQty('Onion'),
  );
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);
  // The same for a tin: one more can of your own
  await page.locator('[data-item="Chickpeas"] [data-open-item]').click();
  await page.waitForTimeout(400);
  const before = await rowQty('Chickpeas');
  await extra().locator('[data-more]').click();
  await page.waitForTimeout(400);
  const cp = page.locator('[data-item-sheet] [data-part]');
  check(
    (await cp.count()) === 2 && (await cp.nth(1).locator('[data-amount]').inputValue()) === '1 can',
    'Chickpeas: + under "Added by you" adds 1 can',
    await cp
      .nth(1)
      .locator('[data-amount]')
      .inputValue()
      .catch(() => ''),
  );
  await shot('s3a-added-by-you');
  await cp.nth(1).locator('[data-more]').click();
  await page.waitForTimeout(400);
  check((await cp.nth(1).locator('[data-amount]').inputValue()) === '2 cans', 'and + again: 2 cans');
  const n0 = parseInt(before, 10);
  check((await rowQty('Chickpeas')) === `${n0 + 2} cans`, `row: ${before} + 2`, await rowQty('Chickpeas'));
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);
  // A note shows alongside the meals, not instead of them
  await page.locator('[data-item="Chickpeas"] [data-open-item]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-item-note]').fill('get the big tins');
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(400);
  const cpMeals = await page
    .locator('[data-item="Chickpeas"] [data-item-meals]')
    .innerText()
    .catch(() => '');
  const cpNote = await page
    .locator('[data-item="Chickpeas"] [data-item-note-line]')
    .innerText()
    .catch(() => '');
  check(
    /Aubergine & chickpea curry/.test(cpMeals) && /get the big tins/.test(cpNote),
    'Chickpeas row: the meals and the note, both',
    `${cpMeals} | ${cpNote}`,
  );
  // (i): what it's for, how much each, what was added and who by
  await page.locator('[data-item="Chickpeas"] [data-item-info]').click();
  await page.waitForTimeout(400);
  const info = page.locator('[data-item-info-sheet="Chickpeas"]');
  check((await info.count()) === 1, '(i) opens "about Chickpeas"');
  const infoText = (await info.innerText()).replace(/\s+/g, ' ');
  check(
    /Aubergine & chickpea curry \(Tue\) 1 can/.test(infoText),
    '(i): the meal, its day and how much',
    infoText.slice(0, 300),
  );
  check(
    /Added by (Peter|Rachel)[^0-9]*2 cans/.test(infoText),
    '(i): what was added (2 cans) and who by',
    infoText.slice(0, 300),
  );
  check(
    /Meals sent to the list by (Peter|Rachel)/.test(infoText),
    '(i): who sent the meals to the list',
    infoText.slice(0, 300),
  );
  check(/get the big tins/.test(infoText), '(i): the note');
  await shot('s3d-item-info');
  await info.locator('[data-item-info-edit]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-item-info-sheet]').count()) === 0 &&
      (await page.locator('[data-item-sheet="Chickpeas"]').count()) === 1,
    '"Change it" opens the item panel',
  );
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);

  // Aisle: remembered for next time
  await page.locator('[data-item="Birthday candles"] [data-open-item]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-item-aisle]').selectOption('pantry_spices');
  await page.waitForTimeout(400);
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-group="pantry_spices"] [data-item="Birthday candles"]').count()) === 1,
    'moved to Pantry, Oils & Spices',
  );
  st = await state();
  const custom = (st.groceryDatabase || []).find((o) => o.name === 'Birthday candles');
  check(custom && /Pantry/.test(custom.category), 'remembered as a product in that aisle', JSON.stringify(custom));

  // Remove with Undo
  await page.locator('[data-item="Birthday candles"] [data-open-item]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-remove-item]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-item="Birthday candles"]').count()) === 0 &&
      /Removed Birthday candles/.test(await toast()),
    'Remove: gone, with Undo',
  );
  await page.locator('[data-toast-action]').click();
  await page.waitForTimeout(500);
  check((await page.locator('[data-item="Birthday candles"]').count()) === 1, 'Undo brings it back');
  // ...and typing it again finds the remembered aisle
  await page.locator('[data-item="Birthday candles"] [data-open-item]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-remove-item]').click();
  await page.waitForTimeout(300);
  await add('birthday candles');
  await page.locator('[data-quick-add]').blur();
  check(
    (await page.locator('[data-group="pantry_spices"] [data-item="Birthday candles"]').count()) === 1,
    'typed again: goes straight to Pantry (remembered)',
  );

  // ---------- Save something new as a product (asked straight away), or say it isn't one ----------
  await add('party poppers');
  check(
    (await page.locator('[data-save-product-sheet="Party poppers"][data-just-added]').count()) === 1,
    'party poppers: asked straight away',
  );
  await page.locator('[data-new-product-aisle]').selectOption('household_other');
  await page.locator('[data-new-product-unit]').selectOption('pack');
  await shot('s3b-save-product');
  await page.locator('[data-new-product-save]').click();
  await page.waitForTimeout(500);
  st = await state();
  const poppers = (st.groceryDatabase || []).find((g) => g.name === 'Party poppers');
  check(
    poppers && poppers.category === 'Household & Other' && poppers.unit === 'pack' && !poppers.removed,
    'saved as a product (Household & Other, sold by the pack)',
    JSON.stringify(poppers),
  );
  check(
    st.shoppingList.some((i) => i.planId === nextId && i.name === 'Party poppers' && i.groceryId === poppers?.id),
    'the line on the list is now that product',
  );
  check(
    (await page.locator('[data-group="household_other"] [data-item="Party poppers"]').count()) === 1 &&
      (await page.locator('[data-save-product="Party poppers"]').count()) === 0,
    'moved to its aisle; not asked again',
  );
  await page.locator('[data-item="Party poppers"] [data-open-item]').click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-item-save-product]').count()) === 0, 'its panel no longer offers to save it');
  await page.locator('[data-remove-item]').click();
  await page.waitForTimeout(300);
  await add('party poppers');
  await page.locator('[data-quick-add]').blur();
  check(
    (await page.locator('[data-group="household_other"] [data-item="Party poppers"]').count()) === 1 &&
      /1 pack/.test(await rowQty('Party poppers')) &&
      (await page.locator('[data-save-product-sheet]').count()) === 0,
    'typed again: straight to Household, 1 pack, no question',
    await rowQty('Party poppers'),
  );

  // Save it as a weekly staple and a favourite at the same time
  await add('2 sparklers');
  const sp = page.locator('[data-save-product-sheet="Sparklers"]');
  check((await sp.count()) === 1, 'sparklers: asked straight away');
  await sp.locator('[data-new-product-aisle]').selectOption('household_other');
  await sp.locator('[data-new-product-unit]').selectOption('pack');
  await sp.locator('[data-new-product-staple] input').check();
  await page.waitForTimeout(150);
  check(
    (await sp.locator('[data-staple-packs]').innerText()) === '2' &&
      /Every week.*2.*packs/s.test(await sp.locator('[data-new-product-staple-amount]').innerText()),
    'weekly staple: every week 2 packs (what you just added)',
    await sp
      .locator('[data-new-product-staple-amount]')
      .innerText()
      .catch(() => ''),
  );
  await sp.locator('[aria-label="Fewer each week"]').click();
  check((await sp.locator('[data-staple-packs]').innerText()) === '1', '− makes it 1 a week');
  await sp.locator('[data-new-product-favourite] input').check();
  await shot('s3c-staple-favourite');
  await sp.locator('[data-new-product-save]').click();
  await page.waitForTimeout(600);
  st = await state();
  const sparklers = (st.groceryDatabase || []).find((g) => g.name === 'Sparklers');
  check(
    sparklers && sparklers.unit === 'pack' && sparklers.category === 'Household & Other',
    'saved as a product',
    JSON.stringify(sparklers),
  );
  const rec = (st.preferences.recurringItems || []).find((r) => r.name === 'Sparklers');
  check(
    rec && rec.amount === 1 && rec.unit === 'pack' && rec.category === 'Household & Other',
    'and a weekly staple: 1 pack every week',
    JSON.stringify(rec),
  );
  check(
    (st.preferences.favouriteItems || []).some((f) => f.name === 'Sparklers'),
    'and a favourite',
  );
  const spLines = st.shoppingList.filter((i) => i.planId === nextId && /^sparklers$/i.test(i.name));
  check(
    spLines.length === 1 && spLines[0].isRecurring && (await rowQty('Sparklers')) === '1 pack',
    "this week's line is now the staple's line: on the list once, 1 pack",
    JSON.stringify(spLines),
  );
  check(
    st.shoppingList.some((i) => i.planId === thisId && i.name === 'Sparklers' && i.isRecurring),
    'the other week gets it too (every week)',
  );
  check(
    /Saved Sparklers \(Household & Other\)\. It's now a weekly staple and a favourite too\./.test(await toast()),
    'message says what it did',
    await toast(),
  );
  await add('sparklers');
  await page.locator('[data-quick-add]').blur();
  await page.waitForTimeout(300);
  check((await page.locator('[data-save-product-sheet]').count()) === 0, 'typed again: no question');
  await page.locator('[data-quick-add]').fill('spark');
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-suggestion="Sparklers"]').count()) === 1,
    'suggested as you type',
    JSON.stringify(
      await page.locator('[data-suggestion]').evaluateAll((els) => els.map((e) => e.getAttribute('data-suggestion'))),
    ),
  );
  await page.locator('[data-quick-add]').fill('');
  await page.locator('[data-quick-add]').blur();

  // Saved as sold by the pack: adding more adds up ("2 packs", never "1 + 1 pack")
  await add('belvita breakfast bar');
  await page.locator('[data-save-product-sheet="Belvita breakfast bar"] [data-new-product-unit]').selectOption('pack');
  await page.locator('[data-new-product-save]').click();
  await page.waitForTimeout(500);
  check(
    (await rowQty('Belvita breakfast bar')) === '1 pack',
    'saved as sold by the pack: the row says 1 pack',
    await rowQty('Belvita breakfast bar'),
  );
  await add('belvita breakfast bar');
  await page.locator('[data-quick-add]').blur();
  await page.waitForTimeout(300);
  check(
    (await rowQty('Belvita breakfast bar')) === '2 packs' &&
      /Belvita breakfast bar: added 1 pack more/.test(await toast()),
    'add another: 2 packs (not "1 + 1 pack")',
    await rowQty('Belvita breakfast bar'),
  );
  await add('2 belvita breakfast bar');
  await page.locator('[data-quick-add]').blur();
  await page.waitForTimeout(300);
  check(
    (await rowQty('Belvita breakfast bar')) === '4 packs',
    '"2 belvita breakfast bar": 4 packs',
    await rowQty('Belvita breakfast bar'),
  );
  st = await state();
  check(
    st.shoppingList.filter((i) => i.planId === nextId && i.name === 'Belvita breakfast bar').length === 1,
    'one line on the list',
  );

  // "Don't ask again"
  await add('mystery thing');
  check(
    (await page.locator('[data-save-product-sheet="Mystery thing"]').count()) === 1,
    'mystery thing: asked straight away',
  );
  await page.locator('[data-new-product-decline]').click();
  await page.waitForTimeout(400);
  st = await state();
  check(
    (st.preferences.notProducts || []).includes('mystery thing') &&
      (await page.locator('[data-save-product="Mystery thing"]').count()) === 0,
    '"Don\'t ask again": stops asking (on both phones)',
  );
  await page.reload();
  await page.waitForTimeout(1500);
  await tab('Shop');
  await add('mystery thing');
  await page.locator('[data-quick-add]').blur();
  check((await page.locator('[data-save-product-sheet]').count()) === 0, '...even after the app is opened again');

  // Move one thing to the following week
  await page.locator('[data-item="Bin Bags"] [data-open-item]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-move-item]').click();
  await page.waitForTimeout(500);
  st = await state();
  const following = st.mealPlans.find((p) => p.startDate > S.mealPlans[1].startDate);
  check(
    following &&
      st.shoppingList.some((i) => i.planId === following.id && i.name === 'Bin Bags') &&
      !st.shoppingList.some((i) => i.planId === nextId && i.name === 'Bin Bags'),
    'Bin Bags moved to the following week (week made for it)',
  );

  // ---------- Add items: real "on the list" amounts, and a recipe's ingredients ----------
  await page.locator('[data-browse-items]').click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Search or type new item..."]').fill('milk');
  await page.waitForTimeout(300);
  const onList = await page.locator('[data-on-list]').allInnerTexts();
  check(
    onList.some((t) => /On the list: 6 pints/.test(t)) && !(await page.locator('body').innerText()).match(/\d+ added/),
    'Add items says "On the list: 6 pints" (no "1000 added")',
    JSON.stringify(onList),
  );
  await page.locator('[data-add-recipe-ingredients]').click();
  await page.waitForTimeout(500);
  check(/Add a recipe's ingredients/.test(await page.locator('body').innerText()), "opens Add a recipe's ingredients");
  await shot('s4-recipe-ingredients');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(1500);
  await tab('Shop');

  // ---------- Weekly staples window: visible Done button ----------
  await page.locator('#btn-shop-view-options').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-weekly-staples').click();
  await page.waitForTimeout(400);
  const doneBg = await page
    .locator('button', { hasText: /^Done$/ })
    .last()
    .evaluate((b) => getComputedStyle(b).backgroundColor);
  check(
    /Weekly staples/.test(await page.locator('body').innerText()) && doneBg !== 'rgba(0, 0, 0, 0)',
    'staples window: title and a visible Done button',
    doneBg,
  );
  await page
    .locator('button', { hasText: /^Done$/ })
    .last()
    .click();
  await page.waitForTimeout(300);

  // ---------- Share ----------
  await page.locator('[data-share-list]').click();
  await page.waitForTimeout(400);
  const copied = await page.evaluate(() => window.__copied || '');
  check(
    /^Shopping list · Next week \(\d+–\d+ \w+|^Shopping list · Next week \(\d+ \w+ – /.test(copied) &&
      /\nFresh Produce\n• /.test(copied) &&
      /• Milk – 6 pints \(semi-skimmed\)/.test(copied),
    'share copies the list, aisle by aisle, with notes',
    copied.slice(0, 300),
  );
  check(/List copied/.test(await toast()), 'toast: List copied', await toast());

  // ---------- Shopping mode: % done, notes, screen awake, Done shopping ----------
  await page.locator('#btn-go-shopping').click();
  await page.waitForTimeout(700);
  check((await page.evaluate(() => window.__wake)) >= 1, 'asks to keep the screen awake');
  check(
    /semi-skimmed/.test(await page.locator('[data-row]', { hasText: 'Milk' }).first().innerText()),
    'notes show in shopping mode',
  );
  // (i) while shopping: shows what it's for without ticking it
  const ticked0 = (await page.locator('body').innerText()).match(/(\d+) of (\d+) ticked/)?.[1];
  const firstRow = page.locator('[data-row]').first();
  const firstRowName = (await firstRow.innerText()).split('\n')[0].trim();
  await firstRow.locator('[data-item-info]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator(`[data-item-info-sheet]`).count()) === 1,
    `shopping mode (i) on ${firstRowName}: opens what it's for`,
  );
  const smInfoOnTop = await page.evaluate(() => {
    const b = document.querySelector('[data-item-info-close]').getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!(el && el.closest('[data-item-info-sheet]'));
  });
  check(
    smInfoOnTop && (await page.locator('[data-item-info-edit]').count()) === 0,
    'on top of shopping mode (just OK, no editing while shopping)',
  );
  check((await page.locator('[data-toast]').count()) === 0, 'no message covering it');
  await shot('s4c-shopping-info');
  await page.locator('[data-item-info-close]').click();
  await page.waitForTimeout(300);
  const ticked1 = (await page.locator('body').innerText()).match(/(\d+) of (\d+) ticked/)?.[1];
  check(
    ticked0 === ticked1 && (await page.locator('[data-item-info-sheet]').count()) === 0,
    '(i) did not tick it',
    `${ticked0} -> ${ticked1}`,
  );
  // Adding something new while shopping asks too, on top of shopping mode
  await page.locator('[data-shopping-quick-add] [data-quick-add]').fill('glow sticks');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(
    (await page.locator('[data-save-product-sheet="Glow sticks"][data-just-added]').count()) === 1,
    'shopping mode: something new asks too',
  );
  const onTop = await page.evaluate(() => {
    const b = document.querySelector('[data-new-product-save]').getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!(el && el.closest('[data-save-product-sheet]'));
  });
  check(onTop, 'shown on top of shopping mode');
  await shot('s4a-shopping-ask');
  await page.locator('[data-new-product-later]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator('[data-save-product-sheet]').count()) === 0 && /Added Glow sticks/.test(await toast()),
    '"Not now" while shopping: back to shopping, it says it was added',
    await toast(),
  );
  const total = await page.locator('[data-row]').count();
  // A tick stays put (crossed out, with Undo) for a few seconds before moving down
  const firstName = (await page.locator('[data-row]').first().innerText()).split('\n')[0].trim();
  await page.locator('[data-row]').first().click();
  await page.waitForTimeout(300);
  const first = page.locator('[data-row]').first();
  check(
    (await first.innerText()).startsWith(firstName) && (await first.locator('[data-undo-tick]').count()) === 1,
    `shopping mode: ${firstName} stays first, crossed out, with Undo`,
  );
  check(
    new RegExp(`1 of ${total} ticked`).test(await page.locator('body').innerText()),
    'the % counts it straight away',
  );
  await first.locator('[data-undo-tick]').click();
  await page.waitForTimeout(300);
  check(
    new RegExp(`0 of ${total} ticked`).test(await page.locator('body').innerText()) &&
      (await page.locator('[data-row][data-just-ticked]').count()) === 0,
    'Undo puts it back',
  );
  await page.locator('[data-row]').first().click();
  await page.waitForTimeout(4600);
  check(
    !(await page.locator('[data-row]').first().innerText()).startsWith(firstName),
    'a few seconds later it moves to the bottom of its aisle',
  );
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-row]').nth(i).click();
    await page.waitForTimeout(150);
  }
  await shot('s4b-just-ticked');
  check(
    new RegExp(`3 of ${total} ticked`).test(await page.locator('body').innerText()),
    `still the % header: 3 of ${total} ticked`,
  );
  await page.evaluate((id) => localStorage.setItem('shop_started_' + id, String(Date.now() - 23 * 60000)), nextId);
  await page.locator('[data-done-shopping]').click();
  await page.waitForTimeout(400);
  check(
    new RegExp(`3 of ${total} bought`).test(await page.locator('[data-done-title]').innerText()) &&
      /in 23 min/.test(await page.locator('[data-done-time]').innerText()),
    'Done sheet: "3 of N bought", "in 23 min"',
  );
  await shot('s5-done');
  await page.locator('[data-done="move"]').click();
  await page.waitForTimeout(700);
  st = await state();
  const left = st.shoppingList.filter((i) => i.planId === nextId && !i.checked && i.cupboard !== 'have');
  const moved = st.shoppingList.filter((i) => i.planId === following.id);
  check(
    left.length === 0 && moved.length >= total - 3,
    `the rest moved to the following week (${moved.length} lines there)`,
    JSON.stringify(left.map((i) => i.name)),
  );
  check(
    /Shop done: 3 bought in 23 min/.test(await toast()),
    'toast: "Shop done: 3 bought in 23 min · …"',
    await toast(),
  );
  check(
    (await page.locator('[data-all-bought]').count()) === 1 && /3 of 3 bought/.test(await progress()),
    "back on the list: Everything's bought, 3 of 3",
  );
  await shot('s6-after');

  // ---------- Reopen: still next week on Fri–Sun ----------
  await page.reload();
  await page.waitForTimeout(1500);
  await tab('Shop');
  const name = await page.locator('[data-shop-week-name]').innerText();
  const likely = dow === 0 || dow >= 5 ? 'Next week' : 'This week';
  check(name === likely || name === 'Next week', `reopens on ${name}`, name);

  // ---------- "See the list" from Planning opens that week ----------
  await tab('Planning');
  if (dow === 0 || dow >= 5) {
    await page.locator('[data-week-prev]').click();
    await page.waitForTimeout(400);
  }
  const sent = page.locator('[data-sent]');
  if (await sent.count()) {
    await sent.click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'See the list' }).click();
    await page.waitForTimeout(700);
    check(
      (await page.locator('[data-shop-week-name]').innerText()) === 'This week',
      '"See the list" for this week opens Shop on this week',
    );
  } else check(false, 'this week shows Sent in Planning');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
