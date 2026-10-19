// Tests for src/services/syncMerge.ts — run with: npm test
import { mergeAppStates, applyLocalChange, statesEqual, getDismissedShoppingIds, stableStringify, dropDefaultsMissingFrom, keepOnlyChangesSince, mergePlans, TOMBSTONE_RETENTION_MS } from '../.test-build/syncMerge.mjs';
import assert from 'node:assert/strict';

let failures = 0;
const test = (name, fn) => { try { fn(); console.log('PASS', name); } catch (e) { failures++; console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 6).join('\n    ')); } };
const empty = () => ({ recipes: [], mealPlans: [], batches: [], shoppingList: [], preferences: { currencySymbol: '£' }, groceryOverrides: {} });
const clone = (x) => JSON.parse(JSON.stringify(x));
const names = (s) => s.shoppingList.map((i) => i.name + (i.checked ? '✓' : '')).sort().join(',');

// A "phone": holds state, edits via applyLocalChange (base = what the screen saw)
class Phone {
  constructor(state) { this.state = clone(state); }
  edit(fn, now, base = this.state) { const next = fn(clone(base)); this.state = applyLocalChange(this.state, base, next, now); }
  pull(remote) { this.state = mergeAppStates(this.state, remote); }
}

test('merge is order-independent, repeatable and associative (2000 random cases)', () => {
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const mk = () => {
    const s = empty();
    s.syncMeta = { tombstones: {}, preferencesModifiedAt: Math.floor(rnd() * 6) - 1, preferencesFieldModifiedAt: {}, overridesModifiedAt: {} };
    s.preferences = { currencySymbol: rnd() < 0.5 ? '£' : '€', x: Math.floor(rnd() * 3) };
    if (rnd() < 0.5) s.preferences.y = Math.floor(rnd() * 3);
    for (const k of ['currencySymbol', 'x', 'y']) if (rnd() < 0.4) s.syncMeta.preferencesFieldModifiedAt[k] = Math.floor(rnd() * 10);
    for (let i = 0; i < 6; i++) {
      if (rnd() < 0.6) s.shoppingList.push({ id: 'i' + i, name: 'item' + i, checked: rnd() < 0.5, amount: Math.floor(rnd() * 3), lastModifiedAt: Math.floor(rnd() * 11) - 1 });
      if (rnd() < 0.3) s.syncMeta.tombstones['shoppingList:i' + i] = Math.floor(rnd() * 10);
      if (rnd() < 0.4) s.recipes.push({ id: 'r' + i, name: 'recipe' + Math.floor(rnd() * 3), lastModifiedAt: Math.floor(rnd() * 10) });
      if (rnd() < 0.2) s.syncMeta.tombstones['recipes:r' + i] = Math.floor(rnd() * 10);
      if (rnd() < 0.3) { s.groceryOverrides['g' + i] = { cost: Math.floor(rnd() * 5) }; s.syncMeta.overridesModifiedAt['g' + i] = Math.floor(rnd() * 10); }
    }
    return s;
  };
  for (let n = 0; n < 2000; n++) {
    const a = mk(), b = mk(), c = mk();
    const ab = mergeAppStates(a, b), ba = mergeAppStates(b, a);
    assert.ok(statesEqual(ab, ba), 'not commutative at case ' + n);
    assert.ok(statesEqual(mergeAppStates(ab, ab), ab), 'not idempotent at case ' + n);
    assert.ok(statesEqual(mergeAppStates(ab, b), ab), 'merging again changed result at case ' + n);
    assert.ok(statesEqual(mergeAppStates(ab, c), mergeAppStates(a, mergeAppStates(b, c))), 'not associative at case ' + n);
  }
});

test('deleted recipe stays deleted when the other phone opens the app', () => {
  const start = empty(); start.recipes = [{ id: 'r1', name: 'Lasagne' }, { id: 'r2', name: 'Old Curry' }];
  const peter = new Phone(start), wife = new Phone(start);
  wife.edit((s) => ({ ...s, recipes: s.recipes.filter((r) => r.id !== 'r2') }), 1000);
  let gist = clone(wife.state);
  peter.pull(gist); gist = clone(peter.state);
  wife.pull(gist);
  assert.deepEqual(peter.state.recipes.map((r) => r.name), ['Lasagne']);
  assert.deepEqual(wife.state.recipes.map((r) => r.name), ['Lasagne']);
});

