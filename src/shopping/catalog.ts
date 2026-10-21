/**
 * The product catalogue: one master record per thing you buy.
 *
 * Each grocery-database item (name, aisle, the unit you buy it in and the
 * step it's sold in) is combined with a "spec" describing how recipe amounts
 * relate to it: what it's measured in (grams, millilitres or a count), how big
 * one of each unit is ("a clove of garlic is 5 g", "a can is 400 g"), whether
 * it's a store-cupboard staple, and the other names it goes by.
 *
 * The user's own grocery list (with their edits) is always the source of the
 * name, aisle, buying unit and step; specs only add measurement knowledge.
 */
import type { GroceryItem } from '../types';
import { INITIAL_GROCERY_DATABASE } from '../utils/initialGroceryDb';
import { matchKey, nameWords, IDENTITY_AFTER, IDENTITY_BEFORE, GENERIC_HEADS, DESCRIPTORS } from './names';
import { canonicalUnit, unitInfo, vagueUnit } from './units';
import { aisleCategory, guessAisle, type FoodAisle } from './aisles';

export type Base = 'g' | 'ml' | 'each';

export interface ProductSpec {
  /** What recipe amounts are added up in. */
  base: Base;
  /** Size of a unit in the base, e.g. { clove: 5, can: 400 } for grams. Volume/mass units convert automatically. */
  per?: Record<string, number>;
  /** Grams per millilitre, for converting spoons/cups of solids. */
  density?: number;
  /** Store-cupboard staple: listed with a "check the cupboard" note. */
  cupboard?: boolean;
  aliases?: string[];
  /** This product duplicates another (e.g. Zucchini = Courgette). */
  sameAs?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  /** The Shop aisle it's in (null if nothing says). */
  aisle: FoodAisle | null;
  /** Canonical unit you buy it in ('g', 'can', 'bulb', 'each', ...). */
  buyUnit: string;
  /** How many buy units per step (e.g. 250 g packs, 6 eggs, 1 can). */
  step: number;
  /** Size of one buy unit in the base (e.g. 400 for a 400 g can, 1 for 'g'), or null if unknown. */
  buySize: number | null;
  base: Base;
  per: Record<string, number>;
  density?: number;
  cupboard: boolean;
  sameAs?: string;
  keys: string[];
  item: GroceryItem;
}

// ---------------------------------------------------------------------------
// Specs for the built-in grocery items (by id).
// ---------------------------------------------------------------------------
const herb = (aliases: string[]): ProductSpec => ({
  base: 'g',
  per: { bunch: 30, pack: 30, each: 30, handful: 10, sprig: 1, leaf: 0.2, tbsp: 3, tsp: 1 },
  aliases,
});
const each = (gramsEach: number, aliases: string[] = [], extra: Record<string, number> = {}): ProductSpec => ({
  base: 'each',
  per: { g: 1 / gramsEach, ...extra },
  aliases,
});
const weighed = (
  gramsEach: number | null,
  aliases: string[] = [],
  extra: Record<string, number> = {},
): ProductSpec => ({ base: 'g', per: { ...(gramsEach ? { each: gramsEach } : {}), ...extra }, aliases });
const jar = (grams: number, aliases: string[] = [], cupboard = true): ProductSpec => ({
  base: 'g',
  per: { jar: grams, pack: grams, each: grams, tsp: 2.5, tbsp: 7 },
  cupboard,
  aliases,
});
const liquid = (aliases: string[] = [], per: Record<string, number> = {}, cupboard = false): ProductSpec => ({
  base: 'ml',
  per,
  cupboard,
  aliases,
});

