// Building a week's ingredients on the shopping list. Used by Planning ("Send to shopping list",
// "Update list") and by Shop's "Planning has changed" note.
import { MealPlan, ShoppingListItem } from './types';
import { generateShoppingListForPlan, getCurrentMondayStr, getNextMondayStr, formatWeekRange } from './utils';
import { listSnapshot } from './planning';

export function weekLabelFor(startDate: string): string {
  return startDate === getCurrentMondayStr() ? 'This Week' : startDate === getNextMondayStr() ? 'Next Week' : formatWeekRange(startDate);
}

/**
 * Put this week's meals on the shopping list, keeping other weeks, items added by hand, staples
 * you've adjusted and anything either of you removed. Then remember what the list was made from,
 * so later changes to the week can be spotted ("Shopping list out of date").
 */
export function sendWeekToShoppingList(store: any, plan: MealPlan) {
  const sentPlan: MealPlan = { ...plan, status: 'finalized', lastFinalizedSnapshot: listSnapshot(plan) };
  store.updateMealPlan(sentPlan);

  const targetItems = generateShoppingListForPlan(sentPlan, store.state.recipes);
  const dismissedItemIds: string[] = store.dismissedShoppingItemIds || [];
  const currentShoppingList: ShoppingListItem[] = [...(store.state.shoppingList || [])];
  const existingItemsForPlan = currentShoppingList.filter((i) => i.planId === plan.id);
  const adhocOrBatchItems = existingItemsForPlan.filter((i) => i.isAdhoc || i.isBatch);
  const existingMealItems = existingItemsForPlan.filter((i) => !i.isAdhoc && !i.isBatch && !i.isRecurring);

  // 1. Weekly staples
  const prefsRecurring = store.state.preferences?.recurringItems || [];
  const recurringItemsToKeep: ShoppingListItem[] = [];
  const existingRecurring = existingItemsForPlan.filter((i) => i.isRecurring);
  prefsRecurring.forEach((rec: any) => {
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

  const otherWeeksItems = currentShoppingList.filter((i) => i.planId !== plan.id);
  store.updateShoppingList([...otherWeeksItems, ...adhocOrBatchItems, ...recurringItemsToKeep, ...syncedMealItems]);
}
