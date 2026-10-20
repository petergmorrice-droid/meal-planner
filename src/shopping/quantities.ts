/**
 * Shopping quantities.
 *
 * Recipe amounts are converted into each product's own measure, added up
 * across the week, and then rounded up to whole packs of what you actually buy.
 * Amounts that can't be converted are never added to amounts that can; they
 * are reported so the person can check them.
 */
import { currentCatalog } from './current';
import { buildCatalog, matchProduct, sizeOfUnit, type Catalog, type Product } from './catalog';
import { groupingKey, displayName, matchKey } from './names';
import { canonicalUnit, unitInfo, vagueUnit, formatUnit, formatAmount, parseAmount, formatCookingAmount, largeUnitQuantity } from './units';

export interface IngredientInput {
  name: string;
  amount: number | string | null | undefined;
  unit?: string | null;
  category?: string | null;
  groceryId?: string | null;
  /** Where it's needed, e.g. the recipe name. */
  source?: string;
}

export interface ShoppingLine {
  /** Stable key for this line (product id or normalised name). */
  key: string;
  name: string;
  amount: number;
  unit: string;
  category: string;
  productId?: string;
  /** Buying step in the line's unit (for +/- buttons). */
  step: number;
  /** Store-cupboard staple: check before buying. */
  cupboard: boolean;
  /** Part of the amount couldn't be worked out; see note. */
  needsCheck: boolean;
  note?: string;
  /** What the recipes actually use, when it's less than you buy ("100 g" of a 300 g pack, "3 cloves" of a bulb). */
  needed?: string;
  sources: string[];
}

/** Amounts within this fraction of a step don't round up to another pack (e.g. 410 g -> one 400 g can). */
const ROUND_TOLERANCE = 0.05;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Convert an amount in a recipe unit into the product's base measure, or null if it can't be. */
export function toBase(product: Product, amount: number, unit: string | null | undefined): number | null {
  const u = canonicalUnit(unit);
  const size = sizeOfUnit(u, product.base, product.per, product.density);
  if (size === null) return null;
  return amount * size;
}

/** Whole steps of the buying unit needed to cover a total in the base measure. */
export function buyQuantity(product: Product, totalBase: number): { amount: number; unit: string } | null {
  if (!product.buySize || product.buySize <= 0) return null;
  const unitsNeeded = totalBase / product.buySize;
  // The tiny epsilon stops floating-point noise (1.05 - 0.05 = 1.0000000000000002) adding a pack.
  const steps = Math.max(1, Math.ceil(unitsNeeded / product.step - ROUND_TOLERANCE - 1e-9));
  const amount = round2(steps * product.step);
  return { amount, unit: formatUnit(product.buyUnit, amount) };
}

/** Neat rounding for amounts we can't turn into packs (unknown items). */
function neatRoundUp(amount: number, unit: string): number {
  const u = canonicalUnit(unit);
  if (u === 'g' || u === 'ml') {
    const step = amount < 50 ? 5 : amount < 250 ? 10 : amount < 1000 ? 25 : 50;
    return Math.max(step, Math.ceil(round2(amount / step)) * step);
  }
  if (unitInfo(u).dimension === 'count') return Math.max(1, Math.ceil(round2(amount) - ROUND_TOLERANCE));
  return round2(amount);
}

const describe = (amount: number, unit: string) => {
  const u = canonicalUnit(unit);
  const label = formatUnit(u, amount);
  return label ? `${formatAmount(amount)} ${label}` : formatAmount(amount);
};

const SMALL_ONLY = new Set(['tsp', 'pinch', 'dash', 'splash', 'drizzle']);

interface Part { amount: number; unit: string; source?: string; valid: boolean }

/**
 * Combine ingredients (already scaled to the servings you're cooking) into
 * shopping lines: one per product, in buyable quantities.
 */