const stock = (aliases: string[]): ProductSpec => ({
  base: 'each',
  cupboard: true,
  per: { pack: 8, cube: 1, each: 1, pot: 1, sachet: 1, ml: 1 / 500 },
  aliases,
});

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
  'gdb-1': weighed(null, ['baby spinach', 'spinach leaf'], { handful: 30, bag: 200 }),
  'gdb-2': {
    base: 'g',
    per: { clove: 5, each: 5, bulb: 50, head: 50, tsp: 5, tbsp: 15 },
    aliases: ['garlic clove', 'clove garlic', 'garlic bulb', 'minced garlic', 'garlic paste'],
  },
  'gdb-3': weighed(150, ['brown onion', 'white onion', 'yellow onion', 'cooking onion']),
  'gdb-4': weighed(150, ['red onion']),
  'gdb-5': weighed(200, [
    'potato',
    'baking potato',
    'jacket potato',
    'maris piper',
    'maris piper potato',
    'king edward',
    'floury potato',
    'waxy potato',
  ]),
  'gdb-6': weighed(250, ['sweet potato']),
  'gdb-7': weighed(350, ['broccoli floret', 'tenderstem broccoli'], { head: 350, floret: 15 }),
  'gdb-8': weighed(160, [
    'bell pepper',
    'red pepper',
    'green pepper',
    'yellow pepper',
    'orange pepper',
    'sweet pepper',
    'bell pepper',
    'romano pepper',
    'mixed pepper',
  ]),
  'gdb-9': weighed(80, ['carrot']),
  'gdb-10': weighed(150, ['avocado']),
  'gdb-11': weighed(100, ['tomato', 'vine tomato', 'salad tomato', 'beef tomato', 'beefsteak tomato']),
  'gdb-12': weighed(15, ['cherry tomato', 'baby plum tomato', 'grape tomato', 'cherry vine tomato'], { pack: 250 }),
  'gdb-13': weighed(300, ['cucumber']),
  'gdb-14': {
    base: 'each',
    per: { head: 1, leaf: 0.08, g: 1 / 300 },
    aliases: ['iceberg lettuce', 'little gem', 'little gem lettuce', 'romaine lettuce', 'cos lettuce', 'gem lettuce'],
  },
  'gdb-15': weighed(
    120,
    [
      'salad mix',
      'salad bag',
      'salad leaf',
      'mixed leaf',
      'mixed salad leaf',
      'salad',
      'rocket',
      'arugula',
      'watercress',
      'baby leaf salad',
      'green salad',
    ],
    { bag: 120, handful: 30 },
  ),
  'gdb-16': weighed(
    20,
    ['mushroom', 'chestnut mushroom', 'button mushroom', 'closed cup mushroom', 'portobello mushroom', 'flat mushroom'],
    { pack: 300 },
  ),
  'gdb-17': weighed(200, ['courgette', 'zucchini']),
  'gdb-18': { base: 'g', sameAs: 'gdb-17' },
  'gdb-19': weighed(250, ['aubergine', 'eggplant']),
  'gdb-20': { base: 'g', sameAs: 'gdb-19' },
  'gdb-21': weighed(600, ['cauliflower floret'], { head: 600, floret: 15 }),
  'gdb-22': weighed(800, ['white cabbage', 'savoy cabbage', 'pointed cabbage', 'sweetheart cabbage'], { head: 800 }),
  'gdb-23': {
    base: 'each',
    per: { stick: 1, each: 1, bunch: 8, head: 8, g: 1 / 40 },
    aliases: ['celery stick', 'celery stalk', 'stick celery'],
  },
  'gdb-24': weighed(250, ['leek']),
  'gdb-25': weighed(20, ['asparagus spear'], { bunch: 250, spear: 20 }),
  'gdb-26': weighed(null, ['green bean', 'fine bean', 'french bean', 'runner bean', 'trimmed green bean']),
  'gdb-27': {
    base: 'each',
    per: { each: 1, stick: 1, bunch: 8, g: 1 / 15 },
    aliases: ['spring onion', 'scallion', 'green onion', 'salad onion'],
  },
  'gdb-28': weighed(50, ['fresh ginger', 'root ginger', 'ginger root', 'grated ginger', 'ginger'], {
    thumb: 15,
    cm: 5,
    tsp: 5,
    tbsp: 15,
  }),
  'gdb-29': each(10, [
    'chilli',
    'red chilli',
    'green chilli',
    'fresh chilli',
    'bird eye chilli',
    'birds eye chilli',
    'jalapeno',
    'scotch bonnet',
    'chilli pepper',
  ]),
  'gdb-30': herb(['fresh coriander', 'cilantro', 'coriander leaf', 'coriander']),
  'gdb-31': herb(['flat leaf parsley', 'fresh parsley', 'curly parsley', 'parsley']),
  'gdb-32': herb(['fresh basil', 'basil leaf', 'basil']),
  'gdb-33': each(120, ['banana']),
  'gdb-34': each(180, ['apple', 'eating apple', 'bramley apple', 'cooking apple']),
  'gdb-35': each(100, ['lemon', 'lemon juice', 'lemon zest', 'unwaxed lemon'], { ml: 1 / 30 }),
  'gdb-36': each(70, ['lime', 'lime juice', 'lime zest'], { ml: 1 / 20 }),
  'gdb-37': each(200, ['orange', 'orange zest'], { ml: 1 / 80 }),
  'gdb-38': weighed(5, ['grape', 'red grape', 'green grape'], { pack: 500, handful: 80 }),
  'gdb-39': weighed(15, ['strawberry'], { pack: 400, handful: 80 }),
  'gdb-40': weighed(null, ['blueberry'], { pack: 150, handful: 50 }),
  'gdb-41': weighed(null, ['raspberry'], { pack: 150, handful: 50 }),
  'gdb-42': each(1000, ['pineapple']),
  'gdb-43': each(300, ['mango']),
  'gdb-44': each(1200, ['melon']),
  'gdb-45': each(75, ['kiwi', 'kiwi fruit']),
  'gdb-46': each(180, ['pear']),
  'gdb-47': each(70, ['plum']),
  'gdb-48': each(150, ['peach', 'nectarine']),
  'gdb-49': { base: 'g', sameAs: 'gdb-50' },
  'gdb-50': weighed(null, ['minced beef', 'ground beef', 'steak mince', 'lean beef mince', 'beef mince']),
  'gdb-51': weighed(150, ['chicken breast', 'chicken breast fillet', 'chicken fillet', 'chicken breast steak'], {
    breast: 150,
    fillet: 150,
  }),
  'gdb-52': weighed(110, ['chicken thigh', 'chicken thigh fillet'], { thigh: 110, fillet: 110 }),
  'gdb-53': each(1500, ['whole chicken', 'roasting chicken', 'whole roast chicken']),
  'gdb-54': weighed(null, ['minced pork', 'ground pork', 'pork mince']),
  'gdb-55': weighed(null, ['minced lamb', 'ground lamb', 'lamb mince']),
  'gdb-56': each(180, ['pork chop', 'pork loin chop'], { chop: 1 }),
  'gdb-57': {
    base: 'each',
    per: { pack: 10, rasher: 1, slice: 1, each: 1, g: 1 / 25 },
    aliases: [
      'bacon rasher',
      'streaky bacon',
      'back bacon',
      'smoked bacon',
      'smoked streaky bacon',
      'smoked back bacon',
    ],
  },
  'gdb-58': {
    base: 'each',
    per: { pack: 6, sausage: 1, each: 1, g: 1 / 67 },
    aliases: ['sausage', 'pork sausage', 'chipolata', 'cumberland sausage'],
  },
  'gdb-59': each(225, ['sirloin steak', 'rump steak', 'ribeye steak', 'rib eye steak', 'fillet steak', 'beef steak'], {
    steak: 1,
  }),
  'gdb-60': weighed(null, ['minced turkey', 'ground turkey', 'turkey mince']),
  'gdb-61': weighed(null, [
    'stewing beef',
    'braising steak',
    'casserole beef',
    'beef stewing steak',
    'beef chuck',
    'diced beef',
  ]),
  'gdb-62': weighed(null, ['chicken piece', 'chicken chunk', 'chicken mini fillet', 'diced chicken']),
  'gdb-63': each(120, ['salmon fillet', 'salmon', 'salmon steak', 'skinless salmon fillet'], { fillet: 1 }),
  'gdb-64': each(140, ['cod', 'cod fillet', 'cod loin'], { fillet: 1 }),
  'gdb-65': weighed(null, [
    'prawn',
    'king prawn',
    'raw prawn',
    'cooked prawn',
    'tiger prawn',
    'shrimp',
    'raw king prawn',
  ]),
  'gdb-66': weighed(null, ['tuna', 'tinned tuna', 'canned tuna', 'tuna chunk', 'tuna in spring water', 'tin tuna'], {
    can: 145,
  }),
  'gdb-67': weighed(null, ['smoked salmon'], { pack: 100 }),
  'gdb-68': each(100, ['mackerel fillet', 'smoked mackerel', 'mackerel'], { fillet: 1 }),
  'gdb-69': each(140, ['haddock', 'haddock fillet', 'smoked haddock'], { fillet: 1 }),
  'gdb-70': weighed(
    null,
    ['cheddar', 'mature cheddar', 'grated cheddar', 'extra mature cheddar', 'cheddar cheese', 'mild cheddar'],
    { cup: 100, handful: 30, tbsp: 7 },
  ),
  'gdb-71': weighed(125, ['mozzarella ball', 'buffalo mozzarella', 'mozzarella'], { ball: 125, pack: 125 }),
  'gdb-72': weighed(
    null,
    ['parmesan cheese', 'parmigiano reggiano', 'grana padano', 'vegetarian italian hard cheese', 'parmesan'],
    { tbsp: 5, cup: 80, handful: 20 },
  ),
  'gdb-73': weighed(225, ['halloumi'], { pack: 225, block: 225 }),
  'gdb-74': weighed(200, ['feta'], { pack: 200, block: 200 }),
  'gdb-75': {
    base: 'g',
    per: { pack: 180, tub: 180, each: 180, tbsp: 15 },
    aliases: ['cream cheese', 'soft cheese', 'full fat soft cheese', 'light soft cheese', 'philadelphia'],
  },
  'gdb-76': liquid(['light cream', 'single cream'], { pot: 150 }),
  'gdb-77': liquid(['heavy cream', 'whipping cream', 'double cream'], { pot: 150 }),
  'gdb-78': liquid(['soured cream', 'sour cream'], { pack: 300, pot: 300, tub: 300 }),
  'gdb-79': liquid(['whole milk', 'semi skimmed milk', 'skimmed milk', 'milk'], { pint: 568 }),
  'gdb-80': {
    base: 'g',
    density: 0.96,
    per: { knob: 15, tbsp: 14, tsp: 5, pack: 250, block: 250 },
    aliases: ['unsalted butter', 'salted butter', 'butter'],
  },
  'gdb-81': {
    base: 'each',
    per: { egg: 1, each: 1, g: 1 / 55 },
    aliases: ['egg', 'free range egg', 'large egg', 'medium egg', 'egg yolk', 'egg white'],
  },
  'gdb-82': {
    base: 'g',
    per: { pack: 500, pot: 500, tub: 500, each: 500 },
    aliases: ['natural yogurt', 'plain yogurt', 'yogurt'],
  },
  'gdb-83': {
    base: 'g',
    per: { pack: 500, pot: 500, tub: 500, each: 500 },
    aliases: ['greek style yogurt', 'greek yogurt', 'fat free greek yogurt'],
  },
  'gdb-84': liquid(['oat milk'], { carton: 1000 }),
  'gdb-85': liquid(['almond milk'], { carton: 1000 }),
  'gdb-86': {
    base: 'each',
    per: { loaf: 1, each: 1, slice: 1 / 20, g: 1 / 800 },
    aliases: ['loaf', 'sliced bread', 'white bread', 'wholemeal bread', 'sourdough', 'sourdough bread', 'bread'],
  },
  'gdb-87': {
    base: 'each',
    per: { pack: 8, wrap: 1, each: 1 },
    aliases: ['tortilla', 'wrap', 'flour tortilla', 'tortilla wrap'],
  },
  'gdb-88': { base: 'each', per: { pack: 6, each: 1 }, aliases: ['pitta', 'pitta bread', 'pita'] },
  'gdb-89': { base: 'each', per: { pack: 5, each: 1 }, aliases: ['bagel'] },
  'gdb-90': { base: 'each', per: { pack: 4, each: 1 }, aliases: ['croissant'] },
  'gdb-91': {
    base: 'each',
    per: { pack: 6, roll: 1, each: 1 },
    aliases: ['bread roll', 'burger bun', 'roll', 'bun', 'sub roll', 'crusty roll'],
  },
  'gdb-92': { base: 'g', cupboard: true, aliases: ['spaghetti'] },
  'gdb-93': { base: 'g', cupboard: true, aliases: ['penne'] },
  'gdb-94': { base: 'g', cupboard: true, aliases: ['fusilli'] },
  'gdb-95': { base: 'g', cupboard: true, aliases: ['macaroni'] },
  'gdb-96': {
    base: 'g',
    per: { pack: 300, nest: 50, each: 50 },
    aliases: [
      'egg noodle',
      'rice noodle',
      'udon noodle',
      'noodle nest',
      'straight to wok noodle',
      'fine egg noodle',
      'noodle',
    ],
  },
  'gdb-97': {
    base: 'each',
    cupboard: true,
    per: { pack: 18, sheet: 1, each: 1, g: 1 / 20 },
    aliases: ['lasagne sheet', 'lasagna sheet', 'dried lasagne sheet'],
  },
  'gdb-98': {
    base: 'g',
    cupboard: true,
    per: { cup: 185 },
    aliases: ['jasmine rice', 'thai jasmine rice', 'thai rice'],
  },
  'gdb-99': {
    base: 'g',
    cupboard: true,
    per: { cup: 185 },
    aliases: ['basmati rice', 'basmati', 'rice', 'long grain rice', 'white rice', 'easy cook rice'],
  },
  'gdb-100': { base: 'g', cupboard: true, per: { cup: 185 }, aliases: ['brown rice', 'wholegrain rice'] },
  'gdb-101': { base: 'g', cupboard: true, per: { cup: 170 }, aliases: ['quinoa'] },
  'gdb-102': { base: 'g', cupboard: true, per: { cup: 180 }, aliases: ['couscous', 'giant couscous'] },
  'gdb-103': { base: 'g', cupboard: true, per: { cup: 90 }, aliases: ['porridge oat', 'rolled oat', 'oat'] },
  'gdb-104': { base: 'each', per: { box: 1, each: 1 }, aliases: ['cereal'] },
  'gdb-105': {
    base: 'g',
    per: { can: 400, carton: 390 },
    aliases: [
      'chopped tomato',
      'tinned tomato',
      'canned tomato',
      'tin tomato',
      'can tomato',
      'tinned chopped tomato',
      'canned chopped tomato',
      'can chopped tomato',
      'tin chopped tomato',
      'crushed tomato',
      'diced tomato',
      'chopped tinned tomato',
    ],
  },
  'gdb-106': {
    base: 'g',
    per: { can: 400 },
    aliases: ['plum tomato', 'whole plum tomato', 'tinned plum tomato', 'canned plum tomato', 'tinned whole tomato'],
  },
  'gdb-107': {
    base: 'g',
    density: 1,
    per: { carton: 500, jar: 500, bottle: 500, each: 500 },
    aliases: ['passata', 'sieved tomato', 'tomato passata'],
  },
  'gdb-108': { base: 'g', per: { can: 415 }, aliases: ['baked bean'] },
  'gdb-109': { base: 'g', per: { can: 400 }, aliases: ['kidney bean', 'red kidney bean'] },
  'gdb-110': { base: 'g', per: { can: 400 }, aliases: ['black bean'] },
  'gdb-111': { base: 'g', per: { can: 400 }, aliases: ['chickpea', 'garbanzo bean', 'tinned chickpea'] },
  'gdb-112': {
    base: 'g',
    per: { can: 325, cup: 160 },
    aliases: ['sweetcorn', 'sweetcorn kernel', 'corn', 'tinned sweetcorn', 'corn kernel'],
  },
  'gdb-113': {
    base: 'ml',
    per: { can: 400 },
    aliases: ['coconut milk', 'light coconut milk', 'reduced fat coconut milk', 'tinned coconut milk'],
  },
  'gdb-114': {
    base: 'g',
    cupboard: true,
    per: { tube: 200, each: 200, tbsp: 16, tsp: 5 },
    aliases: ['tomato puree', 'tomato paste', 'double concentrated tomato puree'],
  },
  'gdb-115': {
    base: 'g',
    per: { jar: 190, each: 190, tbsp: 15 },
    aliases: ['pesto', 'basil pesto', 'green pesto', 'red pesto'],
  },
  'gdb-116': {
    base: 'g',
    per: { jar: 500, each: 500 },
    aliases: ['pasta sauce', 'tomato pasta sauce', 'bolognese sauce'],
  },
  'gdb-117': {
    base: 'g',
    per: { jar: 283, each: 283, tbsp: 15, tsp: 5 },
    aliases: [
      'curry paste',
      'balti paste',
      'madras paste',
      'rogan josh paste',
      'jalfrezi paste',
      'bhuna paste',
      'vindaloo paste',
    ],
  },
  'gdb-118': jar(340, ['peanut butter', 'smooth peanut butter', 'crunchy peanut butter']),
  'gdb-119': jar(340, ['jam', 'strawberry jam', 'raspberry jam']),
  'gdb-120': {
    base: 'g',
    density: 1.4,
    cupboard: true,
    per: { jar: 340, bottle: 340, each: 340 },
    aliases: ['honey', 'runny honey', 'clear honey'],
  },
  'gdb-121': liquid(['olive oil', 'extra virgin olive oil', 'light olive oil', 'evoo'], { bottle: 500 }, true),
  'gdb-122': liquid(['vegetable oil', 'oil', 'cooking oil', 'rapeseed oil', 'neutral oil'], { bottle: 1000 }, true),
  'gdb-123': liquid(['sunflower oil'], { bottle: 1000 }, true),
  'gdb-124': liquid(
    ['soy sauce', 'light soy sauce', 'dark soy sauce', 'soy', 'tamari', 'reduced salt soy sauce'],
    { bottle: 150 },
    true,
  ),
  'gdb-125': liquid(['balsamic vinegar', 'balsamic', 'balsamic glaze'], { bottle: 250 }, true),
  'gdb-126': liquid(['white wine vinegar', 'vinegar'], { bottle: 350 }, true),
  'gdb-127': liquid(['ketchup', 'tomato ketchup'], { bottle: 460 }, true),
  'gdb-128': jar(400, ['mayonnaise', 'mayo', 'light mayonnaise']),
  'gdb-129': jar(185, ['mustard', 'dijon mustard', 'wholegrain mustard', 'english mustard', 'dijon']),
  'gdb-130': liquid(['hot sauce', 'sriracha', 'tabasco', 'chilli sauce', 'hot chilli sauce'], { bottle: 150 }, true),
  'gdb-131': {
    base: 'g',
    density: 1.2,
    cupboard: true,
    per: { pinch: 0.5, each: 500 },
    aliases: [
      'salt',
      'sea salt',
      'table salt',
      'salt and pepper',
      'salt and black pepper',
      'sea salt flake',
      'kosher salt',
      'salt flake',
    ],
  },
  'gdb-132': {
    base: 'g',
    density: 0.5,
    cupboard: true,
    per: { pinch: 0.25, each: 100 },
    aliases: [
      'black pepper',
      'pepper',
      'ground black pepper',
      'black peppercorn',
      'white pepper',
      'cracked black pepper',
      'freshly ground black pepper',
    ],
  },
  'gdb-133': {
    base: 'g',
    density: 0.55,
    cupboard: true,
    per: { cup: 125 },
    aliases: ['flour', 'plain flour', 'plain white flour', 'all purpose flour'],
  },
  'gdb-134': {
    base: 'g',
    density: 0.85,
    cupboard: true,
    per: { cup: 200 },
    aliases: ['sugar', 'granulated sugar', 'white sugar', 'golden granulated sugar'],
  },
  'gdb-135': {
    base: 'g',
    density: 0.8,
    cupboard: true,
    per: { cup: 200 },
    aliases: [
      'brown sugar',
      'light brown sugar',
      'dark brown sugar',
      'soft brown sugar',
      'light muscovado sugar',
      'dark muscovado sugar',
      'muscovado sugar',
      'demerara sugar',
    ],
  },
  'gdb-136': stock([
    'stock cube',
    'stock',
    'stock pot',
    'vegetable stock',
    'veg stock',
    'vegetable stock cube',
    'vegetable stock pot',
    'hot vegetable stock',
    'bouillon',
    'vegetable bouillon',
    'vegetable broth',
  ]),
  'gdb-137': weighed(null, ['frozen pea', 'pea', 'garden pea', 'petit pois'], { cup: 150, handful: 40 }),
  'gdb-138': weighed(null, ['frozen chip', 'oven chip', 'chip']),
  'gdb-139': { base: 'each', per: { each: 1 }, aliases: ['frozen pizza', 'pizza'] },
  'gdb-140': { base: 'each', per: { tub: 1, each: 1 }, aliases: ['ice cream'] },
  'gdb-141': weighed(null, ['mixed veg', 'mixed vegetable', 'frozen mixed vegetable', 'frozen vegetable']),
  'gdb-142': weighed(null, ['frozen berry', 'mixed berry', 'frozen fruit', 'frozen mixed berry']),
  'gdb-150': liquid(['orange juice', 'fresh orange juice'], { carton: 1000 }),
  'gdb-151': liquid(['apple juice'], { carton: 1000 }),
  'gdb-155': liquid(['wine', 'red wine', 'dry red wine', 'red cooking wine'], { bottle: 750 }),
  // UK names; the old ones are kept as other names so lists and recipes still find them.
  'gdb-153': {
    base: 'each',
    per: { bottle: 1, can: 1, each: 1 },
    aliases: ['soda', 'fizzy drink', 'soft drink', 'cola', 'lemonade', 'pop'],
  },
  'gdb-156': { base: 'each', per: { pack: 1, each: 1 }, aliases: ['toilet paper', 'toilet roll', 'loo roll'] },
  'gdb-158': {
    base: 'each',
    per: { bottle: 1, each: 1 },
    aliases: ['dish soap', 'washing up liquid', 'dishwashing liquid'],
  },
  'gdb-160': {
    base: 'each',
    per: { bottle: 1, pack: 1, each: 1 },
    aliases: [
      'laundry detergent',
      'washing liquid',
      'laundry liquid',
      'washing powder',
      'laundry powder',
      'washing capsule',
      'laundry capsule',
    ],
  },
  'gdb-161': { base: 'each', per: { bottle: 1, each: 1 }, aliases: ['fabric softener', 'fabric conditioner'] },
  'gdb-165': { base: 'each', per: { bottle: 1, each: 1 }, aliases: ['body wash', 'shower gel'] },
  'gdb-167': { base: 'each', per: { can: 1, each: 1 }, aliases: ['deodorant', 'antiperspirant', 'deodorant spray'] },
  'gdb-168': { base: 'g', sameAs: 'gdb-137' },
};

