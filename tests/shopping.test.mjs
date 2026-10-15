// Tests for src/shopping (standard units, product matching, shopping quantities). Run with: npm test
import assert from 'node:assert/strict';
import {
  canonicalUnit, parseAmount, formatUnit, singularize, matchKey, groupingKey,
  buildCatalog, matchProduct, buildShoppingLines, shoppingQuantityFor, quantityForAddedItem,
  stepForItem, toBase, missingExtraProducts, EXTRA_PRODUCTS, INITIAL_GROCERY_DATABASE,
} from '../.test-build/shopping.mjs';

let failures = 0;
let passes = 0;
const test = (name, fn) => {
  try { fn(); passes++; console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '\n    ', String(e.message).split('\n').slice(0, 8).join('\n     ')); }
};
const cat = buildCatalog(INITIAL_GROCERY_DATABASE, {});
const q = (name, amount, unit) => { const r = shoppingQuantityFor(cat, name, amount, unit); return `${r.amount}${r.unit ? ' ' + r.unit : ''}`; };
const lines = (inputs) => buildShoppingLines(inputs, cat);
const show = (ls) => ls.map((l) => `${l.name}: ${l.amount}${l.unit ? ' ' + l.unit : ''}${l.cupboard ? ' [cupboard]' : ''}${l.needsCheck ? ' [check]' : ''}`).join(' | ');

// ---------------------------------------------------------------------------
test('units: every common spelling maps to one standard unit', () => {
  const cases = {
    g: ['g', 'G', 'grams', 'gram', 'gr', 'gms', 'g.'], kg: ['kg', 'Kilograms', 'kilo'], ml: ['ml', 'mls', 'millilitres', 'milliliters'],
    l: ['l', 'litre', 'Litres', 'liter'], tsp: ['tsp', 'teaspoon', 'Teaspoons', 'tsps'], tbsp: ['tbsp', 'Tbsp', 'tablespoons', 'tbs', 'tbsps', 'tablespoon'],
    each: ['', 'whole', 'piece', 'pieces', 'item', 'items', 'large', 'medium', 'x'], clove: ['clove', 'cloves'], can: ['can', 'cans', 'tin', 'tins', '400g can', '400g cans', '400g tin'],
    bunch: ['bunch', 'bunches'], pot: ['pots (150ml)', 'pot'], ball: ['ball (125g)', 'balls'], pinch: ['pinch', 'pinches'], cup: ['cup', 'cups'],
  };
  for (const [want, spellings] of Object.entries(cases)) for (const s of spellings) assert.equal(canonicalUnit(s), want, `"${s}"`);
});

test('amounts: fractions, ranges and odd input', () => {
  assert.equal(parseAmount('1/2'), 0.5); assert.equal(parseAmount('1 1/2'), 1.5); assert.equal(parseAmount('½'), 0.5);
  assert.equal(parseAmount('2-3'), 3); assert.equal(parseAmount('2 to 3'), 3); assert.equal(parseAmount(4), 4);
  assert.ok(isNaN(parseAmount('')) && isNaN(parseAmount('some')) && isNaN(parseAmount(null)));
});

test('unit labels pluralise sensibly', () => {
  assert.equal(formatUnit('can', 1), 'can'); assert.equal(formatUnit('can', 2), 'cans'); assert.equal(formatUnit('g', 500), 'g');
  assert.equal(formatUnit('each', 3), ''); assert.equal(formatUnit('bunch', 2), 'bunches'); assert.equal(formatUnit('loaf', 2), 'loaves');
});

test('names: plural and singular are the same', () => {
  for (const [a, b] of [['tomatoes', 'tomato'], ['potatoes', 'potato'], ['chillies', 'chilli'], ['berries', 'berry'], ['leaves', 'leaf'], ['peaches', 'peach'], ['breasts', 'breast'], ['onions', 'onion'], ['chickpeas', 'chickpea'], ['radishes', 'radish']]) assert.equal(singularize(a), b);
  for (const w of ['couscous', 'asparagus', 'hummus', 'lettuce', 'swiss', 'grass', 'feta', 'pasta']) assert.equal(singularize(w), w);
  assert.equal(matchKey('Chicken Breasts'), matchKey('chicken breast'));
  assert.equal(matchKey('2 Skinless Chicken Breasts, cut into chunks'), 'skinless chicken breast');
  assert.equal(groupingKey('Finely chopped shallots'), 'shallot');
  assert.equal(matchKey('Crème fraîche'), 'creme fraiche');
});

