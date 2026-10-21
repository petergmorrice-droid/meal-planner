/**
 * What's saved on this phone and how the app starts: the built-in settings, reading the saved
 * data (or making the first weeks), tidying it into the current shape, and saving it.
 */
import { MealPlan, UserPreferences, AppState } from '../types';
import { getMonday, createEmptyPlan } from '../utils';
import { addTombstones } from '../services/syncMerge';
import { builtInProducts } from '../shopping';

/** How often to check GitHub for the other phone's changes while the app is open. */
export const SYNC_POLL_SECONDS = 20;
/** While shopping mode is open: the other phone's ticks show up within a few seconds. */
export const FAST_SYNC_SECONDS = 6;
/** Wait this long after an edit before uploading, so quick taps are sent together. */
export const PUSH_DELAY_MS = 800;

export const LS_PENDING = 'mealPlannerSyncPending';
/** When this phone last synced successfully (per phone). */
const LS_LAST_SYNC_OK = 'last_sync_ok_at';
export const readLastSyncOk = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LS_LAST_SYNC_OK));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
export const writeLastSyncOk = (t: number) => {
  try {
    localStorage.setItem(LS_LAST_SYNC_OK, String(t));
  } catch {
    /* fine */
  }
};
const LS_LEGACY_DISMISSED = 'mealPlannerDismissedShoppingItems';

export const DEFAULT_PREFERENCES: UserPreferences = {
  showPrepTime: true,
  showCookTime: true,
  showTotalTime: true,
  showMethod: true,
  showVegetarian: true,
  showVegan: true,
  showEmojis: true,
  defaultServings: 2,
  adultCount: 2,
  childCount: 0,
  currencySymbol: '£',
  maxForwardWeeks: 4,
  firstDayOfWeek: 'Monday',
  preferredCookingMethod: 'all',
  compactPlanningCards: false,
  favouriteItems: [
    { name: 'Milk', category: 'Dairy, Chilled & Eggs' },
    { name: 'Eggs', category: 'Dairy, Chilled & Eggs' },
    { name: 'Bread', category: 'Bakery & Bread' },
    { name: 'Butter', category: 'Dairy, Chilled & Eggs' },
    { name: 'Coffee', category: 'Pantry, Oils & Spices' },
    { name: 'Tea', category: 'Pantry, Oils & Spices' },
    { name: 'Toilet Roll', category: 'Household & Other' },
    { name: 'Olive Oil', category: 'Pantry, Oils & Spices' },
  ],
};

/**
 * Mark things a phone starts with (empty weeks, the built-in grocery list) as
 * defaults, so when it first syncs they never replace the household's real data.
 */
const asDefaults = <T extends object>(items: T[]): T[] => items.map((i) => ({ ...i, lastModifiedAt: -1 }));

const getInitialMealPlans = (): MealPlan[] => {
  try {
    const saved = localStorage.getItem('mealPlannerMealPlans');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* unreadable: start from the built-in data below */
  }

  const currentMonday = getMonday(new Date());
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);

  return asDefaults([createEmptyPlan(currentMonday), createEmptyPlan(nextMonday)]);
};

/** Make sure every list exists, whatever shape the data arrived in. */
export const normalizeState = (s: Partial<AppState> | null | undefined): AppState => ({
  ...(s || {}),
  recipes: s?.recipes || [],
  mealPlans: s?.mealPlans || [],
  batches: s?.batches || [],
  shoppingList: s?.shoppingList || [],
  preferences: s?.preferences || { ...DEFAULT_PREFERENCES },
  groceryDatabase: s?.groceryDatabase || asDefaults(builtInProducts()),
  groceryOverrides: s?.groceryOverrides || {},
});

/** Copies the first version of the app kept alongside the real one (only read now, for very old phones). */
const LEGACY_COPIES = ['mealPlannerMealPlans', 'mealPlannerState'];

/**
 * Save everything on this phone (one copy). If the phone's storage is full, clear the old copies
 * and try once more. Returns false if it still couldn't be saved, so the app can say so.
 */
export const persistLocal = (s: AppState): boolean => {
  const json = JSON.stringify(s);
  const write = () => localStorage.setItem('mealPlannerAppStateCache', json);
  try {
    write();
    for (const k of LEGACY_COPIES) if (localStorage.getItem(k) !== null) localStorage.removeItem(k);
    return true;
  } catch (e) {
    try {
      for (const k of LEGACY_COPIES) localStorage.removeItem(k);
      write();
      return true;
    } catch (e2) {
      console.error('Could not save on this phone (storage full?)', e2);
      return false;
    }
  }
};

/**
 * Shopping items removed on this phone used to be remembered only on this
 * phone. Carry that list over into the shared data once, so the other phone
 * stops adding them back.
 */
const migrateLegacyDismissed = (s: AppState): AppState => {
  try {
    const raw = localStorage.getItem(LS_LEGACY_DISMISSED);
    if (!raw) return s;
    const ids: string[] = JSON.parse(raw);
    const live = new Set(s.shoppingList.map((i) => i.id));
    const toAdd = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && !live.has(id)) : [];
    const migrated = addTombstones(s, 'shoppingList', toAdd, Date.now());
    persistLocal(migrated);
    localStorage.removeItem(LS_LEGACY_DISMISSED);
    if (toAdd.length > 0) localStorage.setItem(LS_PENDING, '1');
    return migrated;
  } catch (e) {
    return s;
  }
};

export const getInitialState = (): AppState => {
  try {
    const cached = localStorage.getItem('mealPlannerAppStateCache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return migrateLegacyDismissed(
          normalizeState({
            ...parsed,
            mealPlans: parsed.mealPlans || getInitialMealPlans(),
          }),
        );
      }
    }
  } catch {
    /* unreadable: start from the built-in data below */
  }

  // Fallback to legacy local storage structures if they exist
  let legacyDb = asDefaults(builtInProducts());
  let legacyOverrides = {};
  let hasLegacyData = false;
  try {
    const legacyStateStr = localStorage.getItem('mealPlannerState');
    if (legacyStateStr) {
      const parsed = JSON.parse(legacyStateStr);
      if (parsed.groceryDatabase) {
        legacyDb = parsed.groceryDatabase;
        hasLegacyData = true;
      }
      if (parsed.groceryOverrides) {
        legacyOverrides = parsed.groceryOverrides;
        hasLegacyData = true;
      }
    }
  } catch {
    /* no old-style data to bring over */
  }

  const legacyPrefs = { ...DEFAULT_PREFERENCES };
  try {
    const storedFavs = localStorage.getItem('mealPlannerCustomFavouritesObj');
    if (storedFavs) {
      legacyPrefs.favouriteItems = JSON.parse(storedFavs);
      hasLegacyData = true;
    }
  } catch {
    /* no old-style favourites to bring over */
  }

  return migrateLegacyDismissed({
    recipes: [],
    mealPlans: getInitialMealPlans(),
    batches: [],
    shoppingList: [],
    preferences: legacyPrefs,
    groceryDatabase: legacyDb,
    groceryOverrides: legacyOverrides,
    // A brand-new phone's default settings must never replace the household's real ones.
    syncMeta: hasLegacyData ? undefined : { tombstones: {}, preferencesModifiedAt: -1 },
  });
};