test('removed shopping item stays removed', () => {
  const start = empty(); start.shoppingList = [{ id: 's1', name: 'Milk' }, { id: 's2', name: 'Bread' }];
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, shoppingList: s.shoppingList.filter((i) => i.id !== 's2') }), 1000);
  wife.pull(peter.state); peter.pull(wife.state);
  assert.equal(names(wife.state), 'Milk'); assert.equal(names(peter.state), 'Milk');
});

test('both phones edit different items at once: nothing lost', () => {
  const start = empty(); start.shoppingList = [{ id: 's1', name: 'Milk', checked: false }];
  const peter = new Phone(start), wife = new Phone(start);
  wife.edit((s) => ({ ...s, shoppingList: [...s.shoppingList, { id: 's2', name: 'Eggs', checked: false }] }), 1000);
  peter.edit((s) => ({ ...s, shoppingList: s.shoppingList.map((i) => ({ ...i, checked: true })) }), 1001);
  const merged = mergeAppStates(peter.state, wife.state);
  assert.equal(names(merged), 'Eggs,Milk✓');
});

test('stale screen edit does not undo changes that arrived meanwhile', () => {
  // Peter's screen was showing the old list when he tapped; wife's Eggs arrived in between.
  const start = empty(); start.shoppingList = [{ id: 's1', name: 'Milk', checked: false }];
  const peter = new Phone(start), wife = new Phone(start);
  const peterScreen = clone(peter.state);
  wife.edit((s) => ({ ...s, shoppingList: [...s.shoppingList, { id: 's2', name: 'Eggs' }], recipes: [{ id: 'r9', name: 'New Recipe' }] }), 1000);
  peter.pull(wife.state);                        // background sync brings in Eggs + recipe
  peter.edit((s) => ({ ...s, shoppingList: s.shoppingList.map((i) => ({ ...i, checked: true })) }), 1001, peterScreen);
  assert.equal(names(peter.state), 'Eggs,Milk✓');
  assert.deepEqual(peter.state.recipes.map((r) => r.name), ['New Recipe']);
});

test('same item edited on both phones: the later change wins on both', () => {
  const start = empty(); start.shoppingList = [{ id: 's1', name: 'Milk', amount: 1 }];
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, shoppingList: [{ ...s.shoppingList[0], amount: 2 }] }), 1000);
  wife.edit((s) => ({ ...s, shoppingList: [{ ...s.shoppingList[0], amount: 3 }] }), 1005);
  const m1 = mergeAppStates(peter.state, wife.state), m2 = mergeAppStates(wife.state, peter.state);
  assert.equal(m1.shoppingList[0].amount, 3); assert.ok(statesEqual(m1, m2));
});

test('re-adding a removed item brings it back (and dismissed list updates)', () => {
  const start = empty(); start.shoppingList = [{ id: 'recurring-plan-2026-10-19-milk', name: 'Milk' }];
  const p = new Phone(start);
  p.edit((s) => ({ ...s, shoppingList: [] }), 1000);
  assert.deepEqual(getDismissedShoppingIds(p.state), ['recurring-plan-2026-10-19-milk']);
  p.edit((s) => ({ ...s, shoppingList: [{ id: 'recurring-plan-2026-10-19-milk', name: 'Milk' }] }), 2000);
  const after = mergeAppStates(p.state, start);
  assert.equal(names(after), 'Milk');
  assert.deepEqual(getDismissedShoppingIds(after), []);
});

test('re-add beats deletion even if the other phone\'s clock is ahead', () => {
  const start = empty(); start.shoppingList = [{ id: 'x', name: 'Bread', lastModifiedAt: 5000 }]; // future-dated by other phone
  const p = new Phone(start);
  p.edit((s) => ({ ...s, shoppingList: [] }), 1000);
  p.edit((s) => ({ ...s, shoppingList: [{ id: 'x', name: 'Bread' }] }), 1001);
  assert.equal(names(mergeAppStates(p.state, start)), 'Bread');
});

test('preferences: only the changed setting is applied locally; newest set wins across phones', () => {
  const start = empty(); start.preferences = { currencySymbol: '£', adultCount: 2 };
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, adultCount: 3 } }), 1000);
  wife.edit((s) => ({ ...s, preferences: { ...s.preferences, currencySymbol: '€' } }), 2000);
  const m = mergeAppStates(peter.state, wife.state);
  assert.equal(m.preferences.currencySymbol, '€');
});