// ---------------------------------------------------------------------------
test('matching: messy ingredient names find the right product', () => {
  const cases = [
    ['chicken breasts', 'Chicken Breasts'], ['Chicken breast', 'Chicken Breasts'], ['2 skinless chicken breast fillets', 'Chicken Breasts'],
    ['boneless chicken thighs', 'Chicken Thighs'], ['onion, finely chopped', 'Onion'], ['large onions', 'Onion'], ['white onion', 'Onion'],
    ['red onion', 'Red Onion'], ['finely chopped red onion', 'Red Onion'], ['garlic cloves', 'Garlic'], ['clove of garlic', 'Garlic'], ['Garlic', 'Garlic'],
    ['chopped tomatoes', 'Chopped Tomatoes'], ['400g can chopped tomatoes', 'Chopped Tomatoes'], ['tinned tomatoes', 'Chopped Tomatoes'], ['tin of tomatoes', 'Chopped Tomatoes'],
    ['cherry tomatoes', 'Cherry Tomatoes'], ['tomatoes', 'Tomatoes'], ['vine tomatoes', 'Tomatoes'], ['tomato puree', 'Tomato Puree'], ['tomato paste', 'Tomato Puree'],
    ['potato', 'Potatoes'], ['baking potatoes', 'Potatoes'], ['sweet potato', 'Sweet Potatoes'], ['beef mince', 'Beef Mince'], ['minced beef', 'Beef Mince'],
    ['lean beef mince (5% fat)', 'Beef Mince'], ['ground beef', 'Beef Mince'], ['courgettes', 'Courgette'], ['zucchini', 'Courgette'], ['eggplant', 'Aubergine'],
    ['free-range eggs', 'Eggs'], ['egg yolks', 'Eggs'], ['egg noodles', 'Noodles'], ['mozzarella', 'Mozzarella'], ['ball of mozzarella', 'Mozzarella'],
    ['grated parmesan', 'Parmesan'], ['mature cheddar', 'Cheddar Cheese'], ['double cream', 'Double Cream'], ['semi-skimmed milk', 'Milk'], ['coconut milk', 'Coconut Milk'],
    ['extra virgin olive oil', 'Olive Oil'], ['salt', 'Salt'], ['sea salt flakes', 'Salt'], ['freshly ground black pepper', 'Black Pepper'], ['pepper to taste', 'Black Pepper'],
    ['red pepper', 'Bell Peppers'], ['peppers', 'Bell Peppers'], ['fresh coriander', 'Coriander'], ['ground coriander', 'Ground Coriander'], ['coriander seeds', 'Coriander Seeds'],
    ['fresh ginger', 'Ginger'], ['ground ginger', 'Ground Ginger'], ['ground cumin', 'Ground Cumin'], ['smoked paprika', 'Smoked Paprika'], ['chilli flakes', 'Chilli Flakes'],
    ['red chilli', 'Chilli Peppers'], ['chilli powder', 'Chilli Powder'], ['garlic powder', 'Garlic Powder'], ['onion powder', 'Onion Powder'], ['chicken stock', 'Stock Cubes'],
    ['hot vegetable stock', 'Stock Cubes'], ['beef stock cube', 'Stock Cubes'], ['plain flour', 'Flour'], ['caster sugar', 'Sugar'], ['light brown sugar', 'Brown Sugar'],
    ['juice of 1 lemon', 'Lemons'], ['lemon juice', 'Lemons'], ['lime zest', 'Limes'], ['orange juice', 'Orange Juice'], ['spring onions', 'Spring Onions'],
    ['celery sticks', 'Celery'], ['streaky bacon rashers', 'Bacon'], ['bacon lardons', 'Pancetta'], ['chorizo', 'Chorizo'], ['crème fraîche', 'Crème Fraîche'],
    ['red lentils', 'Lentils'], ['basmati rice', 'Basmati Rice'], ['spaghetti pasta', 'Spaghetti'], ['egg pasta', null], ['long grain rice', 'Basmati Rice'], ['penne pasta', 'Penne'], ['rigatoni', 'Pasta'],
    ['frozen peas', 'Frozen Peas'], ['peas', 'Frozen Peas'], ['kidney beans', 'Kidney Beans'], ['tinned chickpeas', 'Chickpeas'], ['greek yoghurt', 'Greek Yogurt'],
    ['soft cheese', 'Cream Cheese'], ['king prawns', 'Prawns'], ['salmon fillets', 'Salmon Fillets'], ['tuna in spring water', 'Canned Tuna'], ['garlic bread', 'Garlic Bread'],
    ['dried oregano', 'Dried Oregano'], ['bay leaves', 'Bay Leaves'], ['thyme sprigs', 'Fresh Thyme'], ['dried thyme', 'Dried Thyme'], ['worcestershire sauce', 'Worcestershire Sauce'],
    ['soy sauce', 'Soy Sauce'], ['sweet chilli sauce', 'Sweet Chilli Sauce'], ['tortilla wraps', 'Tortilla Wraps'], ['naan breads', 'Naan Bread'], ['baby spinach', 'Spinach'],
  ];
  const wrong = [];
  for (const [name, want] of cases) {
    const p = matchProduct(cat, name, { unit: name === 'red pepper' || name === 'peppers' ? '' : undefined, amount: 1 });
    if ((p?.name ?? null) !== want) wrong.push(`"${name}" -> ${p?.name ?? 'nothing'} (wanted ${want})`);
  }
  assert.deepEqual(wrong, []);
});