// ---------------------------------------------------------------------------
// Products added in catalogue version 2 (common recipe ingredients that were missing).
// ---------------------------------------------------------------------------
interface ExtraProduct {
  item: GroceryItem;
  spec: ProductSpec;
}
const spice = (id: string, name: string, aliases: string[], grams = 40): ExtraProduct => ({
  item: { id, name, unit: 'jar', increment: 1, category: 'Pantry' },
  spec: { base: 'g', cupboard: true, per: { jar: grams, each: grams, tsp: 2.5, tbsp: 7.5, pinch: 0.25 }, aliases },
});
const extra = (
  id: string,
  name: string,
  unit: string,
  increment: number,
  category: string,
  spec: ProductSpec,
): ExtraProduct => ({
  item: { id, name, unit, increment, category },
  spec,
});
// The Shop's aisle names (src/shopping/aisles.ts), for products added since.
const PRODUCE = 'Fresh Produce';
const BAKERY = 'Bakery & Bread';
const MEAT = 'Meat & Seafood';
const DAIRY = 'Dairy, Chilled & Eggs';
const GRAINS = 'Pasta, Rice & Grains';
const CANNED = 'Canned & Jarred Goods';
const PANTRY = 'Pantry, Oils & Spices';
const FROZEN = 'Frozen Foods';
const HOUSEHOLD = 'Household & Other';

