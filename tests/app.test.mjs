// Helpers behind the Shop screen and the recipe cards. Run with: npm test
import assert from 'node:assert/strict';
import {
  orderedAisles, aislePositions, GROCERY_AISLES, generateShoppingListForPlan,
  recipeMethods, totalMinutes, formatMinutes, recipeHistories, formatAgo, formatPlannedDay, freezerPortions, freezerBatchesFor,
  sortRecipes, firstUrl, siteName, recipeIntro, isVegetarianRecipe, isVeganRecipe,
  recipeMatchesSearch, matchesQuickFilters, findDuplicate, normaliseRecipeName, isJustAUrl, recipeShareText,
  moveMeal, relinkLeftovers, listSnapshot, changedDaysSinceList, cooksForText, leftoverSourceDay, preferredWeekStart,
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

test('freezer: the batches to use, oldest first, empty ones left out', () => {
  const chilli = R('r-chilli', 'Chilli con carne');
  const batches = [
    { id: 'new', recipeId: 'r-chilli', name: 'Chilli', portions: 2, dateAdded: '2026-10-10' },
    { id: 'empty', recipeId: 'r-chilli', name: 'Chilli', portions: 0, dateAdded: '2026-09-01' },
    { id: 'old', name: 'Chilli con carne', portions: 1, dateAdded: '2026-09-20' },
  ];
  assert.deepEqual(freezerBatchesFor(chilli, batches).map((b) => b.id), ['old', 'new']);
  assert.deepEqual(freezerBatchesFor(R('x', 'Lentil soup'), batches), []);
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

// ---------- Cookbook: search, filters, favourites, duplicates, share ----------
test('search looks in names, ingredients, notes and tags', () => {
  const r = R('t', 'Chicken tikka masala', { ingredients: [{ id: 'i', name: 'basmati rice', amount: 300, unit: 'g' }, { id: 'j', name: 'ginger', amount: 1, unit: '', note: 'grated' }], notes: 'Kids love it', tags: ['Stovetop'] });
  for (const q of ['tikka', 'RICE', 'grated', 'kids', 'stovetop', '']) assert.equal(recipeMatchesSearch(r, q), true, q);
  assert.equal(recipeMatchesSearch(r, 'salmon'), false);
});

test('filter buttons: quick, veggie, ninja, freezer, favourites, not had lately (and all together)', () => {
  const today = '2026-10-17';
  const quick = R('q', 'Omelette', { prepTime: 5, cookTime: 5, isVegetarian: true, favourite: true });
  const notimes = R('n', 'Salmon');
  const ninja = R('j', 'Fajitas', { cookingMethods: ['oven_hob', 'ninja'], methodInstructions: { oven_hob: ['Fry.'], ninja: ['Air fry.'] } });
  const markedOnly = R('m', 'Chilli', { cookingMethods: ['oven_hob', 'ninja'], methodInstructions: { oven_hob: ['Simmer.'] } });
  const ctx = (h = undefined, freezer = 0) => ({ history: h, freezer, today });
  assert.equal(matchesQuickFilters(quick, ['quick'], ctx()), true);
  assert.equal(matchesQuickFilters(notimes, ['quick'], ctx()), false, 'no time written down is not "quick"');
  assert.equal(matchesQuickFilters(quick, ['veggie', 'quick', 'favourites'], ctx()), true);
  assert.equal(matchesQuickFilters(ninja, ['ninja'], ctx()), true);
  assert.equal(matchesQuickFilters(markedOnly, ['ninja'], ctx()), false, 'marked Ninja but no Ninja steps');
  assert.equal(matchesQuickFilters(markedOnly, ['freezer'], ctx(undefined, 3)), true);
  assert.equal(matchesQuickFilters(markedOnly, ['freezer'], ctx()), false);
  assert.equal(matchesQuickFilters(quick, ['not_lately'], ctx()), true, 'never had');
  assert.equal(matchesQuickFilters(quick, ['not_lately'], ctx({ lastHad: '2026-09-01' })), true, '6 weeks ago');
  assert.equal(matchesQuickFilters(quick, ['not_lately'], ctx({ lastHad: '2026-10-10' })), false, 'last week');
  assert.equal(matchesQuickFilters(quick, ['not_lately'], ctx({ lastHad: '2026-08-01', nextPlanned: '2026-10-20' })), false, 'already planned');
  assert.equal(matchesQuickFilters(notimes, [], ctx()), true, 'no filters: everything');
});

test('favourites first keeps the chosen order within each group', () => {
  const list = [R('a', 'Apple pie'), R('b', 'Bolognese', { favourite: true }), R('c', 'Curry'), R('d', 'Dal', { favourite: true })];
  assert.deepEqual(sortRecipes(list, 'az', new Map(), true).map((r) => r.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(sortRecipes(list, 'az', new Map(), false).map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('duplicates: same name (ignoring case, punctuation, "&"/"and", "the") or the same web page', () => {
  assert.equal(normaliseRecipeName('The Chicken & Chorizo Bake!'), normaliseRecipeName('chicken and chorizo bake'));
  const book = [R('1', 'Chicken tikka masala'), R('2', 'Lemon pasta', { sourceUrl: 'https://www.bbcgoodfood.com/recipes/lemon-pasta/' })];
  assert.equal(findDuplicate(book, R('x', 'chicken TIKKA masala'))?.id, '1');
  assert.equal(findDuplicate(book, R('x', 'Zesty spaghetti', { sourceUrl: 'https://bbcgoodfood.com/recipes/lemon-pasta?utm=x' }))?.id, '2');
  assert.equal(findDuplicate(book, R('x', 'Chicken korma')), undefined);
  assert.equal(findDuplicate(book, R('1', 'Chicken tikka masala')), undefined, 'not a duplicate of itself');
});

test('a link on its own is a link import; a recipe with a link in it is not', () => {
  assert.equal(isJustAUrl('  https://www.bbcgoodfood.com/recipes/x  '), true);
  assert.equal(isJustAUrl('Lemon pasta https://example.com/x'), false);
  assert.equal(isJustAUrl('not a link'), false);
});

test('share text: name, people, ingredients (scaled), method and website', () => {
  const r = R('s', 'Lemon pasta', {
    servings: 2, prepTime: 5, cookTime: 10, notes: 'Extra lemon', sourceUrl: 'https://example.com/lemon',
    ingredients: [{ id: 'a', name: 'spaghetti', amount: 200, unit: 'g' }, { id: 'b', name: 'lemon', amount: 1, unit: '', note: 'zested' }],
    methodInstructions: { oven_hob: ['Boil the pasta.', 'Add the lemon.'] }, cookingMethods: ['oven_hob'],
  });
  const text = recipeShareText(r, { people: 4, formatAmount: (n) => String(n) });
  assert.equal(text, ['Lemon pasta', 'Serves 4 · 15 min', '', 'Ingredients', '- 400 g spaghetti', '- 2 lemon, zested', '', 'Method', '1. Boil the pasta.', '2. Add the lemon.', '', 'Our notes: Extra lemon', '', 'https://example.com/lemon'].join('\n'));
});

// ---------- Planning: move/swap, leftovers following, list out of date ----------
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const week = (meals) => Object.fromEntries(DAY_NAMES.map((d, i) => [d, { date: `2026-10-${String(19 + i).padStart(2, '0')}`, meals: meals[d] ? [meals[d]] : [] }]));
const cook = (id, recipeId, servings = 2, extra = {}) => ({ id, type: 'recipe', recipeId, name: recipeId, servings, ...extra });
const lefto = (id, recipeId, note) => ({ id, type: 'leftover', recipeId, name: `Leftovers: ${recipeId}`, servings: 2, ...(note ? { note } : {}) });
const names = (days) => DAY_NAMES.map((d) => days[d].meals[0] ? `${d.slice(0, 3)}:${days[d].meals[0].type === 'leftover' ? 'L-' : ''}${days[d].meals[0].recipeId || days[d].meals[0].name}` : null).filter(Boolean);

test('move a meal to a free day; dates stay with the days', () => {
  const r = moveMeal(week({ Monday: cook('a', 'fajitas') }), 'Monday', 'Thursday');
  assert.equal(r.swapped, false);
  assert.deepEqual(names(r.days), ['Thu:fajitas']);
  assert.equal(r.days.Thursday.date, '2026-10-22');
});

test('moving onto a day with a meal swaps them', () => {
  const r = moveMeal(week({ Tuesday: cook('a', 'curry'), Thursday: cook('b', 'bol') }), 'Tuesday', 'Thursday');
  assert.equal(r.swapped, true);
  assert.deepEqual(names(r.days), ['Tue:bol', 'Thu:curry']);
});

test('leftovers follow their cook: "Reheat from" points at the new cook day', () => {
  const r = moveMeal(week({ Monday: cook('a', 'bol', 2), Wednesday: lefto('b', 'bol', 'Reheat from Monday') }), 'Monday', 'Tuesday');
  assert.equal(r.days.Wednesday.meals[0].note, 'Reheat from Tuesday');
  assert.deepEqual(r.freshDays, []);
});

test('a leftover day left before its cook becomes a fresh cook (and says so)', () => {
  const r = moveMeal(week({ Monday: cook('a', 'bol'), Wednesday: lefto('b', 'bol', 'Reheat from Monday') }), 'Monday', 'Friday');
  assert.deepEqual(r.freshDays, ['Wednesday']);
  const wed = r.days.Wednesday.meals[0];
  assert.equal(wed.type, 'recipe');
  assert.equal(wed.name, 'bol');
  assert.equal(wed.note, '');
});

test('leftovers come from a day cooked from scratch, not a day out of the freezer', () => {
  const frozen = { id: 'f', type: 'batch', batchId: 'b1', recipeId: 'bol', name: 'Batch: bol', servings: 2 };
  const days = week({ Monday: frozen, Tuesday: lefto('b', 'bol') });
  assert.equal(leftoverSourceDay(days, 'Tuesday', days.Tuesday.meals[0]), null);
  assert.deepEqual(relinkLeftovers(days).freshDays, ['Tuesday']);
});

test('a meal from the freezer adds nothing to the shopping list', () => {
  const recipes = [R('chilli', 'Chilli', { ingredients: [{ name: 'Beef mince', amount: 500, unit: 'g' }] })];
  const plan = (meal) => ({ id: 'p', startDate: '2026-10-19', status: 'draft', days: week({ Monday: meal }) });
  assert.equal(generateShoppingListForPlan(plan(cook('a', 'chilli')), recipes).length, 1);
  assert.equal(generateShoppingListForPlan(plan({ id: 'f', type: 'batch', batchId: 'b1', recipeId: 'chilli', name: 'Batch: Chilli', servings: 2 }), recipes).length, 0);
});

test('your own notes on leftovers are kept', () => {
  const r = relinkLeftovers(week({ Monday: cook('a', 'bol'), Tuesday: lefto('b', 'bol', 'Add extra cheese') }));
  assert.equal(r.days.Tuesday.meals[0].note, 'Add extra cheese');
});

test('cook-for and leftover source are worked out from the week', () => {
  const days = week({ Monday: cook('a', 'bol', 2), Tuesday: lefto('b', 'bol'), Thursday: lefto('c', 'bol') });
  assert.equal(cooksForText(days, 'Monday', days.Monday.meals[0]), 'Cook for 6: leftovers Tue, Thu');
  assert.equal(leftoverSourceDay(days, 'Thursday', days.Thursday.meals[0]), 'Monday');
  assert.equal(leftoverSourceDay(days, 'Monday', days.Monday.meals[0]), null);
});

test('list out of date: only what changes the shopping (not notes), and only for sent weeks', () => {
  const days = week({ Monday: cook('a', 'bol', 2), Tuesday: cook('b', 'curry', 2) });
  const sent = { id: 'p', startDate: '2026-10-19', days, status: 'finalized', isCurrent: false };
  sent.lastFinalizedSnapshot = listSnapshot(sent);
  assert.deepEqual(changedDaysSinceList(sent), []);
  const noteOnly = { ...sent, days: { ...days, Monday: { ...days.Monday, meals: [{ ...days.Monday.meals[0], note: 'prep early' }] } } };
  assert.deepEqual(changedDaysSinceList(noteOnly), [], 'a note does not change the list');
  const more = { ...sent, days: { ...days, Monday: { ...days.Monday, meals: [{ ...days.Monday.meals[0], servings: 4 }] } } };
  assert.deepEqual(changedDaysSinceList(more), ['Monday']);
  const swapped = { ...sent, days: moveMeal(days, 'Monday', 'Tuesday').days };
  assert.deepEqual(changedDaysSinceList(swapped), ['Monday', 'Tuesday']);
  const back = { ...sent, days: moveMeal(swapped.days, 'Monday', 'Tuesday').days };
  assert.deepEqual(changedDaysSinceList(back), [], 'changing it back means up to date again');
  assert.deepEqual(changedDaysSinceList({ ...more, status: 'draft' }), [], 'not sent: nothing to update');
  assert.deepEqual(changedDaysSinceList({ ...more, lastFinalizedSnapshot: undefined }), [], 'sent before records were kept');
});

test('Planning opens on this week Monday–Thursday, next week Friday–Sunday', () => {
  const at = (iso) => new Date(iso + 'T12:00:00');
  assert.equal(preferredWeekStart(at('2026-10-12'), 'this', 'next'), 'this'); // Monday
  assert.equal(preferredWeekStart(at('2026-10-15'), 'this', 'next'), 'this'); // Thursday
  assert.equal(preferredWeekStart(at('2026-10-16'), 'this', 'next'), 'next'); // Friday
  assert.equal(preferredWeekStart(at('2026-10-18'), 'this', 'next'), 'next'); // Sunday
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