test('old Gist data without sync info merges cleanly', () => {
  const legacy = { recipes: [{ id: 'r1', name: 'A' }], mealPlans: [{ id: 'plan-2026-10-12', startDate: '2026-10-12', days: {} }], batches: [], shoppingList: [], preferences: { currencySymbol: '£' } };
  const m = mergeAppStates(empty(), legacy);
  assert.equal(m.recipes.length, 1); assert.equal(m.mealPlans.length, 1);
  assert.ok(statesEqual(mergeAppStates(m, legacy), m));
});

test('old deletion markers are eventually forgotten (but not recent ones)', () => {
  const s = empty(); const day = 86400000;
  s.syncMeta = { tombstones: { 'recipes:old': 1, 'recipes:recent': 200 * day }, overridesModifiedAt: {} };
  s.recipes = [{ id: 'r', name: 'x', lastModifiedAt: 250 * day }];
  const m = mergeAppStates(s, empty());
  assert.deepEqual(Object.keys(m.syncMeta.tombstones), ['recipes:recent']);
});

test('saving an identical list changes nothing', () => {
  const start = empty(); start.shoppingList = [{ id: 's1', name: 'Milk', lastModifiedAt: 5 }];
  const p = new Phone(start); const before = p.state.shoppingList;
  p.edit((s) => ({ ...s, shoppingList: s.shoppingList.map((i) => ({ ...i })) }), 1000);
  assert.equal(p.state.shoppingList, before);
});

test('a new phone connecting never replaces the household settings, weeks or grocery list', () => {
  // Real shared data (older format, no timestamps on settings)
  const shared = { recipes: [{ id: 'r1', name: 'Lasagne' }], batches: [], shoppingList: [],
    mealPlans: [{ id: 'plan-2026-10-19', startDate: '2026-10-19', days: { Monday: { meals: [{ id: 'm', type: 'recipe', recipeId: 'r1' }] } }, status: 'finalized', lastModifiedAt: 5 }],
    preferences: { currencySymbol: '£', adultCount: 3, recurringItems: [{ id: 'rec', name: 'Oat Milk' }] },
    groceryDatabase: [{ id: 'g1', name: 'Beef Mince (5%)' }, { id: 'g2', name: 'Onion' }], groceryOverrides: {} };
  // Brand-new phone: defaults stamped -1, plus one real change (e.g. the product-list update)
  let fresh = { recipes: [], batches: [], shoppingList: [],
    mealPlans: [{ id: 'plan-2026-10-19', startDate: '2026-10-19', days: {}, status: 'not_started', lastModifiedAt: -1 }, { id: 'plan-2026-10-26', startDate: '2026-10-26', days: {}, status: 'not_started', lastModifiedAt: -1 }],
    preferences: { currencySymbol: '£', adultCount: 2 },
    groceryDatabase: [{ id: 'g1', name: 'Beef Mince', lastModifiedAt: -1 }, { id: 'g2', name: 'Onion', lastModifiedAt: -1 }, { id: 'g3', name: 'Merged Away', lastModifiedAt: -1 }],
    groceryOverrides: {}, syncMeta: { tombstones: {}, preferencesModifiedAt: -1 } };
  fresh = applyLocalChange(fresh, fresh, { ...fresh, preferences: { ...fresh.preferences, catalogVersion: 2 }, groceryDatabase: [...fresh.groceryDatabase, { id: 'gx', name: 'Ground Cumin' }] }, 1000);
  // What the app does on its first sync: drop its own defaults that the shared list doesn't have, then merge.
  const prepared = dropDefaultsMissingFrom(fresh, shared);
  for (const m of [mergeAppStates(prepared, shared), mergeAppStates(shared, prepared)]) {
    assert.equal(m.preferences.adultCount, 3, 'default adultCount replaced the real one');
    assert.deepEqual(m.preferences.recurringItems, [{ id: 'rec', name: 'Oat Milk' }], 'staples lost');
    assert.equal(m.preferences.catalogVersion, 2, 'the new phone\'s real change was lost');
    assert.equal(m.mealPlans.find((p) => p.startDate === '2026-10-19').status, 'finalized', 'empty default week replaced the real plan');
    assert.equal(m.groceryDatabase.find((g) => g.id === 'g1').name, 'Beef Mince (5%)', 'default grocery item replaced the edited one');
    assert.ok(!m.groceryDatabase.some((g) => g.id === 'g3'), 'an item merged away came back from the defaults');
    assert.ok(m.groceryDatabase.some((g) => g.id === 'gx'), 'new product was lost');
  }
  assert.ok(statesEqual(mergeAppStates(prepared, shared), mergeAppStates(shared, prepared)));
});

