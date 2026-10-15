// Tests for src/services/syncMerge.ts — run with: npm test
import { mergeAppStates, applyLocalChange, statesEqual, getDismissedShoppingIds, stableStringify, dropDefaultsMissingFrom } from '../.test-build/syncMerge.mjs';
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

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
