// Tests for src/shopping (standard units, product matching, shopping quantities). Run with: npm test
import assert from 'node:assert/strict';
import {
  canonicalUnit, parseAmount, formatUnit, singularize, matchKey, groupingKey,
  buildCatalog, matchProduct, buildShoppingLines, shoppingQuantityFor, quantityForAddedItem,
  stepForItem, toBase, missingExtraProducts, EXTRA_PRODUCTS, INITIAL_GROCERY_DATABASE,
  matchProductDetailed, linkIngredients, namesNeedingSuggestion, productByName,
} from '../.test-build/shopping.mjs';
import * as S from '../.test-build/shopping.mjs';

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
    ['red chilli', 'Chilli Peppers'], ['chilli powder', 'Chilli Powder'], ['garlic powder', 'Garlic Powder'], ['onion powder', 'Onion Powder'], ['chicken stock', 'Chicken Stock Cubes'],
    ['hot vegetable stock', 'Stock Cubes'], ['beef stock cube', 'Beef Stock Cubes'], ['plain flour', 'Flour'], ['caster sugar', 'Caster Sugar'], ['self-raising flour', 'Self-Raising Flour'], ['icing sugar', 'Icing Sugar'], ['dry white wine', 'White Wine'], ['tikka masala paste', 'Tikka Masala Paste'], ['new potatoes', 'Baby Potatoes'], ['light brown sugar', 'Brown Sugar'],
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
    ['tomato soup', 'Tinned Soup'], ['mushroom soup', 'Tinned Soup'], ['chicken seasoning', null], ['fajita seasoning', null], ['goats cheese', "Goat's Cheese"], ['cream cheese', 'Cream Cheese'],
    ['tuna steak', null], ['sun dried tomatoes', null], ['frozen spinach', null], ['coconut', null], ['cream', null], ['chicken', null], ['beef stock pot', 'Beef Stock Cubes'],
    ['chilli oil', null], ['truffle oil', null], ['risotto rice', 'Risotto Rice'], ['cauliflower steak', null], ['cooking oil', 'Vegetable Oil'], ['quail eggs', null],
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
    ['eggs', 3, '', '6 eggs'], ['eggs', 8, '', '12 eggs'], ['milk', 300, 'ml', '1 pint'], ['milk', 1, 'pint', '1 pint'], ['milk', 1.2, 'l', '3 pints'], ['butter', 25, 'g', '250 g'], ['butter', 2, 'tbsp', '250 g'],
    ['double cream', 200, 'ml', '300 ml'], ['penne', 150, 'g', '200 g'], ['basmati rice', 150, 'g', '200 g'], ['lemon', 1, '', '1'], ['lemon juice', 2, 'tbsp', '1'],
    ['lime juice', 3, 'tbsp', '3'], ['coriander', 1, 'handful', '1 bunch'], ['basil', 0.25, 'bunch', '1 bunch'], ['spring onions', 4, '', '1 bunch'],
    ['celery', 2, 'sticks', '1 bunch'], ['potatoes', 800, 'g', '1000 g'], ['potatoes', 4, '', '1000 g'], ['kidney beans', 1, 'can', '1 can'],
    ['coconut milk', 400, 'ml', '1 can'], ['coconut milk', 200, 'ml', '1 can'], ['passata', 500, 'g', '1 carton'], ['passata', 700, 'g', '2 cartons'],
    ['salmon fillets', 2, '', '2 fillets'], ['bacon', 4, 'rashers', '1 pack'], ['bacon', 10, 'rashers', '1 pack'], ['bacon', 12, 'rashers', '2 packs'], ['sausages', 8, '', '2 packs'],
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

