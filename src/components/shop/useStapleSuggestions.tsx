/** Things you add by hand most weeks: "Add every week?" (make it a weekly staple). */
import { useMemo, useState } from 'react';
import { MealPlan } from '../../types';
import { suggestedStaples, StapleSuggestion, productKey, shopQuantityText } from '../../shopList';
import { getIngredientStep } from '../../utils';
import { catalogForState } from '../../shopping';
import { addStaple, currentStaples, newStaple, saveStaples } from '../../staples';
import StapleSuggestSheet from './StapleSuggestSheet';
import type { ShopToastState } from './ShopToast';
import type { AppStore } from '../../store';

export function useStapleSuggestions({
  store,
  activePlan,
  setToastMessage,
}: {
  store: AppStore;
  activePlan: MealPlan | null;
  setToastMessage: (message: string | null, action?: ShopToastState['action']) => void;
}) {
  const declinedStaples = store.state.preferences?.notStaples;
  const { shoppingList } = store.state;
  const stapleList = store.state.preferences?.recurringItems;
  const thisWeek = activePlan?.startDate;
  // The products as they are now (the same object until a product changes).
  const catalog = catalogForState(store.state);
  const suggestions = useMemo(
    () =>
      thisWeek
        ? suggestedStaples(shoppingList || [], {
            thisWeek,
            staples: stapleList || [],
            declined: declinedStaples,
            catalog,
          })
        : [],
    [shoppingList, thisWeek, stapleList, declinedStaples, catalog],
  );
  const [stapleOffer, setStapleOffer] = useState<StapleSuggestion | null>(null);

  const acceptStaple = (s: StapleSuggestion, amount: number) => {
    const { staples, staple } = addStaple(
      currentStaples(store),
      newStaple({ name: s.name, amount, unit: s.unit, category: s.category }),
    );
    // This week's (and later weeks') line you added by hand becomes the staple's line.
    saveStaples(store, staples, { takeOver: { staple, isSame: (i) => productKey(i) === s.key } });
    setStapleOffer(null);
    setToastMessage(
      `${s.name} is now a weekly staple: ${shopQuantityText({ amount: staple.amount, unit: staple.unit })} every week`,
    );
  };

  const declineStaple = (s: StapleSuggestion) => {
    const key = s.name.trim().toLowerCase();
    store.updatePreferences((p) =>
      (p.notStaples || []).includes(key) ? null : { notStaples: [...(p.notStaples || []), key] },
    );
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
