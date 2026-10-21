/** Your favourites (shared between phones): quick to add from the add box and the products list. */
import { useMemo } from 'react';
import type { AppStore } from '../../store';

export interface Favourite { name: string; category?: string }

const DEFAULT_FAVOURITES: Favourite[] = [
  { name: 'Milk', category: 'Dairy' },
  { name: 'Eggs', category: 'Dairy' },
  { name: 'Bread', category: 'Bakery' },
  { name: 'Butter', category: 'Dairy' },
  { name: 'Coffee', category: 'Pantry' },
  { name: 'Tea', category: 'Pantry' },
  { name: 'Toilet Paper', category: 'Household' },
  { name: 'Olive Oil', category: 'Pantry' },
];

/** The phone's own copy (older versions kept favourites only on the phone). */
export const FAVOURITES_KEY = 'mealPlannerCustomFavouritesObj';

export function useFavourites(store: AppStore) {
  const favourites = useMemo<Favourite[]>(() => {
    if (store?.state?.preferences?.favouriteItems && store.state.preferences.favouriteItems.length > 0) {
      return store.state.preferences.favouriteItems;
    }
    try {
      const stored = localStorage.getItem(FAVOURITES_KEY);
      if (stored) return JSON.parse(stored);
      const legacy = localStorage.getItem('mealPlannerCustomFavourites');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) return parsed.map((p: string) => ({ name: p, category: 'Staples' }));
      }
    } catch { /* fall back to the usual ones */ }
    return DEFAULT_FAVOURITES;
  }, [store?.state?.preferences?.favouriteItems]);

  /** Add it to your favourites, or take it off if it's there. */
  const toggleFavourite = (name: string, category: string = 'Staples') => {
    // From the latest favourites (a tap a moment ago, or the other phone's, counts).
    store.updatePreferences((p) => {
      const current: Favourite[] = p.favouriteItems?.length ? p.favouriteItems : favourites;
      const exists = current.some((f) => f.name.toLowerCase() === name.toLowerCase());
      const nextFavs = exists
        ? current.filter((f) => f.name.toLowerCase() !== name.toLowerCase())
        : [...current, { name, category }];
      try { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(nextFavs)); } catch { /* the synced copy is the one that matters */ }
      return { favouriteItems: nextFavs };
    });
  };

  return { favourites, toggleFavourite };
}