export const EXTRA_PRODUCTS: ExtraProduct[] = [
  spice('gdb-x-ground-cumin', 'Ground Cumin', ['cumin', 'cumin powder', 'ground cumin']),
  spice('gdb-x-cumin-seeds', 'Cumin Seeds', ['cumin seed']),
  spice('gdb-x-paprika', 'Paprika', ['sweet paprika', 'paprika']),
  spice('gdb-x-smoked-paprika', 'Smoked Paprika', ['smoked sweet paprika', 'pimenton', 'hot smoked paprika']),
  spice('gdb-x-chilli-powder', 'Chilli Powder', ['hot chilli powder', 'mild chilli powder', 'chili powder']),
  spice('gdb-x-chilli-flakes', 'Chilli Flakes', [
    'dried chilli flake',
    'red pepper flake',
    'crushed chilli',
    'crushed red pepper',
    'chilli flake',
  ]),
  spice('gdb-x-turmeric', 'Ground Turmeric', ['turmeric', 'turmeric powder']),
  spice('gdb-x-garam-masala', 'Garam Masala', ['garam masala']),
  spice('gdb-x-curry-powder', 'Curry Powder', [
    'medium curry powder',
    'mild curry powder',
    'madras curry powder',
    'hot curry powder',
  ]),
  spice('gdb-x-ground-coriander', 'Ground Coriander', ['coriander powder', 'ground coriander']),
  spice('gdb-x-coriander-seeds', 'Coriander Seeds', ['coriander seed']),
  spice('gdb-x-oregano', 'Dried Oregano', ['oregano', 'dried oregano']),
  spice('gdb-x-mixed-herbs', 'Mixed Herbs', [
    'dried mixed herb',
    'italian seasoning',
    'herbes de provence',
    'italian herb',
    'dried herb',
  ]),
  spice('gdb-x-dried-thyme', 'Dried Thyme', ['dried thyme']),
  spice('gdb-x-dried-basil', 'Dried Basil', ['dried basil']),
  spice('gdb-x-dried-parsley', 'Dried Parsley', ['dried parsley']),
  spice('gdb-x-cinnamon', 'Ground Cinnamon', ['cinnamon', 'cinnamon powder', 'cinnamon stick']),
  spice('gdb-x-ground-ginger', 'Ground Ginger', ['ground ginger', 'ginger powder']),
  spice('gdb-x-nutmeg', 'Ground Nutmeg', ['nutmeg', 'grated nutmeg']),
  spice('gdb-x-bay-leaves', 'Bay Leaves', ['bay leaf', 'dried bay leaf', 'fresh bay leaf'], 5),
  spice('gdb-x-cayenne', 'Cayenne Pepper', ['cayenne', 'cayenne pepper']),
  spice('gdb-x-five-spice', 'Chinese Five Spice', ['five spice', 'five spice powder', 'chinese five spice powder']),
  spice('gdb-x-garlic-powder', 'Garlic Powder', ['garlic granule', 'garlic powder']),
  spice('gdb-x-onion-powder', 'Onion Powder', ['onion granule', 'onion powder']),
  spice('gdb-x-mixed-spice', 'Mixed Spice', ['mixed spice', 'allspice', 'ground allspice']),
  spice('gdb-x-fennel-seeds', 'Fennel Seeds', ['fennel seed']),
  spice('gdb-x-sesame-seeds', 'Sesame Seeds', ['sesame seed', 'toasted sesame seed'], 100),
  extra('gdb-x-vanilla', 'Vanilla Extract', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 38 },
    aliases: ['vanilla essence', 'vanilla', 'vanilla bean paste'],
  }),
  extra('gdb-x-baking-powder', 'Baking Powder', 'tub', 1, 'Pantry', {
    base: 'g',
    density: 0.9,
    cupboard: true,
    per: { tub: 170 },
    aliases: ['baking powder'],
  }),
  extra('gdb-x-bicarb', 'Bicarbonate of Soda', 'tub', 1, 'Pantry', {
    base: 'g',
    density: 1.1,
    cupboard: true,
    per: { tub: 200 },
    aliases: ['baking soda', 'bicarb', 'bicarbonate soda', 'bicarb soda'],
  }),
  extra('gdb-x-cornflour', 'Cornflour', 'g', 500, 'Pantry', {
    base: 'g',
    density: 0.6,
    cupboard: true,
    aliases: ['cornstarch', 'corn flour', 'cornflour'],
  }),
  extra('gdb-x-worcestershire', 'Worcestershire Sauce', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 150 },
    aliases: ['worcestershire sauce', 'worcester sauce'],
  }),
  extra('gdb-x-sweet-chilli', 'Sweet Chilli Sauce', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 300 },
    aliases: ['sweet chilli sauce', 'sweet chili sauce'],
  }),
  extra('gdb-x-fish-sauce', 'Fish Sauce', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 200 },
    aliases: ['fish sauce', 'nam pla', 'thai fish sauce'],
  }),
  extra('gdb-x-oyster-sauce', 'Oyster Sauce', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 150 },
    aliases: ['oyster sauce'],
  }),
  extra('gdb-x-hoisin', 'Hoisin Sauce', 'jar', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { jar: 200, bottle: 200 },
    aliases: ['hoisin sauce', 'hoisin'],
  }),
  extra('gdb-x-sesame-oil', 'Sesame Oil', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 250 },
    aliases: ['sesame oil', 'toasted sesame oil'],
  }),
  extra('gdb-x-red-wine-vinegar', 'Red Wine Vinegar', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 350 },
    aliases: ['red wine vinegar'],
  }),
  extra('gdb-x-cider-vinegar', 'Cider Vinegar', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 350 },
    aliases: ['apple cider vinegar', 'cider vinegar'],
  }),
  extra('gdb-x-rice-vinegar', 'Rice Vinegar', 'bottle', 1, 'Pantry', {
    base: 'ml',
    cupboard: true,
    per: { bottle: 150 },
    aliases: ['rice wine vinegar', 'rice vinegar'],
  }),
  extra('gdb-x-gravy', 'Gravy Granules', 'tub', 1, 'Pantry', {
    base: 'g',
    cupboard: true,
    per: { tub: 200, tbsp: 10, tsp: 3 },
    aliases: ['gravy granule', 'gravy'],
  }),
  extra('gdb-x-lentils', 'Lentils', 'g', 500, 'Pantry', {
    base: 'g',
    cupboard: true,
    per: { cup: 190 },
    aliases: ['red lentil', 'green lentil', 'puy lentil', 'dried red lentil', 'split red lentil', 'lentil'],
  }),
  extra('gdb-x-pasta', 'Pasta', 'g', 500, 'Pasta', {
    base: 'g',
    cupboard: true,
    per: { cup: 100 },
    aliases: [
      'pasta',
      'dried pasta',
      'pasta shape',
      'rigatoni',
      'farfalle',
      'tagliatelle',
      'linguine',
      'conchiglie',
      'orzo',
    ],
  }),
  extra('gdb-x-breadcrumbs', 'Breadcrumbs', 'g', 200, 'Pantry', {
    base: 'g',
    cupboard: true,
    per: { cup: 60, tbsp: 7 },
    aliases: ['breadcrumb', 'panko', 'panko breadcrumb', 'dried breadcrumb'],
  }),
  extra('gdb-x-creme-fraiche', 'Crème Fraîche', 'pot', 1, 'Dairy', {
    base: 'ml',
    per: { pot: 200, tub: 200, each: 200 },
    aliases: ['creme fraiche', 'half fat creme fraiche', 'reduced fat creme fraiche'],
  }),
  extra('gdb-x-ricotta', 'Ricotta', 'tub', 1, 'Dairy', {
    base: 'g',
    per: { tub: 250, each: 250 },
    aliases: ['ricotta'],
  }),
  extra('gdb-x-mascarpone', 'Mascarpone', 'tub', 1, 'Dairy', {
    base: 'g',
    per: { tub: 250, each: 250 },
    aliases: ['mascarpone'],
  }),
  extra('gdb-x-chorizo', 'Chorizo', 'pack', 1, 'Meat', {
    base: 'g',
    per: { pack: 200, ring: 225, each: 200, slice: 5 },
    aliases: ['chorizo', 'chorizo sausage', 'cooking chorizo', 'chorizo ring', 'sliced chorizo'],
  }),
  extra('gdb-x-pancetta', 'Pancetta', 'pack', 1, 'Meat', {
    base: 'g',
    per: { pack: 130, each: 130 },
    aliases: ['pancetta', 'cubetti di pancetta', 'pancetta cube', 'diced pancetta', 'lardon', 'bacon lardon'],
  }),
  extra('gdb-x-tofu', 'Tofu', 'pack', 1, 'Dairy', {
    base: 'g',
    per: { pack: 280, block: 280, each: 280 },
    aliases: ['firm tofu', 'extra firm tofu', 'tofu'],
  }),
  extra('gdb-x-gnocchi', 'Gnocchi', 'pack', 1, 'Pasta', {
    base: 'g',
    per: { pack: 500, each: 500 },
    aliases: ['gnocchi', 'potato gnocchi'],
  }),
  extra('gdb-x-naan', 'Naan Bread', 'pack', 1, 'Bakery', {
    base: 'each',
    per: { pack: 2, each: 1 },
    aliases: ['naan', 'naan bread', 'garlic naan', 'plain naan'],
  }),
  extra('gdb-x-puff-pastry', 'Puff Pastry', 'pack', 1, 'Bakery', {
    base: 'each',
    per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 },
    aliases: ['puff pastry', 'ready rolled puff pastry', 'all butter puff pastry'],
  }),
  extra('gdb-x-shortcrust', 'Shortcrust Pastry', 'pack', 1, 'Bakery', {
    base: 'each',
    per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 },
    aliases: ['shortcrust pastry', 'ready rolled shortcrust pastry'],
  }),
  extra('gdb-x-shallots', 'Shallots', 'pack', 1, 'Produce', {
    base: 'g',
    per: { each: 30, pack: 250 },
    aliases: ['shallot', 'banana shallot'],
  }),
  extra('gdb-x-butternut', 'Butternut Squash', 'whole', 1, 'Produce', {
    base: 'g',
    per: { each: 1000 },
    aliases: ['butternut squash', 'squash'],
  }),
  extra('gdb-x-kale', 'Kale', 'g', 200, 'Produce', {
    base: 'g',
    per: { bag: 200, handful: 30 },
    aliases: ['kale', 'cavolo nero', 'curly kale', 'spring green'],
  }),
  extra('gdb-x-pak-choi', 'Pak Choi', 'whole', 1, 'Produce', {
    base: 'each',
    per: { each: 1, head: 1, g: 1 / 120 },
    aliases: ['pak choi', 'bok choy', 'pak choy', 'bok choi'],
  }),
  extra(
    'gdb-x-fresh-thyme',
    'Fresh Thyme',
    'pack',
    1,
    'Produce',
    herb(['thyme', 'fresh thyme', 'thyme sprig', 'thyme leaf']),
  ),
  extra(
    'gdb-x-fresh-rosemary',
    'Fresh Rosemary',
    'pack',
    1,
    'Produce',
    herb(['rosemary', 'fresh rosemary', 'rosemary sprig']),
  ),
  extra('gdb-x-fresh-mint', 'Fresh Mint', 'bunch', 1, 'Produce', herb(['mint', 'fresh mint', 'mint leaf'])),
  extra('gdb-x-chives', 'Chives', 'pack', 1, 'Produce', herb(['chive', 'fresh chive', 'snipped chive'])),
  extra('gdb-x-dill', 'Dill', 'pack', 1, 'Produce', herb(['dill', 'fresh dill'])),
  extra('gdb-x-pine-nuts', 'Pine Nuts', 'pack', 1, 'Pantry', {
    base: 'g',
    per: { pack: 100, each: 100, tbsp: 9 },
    aliases: ['pine nut', 'toasted pine nut'],
  }),
  extra('gdb-x-coconut-cream', 'Coconut Cream', 'carton', 1, 'Canned', {
    base: 'ml',
    per: { carton: 200, can: 400 },
    aliases: ['coconut cream', 'creamed coconut'],
  }),

  // Catalogue version 4: things that were one product but you buy separately...
  extra('gdb-x-self-raising-flour', 'Self-Raising Flour', 'kg', 1.5, PANTRY, {
    base: 'g',
    density: 0.55,
    cupboard: true,
    per: { cup: 125 },
    aliases: ['self raising flour', 'self rising flour', 'sr flour'],
  }),
  extra('gdb-x-strong-flour', 'Strong White Bread Flour', 'kg', 1.5, PANTRY, {
    base: 'g',
    density: 0.55,
    cupboard: true,
    per: { cup: 125 },
    aliases: ['strong white bread flour', 'strong bread flour', 'bread flour', 'strong white flour', 'strong flour'],
  }),
  extra('gdb-x-wholemeal-flour', 'Wholemeal Flour', 'kg', 1.5, PANTRY, {
    base: 'g',
    density: 0.55,
    cupboard: true,
    per: { cup: 125 },
    aliases: ['wholemeal flour', 'wholemeal bread flour', 'whole wheat flour', 'wholewheat flour'],
  }),
  extra('gdb-x-caster-sugar', 'Caster Sugar', 'kg', 1, PANTRY, {
    base: 'g',
    density: 0.85,
    cupboard: true,
    per: { cup: 200 },
    aliases: ['caster sugar', 'golden caster sugar', 'superfine sugar'],
  }),
  extra('gdb-x-icing-sugar', 'Icing Sugar', 'g', 500, PANTRY, {
    base: 'g',
    density: 0.56,
    cupboard: true,
    per: { cup: 120 },
    aliases: ['icing sugar', 'powdered sugar', 'confectioners sugar'],
  }),
  extra(
    'gdb-x-chicken-stock',
    'Chicken Stock Cubes',
    'pack',
    1,
    PANTRY,
    stock([
      'chicken stock',
      'chicken stock cube',
      'chicken stock pot',
      'hot chicken stock',
      'chicken broth',
      'chicken bouillon',
    ]),
  ),
  extra(
    'gdb-x-beef-stock',
    'Beef Stock Cubes',
    'pack',
    1,
    PANTRY,
    stock(['beef stock', 'beef stock cube', 'beef stock pot', 'hot beef stock', 'beef broth']),
  ),
  extra(
    'gdb-x-lamb-stock',
    'Lamb Stock Cubes',
    'pack',
    1,
    PANTRY,
    stock(['lamb stock', 'lamb stock cube', 'lamb stock pot', 'hot lamb stock']),
  ),
  extra(
    'gdb-x-fish-stock',
    'Fish Stock Cubes',
    'pack',
    1,
    PANTRY,
    stock(['fish stock', 'fish stock cube', 'fish stock pot', 'hot fish stock']),
  ),
  extra(
    'gdb-x-white-wine',
    'White Wine',
    'bottle',
    1,
    PANTRY,
    liquid(['white wine', 'dry white wine', 'white cooking wine'], { bottle: 750 }),
  ),
  extra('gdb-x-tikka-paste', 'Tikka Masala Paste', 'jar', 1, CANNED, {
    base: 'g',
    per: { jar: 283, each: 283, tbsp: 15, tsp: 5 },
    aliases: ['tikka paste', 'tikka masala paste', 'tikka curry paste'],
  }),
  extra('gdb-x-korma-paste', 'Korma Paste', 'jar', 1, CANNED, {
    base: 'g',
    per: { jar: 290, each: 290, tbsp: 15, tsp: 5 },
    aliases: ['korma paste', 'korma curry paste'],
  }),
  extra('gdb-x-thai-green-paste', 'Thai Green Curry Paste', 'jar', 1, CANNED, {
    base: 'g',
    per: { jar: 190, each: 190, tbsp: 15, tsp: 5 },
    aliases: ['thai green curry paste', 'green curry paste', 'green thai curry paste'],
  }),
  extra('gdb-x-thai-red-paste', 'Thai Red Curry Paste', 'jar', 1, CANNED, {
    base: 'g',
    per: { jar: 190, each: 190, tbsp: 15, tsp: 5 },
    aliases: ['thai red curry paste', 'red curry paste', 'red thai curry paste'],
  }),

  // ...and UK staples that were missing. Fresh produce:
  extra(
    'gdb-x-baby-potatoes',
    'Baby Potatoes',
    'kg',
    1,
    PRODUCE,
    weighed(40, ['baby potato', 'new potato', 'charlotte potato', 'salad potato', 'jersey royal']),
  ),
  extra('gdb-x-parsnips', 'Parsnips', 'g', 500, PRODUCE, weighed(150, ['parsnip'])),
  extra('gdb-x-swede', 'Swede', 'whole', 1, PRODUCE, weighed(800, ['swede', 'rutabaga'])),
  extra('gdb-x-sprouts', 'Brussels Sprouts', 'g', 500, PRODUCE, weighed(15, ['brussels sprout', 'sprout'])),
  extra('gdb-x-beetroot', 'Cooked Beetroot', 'pack', 1, PRODUCE, {
    base: 'g',
    per: { pack: 250, each: 60 },
    aliases: ['beetroot', 'cooked beetroot', 'beet'],
  }),
  extra('gdb-x-mangetout', 'Mangetout', 'pack', 1, PRODUCE, {
    base: 'g',
    per: { pack: 150, handful: 40 },
    aliases: ['mangetout', 'mange tout', 'snow pea'],
  }),
  extra('gdb-x-sugar-snaps', 'Sugar Snap Peas', 'pack', 1, PRODUCE, {
    base: 'g',
    per: { pack: 150, handful: 40 },
    aliases: ['sugar snap pea', 'sugar snap', 'sugarsnap pea'],
  }),
  extra('gdb-x-red-cabbage', 'Red Cabbage', 'head', 1, PRODUCE, weighed(900, ['red cabbage'], { head: 900 })),
  extra('gdb-x-baby-corn', 'Baby Corn', 'pack', 1, PRODUCE, {
    base: 'g',
    per: { pack: 125, each: 10 },
    aliases: ['baby corn', 'baby sweetcorn'],
  }),
  extra('gdb-x-bean-sprouts', 'Bean Sprouts', 'bag', 1, PRODUCE, {
    base: 'g',
    per: { bag: 300, pack: 300, handful: 40 },
    aliases: ['bean sprout', 'beansprout'],
  }),
  // Meat and fish:
  extra('gdb-x-gammon', 'Gammon Steaks', 'pack', 1, MEAT, {
    base: 'each',
    per: { pack: 2, steak: 1, each: 1, g: 1 / 150 },
    aliases: ['gammon', 'gammon steak'],
  }),
  extra('gdb-x-ham', 'Sliced Ham', 'pack', 1, MEAT, {
    base: 'g',
    per: { pack: 125, slice: 15, each: 15 },
    aliases: ['ham', 'sliced ham', 'cooked ham', 'ham slice', 'wafer thin ham', 'honey roast ham'],
  }),
  extra(
    'gdb-x-drumsticks',
    'Chicken Drumsticks',
    'kg',
    1,
    MEAT,
    weighed(110, ['chicken drumstick', 'drumstick'], { drumstick: 110 }),
  ),
  extra('gdb-x-wings', 'Chicken Wings', 'kg', 1, MEAT, weighed(90, ['chicken wing'], { wing: 90 })),
  extra(
    'gdb-x-lamb-chops',
    'Lamb Chops',
    'chop',
    1,
    MEAT,
    each(100, ['lamb chop', 'lamb cutlet', 'lamb loin chop'], { chop: 1 }),
  ),
  extra(
    'gdb-x-lamb-joint',
    'Lamb Joint',
    'whole',
    1,
    MEAT,
    each(1500, ['lamb joint', 'leg of lamb', 'lamb leg', 'lamb shoulder', 'shoulder of lamb']),
  ),
  extra(
    'gdb-x-beef-joint',
    'Beef Roasting Joint',
    'whole',
    1,
    MEAT,
    each(1000, ['beef joint', 'beef roasting joint', 'roast beef joint', 'topside', 'topside of beef', 'silverside']),
  ),
  extra(
    'gdb-x-pork-joint',
    'Pork Joint',
    'whole',
    1,
    MEAT,
    each(1000, ['pork joint', 'pork shoulder', 'pork loin joint', 'pork belly', 'pork leg joint']),
  ),
  extra('gdb-x-burgers', 'Beef Burgers', 'pack', 1, MEAT, {
    base: 'each',
    per: { pack: 4, burger: 1, each: 1, g: 1 / 113 },
    aliases: ['beef burger', 'quarter pounder', 'burger patty'],
  }),
  extra('gdb-x-meatballs', 'Beef Meatballs', 'pack', 1, MEAT, {
    base: 'each',
    per: { pack: 12, meatball: 1, each: 1, g: 1 / 28 },
    aliases: ['meatball', 'beef meatball'],
  }),
  extra('gdb-x-fish-fingers', 'Fish Fingers', 'pack', 1, FROZEN, {
    base: 'each',
    per: { pack: 10, finger: 1, each: 1 },
    aliases: ['fish finger'],
  }),
  // Dairy and chilled:
  extra('gdb-x-grated-mozzarella', 'Grated Mozzarella', 'g', 250, DAIRY, {
    base: 'g',
    per: { bag: 250, pack: 250, handful: 30, cup: 100 },
    aliases: ['grated mozzarella', 'shredded mozzarella', 'pizza mozzarella', 'pizza cheese'],
  }),
  extra('gdb-x-cottage-cheese', 'Cottage Cheese', 'tub', 1, DAIRY, {
    base: 'g',
    per: { tub: 300, pot: 300, each: 300, tbsp: 15 },
    aliases: ['cottage cheese'],
  }),
  extra('gdb-x-goats-cheese', "Goat's Cheese", 'pack', 1, DAIRY, {
    base: 'g',
    per: { pack: 125, log: 125, each: 125 },
    aliases: ['goats cheese', 'goat cheese', 'soft goats cheese', 'chevre'],
  }),
  extra('gdb-x-paneer', 'Paneer', 'pack', 1, DAIRY, {
    base: 'g',
    per: { pack: 226, block: 226, each: 226 },
    aliases: ['paneer'],
  }),
  extra('gdb-x-custard', 'Fresh Custard', 'pot', 1, DAIRY, {
    base: 'ml',
    per: { pot: 500, carton: 500, each: 500 },
    aliases: ['custard', 'fresh custard', 'ready made custard'],
  }),
  // Bakery:
  extra('gdb-x-crumpets', 'Crumpets', 'pack', 1, BAKERY, {
    base: 'each',
    per: { pack: 6, each: 1 },
    aliases: ['crumpet'],
  }),
  extra('gdb-x-english-muffins', 'English Muffins', 'pack', 1, BAKERY, {
    base: 'each',
    per: { pack: 4, each: 1 },
    aliases: ['english muffin', 'breakfast muffin'],
  }),
  extra('gdb-x-baguette', 'Baguette', 'whole', 1, BAKERY, {
    base: 'each',
    per: { each: 1, g: 1 / 250 },
    aliases: ['baguette', 'french stick', 'french bread'],
  }),
  extra('gdb-x-ciabatta', 'Ciabatta', 'whole', 1, BAKERY, {
    base: 'each',
    per: { each: 1, loaf: 1, g: 1 / 270 },
    aliases: ['ciabatta'],
  }),
  extra('gdb-x-brioche-buns', 'Brioche Buns', 'pack', 1, BAKERY, {
    base: 'each',
    per: { pack: 4, bun: 1, each: 1 },
    aliases: ['brioche bun', 'brioche burger bun', 'brioche roll'],
  }),
  // Store cupboard:
  extra('gdb-x-marmite', 'Marmite', 'jar', 1, PANTRY, jar(250, ['marmite', 'yeast extract'])),
  extra(
    'gdb-x-brown-sauce',
    'Brown Sauce',
    'bottle',
    1,
    PANTRY,
    liquid(['brown sauce', 'hp sauce'], { bottle: 450 }, true),
  ),
  extra('gdb-x-mint-sauce', 'Mint Sauce', 'jar', 1, PANTRY, jar(165, ['mint sauce'])),
  extra('gdb-x-salad-cream', 'Salad Cream', 'bottle', 1, PANTRY, liquid(['salad cream'], { bottle: 425 }, true)),
  extra(
    'gdb-x-pickle',
    'Pickle',
    'jar',
    1,
    CANNED,
    jar(360, ['pickle', 'branston', 'branston pickle', 'sweet pickle', 'ploughmans pickle']),
  ),
  extra('gdb-x-mango-chutney', 'Mango Chutney', 'jar', 1, CANNED, jar(340, ['mango chutney'])),
  extra('gdb-x-golden-syrup', 'Golden Syrup', 'bottle', 1, PANTRY, {
    base: 'g',
    density: 1.4,
    cupboard: true,
    per: { bottle: 600, tin: 454, each: 600, tbsp: 21, tsp: 7 },
    aliases: ['golden syrup'],
  }),
  extra('gdb-x-cannellini', 'Cannellini Beans', 'can', 1, CANNED, {
    base: 'g',
    per: { can: 400 },
    aliases: ['cannellini bean', 'white bean'],
  }),
  extra('gdb-x-butter-beans', 'Butter Beans', 'can', 1, CANNED, {
    base: 'g',
    per: { can: 400 },
    aliases: ['butter bean', 'lima bean'],
  }),
  extra('gdb-x-olives', 'Olives', 'jar', 1, CANNED, {
    base: 'g',
    per: { jar: 160, each: 4 },
    aliases: ['olive', 'black olive', 'green olive', 'kalamata olive', 'pitted olive'],
  }),
  extra('gdb-x-risotto-rice', 'Risotto Rice', 'g', 500, GRAINS, {
    base: 'g',
    cupboard: true,
    per: { cup: 200 },
    aliases: ['risotto rice', 'arborio rice', 'arborio', 'carnaroli rice', 'carnaroli'],
  }),
  extra('gdb-x-rice-pouch', 'Microwave Rice', 'pack', 1, GRAINS, {
    base: 'g',
    per: { pack: 250, pouch: 250, each: 250 },
    aliases: ['microwave rice', 'rice pouch', 'ready rice', 'express rice', 'microwaveable rice'],
  }),
  extra('gdb-x-soup', 'Tinned Soup', 'can', 1, CANNED, {
    base: 'g',
    per: { can: 400 },
    aliases: ['tinned soup', 'canned soup', 'tomato soup', 'soup'],
  }),
  extra(
    'gdb-x-squash-drink',
    'Fruit Squash',
    'bottle',
    1,
    PANTRY,
    liquid(['fruit squash', 'orange squash', 'blackcurrant squash', 'diluting juice', 'cordial'], { bottle: 1000 }),
  ),
  extra('gdb-x-instant-coffee', 'Instant Coffee', 'jar', 1, PANTRY, {
    base: 'g',
    per: { jar: 100, each: 100, tsp: 2 },
    aliases: ['instant coffee', 'coffee granule'],
  }),
  extra('gdb-x-tortilla-chips', 'Tortilla Chips', 'bag', 1, PANTRY, {
    base: 'g',
    per: { bag: 200, pack: 200, handful: 30 },
    aliases: ['tortilla chip', 'nacho', 'nacho chip'],
  }),
  extra('gdb-x-sultanas', 'Sultanas', 'g', 500, PANTRY, {
    base: 'g',
    cupboard: true,
    per: { cup: 150, handful: 30, tbsp: 10 },
    aliases: ['sultana', 'raisin', 'dried fruit', 'mixed dried fruit', 'currant'],
  }),
  extra('gdb-x-ground-almonds', 'Ground Almonds', 'g', 200, PANTRY, {
    base: 'g',
    cupboard: true,
    per: { cup: 100, tbsp: 7 },
    aliases: ['ground almond', 'almond flour', 'almond meal'],
  }),
  extra('gdb-x-cocoa', 'Cocoa Powder', 'tub', 1, PANTRY, {
    base: 'g',
    density: 0.5,
    cupboard: true,
    per: { tub: 250, each: 250, tbsp: 6, tsp: 2 },
    aliases: ['cocoa', 'cocoa powder', 'cacao powder'],
  }),
  extra('gdb-x-yeast', 'Fast Action Yeast', 'pack', 1, PANTRY, {
    base: 'g',
    cupboard: true,
    per: { pack: 56, sachet: 7, each: 7, tsp: 3 },
    aliases: [
      'yeast',
      'dried yeast',
      'fast action yeast',
      'fast action dried yeast',
      'easy bake yeast',
      'instant yeast',
    ],
  }),
  extra('gdb-x-filo', 'Filo Pastry', 'pack', 1, BAKERY, {
    base: 'each',
    per: { pack: 1, each: 1, sheet: 1 / 7, g: 1 / 270 },
    aliases: ['filo', 'filo pastry', 'phyllo', 'phyllo pastry'],
  }),
  // Frozen:
  extra('gdb-x-yorkshire', 'Yorkshire Puddings', 'pack', 1, FROZEN, {
    base: 'each',
    per: { pack: 12, each: 1 },
    aliases: ['yorkshire pudding', 'yorkshire pud', 'yorkshire'],
  }),
  extra('gdb-x-roast-potatoes', 'Frozen Roast Potatoes', 'bag', 1, FROZEN, {
    base: 'g',
    per: { bag: 700, pack: 700 },
    aliases: ['frozen roast potato', 'frozen roastie'],
  }),
  extra('gdb-x-hash-browns', 'Hash Browns', 'pack', 1, FROZEN, {
    base: 'each',
    per: { pack: 15, each: 1 },
    aliases: ['hash brown'],
  }),
  // Household:
  extra('gdb-x-cling-film', 'Cling Film', 'roll', 1, HOUSEHOLD, {
    base: 'each',
    per: { roll: 1, each: 1 },
    aliases: ['cling film', 'clingfilm', 'food wrap'],
  }),
  extra('gdb-x-foil', 'Kitchen Foil', 'roll', 1, HOUSEHOLD, {
    base: 'each',
    per: { roll: 1, each: 1 },
    aliases: ['foil', 'tin foil', 'kitchen foil', 'aluminium foil'],
  }),
  extra('gdb-x-baking-paper', 'Baking Paper', 'roll', 1, HOUSEHOLD, {
    base: 'each',
    per: { roll: 1, each: 1 },
    aliases: ['baking paper', 'greaseproof paper', 'parchment paper', 'baking parchment'],
  }),
  extra('gdb-x-freezer-bags', 'Freezer Bags', 'pack', 1, HOUSEHOLD, {
    base: 'each',
    per: { pack: 1, each: 1 },
    aliases: ['freezer bag', 'food bag', 'sandwich bag'],
  }),
  extra('gdb-x-hand-wash', 'Hand Wash', 'bottle', 1, HOUSEHOLD, {
    base: 'each',
    per: { bottle: 1, each: 1 },
    aliases: ['hand wash', 'hand soap', 'liquid soap', 'soap'],
  }),
];