test('matching: things that must NOT match the obvious-looking product', () => {
  const cases = [
    ['tomato soup', null], ['mushroom soup', null], ['chicken seasoning', null], ['fajita seasoning', null], ['goats cheese', null],
    ['tuna steak', null], ['sun dried tomatoes', null], ['frozen spinach', null], ['coconut', null], ['cream', null], ['chicken', null], ['beef stock pot', 'Stock Cubes'],
    ['chilli oil', null], ['truffle oil', null], ['risotto rice', null], ['cauliflower steak', null], ['cooking oil', 'Vegetable Oil'], ['quail eggs', null],
  ];
  const wrong = [];
  for (const [name, want] of cases) {
    const p = matchProduct(cat, name);
    if ((p?.name ?? null) !== want) wrong.push(`"${name}" -> ${p?.name ?? 'nothing'} (wanted ${want ?? 'nothing'})`);
  }
  assert.deepEqual(wrong, []);
});

test('matching: "pepper" means bell pepper when counted, black pepper when seasoned', () => {
  assert.equal(matchProduct(cat, 'pepper', { unit: '', amount: 2 }).name, 'Bell Peppers');
  assert.equal(matchProduct(cat, 'pepper', { unit: 'tsp', amount: 1 }).name, 'Black Pepper');
  assert.equal(matchProduct(cat, 'pepper', { unit: 'pinch', amount: 1 }).name, 'Black Pepper');
  assert.equal(matchProduct(cat, 'pepper', { unit: '', amount: undefined }).name, 'Black Pepper');
});

// ---------------------------------------------------------------------------
test('the bugs found in review are fixed', () => {
  assert.equal(q('Chopped tomatoes', 200, 'g'), '1 can', '200 g tomatoes was "200 cans"');
  assert.equal(q('chopped tomatoes', 400, 'g'), '1 can', '400 g tomatoes was "400 cans"');
  assert.equal(q('Mozzarella', 62.5, 'g'), '1 ball', '62.5 g mozzarella was "63 ball"');
  assert.equal(q('garlic cloves', 3, ''), '1 bulb', '3 cloves was "3 bulbs"');
  assert.equal(q('garlic', 3, 'cloves'), '1 bulb');
  assert.equal(q('olive oil', 2, 'tbsp'), '500 ml', '2 tbsp oil was 1000 ml');
  const l = lines([
    { name: 'Onion', amount: 1, unit: '', source: 'Bolognese' },
    { name: 'onion', amount: 75, unit: 'g', source: 'Chilli' },
    { name: 'Garlic', amount: 2, unit: 'cloves', source: 'Bolognese' },
    { name: 'Garlic cloves', amount: 1.5, unit: '', source: 'Chilli' },
    { name: 'Chopped tomatoes', amount: 400, unit: 'g', source: 'Bolognese' },
    { name: 'chopped tomatoes', amount: 1, unit: 'can', source: 'Chilli' },
  ]);
  assert.equal(show(l), 'Onion: 2 | Garlic: 1 bulb | Chopped Tomatoes: 2 cans', '1 onion + 75 g was "76 wholes"; garlic was listed twice');
});

