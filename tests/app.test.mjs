// Helpers behind the Shop screen and the recipe cards. Run with: npm test
import assert from 'node:assert/strict';
import {
  orderedAisles, aislePositions, GROCERY_AISLES,
  recipeMethods, totalMinutes, formatMinutes, recipeHistories, formatAgo, formatPlannedDay, freezerPortions,
  sortRecipes, firstUrl, siteName, recipeIntro, isVegetarianRecipe, isVeganRecipe,
} from '../.test-build/app.mjs';

let failures = 0, passes = 0;
const test = (name, fn) => {
  try { fn(); passes++; console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '\n    ', String(e.message).split('\n').slice(0, 6).join('\n     ')); }
};
const usual = Object.keys(GROCERY_AISLES).sort((a, b) => GROCERY_AISLES[a].order - GROCERY_AISLES[b].order);

test('no saved order: the usual aisle order', () => {
  assert.deepEqual(orderedAisles(undefined), usual);
  assert.deepEqual(orderedAisles(null), usual);
  assert.deepEqual(orderedAisles([]), usual);
});

test('your order first, any aisles you did not place follow in the usual order', () => {
  const mine = ['meat_seafood', 'dairy_eggs', 'produce'];
  const out = orderedAisles(mine);
  assert.deepEqual(out.slice(0, 3), mine);
  assert.deepEqual(out.slice(3), usual.filter((a) => !mine.includes(a)));
  assert.equal(out.length, usual.length);
});

test('bad saved data is ignored, never lost aisles or duplicates', () => {
  const out = orderedAisles(['frozen', 'frozen', 'not_an_aisle', 42, 'produce', '__proto__']);
  assert.deepEqual(out.slice(0, 2), ['frozen', 'produce']);
  assert.equal(new Set(out).size, usual.length);
  assert.equal(out.length, usual.length);
  assert.deepEqual(orderedAisles('produce'), usual, 'not an array');
});

test('positions number the aisles 1..n in your order', () => {
  const pos = aislePositions(['frozen']);
  assert.equal(pos.frozen, 1);
  assert.equal(pos.produce, 2);
  assert.deepEqual(Object.values(pos).sort((a, b) => a - b), usual.map((_, i) => i + 1));
});

// ---------- Recipe cards and pop-up ----------
const R = (id, name, extra = {}) => ({ id, name, description: '', servings: 2, prepTime: 0, cookTime: 0, ingredients: [], instructions: [], tags: [], ...extra });

test('time: prep + cook, never made up when the recipe has none', () => {
  assert.equal(totalMinutes(R('a', 'A', { prepTime: 15, cookTime: 30 })), 45);
  assert.equal(totalMinutes(R('a', 'A')), null);
  assert.equal(totalMinutes(R('a', 'A', { prepTime: undefined, cookTime: undefined })), null);
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 hr');
  assert.equal(formatMinutes(75), '1 hr 15 min');
});

test('methods: only the ones it really has steps for', () => {
  assert.deepEqual(recipeMethods(R('a', 'A', { cookingMethods: ['oven_hob'], methodInstructions: { oven_hob: ['Bake.'] } })), ['oven_hob']);
  assert.deepEqual(recipeMethods(R('a', 'A', { methodInstructions: { ninja: ['Combi.'], oven_hob: ['Bake.'] } })), ['oven_hob', 'ninja']);
  // marked for both but only oven steps written: Ninja isn't claimed
  assert.deepEqual(recipeMethods(R('a', 'A', { cookingMethods: ['oven_hob', 'ninja'], methodInstructions: { oven_hob: ['Bake.'], ninja: ['  '] } })), ['oven_hob']);
  // no steps per method: fall back to what it's marked for; nothing known = no label
  assert.deepEqual(recipeMethods(R('a', 'A', { cookingMethods: ['ninja'] })), ['ninja']);
  assert.deepEqual(recipeMethods(R('a', 'A', { instructions: ['Cook.'] })), []);
});

test('vegetarian / vegan from the flags or tags', () => {
  assert.equal(isVegetarianRecipe(R('a', 'A', { tags: ['Veggie'] })), true);
  assert.equal(isVegetarianRecipe(R('a', 'A', { isVegan: true })), true, 'vegan counts as vegetarian');
  assert.equal(isVeganRecipe(R('a', 'A', { isVegetarian: true })), false);
});

const plan = (start, days) => {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const out = {};
  names.forEach((d, i) => {
    const dt = new Date(start + 'T12:00:00'); dt.setDate(dt.getDate() + i);
    const iso = dt.toISOString().slice(0, 10);
    out[d] = { date: iso, meals: (days[d] || []).map((recipeId, k) => ({ id: d + k, type: 'recipe', recipeId, name: recipeId, servings: 2 })) };
  });
  return { id: 'plan-' + start, startDate: start, days: out, status: 'draft' };
};

