/**
 * Things added by hand that aren't products yet: "Save it as a product for future shops?"
 * Asked straight after adding something new, and offered on the list until you answer.
 * Saving can also make it a weekly staple and/or a favourite.
 */
import { useMemo, useRef, useState } from 'react';
import { ShoppingListItem, UserPreferences } from '../../types';
import { notYetProducts, stapleQuantity, inProductUnit } from '../../shopList';
import { GROCERY_AISLES } from '../../utils';
import { catalogForState } from '../../shopping';
import { addStaple, currentStaples, findStaple, newStaple, saveStaples } from '../../staples';
import type { HandLine } from '../../shopListEdits';
import SaveProductSheet, { NewProductDetails } from './SaveProductSheet';
import { Favourite, FAVOURITES_KEY } from './useFavourites';
import type { ShopToastState } from './ShopToast';
import type { AppStore } from '../../store';

/** What the "Save it as a product?" sheet is about. justAdded: it opened by itself, straight after adding it. */
type ProductDraft = {
  name: string;
  amount?: number;
  unit?: string;
  category?: string;
  justAdded?: boolean;
  addedId?: string;
  addedQty?: string;
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useNewProducts({
  store,
  weekItems,
  favourites,
  aisleOrder,
  setToast,
  setToastMessage,
  openRow,
}: {
  store: AppStore;
  /** This week's list. */
  weekItems: ShoppingListItem[];
  favourites: Favourite[];
  aisleOrder?: string[];
  setToast: (t: ShopToastState | null) => void;
  setToastMessage: (message: string | null, action?: ShopToastState['action']) => void;
  /** Open the item panel on this line ("Edit" in the message). */
  openRow: (id: string) => void;
}) {
  const [saveAsProduct, setSaveAsProduct] = useState<ProductDraft | null>(null);
  // New things already asked about on this phone this time (so "Not now" isn't asked again straight away).
  const askedAboutRef = useRef<Set<string>>(new Set());

  const declinedProducts = store.state.preferences?.notProducts;
  // The products as they are now (the same object until a product changes).
  const catalog = catalogForState(store.state);
  const newItems = useMemo(
    () => notYetProducts(weekItems, declinedProducts, catalog),
    [weekItems, declinedProducts, catalog],
  );
  const isNewItem = (name: string) => newItems.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());

  /**
   * Just added: if it's something new (not a product yet, and you haven't said it isn't one), ask
   * straight away whether to save it. Once per item each time the app is opened. True if it asked.
   */
  const askAboutNew = (line: HandLine, id: string | undefined, qty: string): boolean => {
    const nameKey = line.name.trim().toLowerCase();
    const asNew = {
      ...line,
      id: id || '',
      checked: false,
      isAdhoc: true,
      isBatch: false,
      isRecurring: false,
    } as ShoppingListItem;
    if (id && !askedAboutRef.current.has(nameKey) && notYetProducts([asNew], declinedProducts).length > 0) {
      askedAboutRef.current.add(nameKey);
      setToast(null);
      setSaveAsProduct({
        name: line.name,
        amount: line.amount,
        unit: line.unit,
        category: line.category,
        justAdded: true,
        addedId: id,
        addedQty: qty,
      });
      return true;
    }
    return false;
  };

  const isStapleName = (name: string) => !!findStaple(store.state.preferences?.recurringItems || [], name);
  const isFavouriteName = (name: string) => favourites.some((f) => sameName(f.name, name));

  const saveNewProduct = (from: { name: string }, d: NewProductDetails) => {
    const id = `gdb-custom-${crypto.randomUUID()}`;
    const category = GROCERY_AISLES[d.aisle].name;
    const product = { id, name: d.name, unit: d.unit, increment: d.increment, category };
    if (store.saveProduct) store.saveProduct(product);
    else store.updateGroceryOverride?.(id, product);
    // This week's line(s) become that product too.
    const key = from.name.trim().toLowerCase();
    // ...in the unit it's sold in ("1" becomes "1 pack"), so adding another one adds up.
    const asProduct = (list: ShoppingListItem[]) =>
      list.map((i) =>
        i.isAdhoc && !i.groceryId && i.name.trim().toLowerCase() === key
          ? { ...i, name: d.name, groceryId: id, category, ...(inProductUnit(i, d.unit, d.increment) || {}) }
          : i,
      );
    const isThis = (n: string) => sameName(n, from.name) || sameName(n, d.name);
    const favouritesPatch: Partial<UserPreferences> = {};
    const also: string[] = [];
    // Favourite: in your favourites, quick to add.
    if (d.favourite) {
      if (!favourites.some((f) => isThis(f.name))) {
        const nextFavs = [...favourites, { name: d.name, category }];
        try {
          localStorage.setItem(FAVOURITES_KEY, JSON.stringify(nextFavs));
        } catch {
          /* the synced copy is the one that matters */
        }
        favouritesPatch.favouriteItems = nextFavs;
      }
    }
    // Weekly staple: on the list every week from now on; the line you just added becomes the staple's line.
    if (d.staple) also.push('a weekly staple');
    if (d.favourite) also.push('a favourite');
    const staples = currentStaples(store);
    const made =
      d.staple && !findStaple(staples, from.name)
        ? addStaple(
            staples,
            newStaple({ name: d.name, ...stapleQuantity(d.unit, d.increment, d.staple.packs), category }),
          )
        : null;
    if (made?.added) {
      saveStaples(store, made.staples, {
        alsoChangeList: asProduct,
        takeOver: { staple: made.staple, isSame: (i) => i.groceryId === id },
        alsoPreferences: favouritesPatch,
      });
    } else {
      if (Object.keys(favouritesPatch).length) store.updatePreferences(favouritesPatch);
      store.updateShoppingList(asProduct);
    }
    setSaveAsProduct(null);
    setToastMessage(
      also.length
        ? `Saved ${d.name} (${category}). It's now ${also.join(' and ')} too.`
        : `Saved ${d.name}: next time it goes straight to ${category}`,
    );
  };

  const declineNewProduct = (from: { name: string }) => {
    const key = from.name.trim().toLowerCase();
    store.updatePreferences((p) =>
      (p.notProducts || []).includes(key) ? null : { notProducts: [...(p.notProducts || []), key] },
    );
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
