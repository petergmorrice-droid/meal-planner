// Building a week's ingredients on the shopping list. Used by Planning ("Send to shopping list",
// "Update list") and by Shop's "Planning has changed" note.
import { MealPlan, Recipe, RecurringItem, ShoppingListItem } from './types';
import { generateShoppingListForPlan, getCurrentMondayStr, getNextMondayStr, formatWeekRange } from './utils';
import { listSnapshot } from './planning';
import type { AppStore } from './store';

export function weekLabelFor(startDate: string): string {
  return startDate === getCurrentMondayStr() ? 'This Week' : startDate === getNextMondayStr() ? 'Next Week' : formatWeekRange(startDate);
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
  store.updateShoppingList((list, s) => listWithWeek(list, sentPlan, s.recipes, s.preferences?.recurringItems || [], removed));
}

/** The shopping list with this week's staples and meal ingredients brought up to date (see above). */
export function listWithWeek(
  list: ShoppingListItem[], plan: MealPlan, recipes: Recipe[], staples: RecurringItem[], dismissedItemIds: string[],
): ShoppingListItem[] {
  const targetItems = generateShoppingListForPlan(plan, recipes);
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
        id: itemId, name: rec.name, amount: rec.amount, unit: rec.unit, category: rec.category,
        checked: false, isAdhoc: false, isRecurring: true, planId: plan.id,
        weekLabel: `Week of ${weekLabelFor(plan.startDate)}`,
      } as ShoppingListItem);
    } else if (!existing.userAdjusted) {
      recurringItemsToKeep.push({ ...existing, name: rec.name, amount: rec.amount, unit: rec.unit, category: rec.category });
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
      syncedMealItems.push({ ...existing, amount: keep ? existing.amount : target.amount, unit: keep ? existing.unit : target.unit, recipeNames: target.recipeNames, neededText: target.neededText });
    } else if (!dismissedItemIds.includes(target.id)) {
      syncedMealItems.push(target);
    }
  });

  const otherWeeksItems = list.filter((i) => i.planId !== plan.id);
  return [...otherWeeksItems, ...adhocOrBatchItems, ...recurringItemsToKeep, ...syncedMealItems];
}
