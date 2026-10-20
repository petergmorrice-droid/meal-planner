/**
 * Changes to the shopping list, as plain functions: each takes the list and gives back the new one
 * (the Shop screen saves it). Kept apart from the screen so they're easy to read and to test.
 */
import { ShoppingListItem, MealPlan, Recipe, RecurringItem } from './types';
import { canonicalUnit, formatUnit } from './shopping';
import type { Product } from './shopping/catalog';
import { formatWeekRange, generateShoppingListForPlan, syncRecurringStaplesForPlan, quantityForAddedItem, convertToShoppingQuantity } from './utils';
import { productKey, inProductUnit } from './shopList';

type List = ShoppingListItem[];

/** A line typed in the add box or picked from a product. */
export interface HandLine { name: string; amount: number; unit: string; category?: string; groceryId?: string }

/** Change these lines. */
export function patchLines(list: List, ids: string[], patch: (i: ShoppingListItem) => ShoppingListItem): List {
  const idSet = new Set(ids);
  return list.map((i) => (idSet.has(i.id) ? patch(i) : i));
}

/** Take these lines off. */
export function removeLines(list: List, ids: string[]): List {
  const idSet = new Set(ids);
  return list.filter((i) => !idSet.has(i.id));
}

/**
 * Tick (or untick) these lines. Who ticked it shows on the other phone; ticking something
 * "out of stock" means it was there after all.
 */
export function tickLines(list: List, ids: string[], forceState: boolean | undefined, me: string): List {
  return list.map((item) => {
    if (!ids.includes(item.id)) return item;
    const checked = forceState !== undefined ? forceState : !item.checked;
    const { checkedBy: _by, outOfStock: _out, ...rest } = item;
    return checked ? { ...rest, checked, checkedBy: me } : { ...rest, checked };
  });
}

/** Out of stock at the shop: not ticked, and not counted against the % done. */
export function markOutOfStock(list: List, ids: string[], value: boolean): List {
  const idSet = new Set(ids);
  return list.map((item) => {
    if (!idSet.has(item.id)) return item;
    const { outOfStock: _out, checkedBy: _by, ...rest } = item;
    return value ? { ...rest, checked: false, outOfStock: true } : { ...rest };
  });
}

/** Cupboard check: 'have' takes it off this week's list, 'need' keeps it (and stops asking), null asks again. */
export function answerCupboard(list: List, ids: string[], answer: 'have' | 'need' | null): List {
  const idSet = new Set(ids);
  return list.map((i) => {
    if (!idSet.has(i.id)) return i;
    if (answer) return { ...i, cupboard: answer };
    const { cupboard: _c, ...rest } = i;
    return rest as ShoppingListItem;
  });
}

/** Set how much of a line. userAdjusted: you chose it (so sending the week again doesn't change it back). */
export function setLineAmount(list: List, id: string, amount: number, userAdjusted: boolean): List {
  return list.map((i) => (i.id === id ? { ...i, amount, userAdjusted } : i));
}

/** Set how much and in what (from the item panel). */
export function setLineAmountAndUnit(list: List, id: string, amount: number, unit: string): List {
  return list.map((i) => (i.id === id ? { ...i, amount: Math.max(0.01, amount), unit, userAdjusted: true } : i));
}

/** One step more or less of a line (never below one step), keeping its unit: just "1 can" / "2 cans". */
export function stepLine(list: List, id: string, step: number, dir: number): List {
  const change = dir < 0 ? -step : step;
  return list.map((i) => {
    if (i.id !== id) return i;
    const newAmount = Math.max(step, (i.amount || 1) + change);
    const rawUnit = (i.unit || '').toLowerCase().trim();
    const unit = /^items?$/.test(rawUnit) ? (newAmount === 1 ? 'item' : 'items') : formatUnit(canonicalUnit(i.unit), newAmount);
    return { ...i, amount: newAmount, unit, userAdjusted: true };
  });
}

/**
 * Lines typed or picked: added to something you already added by hand this week (same unit), or as
 * new lines. Something added before as a bare number ("1") and now as the product ("1 pack") is the
 * same thing, so it's put the product's way first. Gives back the lines' ids.
 */
export function addHandLines(list: List, plan: MealPlan, lines: HandLine[], productFor: (line: HandLine) => Product | null): { list: List; ids: string[] } {
  const out: List = [...list];
  const ids: string[] = [];
  for (const line of lines) {
    const key = productKey(line);
    const idx = out.findIndex((i) => i.planId === plan.id && i.isAdhoc && !i.isRecurring && !i.checked && productKey(i) === key);
    if (idx > -1 && line.groceryId && canonicalUnit(out[idx].unit) !== canonicalUnit(line.unit)) {
      const product = productFor(line);
      const fitted = product ? inProductUnit(out[idx], line.unit, product.buyUnit === canonicalUnit(line.unit) ? product.step : 1) : null;
      if (fitted) out[idx] = { ...out[idx], ...fitted, groceryId: line.groceryId };
    }
    if (idx > -1 && canonicalUnit(out[idx].unit) === canonicalUnit(line.unit)) {
      ids.push(out[idx].id);
      const amount = Math.round((out[idx].amount + line.amount) * 100) / 100;
      out[idx] = { ...out[idx], amount, unit: /^items?$/i.test(out[idx].unit || '') ? (amount === 1 ? 'item' : 'items') : formatUnit(canonicalUnit(line.unit), amount) };
    } else {
      const id = crypto.randomUUID();
      ids.push(id);
      out.push({
        id,
        name: line.name,
        amount: line.amount,
        unit: line.unit,
        category: line.category || '',
        ...(line.groceryId ? { groceryId: line.groceryId } : {}),
        checked: false,
        isAdhoc: true,
        isBatch: false,
        planId: plan.id,
        weekLabel: `Week of ${formatWeekRange(plan.startDate)}`,
      });
    }
  }
  return { list: out, ids };
}

