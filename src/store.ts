import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Recipe, MealPlan, PlannedMeal, BatchItem,
  ShoppingListItem, UserPreferences, GroceryItem, AppState, DayPlan,
  DatabaseCleanAction
} from './types';
import {
  getMonday, formatDateISO, isPastWeek, isWeekBeyondForwardLimit,
  cleanDays, DAYS_OF_WEEK
} from './utils';
import { INITIAL_GROCERY_DATABASE } from './utils/initialGroceryDb';
import { ensureRecipeBreakdowns } from './utils/recipeBreakdowns';
import { createSamplePastWeeks, createEmptyPlan } from './utils';
import { useDeviceIdentity } from './hooks/useDeviceIdentity';
import {
  getGistConfig, saveGistConfig, clearGistConfig,
  fetchGist, saveGist, createPrivateGist, GistConfig
} from './services/gistStorage';
import {
  mergeAppStates, applyLocalChange, statesEqual, getDismissedShoppingIds, addTombstones, dropDefaultsMissingFrom
} from './services/syncMerge';
import { CATALOG_VERSION, missingExtraProducts } from './shopping';

/** How often to check GitHub for the other phone's changes while the app is open. */
export const SYNC_POLL_SECONDS = 20;
/** Wait this long after an edit before uploading, so quick taps are sent together. */
const PUSH_DELAY_MS = 800;

const LS_PENDING = 'mealPlannerSyncPending';
const LS_LEGACY_DISMISSED = 'mealPlannerDismissedShoppingItems';

const DEFAULT_PREFERENCES: UserPreferences = {
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
    { name: 'Milk', category: 'Dairy' },
    { name: 'Eggs', category: 'Dairy' },
    { name: 'Bread', category: 'Bakery' },
    { name: 'Butter', category: 'Dairy' },
    { name: 'Coffee', category: 'Pantry' },
    { name: 'Tea', category: 'Pantry' },
    { name: 'Toilet Paper', category: 'Household' },
    { name: 'Olive Oil', category: 'Pantry' }
  ]
};

/**
 * Mark things a phone starts with (empty weeks, the built-in grocery list) as
 * defaults, so when it first syncs they never replace the household's real data.
 */
const asDefaults = <T extends object>(items: T[]): T[] => items.map(i => ({ ...i, lastModifiedAt: -1 }));

const getInitialMealPlans = (): MealPlan[] => {
  try {
    const saved = localStorage.getItem('mealPlannerMealPlans');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  const currentMonday = getMonday(new Date());
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);

  return asDefaults([
    createEmptyPlan(currentMonday),
    createEmptyPlan(nextMonday)
  ]);
};

/** Make sure every list exists, whatever shape the data arrived in. */
const normalizeState = (s: Partial<AppState> | null | undefined): AppState => ({
  ...(s || {}),
  recipes: s?.recipes || [],
  mealPlans: s?.mealPlans || [],
  batches: s?.batches || [],
  shoppingList: s?.shoppingList || [],
  preferences: s?.preferences || { ...DEFAULT_PREFERENCES },
  groceryDatabase: s?.groceryDatabase || asDefaults(INITIAL_GROCERY_DATABASE),
  groceryOverrides: s?.groceryOverrides || {},
});

const persistLocal = (s: AppState) => {
  try {
    localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(s));
    localStorage.setItem('mealPlannerMealPlans', JSON.stringify(s.mealPlans));
    localStorage.setItem('mealPlannerState', JSON.stringify({
      groceryDatabase: s.groceryDatabase,
      groceryOverrides: s.groceryOverrides
    }));
  } catch (e) {
    console.error('Failed to write local storage state cache', e);
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
    const live = new Set(s.shoppingList.map(i => i.id));
    const toAdd = Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && !live.has(id)) : [];
    const migrated = addTombstones(s, 'shoppingList', toAdd, Date.now());
    persistLocal(migrated);
    localStorage.removeItem(LS_LEGACY_DISMISSED);
    if (toAdd.length > 0) localStorage.setItem(LS_PENDING, '1');
    return migrated;
  } catch (e) {
    return s;
  }
};