/** Bumped when EXTRA_PRODUCTS changes; the store adds new products to the shared grocery list once per version. */
export const CATALOG_VERSION = 4;

/**
 * Built-in products whose defaults changed in a later version. Applied once to your list, and
 * only to products that still have the old default (your own edits win). A value in `from` can
 * be a list of old values (e.g. an aisle written the old way or the new way).
 * `lists`: also rename staples and favourites with exactly the old name.
 */
interface DefaultChange {
  id: string;
  from: Record<string, unknown>;
  to: Partial<GroceryItem>;
  lists?: boolean;
}
const sized = (ids: string[], from: Partial<GroceryItem>, to: Partial<GroceryItem>): DefaultChange[] =>
  ids.map((id) => ({ id, from, to }));
const renamed = (id: string, from: string, to: string, lists = true): DefaultChange => ({
  id,
  from: { name: from },
  to: { name: to },
  lists,
});
const OLD_PANTRY = ['Pantry', 'Pantry, Oils & Spices'];
const DEFAULT_CHANGES: DefaultChange[] = [
  // v3: milk is sold in pints in the UK (1, 2, 4 pints), not 500 ml steps
  { id: 'gdb-79', from: { unit: 'ml', increment: 500 }, to: { unit: 'pint', increment: 1 } },
  // v4: UK pack sizes
  ...sized(['gdb-51'], { unit: 'g', increment: 250 }, { increment: 300 }), // chicken breasts: 300 g (2 fillets), 650 g
  ...sized(['gdb-52'], { unit: 'g', increment: 250 }, { increment: 600 }), // chicken thigh fillets: 600 g
  ...sized(['gdb-61', 'gdb-62'], { unit: 'g', increment: 250 }, { increment: 400 }), // diced beef, diced chicken: 400 g
  ...sized(['gdb-54', 'gdb-55', 'gdb-60'], { unit: 'g', increment: 250 }, { increment: 500 }), // pork, lamb, turkey mince: 500 g
  ...sized(['gdb-9'], { unit: 'g', increment: 200 }, { unit: 'kg', increment: 1 }), // carrots: 1 kg bag
  ...sized(['gdb-5'], { unit: 'g', increment: 250 }, { unit: 'kg', increment: 2.5 }), // potatoes: 2.5 kg bag
  ...sized(['gdb-11'], { unit: 'g', increment: 150 }, { unit: 'whole', increment: 1 }), // tomatoes: loose
  ...sized(['gdb-6'], { unit: 'g', increment: 250 }, { unit: 'whole', increment: 1 }), // sweet potatoes: loose
  ...sized(['gdb-16'], { unit: 'g', increment: 150 }, { increment: 300 }), // mushrooms: 300 g
  ...sized(['gdb-26'], { unit: 'g', increment: 150 }, { increment: 200 }), // fine beans: 200 g
  ...sized(['gdb-70'], { unit: 'g', increment: 200 }, { increment: 400 }), // cheddar: 400 g block
  ...sized(['gdb-137', 'gdb-141'], { unit: 'g', increment: 250 }, { unit: 'kg', increment: 1 }), // frozen peas, mixed veg: 1 kg
  ...sized(['gdb-138'], { unit: 'g', increment: 500 }, { unit: 'kg', increment: 1 }), // oven chips: 1 kg
  ...sized(['gdb-142'], { unit: 'g', increment: 250 }, { increment: 500 }), // frozen berries: 500 g
  ...sized(['gdb-92', 'gdb-93', 'gdb-94', 'gdb-95'], { unit: 'g', increment: 200 }, { increment: 500 }), // dried pasta: 500 g
  ...sized(['gdb-98', 'gdb-99', 'gdb-100'], { unit: 'g', increment: 200 }, { unit: 'kg', increment: 1 }), // rice: 1 kg
  ...sized(['gdb-101'], { unit: 'g', increment: 200 }, { increment: 300 }), // quinoa: 300 g
  ...sized(['gdb-102'], { unit: 'g', increment: 200 }, { increment: 500 }), // couscous: 500 g
  ...sized(['gdb-133'], { unit: 'g', increment: 500 }, { unit: 'kg', increment: 1.5 }), // flour: 1.5 kg
  ...sized(['gdb-134'], { unit: 'g', increment: 500 }, { unit: 'kg', increment: 1 }), // sugar: 1 kg
  ...sized(['gdb-122', 'gdb-123'], { unit: 'ml', increment: 500 }, { unit: 'l', increment: 1 }), // vegetable, sunflower oil: 1 litre
  ...sized(['gdb-126'], { unit: 'ml', increment: 250 }, { increment: 350 }), // white wine vinegar: 350 ml
  // v4: rice and grains live in the Pasta, Rice & Grains aisle
  ...['gdb-98', 'gdb-99', 'gdb-100', 'gdb-101', 'gdb-102', 'gdb-103'].map((id) => ({
    id,
    from: { category: OLD_PANTRY },
    to: { category: 'Pasta, Rice & Grains' },
  })),
  // v4: one product became several (the rest are new products)
  renamed('gdb-133', 'Flour', 'Plain Flour', false),
  renamed('gdb-134', 'Sugar', 'Granulated Sugar', false),
  renamed('gdb-136', 'Stock Cubes', 'Vegetable Stock Cubes', false),
  renamed('gdb-155', 'Wine', 'Red Wine', false),
  // v4: UK names
  renamed('gdb-8', 'Bell Peppers', 'Peppers'),
  renamed('gdb-29', 'Chilli Peppers', 'Chillies'),
  renamed('gdb-75', 'Cream Cheese', 'Soft Cheese'),
  renamed('gdb-78', 'Sour Cream', 'Soured Cream'),
  renamed('gdb-88', 'Pita Bread', 'Pitta Bread'),
  renamed('gdb-66', 'Canned Tuna', 'Tinned Tuna'),
  renamed('gdb-15', 'Salad Mix', 'Mixed Salad Leaves'),
  renamed('gdb-153', 'Soda', 'Fizzy Drinks'),
  renamed('gdb-156', 'Toilet Paper', 'Toilet Roll'),
  renamed('gdb-158', 'Dish Soap', 'Washing-up Liquid'),
  renamed('gdb-160', 'Laundry Detergent', 'Washing Liquid'),
  renamed('gdb-161', 'Fabric Softener', 'Fabric Conditioner'),
  renamed('gdb-165', 'Body Wash', 'Shower Gel'),
];

