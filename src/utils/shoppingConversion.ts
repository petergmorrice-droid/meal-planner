/**
 * Shopping quantity helpers used around the app.
 *
 * All the real logic (standard units, product matching, pack rounding) lives in
 * src/shopping. These functions keep the names the screens already use.
 */
import {
  shoppingQuantityFor,
  quantityForAddedItem as addedItemQuantity,
  stepForItem,
  currentCatalog,
  type Catalog,
} from '../shopping';

// --- The household's products right now (kept up to date by the store; see shopping/current.ts) ---
export function getCatalog(): Catalog {
  return currentCatalog();
}

/** Lower-case, trimmed, single-spaced name (for simple comparisons). */
export function normalizeIngredientName(name: string): string {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** +/- step for an item on the shopping list. */
export function getIngredientStep(item: {
  name: string;
  unit?: string;
  amount?: number;
  category?: string;
  groceryId?: string;
}): number {
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
  category: string = '',
): {
  amount: number;
  unit: string;
  step: number;
  category?: string;
  checkCupboard?: boolean;
  needsCheck?: boolean;
  quantityNote?: string;
  groceryId?: string;
} {
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
export function quantityForAddedItem(
  name: string,
  count = 1,
): { amount: number; unit: string; step: number; category?: string; name: string; groceryId?: string } {
  const r = addedItemQuantity(getCatalog(), name, count);
  return { amount: r.amount, unit: r.unit, step: r.step, category: r.category, name: r.name, groceryId: r.productId };
}