test('single ingredients: realistic UK shop quantities', () => {
  const cases = [
    ['beef mince', 500, 'g', '500 g'], ['beef mince', 450, 'g', '500 g'], ['beef mince', 0.75, 'kg', '750 g'], ['chicken breasts', 2, '', '500 g'],
    ['chicken breast', 300, 'g', '500 g'], ['onion', 2, '', '2'], ['onion', 0.5, 'piece', '1'], ['red onion', 1, 'large', '1'], ['carrots', 2, '', '200 g'],
    ['eggs', 3, '', '6 eggs'], ['eggs', 8, '', '12 eggs'], ['milk', 300, 'ml', '500 ml'], ['milk', 1, 'pint', '1000 ml'], ['butter', 25, 'g', '250 g'], ['butter', 2, 'tbsp', '250 g'],
    ['double cream', 200, 'ml', '300 ml'], ['penne', 150, 'g', '200 g'], ['basmati rice', 150, 'g', '200 g'], ['lemon', 1, '', '1'], ['lemon juice', 2, 'tbsp', '1'],
    ['lime juice', 3, 'tbsp', '3'], ['coriander', 1, 'handful', '1 bunch'], ['basil', 0.25, 'bunch', '1 bunch'], ['spring onions', 4, '', '1 bunch'],
    ['celery', 2, 'sticks', '1 bunch'], ['potatoes', 800, 'g', '1000 g'], ['potatoes', 4, '', '1000 g'], ['kidney beans', 1, 'can', '1 can'],
    ['coconut milk', 400, 'ml', '1 can'], ['coconut milk', 200, 'ml', '1 can'], ['passata', 500, 'g', '1 carton'], ['passata', 700, 'g', '2 cartons'],
    ['salmon fillets', 2, '', '2 fillets'], ['bacon', 4, 'rashers', '1 pack'], ['bacon', 10, 'rashers', '2 packs'], ['sausages', 8, '', '2 packs'],
    ['stock cube', 1, '', '1 pack'], ['chicken stock', 500, 'ml', '1 pack'], ['salt', 1, 'tsp', '250 g'], ['soy sauce', 2, 'tbsp', '150 ml'],
    ['parmesan', 30, 'g', '100 g'], ['cheddar', 150, 'g', '200 g'], ['mozzarella', 2, 'balls', '2 balls'], ['mozzarella', 250, 'g', '2 balls'],
  ];
  const wrong = [];
  for (const [name, amount, unit, want] of cases) { const got = q(name, amount, unit); if (got !== want) wrong.push(`${amount} ${unit} ${name}: got "${got}", wanted "${want}"`); }
  assert.deepEqual(wrong, []);
});

test('store-cupboard items are flagged, fresh items are not', () => {
  for (const n of ['olive oil', 'salt', 'black pepper', 'ground cumin', 'plain flour', 'stock cube', 'soy sauce', 'penne', 'basmati rice']) assert.ok(shoppingQuantityFor(cat, n, 1, 'tbsp').cupboard, n);
  for (const n of ['onion', 'chicken breast', 'chopped tomatoes', 'milk', 'mozzarella']) assert.ok(!shoppingQuantityFor(cat, n, 1, '').cupboard, n);
});

test('things that cannot be converted are flagged, never added in', () => {
  const l = lines([
    { name: 'Spinach', amount: 200, unit: 'g', source: 'A' },
    { name: 'Spinach', amount: 2, unit: 'cups', source: 'B' },
  ]);
  assert.equal(l.length, 1);
  assert.equal(l[0].amount, 200); assert.equal(l[0].unit, 'g');
  assert.ok(l[0].needsCheck && /2 cups \(B\)/.test(l[0].note), JSON.stringify(l[0]));
});

