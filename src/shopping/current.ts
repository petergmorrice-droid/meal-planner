/**
 * The household's product list as it is right now, for code outside React (matching list items to
 * products, working out pack sizes). The store tells it whenever the products change; until then
 * (or in tests) it reads what this phone last saved, or uses the built-in list.
 */
import type { GroceryItem } from '../types';
import { buildCatalog, Catalog } from './catalog';

type Source = { db: GroceryItem[] | null; overrides: Record<string, Partial<GroceryItem>> | null };
let source: Source | null = null;
let cached: Catalog | null = null;

/** Called by the store whenever the product list (or old-style overrides) changes. */
export function setCurrentProducts(db: GroceryItem[] | null | undefined, overrides?: Record<string, Partial<GroceryItem>> | null): void {
  const next: Source = { db: Array.isArray(db) ? db : null, overrides: overrides ?? null };
  if (source && source.db === next.db && source.overrides === next.overrides) return;
  source = next;
  cached = null;
}

function readSaved(): Source {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { db: null, overrides: null };
    const raw = window.localStorage.getItem('mealPlannerAppStateCache') || window.localStorage.getItem('mealPlannerState');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { db: parsed?.groceryDatabase ?? null, overrides: parsed?.groceryOverrides ?? null };
    }
  } catch {
    // the built-in list
  }
  return { db: null, overrides: null };
}

/** The catalogue built from the current products (built once per change). */
export function currentCatalog(): Catalog {
  if (!cached) {
    if (!source) source = readSaved();
    cached = buildCatalog(source.db, source.overrides);
  }
  return cached;
}
