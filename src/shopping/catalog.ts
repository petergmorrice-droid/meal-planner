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
const herb = (aliases: string[]): ProductSpec => ({ base: 'g', per: { bunch: 30, pack: 30, each: 30, handful: 10, sprig: 1, leaf: 0.2, tbsp: 3, tsp: 1 }, aliases });
const each = (gramsEach: number, aliases: string[] = [], extra: Record<string, number> = {}): ProductSpec => ({ base: 'each', per: { g: 1 / gramsEach, ...extra }, aliases });
const weighed = (gramsEach: number | null, aliases: string[] = [], extra: Record<string, number> = {}): ProductSpec => ({ base: 'g', per: { ...(gramsEach ? { each: gramsEach } : {}), ...extra }, aliases });
const jar = (grams: number, aliases: string[] = [], cupboard = true): ProductSpec => ({ base: 'g', per: { jar: grams, pack: grams, each: grams, tsp: 2.5, tbsp: 7 }, cupboard, aliases });
const liquid = (aliases: string[] = [], per: Record<string, number> = {}, cupboard = false): ProductSpec => ({ base: 'ml', per, cupboard, aliases });

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
  'gdb-1': weighed(null, ['baby spinach', 'spinach leaf'], { handful: 30, bag: 200 }),
  'gdb-2': { base: 'g', per: { clove: 5, each: 5, bulb: 50, head: 50, tsp: 5, tbsp: 15 }, aliases: ['garlic clove', 'clove garlic', 'garlic bulb', 'minced garlic', 'garlic paste'] },
  'gdb-3': weighed(150, ['brown onion', 'white onion', 'yellow onion', 'cooking onion']),
  'gdb-4': weighed(150, ['red onion']),
  'gdb-5': weighed(200, ['potato', 'baking potato', 'new potato', 'baby potato', 'maris piper', 'maris piper potato', 'charlotte potato', 'floury potato', 'waxy potato']),
  'gdb-6': weighed(250, ['sweet potato']),
  'gdb-7': weighed(350, ['broccoli floret', 'tenderstem broccoli'], { head: 350, floret: 15 }),
  'gdb-8': weighed(160, ['red pepper', 'green pepper', 'yellow pepper', 'orange pepper', 'sweet pepper', 'bell pepper', 'romano pepper', 'mixed pepper']),
  'gdb-9': weighed(80, ['carrot']),
  'gdb-10': weighed(150, ['avocado']),
  'gdb-11': weighed(100, ['tomato', 'vine tomato', 'salad tomato', 'beef tomato', 'beefsteak tomato']),
  'gdb-12': weighed(15, ['cherry tomato', 'baby plum tomato', 'grape tomato', 'cherry vine tomato'], { pack: 250 }),
  'gdb-13': weighed(300, ['cucumber']),
  'gdb-14': { base: 'each', per: { head: 1, leaf: 0.08, g: 1 / 300 }, aliases: ['iceberg lettuce', 'little gem', 'little gem lettuce', 'romaine lettuce', 'cos lettuce', 'gem lettuce'] },
  'gdb-15': weighed(120, ['salad leaf', 'mixed leaf', 'mixed salad leaf', 'salad', 'rocket', 'arugula', 'watercress', 'baby leaf salad', 'green salad'], { bag: 120, handful: 30 }),
  'gdb-16': weighed(20, ['mushroom', 'chestnut mushroom', 'button mushroom', 'closed cup mushroom', 'portobello mushroom', 'flat mushroom'], { pack: 250 }),
  'gdb-17': weighed(200, ['courgette', 'zucchini']),
  'gdb-18': { base: 'g', sameAs: 'gdb-17' },
  'gdb-19': weighed(250, ['aubergine', 'eggplant']),
  'gdb-20': { base: 'g', sameAs: 'gdb-19' },
  'gdb-21': weighed(600, ['cauliflower floret'], { head: 600, floret: 15 }),
  'gdb-22': weighed(800, ['white cabbage', 'savoy cabbage', 'pointed cabbage', 'sweetheart cabbage'], { head: 800 }),
  'gdb-23': { base: 'each', per: { stick: 1, each: 1, bunch: 8, head: 8, g: 1 / 40 }, aliases: ['celery stick', 'celery stalk', 'stick celery'] },
  'gdb-24': weighed(250, ['leek']),
  'gdb-25': weighed(20, ['asparagus spear'], { bunch: 250, spear: 20 }),
  'gdb-26': weighed(null, ['green bean', 'fine bean', 'french bean', 'runner bean', 'trimmed green bean']),
  'gdb-27': { base: 'each', per: { each: 1, stick: 1, bunch: 8, g: 1 / 15 }, aliases: ['spring onion', 'scallion', 'green onion', 'salad onion'] },
  'gdb-28': weighed(50, ['fresh ginger', 'root ginger', 'ginger root', 'grated ginger', 'ginger'], { thumb: 15, cm: 5, tsp: 5, tbsp: 15 }),
  'gdb-29': each(10, ['chilli', 'red chilli', 'green chilli', 'fresh chilli', 'bird eye chilli', 'birds eye chilli', 'jalapeno', 'scotch bonnet', 'chilli pepper']),
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
  'gdb-51': weighed(150, ['chicken breast', 'chicken breast fillet', 'chicken fillet', 'chicken breast steak'], { breast: 150, fillet: 150 }),
  'gdb-52': weighed(110, ['chicken thigh', 'chicken thigh fillet'], { thigh: 110, fillet: 110 }),
  'gdb-53': each(1500, ['whole chicken', 'roasting chicken', 'whole roast chicken']),
  'gdb-54': weighed(null, ['minced pork', 'ground pork', 'pork mince']),
  'gdb-55': weighed(null, ['minced lamb', 'ground lamb', 'lamb mince']),
  'gdb-56': each(180, ['pork chop', 'pork loin chop'], { chop: 1 }),
  'gdb-57': { base: 'each', per: { pack: 8, rasher: 1, slice: 1, each: 1, g: 1 / 25 }, aliases: ['bacon rasher', 'streaky bacon', 'back bacon', 'smoked bacon', 'smoked streaky bacon', 'smoked back bacon'] },
  'gdb-58': { base: 'each', per: { pack: 6, sausage: 1, each: 1, g: 1 / 67 }, aliases: ['sausage', 'pork sausage', 'chipolata', 'cumberland sausage'] },
  'gdb-59': each(225, ['sirloin steak', 'rump steak', 'ribeye steak', 'rib eye steak', 'fillet steak', 'beef steak'], { steak: 1 }),
  'gdb-60': weighed(null, ['minced turkey', 'ground turkey', 'turkey mince']),
  'gdb-61': weighed(null, ['stewing beef', 'braising steak', 'casserole beef', 'beef stewing steak', 'beef chuck', 'diced beef']),
  'gdb-62': weighed(null, ['chicken piece', 'chicken chunk', 'chicken mini fillet', 'diced chicken']),
  'gdb-63': each(120, ['salmon fillet', 'salmon', 'salmon steak', 'skinless salmon fillet'], { fillet: 1 }),
  'gdb-64': each(140, ['cod', 'cod fillet', 'cod loin'], { fillet: 1 }),
  'gdb-65': weighed(null, ['prawn', 'king prawn', 'raw prawn', 'cooked prawn', 'tiger prawn', 'shrimp', 'raw king prawn']),
  'gdb-66': weighed(null, ['tuna', 'tinned tuna', 'canned tuna', 'tuna chunk', 'tuna in spring water', 'tin tuna'], { can: 145 }),
  'gdb-67': weighed(null, ['smoked salmon'], { pack: 100 }),
  'gdb-68': each(100, ['mackerel fillet', 'smoked mackerel', 'mackerel'], { fillet: 1 }),
  'gdb-69': each(140, ['haddock', 'haddock fillet', 'smoked haddock'], { fillet: 1 }),
  'gdb-70': weighed(null, ['cheddar', 'mature cheddar', 'grated cheddar', 'extra mature cheddar', 'cheddar cheese', 'mild cheddar'], { cup: 100, handful: 30, tbsp: 7 }),
  'gdb-71': weighed(125, ['mozzarella ball', 'buffalo mozzarella', 'mozzarella', 'grated mozzarella'], { ball: 125, pack: 125 }),
  'gdb-72': weighed(null, ['parmesan cheese', 'parmigiano reggiano', 'grana padano', 'vegetarian italian hard cheese', 'parmesan'], { tbsp: 5, cup: 80, handful: 20 }),
  'gdb-73': weighed(225, ['halloumi'], { pack: 225, block: 225 }),
  'gdb-74': weighed(200, ['feta'], { pack: 200, block: 200 }),
  'gdb-75': { base: 'g', per: { pack: 180, tub: 180, each: 180, tbsp: 15 }, aliases: ['soft cheese', 'full fat soft cheese', 'light soft cheese', 'philadelphia'] },
  'gdb-76': liquid(['light cream', 'single cream'], { pot: 150 }),
  'gdb-77': liquid(['heavy cream', 'whipping cream', 'double cream'], { pot: 150 }),
  'gdb-78': liquid(['soured cream', 'sour cream'], { pack: 300, pot: 300, tub: 300 }),
  'gdb-79': liquid(['whole milk', 'semi skimmed milk', 'skimmed milk', 'milk'], { pint: 568 }),
  'gdb-80': { base: 'g', density: 0.96, per: { knob: 15, tbsp: 14, tsp: 5, pack: 250, block: 250 }, aliases: ['unsalted butter', 'salted butter', 'butter'] },
  'gdb-81': { base: 'each', per: { egg: 1, each: 1, g: 1 / 55 }, aliases: ['egg', 'free range egg', 'large egg', 'medium egg', 'egg yolk', 'egg white'] },
  'gdb-82': { base: 'g', per: { pack: 500, pot: 500, tub: 500, each: 500 }, aliases: ['natural yogurt', 'plain yogurt', 'yogurt'] },
  'gdb-83': { base: 'g', per: { pack: 500, pot: 500, tub: 500, each: 500 }, aliases: ['greek style yogurt', 'greek yogurt', 'fat free greek yogurt'] },
  'gdb-84': liquid(['oat milk'], { carton: 1000 }),
  'gdb-85': liquid(['almond milk'], { carton: 1000 }),
  'gdb-86': { base: 'each', per: { loaf: 1, each: 1, slice: 1 / 20, g: 1 / 800 }, aliases: ['loaf', 'sliced bread', 'white bread', 'wholemeal bread', 'sourdough', 'sourdough bread', 'bread'] },
  'gdb-87': { base: 'each', per: { pack: 8, wrap: 1, each: 1 }, aliases: ['tortilla', 'wrap', 'flour tortilla', 'tortilla wrap'] },
  'gdb-88': { base: 'each', per: { pack: 6, each: 1 }, aliases: ['pitta', 'pitta bread', 'pita'] },
  'gdb-89': { base: 'each', per: { pack: 5, each: 1 }, aliases: ['bagel'] },
  'gdb-90': { base: 'each', per: { pack: 4, each: 1 }, aliases: ['croissant'] },
  'gdb-91': { base: 'each', per: { pack: 6, roll: 1, each: 1 }, aliases: ['bread roll', 'burger bun', 'brioche bun', 'roll', 'bun', 'sub roll'] },
  'gdb-92': { base: 'g', cupboard: true, aliases: ['spaghetti'] },
  'gdb-93': { base: 'g', cupboard: true, aliases: ['penne'] },
  'gdb-94': { base: 'g', cupboard: true, aliases: ['fusilli'] },
  'gdb-95': { base: 'g', cupboard: true, aliases: ['macaroni'] },
  'gdb-96': { base: 'g', per: { pack: 300, nest: 50, each: 50 }, aliases: ['egg noodle', 'rice noodle', 'udon noodle', 'noodle nest', 'straight to wok noodle', 'fine egg noodle', 'noodle'] },
  'gdb-97': { base: 'each', cupboard: true, per: { pack: 18, sheet: 1, each: 1, g: 1 / 20 }, aliases: ['lasagne sheet', 'lasagna sheet', 'dried lasagne sheet'] },
  'gdb-98': { base: 'g', cupboard: true, per: { cup: 185 }, aliases: ['jasmine rice', 'thai jasmine rice', 'thai rice'] },
  'gdb-99': { base: 'g', cupboard: true, per: { cup: 185 }, aliases: ['basmati rice', 'basmati', 'rice', 'long grain rice', 'white rice', 'easy cook rice'] },
  'gdb-100': { base: 'g', cupboard: true, per: { cup: 185 }, aliases: ['brown rice', 'wholegrain rice'] },
  'gdb-101': { base: 'g', cupboard: true, per: { cup: 170 }, aliases: ['quinoa'] },
  'gdb-102': { base: 'g', cupboard: true, per: { cup: 180 }, aliases: ['couscous', 'giant couscous'] },
  'gdb-103': { base: 'g', cupboard: true, per: { cup: 90 }, aliases: ['porridge oat', 'rolled oat', 'oat'] },
  'gdb-104': { base: 'each', per: { box: 1, each: 1 }, aliases: ['cereal'] },
  'gdb-105': { base: 'g', per: { can: 400, carton: 390 }, aliases: ['chopped tomato', 'tinned tomato', 'canned tomato', 'tin tomato', 'can tomato', 'tinned chopped tomato', 'canned chopped tomato', 'can chopped tomato', 'tin chopped tomato', 'crushed tomato', 'diced tomato', 'chopped tinned tomato'] },
  'gdb-106': { base: 'g', per: { can: 400 }, aliases: ['plum tomato', 'whole plum tomato', 'tinned plum tomato', 'canned plum tomato', 'tinned whole tomato'] },
  'gdb-107': { base: 'g', density: 1, per: { carton: 500, jar: 500, bottle: 500, each: 500 }, aliases: ['passata', 'sieved tomato', 'tomato passata'] },
  'gdb-108': { base: 'g', per: { can: 415 }, aliases: ['baked bean'] },
  'gdb-109': { base: 'g', per: { can: 400 }, aliases: ['kidney bean', 'red kidney bean'] },
  'gdb-110': { base: 'g', per: { can: 400 }, aliases: ['black bean'] },
  'gdb-111': { base: 'g', per: { can: 400 }, aliases: ['chickpea', 'garbanzo bean', 'tinned chickpea'] },
  'gdb-112': { base: 'g', per: { can: 325, cup: 160 }, aliases: ['sweetcorn', 'sweetcorn kernel', 'corn', 'tinned sweetcorn', 'corn kernel'] },
  'gdb-113': { base: 'ml', per: { can: 400 }, aliases: ['coconut milk', 'light coconut milk', 'reduced fat coconut milk', 'tinned coconut milk'] },
  'gdb-114': { base: 'g', cupboard: true, per: { tube: 200, each: 200, tbsp: 16, tsp: 5 }, aliases: ['tomato puree', 'tomato paste', 'double concentrated tomato puree'] },
  'gdb-115': { base: 'g', per: { jar: 190, each: 190, tbsp: 15 }, aliases: ['pesto', 'basil pesto', 'green pesto', 'red pesto'] },
  'gdb-116': { base: 'g', per: { jar: 500, each: 500 }, aliases: ['pasta sauce', 'tomato pasta sauce', 'bolognese sauce'] },
  'gdb-117': { base: 'g', per: { jar: 200, each: 200, tbsp: 15, tsp: 5 }, aliases: ['curry paste', 'thai red curry paste', 'thai green curry paste', 'red curry paste', 'green curry paste', 'korma paste', 'tikka paste', 'tikka masala paste', 'balti paste', 'madras paste', 'rogan josh paste'] },
  'gdb-118': jar(340, ['peanut butter', 'smooth peanut butter', 'crunchy peanut butter']),
  'gdb-119': jar(340, ['jam', 'strawberry jam', 'raspberry jam']),
  'gdb-120': { base: 'g', density: 1.4, cupboard: true, per: { jar: 340, bottle: 340, each: 340 }, aliases: ['honey', 'runny honey', 'clear honey'] },
  'gdb-121': liquid(['olive oil', 'extra virgin olive oil', 'light olive oil', 'evoo'], { bottle: 500 }, true),
  'gdb-122': liquid(['vegetable oil', 'oil', 'cooking oil', 'rapeseed oil', 'neutral oil'], { bottle: 1000 }, true),
  'gdb-123': liquid(['sunflower oil'], { bottle: 1000 }, true),
  'gdb-124': liquid(['soy sauce', 'light soy sauce', 'dark soy sauce', 'soy', 'tamari', 'reduced salt soy sauce'], { bottle: 150 }, true),
  'gdb-125': liquid(['balsamic vinegar', 'balsamic', 'balsamic glaze'], { bottle: 250 }, true),
  'gdb-126': liquid(['white wine vinegar', 'vinegar'], { bottle: 350 }, true),
  'gdb-127': liquid(['ketchup', 'tomato ketchup'], { bottle: 460 }, true),
  'gdb-128': jar(400, ['mayonnaise', 'mayo', 'light mayonnaise']),
  'gdb-129': jar(185, ['mustard', 'dijon mustard', 'wholegrain mustard', 'english mustard', 'dijon']),
  'gdb-130': liquid(['hot sauce', 'sriracha', 'tabasco', 'chilli sauce', 'hot chilli sauce'], { bottle: 150 }, true),
  'gdb-131': { base: 'g', density: 1.2, cupboard: true, per: { pinch: 0.5, each: 500 }, aliases: ['salt', 'sea salt', 'table salt', 'salt and pepper', 'salt and black pepper', 'sea salt flake', 'kosher salt', 'salt flake'] },
  'gdb-132': { base: 'g', density: 0.5, cupboard: true, per: { pinch: 0.25, each: 100 }, aliases: ['black pepper', 'pepper', 'ground black pepper', 'black peppercorn', 'white pepper', 'cracked black pepper', 'freshly ground black pepper'] },
  'gdb-133': { base: 'g', density: 0.55, cupboard: true, per: { cup: 125 }, aliases: ['flour', 'plain flour', 'self raising flour', 'self rising flour', 'all purpose flour', 'strong white bread flour', 'bread flour', 'wholemeal flour'] },
  'gdb-134': { base: 'g', density: 0.85, cupboard: true, per: { cup: 200 }, aliases: ['sugar', 'caster sugar', 'granulated sugar', 'white sugar', 'icing sugar', 'golden caster sugar'] },
  'gdb-135': { base: 'g', density: 0.8, cupboard: true, per: { cup: 200 }, aliases: ['brown sugar', 'light brown sugar', 'dark brown sugar', 'soft brown sugar', 'light muscovado sugar', 'dark muscovado sugar', 'muscovado sugar', 'demerara sugar'] },
  'gdb-136': { base: 'each', cupboard: true, per: { pack: 8, cube: 1, each: 1, pot: 1, sachet: 1, ml: 1 / 500 }, aliases: ['stock cube', 'stock', 'chicken stock', 'beef stock', 'vegetable stock', 'veg stock', 'fish stock', 'lamb stock', 'stock pot', 'bouillon', 'vegetable bouillon', 'chicken stock cube', 'beef stock cube', 'vegetable stock cube', 'chicken stock pot', 'beef stock pot', 'vegetable stock pot', 'hot chicken stock', 'hot vegetable stock', 'hot beef stock'] },
  'gdb-137': weighed(null, ['frozen pea', 'pea', 'garden pea', 'petit pois'], { cup: 150, handful: 40 }),
  'gdb-138': weighed(null, ['frozen chip', 'oven chip', 'chip']),
  'gdb-139': { base: 'each', per: { each: 1 }, aliases: ['frozen pizza', 'pizza'] },
  'gdb-140': { base: 'each', per: { tub: 1, each: 1 }, aliases: ['ice cream'] },
  'gdb-141': weighed(null, ['mixed veg', 'mixed vegetable', 'frozen mixed vegetable', 'frozen vegetable']),
  'gdb-142': weighed(null, ['frozen berry', 'mixed berry', 'frozen fruit', 'frozen mixed berry']),
  'gdb-150': liquid(['orange juice', 'fresh orange juice'], { carton: 1000 }),
  'gdb-151': liquid(['apple juice'], { carton: 1000 }),
  'gdb-155': liquid(['wine', 'red wine', 'white wine', 'dry white wine', 'dry red wine'], { bottle: 750 }),
  'gdb-168': { base: 'g', sameAs: 'gdb-137' },
};