test('two phones changing different settings keep both changes', () => {
  const start = empty(); start.preferences = { currencySymbol: '£', adultCount: 2, defaultServings: 2 };
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, adultCount: 3 } }), 1000);
  wife.edit((s) => ({ ...s, preferences: { ...s.preferences, defaultServings: 4 } }), 2000);
  for (const m of [mergeAppStates(peter.state, wife.state), mergeAppStates(wife.state, peter.state)]) {
    assert.equal(m.preferences.adultCount, 3); assert.equal(m.preferences.defaultServings, 4);
  }
});

test('same setting changed on both phones: the later change wins; removing a setting sticks', () => {
  const start = empty(); start.preferences = { currencySymbol: '£', budget: 80 };
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, currencySymbol: '€' } }), 1000);
  wife.edit((s) => ({ ...s, preferences: { ...s.preferences, currencySymbol: '$' } }), 2000);
  assert.equal(mergeAppStates(peter.state, wife.state).preferences.currencySymbol, '$');
  peter.edit((s) => { const p = { ...s.preferences }; delete p.budget; return { ...s, preferences: p }; }, 3000);
  const m = mergeAppStates(peter.state, wife.state);
  assert.ok(!('budget' in m.preferences), 'removed setting came back');
});

// ---- Weeks day by day; staples, favourites and past shops item by item ----

const week = (days, extra = {}) => ({ id: 'plan-2026-10-19', startDate: '2026-10-19', status: 'draft', isCurrent: true, days, ...extra });
const day = (name, note = '') => ({ date: '', meals: name ? [{ id: name, type: 'takeout', name, note }] : [] });
const mealName = (s, d) => s.mealPlans[0].days[d].meals[0]?.name;
const mealNote = (s, d) => s.mealPlans[0].days[d].meals[0]?.note;

test('weeks: one phone plans Tuesday while the other changes Monday: both kept', () => {
  const start = empty(); start.mealPlans = [week({ Monday: day('Pizza'), Tuesday: day('') }, { lastModifiedAt: 100 })];
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => { s.mealPlans[0].days.Tuesday = day('Curry'); s.mealPlans[0].lastModifiedAt = 1000; return s; }, 1000);
  wife.edit((s) => { s.mealPlans[0].days.Monday = day('Pizza', 'ham and pineapple'); s.mealPlans[0].lastModifiedAt = 2000; return s; }, 2000);
  for (const m of [mergeAppStates(peter.state, wife.state), mergeAppStates(wife.state, peter.state)]) {
    assert.equal(mealName(m, 'Tuesday'), 'Curry', "Peter's Tuesday was lost");
    assert.equal(mealNote(m, 'Monday'), 'ham and pineapple', "the other phone's note was lost");
  }
});

test('weeks: the same day changed on both phones: the later change wins', () => {
  const start = empty(); start.mealPlans = [week({ Monday: day('Pizza') }, { lastModifiedAt: 100 })];
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => { s.mealPlans[0].days.Monday = day('Fish'); return s; }, 1000);
  wife.edit((s) => { s.mealPlans[0].days.Monday = day('Chips'); return s; }, 2000);
  assert.equal(mealName(mergeAppStates(peter.state, wife.state), 'Monday'), 'Chips');
  assert.equal(mealName(mergeAppStates(wife.state, peter.state), 'Monday'), 'Chips');
});

test('weeks: sending the week to the list on one phone survives a day edited on the other', () => {
  const start = empty(); start.mealPlans = [week({ Monday: day('Pizza'), Tuesday: day('') }, { lastModifiedAt: 100 })];
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => { s.mealPlans[0].status = 'finalized'; s.mealPlans[0].lastFinalizedSnapshot = 'snap'; return s; }, 1000);
  wife.edit((s) => { s.mealPlans[0].days.Tuesday = day('Curry'); return s; }, 2000);
  const m = mergeAppStates(peter.state, wife.state);
  assert.equal(m.mealPlans[0].status, 'finalized', 'sent-to-list was lost');
  assert.equal(m.mealPlans[0].lastFinalizedSnapshot, 'snap');
  assert.equal(mealName(m, 'Tuesday'), 'Curry');
});