test('unknown ingredients: grouped by name, units never mixed, spices become a cupboard check', () => {
  const l = lines([
    { name: 'Gochujang', amount: 2, unit: 'tbsp' },
    { name: 'gochujang', amount: 1, unit: 'tbsp' },
    { name: 'Sumac', amount: 1, unit: 'tsp' },
    { name: 'Enoki', amount: 150, unit: 'g' },
    { name: 'enoki', amount: 0.1, unit: 'kg' },
    { name: 'Yuzu', amount: 2, unit: '' },
    { name: 'yuzu', amount: 50, unit: 'g' },
    { name: 'Quail eggs', amount: 12, unit: '' },
  ]);
  const by = Object.fromEntries(l.map((x) => [x.name, x]));
  assert.equal(by['Gochujang'].amount, 45); assert.equal(by['Gochujang'].unit, 'ml');
  assert.ok(by['Sumac'].cupboard && by['Sumac'].amount === 1);
  assert.equal(by['Enoki'].amount, 250); assert.equal(by['Enoki'].unit, 'g');
  assert.ok(by['Yuzu'].needsCheck, 'grams and a count of an unknown item must not be added together: ' + JSON.stringify(by['Yuzu']));
  assert.ok(by['Quail eggs'] && !by['Quail eggs'].productId, 'quail eggs are not hen eggs');
  assert.equal(l.length, 5);
});

test('a missing or zero amount still gets bought ("parsley to garnish")', () => {
  assert.equal(q('parsley', 0, ''), '1 bunch'); assert.equal(q('salt', 'to taste', ''), '250 g');
  const l = lines([{ name: 'Mystery item', amount: null, unit: '' }]);
  assert.equal(l[0].amount, 1);
});

// ---------------------------------------------------------------------------
test('a realistic week: five UK recipes for two', () => {
  const week = [
    // Spaghetti bolognese (serves 4, cooking for 2 -> scaled by 0.5 before this point)
    ['Beef mince', 250, 'g', 'Bolognese'], ['Onion', 0.5, '', 'Bolognese'], ['Carrot', 0.5, '', 'Bolognese'], ['Celery stick', 1, '', 'Bolognese'],
    ['Garlic cloves', 1, '', 'Bolognese'], ['Chopped tomatoes', 200, 'g', 'Bolognese'], ['Tomato purée', 1, 'tbsp', 'Bolognese'], ['Spaghetti', 150, 'g', 'Bolognese'],
    ['Parmesan', 20, 'g', 'Bolognese'], ['Olive oil', 1, 'tbsp', 'Bolognese'],
    // Chicken curry
    ['Chicken thighs', 4, '', 'Curry'], ['Onion', 1, 'large', 'Curry'], ['Garlic', 3, 'cloves', 'Curry'], ['Fresh ginger', 1, 'thumb', 'Curry'],
    ['Curry paste', 2, 'tbsp', 'Curry'], ['Chopped tomatoes', 1, 'can', 'Curry'], ['Coconut milk', 200, 'ml', 'Curry'], ['Basmati rice', 150, 'g', 'Curry'], ['Fresh coriander', 1, 'handful', 'Curry'],
    // Salmon traybake
    ['Salmon fillets', 2, '', 'Salmon'], ['Baby potatoes', 400, 'g', 'Salmon'], ['Lemon', 1, '', 'Salmon'], ['Cherry tomatoes', 150, 'g', 'Salmon'], ['Olive oil', 2, 'tbsp', 'Salmon'],
    // Chilli
    ['Beef mince', 250, 'g', 'Chilli'], ['Red onion', 1, '', 'Chilli'], ['Kidney beans', 400, 'g', 'Chilli'], ['Chopped tomatoes', 400, 'g', 'Chilli'],
    ['Ground cumin', 1, 'tsp', 'Chilli'], ['Chilli powder', 1, 'tsp', 'Chilli'], ['Red pepper', 1, '', 'Chilli'], ['Basmati rice', 150, 'g', 'Chilli'],
    // Omelette
    ['Eggs', 4, '', 'Omelette'], ['Cheddar', 50, 'g', 'Omelette'], ['Butter', 1, 'knob', 'Omelette'], ['Spring onions', 2, '', 'Omelette'],
  ].map(([name, amount, unit, source]) => ({ name, amount, unit, source }));
  const l = lines(week);
  const by = Object.fromEntries(l.map((x) => [x.name, `${x.amount}${x.unit ? ' ' + x.unit : ''}`]));
  assert.equal(by['Beef Mince'], '500 g');
  assert.equal(by['Onion'], '2', '0.5 + 1 large = 1.5 onions -> 2');
  assert.equal(by['Chopped Tomatoes'], '3 cans', '200 g + 1 can + 400 g = 1000 g = 2.5 cans -> 3');
  assert.equal(by['Garlic'], '1 bulb');
  assert.equal(by['Basmati Rice'], '400 g', '300 g in 200 g steps');
  assert.equal(by['Olive Oil'], '500 ml');
  assert.equal(by['Chicken Thighs'], '500 g', '4 thighs ~ 440 g');
  assert.equal(by['Salmon Fillets'], '2 fillets');
  assert.equal(by['Eggs'], '6 eggs');
  assert.equal(by['Bell Peppers'], '1');
  assert.ok(l.every((x) => !x.needsCheck), 'nothing should need checking: ' + show(l.filter((x) => x.needsCheck)));
  const names = l.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, 'each product appears once');
  const curry = l.find((x) => x.name === 'Onion'); assert.deepEqual(curry.sources.sort(), ['Bolognese', 'Curry']);
});