// ---------------------------------------------------------------------------
// Products added in catalogue version 2 (common recipe ingredients that were missing).
// ---------------------------------------------------------------------------
interface ExtraProduct { item: GroceryItem; spec: ProductSpec }
const spice = (id: string, name: string, aliases: string[], grams = 40): ExtraProduct => ({
  item: { id, name, unit: 'jar', increment: 1, category: 'Pantry' },
  spec: { base: 'g', cupboard: true, per: { jar: grams, each: grams, tsp: 2.5, tbsp: 7.5, pinch: 0.25 }, aliases },
});
const extra = (id: string, name: string, unit: string, increment: number, category: string, spec: ProductSpec): ExtraProduct => ({
  item: { id, name, unit, increment, category }, spec,
});

export const EXTRA_PRODUCTS: ExtraProduct[] = [
  spice('gdb-x-ground-cumin', 'Ground Cumin', ['cumin', 'cumin powder', 'ground cumin']),
  spice('gdb-x-cumin-seeds', 'Cumin Seeds', ['cumin seed']),
  spice('gdb-x-paprika', 'Paprika', ['sweet paprika', 'paprika']),
  spice('gdb-x-smoked-paprika', 'Smoked Paprika', ['smoked sweet paprika', 'pimenton', 'hot smoked paprika']),
  spice('gdb-x-chilli-powder', 'Chilli Powder', ['hot chilli powder', 'mild chilli powder', 'chili powder']),
  spice('gdb-x-chilli-flakes', 'Chilli Flakes', ['dried chilli flake', 'red pepper flake', 'crushed chilli', 'crushed red pepper', 'chilli flake']),
  spice('gdb-x-turmeric', 'Ground Turmeric', ['turmeric', 'turmeric powder']),
  spice('gdb-x-garam-masala', 'Garam Masala', ['garam masala']),
  spice('gdb-x-curry-powder', 'Curry Powder', ['medium curry powder', 'mild curry powder', 'madras curry powder', 'hot curry powder']),
  spice('gdb-x-ground-coriander', 'Ground Coriander', ['coriander powder', 'ground coriander']),
  spice('gdb-x-coriander-seeds', 'Coriander Seeds', ['coriander seed']),
  spice('gdb-x-oregano', 'Dried Oregano', ['oregano', 'dried oregano']),
  spice('gdb-x-mixed-herbs', 'Mixed Herbs', ['dried mixed herb', 'italian seasoning', 'herbes de provence', 'italian herb', 'dried herb']),
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
  extra('gdb-x-vanilla', 'Vanilla Extract', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 38 }, aliases: ['vanilla essence', 'vanilla', 'vanilla bean paste'] }),
  extra('gdb-x-baking-powder', 'Baking Powder', 'tub', 1, 'Pantry', { base: 'g', density: 0.9, cupboard: true, per: { tub: 170 }, aliases: ['baking powder'] }),
  extra('gdb-x-bicarb', 'Bicarbonate of Soda', 'tub', 1, 'Pantry', { base: 'g', density: 1.1, cupboard: true, per: { tub: 200 }, aliases: ['baking soda', 'bicarb', 'bicarbonate soda', 'bicarb soda'] }),
  extra('gdb-x-cornflour', 'Cornflour', 'g', 500, 'Pantry', { base: 'g', density: 0.6, cupboard: true, aliases: ['cornstarch', 'corn flour', 'cornflour'] }),
  extra('gdb-x-worcestershire', 'Worcestershire Sauce', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 150 }, aliases: ['worcestershire sauce', 'worcester sauce'] }),
  extra('gdb-x-sweet-chilli', 'Sweet Chilli Sauce', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 300 }, aliases: ['sweet chilli sauce', 'sweet chili sauce'] }),
  extra('gdb-x-fish-sauce', 'Fish Sauce', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 200 }, aliases: ['fish sauce', 'nam pla', 'thai fish sauce'] }),
  extra('gdb-x-oyster-sauce', 'Oyster Sauce', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 150 }, aliases: ['oyster sauce'] }),
  extra('gdb-x-hoisin', 'Hoisin Sauce', 'jar', 1, 'Pantry', { base: 'ml', cupboard: true, per: { jar: 200, bottle: 200 }, aliases: ['hoisin sauce', 'hoisin'] }),
  extra('gdb-x-sesame-oil', 'Sesame Oil', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 250 }, aliases: ['sesame oil', 'toasted sesame oil'] }),
  extra('gdb-x-red-wine-vinegar', 'Red Wine Vinegar', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 350 }, aliases: ['red wine vinegar'] }),
  extra('gdb-x-cider-vinegar', 'Cider Vinegar', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 350 }, aliases: ['apple cider vinegar', 'cider vinegar'] }),
  extra('gdb-x-rice-vinegar', 'Rice Vinegar', 'bottle', 1, 'Pantry', { base: 'ml', cupboard: true, per: { bottle: 150 }, aliases: ['rice wine vinegar', 'rice vinegar'] }),
  extra('gdb-x-gravy', 'Gravy Granules', 'tub', 1, 'Pantry', { base: 'g', cupboard: true, per: { tub: 200, tbsp: 10, tsp: 3 }, aliases: ['gravy granule', 'gravy'] }),
  extra('gdb-x-lentils', 'Lentils', 'g', 500, 'Pantry', { base: 'g', cupboard: true, per: { cup: 190 }, aliases: ['red lentil', 'green lentil', 'puy lentil', 'dried red lentil', 'split red lentil', 'lentil'] }),
  extra('gdb-x-pasta', 'Pasta', 'g', 500, 'Pasta', { base: 'g', cupboard: true, per: { cup: 100 }, aliases: ['pasta', 'dried pasta', 'pasta shape', 'rigatoni', 'farfalle', 'tagliatelle', 'linguine', 'conchiglie', 'orzo'] }),
  extra('gdb-x-breadcrumbs', 'Breadcrumbs', 'g', 200, 'Pantry', { base: 'g', cupboard: true, per: { cup: 60, tbsp: 7 }, aliases: ['breadcrumb', 'panko', 'panko breadcrumb', 'dried breadcrumb'] }),
  extra('gdb-x-creme-fraiche', 'Crème Fraîche', 'pot', 1, 'Dairy', { base: 'ml', per: { pot: 200, tub: 200, each: 200 }, aliases: ['creme fraiche', 'half fat creme fraiche', 'reduced fat creme fraiche'] }),
  extra('gdb-x-ricotta', 'Ricotta', 'tub', 1, 'Dairy', { base: 'g', per: { tub: 250, each: 250 }, aliases: ['ricotta'] }),
  extra('gdb-x-mascarpone', 'Mascarpone', 'tub', 1, 'Dairy', { base: 'g', per: { tub: 250, each: 250 }, aliases: ['mascarpone'] }),
  extra('gdb-x-chorizo', 'Chorizo', 'pack', 1, 'Meat', { base: 'g', per: { pack: 200, ring: 225, each: 200, slice: 5 }, aliases: ['chorizo', 'chorizo sausage', 'cooking chorizo', 'chorizo ring', 'sliced chorizo'] }),
  extra('gdb-x-pancetta', 'Pancetta', 'pack', 1, 'Meat', { base: 'g', per: { pack: 130, each: 130 }, aliases: ['pancetta', 'cubetti di pancetta', 'pancetta cube', 'diced pancetta', 'lardon', 'bacon lardon'] }),
  extra('gdb-x-tofu', 'Tofu', 'pack', 1, 'Dairy', { base: 'g', per: { pack: 280, block: 280, each: 280 }, aliases: ['firm tofu', 'extra firm tofu', 'tofu'] }),
  extra('gdb-x-gnocchi', 'Gnocchi', 'pack', 1, 'Pasta', { base: 'g', per: { pack: 500, each: 500 }, aliases: ['gnocchi', 'potato gnocchi'] }),
  extra('gdb-x-naan', 'Naan Bread', 'pack', 1, 'Bakery', { base: 'each', per: { pack: 2, each: 1 }, aliases: ['naan', 'naan bread', 'garlic naan', 'plain naan'] }),
  extra('gdb-x-puff-pastry', 'Puff Pastry', 'pack', 1, 'Bakery', { base: 'each', per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 }, aliases: ['puff pastry', 'ready rolled puff pastry', 'all butter puff pastry'] }),
  extra('gdb-x-shortcrust', 'Shortcrust Pastry', 'pack', 1, 'Bakery', { base: 'each', per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 }, aliases: ['shortcrust pastry', 'ready rolled shortcrust pastry'] }),
  extra('gdb-x-shallots', 'Shallots', 'pack', 1, 'Produce', { base: 'g', per: { each: 30, pack: 250 }, aliases: ['shallot', 'banana shallot'] }),
  extra('gdb-x-butternut', 'Butternut Squash', 'whole', 1, 'Produce', { base: 'g', per: { each: 1000 }, aliases: ['butternut squash', 'squash'] }),
  extra('gdb-x-kale', 'Kale', 'g', 200, 'Produce', { base: 'g', per: { bag: 200, handful: 30 }, aliases: ['kale', 'cavolo nero', 'curly kale', 'spring green'] }),
  extra('gdb-x-pak-choi', 'Pak Choi', 'whole', 1, 'Produce', { base: 'each', per: { each: 1, head: 1, g: 1 / 120 }, aliases: ['pak choi', 'bok choy', 'pak choy', 'bok choi'] }),
  extra('gdb-x-fresh-thyme', 'Fresh Thyme', 'pack', 1, 'Produce', herb(['thyme', 'fresh thyme', 'thyme sprig', 'thyme leaf'])),
  extra('gdb-x-fresh-rosemary', 'Fresh Rosemary', 'pack', 1, 'Produce', herb(['rosemary', 'fresh rosemary', 'rosemary sprig'])),
  extra('gdb-x-fresh-mint', 'Fresh Mint', 'bunch', 1, 'Produce', herb(['mint', 'fresh mint', 'mint leaf'])),
  extra('gdb-x-chives', 'Chives', 'pack', 1, 'Produce', herb(['chive', 'fresh chive', 'snipped chive'])),
  extra('gdb-x-dill', 'Dill', 'pack', 1, 'Produce', herb(['dill', 'fresh dill'])),
  extra('gdb-x-pine-nuts', 'Pine Nuts', 'pack', 1, 'Pantry', { base: 'g', per: { pack: 100, each: 100, tbsp: 9 }, aliases: ['pine nut', 'toasted pine nut'] }),
  extra('gdb-x-coconut-cream', 'Coconut Cream', 'carton', 1, 'Canned', { base: 'ml', per: { carton: 200, can: 400 }, aliases: ['coconut cream', 'creamed coconut'] }),
];

