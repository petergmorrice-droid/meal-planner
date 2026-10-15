/**
 * Shopping quantity helpers used around the app.
 *
 * All the real logic (standard units, product matching, pack rounding) lives in
 * src/shopping. These functions keep the names the screens already use.
 */
import type { GroceryItem } from '../types';
import {
  buildCatalog, matchProduct, shoppingQuantityFor, quantityForAddedItem as addedItemQuantity,
  stepForItem, matchKey, type Catalog,
} from '../shopping';

export interface ConvertedIngredient {
  name: string;
  amount: number;
  unit: string;
  category?: string;
  step: number;
}

// --- Catalogue built from the grocery list saved on this device (cached) ---
let cachedRaw: string | null | undefined;
let cachedCatalog: Catalog | null = null;

export function getCatalog(): Catalog {
  let raw: string | null = null;
  try {
    raw = typeof window !== 'undefined' ? window.localStorage.getItem('mealPlannerState') : null;
  } catch {
    raw = null;
  }
  if (cachedCatalog && raw === cachedRaw) return cachedCatalog;
  let db: GroceryItem[] | null = null;
  let overrides: Record<string, Partial<GroceryItem>> | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    db = parsed?.groceryDatabase ?? null;
    overrides = parsed?.groceryOverrides ?? null;
  } catch {
    // use the built-in list
  }
  cachedCatalog = buildCatalog(db, overrides);
  cachedRaw = raw;
  return cachedCatalog;
}

const catalogsByList = new WeakMap<object, Catalog>();
function catalogFor(db: GroceryItem[] | undefined | null): Catalog {
  if (!Array.isArray(db) || db.length === 0) return getCatalog();
  let c = catalogsByList.get(db);
  if (!c) {
    c = buildCatalog(db, null);
    catalogsByList.set(db, c);
  }
  return c;
}

/** Lower-case, trimmed, single-spaced name (for simple comparisons). */
export function normalizeIngredientName(name: string): string {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Same product? ("Chicken breasts" and "chicken breast fillets" -> true) */
export function isSameGroceryItem(a: string, b: string): boolean {
  const catalog = getCatalog();
  const pa = matchProduct(catalog, a);
  const pb = matchProduct(catalog, b);
  if (pa && pb) return pa.id === pb.id;
  return matchKey(a) === matchKey(b);
}

/** The grocery-list item an ingredient name refers to, or null. */
export function findGroceryDatabaseMatch(ingredientName: string, db: any[]): any {
  if (!ingredientName) return null;
  const product = matchProduct(catalogFor(db), ingredientName);
  return product ? product.item : null;
}

/** +/- step for an item on the shopping list. */
export function getIngredientStep(item: { name: string; unit?: string; amount?: number; category?: string; groceryId?: string }): number {
  return stepForItem(getCatalog(), item);
}

/**
 * A recipe amount ("200 g chopped tomatoes", "3 cloves garlic") as a shopping
 * quantity ("1 can", "1 bulb").
 */
export function convertToShoppingQuantity(
  name: string,
  rawAmount: number,
  rawUnit: string = '',
  category: string = ''
): { amount: number; unit: string; step: number; category?: string; checkCupboard?: boolean; needsCheck?: boolean; quantityNote?: string; groceryId?: string } {
  const r = shoppingQuantityFor(getCatalog(), name, rawAmount, rawUnit, category);
  return {
    amount: r.amount,
    unit: r.unit,
    step: r.step,
    category: r.category || category,
    checkCupboard: r.cupboard || undefined,
    needsCheck: r.needsCheck || undefined,
    quantityNote: r.note,
    groceryId: r.productId,
  };
}

/** Something added to the list by hand: `count` packs of it (1 = one pack of milk, one 400 g can, six eggs...). */
export function quantityForAddedItem(name: string, count = 1): { amount: number; unit: string; step: number; category?: string; name: string; groceryId?: string } {
  const r = addedItemQuantity(getCatalog(), name, count);
  return { amount: r.amount, unit: r.unit, step: r.step, category: r.category, name: r.name, groceryId: r.productId };
}

/** Store-cupboard staple (oil, salt, spices...)? */
export function isSauceOrCondiment(name: string): boolean {
  return Boolean(matchProduct(getCatalog(), name)?.cupboard);
}

export function isMincedMeat(name: string): boolean {
  return /\b(mince|minced|ground (beef|pork|lamb|turkey|chicken))\b/.test(normalizeIngredientName(name));
}

export function isCannedTomatoOrPulse(name: string): boolean {
  const p = matchProduct(getCatalog(), name);
  return Boolean(p && (p.buyUnit === 'can' || p.per.can !== undefined));
}