test('user changes to the grocery list are respected (pack sizes, custom items, aliases)', () => {
  const db = INITIAL_GROCERY_DATABASE.map((i) => (i.id === 'gdb-50' ? { ...i, increment: 500 } : i));
  const custom = { 'gdb-custom-1': { id: 'gdb-custom-1', name: 'Nduja', unit: 'g', increment: 1, category: 'Meat', aliases: ['nduja paste'] }, 'gdb-79': { aliases: ['moo juice'] } };
  const c = buildCatalog(db, custom);
  assert.equal(shoppingQuantityFor(c, 'beef mince', 250, 'g').amount, 500, 'user set mince to 500 g packs');
  assert.equal(matchProduct(c, 'nduja paste')?.name, 'Nduja');
  assert.equal(shoppingQuantityFor(c, 'nduja', 40, 'g').amount, 40);
  assert.equal(matchProduct(c, 'moo juice')?.name, 'Milk');
});

test('hand-added items: "1" means one pack', () => {
  const t = (n, s) => { const r = quantityForAddedItem(cat, n, s); return `${r.amount}${r.unit ? ' ' + r.unit : ''}`; };
  assert.equal(t('Milk', 1), '500 ml'); assert.equal(t('Eggs', 1), '6 eggs'); assert.equal(t('Chopped Tomatoes', 2), '2 cans');
  assert.equal(t('Bread', 1), '1 loaf'); assert.equal(t('Something new', 1), '1 item');
  assert.equal(stepForItem(cat, { name: 'Beef Mince', unit: 'g' }), 250); assert.equal(stepForItem(cat, { name: 'Eggs', unit: 'eggs' }), 6);
});

test('new products are offered to the shared list once, without duplicating existing names', () => {
  const missing = missingExtraProducts(INITIAL_GROCERY_DATABASE);
  assert.equal(missing.length, EXTRA_PRODUCTS.length);
  const already = [...INITIAL_GROCERY_DATABASE, { id: 'mine', name: 'Chorizo', unit: 'g', increment: 1, category: 'Meat' }];
  assert.ok(!missingExtraProducts(already).some((i) => i.name === 'Chorizo'));
  assert.equal(missingExtraProducts([...INITIAL_GROCERY_DATABASE, ...missing]).length, 0);
});

test('every built-in product can turn its own buying unit into a quantity', () => {
  const broken = cat.products.filter((p) => !p.sameAs && p.buySize === null).map((p) => `${p.name} (${p.buyUnit})`);
  assert.deepEqual(broken, []);
});

// ---------------------------------------------------------------------------
// Properties over thousands of random shopping lists.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const UNITS = ['', 'g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'can', 'clove', 'bunch', 'handful', 'pinch', 'piece', 'large', 'pack', 'slice'];
const NAMES = cat.products.filter((p) => !p.sameAs).flatMap((p) => [p.name, ...p.keys.slice(0, 2)]).concat(['Gochujang', 'Sumac', 'Shiitake mushrooms', 'quail eggs']);
const BIG = new Set(['g', 'ml']);
const randomInputs = (n) => Array.from({ length: n }, () => {
  const unit = pick(UNITS);
  const amount = BIG.has(unit) ? Math.round(rnd() * 800) : unit === 'kg' ? Math.round((0.25 + rnd() * 1.25) * 4) / 4 : Math.round((0.25 + rnd() * 5.75) * 4) / 4;
  return { name: pick(NAMES), amount, unit, source: pick(['A', 'B', 'C']) };
});