test('weeks: a stale screen saving the whole week only applies the day it changed', () => {
  const start = empty(); start.mealPlans = [week({ Monday: day('Pizza'), Tuesday: day('') }, { lastModifiedAt: 100 })];
  const p = new Phone(start);
  const screen = clone(p.state);
  p.edit((s) => { s.mealPlans[0].days.Monday = day('Pizza', 'from the other phone'); return s; }, 1000);
  p.edit((s) => { s.mealPlans[0].days.Tuesday = day('Curry'); return s; }, 2000, screen);
  assert.equal(mealNote(p.state, 'Monday'), 'from the other phone', 'stale save undid Monday');
  assert.equal(mealName(p.state, 'Tuesday'), 'Curry');
});

test('weeks: an older app that saved the whole week after day times were set still wins with its newer change', () => {
  const start = empty(); start.mealPlans = [week({ Monday: day('Pizza') }, { lastModifiedAt: 100 })];
  const peter = new Phone(start);
  peter.edit((s) => { s.mealPlans[0].days.Monday = day('Fish'); return s; }, 1000);
  const oldApp = clone(peter.state); // old app: changes Monday, bumps the week's time, leaves day times alone
  oldApp.mealPlans[0].days.Monday = day('Chips'); oldApp.mealPlans[0].lastModifiedAt = 3000;
  assert.equal(mealName(mergeAppStates(peter.state, oldApp), 'Monday'), 'Chips');
  assert.equal(mealName(mergeAppStates(oldApp, peter.state), 'Monday'), 'Chips');
});

test('staples: each phone adds one at the same time: both kept; a removal sticks', () => {
  const start = empty(); start.preferences = { recurringItems: [{ id: 'a', name: 'Milk' }, { id: 'b', name: 'Bread' }] };
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, recurringItems: [...s.preferences.recurringItems, { id: 'c', name: 'Bananas' }] } }), 1000);
  wife.edit((s) => ({ ...s, preferences: { ...s.preferences, recurringItems: [...s.preferences.recurringItems.filter((x) => x.id !== 'b'), { id: 'd', name: 'Yogurt' }] } }), 2000);
  for (const m of [mergeAppStates(peter.state, wife.state), mergeAppStates(wife.state, peter.state)]) {
    assert.deepEqual(m.preferences.recurringItems.map((x) => x.name), ['Bananas', 'Milk', 'Yogurt']);
  }
  // Peter then edits the milk amount, on a screen that still shows Bread: Bread stays removed.
  peter.pull(wife.state);
  const shown = clone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, recurringItems: s.preferences.recurringItems.map((x) => (x.id === 'a' ? { ...x, amount: 2 } : x)) } }), 3000, shown);
  assert.deepEqual(peter.state.preferences.recurringItems.map((x) => x.name + (x.amount ? x.amount : '')), ['Bananas', 'Milk2', 'Yogurt']);
});

test('favourites and past shops: item by item; past shops newest first', () => {
  const start = empty(); start.preferences = { favouriteItems: [{ name: 'Tea' }], shopHistory: [{ id: 's1', date: '2026-10-01T10:00:00Z', bought: 20, total: 20 }] };
  const peter = new Phone(start), wife = new Phone(start);
  peter.edit((s) => ({ ...s, preferences: { ...s.preferences, favouriteItems: [...s.preferences.favouriteItems, { name: 'Coffee' }], shopHistory: [{ id: 's2', date: '2026-10-08T10:00:00Z' }, ...s.preferences.shopHistory] } }), 1000);
  wife.edit((s) => ({ ...s, preferences: { ...s.preferences, favouriteItems: [], shopHistory: [{ id: 's3', date: '2026-10-09T10:00:00Z' }, ...s.preferences.shopHistory] } }), 2000);
  for (const m of [mergeAppStates(peter.state, wife.state), mergeAppStates(wife.state, peter.state)]) {
    assert.deepEqual(m.preferences.favouriteItems.map((x) => x.name), ['Coffee'], 'Tea was removed; Coffee added');
    assert.deepEqual(m.preferences.shopHistory.map((x) => x.id), ['s3', 's2', 's1']);
  }
});