export function buildShoppingLines(inputs: IngredientInput[], catalog: Catalog): ShoppingLine[] {
  const groups = new Map<string, { product: Product | null; name: string; category: string; parts: Part[] }>();
  const order: string[] = [];

  for (const input of inputs) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) continue;
    const amount = parseAmount(input.amount);
    const valid = isFinite(amount) && amount > 0;
    const unit = String(input.unit ?? '');
    const product = matchProduct(catalog, input.name, { groceryId: input.groceryId ?? undefined, unit, amount: valid ? amount : undefined });
    const key = product ? `p:${product.id}` : `n:${groupingKey(input.name) || matchKey(input.name)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        product,
        name: product ? product.name : displayName(input.name),
        category: product ? product.category : (input.category || 'Other'),
        parts: [],
      });
      order.push(key);
    }
    groups.get(key)!.parts.push({ amount: valid ? amount : 0, unit, source: input.source, valid });
  }

  const lines: ShoppingLine[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const sources = [...new Set(g.parts.map((p) => p.source).filter((s): s is string => Boolean(s)))];
    lines.push(g.product ? productLine(key, g.product, g.parts, sources) : unknownLine(key, g.name, g.category, g.parts, sources));
  }
  return lines;
}

/** An amount as a recipe would say it: "100 g", "1.5 kg", "3 cloves", "½", "2 tbsp". */
function neededAmountText(amount: number, unit: string): string {
  const u = canonicalUnit(unit);
  const big = largeUnitQuantity(amount, u);
  if (big) return `${formatAmount(big.amount)} ${big.unit}`;
  const n = formatCookingAmount(amount, u) || formatAmount(amount);
  // Less than one reads singular: "½ bunch", "¾ can".
  const label = formatUnit(u, amount < 1 ? 1 : amount);
  return label ? `${n} ${label}` : n;
}

/**
 * What the recipes use, in their own unit if they all use the same one ("3 cloves"), otherwise in
 * the product's measure ("240 g"). Only when it's noticeably less than what you buy.
 */
function neededText(product: Product, parts: Part[], total: number, boughtBase: number | null): string | undefined {
  if (!boughtBase || total <= 0 || total >= boughtBase * (1 - ROUND_TOLERANCE)) return undefined;
  const used = parts.filter((p) => p.valid && toBase(product, p.amount, p.unit) !== null);
  if (!used.length) return undefined;
  const units = new Set(used.map((p) => canonicalUnit(p.unit)));
  const vague = used.some((p) => vagueUnit(canonicalUnit(p.unit)));
  if (units.size === 1 && !vague) {
    const [u] = [...units];
    return neededAmountText(round2(used.reduce((sum, p) => sum + p.amount, 0)), u);
  }
  const baseUnit = product.base === 'each' ? 'each' : product.base;
  const amount = product.base === 'each' ? round2(total) : Math.round(total);
  return `${vague ? 'about ' : ''}${neededAmountText(amount, baseUnit)}`;
}

function productLine(key: string, product: Product, parts: Part[], sources: string[]): ShoppingLine {
  let total = 0;
  let converted = 0;
  const leftovers: string[] = [];
  for (const part of parts) {
    if (!part.valid) continue; // "salt to taste", "parsley to garnish": buy the minimum
    const base = toBase(product, part.amount, part.unit);
    if (base === null) {
      leftovers.push(describe(part.amount, part.unit) + (part.source ? ` (${part.source})` : ''));
    } else {
      total += base;
      converted++;
    }
  }

  const bought = buyQuantity(product, total);
  let amount: number;
  let unit: string;
  if (bought) {
    amount = bought.amount;
    unit = bought.unit;
  } else {
    // We know the product but not its pack size: list the exact amount in its base measure.
    const baseUnit = product.base === 'each' ? 'each' : product.base;
    amount = neatRoundUp(total || 1, baseUnit);
    unit = formatUnit(baseUnit, amount);
  }

  // Couldn't convert some of it (e.g. "1 handful" of something sold by the each).
  const needsCheck = leftovers.length > 0 && !product.cupboard;
  const note = leftovers.length > 0
    ? (converted > 0 ? `also needs ${leftovers.join(', ')}` : `recipe says ${leftovers.join(', ')}`)
    : undefined;

  const step = bought ? product.step : 1;
  const needed = bought && product.buySize ? neededText(product, parts, total, bought.amount * product.buySize) : undefined;
  return {
    key, name: product.name, amount, unit, category: product.category, productId: product.id,
    step, cupboard: product.cupboard, needsCheck, note, sources, ...(needed ? { needed } : {}),
  };
}

function unknownLine(key: string, name: string, category: string, parts: Part[], sources: string[]): ShoppingLine {
  // Add up within each kind of measure only: grams with kilos, ml with spoons, cloves with cloves.
  const byKind = new Map<string, { amount: number; unit: string }>();
  let allSmall = true;
  let anyValid = false;
  for (const part of parts) {
    if (!part.valid) continue;
    anyValid = true;
    const u = canonicalUnit(part.unit);
    if (!SMALL_ONLY.has(u)) allSmall = false;
    const info = unitInfo(u);
    const vague = vagueUnit(u);
    let kind: string; let amount: number; let unit: string;
    if (info.dimension === 'mass' || vague?.dimension === 'mass') { kind = 'mass'; amount = part.amount * (vague ? vague.factor : info.factor); unit = 'g'; }
    else if (info.dimension === 'volume' || vague?.dimension === 'volume') { kind = 'volume'; amount = part.amount * (vague ? vague.factor : info.factor); unit = 'ml'; }
    else { kind = `count:${u}`; amount = part.amount; unit = u; }
    const cur = byKind.get(kind);
    byKind.set(kind, { amount: (cur?.amount ?? 0) + amount, unit });
  }

  // Only teaspoons/pinches of something unknown: almost certainly a spice or seasoning.
  if (anyValid && allSmall) {
    return { key, name, amount: 1, unit: '', category: category || 'Pantry', step: 1, cupboard: true, needsCheck: false,
      note: `recipe uses ${parts.filter((p) => p.valid).map((p) => describe(p.amount, p.unit)).join(' + ')}`, sources };
  }
  if (byKind.size === 0) {
    return { key, name, amount: 1, unit: '', category, step: 1, cupboard: false, needsCheck: false, sources };
  }

  const kinds = [...byKind.values()];
  // Show the biggest-looking measure as the main amount; mention the rest.
  const preferred = kinds.find((k) => k.unit === 'g') ?? kinds.find((k) => k.unit === 'ml') ?? kinds[0];
  const amount = neatRoundUp(preferred.amount, preferred.unit);
  const others = kinds.filter((k) => k !== preferred).map((k) => describe(round2(k.amount), k.unit));
  return {
    key, name, amount, unit: formatUnit(preferred.unit, amount), category, step: 1,
    cupboard: false, needsCheck: others.length > 0,
    note: others.length > 0 ? `also needs ${others.join(', ')}` : undefined,
    sources,
  };
}

/**
 * Quantity for a single recipe ingredient on its own (batch cooking, "add these
 * ingredients"): same rules as the weekly list.
 */
export function shoppingQuantityFor(
  catalog: Catalog,
  name: string,
  amount: number | string,
  unit?: string,
  category?: string
): { amount: number; unit: string; step: number; category?: string; cupboard: boolean; needsCheck: boolean; note?: string; name: string; productId?: string } {
  const [line] = buildShoppingLines([{ name, amount, unit, category }], catalog);
  if (!line) return { amount: 1, unit: '', step: 1, category, cupboard: false, needsCheck: false, name };
  return { amount: line.amount, unit: line.unit, step: line.step, category: line.category, cupboard: line.cupboard, needsCheck: line.needsCheck, note: line.note, name: line.name, productId: line.productId };
}

/**
 * Quantity for something added to the list by hand ("Milk" x 2): `steps` is how
 * many of the product's buying steps, e.g. 2 x 500 ml, 1 x 6 eggs, 3 cans.
 */
export function quantityForAddedItem(catalog: Catalog, name: string, steps = 1): { amount: number; unit: string; step: number; category?: string; name: string; productId?: string } {
  const product = matchProduct(catalog, name);
  const n = Math.max(1, Math.round(isFinite(steps) ? steps : 1));
  if (!product) return { amount: n, unit: n === 1 ? 'item' : 'items', step: 1, name };
  const amount = round2(n * product.step);
  return { amount, unit: formatUnit(product.buyUnit, amount), step: product.step, category: product.category, name: product.name, productId: product.id };
}

/** The +/- step for an item already on the list. */
export function stepForItem(catalog: Catalog, item: { name: string; unit?: string; groceryId?: string }): number {
  const product = matchProduct(catalog, item.name, { groceryId: item.groceryId });
  if (product && canonicalUnit(item.unit) === product.buyUnit) return product.step;
  const u = canonicalUnit(item.unit);
  if (u === 'g' || u === 'ml') return 50;
  if (u === 'kg' || u === 'l') return 0.25;
  return 1;
}

/** Catalogue of the household's products right now (for code outside React). */
export function catalogFromLocalStorage(): Catalog {
  return currentCatalog();
}