/** Bumped when EXTRA_PRODUCTS changes; the store adds new products to the shared grocery list once per version. */
export const CATALOG_VERSION = 2;

const EXTRA_BY_ID = new Map(EXTRA_PRODUCTS.map((p) => [p.item.id, p]));

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
  const names = [item.name, ...(item.aliases ?? []), ...(spec.aliases ?? [])];
  const keys = [...new Set(names.map(matchKey).filter((k) => k.length > 0))];
  return {
    id: item.id,
    name: item.name,
    category: item.category || 'Other',
    buyUnit,
    step,
    buySize,
    base,
    per,
    density: spec.density,
    cupboard: Boolean(spec.cupboard),
    sameAs: spec.sameAs,
    keys,
    item,
  };
}

export interface Catalog {
  products: Product[];
  byId: Map<string, Product>;
  /** match key -> product (user's own items take priority over built-in extras). */
  byKey: Map<string, Product>;
  entries: { key: string; words: string[]; product: Product }[];
}

/**
 * Build the catalogue from the user's grocery list (+ per-item overrides and
 * custom items). Products added in later catalogue versions are included even
 * if the user's saved list predates them.
 */
export function buildCatalog(
  groceryDatabase?: GroceryItem[] | null,
  overrides?: Record<string, Partial<GroceryItem>> | null
): Catalog {
  const baseList = Array.isArray(groceryDatabase) && groceryDatabase.length > 0 ? groceryDatabase : INITIAL_GROCERY_DATABASE;
  const ov = overrides || {};
  const items: GroceryItem[] = baseList
    .filter((i) => i && typeof i.name === 'string' && i.name.trim())
    .map((i) => ({ ...i, ...(ov[i.id] || {}) }) as GroceryItem);
  const ids = new Set(items.map((i) => i.id));
  for (const o of Object.values(ov)) {
    if (o && o.id && o.name && !ids.has(o.id)) { items.push(o as GroceryItem); ids.add(o.id); }
  }
  const userCount = items.length;
  for (const extra of EXTRA_PRODUCTS) {
    if (!ids.has(extra.item.id)) { items.push(extra.item); ids.add(extra.item.id); }
  }

  const products = items.map((i) => toProduct(i));
  const byId = new Map(products.map((p) => [p.id, p]));
  const byKey = new Map<string, Product>();
  const entries: Catalog['entries'] = [];
  products.forEach((p, idx) => {
    for (const key of p.keys) {
      const existing = byKey.get(key);
      // The user's own items win over built-in extras; otherwise first one wins.
      if (!existing || (idx < userCount && products.indexOf(existing) >= userCount)) byKey.set(key, p);
      entries.push({ key, words: key.split(' '), product: p });
    }
  });
  return { products, byId, byKey, entries };
}