test('amounts read the way you buy and cook them', () => {
  const { formatQuantity, largeUnitQuantity, formatCookingAmount } = S;
  assert.equal(formatQuantity(1000, 'g'), '1 kg'); assert.equal(formatQuantity(1250, 'g'), '1.25 kg');
  assert.equal(formatQuantity(1500, 'ml'), '1.5 l'); assert.equal(formatQuantity(750, 'g'), '750 g');
  assert.equal(formatQuantity(2, 'can'), '2 cans'); assert.equal(formatQuantity(3, ''), '3'); assert.equal(formatQuantity(4, 'pints'), '4 pints');
  assert.equal(largeUnitQuantity(999, 'g'), null); assert.equal(largeUnitQuantity(2000, 'cans'), null);
  const c = (n, u) => formatCookingAmount(n, u);
  assert.equal(c(0.5), '½'); assert.equal(c(1.5, 'tbsp'), '1½'); assert.equal(c(0.25, 'tsp'), '¼'); assert.equal(c(0.333), '⅓');
  assert.equal(c(0.67), '⅔'); assert.equal(c(2), '2'); assert.equal(c(0.5, 'x 400g tin'), '½'); assert.equal(c(1.2), '1.2');
  assert.equal(c(75, 'g'), '75'); assert.equal(c(133.33, 'g'), '133'); assert.equal(c(2.5, 'g'), '2.5'); assert.equal(c(0, 'g'), '');
});

test('built-in defaults that changed are updated only if you never edited them', () => {
  const db = S.builtInProducts().map((i) => (i.id === 'gdb-79' ? { ...i, unit: 'ml', increment: 500 } : i));
  const upd = S.outdatedDefaults(db);
  assert.equal(upd.length, 1); assert.equal(upd[0].unit, 'pint'); assert.equal(upd[0].increment, 1);
  const edited = db.map((i) => (i.id === 'gdb-79' ? { ...i, unit: 'l', increment: 1 } : i));
  assert.deepEqual(S.outdatedDefaults(edited), [], 'your own setting is kept');
  assert.deepEqual(S.outdatedDefaults(S.builtInProducts()), [], 'new data already has the new defaults');
});

test('UK pack sizes: what typical recipe amounts put on the list', () => {
  const uk = buildCatalog(null, null);
  const cases = [
    ['chicken breasts', 2, '', 'Chicken Breasts: 300 g'], ['chicken thighs', 4, '', 'Chicken Thighs: 600 g'],
    ['pork mince', 400, 'g', 'Pork Mince: 500 g'], ['carrots', 3, '', 'Carrots: 1 kg'], ['tomatoes', 2, '', 'Tomatoes: 2'],
    ['potatoes', 800, 'g', 'Potatoes: 2.5 kg'], ['new potatoes', 500, 'g', 'Baby Potatoes: 1 kg'], ['sweet potatoes', 2, '', 'Sweet Potatoes: 2'],
    ['mushrooms', 200, 'g', 'Mushrooms: 300 g'], ['green beans', 200, 'g', 'Green Beans: 200 g'], ['cheddar', 100, 'g', 'Cheddar Cheese: 400 g'],
    ['frozen peas', 100, 'g', 'Frozen Peas: 1 kg'], ['spaghetti', 200, 'g', 'Spaghetti: 500 g'], ['basmati rice', 300, 'g', 'Basmati Rice: 1 kg'],
    ['self-raising flour', 150, 'g', 'Self-Raising Flour: 1.5 kg'], ['icing sugar', 50, 'g', 'Icing Sugar: 500 g'],
    ['vegetable oil', 2, 'tbsp', 'Vegetable Oil: 1 l'], ['white wine vinegar', 1, 'tbsp', 'White Wine Vinegar: 350 ml'],
    ['chicken stock', 500, 'ml', 'Chicken Stock Cubes: 1 pack'], ['white wine', 150, 'ml', 'White Wine: 1 bottle'],
    ['pepper', 1, 'pinch', 'Black Pepper: 100 g'], ['red pepper', 2, '', 'Peppers: 2'], ['bacon rashers', 6, '', 'Bacon: 1 pack'],
  ];
  const bad = [];
  for (const [n, a, u, want] of cases) {
    const r = shoppingQuantityFor(uk, n, a, u);
    const got = `${r.name}: ${r.amount}${r.unit ? ' ' + r.unit : ''}`;
    if (got !== want) bad.push(`${a} ${u} ${n}: got "${got}", wanted "${want}"`);
  }
  assert.deepEqual(bad, []);
  const rice = uk.byId.get('gdb-99');
  assert.equal(rice.item.category, 'Pasta, Rice & Grains');
});