test('weeks and lists: merging stays order-independent, repeatable and associative (2000 random cases)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const mk = () => {
    const s = empty();
    s.syncMeta = { tombstones: {}, preferencesModifiedAt: Math.floor(rnd() * 5) - 1, preferencesFieldModifiedAt: {}, overridesModifiedAt: {}, prefItemModifiedAt: {} };
    const p = week({}, { status: pick(['draft', 'finalized']), lastModifiedAt: Math.floor(rnd() * 20) });
    if (rnd() < 0.5) { p.dayModifiedAt = {}; p.headModifiedAt = Math.floor(rnd() * 20); }
    for (const d of ['Monday', 'Tuesday', 'Wednesday']) {
      p.days[d] = day(pick(['Pizza', 'Curry', '']), pick(['', 'note']));
      if (p.dayModifiedAt && rnd() < 0.8) p.dayModifiedAt[d] = Math.floor(rnd() * 20);
    }
    if (p.dayModifiedAt) p.lastModifiedAt = Math.max(p.headModifiedAt, ...Object.values(p.dayModifiedAt), rnd() < 0.2 ? 25 : 0);
    if (rnd() < 0.8) s.mealPlans.push(p);
    s.preferences = {};
    if (rnd() < 0.8) s.preferences.recurringItems = ['a', 'b', 'c', 'd'].filter(() => rnd() < 0.6).map((id) => ({ id, name: id.toUpperCase() + pick(['', '!']), amount: Math.floor(rnd() * 3) }));
    if (rnd() < 0.7) s.preferences.favouriteItems = ['Tea', 'Coffee', 'Jam'].filter(() => rnd() < 0.6).map((name) => ({ name, category: pick(['x', 'y']) }));
    if (rnd() < 0.6) s.preferences.shopHistory = ['s1', 's2', 's3'].filter(() => rnd() < 0.6).map((id) => ({ id, date: '2026-10-0' + id[1], bought: Math.floor(rnd() * 3) }));
    for (const f of ['recurringItems', 'favouriteItems', 'shopHistory']) if (rnd() < 0.5) s.syncMeta.preferencesFieldModifiedAt[f] = Math.floor(rnd() * 20);
    for (const k of ['recurringItems:a', 'recurringItems:b', 'favouriteItems:tea', 'shopHistory:s1']) {
      if (rnd() < 0.3) s.syncMeta.prefItemModifiedAt[k] = Math.floor(rnd() * 20);
      if (rnd() < 0.2) s.syncMeta.tombstones['pref.' + k] = Math.floor(rnd() * 20);
    }
    if (rnd() < 0.1) s.syncMeta.tombstones['mealPlans:2026-10-19'] = Math.floor(rnd() * 20);
    return s;
  };
  for (let n = 0; n < 2000; n++) {
    const a = mk(), b = mk(), c = mk();
    const ab = mergeAppStates(a, b), ba = mergeAppStates(b, a);
    assert.ok(statesEqual(ab, ba), 'not commutative at case ' + n);
    assert.ok(statesEqual(mergeAppStates(ab, ab), ab), 'not idempotent at case ' + n);
    assert.ok(statesEqual(mergeAppStates(ab, b), ab), 'merging again changed result at case ' + n);
    const l = mergeAppStates(mergeAppStates(a, b), c), r = mergeAppStates(a, mergeAppStates(b, c));
    if (!statesEqual(l, r) && process.env.DEBUG_ASSOC) console.log(JSON.stringify({ a, b, c, l: { p: l.mealPlans, pr: l.preferences, m: l.syncMeta }, r: { p: r.mealPlans, pr: r.preferences, m: r.syncMeta } }, null, 1));
    assert.ok(statesEqual(l, r), 'not associative at case ' + n);
  }
});