function resolve(catalog: Catalog, product: Product | undefined | null): Product | null {
  let p = product ?? null;
  for (let i = 0; p && p.sameAs && i < 5; i++) {
    const target = catalog.byId.get(p.sameAs);
    if (!target) break;
    p = target;
  }
  return p;
}

function findSpan(words: string[], keyWords: string[]): number {
  // Returns the start index of the LAST occurrence of keyWords inside words, or -1.
  for (let start = words.length - keyWords.length; start >= 0; start--) {
    let ok = true;
    for (let j = 0; j < keyWords.length; j++) {
      if (words[start + j] !== keyWords[j]) { ok = false; break; }
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
  opts: { groceryId?: string; unit?: string; amount?: number } = {}
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
    const ownWords = new Set([...entry.product.name.toLowerCase().split(/\s+/).map((w) => w.replace(/s$/, '')), ...entry.product.category.toLowerCase().split(/\W+/).map((w) => w.replace(/s$/, ''))]);
    if (after.some((w) => IDENTITY_AFTER.has(w) && !ownWords.has(w))) continue;
    if (start > 0 && IDENTITY_BEFORE.has(words[start - 1])) continue;
    // A broad word ("oil", "pasta", "steak") only counts if everything before it is just description.
    const generic = entry.words.length === 1 && GENERIC_HEADS.has(entry.words[0]);
    if (generic && words.slice(0, start).some((w) => !DESCRIPTORS.has(w))) continue;
    const score: [number, number, number] = [end === words.length && !generic ? 1 : 0, entry.words.length, entry.key.length];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) {
      best = { score, product: entry.product, key: entry.key };
    }
  }
  if (!best) return null;
  const product = resolve(catalog, best.product);
  return product ? { product: disambiguate(catalog, product, best.key, key, opts), how: 'partial' } : null;
}

