// Recipe import: what Gemini copies is saved unchanged, then scaled and shopped for by the app.
// Run with: npm test
import assert from 'node:assert/strict';
import {
  normalizeParsedRecipe, generateShoppingListForPlan, scaleRecipeStepQuantities,
  buildCatalog, linkIngredients, canonicalUnit, INITIAL_GROCERY_DATABASE,
} from '../.test-build/recipeImport.mjs';

let failures = 0, passes = 0;
const test = (name, fn) => {
  try { fn(); passes++; console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '\n    ', String(e.message).split('\n').slice(0, 8).join('\n     ')); }
};
const cat = buildCatalog(INITIAL_GROCERY_DATABASE, {});

// What Gemini returns when asked to COPY these recipes (quantities and wording exactly as written).
const COPIED = {
  bolognese: {
    name: 'Spaghetti bolognese', description: 'A family favourite.', servings: 4, prepTime: 15, cookTime: 45,
    ingredients: [
      { name: 'olive oil', amount: 1, unit: 'tbsp', note: '' },
      { name: 'onion', amount: 1, unit: '', note: 'finely chopped' },
      { name: 'carrots', amount: 2, unit: '', note: 'finely chopped' },
      { name: 'celery sticks', amount: 2, unit: '', note: 'finely chopped' },
      { name: 'garlic cloves', amount: 2, unit: '', note: 'crushed' },
      { name: 'beef mince', amount: 500, unit: 'g', note: '' },
      { name: 'chopped tomatoes', amount: 2, unit: 'x 400g tins', note: '' },
      { name: 'tomato purée', amount: 1, unit: 'tbsp', note: '' },
      { name: 'beef stock cube', amount: 1, unit: '', note: 'crumbled' },
      { name: 'spaghetti', amount: 400, unit: 'g', note: '' },
      { name: 'parmesan', amount: 0, unit: '', note: 'to serve' },
    ],
    instructions: [
      'Heat 1 tbsp olive oil in a large pan and fry the onion, carrots and celery for 10 mins.',
      'Add the garlic and 500g beef mince and brown for 5 mins.',
      'Tip in the 2 tins of tomatoes, the purée and crumbled stock cube, then simmer for 30 mins.',
      'Cook 400g spaghetti following pack instructions. Serve with parmesan.',
    ],
    isVegetarian: false, isVegan: false,
  },
  tikka: {
    name: 'Chicken tikka masala', description: '', servings: 4, prepTime: 0, cookTime: 0,
    ingredients: [
      { name: 'skinless chicken breasts', amount: 4, unit: '', note: 'cut into chunks' },
      { name: 'natural yogurt', amount: 150, unit: 'g', note: '' },
      { name: 'tikka paste', amount: 2, unit: 'heaped tbsp', note: '' },
      { name: 'ginger', amount: 1, unit: 'thumb-sized piece', note: 'grated' },
      { name: 'coconut milk', amount: 1, unit: 'can', note: '400ml' },
      { name: 'coriander', amount: 1, unit: 'small bunch', note: 'chopped' },
      { name: 'basmati rice', amount: 300, unit: 'g', note: 'to serve' },
    ],
    instructions: ['Mix the chicken with the yogurt and tikka paste.', 'Fry for 10 mins, add the coconut milk and simmer for 15 mins.', 'Scatter with coriander and serve with rice.'],
    isVegetarian: false, isVegan: false,
  },
  aubergineCurry: {
    name: 'Aubergine & chickpea curry', servings: 2, prepTime: 10, cookTime: 25,
    ingredients: [
      { name: 'aubergine', amount: 1, unit: '', note: 'cut into chunks' },
      { name: 'chickpeas', amount: 1, unit: 'x 400g tin', note: 'drained' },
      { name: 'coconut milk', amount: 400, unit: 'ml', note: '' },
      { name: 'curry paste', amount: 2, unit: 'tbsp', note: '' },
      { name: 'butternut squash', amount: 0.5, unit: '', note: 'peeled and diced' },
    ],
    instructions: ['Fry the aubergine.', 'Add everything else and simmer.'],
    isVegetarian: true, isVegan: true,
  },
  noServings: {
    name: 'Quick omelette', ingredients: [
      { name: 'eggs', amount: 3, unit: '', note: 'beaten' },
      { name: 'butter', amount: 1, unit: 'knob', note: '' },
      { name: 'salt and pepper', amount: 0, unit: '', note: 'to taste' },
      { name: 'chives', amount: 3, unit: 'tbsp', note: 'snipped' },
    ],
    instructions: ['Whisk the eggs.', 'Melt the butter and cook for 2 mins.'],
    isVegetarian: true, isVegan: false,
  },
};

