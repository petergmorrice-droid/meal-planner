/**
 * Standard units.
 *
 * Every unit string that appears in a recipe or on the shopping list
 * ("Tbsp", "tablespoons", "grams", "400g cans", "pots (150ml)", "") is mapped
 * to one canonical unit. Mass and volume units convert to grams / millilitres;
 * everything else (cloves, cans, bunches...) is a "count" unit whose size
 * depends on the product (see catalog.ts).
 */

export type Dimension = 'mass' | 'volume' | 'count';

export interface UnitInfo {
  /** Canonical unit id, e.g. 'g', 'tbsp', 'clove', 'each'. */
  unit: string;
  dimension: Dimension;
  /** For mass: grams per unit. For volume: millilitres per unit. Count units: 1. */
  factor: number;
}

const MASS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const VOLUME: Record<string, number> = {
  ml: 1, cl: 10, dl: 100, l: 1000,
  tsp: 5, dsp: 10, tbsp: 15, cup: 240, floz: 28.4, pint: 568,
};

/** Every accepted spelling -> canonical unit. Matched after lower-casing and trimming. */
const ALIASES: Record<string, string> = {
  // mass
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  g: 'g', gr: 'g', grm: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g', gms: 'g', gm: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  // volume
  ml: 'ml', mls: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  cl: 'cl', centilitre: 'cl', centilitres: 'cl',
  dl: 'dl', decilitre: 'dl', decilitres: 'dl',
  l: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', teaspoonful: 'tsp', t: 'tsp',
  dsp: 'dsp', dessertspoon: 'dsp', dessertspoons: 'dsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tablespoonful: 'tbsp',
  cup: 'cup', cups: 'cup', mug: 'cup', mugs: 'cup',
  'fl oz': 'floz', floz: 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz',
  pint: 'pint', pints: 'pint', pt: 'pint', pts: 'pint',
  // plain count
  '': 'each', each: 'each', ea: 'each', x: 'each', whole: 'each', piece: 'each', pieces: 'each', pc: 'each', pcs: 'each',
  item: 'each', items: 'each', unit: 'each', units: 'each', number: 'each', count: 'each',
  small: 'each', medium: 'each', large: 'each', 'extra large': 'each', big: 'each',
  // product-specific counts (size comes from the product)
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can', tin: 'can', tins: 'can', '400g can': 'can', '400g cans': 'can', '400g tin': 'can', '400g tins': 'can',
  jar: 'jar', jars: 'jar',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', pkt: 'pack', punnet: 'pack', punnets: 'pack',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  bunch: 'bunch', bunches: 'bunch', bnch: 'bunch',
  sprig: 'sprig', sprigs: 'sprig',
  stalk: 'stick', stalks: 'stick', stick: 'stick', sticks: 'stick', rib: 'stick', ribs: 'stick',
  head: 'head', heads: 'head',
  bulb: 'bulb', bulbs: 'bulb',
  ball: 'ball', balls: 'ball', 'ball (125g)': 'ball', 'balls (125g)': 'ball',
  block: 'block', blocks: 'block', 'block (200g)': 'block', 'blocks (200g)': 'block',
  fillet: 'fillet', fillets: 'fillet',
  breast: 'breast', breasts: 'breast',
  thigh: 'thigh', thighs: 'thigh',
  chop: 'chop', chops: 'chop',
  steak: 'steak', steaks: 'steak',
  rasher: 'rasher', rashers: 'rasher',
  sausage: 'sausage', sausages: 'sausage',
  slice: 'slice', slices: 'slice',
  sheet: 'sheet', sheets: 'sheet',
  leaf: 'leaf', leaves: 'leaf',
  cube: 'cube', cubes: 'cube', 'stock cube': 'cube', 'stock cubes': 'cube',
  pot: 'pot', pots: 'pot', 'pot (150ml)': 'pot', 'pots (150ml)': 'pot',
  tub: 'tub', tubs: 'tub',
  carton: 'carton', cartons: 'carton',
  bottle: 'bottle', bottles: 'bottle',
  tube: 'tube', tubes: 'tube',
  sachet: 'sachet', sachets: 'sachet',
  loaf: 'loaf', loaves: 'loaf',
  wrap: 'wrap', wraps: 'wrap', tortilla: 'wrap', tortillas: 'wrap',
  roll: 'roll', rolls: 'roll', bun: 'roll', buns: 'roll',
  egg: 'egg', eggs: 'egg',
  bar: 'bar', bars: 'bar',
  thumb: 'thumb', thumbs: 'thumb', 'thumb-sized piece': 'thumb', 'thumb sized piece': 'thumb',
  cm: 'cm',
  spear: 'spear', spears: 'spear',
  floret: 'floret', florets: 'floret',
  // vague amounts (sizes are defaults; products can override)
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  splash: 'splash', splashes: 'splash',
  drizzle: 'drizzle', glug: 'drizzle', glugs: 'drizzle',
  knob: 'knob', knobs: 'knob',
  handful: 'handful', handfuls: 'handful',
};