/** "Pepper": a counted pepper is a bell pepper; a pinch or teaspoon is black pepper. */
function disambiguate(catalog: Catalog, found: Product, foundKey: string, key: string, opts: { unit?: string; amount?: number }): Product {
  if (foundKey !== 'pepper') return found;
  const u = canonicalUnit(opts.unit);
  const words = key.split(' ');
  const toTaste = words.includes('taste') || words.includes('season') || words.includes('seasoning');
  const counted = u === 'each' && !SMALL_MEASURES.has(u) && typeof opts.amount === 'number' && opts.amount >= 1 && !toTaste;
  const bell = resolve(catalog, catalog.byId.get('gdb-8'));
  return counted && bell ? bell : found;
}

/** The product an ingredient refers to (see matchProductDetailed), or null. */
export function matchProduct(
  catalog: Catalog,
  name: string,
  opts: { groceryId?: string; unit?: string; amount?: number } = {}
): Product | null {
  return matchProductDetailed(catalog, name, opts)?.product ?? null;
}

/** A product by its exact name on the grocery list (used to check Gemini's suggestions are real). */
export function productByName(catalog: Catalog, name: string): Product | null {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const p = catalog.products.find((x) => x.name.trim().toLowerCase() === wanted) ?? catalog.byKey.get(matchKey(name)) ?? null;
  return resolve(catalog, p);
}

/** Products the store should add to the user's grocery list (new in this catalogue version). */
export function missingExtraProducts(groceryDatabase: GroceryItem[] | undefined | null): GroceryItem[] {
  const list = Array.isArray(groceryDatabase) ? groceryDatabase : [];
  const ids = new Set(list.map((i) => i.id));
  const keys = new Set(list.map((i) => matchKey(i.name)));
  return EXTRA_PRODUCTS.filter((e) => !ids.has(e.item.id) && !keys.has(matchKey(e.item.name))).map((e) => ({ ...e.item }));
}

/** Exposed for tests. */
export const __test = { nameWords };
