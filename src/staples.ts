/**
 * Weekly staples: things that go on every week's list by themselves (shared between phones).
 *
 * One way to make, change and remove them, so wherever it happens (the staples window, "Add
 * every week?", saving a new product as a staple) a staple looks the same, there's never two of
 * the same thing, every week's list follows, and lines either of you took off a week stay off.
 */
import { MealPlan, RecurringItem, ShoppingListItem } from './types';
import { canonicalUnit, formatUnit, matchProduct, aisleCategory } from './shopping';
import type { Catalog } from './shopping/catalog';
import { GROCERY_AISLES, getGroceryAisle, syncRecurringStaplesForAllPlans } from './utils';
import { stapleQuantity, stapleTakesOver } from './shopList';
import type { AppStore } from './store';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The unit as it reads for the amount: "1 item" / "2 items", "2 pints", "250 g". */
export function stapleUnit(unit: string, amount: number): string {
  const u = canonicalUnit(unit);
  return u === 'each' ? (amount === 1 ? 'item' : 'items') : formatUnit(u, amount);
}

/** A new staple. Its aisle is the one given, else worked out from the name. */
export function newStaple({ name, amount, unit, category }: { name: string; amount: number; unit: string; category?: string }): RecurringItem {
  const clean = name.trim();
  return {
    id: crypto.randomUUID(),
    name: clean,
    amount,
    unit: stapleUnit(unit, amount),
    category: category || GROCERY_AISLES[getGroceryAisle({ name: clean })].name,
  };
}

/**
 * A staple for something typed in the staples window: one pack of the product it matches (its
 * name, unit and aisle: "Butter" is 250 g, "Eggs" 6), or what was typed, 1 of, in its likely aisle.
 */
export function stapleFor(catalog: Catalog, typed: string): RecurringItem {
  const item = matchProduct(catalog, typed)?.item;
  if (!item) return newStaple({ name: typed, amount: 1, unit: 'item' });
  const q = stapleQuantity(item.unit || 'item', item.increment || 1, 1);
  return newStaple({ name: item.name, amount: q.amount, unit: q.unit, category: aisleCategory(item) || GROCERY_AISLES.pantry_spices.name });
}

/** The staple with this name, if there is one. */
export const findStaple = (staples: RecurringItem[], name: string) => staples.find((s) => sameName(s.name, name));

/** Add a staple, unless there's one of that name already (then that one is kept). */
export function addStaple(staples: RecurringItem[], staple: RecurringItem): { staples: RecurringItem[]; staple: RecurringItem; added: boolean } {
  const existing = findStaple(staples, staple.name);
  if (existing) return { staples, staple: existing, added: false };
  return { staples: [...staples, staple], staple, added: true };
}

export const removeStaple = (staples: RecurringItem[], id: string) => staples.filter((s) => s.id !== id);

export function changeStaple(staples: RecurringItem[], id: string, patch: Partial<Omit<RecurringItem, 'id'>>): RecurringItem[] {
  return staples.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** One step more or less (a pack: 250 g of butter, 6 eggs), never below one step. */
export function stepStaple(staples: RecurringItem[], id: string, dir: number, step: number): RecurringItem[] {
  return staples.map((s) => {
    if (s.id !== id) return s;
    const change = dir < 0 ? -step : step;
    const amount = Math.round(Math.max(step, (s.amount || 1) + change) * 100) / 100;
    return { ...s, amount, unit: stapleUnit(s.unit, amount) };
  });
}

/**
 * Every week's list (this week on) with these staples on it. Lines either of you took off a week
 * stay off. `takeOver`: something added by hand that has just become this staple, whose line
 * the staple's own line replaces (so it isn't on the list twice).
 */
export function listWithStaples(
  plans: MealPlan[], list: ShoppingListItem[], staples: RecurringItem[], removedIds: string[],
  takeOver?: { staple: RecurringItem; isSame: (i: ShoppingListItem) => boolean },
): ShoppingListItem[] {
  const synced = syncRecurringStaplesForAllPlans(plans, list, staples, removedIds);
  return takeOver ? stapleTakesOver(synced, takeOver.staple.id, takeOver.isSame) : synced;
}

/** The staples as they are now (the latest, even if the screen hasn't caught up yet). */
export function currentStaples(store: AppStore): RecurringItem[] {
  return (store.getState?.() || store.state).preferences?.recurringItems || [];
}

/**
 * Save the staples (shared) and bring every week's list in line with them.
 * `list`: start from this list instead of the saved one; `alsoPreferences`: other preferences
 * saved in the same change.
 */
export function saveStaples(store: AppStore, staples: RecurringItem[], opts: {
  list?: ShoppingListItem[];
  takeOver?: { staple: RecurringItem; isSame: (i: ShoppingListItem) => boolean };
  alsoPreferences?: Record<string, unknown>;
} = {}) {
  const now = store.getState?.() || store.state;
  const list = listWithStaples(now.mealPlans || [], opts.list || now.shoppingList || [], staples, store.dismissedShoppingItemIds || [], opts.takeOver);
  store.updatePreferences({ ...opts.alsoPreferences, recurringItems: staples });
  if (store.updateShoppingList) store.updateShoppingList(list);
}
