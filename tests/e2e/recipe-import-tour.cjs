const { openApp, tab, buttons, state } = require('./flow-lib.cjs');
const OUT = process.argv[2];
(async () => {
  const { browser, page, geminiCalls } = await openApp();
  await tab(page, 'Cookbook');
  await page.locator('[data-add-recipe-button], [data-empty-cookbook] button').first().click();
  await page.waitForTimeout(500);
  await page
    .locator('textarea')
    .fill(
      'Chicken & chorizo pasta bake. Serves 4.\n1 tbsp olive oil\n1 onion\n2 garlic cloves\n100g chorizo\n2 chicken breasts\n400g can chopped tomatoes\n300g penne\n125g mozzarella\nsmall bunch basil\nMethod: fry, simmer, bake.',
    );
  await page.locator('[data-appliance="oven_hob"]').click();
  await page.waitForTimeout(300);
  const b = await buttons(page);
  console.log(
    'after appliance:',
    JSON.stringify(b.filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x))),
  );
  const go = page.locator('[data-add-go]');
  console.log('clicking:', await go.innerText());
  await go.click();
  await page.waitForTimeout(2500);
  console.log(
    'gemini calls:',
    geminiCalls.map((c) => c.kind + (c.asked ? ' ' + JSON.stringify(c.asked) : '')).join(' | '),
  );
  await page.screenshot({ path: OUT + '/flow-parsed.png' });
  console.log('after parse buttons:', JSON.stringify((await buttons(page)).slice(0, 40)));
  for (let i = 0; i < 10; i++) {
    const keep = page.locator('button:visible', { hasText: /^Keep ".*" As-Is/ });
    if (!(await keep.count())) break;
    console.log('  triage:', await keep.first().innerText());
    await keep.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: OUT + '/flow-review.png' });
  console.log(
    'review buttons:',
    JSON.stringify(
      (await buttons(page)).filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x)).slice(0, 40),
    ),
  );
  const save = page.locator('[data-save-recipe]');
  if (await save.count()) {
    console.log('saving via:', await save.innerText());
    await save.click();
    await page.waitForTimeout(1200);
  }
  console.log(
    'opened after saving:',
    await page
      .locator('[data-recipe-popup] h2')
      .innerText()
      .catch(() => 'none'),
  );
  await page
    .getByRole('button', { name: 'Close' })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
  const s = (await state(page)) || { recipes: [] };
  console.log('recipes saved:', s.recipes.length);
  if (s.recipes[0]) {
    const r = s.recipes[0];
    console.log(
      ' ',
      r.name,
      '| servings',
      r.servings,
      '| cost',
      r.costEstimate,
      r.costBreakdown?.totalCost,
      '| health',
      r.healthScore,
      r.healthBreakdown?.score,
      r.healthBreakdown?.macros?.calories,
    );
    r.ingredients.forEach((i) => console.log('   ', i.amount, i.unit, i.name));
  }
  await page.screenshot({ path: OUT + '/flow-saved.png' });
  // ---- Planning ----
  await tab(page, 'Planning');
  await page.screenshot({ path: OUT + '/flow-planning.png' });
  await page.locator('[data-week-strip] [aria-label^="Add a meal on"]').first().click();
  await page.waitForTimeout(600);
  console.log(
    'PICKER buttons:',
    JSON.stringify(
      (await buttons(page)).filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x)).slice(0, 30),
    ),
  );
  await page.screenshot({ path: OUT + '/flow-picker.png' });
  await page
    .locator('button:visible', { hasText: /^Chicken & chorizo pasta bake/i })
    .first()
    .click();
  await page.waitForTimeout(800);
  console.log(
    'AFTER PICK:',
    JSON.stringify(
      (await buttons(page)).filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x)).slice(0, 30),
    ),
  );
  await page.screenshot({ path: OUT + '/flow-picked.png' });
  // One tap: no sides or people dialogs any more
  console.log(
    'dialogs after pick (should be 0):',
    await page.locator('button:visible', { hasText: /Save Sides|^Done$/ }).count(),
  );
  await page.locator('[data-send-to-list]').click();
  await page.waitForTimeout(800);
  console.log(
    'REVIEW:',
    JSON.stringify(
      (await buttons(page)).filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x)).slice(0, 30),
    ),
  );
  await page.screenshot({ path: OUT + '/flow-review-plan.png' });
  await page
    .locator('button:visible', { hasText: /^Send to shopping list$/ })
    .last()
    .click();
  await page.waitForTimeout(1500);
  console.log(
    'AFTER FINALIZE:',
    JSON.stringify(
      (await buttons(page)).filter((x) => !/^(Cookbook|Planning|Shop|Cook|Freezer|Settings)$/.test(x)).slice(0, 30),
    ),
  );
  await page.screenshot({ path: OUT + '/flow-finalized.png' });
  const st = await state(page);
  console.log('plans:', st.mealPlans.map((p) => p.startDate + ':' + p.status).join(', '));
  console.log('SHOPPING LIST (generated):');
  st.shoppingList.forEach((i) => console.log('   ', i.amount, i.unit, '|', i.name, '|', i.category));
  await tab(page, 'Shop');
  await page.waitForTimeout(500);
  // One row per product, by aisle
  const rows = await page
    .locator('[data-item]')
    .evaluateAll((xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log('SHOP ROWS:', JSON.stringify(rows.slice(0, 30)));
  const qty = await page.locator('[data-item-qty]').evaluateAll((xs) => xs.map((x) => x.innerText.trim()));
  console.log('QTY FIELDS:', JSON.stringify(qty));
  await page.locator('[data-item="Olive Oil"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/flow-shop-bottom.png' });
  // + on a canned item, from its panel
  await page.locator('[data-item="Chopped Tomatoes"] [data-open-item]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-item-sheet] [data-more]').first().click();
  await page.waitForTimeout(500);
  console.log(
    'after + on tomatoes:',
    JSON.stringify(await page.locator('[data-item-sheet] [data-amount]').first().inputValue()),
  );
  await page.locator('[data-item-done]').click();
  await page.waitForTimeout(300);
  // add Milk twice by hand
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-quick-add]').fill('Milk');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  await page.locator('[data-quick-add]').blur();
  const st2 = await state(page);
  console.log(
    'milk on list:',
    JSON.stringify(st2.shoppingList.filter((i) => /milk/i.test(i.name)).map((i) => i.amount + ' ' + i.unit)),
  );
  await page.locator('#btn-go-shopping').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/flow-shopping-mode.png' });
  const big = await page
    .locator('[data-row]')
    .evaluateAll((xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log('shopping mode rows:', JSON.stringify(big.slice(0, 15)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/flow-shop.png', fullPage: false });
  await page.locator('button:visible:has(svg.lucide-x)').first().click();
  await page.waitForTimeout(500); // leave shopping mode
  await tab(page, 'Cookbook');
  await page.waitForTimeout(400);
  await page.locator('[data-recipe-card="Chicken & chorizo pasta bake"]').click();
  await page.waitForTimeout(800);
  console.log(
    'pop-up ingredients:',
    JSON.stringify(
      await page
        .locator('[data-recipe-ingredients] li')
        .evaluateAll((xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ').trim())),
    ),
  );
  await page.screenshot({ path: OUT + '/flow-recipe-detail.png' });
  console.log('errors:', JSON.stringify(page.errors));
  await browser.close();
})();