test('last had and next planned, across weeks', () => {
  const plans = [
    plan('2026-10-05', { Monday: ['bol'], Friday: ['tikka'] }),
    plan('2026-10-12', { Tuesday: ['bol'], Saturday: ['chilli'] }),
    plan('2026-10-19', { Monday: ['tikka'], Thursday: ['bol'] }),
  ];
  const h = recipeHistories(plans, '2026-10-17');
  assert.deepEqual(h.get('bol'), { lastHad: '2026-10-13', nextPlanned: '2026-10-22' });
  assert.deepEqual(h.get('tikka'), { lastHad: '2026-10-09', nextPlanned: '2026-10-19' });
  assert.deepEqual(h.get('chilli'), { nextPlanned: '2026-10-17' }, 'today counts as planned, not had');
  assert.equal(h.get('omelette'), undefined);
});

test('"last had" and "planned" in words', () => {
  const today = '2026-10-17';
  assert.equal(formatAgo('2026-10-16', today), 'yesterday');
  assert.equal(formatAgo('2026-10-13', today), '4 days ago');
  assert.equal(formatAgo('2026-10-03', today), '2 weeks ago');
  assert.equal(formatAgo('2026-07-17', today), '3 months ago');
  assert.equal(formatAgo('2025-08-01', today), 'over a year ago');
  assert.equal(formatPlannedDay('2026-10-17', today), 'today');
  assert.equal(formatPlannedDay('2026-10-18', today), 'tomorrow');
  assert.equal(formatPlannedDay('2026-10-22', today), 'Thu');
  assert.equal(formatPlannedDay('2026-10-29', today), 'Thu 29 Oct');
});

test('freezer: portions linked to the recipe, or batches with exactly its name', () => {
  const chilli = R('r-chilli', 'Chilli con carne');
  const batches = [
    { id: 'b1', recipeId: 'r-chilli', name: 'Chilli', portions: 3, dateAdded: '2026-10-01' },
    { id: 'b2', name: 'chilli con carne ', portions: 2, dateAdded: '2026-10-01' },
    { id: 'b3', recipeId: 'r-other', name: 'Chilli con carne', portions: 5, dateAdded: '2026-10-01' },
    { id: 'b4', name: 'Lentil soup', portions: 4, dateAdded: '2026-10-01' },
  ];
  assert.equal(freezerPortions(chilli, batches), 5);
  assert.equal(freezerPortions(chilli, undefined), 0);
});

test('sorting: A-Z, newest, and "not had lately" (never had first, planned last)', () => {
  const recipes = [R('bol', 'Spaghetti bolognese'), R('om', 'cheese omelette'), R('tikka', 'Chicken tikka'), R('chilli', 'Chilli'), R('new', 'Aubergine curry')];
  const h = recipeHistories([
    plan('2026-10-05', { Monday: ['tikka'] }),
    plan('2026-10-12', { Tuesday: ['bol'], Monday: ['om'] }),
    plan('2026-10-19', { Monday: ['chilli'] }),
  ], '2026-10-17');
  assert.deepEqual(sortRecipes(recipes, 'az', h).map((r) => r.id), ['new', 'om', 'tikka', 'chilli', 'bol']);
  assert.deepEqual(sortRecipes(recipes, 'newest', h).map((r) => r.id), ['new', 'chilli', 'tikka', 'om', 'bol']);
  assert.deepEqual(sortRecipes(recipes, 'added', h).map((r) => r.id), recipes.map((r) => r.id));
  assert.deepEqual(sortRecipes(recipes, 'not_lately', h).map((r) => r.id), ['new', 'tikka', 'om', 'bol', 'chilli']);
  assert.deepEqual(recipes.map((r) => r.id), ['bol', 'om', 'tikka', 'chilli', 'new'], 'the book itself is not reordered');
});

test('website: first link in pasted text, shown as the site name', () => {
  assert.equal(firstUrl('Chicken tikka\nhttps://www.bbcgoodfood.com/recipes/chicken-tikka-masala.\nServes 4'), 'https://www.bbcgoodfood.com/recipes/chicken-tikka-masala');
  assert.equal(firstUrl('(from https://example.com/a?b=1)'), 'https://example.com/a?b=1');
  assert.equal(firstUrl('no link here'), undefined);
  assert.equal(siteName('https://www.bbcgoodfood.com/recipes/x'), 'bbcgoodfood.com');
});

test('intro: the app\'s old filler text is not shown as an intro', () => {
  assert.equal(recipeIntro(R('a', 'A', { description: 'Custom home-cooked meal.' })), '');
  assert.equal(recipeIntro(R('a', 'A', { description: 'A rich, creamy curry.' })), 'A rich, creamy curry.');
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