const matchesOld = (item: GroceryItem, from: Record<string, unknown>) =>
  Object.entries(from).every(([k, v]) => {
    const now = (item as unknown as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.includes(now) : now === v;
  });

/** A built-in product with every newer default it still qualifies for, or null if none apply. */
export function applyDefaultChanges(item: GroceryItem): GroceryItem | null {
  let out: GroceryItem | null = null;
  for (const change of DEFAULT_CHANGES) {
    if (change.id !== item.id) continue;
    const cur: GroceryItem = out ?? item;
    if (matchesOld(cur, change.from)) out = { ...cur, ...change.to };
  }
  return out;
}

/** Staples and favourites to rename when a built-in product gets its UK name: old name -> new name (lower-case keys). */
export function listRenames(): Map<string, string> {
  return new Map(
    DEFAULT_CHANGES.filter((c) => c.lists && c.to.name).map((c) => [
      String(c.from.name).toLowerCase(),
      c.to.name as string,
    ]),
  );
}

/** Grocery items that still have an old built-in default, updated to the new one. */
export function outdatedDefaults(groceryDatabase: GroceryItem[] | undefined | null): GroceryItem[] {
  const list = Array.isArray(groceryDatabase) ? groceryDatabase : [];
  const out: GroceryItem[] = [];
  for (const item of list) {
    if (item.removed) continue;
    const next = applyDefaultChanges(item);
    if (next) out.push(next);
  }
  return out;
}

const EXTRA_BY_ID = new Map(EXTRA_PRODUCTS.map((p) => [p.item.id, p]));

/** Built-in other names for a product (from the app's own knowledge), e.g. Courgette: zucchini. */
export function builtInAliases(id: string): string[] {
  return (PRODUCT_SPECS[id] ?? EXTRA_BY_ID.get(id)?.spec)?.aliases ?? [];
}

/** The built-in product a merged duplicate belongs to (Zucchini is Courgette), if any. */
export function builtInSameAs(id: string): string | undefined {
  return PRODUCT_SPECS[id]?.sameAs;
}

/** A built-in product's latest way of buying (milk in pints), if it still has an old default. */
export function updatedDefault(item: GroceryItem): GroceryItem | null {
  return applyDefaultChanges(item);
}

let builtIns: GroceryItem[] | null = null;
/**
 * The app's own product list: the original products and those added since, with their aisles,
 * and built-in duplicates (Zucchini, Eggplant...) merged into the product they're the same as.
 */
export function builtInProducts(): GroceryItem[] {
  if (builtIns) return builtIns;
  const list = [...INITIAL_GROCERY_DATABASE, ...EXTRA_PRODUCTS.map((e) => e.item)].map((i) => {
    let item: GroceryItem = { ...i, category: aisleCategory(i) };
    item = updatedDefault(item) ?? item;
    const same = builtInSameAs(item.id);
    return same ? { ...item, removed: true, mergedInto: same } : item;
  });
  builtIns = list;
  return list;
}

const BUILT_IN_IDS = new Set([...INITIAL_GROCERY_DATABASE.map((i) => i.id), ...EXTRA_PRODUCTS.map((e) => e.item.id)]);
/** True for products that come with the app. */
export const isBuiltInProduct = (id: string) => BUILT_IN_IDS.has(id);

// ---------------------------------------------------------------------------
// Building and matching
// ---------------------------------------------------------------------------

/** Work out a spec for a product nobody has described (e.g. one added from the "Map Ingredient" screen). */
function inferSpec(item: GroceryItem): ProductSpec {
  const info = unitInfo(item.unit);
  if (info.dimension === 'mass') return { base: 'g' };
  if (info.dimension === 'volume') return { base: 'ml' };
  if (info.unit === 'can') return { base: 'g', per: { can: 400 } };
  return { base: 'each', per: { [info.unit]: 1, each: 1 } };
}

export function sizeOfUnit(unit: string, base: Base, per: Record<string, number>, density?: number): number | null {
  if (per[unit] !== undefined) return per[unit];
  const vague = vagueUnit(unit);
  if (vague) {
    // Pinches, splashes, knobs, handfuls: rough sizes, treating 1 g as about 1 ml.
    if (base === 'g' || base === 'ml') return vague.factor;
    const viaWeight = per.g ?? per.ml;
    return viaWeight !== undefined ? vague.factor * viaWeight : null;
  }
  const info = unitInfo(unit);
  if (info.dimension === 'mass') {
    if (base === 'g') return info.factor;
    if (base === 'ml' && density) return info.factor / density;
    if (base === 'ml') return info.factor; // liquids: 1 g ≈ 1 ml
    if (per.g !== undefined) return info.factor * per.g;
    return null;
  }
  if (info.dimension === 'volume') {
    if (base === 'ml') return info.factor;
    if (base === 'g' && density) return info.factor * density;
    if (per.ml !== undefined) return info.factor * per.ml;
    return null;
  }
  if (unit === 'each' && base === 'each') return 1;
  if (unit === 'can' && base !== 'each') return 400;
  return null;
}

function toProduct(item: GroceryItem, specOverride?: ProductSpec): Product {
  const spec = specOverride ?? PRODUCT_SPECS[item.id] ?? EXTRA_BY_ID.get(item.id)?.spec ?? inferSpec(item);
  const base = spec.base;
  const per = { ...(spec.per ?? {}) };
  const buyUnit = canonicalUnit(item.unit);
  const step = typeof item.increment === 'number' && item.increment > 0 ? item.increment : 1;
  const buySize = sizeOfUnit(buyUnit, base, per, spec.density);
  const nameKey = matchKey(item.name);
  const ownKeys = (item.aliases ?? []).map(matchKey);
  const hidden = new Set((item.hiddenAliases ?? []).map(matchKey));
  const builtInKeys = (spec.aliases ?? []).map(matchKey).filter((k) => !hidden.has(k));
  const keys = [...new Set([nameKey, ...ownKeys, ...builtInKeys].filter((k) => k.length > 0))];
  return {
    id: item.id,
    name: item.name,
    category: item.category || 'Other',
    aisle: guessAisle({ name: item.name, category: item.category }),
    buyUnit,
    step,
    buySize,
    base,
    per,
    density: spec.density,
    cupboard: Boolean(spec.cupboard),
    sameAs: item.mergedInto || spec.sameAs,
    keys,
    item,
  };
}

/** How strongly a key belongs to a product: its own name beats a name you added, which beats a built-in one. */
function keyRank(p: Product, key: string): number {
  if (matchKey(p.name) === key) return 3;
  if ((p.item.aliases ?? []).some((a) => matchKey(a) === key)) return 2;
  return 1;
}

/** Does a product match what's typed in a search box? (Its name or any other name, plurals too: "courgettes" finds Courgette.) */
export function productMatchesSearch(p: Product, query: string): boolean {
  const t = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!t) return true;
  if (p.name.toLowerCase().includes(t) || p.keys.some((k) => k.includes(t))) return true;
  const k = matchKey(t);
  return !!k && p.keys.some((x) => x.includes(k));
}