const getInitialState = (): AppState => {
  try {
    const cached = localStorage.getItem('mealPlannerAppStateCache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return migrateLegacyDismissed(normalizeState({
          ...parsed,
          mealPlans: parsed.mealPlans || getInitialMealPlans(),
        }));
      }
    }
  } catch (e) {}

  // Fallback to legacy local storage structures if they exist
  let legacyDb = asDefaults(INITIAL_GROCERY_DATABASE);
  let legacyOverrides = {};
  let hasLegacyData = false;
  try {
    const legacyStateStr = localStorage.getItem('mealPlannerState');
    if (legacyStateStr) {
      const parsed = JSON.parse(legacyStateStr);
      if (parsed.groceryDatabase) { legacyDb = parsed.groceryDatabase; hasLegacyData = true; }
      if (parsed.groceryOverrides) { legacyOverrides = parsed.groceryOverrides; hasLegacyData = true; }
    }
  } catch (e) {}

  let legacyPrefs = { ...DEFAULT_PREFERENCES };
  try {
    const storedFavs = localStorage.getItem('mealPlannerCustomFavouritesObj');
    if (storedFavs) {
      legacyPrefs.favouriteItems = JSON.parse(storedFavs);
      hasLegacyData = true;
    }
  } catch (e) {}

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

const friendlyError = (err: any, fallback: string) => (err && err.message) || fallback;

