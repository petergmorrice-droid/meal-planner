/** Keeps the list right by itself while the Shop is open. */
import { useEffect } from 'react';
import { MealPlan, ShoppingListItem } from '../../types';
import { matchProduct, catalogForState } from '../../shopping';
import { fitHandAddedToProducts } from '../../shopList';
import { syncRecurringStaplesForPlan } from '../../utils';
import type { AppStore } from '../../store';

export function useListUpkeep(store: AppStore, activePlan: MealPlan | null, dismissedItemIds: string[]) {
  // Weekly staples are on this week's list (and in step with what you set them to).
  useEffect(() => {
    if (!activePlan) return;
    const recurringPrefs = store.state.preferences?.recurringItems || [];
    if (recurringPrefs.length === 0) return;

    const currentList: ShoppingListItem[] = store.state.shoppingList || [];
    const syncedList = syncRecurringStaplesForPlan(activePlan, currentList, recurringPrefs, dismissedItemIds);

    const hasDiff =
      syncedList.length !== currentList.length ||
      syncedList.some((item, idx) => {
        const cur = currentList[idx];
        return !cur || cur.id !== item.id || cur.amount !== item.amount || cur.unit !== item.unit;
      });

    if (hasDiff) {
      store.updateShoppingList(syncedList);
    }
  }, [activePlan?.id, store.state.preferences?.recurringItems, dismissedItemIds]);

  // Things added as a bare number before they were saved as products ("1" Belvita) are put in the
  // unit the product is sold in ("1 pack"), so they add up with the next one ("2 packs", not "1 + 1 pack").
  useEffect(() => {
    const now = store.getState?.() || store.state;
    const list: ShoppingListItem[] = now.shoppingList || [];
    const catalog = catalogForState(now);
    const fitted = fitHandAddedToProducts(list, (i) => {
      const p = matchProduct(catalog, i.name, { groceryId: i.groceryId });
      return p && p.id === i.groceryId ? p : null;
    });
    if (fitted !== list) store.updateShoppingList(fitted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.state.shoppingList, store.state.groceryDatabase]);
}
