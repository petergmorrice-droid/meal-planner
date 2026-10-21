// Helpers behind the Shop screen and the recipe cards. Run with: npm test
import assert from 'node:assert/strict';
import {
  orderedAisles, aislePositions, GROCERY_AISLES, generateShoppingListForPlan,
  recipeMethods, totalMinutes, formatMinutes, recipeHistories, formatAgo, formatPlannedDay, freezerPortions, freezerBatchesFor,
  sortRecipes, firstUrl, siteName, recipeIntro, isVegetarianRecipe, isVeganRecipe, changedFields,
  recipeMatchesSearch, matchesQuickFilters, findDuplicate, normaliseRecipeName, isJustAUrl, recipeShareText,
  aggregateShoppingItems, shopQuantityText, defaultShopWeek, formatWeekSpan, parseQuickAdd, quickAddLine,
  listAsText, carryItemsToWeek, shopDurationText, partLabel,
  learnRoute, routeAisleOrder, sortByRoute, addShopRecord, shopStats, milestoneCrossed, isToBuy, notYetProducts,
  packsOnLine, stapleQuantity, stapleTakesOver, inProductUnit, fitHandAddedToProducts, suggestedStaples, oldShoppingLineIds,
  ratingsFor, averageStars, averagesById, withRating,
  parseClock, clockText, startBy, recipeMinutes, stepsToDoAhead, prepTonight, freezePortionsFromNote,
  ingredientsForStep, stepMinutes, stepTimerLabel, newTimer, timeLeft, tickTimers, pauseTimer, resumeTimer,
  addMinute, timerText, eatAtFor, DEFAULT_EAT_AT, speechChunks, forSpeech, parseVoiceCommand, parseAlternatives,
  frozenAgo, mealsFor, freezerGroups, planFreezerMeal, whenText,
  versionInServiceWorker, builtText, agoText, syncProblemText, backupSummary,
  moveMeal, relinkLeftovers, listSnapshot, changedDaysSinceList, cooksForText, leftoverSourceDay, preferredWeekStart,
  isLeftoverOf, orphanedLeftoverDays, mealOnDay, changeDayMeal, describeMealChange, earlierDaysWithRecipe, copyWeekMeals, undoDays,
  stampShoppingItem, stampPlanDays, stampBatch, stampRecipeNotes, handAddedBy, noteAuthor,
  patchLines, removeLines, tickLines, markOutOfStock, answerCupboard, setLineAmount, setLineAmountAndUnit, stepLine,
  addHandLines, addCatalogItems, addRecipeIngredients, restoreRemoved,
  stapleUnit, newStaple, stapleFor, findStaple, addStaple, removeStaple, changeStaple, stepStaple, listWithStaples, getCatalog,
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

// ---------- Shop ----------
const li = (id, name, amount, unit, extra = {}) => ({ id, name, amount, unit, checked: false, isAdhoc: false, planId: 'p2', ...extra });

test('shop: one row per product, with where it came from and your notes', () => {
  const rows = aggregateShoppingItems([
    li('a', 'Milk', 4, 'pints', { isRecurring: true }),
    li('b', 'Milk', 2, 'pints', { isAdhoc: true, note: 'semi-skimmed' }),
    li('c', 'Onion', 3, '', { recipeNames: ['Chilli', 'Bolognese'] }),
    li('d', 'Beef mince', 1000, 'g', { recipeNames: ['Chilli'] }),
  ]);
  const milk = rows.find((r) => r.name === 'Milk');
  assert.equal(shopQuantityText(milk), '6 pints');
  assert.deepEqual(milk.underlyingIds.sort(), ['a', 'b']);
  assert.equal(milk.note, 'semi-skimmed');
  assert.match(milk.description, /weekly staple/);
  assert.equal(rows.find((r) => r.name === 'Onion').description, 'for Chilli, Bolognese');
  assert.equal(shopQuantityText(rows.find((r) => r.name === 'Beef mince')), '1 kg');
  assert.equal(partLabel(li('x', 'Milk', 1, 'pint', { isAdhoc: true })), 'Added by you');
  assert.equal(partLabel(li('x', 'Rice', 1, 'bag', { isBatch: true, batchRecipeName: 'Lasagne' })), 'For Lasagne (extra)');
});

test('shop: opens on the week you are likely shopping for, if it has things to buy', () => {
  const plans = [
    { id: 'p1', startDate: '2026-10-12', status: 'finalized', days: {} },
    { id: 'p2', startDate: '2026-10-19', status: 'finalized', days: {} },
    { id: 'p3', startDate: '2026-10-26', status: 'draft', days: {} },
  ];
  const list = [li('a', 'Milk', 1, 'pint', { planId: 'p1' }), li('b', 'Eggs', 6, 'eggs', { planId: 'p2' }), li('c', 'Bread', 1, 'loaf', { planId: 'p3' })];
  assert.equal(defaultShopWeek(plans, list, '2026-10-19', '2026-10-19'), 'p2', 'Saturday: next week (sent, things to buy)');
  assert.equal(defaultShopWeek(plans, list, '2026-10-12', '2026-10-19'), 'p1', 'Monday: this week');
  const bought = list.map((i) => (i.planId === 'p1' ? { ...i, checked: true } : i));
  assert.equal(defaultShopWeek(plans, bought, '2026-10-12', '2026-10-19'), 'p2', 'this week all bought: the next sent week');
  const doneNext = list.map((i) => (i.planId === 'p2' ? { ...i, checked: true } : i));
  assert.equal(defaultShopWeek(plans, doneNext, '2026-10-19', '2026-10-19'), 'p2', "Saturday, next week all bought: still next week (not this week's leftovers)");
  const nothing = list.map((i) => ({ ...i, checked: true }));
  assert.equal(defaultShopWeek(plans, nothing, '2026-10-12', '2026-10-19'), 'p1', 'nothing to buy anywhere: the likely week');
  assert.equal(defaultShopWeek(plans, [li('c', 'Bread', 1, 'loaf', { planId: 'p3' })], '2026-10-26', '2026-10-19'), 'p3', 'unsent weeks only count as the likely week');
  assert.equal(formatWeekSpan('2026-10-19'), '19–25 Oct');
  assert.equal(formatWeekSpan('2026-10-26'), '26 Oct – 1 Nov');
});

test('shop: things added by hand that are not products yet are offered once each', () => {
  const line = (id, name, extra = {}) => ({ id, name, amount: 1, unit: '', checked: false, isAdhoc: true, planId: 'p', ...extra });
  const items = [
    line('a', 'Birthday candles'), line('b', 'birthday candles'), line('c', 'Milk'), line('d', 'Za\'atar'),
    line('e', 'Custom thing', { groceryId: 'gdb-custom-1' }), line('f', 'Oat Milk', { isRecurring: true }), line('g', 'Party poppers'),
  ];
  assert.deepEqual(notYetProducts(items).map((i) => i.name), ['Birthday candles', "Za'atar", 'Party poppers'], 'once each; known products and saved ones left out');
  assert.deepEqual(notYetProducts(items, ['party poppers']).map((i) => i.name), ['Birthday candles', "Za'atar"], 'not asked again after "not a product"');
});

test('shop: a new product can be a weekly staple straight away', () => {
  // How many packs this week's line is
  assert.equal(packsOnLine({ amount: 2, unit: '' }, 'jar', 1), 2, '"2" of something sold by the jar = 2 jars');
  assert.equal(packsOnLine({ amount: 1, unit: 'kg' }, 'g', 500), 2, '1 kg of a 500 g bag = 2 bags');
  assert.equal(packsOnLine({ amount: 3, unit: 'packs' }, 'pack', 1), 3);
  assert.equal(packsOnLine({ amount: 1, unit: 'item' }, 'each', 1), 1);
  assert.equal(packsOnLine({ amount: 500, unit: 'ml' }, 'jar', 1), 1, "can't tell: 1");
  assert.equal(packsOnLine({ amount: 0, unit: '' }, 'pack', 1), 1);
  // What the staple comes to each week
  assert.deepEqual(stapleQuantity('jar', 1, 2), { amount: 2, unit: 'jars' });
  assert.deepEqual(stapleQuantity('each', 1, 1), { amount: 1, unit: 'item' });
  assert.deepEqual(stapleQuantity('each', 1, 3), { amount: 3, unit: 'items' });
  assert.deepEqual(stapleQuantity('g', 500, 2), { amount: 1000, unit: 'g' });
  assert.deepEqual(stapleQuantity('can', 1, 1), { amount: 1, unit: 'can' });
  // The staple's own line takes over from the one added by hand (in weeks that have it)
  const line = (id, extra = {}) => ({ id, name: 'Sparklers', amount: 1, unit: 'pack', checked: false, isAdhoc: true, groceryId: 'gdb-custom-s', ...extra });
  const staple = (planId, extra = {}) => ({ id: `recurring-${planId}-r1`, name: 'Sparklers', amount: 1, unit: 'pack', checked: false, isAdhoc: false, isRecurring: true, planId, ...extra });
  const list = [
    line('a', { planId: 'p1', note: 'big box' }), staple('p1'),
    line('b', { planId: 'p2', checked: true, checkedBy: 'R' }), staple('p2'),
    line('c', { planId: 'old' }),
    { id: 'm', name: 'Milk', amount: 1, unit: 'pint', checked: false, isAdhoc: true, planId: 'p1' },
  ];
  const out = stapleTakesOver(list, 'r1', (i) => i.groceryId === 'gdb-custom-s');
  assert.deepEqual(out.map((i) => i.id), ['recurring-p1-r1', 'recurring-p2-r1', 'c', 'm'], 'not on the list twice; a week without the staple line keeps its own');
  assert.equal(out.find((i) => i.id === 'recurring-p1-r1').note, 'big box', 'the note comes too');
  const p2 = out.find((i) => i.id === 'recurring-p2-r1');
  assert.ok(p2.checked && p2.checkedBy === 'R', 'already bought that week: stays bought');
  assert.equal(stapleTakesOver(list, 'zz', () => true), list, 'no staple lines: unchanged');
});

test('shop: something added by hand and then saved as a product adds up with the next one', () => {
  assert.deepEqual(inProductUnit({ amount: 1, unit: '' }, 'pack', 1), { amount: 1, unit: 'pack' }, '"1" of something sold by the pack = 1 pack');
  assert.deepEqual(inProductUnit({ amount: 2, unit: 'items' }, 'jar', 1), { amount: 2, unit: 'jars' });
  assert.deepEqual(inProductUnit({ amount: 2, unit: '' }, 'g', 500), { amount: 1000, unit: 'g' }, '"2" of a 500 g bag = 1000 g');
  assert.deepEqual(inProductUnit({ amount: 1, unit: 'kg' }, 'g', 500), { amount: 1000, unit: 'g' }, 'weights convert exactly');
  assert.equal(inProductUnit({ amount: 1, unit: '' }, 'g', 1), null, '"1" of something sold by the gram is not 1 g');
  assert.equal(inProductUnit({ amount: 500, unit: 'ml' }, 'jar', 1), null, "can't tell: left alone");
  assert.equal(inProductUnit({ amount: 1, unit: 'pack' }, 'pack', 1), null, 'already right');
  const line = (id, extra = {}) => ({ id, name: 'Belvita Breakfast Biscuits', amount: 1, unit: '', checked: false, isAdhoc: true, planId: 'p', ...extra });
  const list = [line('a', { groceryId: 'gdb-custom-b' }), line('b'), line('c', { groceryId: 'gdb-custom-b', isRecurring: true }), line('d', { groceryId: 'gdb-custom-b', unit: 'pack' })];
  const out = fitHandAddedToProducts(list, (i) => (i.groceryId === 'gdb-custom-b' ? { buyUnit: 'pack', step: 1 } : null));
  assert.deepEqual(out.map((i) => `${i.id}:${i.amount} ${i.unit}`), ['a:1 pack', 'b:1 ', 'c:1 ', 'd:1 pack'], 'only lines added by hand for that product, as a bare number');
  assert.equal(fitHandAddedToProducts(out, () => ({ buyUnit: 'pack', step: 1 })), out, 'nothing to change: the same list');
  const rows = aggregateShoppingItems([out[0], out[3]]);
  assert.equal(rows.length, 1);
  assert.equal(shopQuantityText(rows[0]), '2 packs', '"2 packs", not "1 + 1 pack"');
});

test('who changed it: Peter blue, Rachel pink', () => {
  // Shopping lines: adding or changing the amount/note counts; ticking doesn't
  const milk = { id: 'm', name: 'Milk', amount: 1, unit: 'pint', checked: false, isAdhoc: true, planId: 'p', lastModifiedAt: 1 };
  const added = stampShoppingItem(milk, undefined, 'P');
  assert.equal(added.editedBy, 'P');
  const ticked = stampShoppingItem({ ...added, checked: true, checkedBy: 'R' }, added, 'R');
  assert.equal(ticked.editedBy, 'P', 'Rachel ticking it: still Peter who added it');
  const more = stampShoppingItem({ ...added, amount: 2 }, added, 'R');
  assert.equal(more.editedBy, 'R', 'Rachel adding more: hers now');
  const noted = stampShoppingItem({ ...more, note: 'semi-skimmed' }, more, 'P');
  assert.ok(noted.noteBy === 'P' && noted.editedBy === 'P');
  const same = stampShoppingItem({ ...noted, checked: true }, noted, 'R');
  assert.ok(same.noteBy === 'P' && same.editedBy === 'P', 'ticking keeps both');
  const cleared = stampShoppingItem({ ...noted, note: undefined }, noted, 'R');
  assert.equal(cleared.noteBy, undefined, 'note gone: no note writer');
  assert.equal(stampShoppingItem({ ...milk, note: 'big one' }, undefined, 'R').noteBy, 'R');
  // Rows: who last added or changed what was added by hand; who wrote the note
  const parts = [
    { id: 'a', name: 'Milk', isAdhoc: false, editedBy: 'P', lastModifiedAt: 9 },
    { id: 'b', name: 'Milk', isAdhoc: true, editedBy: 'P', lastModifiedAt: 3 },
    { id: 'c', name: 'Milk', isAdhoc: true, addedBy: 'R', lastModifiedAt: 5, note: 'organic', noteBy: 'R' },
  ];
  assert.equal(handAddedBy(parts), 'R', 'the most recent line added by hand');
  assert.equal(handAddedBy([parts[0]]), undefined, 'nothing added by hand: no mark');
  assert.equal(noteAuthor(parts), 'R');
  assert.equal(noteAuthor([{ id: 'x', name: 'x', note: 'old note' }]), undefined, 'a note from before: nobody known');
  // Meals: changed days get updatedBy; a changed note gets noteBy
  const before = {
    Monday: { date: '2026-10-19', meals: [{ id: 'm1', type: 'recipe', name: 'Chilli', note: 'double it', noteBy: 'R' }], updatedBy: 'R' },
    Tuesday: { date: '2026-10-20', meals: [{ id: 'm2', type: 'recipe', name: 'Curry' }] },
    Wednesday: { date: '2026-10-21', meals: [] },
  };
  const edited = { ...before, Tuesday: { ...before.Tuesday, meals: [{ ...before.Tuesday.meals[0], note: 'no coriander' }] }, Wednesday: { date: '2026-10-21', meals: [{ id: 'm3', type: 'takeout', name: 'Takeaway' }] } };
  const days = stampPlanDays(edited, before, 'P');
  assert.equal(days.Monday, before.Monday, 'unchanged day: left as it was (still Rachel)');
  assert.ok(days.Tuesday.updatedBy === 'P' && days.Tuesday.meals[0].noteBy === 'P', 'Peter wrote the Tuesday note');
  assert.equal(days.Wednesday.updatedBy, 'P', 'a new meal: Peter');
  const servings = stampPlanDays({ ...before, Monday: { ...before.Monday, meals: [{ ...before.Monday.meals[0], servings: 4 }] } }, before, 'P');
  assert.ok(servings.Monday.updatedBy === 'P' && servings.Monday.meals[0].noteBy === 'R', "Peter changed the people; the note is still Rachel's");
  // Freezer and recipes
  const b = stampBatch({ id: 'b1', portions: 4, dateAdded: '2026-10-01', note: 'garage' }, undefined, 'R');
  assert.ok(b.addedBy === 'R' && b.lastModifiedBy === 'R' && b.noteBy === 'R');
  const b2 = stampBatch({ ...b, portions: 2 }, b, 'P');
  assert.ok(b2.addedBy === 'R' && b2.lastModifiedBy === 'P' && b2.noteBy === 'R', 'Peter took some out: the note is still Rachel\'s');
  const r = stampRecipeNotes({ id: 'r', name: 'Chilli', notes: 'less chilli' }, { id: 'r', name: 'Chilli' }, 'R');
  assert.equal(r.notesBy, 'R');
  assert.equal(stampRecipeNotes({ ...r, name: 'Chilli con carne' }, r, 'P').notesBy, 'R', 'renaming it: notes still Rachel\'s');
});

test('shop: things added by hand most weeks are suggested as weekly staples', () => {
  const line = (id, name, week, extra = {}) => ({ id, name, amount: 1, unit: '', checked: true, isAdhoc: true, planId: `plan-${week}`, lastModifiedAt: 1, ...extra });
  const list = [
    line('a1', 'Bin bags', '2026-10-19', { amount: 1, unit: 'pack', checked: false }),
    line('a2', 'Bin bags', '2026-10-05', { unit: 'pack' }),
    line('a3', 'Bin bags', '2026-09-21', { unit: 'pack' }),
    line('b1', 'Hummus', '2026-10-12', { amount: 2 }), line('b2', 'Hummus', '2026-10-05'), line('b3', 'hummus', '2026-09-28'), line('b4', 'Hummus', '2026-09-28'),
    line('c1', 'Candles', '2026-10-19'), line('c2', 'Candles', '2026-10-12'),
    line('d1', 'Old thing', '2026-08-03'), line('d2', 'Old thing', '2026-08-10'), line('d3', 'Old thing', '2026-08-17'),
    line('e1', 'Milk', '2026-10-19'), line('e2', 'Milk', '2026-10-12'), line('e3', 'Milk', '2026-10-05'),
    line('f1', 'Rice', '2026-10-19', { isAdhoc: false }), line('f2', 'Rice', '2026-10-12', { isAdhoc: false }), line('f3', 'Rice', '2026-10-05', { isAdhoc: false }),
    line('g1', 'Kitchen roll', '2026-10-19'), line('g2', 'Kitchen roll', '2026-10-12'), line('g3', 'Kitchen roll', '2026-10-05'),
  ];
  const s = suggestedStaples(list, { thisWeek: '2026-10-19', staples: [{ name: 'Milk' }], declined: ['kitchen roll'] });
  assert.deepEqual(s.map((x) => `${x.name} ${x.weeks}/${x.of}`), ['Bin bags 3/6', 'Hummus 3/6'], 'in 3 of the last 6 weeks; not staples already, not declined, not meal ingredients, not long ago');
  assert.ok(s[0].amount === 1 && /pack/.test(s[0].unit), 'Bin bags: 1 pack, as last added');
  assert.equal(s[1].amount, 2, "Hummus: the most recent week's amount");
  assert.ok(suggestedStaples(list, { thisWeek: '2026-10-19', minWeeks: 2 }).map((x) => x.name).includes('Candles'), 'two weeks counts when asked');
});

test('ratings: Peter and Rachel each rate a recipe', () => {
  let list = withRating(undefined, 'r1', 'P', 4, '2026-10-20');
  list = withRating(list, 'r1', 'R', 5);
  list = withRating(list, 'r2', 'R', 2);
  assert.deepEqual(ratingsFor(list, 'r1'), { P: 4, R: 5 });
  assert.equal(averageStars(ratingsFor(list, 'r1')), 4.5);
  list = withRating(list, 'r1', 'P', 3);
  assert.deepEqual(ratingsFor(list, 'r1'), { P: 3, R: 5 }, 'changing yours replaces it');
  assert.equal(list.filter((r) => r.recipeId === 'r1').length, 2, 'one each');
  list = withRating(list, 'r1', 'R', 0);
  assert.deepEqual(ratingsFor(list, 'r1'), { P: 3 }, '0 takes it off');
  assert.deepEqual([...averagesById(list)].sort(), [['r1', 3], ['r2', 2]]);
  assert.equal(averageStars({}), null);
});

test('shop: lines from weeks long gone are cleared (10 weeks kept)', () => {
  const line = (id, planId) => ({ id, name: 'x', amount: 1, unit: '', checked: true, isAdhoc: true, planId });
  const list = [line('now', 'plan-2026-10-19'), line('w10', 'plan-2026-08-10'), line('w11', 'plan-2026-08-03'), line('old', 'plan-2026-01-05'), line('none', undefined)];
  assert.deepEqual(oldShoppingLineIds(list, '2026-10-21'), ['w11', 'old'], 'this week and the 10 before kept; older cleared; lines with no week kept');
  assert.deepEqual(oldShoppingLineIds(list, '2026-10-19'), ['w11', 'old'], 'a Monday works the same');
  assert.deepEqual(oldShoppingLineIds([], '2026-10-21'), []);
});

test('shop: typing into the add box', () => {
  assert.deepEqual(parseQuickAdd('2 pints milk'), { name: 'milk', amount: 2, unit: 'pints' });
  assert.deepEqual(parseQuickAdd('500g beef mince'), { name: 'beef mince', amount: 500, unit: 'g' });
  assert.deepEqual(parseQuickAdd('2 tins of chopped tomatoes'), { name: 'chopped tomatoes', amount: 2, unit: 'tins' });
  assert.deepEqual(parseQuickAdd('6 eggs'), { name: 'eggs', amount: 6 });
  assert.deepEqual(parseQuickAdd('2 garlic'), { name: 'garlic', amount: 2 });
  assert.deepEqual(parseQuickAdd('milk x2'), { name: 'milk', packs: 2 });
  assert.deepEqual(parseQuickAdd('2x bread'), { name: 'bread', packs: 2 });
  assert.deepEqual(parseQuickAdd('  bin   bags '), { name: 'bin bags' });
  const q = (t) => { const r = quickAddLine(parseQuickAdd(t)); return `${r.name}: ${shopQuantityText(r)}`; };
  assert.equal(q('milk'), 'Milk: 1 pint');
  assert.equal(q('2 milk'), 'Milk: 2 pints', 'a number that makes no sense as milk = packs');
  assert.equal(q('2 pints milk'), 'Milk: 2 pints');
  assert.equal(q('6 eggs'), 'Eggs: 6 eggs');
  assert.equal(q('3 lemons'), 'Lemons: 3');
  assert.equal(q('milk x3'), 'Milk: 3 pints');
  assert.equal(q('tortilla chips'), 'Tortilla Chips: 1 bag');
  assert.equal(q('birthday candles'), 'Birthday candles: 1', 'something the app does not know: one of it');
});

test('shop: the list as text, what is left to buy, aisle by aisle', () => {
  const rows = aggregateShoppingItems([li('a', 'Carrots', 200, 'g'), li('b', 'Lemons', 2, '', { checked: true }), li('c', 'Milk', 4, 'pints', { note: 'semi-skimmed' })]);
  const text = listAsText('Shopping list · Next week (19–25 Oct)', [
    { name: 'Fresh Produce', items: rows.filter((r) => r.name !== 'Milk') },
    { name: 'Dairy, Chilled & Eggs', items: rows.filter((r) => r.name === 'Milk') },
  ]);
  assert.equal(text, 'Shopping list · Next week (19–25 Oct)\n\nFresh Produce\n• Carrots – 200 g\n\nDairy, Chilled & Eggs\n• Milk – 4 pints (semi-skimmed)');
  assert.match(listAsText('T', []), /Nothing left to buy/);
});

test('shop: things you did not get move to next week, once each', () => {
  let n = 0;
  const list = [
    li('a', 'Milk', 4, 'pints', { isRecurring: true }),
    li('b', 'Milk', 2, 'pints', { isAdhoc: true, note: 'semi' }),
    li('c', 'Coriander', 1, 'bunch', { recipeNames: ['Curry'] }),
    li('d', 'Bread', 1, 'loaf'),
    li('e', 'Bread', 1, 'loaf', { planId: 'p3', isRecurring: true }),
    li('f', 'Eggs', 6, 'eggs', { checked: true }),
  ];
  const r = carryItemsToWeek(list, ['a', 'b', 'c', 'd'], 'p3', 'Week of 26 Oct', () => `new${++n}`);
  assert.deepEqual(r.moved.sort(), ['Coriander', 'Milk']);
  assert.deepEqual(r.alreadyThere, ['Bread']);
  assert.ok(!r.list.some((i) => ['a', 'b', 'c', 'd'].includes(i.id)), 'taken off this week');
  const milk = r.list.find((i) => i.planId === 'p3' && i.name === 'Milk');
  assert.equal(milk.amount, 6);
  assert.equal(milk.note, 'semi');
  assert.ok(milk.isAdhoc && !milk.isRecurring && !milk.checked);
  assert.ok(r.list.some((i) => i.id === 'f'), 'bought things stay');
  assert.equal(shopDurationText(23 * 60_000), '23 min');
  assert.equal(shopDurationText(65 * 60_000), '1 hr 5 min');
  assert.equal(shopDurationText(30_000), null);
  assert.equal(shopDurationText(9 * 3600_000), null);
});

test('shop: learns the order you pick things up', () => {
  const tick = (key, aisle) => ({ key, aisle });
  const shop1 = [tick('bread', 'bakery'), tick('milk', 'dairy_eggs'), tick('eggs', 'dairy_eggs'), tick('apples', 'produce'), tick('mince', 'meat_seafood'), tick('milk', 'dairy_eggs')];
  const r1 = learnRoute(undefined, shop1);
  assert.equal(r1.shops, 1);
  assert.deepEqual(r1.items, { bread: 0, milk: 0.25, eggs: 0.5, apples: 0.75, mince: 1 });
  assert.deepEqual(r1.aisles, { bakery: 0, dairy_eggs: 0.25, produce: 0.75, meat_seafood: 1 });
  assert.equal(learnRoute(r1, shop1.slice(0, 3)), r1, 'a short shop teaches nothing');
  const r2 = learnRoute(r1, [tick('apples', 'produce'), tick('bread', 'bakery'), tick('milk', 'dairy_eggs'), tick('eggs', 'dairy_eggs'), tick('mince', 'meat_seafood')]);
  assert.equal(r2.items.apples, 0.375, 'averaged with what was learned before');
  assert.equal(r2.shops, 2);
  const usual = ['produce', 'bakery', 'meat_seafood', 'dairy_eggs', 'frozen'];
  assert.deepEqual(routeAisleOrder(r1, usual), ['bakery', 'dairy_eggs', 'produce', 'meat_seafood', 'frozen']);
  assert.equal(routeAisleOrder(undefined, usual), null);
  const rows = [{ key: 'eggs', name: 'Eggs' }, { key: 'new', name: 'Butter' }, { key: 'milk', name: 'Milk' }, { key: 'new2', name: 'Apple juice' }];
  assert.deepEqual(sortByRoute(rows, r1).map((r) => r.name), ['Milk', 'Eggs', 'Apple juice', 'Butter']);
  assert.deepEqual(sortByRoute(rows, undefined).map((r) => r.name), ['Apple juice', 'Butter', 'Eggs', 'Milk']);
});

test('shop: history, best and average time, milestones', () => {
  const rec = (id, minutes, bought) => ({ id, date: '2026-10-17T10:00:00Z', weekStart: '2026-10-19', bought, total: bought, minutes });
  let h = addShopRecord(undefined, rec('a', 30, 30));
  h = addShopRecord(h, rec('b', 4, 3));
  h = addShopRecord(h, rec('c', 22, 25));
  assert.deepEqual(h.map((r) => r.id), ['c', 'b', 'a'], 'newest first');
  assert.deepEqual(shopStats(h), { best: 22, average: 26, timed: 2 }, 'a 3-item top-up does not count');
  assert.deepEqual(shopStats([]), { best: null, average: null, timed: 0 });
  assert.equal(addShopRecord(Array.from({ length: 25 }, (_, i) => rec(String(i), 20, 20)), rec('x', 1, 20)).length, 20);
  assert.equal(milestoneCrossed(20, 26), 'A quarter done!');
  assert.equal(milestoneCrossed(48, 51), 'Halfway there!');
  assert.equal(milestoneCrossed(70, 80), 'Three quarters done!');
  assert.equal(milestoneCrossed(51, 60), null);
  assert.equal(milestoneCrossed(90, 100), null, '100% has its own celebration');
  assert.equal(isToBuy({ checked: false, outOfStock: true }), false, 'out of stock is not "to buy"');
});

// ---------- Cook ----------
test('cook: start-by time from when you eat', () => {
  assert.equal(parseClock('19:00'), 1140);
  assert.equal(parseClock('7pm'), null);
  assert.equal(clockText(1065), '5:45pm');
  assert.equal(clockText(1140), '7pm');
  assert.equal(clockText(750), '12:30pm');
  assert.equal(clockText(30), '12:30am');
  assert.equal(startBy('19:00', 75), 1065);
  const r = R('c', 'Chilli', { prepTime: 15, cookTime: 60, methodPrepTime: { ninja: 10 }, methodCookTime: { ninja: 35 } });
  assert.equal(recipeMinutes(r, 'oven_hob'), 75);
  assert.equal(recipeMinutes(r, 'ninja'), 45);
  assert.equal(recipeMinutes(null), 0);
});

test('cook: read aloud in sentence-sized pieces (some phones stop reading long ones)', () => {
  assert.deepEqual(speechChunks('Step 1 of 4. Fry the onions for 8 mins.'), ['Step 1 of 4. Fry the onions for 8 mins.']);
  const long = 'Spoon the chilli over the rice, scatter with coriander and soured cream. '.repeat(5);
  const parts = speechChunks(long);
  assert.ok(parts.length >= 2 && parts.every((x) => x.length <= 180), JSON.stringify(parts.map((x) => x.length)));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.trim().replace(/\s+/g, ' '), 'nothing lost');
  assert.deepEqual(speechChunks('No full stop at the end'), ['No full stop at the end']);
  assert.deepEqual(speechChunks('   '), []);
});