/** From the products list: more of something already on this week's list (same unit), or a new line. */
export function addCatalogItems(list: List, plan: MealPlan, items: { name: string; amount: number; category?: string }[]): { list: List; total: number } {
  const weekLabel = `Week of ${formatWeekRange(plan.startDate)}`;
  const out: List = [...list];
  let total = 0;
  items.forEach((newItem) => {
    const existingIndex = out.findIndex((item) =>
      !item.checked && item.planId === plan.id && item.name.toLowerCase() === newItem.name.toLowerCase());
    const converted = quantityForAddedItem(newItem.name, newItem.amount);
    if (existingIndex > -1) {
      const existing = out[existingIndex];
      // Same unit: add whole packs. Different unit (older items): leave the amount and let the user adjust.
      const sameUnit = canonicalUnit(existing.unit) === canonicalUnit(converted.unit);
      const newAmount = sameUnit ? Math.round((existing.amount + converted.amount) * 100) / 100 : existing.amount;
      out[existingIndex] = {
        ...existing,
        amount: newAmount,
        unit: sameUnit ? formatUnit(canonicalUnit(converted.unit), newAmount) : existing.unit,
      };
    } else {
      out.push({
        id: crypto.randomUUID(),
        name: newItem.name,
        amount: converted.amount,
        unit: converted.unit || (converted.amount === 1 ? 'item' : 'items'),
        category: newItem.category || converted.category || '',
        groceryId: converted.groceryId,
        checked: false,
        isAdhoc: true,
        isBatch: false,
        planId: plan.id,
        weekLabel,
      });
    }
    total += newItem.amount;
  });
  return { list: out, total };
}

/** A recipe's ingredients (an extra recipe, not on the plan): added up with what's already there for it. */
export function addRecipeIngredients(
  list: List,
  plan: MealPlan,
  mealName: string,
  ingredients: { name: string; amount: number; unit: string; category?: string }[],
): { list: List; count: number } {
  const weekLabel = `Week of ${formatWeekRange(plan.startDate)} (Batch)`;
  const out: List = [...list];
  let count = 0;
  ingredients.forEach((ing) => {
    const converted = convertToShoppingQuantity(ing.name, ing.amount, ing.unit, ing.category);
    const existingIdx = out.findIndex((item) =>
      item.planId === plan.id &&
      item.isBatch &&
      item.batchRecipeName?.toLowerCase() === mealName.toLowerCase() &&
      item.name.toLowerCase().trim() === ing.name.toLowerCase().trim() &&
      !item.checked &&
      item.unit === converted.unit);
    if (existingIdx > -1) {
      out[existingIdx] = { ...out[existingIdx], amount: Math.round((out[existingIdx].amount + converted.amount) * 10) / 10 };
    } else {
      out.push({
        id: crypto.randomUUID(),
        name: ing.name,
        amount: converted.amount,
        unit: converted.unit || ing.unit || 'item',
        category: converted.category || ing.category || '',
        groceryId: converted.groceryId,
        checkCupboard: converted.checkCupboard,
        needsCheck: converted.needsCheck,
        quantityNote: converted.quantityNote,
        checked: false,
        isAdhoc: false,
        isBatch: true,
        batchRecipeName: mealName,
        planId: plan.id,
        weekLabel,
      });
    }
    count++;
  });
  return { list: out, count };
}

/**
 * "Bring back meal ingredients you removed": this week's staples come back, and (once the week has
 * been sent) its meal ingredients too, keeping any amounts you changed.
 */
export function restoreRemoved(list: List, plan: MealPlan, recipes: Recipe[], staples: RecurringItem[]): List {
  // Passing no removed ids re-adds all the staples.
  let baseList: List = [...list];
  if (staples.length > 0) baseList = syncRecurringStaplesForPlan(plan, baseList, staples, []);
  if (plan.status !== 'finalized') return baseList;

  const targetItems = generateShoppingListForPlan(plan, recipes);
  const existingItemsForPlan = baseList.filter((i) => i.planId === plan.id);
  const adhocOrBatchItems = existingItemsForPlan.filter((i) => i.isAdhoc || i.isBatch);
  const existingMealItems = existingItemsForPlan.filter((i) => !i.isAdhoc && !i.isBatch && !i.isRecurring);
  const existingRecurring = existingItemsForPlan.filter((i) => i.isRecurring);

  const syncedMealItems: List = [];
  targetItems.forEach((target) => {
    const key = target.name.toLowerCase().trim();
    const existing = existingMealItems.find((e) => e.name.toLowerCase().trim() === key);
    if (existing) {
      const keepUserAmount = existing.userAdjusted;
      syncedMealItems.push({
        ...existing,
        amount: keepUserAmount ? existing.amount : target.amount,
        unit: keepUserAmount ? existing.unit : target.unit,
        recipeNames: target.recipeNames,
        neededText: target.neededText,
      });
    } else {
      syncedMealItems.push(target);
    }
  });

  const otherWeeksItems = baseList.filter((i) => i.planId !== plan.id);
  return [...otherWeeksItems, ...adhocOrBatchItems, ...existingRecurring, ...syncedMealItems];
}