const fields = ['name', 'amount', 'unit', 'note'];

test('what Gemini copied is saved exactly: names, amounts, units, notes, method', () => {
  for (const [key, copied] of Object.entries(COPIED)) {
    const r = normalizeParsedRecipe(copied, 'oven_hob');
    assert.equal(r.ingredients.length, copied.ingredients.length, key);
    copied.ingredients.forEach((ing, i) => {
      for (const f of fields) {
        const want = f === 'note' ? (ing.note || undefined) : ing[f];
        assert.equal(r.ingredients[i][f], want, `${key}: ${ing.name}.${f}`);
      }
    });
    assert.deepEqual(r.instructions, copied.instructions, `${key}: method changed`);
    assert.deepEqual(r.methodInstructions.oven_hob, copied.instructions);
    assert.equal(r.name, copied.name);
  }
});

test('servings are kept as written (not rewritten for two); missing servings default to 2', () => {
  assert.equal(normalizeParsedRecipe(COPIED.bolognese, 'oven_hob').servings, 4);
  assert.equal(normalizeParsedRecipe(COPIED.aubergineCurry, 'oven_hob').servings, 2);
  assert.equal(normalizeParsedRecipe(COPIED.noServings, 'oven_hob').servings, 2);
});

test('times: stated times are kept, missing ones are estimated (never zero)', () => {
  const b = normalizeParsedRecipe(COPIED.bolognese, 'oven_hob');
  assert.equal(b.prepTime, 15); assert.equal(b.cookTime, 45);
  const t = normalizeParsedRecipe(COPIED.tikka, 'oven_hob');
  assert.ok(t.prepTime > 0 && t.cookTime > 0);
});

test('vegetarian/vegan: Gemini\'s judgement is kept (word matching got these wrong)', () => {
  const c = normalizeParsedRecipe(COPIED.aubergineCurry, 'oven_hob');
  assert.equal(c.isVegan, true, 'aubergine + coconut milk + butternut squash is vegan');
  assert.equal(c.isVegetarian, true);
  const o = normalizeParsedRecipe(COPIED.noServings, 'oven_hob');
  assert.equal(o.isVegetarian, true); assert.equal(o.isVegan, false);
  assert.equal(normalizeParsedRecipe({ ...COPIED.aubergineCurry, isVegetarian: false, isVegan: true }, 'oven_hob').isVegan, false, 'vegan implies vegetarian');
});

test('"Gluten-Free" / "Dairy-Free" only when the ingredients and Gemini agree', () => {
  const tags = (copied) => normalizeParsedRecipe(copied, 'oven_hob').tags;
  // Pasta with parmesan: never free-from, whatever Gemini says
  const pasta = { ...COPIED.bolognese, isGlutenFree: true, isDairyFree: true };
  assert.ok(!tags(pasta).includes('Gluten-Free'), 'spaghetti is not gluten-free');
  assert.ok(!tags(pasta).includes('Dairy-Free'), 'parmesan is not dairy-free');
  // Gemini didn't say: no label (a wrong free-from label is worse than none)
  assert.deepEqual(tags(COPIED.tikka).filter((t) => /Free/.test(t)), []);
  // Vegan curry with Gemini agreeing
  const curry = tags({ ...COPIED.aubergineCurry, isGlutenFree: true, isDairyFree: true });
  assert.ok(curry.includes('Vegan') && curry.includes('Gluten-Free') && curry.includes('Dairy-Free'), curry.join());
  // Look-alikes that are not dairy / gluten
  const lookalikes = tags({ name: 'Bean stew', servings: 2, isVegetarian: true, isVegan: false, isGlutenFree: true, isDairyFree: true, instructions: ['Stew.'],
    ingredients: [{ name: 'butter beans', amount: 1, unit: 'tin' }, { name: 'coconut cream', amount: 100, unit: 'ml' }, { name: 'peanut butter', amount: 1, unit: 'tbsp' }, { name: 'rice noodles', amount: 200, unit: 'g' }, { name: 'butternut squash', amount: 1, unit: '' }] });
  assert.ok(lookalikes.includes('Gluten-Free') && lookalikes.includes('Dairy-Free'), lookalikes.join());
  // Gemini says not gluten-free (e.g. stock cubes with wheat) -> no label even though no word matched
  assert.ok(!tags({ ...COPIED.aubergineCurry, isGlutenFree: false, isDairyFree: true }).includes('Gluten-Free'));
});