test('cook: voice commands — short phrases only, questions need "question"/"chef"', () => {
  const k = (s) => parseVoiceCommand(s)?.kind ?? null;
  for (const s of ['next', 'Next step', 'OK next please', 'go on', 'carry on']) assert.equal(k(s), 'next', s);
  for (const s of ['back', 'go back', 'previous step']) assert.equal(k(s), 'back', s);
  for (const s of ['repeat', 'say that again', 'read it again', 'pardon?']) assert.equal(k(s), 'repeat', s);
  for (const s of ['stop', 'stop the timer', 'stop the alarm']) assert.equal(k(s), 'timer_stop', s);
  for (const s of ['how long left', "how long's left", 'time left']) assert.equal(k(s), 'time_left', s);
  assert.equal(k('start the timer'), 'timer_start');
  assert.deepEqual(parseVoiceCommand('set a timer for 10 minutes'), { kind: 'timer_start', minutes: 10 });
  assert.deepEqual(parseVoiceCommand('start a five minute timer'), { kind: 'timer_start', minutes: 5 });
  assert.deepEqual(parseVoiceCommand('timer for an hour'), { kind: 'timer_start', minutes: 60 });
  assert.deepEqual(parseVoiceCommand('go to step three'), { kind: 'goto', step: 3 });
  assert.deepEqual(parseVoiceCommand('step 2'), { kind: 'goto', step: 2 });
  assert.equal(k('what do I need'), 'ingredients');
  assert.equal(k("I'm done"), 'finish');
  assert.equal(k('what can I say'), 'help');
  assert.deepEqual(parseVoiceCommand('question, can I use crème fraîche instead of soured cream'), { kind: 'question', text: 'Can I use crème fraîche instead of soured cream?' });
  assert.deepEqual(parseVoiceCommand('Hey chef how do I know the chicken is cooked?'), { kind: 'question', text: 'How do I know the chicken is cooked?' });
  // Kitchen chatter is ignored
  for (const s of ['we need to go next week to the shops', 'can you pass the salt', 'is it going back to school tomorrow', 'question', '']) assert.equal(k(s), null, s);
  // The recogniser's second guess is used if the first means nothing
  assert.equal(parseAlternatives(['necks', 'next'])?.command.kind, 'next');
  assert.equal(parseAlternatives(['hello there']), null);
});

