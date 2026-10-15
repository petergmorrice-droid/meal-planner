/**
 * Ingredient name normalisation.
 *
 * Turns "2 Skinless Chicken Breasts, cut into chunks" into the words
 * ["skinless", "chicken", "breast"] so it can be matched to a product, and
 * gives every name a stable grouping key.
 */

/** Words that never change which product something is (dropped from grouping keys). */
export const DESCRIPTORS = new Set([
  'fresh', 'freshly', 'large', 'small', 'medium', 'big', 'extra', 'ripe', 'baby', 'mini',
  'finely', 'roughly', 'thinly', 'thickly', 'coarsely', 'lightly', 'very',
  'chopped', 'diced', 'sliced', 'crushed', 'grated', 'peeled', 'deseeded', 'seeded', 'trimmed',
  'halved', 'quartered', 'cubed', 'shredded', 'torn', 'beaten', 'softened', 'melted', 'mashed',
  'skinless', 'boneless', 'skin', 'bone', 'on', 'in', 'free', 'range', 'organic', 'british',
  'lean', 'extra-lean', 'good', 'quality', 'cold', 'warm', 'room', 'temperature', 'washed',
  'cut', 'into', 'chunk', 'piece', 'strip', 'wedge', 'ring', 'about', 'approx', 'approximately',
  'plus', 'more', 'to', 'serve', 'for', 'garnish', 'optional', 'and', 'or', 'of', 'a', 'an', 'the',
  'some', 'few', 'x', 'pack', 'packet', 'bag', 'tin', 'can', 'jar', 'bunch', 'handful', 'sprig',
]);

/** Spellings that should be treated as the same word. */
const SPELLINGS: Record<string, string> = {
  chili: 'chilli', chile: 'chilli', chilies: 'chilli', chiles: 'chilli', chillies: 'chilli',
  yoghurt: 'yogurt', yoghourt: 'yogurt', houmous: 'hummus', hoummos: 'hummus',
  scallion: 'spring onion', capsicum: 'pepper',
};

const KEEP = new Set([
  'couscous', 'asparagus', 'hummus', 'molasses', 'swiss', 'bass', 'grass', 'lemongrass', 'cress',
  'watercress', 'citrus', 'octopus', 'jus', 'gas', 'lettuce', 'quinoa', 'pasta', 'rice', 'feta',
  'gnocchi', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'linguine', 'oregano', 'paprika',
  'brussels', 'series', 'species', 'chorizo', 'mozzarella', 'ricotta', 'passata', 'polenta',
]);

const IRREGULAR: Record<string, string> = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife', cookies: 'cookie',
  potatoes: 'potato', tomatoes: 'tomato', mangoes: 'mango', avocados: 'avocado',
  anchovies: 'anchovy', cherries: 'cherry', berries: 'berry', chillies: 'chilli',
  radishes: 'radish', peaches: 'peach', sandwiches: 'sandwich', dishes: 'dish',
  pies: 'pie', fries: 'fry', ties: 'tie',
};

export function singularize(word: string): string {
  const w = word.toLowerCase();
  if (KEEP.has(w) || w.length <= 3) return w;
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normalise an ingredient name into lower-case singular words, with quantities,
 * brackets and "preparation" text after a comma removed.
 */
export function nameWords(name: string): string[] {
  let s = stripAccents(String(name ?? '')).toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');                       // "(about 2)" / "(400g)"
  s = s.split(/,|;| - | – /)[0];                           // "onion, finely chopped"
  s = s.replace(/^\s*(the )?(juice|zest|zest and juice|juice and zest) of\s+/, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\d+(\.\d+)?\s*%/g, ' ');                  // "5% fat"
  s = s.replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|cm)\b/g, ' '); // "400g"
  s = s.replace(/[\d½¼¾⅓⅔/.]+/g, ' ');
  s = s.replace(/[^a-z\s'-]/g, ' ').replace(/['’]/g, '').replace(/-/g, ' ');
  const words: string[] = [];
  for (const raw of s.split(/\s+/)) {
    if (!raw) continue;
    const spelled = SPELLINGS[raw] ?? raw;
    for (const part of spelled.split(' ')) words.push(singularize(part));
  }
  return words.filter((w) => w.length > 0);
}

/** Key used to match product names and aliases: singular words joined by spaces. */
export function matchKey(name: string): string {
  return nameWords(name).filter((w) => !['of', 'a', 'an', 'the', 'x'].includes(w)).join(' ');
}

/** Key used to group unknown ingredients: also drops descriptive words ("finely chopped shallots" -> "shallot"). */
export function groupingKey(name: string): string {
  const words = nameWords(name);
  const kept = words.filter((w) => !DESCRIPTORS.has(w));
  return (kept.length ? kept : words).join(' ');
}

/** A tidy display name for an ingredient that isn't in the grocery list. */
export function displayName(name: string): string {
  const cleaned = String(name ?? '').split(/,|;| - | – /)[0].replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Unknown item';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Words that turn one product into a different one when they come after it:
 * "garlic powder" is not garlic, "tomato soup" is not tomatoes.
 */
export const IDENTITY_AFTER = new Set([
  'powder', 'stock', 'paste', 'sauce', 'oil', 'seed', 'flake', 'granule', 'salt', 'extract', 'essence',
  'vinegar', 'puree', 'jam', 'marmalade', 'chutney', 'relish', 'syrup', 'soup', 'pie', 'cake', 'crisp',
  'biscuit', 'bread', 'pizza', 'milk', 'butter', 'water', 'wine', 'spread', 'mix', 'seasoning', 'rub',
  'glaze', 'gravy', 'cube', 'pot', 'noodle', 'pasta', 'rice', 'steak', 'mince', 'burger', 'nugget',
  'finger', 'kiev', 'chip', 'fritter', 'cracker', 'tortilla', 'wrap', 'cordial', 'liqueur', 'tea',
  'curd', 'ketchup', 'pesto', 'dressing', 'mayonnaise', 'bean', 'lentil', 'yogurt', 'cream', 'cheese',
]);

/** Words that turn a product into a different one when they come before it: "ground ginger" is a spice. */
export const IDENTITY_BEFORE = new Set([
  'ground', 'dried', 'dry', 'tinned', 'canned', 'jarred', 'pickled', 'crystallised', 'crystallized',
  'powdered', 'desiccated', 'sun', 'frozen', 'candied', 'stem', 'quail', 'duck',
]);

/**
 * Broad words that only identify a product when nothing more specific is said:
 * "cooking oil" is vegetable oil, but "chilli oil" or "truffle oil" isn't, and
 * "penne pasta" is penne rather than pasta in general.
 */
export const GENERIC_HEADS = new Set([
  'pasta', 'rice', 'noodle', 'bread', 'oil', 'vinegar', 'cheese', 'sauce', 'stock', 'flour', 'sugar',
  'milk', 'cream', 'wine', 'steak', 'salad', 'pepper', 'roll', 'bun', 'spice', 'herb', 'mushroom',
]);