export function useStore() {
  const [state, setStateRaw] = useState<AppState>(getInitialState);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentUser = useDeviceIdentity();

  // GitHub Sync States
  const [githubConfig, setGithubConfigState] = useState<GistConfig | null>(getGistConfig);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>(
    () => (getGistConfig() ? 'loading' : 'idle')
  );
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ---- Sync engine (refs so background work always sees the latest data) ----
  const stateRef = useRef<AppState>(state);
  const etagRef = useRef<string | null>(null);
  const gistFilesRef = useRef<string[]>([]);
  const editCountRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<boolean>((() => {
    try { return localStorage.getItem(LS_PENDING) === '1'; } catch { return false; }
  })());

  const setPending = (value: boolean) => {
    pendingRef.current = value;
    try { localStorage.setItem(LS_PENDING, value ? '1' : '0'); } catch {}
  };

  /** Replace the data on this phone (screen + local storage). */
  const replaceState = (next: AppState) => {
    stateRef.current = next;
    setStateRaw(next);
    persistLocal(next);
  };

  const schedulePush = (delay = PUSH_DELAY_MS) => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void runSync('push');
    }, delay);
  };

  /**
   * Save an edit. `base` is the data the screen showed when the edit was made
   * and `next` is the edited version; only the difference is applied on top of
   * the latest data, so edits never undo changes downloaded in the meantime.
   */
  const commit = (base: AppState, next: AppState) => {
    const applied = applyLocalChange(stateRef.current, base, next, Date.now());
    replaceState(applied);
    editCountRef.current++;
    if (getGistConfig()) {
      setPending(true);
      schedulePush();
    }
  };

  /**
   * One sync round: download the Gist if it changed, merge it in, and upload
   * if this phone has anything the Gist doesn't.
   */
  const runSync = (reason: 'initial' | 'poll' | 'focus' | 'push' | 'manual'): Promise<void> => {
    const config = getGistConfig();
    if (!config) return Promise.resolve();
    if (inFlightRef.current) {
      rerunRef.current = true;
      return inFlightRef.current;
    }
    const quiet = reason === 'poll' || reason === 'focus';

    const task = (async () => {
      if (!quiet) setSyncStatus('loading');
      try {
        const result = await fetchGist(config, etagRef.current);
        let remote: AppState | null = null;
        let gistIsEmpty = false;
        if (!result.notModified) {
          etagRef.current = result.snapshot.etag;
          gistFilesRef.current = result.snapshot.files;
          remote = result.snapshot.state;
          gistIsEmpty = remote === null;
        }

        let merged = stateRef.current;
        if (remote) {
          merged = mergeAppStates(dropDefaultsMissingFrom(stateRef.current, remote), remote);
          if (!statesEqual(merged, stateRef.current)) {
            replaceState(normalizeState(merged));
            merged = stateRef.current;
          }
        }

        const gistIsBehind = remote ? !statesEqual(merged, remote) : false;
        const willUpload = pendingRef.current || gistIsBehind || gistIsEmpty;
        if (willUpload) {
          if (quiet) setSyncStatus('loading');
          const editsBefore = editCountRef.current;
          const saved = await saveGist(config, stateRef.current, gistFilesRef.current);
          etagRef.current = saved.etag;
          if (saved.files.length) gistFilesRef.current = saved.files;
          if (editCountRef.current === editsBefore) {
            setPending(false);
          } else {
            rerunRef.current = true; // more edits arrived during upload
          }
        }

        setSyncStatus('synced');
        setSyncError(null);
        // Quiet checks that found nothing new don't need to refresh the screen.
        if (!quiet || remote || willUpload) setLastSynced(new Date());
      } catch (err: any) {
        console.error(`Gist sync (${reason}) failed:`, err);
        setSyncStatus('error');
        setSyncError(friendlyError(err, 'Failed to sync with GitHub Gist.'));
      }
    })();

    inFlightRef.current = task;
    return task.finally(() => {
      inFlightRef.current = null;
      if (rerunRef.current) {
        rerunRef.current = false;
        schedulePush(200);
      }
    });
  };

  // Background sync: on open, every SYNC_POLL_SECONDS while visible, on return to the app, and when back online.
  useEffect(() => {
    if (!githubConfig) return;
    void runSync('initial');
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void runSync('poll');
    }, SYNC_POLL_SECONDS * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync('focus');
    };
    const onOnline = () => void runSync('focus');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubConfig?.gistId, githubConfig?.pat]);

  // One-off: add products from newer versions of the built-in product list (spices, herbs...)
  // to the shared grocery list. Runs once per data set; the other phone gets them via sync.
  useEffect(() => {
    const current = stateRef.current;
    if ((current.preferences?.catalogVersion ?? 1) >= CATALOG_VERSION) return;
    const additions = missingExtraProducts(current.groceryDatabase);
    commit(current, {
      ...current,
      groceryDatabase: [...(current.groceryDatabase || INITIAL_GROCERY_DATABASE), ...additions],
      preferences: { ...(current.preferences || DEFAULT_PREFERENCES), catalogVersion: CATALOG_VERSION },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shopping items that either of you removed, so they aren't regenerated automatically.
  const dismissedKey = getDismissedShoppingIds(state).join('|');
  const dismissedShoppingItemIds = useMemo(
    () => (dismissedKey ? dismissedKey.split('|') : []),
    [dismissedKey]
  );

  const addRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    withBreakdowns.addedBy = currentUser;
    const nextRecipes = [...state.recipes.filter(r => r.id !== withBreakdowns.id), withBreakdowns];
    commit(state, { ...state, recipes: nextRecipes });
  };

  const updateRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    withBreakdowns.lastModifiedBy = currentUser;
    const nextRecipes = state.recipes.map(r => r.id === withBreakdowns.id ? withBreakdowns : r);
    commit(state, { ...state, recipes: nextRecipes });
  };

  const deleteRecipe = async (recipeId: string) => {
    const nextRecipes = state.recipes.filter(r => r.id !== recipeId);
    commit(state, { ...state, recipes: nextRecipes });
  };

  const updateMealPlan = async (plan: MealPlan) => {
    const currentMondayStr = formatDateISO(getMonday(new Date()));
    const expectedId = `plan-${plan.startDate}`;
    let processedPlan = {
      ...plan,
      id: expectedId,
      isCurrent: plan.startDate === currentMondayStr,
      days: cleanDays(plan.days)
    };

    const maxWeeks = state.preferences?.maxForwardWeeks || DEFAULT_PREFERENCES.maxForwardWeeks || 4;
    if (isWeekBeyondForwardLimit(processedPlan.startDate, maxWeeks)) {
      console.warn(`Cannot add meal plan beyond forward limit (${maxWeeks} weeks)`, processedPlan.startDate);
      return;
    }

    if (processedPlan.status !== 'finalized') {
      const hasMeals = Object.values(processedPlan.days).some((day: any) => day.meals && day.meals.length > 0);
      processedPlan.status = hasMeals ? 'draft' : 'not_started';
    }

    processedPlan.lastModifiedAt = Date.now();
    processedPlan.lastModifiedBy = currentUser;

    const existingIdx = state.mealPlans.findIndex(p => p.id === expectedId || p.startDate === processedPlan.startDate);
    let nextMealPlans: MealPlan[] = [...state.mealPlans];
    if (existingIdx >= 0) {
      nextMealPlans[existingIdx] = processedPlan;
    } else {
      nextMealPlans.push(processedPlan);
    }

    // Filter and deduplicate meal plans
    const plansByDate = new Map<string, MealPlan>();
    nextMealPlans.forEach(p => {
      const existing = plansByDate.get(p.startDate);
      if (!existing || (p.lastModifiedAt || 0) > (existing.lastModifiedAt || 0)) {
        plansByDate.set(p.startDate, p);
      }
    });
    const finalPlans = Array.from(plansByDate.values());

    commit(state, { ...state, mealPlans: finalPlans });
  };

  const repairDatabase = async () => {
    const plansByDate = new Map<string, MealPlan[]>();
    state.mealPlans.forEach(p => {
      if (!plansByDate.has(p.startDate)) plansByDate.set(p.startDate, []);
      plansByDate.get(p.startDate)!.push(p);
    });

    const finalPlans: MealPlan[] = [];
    for (const [startDate, plans] of plansByDate.entries()) {
      plans.sort((a, b) => {
        const aCorrect = a.id === `plan-${a.startDate}` ? 1 : 0;
        const bCorrect = b.id === `plan-${b.startDate}` ? 1 : 0;
        if (aCorrect !== bCorrect) return bCorrect - aCorrect;
        return (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0);
      });

      const bestPlan = plans[0];
      const cleanDaysData = { ...bestPlan.days };
      for (const day of Object.keys(cleanDaysData)) {
        if (cleanDaysData[day]?.meals?.length > 1) {
          cleanDaysData[day].meals = [cleanDaysData[day].meals[0]];
        }
      }

      const correctId = `plan-${bestPlan.startDate}`;
      const updatedPlan = { ...bestPlan, id: correctId, days: cleanDaysData };
      finalPlans.push(updatedPlan);
    }

    commit(state, { ...state, mealPlans: finalPlans });
  };

  const duplicatePlanToWeek = async (sourcePlanId: string, targetStartDate: string) => {
    const source = state.mealPlans.find(p => p.id === sourcePlanId);
    if (!source) return;

    const targetMonday = new Date(targetStartDate + 'T00:00:00');
    const targetMondayStr = formatDateISO(targetMonday);
    const currentMondayStr = formatDateISO(getMonday(new Date()));

    const targetDays: Record<string, DayPlan> = {};
    DAYS_OF_WEEK.forEach((d, i) => {
      const dDate = new Date(targetMonday);
      dDate.setDate(targetMonday.getDate() + i);
      const sourceDay = source.days[d];
      const clonedMeals: PlannedMeal[] = (sourceDay?.meals || []).map(m => ({
        ...m,
        id: crypto.randomUUID()
      }));
      targetDays[d] = {
        date: formatDateISO(dDate),
        meals: clonedMeals
      };
    });

    const newPlanId = `plan-${targetMondayStr}`;
    const newPlan: MealPlan = {
      id: newPlanId,
      startDate: targetMondayStr,
      days: targetDays,
      status: 'draft',
      isCurrent: targetMondayStr === currentMondayStr,
      lastModifiedAt: Date.now()
    };

    const nextMealPlans = state.mealPlans.filter(p => p.startDate !== targetMondayStr);
    nextMealPlans.push(newPlan);

    commit(state, { ...state, mealPlans: nextMealPlans });
  };

  const seedSamplePastWeeks = async () => {
    const sample = createSamplePastWeeks();
    const existingDates = new Set(state.mealPlans.map(p => p.startDate));
    const toAdd = sample.filter(p => !existingDates.has(p.startDate));

    if (toAdd.length === 0) return;

    toAdd.forEach(plan => {
      plan.lastModifiedAt = Date.now();
    });

    commit(state, { ...state, mealPlans: [...state.mealPlans, ...toAdd] });
  };

  const clearPastWeeks = async () => {
    const nextMealPlans = state.mealPlans.filter(p => !isPastWeek(p.startDate));
    commit(state, { ...state, mealPlans: nextMealPlans });
  };

  const addBatch = async (batch: BatchItem) => {
    const nextBatches = [...state.batches.filter(b => b.id !== batch.id), batch];
    commit(state, { ...state, batches: nextBatches });
  };

  const updateBatch = async (batch: BatchItem) => {
    const nextBatches = state.batches.map(b => b.id === batch.id ? batch : b);
    commit(state, { ...state, batches: nextBatches });
  };

  const removeBatch = async (batchId: string) => {
    const nextBatches = state.batches.filter(b => b.id !== batchId);
    commit(state, { ...state, batches: nextBatches });
  };

  const areItemsEqual = (a: ShoppingListItem, b: ShoppingListItem): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (key === 'addedBy' || key === 'lastModifiedBy' || key === 'lastModifiedAt') {
        continue;
      }
      const valA = (a as any)[key];
      const valB = (b as any)[key];

      if (valA === valB) continue;

      if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) {
        if (JSON.stringify(valA) === JSON.stringify(valB)) continue;
      }

      return false;
    }
    return true;
  };

  const updateShoppingList = async (list: ShoppingListItem[]) => {
    const processedList = list.map(item => {
      const existingItem = state.shoppingList.find(i => i.id === item.id);
      if (!existingItem) {
        return {
          ...item,
          addedBy: item.addedBy || currentUser,
          lastModifiedBy: item.lastModifiedBy || currentUser,
          lastModifiedAt: item.lastModifiedAt || Date.now()
        };
      }

      const hasChanged = !areItemsEqual(item, existingItem);
      if (!hasChanged) {
        return existingItem;
      }
      return {
        ...item,
        addedBy: existingItem.addedBy || item.addedBy || currentUser,
        lastModifiedBy: currentUser,
        lastModifiedAt: Date.now()
      };
    });

    commit(state, { ...state, shoppingList: processedList });
  };

  const updateGroceryDatabase = async (dbDb: GroceryItem[]) => {
    commit(state, { ...state, groceryDatabase: dbDb });
  };

  const applyGroceryCleanActions = async (actions: DatabaseCleanAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;

    const baseDb = state.groceryDatabase && state.groceryDatabase.length > 0
      ? state.groceryDatabase
      : INITIAL_GROCERY_DATABASE;
    const overrides = state.groceryOverrides || {};

    const itemMap = new Map<string, GroceryItem>();
    baseDb.forEach(item => {
      itemMap.set(item.id, {
        ...item,
        ...(overrides[item.id] || {})
      });
    });

    const deletedIds = new Set<string>();

    for (const action of actions) {
      if (action.actionType === 'merge') {
        const primary = itemMap.get(action.primaryItemId);
        const secondary = action.secondaryItemId ? itemMap.get(action.secondaryItemId) : undefined;

        if (primary && secondary) {
          const existingAliases = Array.isArray(primary.aliases) ? [...primary.aliases] : [];
          const aliasesSet = new Set(existingAliases.map(a => a.toLowerCase().trim()));

          const secName = secondary.name.toLowerCase().trim();
          if (secName && secName !== primary.name.toLowerCase().trim()) {
            aliasesSet.add(secName);
          }

          if (Array.isArray(secondary.aliases)) {
            secondary.aliases.forEach(a => {
              const norm = (a || '').toLowerCase().trim();
              if (norm && norm !== primary.name.toLowerCase().trim()) {
                aliasesSet.add(norm);
              }
            });
          }

          primary.aliases = Array.from(aliasesSet);

          if (action.newName) {
            primary.name = action.newName.trim();
          }
          if (action.newAisle) {
            primary.category = action.newAisle.trim();
          }

          deletedIds.add(secondary.id);
        }
      } else if (action.actionType === 'rename') {
        const primary = itemMap.get(action.primaryItemId);
        if (primary && action.newName) {
          const oldName = primary.name.toLowerCase().trim();
          const existingAliases = Array.isArray(primary.aliases) ? [...primary.aliases] : [];
          const aliasesSet = new Set(existingAliases.map(a => a.toLowerCase().trim()));
          if (oldName && oldName !== action.newName.toLowerCase().trim()) {
            aliasesSet.add(oldName);
          }
          primary.aliases = Array.from(aliasesSet);
          primary.name = action.newName.trim();
        }
      } else if (action.actionType === 'recategorize') {
        const primary = itemMap.get(action.primaryItemId);
        if (primary && action.newAisle) {
          primary.category = action.newAisle.trim();
        }
      }
    }

    const updatedItems = Array.from(itemMap.values()).filter(item => !deletedIds.has(item.id));

    const updatedOverrides = { ...overrides };
    deletedIds.forEach(id => {
      if (updatedOverrides[id]) {
        delete updatedOverrides[id];
      }
    });

    commit(state, {
      ...state,
      groceryDatabase: updatedItems,
      groceryOverrides: updatedOverrides
    });
  };

  const updateGroceryOverride = async (id: string, updates: Partial<GroceryItem>) => {
    const currentOverrides = state.groceryOverrides || {};
    const newOverrides = { ...currentOverrides, [id]: { ...(currentOverrides[id] || {}), ...updates } };
    commit(state, { ...state, groceryOverrides: newOverrides });
  };

  const getHydratedGroceryItem = (id: string): GroceryItem | undefined => {
    const baseItem = INITIAL_GROCERY_DATABASE.find(item => item.id === id);
    const override = state.groceryOverrides?.[id] || {};

    if (!baseItem && !override.name) return undefined;

    if (!baseItem) {
       return override as GroceryItem;
    }

    return { ...baseItem, ...override };
  };

  const updatePreferences = async (prefs: Partial<AppState['preferences']>) => {
    const newPrefs = { ...(state.preferences || DEFAULT_PREFERENCES), ...prefs };
    commit(state, { ...state, preferences: newPrefs });
  };

  const resetPreferences = async () => {
    commit(state, { ...state, preferences: DEFAULT_PREFERENCES });
  };

  const exportAllData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importAllData = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        commit(state, normalizeState(parsed));
        return true;
      }
    } catch (e) {
      console.error('Failed to import data', e);
    }
    return false;
  };

  // GitHub Config Management
  const saveGithubConfig = async (pat: string, gistId: string, syncMode: 'pull' | 'push' | 'merge') => {
    const config = { pat: pat.trim(), gistId: gistId.trim() };
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const result = await fetchGist(config, null);
      const snapshot = result.notModified ? null : result.snapshot;
      const remoteState = snapshot?.state || null;
      etagRef.current = snapshot?.etag || null;
      gistFilesRef.current = snapshot?.files || [];
      saveGistConfig(config.pat, config.gistId);

      if (syncMode === 'pull') {
        if (remoteState) {
          replaceState(normalizeState(remoteState));
        }
      } else if (syncMode === 'push') {
        const saved = await saveGist(config, stateRef.current, gistFilesRef.current);
        etagRef.current = saved.etag;
        gistFilesRef.current = saved.files;
      } else if (syncMode === 'merge') {
        if (remoteState) {
          replaceState(normalizeState(mergeAppStates(dropDefaultsMissingFrom(stateRef.current, remoteState), remoteState)));
        }
        const saved = await saveGist(config, stateRef.current, gistFilesRef.current);
        etagRef.current = saved.etag;
        gistFilesRef.current = saved.files;
      }
      setPending(false);
      setGithubConfigState(config);
      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err: any) {
      console.error('Failed to configure Gist integration:', err);
      setSyncStatus('error');
      setSyncError(friendlyError(err, 'Failed to configure GitHub Gist.'));
      throw err;
    }
  };

  const createGistFromLocal = async (pat: string): Promise<string> => {
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const created = await createPrivateGist(pat.trim(), stateRef.current);
      etagRef.current = created.etag;
      gistFilesRef.current = created.files;
      saveGistConfig(pat, created.id);
      setPending(false);
      setGithubConfigState({ pat: pat.trim(), gistId: created.id });
      setSyncStatus('synced');
      setLastSynced(new Date());
      return created.id;
    } catch (err: any) {
      console.error('Failed to create private Gist:', err);
      setSyncStatus('error');
      setSyncError(friendlyError(err, 'Failed to create a private GitHub Gist.'));
      throw err;
    }
  };

  const clearGithubConfig = () => {
    clearGistConfig();
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    etagRef.current = null;
    gistFilesRef.current = [];
    setPending(false);
    setGithubConfigState(null);
    setSyncStatus('idle');
    setLastSynced(null);
    setSyncError(null);
  };

  const manualSync = async () => {
    await runSync('manual');
  };

  return {
    state,
    selectedPlanId,
    setSelectedPlanId,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    updateMealPlan,
    repairDatabase,
    duplicatePlanToWeek,
    seedSamplePastWeeks,
    clearPastWeeks,
    addBatch,
    updateBatch,
    removeBatch,
    updateShoppingList,
    updateGroceryDatabase,
    updateGroceryOverride,
    applyGroceryCleanActions,
    getHydratedGroceryItem,
    updatePreferences,
    resetPreferences,
    exportAllData,
    importAllData,
    dismissedShoppingItemIds,
    // GitHub Gist exports
    githubConfig,
    syncStatus,
    lastSynced,
    syncError,
    syncPollSeconds: SYNC_POLL_SECONDS,
    saveGithubConfig,
    createGistFromLocal,
    clearGithubConfig,
    manualSync
  };
}