test('cook: kitchen shorthand is read out in words', () => {
  assert.equal(forSpeech('Add 500g mince and brown for 5 mins.'), 'Add 500 grams mince and brown for 5 minutes.');
  assert.equal(forSpeech('Heat oven to 200C/180C fan.'), 'Heat oven to 200 degrees, or 180 degrees fan.');
  assert.equal(forSpeech('1 tbsp olive oil, 2 tsp cumin, 1½ kg potatoes'), '1 tablespoon olive oil, 2 teaspoons cumin, 1 and a half kilos potatoes');
  assert.equal(forSpeech('1⅓ x 400g tins kidney beans'), '1 and a third 400 gram tins kidney beans');
  assert.equal(forSpeech('150 ml cream, ½ lemon, simmer 1 min'), '150 millilitres cream, half lemon, simmer 1 minute');
  assert.equal(forSpeech('Season to taste.'), 'Season to taste.');
});

test('freezer: how long ago, and portions as meals', () => {
  assert.equal(frozenAgo('2026-10-18', '2026-10-18'), 'today');
  assert.equal(frozenAgo('2026-10-17T19:00:00.000Z', '2026-10-18'), 'yesterday');
  assert.equal(frozenAgo('2026-10-10', '2026-10-18'), '8 days ago');
  assert.equal(frozenAgo('2026-09-22', '2026-10-18'), '4 weeks ago');
  assert.equal(frozenAgo('2026-07-14', '2026-10-18'), '3 months ago');
  assert.equal(frozenAgo('2025-01-01', '2026-10-18'), 'over a year ago');
  assert.equal(mealsFor(3, 2), 'enough for 1 meal for 2, and 1 over');
  assert.equal(mealsFor(4, 2), 'enough for 2 meals for 2');
  assert.equal(mealsFor(1, 2), 'one helping');
});