/** Default sizes for vague amounts, used when a product doesn't say otherwise. */
const VAGUE: Record<string, { dimension: Dimension; factor: number }> = {
  pinch: { dimension: 'mass', factor: 0.5 },
  dash: { dimension: 'volume', factor: 1 },
  splash: { dimension: 'volume', factor: 10 },
  drizzle: { dimension: 'volume', factor: 10 },
  knob: { dimension: 'mass', factor: 15 },
  handful: { dimension: 'mass', factor: 30 },
};

/** Normalise a raw unit string to its canonical id ('' means "each"). Unknown units come back cleaned but unchanged. */
export function canonicalUnit(raw: string | undefined | null): string {
  let u = String(raw ?? '').toLowerCase().trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (u in ALIASES) return ALIASES[u];
  // "400g can", "x 400g tins", "(400g) can" -> can; "250ml pot" -> pot
  u = u.replace(/^x\s+/, '').replace(/\(?\d+(\.\d+)?\s*(g|ml|kg|l)\)?\s*/g, '').trim();
  if (u in ALIASES) return ALIASES[u];
  // "pots (150ml)" style suffixes
  u = u.replace(/\s*\(.*\)$/, '').trim();
  if (u in ALIASES) return ALIASES[u];
  return u;
}

export function unitInfo(raw: string | undefined | null): UnitInfo {
  const unit = canonicalUnit(raw);
  if (unit in MASS) return { unit, dimension: 'mass', factor: MASS[unit] };
  if (unit in VOLUME) return { unit, dimension: 'volume', factor: VOLUME[unit] };
  return { unit, dimension: 'count', factor: 1 };
}

/** Default size of a vague unit (pinch, splash, handful...), or null. */
export function vagueUnit(unit: string): { dimension: Dimension; factor: number } | null {
  return VAGUE[unit] ?? null;
}

const NO_PLURAL = new Set(['g', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'oz', 'lb', 'tsp', 'tbsp', 'dsp', 'floz', 'cm', 'each']);
const IRREGULAR_PLURAL: Record<string, string> = {
  loaf: 'loaves', leaf: 'leaves', bunch: 'bunches', box: 'boxes', pinch: 'pinches', dash: 'dashes',
  splash: 'splashes', sandwich: 'sandwiches', punnet: 'punnets',
};

/** Unit text for display next to an amount: "1 can", "2 cans", "500 g", "3" (for each). */
export function formatUnit(unit: string, amount: number): string {
  const u = canonicalUnit(unit);
  if (u === 'each') return '';
  if (u === 'floz') return 'fl oz';
  if (NO_PLURAL.has(u) || Math.abs(amount - 1) < 1e-9) return u;
  if (IRREGULAR_PLURAL[u]) return IRREGULAR_PLURAL[u];
  if (/(s|x|z|ch|sh)$/.test(u)) return u + 'es';
  return u + 's';
}

/** Tidy a number for display: whole numbers stay whole, otherwise up to 2 decimals. */
export function formatAmount(amount: number): string {
  if (!isFinite(amount)) return '0';
  const rounded = Math.round(amount * 100) / 100;
  return String(rounded);
}

/** Parse a recipe amount that might arrive as text ("1/2", "1 1/2", "½", "2-3"). Returns NaN if unusable. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  let s = String(value ?? '').trim();
  if (!s) return NaN;
  const vulgar: Record<string, string> = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8' };
  s = s.replace(/[½⅓⅔¼¾⅛]/g, (c) => ' ' + vulgar[c]).trim();
  const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (range) return Math.max(parseFloat(range[1]), parseFloat(range[2])); // buy for the upper end
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