test('the recipe is saved under the appliance it was written for', () => {
  const n = normalizeParsedRecipe(COPIED.bolognese, 'ninja');
  assert.deepEqual(n.cookingMethods, ['ninja']);
  assert.deepEqual(n.methodInstructions.ninja, COPIED.bolognese.instructions);
});

test('units as recipes write them are understood', () => {
  const cases = { 'x 400g tins': 'can', 'x 400g tin': 'can', 'heaped tbsp': 'tbsp', 'level tsp': 'tsp', 'small bunch': 'bunch', 'large handful': 'handful', 'thumb-sized piece': 'thumb', 'bunch of': 'bunch', 'generous pinch': 'pinch' };
  for (const [raw, want] of Object.entries(cases)) assert.equal(canonicalUnit(raw), want, raw);
});

// --- The app does the maths ---------------------------------------------------
const planFor = (recipe, servings) => ({
  id: 'plan-2026-10-19', startDate: '2026-10-19', status: 'finalized', isCurrent: false,
  days: { Monday: { date: '2026-10-19', meals: [{ id: 'm1', type: 'recipe', recipeId: recipe.id, name: recipe.name, servings }] } },
});
const listText = (items) => Object.fromEntries(items.map((i) => [i.name, `${i.amount}${i.unit ? ' ' + i.unit : ''}${i.checkCupboard ? ' [cupboard]' : ''}${i.needsCheck ? ' [check: ' + i.quantityNote + ']' : ''}`]));

test('a "serves 4" recipe cooked for 2: the shopping list is worked out for 2', () => {
  const recipe = normalizeParsedRecipe(COPIED.bolognese, 'oven_hob');
  recipe.ingredients = linkIngredients(recipe.ingredients, cat).ingredients;
  const list = listText(generateShoppingListForPlan(planFor(recipe, 2), [recipe], cat));
  assert.equal(list['Beef Mince'], '250 g', '500 g for 4 -> 250 g for 2');
  assert.equal(list['Chopped Tomatoes'], '1 can', '2 tins for 4 -> 1 can for 2');
  assert.equal(list['Spaghetti'], '200 g [cupboard]', '400 g for 4 -> 200 g');
  assert.equal(list['Onion'], '1');
  assert.equal(list['Celery'], '1 bunch');
  assert.equal(list['Garlic'], '1 bulb');
  assert.equal(list['Parmesan'], '100 g', '"to serve" with no amount still buys the smallest pack');
  assert.equal(list['Stock Cubes'], '1 pack [cupboard]');
  assert.ok(Object.values(list).every((v) => !v.includes('[check')), JSON.stringify(list));
});

test('the same recipe cooked for 4 and for 6', () => {
  const recipe = normalizeParsedRecipe(COPIED.bolognese, 'oven_hob');
  const four = listText(generateShoppingListForPlan(planFor(recipe, 4), [recipe], cat));
  assert.equal(four['Beef Mince'], '500 g'); assert.equal(four['Chopped Tomatoes'], '2 cans');
  const six = listText(generateShoppingListForPlan(planFor(recipe, 6), [recipe], cat));
  assert.equal(six['Beef Mince'], '750 g'); assert.equal(six['Chopped Tomatoes'], '3 cans');
});

test('messy units from the copy step still give sensible quantities', () => {
  const recipe = normalizeParsedRecipe(COPIED.tikka, 'oven_hob');
  recipe.ingredients = linkIngredients(recipe.ingredients, cat).ingredients;
  const list = listText(generateShoppingListForPlan(planFor(recipe, 2), [recipe], cat));
  assert.equal(list['Chicken Breasts'], '500 g', '4 breasts for 4 -> 2 breasts (300 g) -> 500 g in 250 g steps');
  assert.equal(list['Coriander'], '1 bunch');
  assert.equal(list['Ginger'], '50 g');
  assert.equal(list['Coconut Milk'], '1 can');
  assert.equal(list['Curry Paste'], '1 jar');
  assert.ok(Object.values(list).every((v) => !v.includes('[check')), JSON.stringify(list));
});

test('Cook mode scales the copied method for the people you\'re cooking for', () => {
  const recipe = normalizeParsedRecipe(COPIED.bolognese, 'oven_hob');
  const half = (s) => scaleRecipeStepQuantities(s, recipe.ingredients, 0.5);
  assert.equal(half(COPIED.bolognese.instructions[1]), 'Add the garlic and 250g beef mince and brown for 5 mins.');
  assert.equal(half(COPIED.bolognese.instructions[3]), 'Cook 200g spaghetti following pack instructions. Serve with parmesan.');
  assert.ok(half(COPIED.bolognese.instructions[0]).includes('10 mins'), 'cooking times must not be scaled');
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