test('freezer: grouped by dish, oldest first, with what the plan wants', () => {
  const recipes = [R('r-chilli', 'Chilli con carne'), R('r-bol', 'Spaghetti bolognese')];
  const batches = [
    { id: 'b1', name: 'Chilli con carne', recipeId: 'r-chilli', portions: 3, dateAdded: '2026-09-22' },
    { id: 'b2', name: 'Lentil soup', portions: 2, dateAdded: '2026-07-14' },
    { id: 'b4', name: 'Chilli con carne', recipeId: 'r-chilli', portions: 4, dateAdded: '2026-10-14T18:00:00.000Z' },
  ];
  const plan = { id: 'p', startDate: '2026-10-12', status: 'finalized', days: {
    Wednesday: { date: '2026-10-14', meals: [{ id: 'm3', type: 'batch', batchId: 'b1', recipeId: 'r-chilli', name: 'Batch: Chilli con carne', servings: 2 }] },
    Monday: { date: '2026-10-19', meals: [] },
    Thursday: { date: '2026-10-15', meals: [{ id: 'm4', type: 'batch', batchId: 'b1', recipeId: 'r-chilli', name: 'Batch: Chilli con carne', servings: 2 }] },
    Friday: { date: '2026-10-16', meals: [{ id: 'm5', type: 'batch', batchId: 'b4', recipeId: 'r-chilli', name: 'Batch: Chilli con carne', servings: 4, cooked: true }] },
  } };
  const g = freezerGroups(batches, recipes, [plan], '2026-10-15');
  assert.deepEqual(g.map((x) => x.name), ['Lentil soup', 'Chilli con carne'], 'oldest first');
  const soup = g[0], chilli = g[1];
  assert.equal(soup.useSoon, true, '93 days: use soon');
  assert.equal(chilli.portions, 7);
  assert.deepEqual(chilli.batches.map((b) => b.id), ['b1', 'b4'], 'oldest batch first');
  assert.equal(chilli.plannedPortions, 2, 'Wed is past, Fri already eaten: only Thu counts');
  assert.equal(chilli.spare, 5);
  assert.equal(chilli.useSoon, false);
  assert.equal(whenText('2026-10-15', '2026-10-15'), 'today');
  assert.equal(whenText('2026-10-16', '2026-10-15'), 'tomorrow');
  assert.equal(whenText('2026-10-17', '2026-10-15'), 'Sat');
  assert.equal(whenText('2026-10-26', '2026-10-15'), 'Mon 26 Oct');
});

