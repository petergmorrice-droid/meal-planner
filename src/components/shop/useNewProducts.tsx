/**
 * Things added by hand that aren't products yet: "Save it as a product for future shops?"
 * Asked straight after adding something new, and offered on the list until you answer.
 * Saving can also make it a weekly staple and/or a favourite.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ShoppingListItem, RecurringItem } from '../../types';
import { notYetProducts, stapleQuantity, stapleTakesOver, inProductUnit } from '../../shopList';
import { GROCERY_AISLES, syncRecurringStaplesForAllPlans } from '../../utils';
import type { HandLine } from '../../shopListEdits';
import SaveProductSheet, { NewProductDetails } from './SaveProductSheet';
import { Favourite, FAVOURITES_KEY } from './useFavourites';
import type { ShopToastState } from './ShopToast';

/** What the "Save it as a product?" sheet is about. justAdded: it opened by itself, straight after adding it. */
type ProductDraft = { name: string; amount?: number; unit?: string; category?: string; justAdded?: boolean; addedId?: string; addedQty?: string };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useNewProducts({ store, weekItems, favourites, aisleOrder, dismissedItemIds, setToast, setToastMessage, openRow }: {
  store: any;
  /** This week's list. */
  weekItems: ShoppingListItem[];
  favourites: Favourite[];
  aisleOrder?: string[];
  dismissedItemIds: string[];
  setToast: (t: ShopToastState | null) => void;
  setToastMessage: (message: string | null, action?: ShopToastState['action']) => void;
  /** Open the item panel on this line ("Edit" in the message). */
  openRow: (id: string) => void;
}) {
  const [saveAsProduct, setSaveAsProduct] = useState<ProductDraft | null>(null);
  // New things already asked about on this phone this time (so "Not now" isn't asked again straight away).
  const askedAboutRef = useRef<Set<string>>(new Set());

  const declinedProducts = store.state.preferences?.notProducts;
  const newItems = useMemo(
    () => notYetProducts(weekItems, declinedProducts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekItems, declinedProducts, store.state.groceryDatabase],
  );
  const isNewItem = (name: string) => newItems.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());

  /**
   * Just added: if it's something new (not a product yet, and you haven't said it isn't one), ask
   * straight away whether to save it. Once per item each time the app is opened. True if it asked.
   */
  const askAboutNew = (line: HandLine, id: string | undefined, qty: string): boolean => {
    const nameKey = line.name.trim().toLowerCase();
    const asNew = { ...line, id: id || '', checked: false, isAdhoc: true, isBatch: false, isRecurring: false } as ShoppingListItem;
    if (id && !askedAboutRef.current.has(nameKey) && notYetProducts([asNew], declinedProducts).length > 0) {
      askedAboutRef.current.add(nameKey);
      setToast(null);
      setSaveAsProduct({ name: line.name, amount: line.amount, unit: line.unit, category: line.category, justAdded: true, addedId: id, addedQty: qty });
      return true;
    }
    return false;
  };

  const isStapleName = (name: string) => (store.state.preferences?.recurringItems || []).some((r: RecurringItem) => sameName(r.name, name));
  const isFavouriteName = (name: string) => favourites.some((f) => sameName(f.name, name));

  const saveNewProduct = (from: { name: string }, d: NewProductDetails) => {
    const id = `gdb-custom-${crypto.randomUUID()}`;
    const category = GROCERY_AISLES[d.aisle].name;
    const product = { id, name: d.name, unit: d.unit, increment: d.increment, category };
    if (store.saveProduct) store.saveProduct(product);
    else store.updateGroceryOverride?.(id, product);
    // This week's line(s) become that product too.
    const key = from.name.trim().toLowerCase();
    const now = store.getState?.() || store.state;
    // ...in the unit it's sold in ("1" becomes "1 pack"), so adding another one adds up.
    let list: ShoppingListItem[] = (now.shoppingList || []).map((i: ShoppingListItem) =>
      i.isAdhoc && !i.groceryId && i.name.trim().toLowerCase() === key
        ? { ...i, name: d.name, groceryId: id, category, ...(inProductUnit(i, d.unit, d.increment) || {}) }
        : i);
    const isThis = (n: string) => sameName(n, from.name) || sameName(n, d.name);
    const prefPatch: Record<string, unknown> = {};
    const also: string[] = [];
    // Weekly staple: on the list every week from now on; the line you just added becomes the staple's line.
    if (d.staple) {
      const recurring: RecurringItem[] = now.preferences?.recurringItems || [];
      if (!recurring.some((r) => isThis(r.name))) {
        const q = stapleQuantity(d.unit, d.increment, d.staple.packs);
        const rec: RecurringItem = { id: crypto.randomUUID(), name: d.name, amount: q.amount, unit: q.unit, category };
        const nextRecurring = [...recurring, rec];
        prefPatch.recurringItems = nextRecurring;
        list = stapleTakesOver(syncRecurringStaplesForAllPlans(now.mealPlans || [], list, nextRecurring, dismissedItemIds), rec.id, (i) => i.groceryId === id);
      }
      also.push('a weekly staple');
    }
    // Favourite: in your favourites, quick to add.
    if (d.favourite) {
      if (!favourites.some((f) => isThis(f.name))) {
        const nextFavs = [...favourites, { name: d.name, category }];
        try { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(nextFavs)); } catch { /* the synced copy is the one that matters */ }
        prefPatch.favouriteItems = nextFavs;
      }
      also.push('a favourite');
    }
    if (Object.keys(prefPatch).length) store.updatePreferences(prefPatch);
    store.updateShoppingList(list);
    setSaveAsProduct(null);
    setToastMessage(also.length ? `Saved ${d.name} (${category}). It's now ${also.join(' and ')} too.` : `Saved ${d.name}: next time it goes straight to ${category}`);
  };

  const declineNewProduct = (from: { name: string }) => {
    const key = from.name.trim().toLowerCase();
    const current = store.state.preferences?.notProducts || [];
    if (!current.includes(key)) store.updatePreferences({ notProducts: [...current, key] });
    setSaveAsProduct(null);
    setToastMessage(`OK, won't ask about ${from.name} again`);
  };

  /** "Not now": if it had just been added, say so (with Edit), like any other add. */
  const notNowNewProduct = () => {
    const s = saveAsProduct;
    setSaveAsProduct(null);
    if (s?.justAdded) {
      const qty = s.addedQty && s.addedQty !== '1' ? ` · ${s.addedQty}` : '';
      const addedId = s.addedId;
      setToastMessage(`Added ${s.name}${qty}`, addedId ? { label: 'Edit', run: () => openRow(addedId) } : undefined);
    }
  };

  const sheet = saveAsProduct && (
    <SaveProductSheet
      key={saveAsProduct.name}
      item={saveAsProduct}
      aisleOrder={aisleOrder}
      justAdded={!!saveAsProduct.justAdded}
      already={{ staple: isStapleName(saveAsProduct.name), favourite: isFavouriteName(saveAsProduct.name) }}
      onSave={(d) => saveNewProduct(saveAsProduct, d)}
      onDecline={() => declineNewProduct(saveAsProduct)}
      onClose={notNowNewProduct}
    />
  );

  return { newItems, isNewItem, offerToSave: setSaveAsProduct, askAboutNew, sheet };
}
