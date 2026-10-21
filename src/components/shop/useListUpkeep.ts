/** Keeps the list right by itself while the Shop is open. */
import { useEffect, useEffectEvent } from 'react';
import { MealPlan } from '../../types';
import { matchProduct, catalogForState } from '../../shopping';
import { fitHandAddedToProducts } from '../../shopList';
import { syncRecurringStaplesForPlan } from '../../utils';
import type { AppStore } from '../../store';

export function useListUpkeep(store: AppStore, activePlan: MealPlan | null, dismissedItemIds: string[]) {
  // Weekly staples are on this week's list (and in step with what you set them to): checked when
  // the week, your staples or the lines you've removed change.
  const staples = store.state.preferences?.recurringItems;
  const syncStaples = useEffectEvent(() => {
    if (!activePlan) return;
    if ((staples || []).length === 0) return;
    // From the latest list and staples; nothing is saved if nothing changes.
    store.updateShoppingList((currentList, s) => {
      const recurringPrefs = s.preferences?.recurringItems || [];
      if (recurringPrefs.length === 0) return currentList;
      const syncedList = syncRecurringStaplesForPlan(activePlan, currentList, recurringPrefs, dismissedItemIds);
      const hasDiff =
        syncedList.length !== currentList.length ||
        syncedList.some((item, idx) => {
          const cur = currentList[idx];
          return !cur || cur.id !== item.id || cur.amount !== item.amount || cur.unit !== item.unit;
        });
      return hasDiff ? syncedList : currentList;
    });
  });
  useEffect(() => {
    syncStaples();
  }, [activePlan?.id, staples, dismissedItemIds]);

  // Things added as a bare number before they were saved as products ("1" Belvita) are put in the
  // unit the product is sold in ("1 pack"), so they add up with the next one ("2 packs", not "1 + 1 pack").
  // Checked whenever the list or the products change.
  const { shoppingList, groceryDatabase } = store.state;
  const fitToProducts = useEffectEvent(() => {
    store.updateShoppingList((list, now) => {
      const catalog = catalogForState(now);
      return fitHandAddedToProducts(list, (i) => {
        const p = matchProduct(catalog, i.name, { groceryId: i.groceryId });
        return p && p.id === i.groceryId ? p : null;
      });
    });
  });
  useEffect(() => {
    fitToProducts();
  }, [shoppingList, groceryDatabase]);
}