test('freezer: plan a freezer meal on a day (leftovers of what it replaces become fresh)', () => {
  const days = {
    Monday: { date: '2026-10-12', meals: [{ id: 'a', type: 'recipe', recipeId: 'r-bol', name: 'Spaghetti bolognese', servings: 2 }] },
    Tuesday: { date: '2026-10-13', meals: [{ id: 'b', type: 'leftover', recipeId: 'r-bol', name: 'Leftovers: Spaghetti bolognese', servings: 2, note: 'Reheat from Monday' }] },
  };
  const r = planFreezerMeal(days, 'Monday', { name: 'Chilli con carne', recipeId: 'r-chilli', batches: [{ id: 'b1', portions: 3, dateAdded: '2026-09-22' }] }, 2, 'new');
  assert.equal(r.replaced.name, 'Spaghetti bolognese');
  assert.deepEqual(r.days.Monday.meals[0], { id: 'new', type: 'batch', batchId: 'b1', recipeId: 'r-chilli', name: 'Batch: Chilli con carne', servings: 2, note: '' });
  assert.equal(r.days.Tuesday.meals[0].type, 'recipe');
  assert.deepEqual(r.freshDays, ['Tuesday']);
});

test('settings: plain words for times, sync problems and backups', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(agoText('2026-10-18T11:59:50Z', now), 'just now');
  assert.equal(agoText('2026-10-18T11:58:00Z', now), '2 min ago');
  assert.equal(agoText('2026-10-18T09:00:00Z', now), '3 hours ago');
  assert.equal(agoText('2026-10-17T10:00:00Z', now), 'yesterday');
  assert.equal(agoText('2026-10-01T10:00:00Z', now), '1 Oct');
  assert.equal(agoText(null, now), '');
  assert.match(syncProblemText('GitHub API error 401: Bad credentials'), /didn't accept the token/);
  assert.match(syncProblemText('Failed to fetch'), /No internet/);
  assert.match(syncProblemText('Gist not found (404)'), /Couldn't find/);
  assert.equal(syncProblemText(''), '');
  const ok = backupSummary(JSON.stringify({ recipes: [{}, {}], mealPlans: [{}], shoppingList: [], batches: [{}] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.parts, ['2 recipes', '1 week', '0 shopping list items', '1 freezer item']);
  assert.equal(backupSummary('{"hello":1}').ok, false);
  assert.equal(backupSummary('not json').ok, false);
});

test('app version: read from sw.js, shown as a date', () => {
  assert.equal(versionInServiceWorker("const CACHE = 'meal-planner-ab313b96a6b2';\nconst X = 'meal-planner-';"), 'ab313b96a6b2');
  assert.equal(versionInServiceWorker("const CACHE = 'meal-planner-__BUILD_VERSION__';"), null);
  assert.equal(versionInServiceWorker(''), null);
  assert.match(builtText('2026-10-18T12:01:30.796Z'), /^18 Oct 2026, \d\d:\d\d$/);
  assert.equal(builtText('nonsense'), '');
});

test('cook: when you eat — Settings, 6pm if not set, or just tonight', () => {
  assert.equal(DEFAULT_EAT_AT, '18:00');
  assert.deepEqual(eatAtFor(undefined, '2026-10-14'), { time: '18:00', usual: '18:00', tonightOnly: false });
  assert.deepEqual(eatAtFor({ eatAt: '19:15' }, '2026-10-14'), { time: '19:15', usual: '19:15', tonightOnly: false });
  assert.deepEqual(eatAtFor({ eatAt: 'soon' }, '2026-10-14').time, '18:00', 'bad setting falls back to 6pm');
  const tonight = { eatAt: '18:00', eatAtTonight: { date: '2026-10-14', time: '19:30' } };
  assert.deepEqual(eatAtFor(tonight, '2026-10-14'), { time: '19:30', usual: '18:00', tonightOnly: true });
  assert.deepEqual(eatAtFor(tonight, '2026-10-15'), { time: '18:00', usual: '18:00', tonightOnly: false }, 'back to usual the next day');
  assert.equal(startBy(eatAtFor(undefined, 'x').time, 75), 17 * 60 + 45 - 60, '75 min before 6pm is 4:45pm');
});

test('cook: what to do the night before', () => {
  const tikka = R('t', 'Tikka', { instructions: ['Marinate the chicken in the yoghurt and spices overnight.', 'Grill for 15 mins.'] });
  assert.equal(prepTonight({ id: 'm', type: 'recipe', recipeId: 't', name: 'Tikka' }, tikka), 'Get ahead tonight: Marinate the chicken in the yoghurt and spices overnight.');
  assert.equal(prepTonight({ id: 'm', type: 'batch', batchId: 'b1', name: 'Batch: Chilli con carne' }, null), 'Take the Chilli con carne out of the freezer tonight');
  assert.equal(prepTonight({ id: 'm', type: 'recipe', recipeId: 'x', name: 'Omelette' }, R('x', 'Omelette', { instructions: ['Whisk the eggs.'] })), null);
  assert.equal(prepTonight({ id: 'm', type: 'leftover', recipeId: 't', name: 'Leftovers: Tikka' }, tikka), null);
  assert.equal(prepTonight({ id: 'm', type: 'batch', name: 'Batch: Chilli', cooked: true }, null), null, 'already eaten');
  assert.deepEqual(stepsToDoAhead(R('b', 'Beans', { instructions: ['Soak the beans in cold water.'], methodInstructions: { ninja: ['Soak the beans in cold water.'] } })), ['Soak the beans in cold water.']);
  assert.equal(freezePortionsFromNote('Batch cook: freeze 4'), 4);
  assert.equal(freezePortionsFromNote('Pizza night'), null);
});

test('cook: each step lists the ingredients it uses', () => {
  const ings = [
    { id: '1', name: 'pork sausages', amount: 4, unit: '' },
    { id: '2', name: 'potatoes', amount: 500, unit: 'g' },
    { id: '3', name: 'butter', amount: 25, unit: 'g' },
    { id: '4', name: 'milk', amount: 50, unit: 'ml' },
    { id: '5', name: 'gravy granules', amount: 2, unit: 'tbsp' },
    { id: '6', name: 'frozen peas', amount: 150, unit: 'g' },
    { id: '7', name: 'olive oil', amount: 1, unit: 'tbsp' },
  ];
  const names = (step) => ingredientsForStep(step, ings).map((i) => i.name);
  assert.deepEqual(names('Grill the sausages for 20 mins, turning.'), ['pork sausages']);
  assert.deepEqual(names('Boil the potatoes for 20 mins, drain and mash with the butter and milk.'), ['potatoes', 'butter', 'milk']);
  assert.deepEqual(names('Make the gravy and cook the peas.'), ['gravy granules', 'frozen peas'], '"granules" is just the form; peas matches frozen peas');
  assert.deepEqual(names('Heat the olive oil in a pan.'), ['olive oil'], 'full name');
  assert.deepEqual(names('Add a splash of oil.'), [], '"oil" alone is too general');
});

test('cook: timers keep time from the clock', () => {
  assert.equal(stepMinutes('Grill the sausages for 20 mins, turning.'), 20);
  assert.equal(stepMinutes('Simmer for 10-15 minutes.'), 10);
  assert.equal(stepMinutes('Roast for 1 hour 15 minutes.'), 75);
  assert.equal(stepMinutes('Slow cook for 2 hours.'), 120);
  assert.equal(stepMinutes('Season to taste.'), null);
  assert.equal(stepTimerLabel('Grill the sausages for 20 mins, turning.'), 'Grill the sausages');
  assert.equal(stepTimerLabel('Boil the potatoes for 20 mins, drain and mash.'), 'Boil the potatoes');
  assert.equal(stepTimerLabel('Add tomatoes and beans and simmer for 45 mins.'), 'Simmer');
  assert.equal(stepTimerLabel('Heat oven to 200C/180C fan. Roast the potatoes in 2 tbsp olive oil for 15 mins.'), 'Roast the potatoes');
  assert.equal(stepTimerLabel('Mix the chicken with the yogurt and tikka paste and leave for 10 mins.'), 'Leave');
  assert.equal(stepTimerLabel('Melt the butter, cook the eggs for 2 mins, add the cheese and fold.'), 'Cook the eggs');
  assert.equal(stepTimerLabel('Fry the onion, carrots and celery for 10 mins.'), 'Fry the onion');
  assert.equal(stepTimerLabel('Slow cook for 2 hours.'), 'Slow cook');
  const t0 = 1_000_000;
  let t = newTimer('a', 'Potatoes', 20, t0, 'Sausage & mash');
  assert.equal(timeLeft(t, t0 + 5 * 60_000), 15 * 60_000, 'counts from the clock, even if the phone slept');
  t = pauseTimer(t, t0 + 5 * 60_000);
  assert.equal(timeLeft(t, t0 + 50 * 60_000), 15 * 60_000, 'paused stays put');
  t = resumeTimer(t, t0 + 50 * 60_000);
  assert.equal(timeLeft(t, t0 + 60 * 60_000), 5 * 60_000);
  t = addMinute(t, t0 + 60 * 60_000);
  assert.equal(timeLeft(t, t0 + 60 * 60_000), 6 * 60_000, '+1 minute');
  const [rung] = tickTimers([t], t0 + 70 * 60_000);
  assert.equal(rung.state, 'ringing');
  assert.equal(tickTimers([t], t0 + 60 * 60_000)[0], t, 'unchanged until time is up');
  const again = addMinute(rung, t0 + 70 * 60_000);
  assert.equal(again.state, 'running');
  assert.equal(timeLeft(again, t0 + 70 * 60_000), 60_000, 'ringing +1 min: another minute');
  assert.equal(timerText(245_000), '4:05');
  assert.equal(timerText(3_720_000), '1:02:00');
  assert.equal(timerText(8_200), '0:09');
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

// ---------- Changes to the shopping list (src/shopListEdits.ts) ----------
const line = (id, extra = {}) => ({ id, name: id, amount: 1, unit: 'item', category: '', checked: false, isAdhoc: true, isBatch: false, planId: 'p1', ...extra });
const plan1 = { id: 'p1', startDate: '2026-10-19', days: {}, status: 'draft', isCurrent: false };

test('list edits: ticking says who, unticking clears it, and out of stock goes', () => {
  const list = [line('a', { outOfStock: true }), line('b')];
  const ticked = tickLines(list, ['a'], undefined, 'R');
  assert.equal(ticked[0].checked, true);
  assert.equal(ticked[0].checkedBy, 'R');
  assert.equal(ticked[0].outOfStock, undefined, 'it was there after all');
  assert.equal(ticked[1], list[1], 'other lines untouched');
  const unticked = tickLines(ticked, ['a'], false, 'P');
  assert.equal(unticked[0].checked, false);
  assert.equal(unticked[0].checkedBy, undefined);
});

test('list edits: out of stock unticks; back in stock just clears it', () => {
  const list = [line('a', { checked: true, checkedBy: 'P' })];
  const out = markOutOfStock(list, ['a'], true);
  assert.deepEqual([out[0].checked, out[0].outOfStock, out[0].checkedBy], [false, true, undefined]);
  const back = markOutOfStock(out, ['a'], false);
  assert.equal(back[0].outOfStock, undefined);
  assert.equal(back[0].checked, false);
});

test('list edits: cupboard answers, and asking again', () => {
  const list = [line('a'), line('b')];
  const have = answerCupboard(list, ['a'], 'have');
  assert.equal(have[0].cupboard, 'have');
  assert.equal(have[1].cupboard, undefined);
  assert.equal(answerCupboard(have, ['a'], 'need')[0].cupboard, 'need');
  assert.ok(!('cupboard' in answerCupboard(have, ['a'], null)[0]));
});

test('list edits: + and − keep the unit, singular or plural, never below one step', () => {
  const list = [line('beans', { unit: 'can' }), line('apples', { unit: 'items', amount: 2 })];
  const up = stepLine(list, 'beans', 1, 1);
  assert.deepEqual([up[0].amount, up[0].unit, up[0].userAdjusted], [2, 'cans', true]);
  assert.deepEqual([stepLine(up, 'beans', 1, -1)[0].amount, stepLine(up, 'beans', 1, -1)[0].unit], [1, 'can']);
  assert.equal(stepLine(list, 'beans', 1, -1)[0].amount, 1, 'not below one step');
  const fewer = stepLine(list, 'apples', 1, -1);
  assert.deepEqual([fewer[1].amount, fewer[1].unit], [1, 'item']);
  assert.equal(setLineAmount(list, 'beans', 3, false)[0].userAdjusted, false);
  assert.deepEqual(setLineAmountAndUnit(list, 'beans', 0, 'g')[0].amount, 0.01, 'never nothing');
});

test('list edits: typed lines add up with what you added by hand, else a new line', () => {
  const list = [line('Milk', { unit: 'pints', amount: 2 }), line('Bread', { checked: true })];
  const res = addHandLines(list, plan1, [{ name: 'Milk', amount: 2, unit: 'pints' }, { name: 'Bread', amount: 1, unit: 'item' }], () => null);
  assert.equal(res.list.length, 3, 'bought bread is not added to: a new line');
  assert.equal(res.list[0].amount, 4);
  assert.equal(res.ids[0], 'Milk');
  const fresh = res.list.find((i) => i.id === res.ids[1]);
  assert.deepEqual([fresh.name, fresh.isAdhoc, fresh.planId, fresh.weekLabel.startsWith('Week of')], ['Bread', true, 'p1', true]);
  assert.equal(list.length, 2, 'the old list is left as it was');
});

test('list edits: take off, change, and add from the products list', () => {
  const list = [line('a'), line('b'), line('c')];
  assert.deepEqual(removeLines(list, ['a', 'c']).map((i) => i.id), ['b']);
  assert.equal(patchLines(list, ['b'], (i) => ({ ...i, note: 'big one' }))[1].note, 'big one');
  const added = addCatalogItems([], plan1, [{ name: 'Teabags', amount: 1 }, { name: 'Teabags', amount: 1 }]);
  assert.equal(added.list.length, 1, 'the same thing twice is one line');
  assert.equal(added.total, 2);
});

test('list edits: an extra recipe\'s ingredients go on as its own lines', () => {
  const res = addRecipeIngredients([], plan1, 'Flapjacks', [{ name: 'oats', amount: 300, unit: 'g' }, { name: 'golden syrup', amount: 4, unit: 'tbsp' }]);
  assert.equal(res.count, 2);
  assert.ok(res.list.every((i) => i.isBatch && i.batchRecipeName === 'Flapjacks' && i.planId === 'p1'));
  const again = addRecipeIngredients(res.list, plan1, 'Flapjacks', [{ name: 'oats', amount: 300, unit: 'g' }]);
  assert.equal(again.list.length, 2, 'more of the same adds up');
});

test('list edits: bringing back removed things (staples always, meals once sent)', () => {
  const staples = [{ id: 's1', name: 'Milk', amount: 2, unit: 'pints', category: 'Dairy' }];
  const back = restoreRemoved([], plan1, [], staples);
  assert.ok(back.some((i) => i.isRecurring && i.name === 'Milk'), 'the staple is back');
});

// ---------- Changing the meals on a week (src/planning.ts) ----------
test('week changes: a meal onto a day replaces what was there; leftovers that depended on it go too', () => {
  const days = week({ Monday: cook('a', 'chilli', 4), Wednesday: lefto('b', 'chilli'), Thursday: cook('c', 'curry') });
  assert.equal(mealOnDay(days, 'Monday').id, 'a');
  assert.equal(mealOnDay(days, 'Tuesday'), null);
  const added = changeDayMeal(days, 'Tuesday', null, cook('n', 'fajitas'));
  assert.deepEqual(names(added.days), ['Mon:chilli', 'Tue:fajitas', 'Wed:L-chilli', 'Thu:curry']);
  assert.deepEqual(added.orphanedDays, []);
  const replaced = changeDayMeal(days, 'Monday', days.Monday.meals[0], cook('n', 'fajitas'));
  assert.deepEqual(replaced.orphanedDays, ['Wednesday'], 'Wednesday was leftovers of Monday');
  assert.deepEqual(names(replaced.days), ['Mon:fajitas', 'Thu:curry']);
  assert.equal(replaced.days.Monday.date, days.Monday.date, 'dates stay with the days');
});

test('week changes: leftovers stay when another earlier day cooks it too', () => {
  const days = week({ Monday: cook('a', 'chilli'), Tuesday: cook('b', 'chilli'), Wednesday: lefto('c', 'chilli') });
  assert.deepEqual(orphanedLeftoverDays(days, 'Monday', days.Monday.meals[0]), []);
  assert.deepEqual(orphanedLeftoverDays(days, 'Tuesday', days.Tuesday.meals[0]), []);
  assert.equal(isLeftoverOf(days.Monday.meals[0], days.Wednesday.meals[0]), true);
  assert.equal(isLeftoverOf(days.Wednesday.meals[0], days.Monday.meals[0]), false, 'a leftovers meal has no leftovers of its own');
});

test('week changes: what it says, and what could be leftovers', () => {
  const chilli = cook('a', 'Chilli', 4);
  assert.equal(describeMealChange('Tuesday', null, chilli), 'Added Chilli to Tuesday for 4');
  assert.equal(describeMealChange('Tuesday', chilli, { ...lefto('b', 'x'), name: 'Leftovers: Curry' }), 'Replaced Chilli with Curry (leftovers) on Tuesday');
  assert.equal(describeMealChange('Tuesday', chilli, null), 'Removed Chilli from Tuesday');
  assert.equal(describeMealChange('Friday', null, { id: 'f', type: 'batch', name: 'Batch: Soup', servings: 2 }), 'Added Soup from the freezer to Friday for 2');
  const days = week({ Monday: cook('a', 'r-chilli', 2, { name: 'Chilli' }), Thursday: cook('b', 'r-chilli', 2, { name: 'Chilli' }) });
  assert.deepEqual(earlierDaysWithRecipe(days, 'Wednesday', { id: 'r-chilli', name: 'Chilli' }), ['Monday'], 'only earlier days');
  assert.deepEqual(earlierDaysWithRecipe(days, 'Monday', { id: 'r-chilli', name: 'Chilli' }), []);
});

test('week changes: copying a week gives new meals, not marked cooked', () => {
  const source = { id: 's', startDate: '2026-10-12', status: 'finalized', isCurrent: false, days: week({ Monday: cook('a', 'chilli', 2, { cooked: true }), Friday: cook('b', 'pizza') }) };
  const target = week({ Tuesday: cook('t', 'curry') });
  const r = copyWeekMeals(target, source);
  assert.equal(r.copied, 2);
  assert.deepEqual(names(r.days), ['Mon:chilli', 'Fri:pizza'], "this week's meals are replaced");
  assert.ok(r.days.Monday.meals[0].id !== 'a' && !('cooked' in r.days.Monday.meals[0]), 'a new meal, not cooked yet');
  assert.equal(r.days.Monday.date, target.Monday.date, 'this week keeps its own dates');
});

// ---------- Weekly staples: one way to make and change them (src/staples.ts) ----------
test('staples: a new one reads right for its amount, in its aisle', () => {
  assert.equal(stapleUnit('each', 1), 'item');
  assert.equal(stapleUnit('whole', 3), 'items');
  assert.equal(stapleUnit('pint', 2), 'pints');
  const s = newStaple({ name: '  Milk ', amount: 2, unit: 'pint' });
  assert.deepEqual([s.name, s.amount, s.unit, s.category], ['Milk', 2, 'pints', GROCERY_AISLES.dairy_eggs.name]);
  assert.ok(s.id);
  assert.equal(newStaple({ name: 'Milk', amount: 1, unit: 'pint', category: 'Bakery & Bread' }).category, 'Bakery & Bread', 'an aisle you chose is kept');
});

test('staples: typed in the staples window, it starts at one pack of the product', () => {
  const c = getCatalog();
  const look = (t) => { const s = stapleFor(c, t); return `${s.name}: ${s.amount} ${s.unit}`; };
  assert.equal(look('butter'), 'Butter: 250 g', 'not 1 g');
  assert.equal(look('eggs'), 'Eggs: 6 eggs', 'not 1 egg');
  assert.equal(look('Bananas'), 'Bananas: 1 item');
  const odd = stapleFor(c, 'Birthday candles');
  assert.deepEqual([odd.name, odd.amount, odd.unit], ['Birthday candles', 1, 'item'], 'not a product: what was typed, 1 of');
});

test('staples: never two of the same; step, change and remove', () => {
  const milk = newStaple({ name: 'Milk', amount: 2, unit: 'pint' });
  let r = addStaple([], milk);
  assert.equal(r.added, true);
  const again = addStaple(r.staples, newStaple({ name: 'milk ', amount: 4, unit: 'pint' }));
  assert.equal(again.added, false, 'a second "milk" is not added');
  assert.equal(again.staple.id, milk.id, 'the one you have is kept');
  assert.equal(again.staples.length, 1);
  assert.equal(findStaple(again.staples, 'MILK').id, milk.id);
  const butter = newStaple({ name: 'Butter', amount: 250, unit: 'g' });
  let list = [milk, butter];
  list = stepStaple(list, butter.id, 1, 250);
  assert.deepEqual([list[1].amount, list[1].unit], [500, 'g']);
  list = stepStaple(stepStaple(list, butter.id, -1, 250), butter.id, -1, 250);
  assert.equal(list[1].amount, 250, 'never below one pack');
  list = stepStaple(list, milk.id, -1, 1);
  assert.deepEqual([list[0].amount, list[0].unit], [1, 'pint'], 'singular for one');
  list = changeStaple(list, milk.id, { category: 'Bakery & Bread' });
  assert.equal(list[0].category, 'Bakery & Bread');
  assert.deepEqual(removeStaple(list, milk.id).map((s) => s.name), ['Butter']);
});

test('staples: every week follows, lines taken off stay off, and a hand-added line is taken over', () => {
  const monday = (offset) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); return d.toISOString().slice(0, 10); };
  const plans = [{ id: 'w1', startDate: monday(0), days: {}, status: 'draft' }, { id: 'w2', startDate: monday(1), days: {}, status: 'draft' }];
  const milk = newStaple({ name: 'Milk', amount: 2, unit: 'pint' });
  const handAdded = { id: 'h', name: 'Milk', amount: 1, unit: 'pint', category: '', checked: true, isAdhoc: true, isBatch: false, planId: 'w2', note: 'semi' };
  const removed = [`recurring-w1-${milk.id}`];
  const list = listWithStaples(plans, [handAdded], [milk], removed, { staple: milk, isSame: (i) => i.name === 'Milk' });
  assert.ok(!list.some((i) => i.planId === 'w1'), 'taken off week 1: stays off');
  const w2 = list.filter((i) => i.planId === 'w2');
  assert.equal(w2.length, 1, 'week 2: one milk line, not two');
  assert.equal(w2[0].id, `recurring-w2-${milk.id}`);
  assert.equal(w2[0].checked, true, 'already ticked: still ticked');
  assert.equal(w2[0].note, 'semi', 'the note comes with it');
});

// ---------- Changes made on the latest data ----------
test('Undo puts back only the days the change touched', () => {
  const before = week({ Monday: cook('a', 'chilli'), Tuesday: cook('b', 'curry') });
  const after = { ...before, Monday: { ...before.Monday, meals: [] } };            // Monday's meal removed
  const latest = { ...after, Tuesday: { ...after.Tuesday, meals: [cook('c', 'fajitas')] } }; // then Tuesday changed (other phone)
  const undone = undoDays(latest, before, after);
  assert.deepEqual(names(undone), ['Mon:chilli', 'Tue:fajitas'], 'Monday back; Tuesday keeps what happened since');
  assert.deepEqual(undoDays(latest, before, before), latest, 'nothing changed: nothing undone');
});

test('only the fields you changed are saved (the rest stays as the latest copy has it)', () => {
  const before = { id: 'r', name: 'Chilli', favourite: false, notes: 'old', tags: ['a'] };
  const after = { ...before, favourite: true };
  assert.deepEqual(changedFields(before, after), { favourite: true });
  assert.deepEqual(changedFields(before, { ...before, tags: ['a', 'b'] }), { tags: ['a', 'b'] });
  const gone = changedFields(before, { id: 'r', name: 'Chilli', favourite: false, tags: ['a'] });
  assert.ok('notes' in gone && gone.notes === undefined, 'a field taken away is saved as gone');
  const latest = { ...before, notes: 'from the other phone' };
  assert.deepEqual({ ...latest, ...changedFields(before, after) }, { ...latest, favourite: true }, "the other phone's notes are kept");
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