test('upgrade once: new defaults only where you never changed them; staples and favourites get UK names', () => {
  const db = S.INITIAL_GROCERY_DATABASE.map((i) => ({ ...i, category: S.aisleCategory(i) }));
  const edited = db.map((i) => (i.id === 'gdb-51' ? { ...i, increment: 200 } : i.id === 'gdb-8' ? { ...i, name: 'Mixed Peppers' } : i));
  const st = { recipes: [], mealPlans: [], batches: [], shoppingList: [], groceryDatabase: edited,
    preferences: { catalogVersion: 3, recurringItems: [{ id: 's', name: 'Toilet Paper', amount: 1, unit: 'pack' }], favouriteItems: [{ name: 'Toilet Paper' }, { name: 'Toilet Roll' }, { name: 'Tea' }] } };
  const up = S.upgradeProductDefaults(st, {});
  const g = (id) => up.groceryDatabase.find((x) => x.id === id);
  assert.equal(g('gdb-51').increment, 200, 'your own chicken breast step kept');
  assert.equal(g('gdb-8').name, 'Mixed Peppers', 'your own name kept');
  assert.equal(g('gdb-52').increment, 600);
  assert.equal(g('gdb-5').unit, 'kg'); assert.equal(g('gdb-5').increment, 2.5);
  assert.equal(g('gdb-133').name, 'Plain Flour'); assert.equal(g('gdb-133').unit, 'kg');
  assert.equal(g('gdb-99').category, 'Pasta, Rice & Grains');
  assert.equal(g('gdb-158').name, 'Washing-up Liquid');
  assert.equal(up.preferences.catalogVersion, S.CATALOG_VERSION);
  assert.equal(up.preferences.recurringItems[0].name, 'Toilet Roll');
  assert.deepEqual(up.preferences.favouriteItems.map((f) => f.name), ['Toilet Roll', 'Tea'], 'no duplicate favourite');
  const n = S.normaliseProducts({ ...up, syncMeta: { tombstones: {} } }, 9000);
  assert.ok(n.groceryDatabase.some((x) => x.id === 'gdb-x-self-raising-flour'), 'new products are added');
  assert.ok(n.groceryDatabase.some((x) => x.id === 'gdb-x-yorkshire'));
});

