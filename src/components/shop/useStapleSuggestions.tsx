/** Things you add by hand most weeks: "Add every week?" (make it a weekly staple). */
import React, { useMemo, useState } from 'react';
import { MealPlan, RecurringItem } from '../../types';
import { canonicalUnit, formatUnit } from '../../shopping';
import { suggestedStaples, StapleSuggestion, stapleTakesOver, productKey, shopQuantityText } from '../../shopList';
import { GROCERY_AISLES, getGroceryAisle, getIngredientStep, syncRecurringStaplesForAllPlans } from '../../utils';
import StapleSuggestSheet from './StapleSuggestSheet';
import type { ShopToastState } from './ShopToast';

export function useStapleSuggestions({ store, activePlan, dismissedItemIds, setToastMessage }: {
  store: any;
  activePlan: MealPlan | null;
  dismissedItemIds: string[];
  setToastMessage: (message: string | null, action?: ShopToastState['action']) => void;
}) {
  const declinedStaples = store.state.preferences?.notStaples;
  const suggestions = useMemo(
    () => (activePlan ? suggestedStaples(store.state.shoppingList || [], { thisWeek: activePlan.startDate, staples: store.state.preferences?.recurringItems || [], declined: declinedStaples }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.state.shoppingList, activePlan?.startDate, store.state.preferences?.recurringItems, declinedStaples, store.state.groceryDatabase],
  );
  const [stapleOffer, setStapleOffer] = useState<StapleSuggestion | null>(null);

  const acceptStaple = (s: StapleSuggestion, amount: number) => {
    const now = store.getState?.() || store.state;
    const recurring: RecurringItem[] = now.preferences?.recurringItems || [];
    const u = canonicalUnit(s.unit);
    const unit = u === 'each' ? (amount === 1 ? 'item' : 'items') : formatUnit(u, amount);
    const rec: RecurringItem = { id: crypto.randomUUID(), name: s.name, amount, unit, category: s.category || GROCERY_AISLES[getGroceryAisle({ name: s.name })].name };
    const next = [...recurring, rec];
    store.updatePreferences({ recurringItems: next });
    // This week's (and later weeks') line you added by hand becomes the staple's line.
    store.updateShoppingList(stapleTakesOver(syncRecurringStaplesForAllPlans(now.mealPlans || [], now.shoppingList || [], next, dismissedItemIds), rec.id, (i) => productKey(i) === s.key));
    setStapleOffer(null);
    setToastMessage(`${s.name} is now a weekly staple: ${shopQuantityText({ amount, unit })} every week`);
  };

  const declineStaple = (s: StapleSuggestion) => {
    const now = store.getState?.() || store.state;
    const cur: string[] = now.preferences?.notStaples || [];
    const key = s.name.trim().toLowerCase();
    if (!cur.includes(key)) store.updatePreferences({ notStaples: [...cur, key] });
    setStapleOffer(null);
    setToastMessage(`OK, won't suggest ${s.name} as a staple again`);
  };

  const sheet = stapleOffer && (
    <StapleSuggestSheet
      key={stapleOffer.key}
      suggestion={stapleOffer}
      step={getIngredientStep({ name: stapleOffer.name, unit: stapleOffer.unit, groceryId: stapleOffer.groceryId })}
      onAdd={(amount) => acceptStaple(stapleOffer, amount)}
      onDecline={() => declineStaple(stapleOffer)}
      onClose={() => setStapleOffer(null)}
    />
  );

  return { suggestions, offer: setStapleOffer, sheet };
}