test('property: never NaN, negative, zero or absurd; every input appears on the list', () => {
  for (let i = 0; i < 2000; i++) {
    const inputs = randomInputs(1 + Math.floor(rnd() * 12));
    const l = lines(inputs);
    for (const x of l) {
      assert.ok(isFinite(x.amount) && x.amount > 0, `bad amount ${JSON.stringify(x)}`);
      if (/^cans?$|^balls?$|^bulbs?$|^bunch(es)?$|^packs?$|^$/.test(x.unit)) assert.ok(x.amount < 200, `absurd count ${JSON.stringify(x)} from ${JSON.stringify(inputs)}`);
    }
    const covered = new Set(l.map((x) => x.key));
    for (const inp of inputs) {
      const p = matchProduct(cat, inp.name, { unit: inp.unit, amount: inp.amount });
      assert.ok(covered.has(p ? `p:${p.id}` : `n:${groupingKey(inp.name) || matchKey(inp.name)}`), `lost ${inp.name}`);
    }
  }
});

test('property: what you buy always covers what the recipes need', () => {
  for (let i = 0; i < 2000; i++) {
    const inputs = randomInputs(1 + Math.floor(rnd() * 8));
    const l = lines(inputs);
    for (const x of l) {
      if (!x.productId) continue;
      const p = cat.byId.get(x.productId);
      if (!p.buySize) continue;
      let need = 0;
      for (const inp of inputs) {
        const m = matchProduct(cat, inp.name, { unit: inp.unit, amount: inp.amount });
        if (m?.id !== p.id || !(inp.amount > 0)) continue;
        const b = toBase(p, inp.amount, inp.unit);
        if (b !== null) need += b;
      }
      // Bought (in the product's base measure) must cover the need, allowing only the
      // deliberate 5%-of-one-pack tolerance (e.g. 410 g of tomatoes -> one 400 g can).
      const bought = x.amount * p.buySize;
      const allowance = 0.05 * p.step * p.buySize;
      assert.ok(bought + allowance + 1e-6 >= need, `${x.name}: bought ${bought} (${x.amount} ${x.unit}) for need ${need}`);
      assert.ok(bought < need + p.step * p.buySize * 1.0001 || need === 0, `${x.name}: over-buying ${bought} for need ${need}`);
    }
  }
});

test('property: adding an ingredient never lowers any amount', () => {
  for (let i = 0; i < 1500; i++) {
    const inputs = randomInputs(1 + Math.floor(rnd() * 8));
    const before = new Map(lines(inputs).map((x) => [x.key, x]));
    const after = new Map(lines([...inputs, ...randomInputs(1)]).map((x) => [x.key, x]));
    for (const [k, x] of before) {
      const y = after.get(k);
      assert.ok(y, `line ${k} disappeared`);
      if (y.unit === x.unit) assert.ok(y.amount >= x.amount, `${x.name} went from ${x.amount} to ${y.amount}`);
    }
  }
});

test('property: order of recipes makes no difference', () => {
  for (let i = 0; i < 1000; i++) {
    const inputs = randomInputs(2 + Math.floor(rnd() * 8));
    const shuffled = [...inputs].sort(() => rnd() - 0.5);
    const a = lines(inputs).map((x) => `${x.key}=${x.amount}${x.unit}`).sort();
    const b = lines(shuffled).map((x) => `${x.key}=${x.amount}${x.unit}`).sort();
    assert.deepEqual(a, b);
  }
});

test('property: converting a list quantity again gives the same quantity (safe to re-run)', () => {
  for (const p of cat.products) {
    if (p.sameAs || !p.buySize) continue;
    for (const n of [1, 2, 3]) {
      const first = quantityForAddedItem(cat, p.name, n);
      const again = shoppingQuantityFor(cat, p.name, first.amount, first.unit);
      assert.equal(`${again.amount} ${again.unit}`, `${first.amount} ${first.unit}`, p.name);
    }
  }
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