test('two phones editing weeks, staples and favourites at random always end up the same (300 runs)', () => {
  let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let run = 0; run < 300; run++) {
    const start = empty();
    start.mealPlans = [week({ Monday: day('Pizza'), Tuesday: day(''), Wednesday: day('') }, { lastModifiedAt: 1 })];
    start.preferences = { recurringItems: [{ id: 'a', name: 'Milk' }], favouriteItems: [{ name: 'Tea' }] };
    const phones = [new Phone(start), new Phone(start)];
    let gist = clone(start);
    let now = 1000;
    const sync = (p) => { p.pull(gist); gist = clone(p.state); };
    for (let step = 0; step < 25; step++) {
      const p = pick(phones);
      now += Math.floor(rnd() * 50) + 1;
      const r = rnd();
      const base = rnd() < 0.3 ? clone(p.state) : p.state; // sometimes a screen that's a step behind
      if (r < 0.35) p.edit((s) => { const pl = s.mealPlans.find((x) => x.startDate === '2026-10-19'); if (pl) pl.days[pick(['Monday', 'Tuesday', 'Wednesday'])] = day(pick(['Fish', 'Curry', '']), pick(['', 'n'])); return s; }, now, base);
      else if (r < 0.45) p.edit((s) => { const pl = s.mealPlans.find((x) => x.startDate === '2026-10-19'); if (pl) pl.status = pick(['draft', 'finalized']); return s; }, now, base);
      else if (r < 0.6) p.edit((s) => { const id = pick(['a', 'b', 'c']); const list = (s.preferences.recurringItems || []).filter((x) => x.id !== id); if (rnd() < 0.6) list.push({ id, name: pick(['Milk', 'Eggs', 'Bread']), amount: Math.floor(rnd() * 3) }); s.preferences = { ...s.preferences, recurringItems: list }; return s; }, now, base);
      else if (r < 0.7) p.edit((s) => { const n = pick(['Tea', 'Coffee', 'Jam']); const list = (s.preferences.favouriteItems || []).filter((x) => x.name !== n); if (rnd() < 0.5) list.push({ name: n }); s.preferences = { ...s.preferences, favouriteItems: list }; return s; }, now, base);
      else if (r < 0.75) p.edit((s) => ({ ...s, mealPlans: s.mealPlans.filter((x) => x.startDate !== '2026-10-19') }), now, base);
      else sync(p);
    }
    for (let i = 0; i < 2; i++) for (const p of phones) sync(p);
    assert.ok(statesEqual(phones[0].state, phones[1].state), 'phones differ after syncing, run ' + run);
    assert.ok(statesEqual(phones[0].state, gist), 'gist differs, run ' + run);
    const again = mergeAppStates(phones[0].state, gist);
    assert.ok(statesEqual(again, gist), 'another sync would change things, run ' + run);
  }
});

test('a phone away for over 3 months: deletions made meanwhile stay deleted, its own new changes are kept', () => {
  const day0 = 1_700_000_000_000;
  const start = empty();
  start.recipes = [{ id: 'r1', name: 'Lasagne', lastModifiedAt: day0 }, { id: 'r2', name: 'Old Curry', lastModifiedAt: day0 }];
  start.preferences = { recurringItems: [{ id: 'a', name: 'Milk' }, { id: 'b', name: 'Bread' }] };
  const away = new Phone(start), home = new Phone(start);
  // At home: delete a recipe and a staple; four months later those deletions have been forgotten.
  home.edit((s) => ({ ...s, recipes: s.recipes.filter((r) => r.id !== 'r2'), preferences: { ...s.preferences, recurringItems: [{ id: 'a', name: 'Milk' }] } }), day0 + 1000);
  home.edit((s) => ({ ...s, recipes: [...s.recipes, { id: 'r3', name: 'Chilli' }] }), day0 + 120 * 86_400_000);
  assert.ok(!home.state.syncMeta.tombstones['recipes:r2'], 'the old deletion should have been forgotten by now');
  // The phone that was away added a recipe just before coming back.
  away.edit((s) => ({ ...s, recipes: [...s.recipes, { id: 'r4', name: 'Soup' }] }), day0 + 121 * 86_400_000);
  const naive = mergeAppStates(away.state, home.state);
  assert.ok(naive.recipes.some((r) => r.id === 'r2'), '(a plain merge would bring Old Curry back)');
  const lastSynced = day0 + 500;
  const m = mergeAppStates(keepOnlyChangesSince(away.state, lastSynced), home.state);
  assert.deepEqual(m.recipes.map((r) => r.name).sort(), ['Chilli', 'Lasagne', 'Soup']);
  assert.deepEqual(m.preferences.recurringItems.map((x) => x.name), ['Milk']);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