test('hand-added items: "1" means one pack', () => {
  const t = (n, s) => { const r = quantityForAddedItem(cat, n, s); return `${r.amount}${r.unit ? ' ' + r.unit : ''}`; };
  assert.equal(t('Milk', 1), '1 pint'); assert.equal(t('Eggs', 1), '6 eggs'); assert.equal(t('Chopped Tomatoes', 2), '2 cans');
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

test('links: exact name beats a saved link; a saved link beats a partial guess', () => {
  // Saved link (from Gemini or Map Ingredient) settles the cases name rules get wrong
  assert.equal(matchProduct(cat, 'San Marzano tomatoes', { groceryId: 'gdb-106' }).name, 'Plum Tomatoes');
  assert.equal(matchProduct(cat, 'San Marzano tomatoes').name, 'Tomatoes', 'without the link the partial guess is fresh tomatoes');
  assert.equal(matchProduct(cat, 'Polpa', { groceryId: 'gdb-105' }).name, 'Chopped Tomatoes');
  // ...but if the ingredient was renamed to an exact product, the name wins over a stale link
  assert.equal(matchProduct(cat, 'Spaghetti', { groceryId: 'gdb-93' }).name, 'Spaghetti');
  // A link to a product that no longer exists is ignored
  assert.equal(matchProduct(cat, 'lean beef mince', { groceryId: 'gdb-deleted' }).name, 'Beef Mince');
  assert.equal(matchProductDetailed(cat, 'chicken breasts').how, 'exact');
  assert.equal(matchProductDetailed(cat, 'extra lean British beef mince').how, 'partial');
  assert.equal(matchProductDetailed(cat, 'polpa', { groceryId: 'gdb-105' }).how, 'linked');
});

test('import linking: exact, then Gemini suggestion, then partial, then ask; wording never changes', () => {
  const ings = [
    { name: 'skinless chicken breasts', amount: 2, unit: '', note: 'cut into chunks' }, // partial (no suggestion)
    { name: 'chicken breasts', amount: 2, unit: '' },                                    // exact
    { name: 'San Marzano tomatoes', amount: 400, unit: 'g' },                            // partial would be wrong -> Gemini
    { name: 'polpa', amount: 1, unit: 'carton' },                                         // unknown -> Gemini
    { name: 'gochujang', amount: 2, unit: 'tbsp' },                                       // unknown, Gemini unsure -> ask
    { name: 'lemongrass', amount: 1, unit: 'stalk' },                                     // Gemini invents a product -> ignored -> ask
  ];
  const asked = namesNeedingSuggestion(ings, cat);
  assert.deepEqual(asked, ['skinless chicken breasts', 'San Marzano tomatoes', 'polpa', 'gochujang', 'lemongrass'], 'only non-exact names go to Gemini');
  const suggestions = { 'San Marzano tomatoes': 'Plum Tomatoes', polpa: 'Chopped Tomatoes', gochujang: '', lemongrass: 'Lemongrass Stalks' };
  const { ingredients, unmapped } = linkIngredients(ings, cat, suggestions);
  const by = Object.fromEntries(ingredients.map((i) => [i.name, i]));
  assert.equal(cat.byId.get(by['skinless chicken breasts'].groceryId).name, 'Chicken Breasts'); assert.equal(by['skinless chicken breasts'].linkSource, 'partial');
  assert.equal(by['chicken breasts'].linkSource, 'exact');
  assert.equal(cat.byId.get(by['San Marzano tomatoes'].groceryId).name, 'Plum Tomatoes'); assert.equal(by['San Marzano tomatoes'].linkSource, 'gemini');
  assert.equal(cat.byId.get(by['polpa'].groceryId).name, 'Chopped Tomatoes');
  assert.deepEqual(unmapped.map((u) => u.name), ['gochujang', 'lemongrass']);
  // Wording, amounts, units and notes are untouched
  ings.forEach((orig, i) => { for (const k of ['name', 'amount', 'unit', 'note']) assert.equal(ingredients[i][k], orig[k], `${orig.name}.${k} changed`); });
});

test('import linking: when Gemini\'s suggestions fail, partial matches and Map Ingredient still work', () => {
  const { ingredients, unmapped } = linkIngredients([{ name: 'lean beef mince', amount: 500, unit: 'g' }, { name: 'polpa', amount: 1, unit: '' }], cat, {});
  assert.equal(cat.byId.get(ingredients[0].groceryId).name, 'Beef Mince');
  assert.deepEqual(unmapped.map((u) => u.name), ['polpa']);
  assert.equal(productByName(cat, 'plum tomatoes').name, 'Plum Tomatoes');
  assert.equal(productByName(cat, 'Not A Product'), null);
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

// ---------------------------------------------------------------------------
// One product list: old data folded in, aisles, removals, merges, other names
// ---------------------------------------------------------------------------
const oldStyle = () => ({
  recipes: [{ id: 'r1', name: 'Pesto pasta', ingredients: [
    { id: 'i1', name: 'zucchini', amount: 2, unit: '', groceryId: 'gdb-custom-zuc' },
    { id: 'i2', name: 'pine nuts', amount: 30, unit: 'g', groceryId: 'gdb-x-pine-nuts' },
  ] }],
  mealPlans: [], batches: [],
  shoppingList: [
    { id: 'l1', name: 'Zucchini', amount: 2, unit: 'whole', groceryId: 'gdb-custom-zuc', planId: 'plan-x', checked: false, isAdhoc: true },
    { id: 'l2', name: 'Courgette', amount: 1, unit: 'whole', groceryId: 'gdb-17', planId: 'plan-x', checked: false, isAdhoc: true },
  ],
  preferences: { recurringItems: [{ id: 's1', name: 'Zucchini', amount: 1, unit: 'whole' }], favouriteItems: [{ name: 'Zucchini' }, { name: 'Courgette' }] },
  groceryDatabase: [
    ...INITIAL_GROCERY_DATABASE.map((i) => ({ ...i, lastModifiedAt: 1000 })),
    { id: 'gdb-x-pine-nuts', name: 'Pine Nuts', unit: 'pack', increment: 1, category: 'Pantry', lastModifiedAt: 1000 },
    { id: 'gdb-custom-zuc', name: 'Zucchini', unit: 'whole', increment: 1, category: 'Veg', lastModifiedAt: 1000 },
  ],
  groceryOverrides: { 'gdb-2': { increment: 2 }, 'gdb-custom-nduja': { id: 'gdb-custom-nduja', name: 'Nduja', unit: 'jar', increment: 1, category: 'Meat' }, 'gdb-x-cumin-seeds': { category: 'Spices' } },
  syncMeta: { tombstones: { 'groceryDatabase:gdb-x-paprika': 1500 }, overridesModifiedAt: { 'gdb-2': 2000, 'gdb-custom-nduja': 3000 } },
});
const byId = (st, id) => (st.groceryDatabase || []).find((g) => g.id === id);

test('aisles: each Shop aisle name maps back to itself; old groups map sensibly', () => {
  for (const [id, a] of Object.entries(S.GROCERY_AISLES)) assert.equal(S.getGroceryAisle({ name: 'x', category: a.name }), id, a.name);
  assert.equal(S.aisleCategory({ name: 'Garlic', category: 'Produce' }), 'Fresh Produce');
  assert.equal(S.aisleCategory({ name: 'Cod', category: 'Fish' }), 'Meat & Seafood');
  assert.equal(S.aisleCategory({ name: 'Shampoo', category: 'Hygiene' }), 'Household & Other');
  assert.equal(S.aisleCategory({ name: 'Orange Juice', category: 'Beverages' }), 'Dairy, Chilled & Eggs');
  assert.equal(S.aisleCategory({ name: 'Mystery Mix', category: '' }), '');
});

test('built-in products: every one has an aisle, and none look like duplicates of each other', () => {
  const builtIns = S.builtInProducts();
  assert.ok(builtIns.length > INITIAL_GROCERY_DATABASE.length, 'extras included');
  assert.deepEqual(builtIns.filter((i) => !i.removed && !S.isAisleName(i.category)).map((i) => i.name), []);
  assert.deepEqual(S.likelyDuplicates(buildCatalog(null, null)).map(([a, b]) => `${a.name}/${b.name}`), []);
  assert.equal(builtIns.find((i) => i.id === 'gdb-18').mergedInto, 'gdb-17', 'Zucchini is part of Courgette');
});

test('old data folds into one list: separate changes, deleted built-ins, aisles; doing it again changes nothing', () => {
  const st = oldStyle();
  const n = S.normaliseProducts(st, 9000);
  assert.deepEqual(n.groceryOverrides, {});
  assert.equal(byId(n, 'gdb-2').increment, 2);
  assert.equal(byId(n, 'gdb-2').category, 'Fresh Produce');
  assert.ok(byId(n, 'gdb-2').lastModifiedAt > 2000, 'newer than the change it folded in');
  assert.equal(byId(n, 'gdb-custom-nduja').category, 'Meat & Seafood');
  assert.equal(byId(n, 'gdb-x-cumin-seeds').category, 'Pantry, Oils & Spices');
  assert.equal(byId(n, 'gdb-x-paprika').removed, true, 'deleted built-in kept off');
  assert.ok(byId(n, 'gdb-x-paprika').lastModifiedAt > 1500, 'the marker outlives the deletion record');
  assert.equal(byId(n, 'gdb-custom-zuc').category, 'Fresh Produce');
  assert.ok(n.syncMeta.tombstones['groceryOverrides:gdb-custom-nduja'] >= 3000, 'separate changes marked as folded');
  assert.equal(S.normaliseProducts(n, 9500), n, 'nothing more to do');
  const cat2 = buildCatalog(n.groceryDatabase, n.groceryOverrides);
  assert.equal(matchProduct(cat2, 'paprika')?.name ?? null, null, 'Paprika stays off');
  assert.equal(matchProduct(cat2, 'something', { groceryId: 'gdb-18' }).name, 'Courgette', 'a link to a merged built-in leads to its product');
});

test('a built-in product that is just a default stays a default when tidied (never beats real data)', () => {
  const st = { ...oldStyle(), groceryOverrides: {}, syncMeta: { tombstones: {} } };
  st.groceryDatabase = st.groceryDatabase.map((i) => ({ ...i, lastModifiedAt: -1 }));
  const n = S.normaliseProducts(st, 9000);
  assert.ok(byId(n, 'gdb-1').lastModifiedAt < 0);
});

test('merge "Same as…": names, recipes, list lines, staples and favourites move to the one kept', () => {
  const st = S.normaliseProducts(oldStyle(), 9000);
  const c = S.catalogForState(st);
  const m = S.mergeProductsIn(st, c, 'gdb-17', 'gdb-custom-zuc');
  assert.equal(byId(m, 'gdb-custom-zuc').removed, true);
  assert.equal(byId(m, 'gdb-custom-zuc').mergedInto, 'gdb-17');
  assert.equal(m.recipes[0].ingredients[0].groceryId, 'gdb-17');
  assert.equal(m.shoppingList.length, 1, 'two lines for the same week become one');
  assert.equal(m.shoppingList[0].amount, 3);
  assert.equal(m.preferences.recurringItems[0].name, 'Courgette');
  assert.deepEqual(m.preferences.favouriteItems.map((f) => f.name), ['Courgette'], 'favourites: no duplicates');
  const after = S.catalogForState(m);
  assert.equal(matchProduct(after, 'zucchini').id, 'gdb-17');
  assert.equal(after.byId.get('gdb-custom-zuc') && matchProduct(after, 'x', { groceryId: 'gdb-custom-zuc' }).id, 'gdb-17', 'old links lead to the kept product');
});

test('remove: kept as removed, links taken off; Undo puts them back', () => {
  const st = S.normaliseProducts(oldStyle(), 9000);
  const r = S.removeProductIn(st, 'gdb-x-pine-nuts');
  assert.equal(byId(r.next, 'gdb-x-pine-nuts').removed, true);
  assert.equal(r.next.recipes[0].ingredients[1].groceryId, undefined);
  assert.equal(r.next.shoppingList, st.shoppingList, 'untouched lists keep their identity');
  assert.ok(!S.catalogForState(r.next).products.some((p) => p.id === 'gdb-x-pine-nuts'));
  assert.equal(S.normaliseProducts(r.next, 9900).groceryDatabase.filter((g) => g.id === 'gdb-x-pine-nuts').length, 1, 'not added back');
  const back = S.restoreProductIn(r.next, r.undo);
  assert.ok(!byId(back, 'gdb-x-pine-nuts').removed);
  assert.equal(back.recipes[0].ingredients[1].groceryId, 'gdb-x-pine-nuts');
});

test('also called: built-in names can be taken off and your own added', () => {
  const garlic = S.builtInProducts().find((i) => i.id === 'gdb-2');
  assert.ok(S.alsoCalled(garlic).includes('garlic paste'));
  const edited = S.withAlsoCalled(garlic, [...S.alsoCalled(garlic).filter((a) => a !== 'garlic paste'), 'ajo']);
  assert.deepEqual(edited.aliases, ['ajo']);
  assert.deepEqual(edited.hiddenAliases, ['garlic paste']);
  const c = buildCatalog(S.builtInProducts().map((i) => (i.id === 'gdb-2' ? edited : i)), null);
  assert.equal(matchProduct(c, 'ajo').name, 'Garlic');
  assert.notEqual(matchProduct(c, 'garlic paste')?.id, 'gdb-2');
  assert.ok(S.productMatchesSearch(c.byId.get('gdb-17'), 'courgettes'), 'search finds plurals');
});

test('tidy-up: likely duplicates, no aisle; "not the same" is remembered', () => {
  const st = S.normaliseProducts(oldStyle(), 9000);
  st.groceryDatabase.push({ id: 'gdb-custom-basil', name: 'Fresh Basil', unit: 'bunch', increment: 1, category: 'Fresh Produce' }, { id: 'gdb-custom-m', name: 'Mystery Mix', unit: 'pack', increment: 1, category: '' });
  const c = S.catalogForState(st);
  const pairs = S.likelyDuplicates(c).map(([a, b]) => [a.name, b.name].sort().join('/'));
  assert.ok(pairs.includes('Basil/Fresh Basil'), pairs.join(', '));
  assert.ok(pairs.includes('Courgette/Zucchini'), pairs.join(', '));
  assert.deepEqual(c.products.filter(S.hasNoAisle).map((p) => p.name), ['Mystery Mix']);
  const apart = S.markDifferentIn(st, 'gdb-custom-basil', 'gdb-32');
  assert.ok(!S.likelyDuplicates(S.catalogForState(apart)).some(([a, b]) => [a.id, b.id].includes('gdb-custom-basil')));
});

test('reset to built-in: the app\'s own products as they come, yours taken off and unlinked', () => {
  const st = S.normaliseProducts(oldStyle(), 9000);
  const r = S.resetProductsIn(st);
  assert.equal(byId(r, 'gdb-2').increment, 1);
  assert.equal(byId(r, 'gdb-custom-nduja').removed, true);
  assert.equal(byId(r, 'gdb-x-paprika').removed, undefined, 'built-ins you took off come back');
  assert.equal(r.recipes[0].ingredients[0].groceryId, undefined, 'link to your own product taken off');
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
