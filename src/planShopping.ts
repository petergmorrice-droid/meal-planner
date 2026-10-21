// Building a week's ingredients on the shopping list. Used by Planning ("Send to shopping list",
// "Update list") and by Shop's "Planning has changed" note.
import { MealPlan, Recipe, RecurringItem, ShoppingListItem } from './types';
import { generateShoppingListForPlan, getCurrentMondayStr, getNextMondayStr, formatWeekRange } from './utils';
import { listSnapshot } from './planning';
import type { Catalog } from './shopping';
import type { AppStore } from './store';

export function weekLabelFor(startDate: string): string {
  return startDate === getCurrentMondayStr()
    ? 'This Week'
    : startDate === getNextMondayStr()
      ? 'Next Week'
      : formatWeekRange(startDate);
}

/**
 * Put this week's meals on the shopping list, keeping other weeks, items added by hand, staples
 * you've adjusted and anything either of you removed. Then remember what the list was made from,
 * so later changes to the week can be spotted ("Shopping list out of date"). Works from the
 * latest copy of the week and the list (the screen's may be a moment behind).
 */
export function sendWeekToShoppingList(store: AppStore, plan: MealPlan) {
  const latest = store.getState().mealPlans.find((p) => p.id === plan.id) || plan;
  const sentPlan: MealPlan = { ...latest, status: 'finalized', lastFinalizedSnapshot: listSnapshot(latest) };
  store.updateMealPlan(sentPlan);
  const removed: string[] = store.dismissedShoppingItemIds || [];
  store.updateShoppingList((list, s) =>
    listWithWeek(list, sentPlan, s.recipes, s.preferences?.recurringItems || [], removed),
  );
}

/** The shopping list with this week's staples and meal ingredients brought up to date (see above). */
export function listWithWeek(
  list: ShoppingListItem[],
  plan: MealPlan,
  recipes: Recipe[],
  staples: RecurringItem[],
  dismissedItemIds: string[],
  catalog?: Catalog,
): ShoppingListItem[] {
  const targetItems = generateShoppingListForPlan(plan, recipes, catalog);
  const existingItemsForPlan = list.filter((i) => i.planId === plan.id);
  const adhocOrBatchItems = existingItemsForPlan.filter((i) => i.isAdhoc || i.isBatch);
  const existingMealItems = existingItemsForPlan.filter((i) => !i.isAdhoc && !i.isBatch && !i.isRecurring);

  // 1. Weekly staples
  const recurringItemsToKeep: ShoppingListItem[] = [];
  const existingRecurring = existingItemsForPlan.filter((i) => i.isRecurring);
  staples.forEach((rec) => {
    const itemId = `recurring-${plan.id}-${rec.id}`;
    if (dismissedItemIds.includes(itemId)) return;
    const existing = existingRecurring.find((i) => i.id === itemId);
    if (!existing) {
      recurringItemsToKeep.push({
        id: itemId,
        name: rec.name,
        amount: rec.amount,
        unit: rec.unit,
        category: rec.category,
        checked: false,
        isAdhoc: false,
        isRecurring: true,
        planId: plan.id,
        weekLabel: `Week of ${weekLabelFor(plan.startDate)}`,
      } as ShoppingListItem);
    } else if (!existing.userAdjusted) {
      recurringItemsToKeep.push({
        ...existing,
        name: rec.name,
        amount: rec.amount,
        unit: rec.unit,
        category: rec.category,
      });
    } else {
      recurringItemsToKeep.push(existing);
    }
  });

  // 2. The meals' ingredients (keeping amounts you changed by hand, and ticks)
  const syncedMealItems: ShoppingListItem[] = [];
  targetItems.forEach((target) => {
    const key = target.name.toLowerCase().trim();
    const existing = existingMealItems.find((e) => e.name.toLowerCase().trim() === key);
    if (existing) {
      const keep = existing.userAdjusted;
      const line: ShoppingListItem = {
        ...existing,
        amount: keep ? existing.amount : target.amount,
        unit: keep ? existing.unit : target.unit,
        recipeNames: target.recipeNames,
        neededText: target.neededText,
      };
      // "Check amount" goes with the amount it was about: worked out again, it's checked again.
      if (!keep) {
        delete line.needsCheck;
        delete line.quantityNote;
        if (target.needsCheck) line.needsCheck = true;
        if (target.quantityNote) line.quantityNote = target.quantityNote;
      }
      syncedMealItems.push(line);
    } else if (!dismissedItemIds.includes(target.id)) {
      syncedMealItems.push(target);
    }
  });

  const otherWeeksItems = list.filter((i) => i.planId !== plan.id);
  return [...otherWeeksItems, ...adhocOrBatchItems, ...recurringItemsToKeep, ...syncedMealItems];
}

/**
 * Lines on a sent week's list whose amount no longer matches what the meals need, because a recipe
 * or a product changed after the week was sent, or the app now works the amount out better (a
 * "400 g can" that used to need checking). Lines you've bought, or changed by hand, don't count;
 * meals added or taken off are the planner's "changed since" note instead. Returns their names.
 */
export function mealLinesOutOfDate(
  list: ShoppingListItem[],
  plan: MealPlan,
  recipes: Recipe[],
  staples: RecurringItem[],
  dismissedItemIds: string[],
  catalog?: Catalog,
): string[] {
  if (plan.status !== 'finalized') return [];
  const isMeal = (i: ShoppingListItem) => i.planId === plan.id && !i.isAdhoc && !i.isBatch && !i.isRecurring;
  const updated = new Map(
    listWithWeek(list, plan, recipes, staples, dismissedItemIds, catalog)
      .filter(isMeal)
      .map((i) => [i.id, i]),
  );
  return list
    .filter((i) => isMeal(i) && !i.checked && !i.userAdjusted)
    .filter((i) => {
      const next = updated.get(i.id);
      return next && (next.amount !== i.amount || next.unit !== i.unit || !!next.needsCheck !== !!i.needsCheck);
    })
    .map((i) => i.name);
}