/** The other names a product goes by (yours and the built-in ones you haven't taken off), for showing. */
export function alsoCalled(item: GroceryItem): string[] {
  const spec = PRODUCT_SPECS[item.id] ?? EXTRA_BY_ID.get(item.id)?.spec;
  const hidden = new Set((item.hiddenAliases ?? []).map(matchKey));
  const seen = new Set([matchKey(item.name)]);
  const out: string[] = [];
  for (const a of [...(item.aliases ?? []), ...(spec?.aliases ?? []).filter((x) => !hidden.has(matchKey(x)))]) {
    const k = matchKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/** Set a product's other names: built-in ones left out are remembered as taken off, new ones kept as yours. */
export function withAlsoCalled(item: GroceryItem, names: string[]): GroceryItem {
  const spec = PRODUCT_SPECS[item.id] ?? EXTRA_BY_ID.get(item.id)?.spec;
  const builtIn = new Map((spec?.aliases ?? []).map((a) => [matchKey(a), a]));
  const wanted = new Map<string, string>();
  for (const n of names) {
    const clean = String(n ?? '').trim();
    const k = matchKey(clean);
    if (k && k !== matchKey(item.name) && !wanted.has(k)) wanted.set(k, clean);
  }
  const aliases = [...wanted].filter(([k]) => !builtIn.has(k)).map(([, v]) => v);
  const hiddenAliases = [...builtIn].filter(([k]) => !wanted.has(k) && k !== matchKey(item.name)).map(([, v]) => v);
  const { aliases: _a, hiddenAliases: _h, ...rest } = item;
  return { ...rest, ...(aliases.length ? { aliases } : {}), ...(hiddenAliases.length ? { hiddenAliases } : {}) };
}

export interface Catalog {
  products: Product[];
  byId: Map<string, Product>;
  /** match key -> product (a product's own name wins over another's alternative name). */
  byKey: Map<string, Product>;
  entries: { key: string; words: string[]; product: Product }[];
}

/** Products that were merged into another ("Same as…"): only reachable by id, leading to the one kept. */
function mergedShadow(item: GroceryItem): Product {
  return { ...toProduct(item), keys: [], sameAs: item.mergedInto };
}

/**
 * Build the catalogue from the shared product list. Products taken off the list are left out;
 * ones merged into another lead to it. (Older copies of the data also had per-product changes
 * kept separately and built-in products missing from the list: both still work.)
 */
export function buildCatalog(
  groceryDatabase?: GroceryItem[] | null,
  overrides?: Record<string, Partial<GroceryItem>> | null,
): Catalog {
  const baseList = Array.isArray(groceryDatabase) && groceryDatabase.length > 0 ? groceryDatabase : builtInProducts();
  const ov = overrides || {};
  const items: GroceryItem[] = baseList
    .filter((i) => i && typeof i.name === 'string' && i.name.trim())
    .map((i) => (ov[i.id] ? ({ ...i, ...ov[i.id], id: i.id } as GroceryItem) : i));
  const ids = new Set(items.map((i) => i.id));
  for (const [k, o] of Object.entries(ov)) {
    if (o && o.name && !ids.has(k)) {
      items.push({ ...(o as GroceryItem), id: k });
      ids.add(k);
    }
  }
  for (const extra of EXTRA_PRODUCTS) {
    if (!ids.has(extra.item.id)) {
      items.push(extra.item);
      ids.add(extra.item.id);
    }
  }

  const live = items.filter((i) => !i.removed);
  const products = live.map((i) => toProduct(i));
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const i of items) {
    if (i.removed && i.mergedInto && !byId.has(i.id)) byId.set(i.id, mergedShadow(i));
  }
  const byKey = new Map<string, Product>();
  const rank = new Map<Product, Map<string, number>>();
  const entries: Catalog['entries'] = [];
  for (const p of products) {
    const ranks = new Map(p.keys.map((k) => [k, keyRank(p, k)]));
    rank.set(p, ranks);
    for (const key of p.keys) {
      const existing = byKey.get(key);
      if (!existing || ranks.get(key)! > rank.get(existing)!.get(key)!) byKey.set(key, p);
      entries.push({ key, words: key.split(' '), product: p });
    }
  }
  return { products, byId, byKey, entries };
}

let cacheDb: unknown;
let cacheOv: unknown;
let cacheCat: Catalog | null = null;
/** The catalogue for the app's data (rebuilt only when the product list changes). */
export function catalogForState(
  state:
    | { groceryDatabase?: GroceryItem[] | null; groceryOverrides?: Record<string, Partial<GroceryItem>> | null }
    | null
    | undefined,
): Catalog {
  const db = state?.groceryDatabase ?? null;
  const ov = state?.groceryOverrides ?? null;
  if (cacheCat && db === cacheDb && ov === cacheOv) return cacheCat;
  cacheCat = buildCatalog(db, ov);
  cacheDb = db;
  cacheOv = ov;
  return cacheCat;
}

function resolve(catalog: Catalog, product: Product | undefined | null): Product | null {
  let p = product ?? null;
  for (let i = 0; p && p.sameAs && i < 5; i++) {
    const target = catalog.byId.get(p.sameAs);
    if (!target) break;
    p = target;
  }
  // A merged product whose product has itself gone leads nowhere.
  return p && p.item.removed ? null : p;
}

function findSpan(words: string[], keyWords: string[]): number {
  // Returns the start index of the LAST occurrence of keyWords inside words, or -1.
  for (let start = words.length - keyWords.length; start >= 0; start--) {
    let ok = true;
    for (let j = 0; j < keyWords.length; j++) {
      if (words[start + j] !== keyWords[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return -1;
}

const SMALL_MEASURES = new Set(['pinch', 'dash', 'tsp', 'tbsp', 'grind']);

export type MatchKind = 'exact' | 'linked' | 'partial';

/**
 * Find the product an ingredient refers to, most reliable first:
 *  1. exact  - the name (or an alternative name) is a product: "chicken breasts" = Chicken Breasts.
 *  2. linked - the product the ingredient was linked to when the recipe was saved
 *              (by Gemini's suggestion or by you in Map Ingredient), if it still exists.
 *  3. partial - the longest product name contained in the ingredient, preferring one at
 *              the end ("lean beef mince" -> Beef Mince), unless a word around it makes it a
 *              different product ("garlic powder", "ground ginger", "tomato soup").
 */
export function matchProductDetailed(
  catalog: Catalog,
  name: string,
  opts: { groceryId?: string; unit?: string; amount?: number } = {},
): { product: Product; how: MatchKind } | null {
  const key = matchKey(name);
  if (key) {
    const exact = catalog.byKey.get(key);
    if (exact) return { product: disambiguate(catalog, resolve(catalog, exact)!, key, key, opts), how: 'exact' };
  }
  if (opts.groceryId) {
    const linked = resolve(catalog, catalog.byId.get(opts.groceryId));
    if (linked) return { product: linked, how: 'linked' };
  }
  if (!key) return null;

  const words = key.split(' ');
  let best: { score: [number, number, number]; product: Product; key: string } | null = null;
  for (const entry of catalog.entries) {
    if (entry.words.length > words.length) continue;
    const start = findSpan(words, entry.words);
    if (start < 0) continue;
    const end = start + entry.words.length;
    const after = words.slice(end);
    // "garlic powder" isn't garlic, but "penne pasta" is penne and "basmati rice" is rice.
    const ownWords = new Set([
      ...entry.product.name
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/s$/, '')),
      ...(isPastaProduct(entry.product) ? ['pasta'] : []),
    ]);
    if (after.some((w) => IDENTITY_AFTER.has(w) && !ownWords.has(w))) continue;
    if (start > 0 && IDENTITY_BEFORE.has(words[start - 1])) continue;
    // A broad word ("oil", "pasta", "steak") only counts if everything before it is just description.
    const generic = entry.words.length === 1 && GENERIC_HEADS.has(entry.words[0]);
    if (generic && words.slice(0, start).some((w) => !DESCRIPTORS.has(w))) continue;
    const score: [number, number, number] = [
      end === words.length && !generic ? 1 : 0,
      entry.words.length,
      entry.key.length,
    ];
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] &&
        (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))
    ) {
      best = { score, product: entry.product, key: entry.key };
    }
  }
  if (!best) return null;
  const product = resolve(catalog, best.product);
  return product ? { product: disambiguate(catalog, product, best.key, key, opts), how: 'partial' } : null;
}

/** Kinds of pasta ("penne pasta" is penne): the built-in pastas, and your own products in the pasta aisle. */
const PASTA_IDS = new Set(['gdb-92', 'gdb-93', 'gdb-94', 'gdb-95', 'gdb-96', 'gdb-97', 'gdb-x-pasta', 'gdb-x-gnocchi']);
const isPastaProduct = (p: Product) => PASTA_IDS.has(p.id) || (!isBuiltInProduct(p.id) && p.aisle === 'grains_pasta');

/** "Pepper": a counted pepper is a bell pepper; a pinch or teaspoon is black pepper. */
function disambiguate(
  catalog: Catalog,
  found: Product,
  foundKey: string,
  key: string,
  opts: { unit?: string; amount?: number },
): Product {
  if (foundKey !== 'pepper') return found;
  const u = canonicalUnit(opts.unit);
  const words = key.split(' ');
  const toTaste = words.includes('taste') || words.includes('season') || words.includes('seasoning');
  const counted =
    u === 'each' && !SMALL_MEASURES.has(u) && typeof opts.amount === 'number' && opts.amount >= 1 && !toTaste;
  const bell = resolve(catalog, catalog.byId.get('gdb-8'));
  const black = resolve(catalog, catalog.byId.get('gdb-132'));
  return counted ? (bell ?? found) : (black ?? found);
}

/** The product an ingredient refers to (see matchProductDetailed), or null. */
export function matchProduct(
  catalog: Catalog,
  name: string,
  opts: { groceryId?: string; unit?: string; amount?: number } = {},
): Product | null {
  return matchProductDetailed(catalog, name, opts)?.product ?? null;
}

/** A product by its exact name on the grocery list (used to check Gemini's suggestions are real). */
export function productByName(catalog: Catalog, name: string): Product | null {
  const wanted = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  const p =
    catalog.products.find((x) => x.name.trim().toLowerCase() === wanted) ?? catalog.byKey.get(matchKey(name)) ?? null;
  return resolve(catalog, p);
}

/** Products the store should add to the user's grocery list (new in this catalogue version). */
export function missingExtraProducts(groceryDatabase: GroceryItem[] | undefined | null): GroceryItem[] {
  const list = Array.isArray(groceryDatabase) ? groceryDatabase : [];
  const ids = new Set(list.map((i) => i.id));
  const keys = new Set(list.map((i) => matchKey(i.name)));
  return EXTRA_PRODUCTS.filter((e) => !ids.has(e.item.id) && !keys.has(matchKey(e.item.name))).map((e) => ({
    ...e.item,
  }));
}

/** Exposed for tests. */
export const __test = { nameWords };
