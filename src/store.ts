import { useState, useEffect, useEffectEvent, useRef, useMemo } from 'react';
import { oldShoppingLineIds } from './shopList';
import { setCurrentProducts } from './shopping/current';
import { stampShoppingItem, stampPlanDays, stampBatch, stampRecipeNotes } from './whoChanged';
import {
  Recipe,
  MealPlan,
  PlannedMeal,
  BatchItem,
  ShoppingListItem,
  UserPreferences,
  GroceryItem,
  AppState,
  DayPlan,
  DatabaseCleanAction,
} from './types';
import { getMonday, formatDateISO, isPastWeek, isWeekBeyondForwardLimit, cleanDays, DAYS_OF_WEEK } from './utils';
import { createEmptyPlan } from './utils';
import { useDeviceIdentity } from './hooks/useDeviceIdentity';
import {
  getGistConfig,
  saveGistConfig,
  clearGistConfig,
  fetchGist,
  saveGist,
  createPrivateGist,
  GistConfig,
} from './services/gistStorage';
import {
  mergeAppStates,
  applyLocalChange,
  statesEqual,
  getDismissedShoppingIds,
  addTombstones,
  dropDefaultsMissingFrom,
  keepOnlyChangesSince,
  LONG_ABSENCE_MS,
} from './services/syncMerge';
import {
  CATALOG_VERSION,
  builtInProducts,
  catalogForState,
  upgradeProductDefaults,
  normaliseProducts,
  saveProductIn,
  updateProductIn,
  removeProductIn,
  restoreProductIn,
  mergeProductsIn,
  markDifferentIn,
  resetProductsIn,
  replaceProductsIn,
  type RemovedProduct,
} from './shopping';
import { messageOf } from './errors';

/** How often to check GitHub for the other phone's changes while the app is open. */
export const SYNC_POLL_SECONDS = 20;
/** While shopping mode is open: the other phone's ticks show up within a few seconds. */
export const FAST_SYNC_SECONDS = 6;
/** Wait this long after an edit before uploading, so quick taps are sent together. */
const PUSH_DELAY_MS = 800;

const LS_PENDING = 'mealPlannerSyncPending';
/** When this phone last synced successfully (per phone). */
const LS_LAST_SYNC_OK = 'last_sync_ok_at';
const readLastSyncOk = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LS_LAST_SYNC_OK));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeLastSyncOk = (t: number) => {
  try {
    localStorage.setItem(LS_LAST_SYNC_OK, String(t));
  } catch {
    /* fine */
  }
};
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
const normalizeState = (s: Partial<AppState> | null | undefined): AppState => ({
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

const getInitialState = (): AppState => {
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

const friendlyError = (err: unknown, fallback: string) => (err ? messageOf(err) : undefined) || fallback;

/** Everything the screens get from the store: the data, and the ways to change it. */
export type AppStore = ReturnType<typeof useStore>;

export function useStore() {
  const [state, setStateRaw] = useState<AppState>(() => {
    const s = getInitialState();
    setCurrentProducts(s.groceryDatabase, s.groceryOverrides);
    return s;
  });
  const stateRaw = state;
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentUser = useDeviceIdentity();

  // GitHub Sync States
  const [githubConfig, setGithubConfigState] = useState<GistConfig | null>(getGistConfig);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>(() =>
    getGistConfig() ? 'loading' : 'idle',
  );
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  // Shopping mode asks for quicker checks, so two people shopping see each other's ticks.
  const [fastSync, setFastSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Something worth saying about the last sync (e.g. this phone had been away a long time). */
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // ---- Sync engine (refs so background work always sees the latest data) ----
  const stateRef = useRef<AppState>(state);
  const etagRef = useRef<string | null>(null);
  const gistFilesRef = useRef<string[]>([]);
  const editCountRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<boolean>(
    (() => {
      try {
        return localStorage.getItem(LS_PENDING) === '1';
      } catch {
        return false;
      }
    })(),
  );

  const setPending = (value: boolean) => {
    pendingRef.current = value;
    try {
      localStorage.setItem(LS_PENDING, value ? '1' : '0');
    } catch {
      /* storage full or blocked: still remembered while the app is open */
    }
  };

  /** Replace the data on this phone (screen + local storage). */
  // True when the last save on this phone failed (storage full): the app shows a warning.
  const [saveProblem, setSaveProblem] = useState(false);
  const replaceState = (next: AppState) => {
    stateRef.current = next;
    setCurrentProducts(next.groceryDatabase, next.groceryOverrides);
    setStateRaw(next);
    const ok = persistLocal(next);
    setSaveProblem((was) => (was === !ok ? was : !ok));
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
          // Away longer than deletions are remembered: start from the shared copy and add only what
          // was changed on this phone since it last synced, so things deleted meanwhile stay deleted.
          const lastOk = readLastSyncOk();
          const away = lastOk !== null && Date.now() - lastOk > LONG_ABSENCE_MS;
          const local = away
            ? keepOnlyChangesSince(stateRef.current, lastOk!)
            : dropDefaultsMissingFrom(stateRef.current, remote);
          merged = mergeAppStates(local, remote);
          if (away)
            setSyncNotice(
              "This phone hadn't synced for over 3 months, so it took the shared copy and kept only the changes made on it since.",
            );
          if (!statesEqual(merged, stateRef.current)) {
            replaceState(normalizeState(merged));
            merged = stateRef.current;
          }
        }
        // Keep the product list in one piece (folds in anything an older version of the app wrote).
        const tidied = normaliseProducts(stateRef.current, Date.now());
        if (tidied !== stateRef.current) {
          replaceState(normalizeState(tidied));
          merged = stateRef.current;
          setPending(true);
        }
        // Newer built-in product defaults (UK pack sizes, names), once per version, on the latest data.
        if (upgradeProductsIfDue()) merged = stateRef.current;

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

        writeLastSyncOk(Date.now());
        setSyncStatus('synced');
        setSyncError(null);
        // Quiet checks that found nothing new don't need to refresh the screen.
        if (!quiet || remote || willUpload) setLastSynced(new Date());
      } catch (err) {
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

  // Shopping lines from weeks long gone are cleared (through the normal save, so the other phone
  // clears them too): once, shortly after opening, when the first sync has had its chance.
  const clearOldLines = useEffectEvent(() => {
    const cur = stateRef.current;
    const old = new Set(oldShoppingLineIds(cur.shoppingList || [], formatDateISO(new Date())));
    if (old.size) commit(cur, { ...cur, shoppingList: cur.shoppingList.filter((i) => !old.has(i.id)) });
  });
  useEffect(() => {
    const t = setTimeout(() => clearOldLines(), getGistConfig() ? 15000 : 1500);
    return () => clearTimeout(t);
  }, []);

  // Background sync: on open, every SYNC_POLL_SECONDS while visible, on return to the app, and when
  // back online. Started again only when the Gist, the key or the pace (shopping mode) changes;
  // each round runs with everything as it is at that moment.
  const syncGistId = githubConfig?.gistId;
  const syncPat = githubConfig?.pat;
  const syncNow = useEffectEvent((reason: 'initial' | 'poll' | 'focus') => void runSync(reason));
  useEffect(() => {
    if (!syncGistId || !syncPat) return;
    syncNow('initial');
    const interval = setInterval(
      () => {
        if (document.visibilityState === 'visible') syncNow('poll');
      },
      (fastSync ? FAST_SYNC_SECONDS : SYNC_POLL_SECONDS) * 1000,
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow('focus');
    };
    const onOnline = () => syncNow('focus');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [syncGistId, syncPat, fastSync]);

  /** Newer built-in product defaults, applied once per catalogue version. True if it did anything. */
  const upgradeProductsIfDue = (): boolean => {
    const current = stateRef.current;
    if ((current.preferences?.catalogVersion ?? 1) >= CATALOG_VERSION) return false;
    commit(current, upgradeProductDefaults(current, DEFAULT_PREFERENCES));
    return true;
  };

  // Phones that don't sync: keep the product list in one piece and up to date, once on open
  // (syncing phones do it after each sync, so it works on the latest shared data).
  const tidyProductsOnOpen = useEffectEvent(() => {
    if (getGistConfig()) return;
    const current = stateRef.current;
    const tidied = normaliseProducts(current, Date.now());
    if (tidied !== current) replaceState(normalizeState(tidied));
    upgradeProductsIfDue();
  });
  useEffect(() => {
    tidyProductsOnOpen();
  }, []);

  // Shopping items that either of you removed, so they aren't regenerated automatically.
  const dismissedKey = getDismissedShoppingIds(state).join('|');
  const dismissedShoppingItemIds = useMemo(() => (dismissedKey ? dismissedKey.split('|') : []), [dismissedKey]);

  const addRecipe = async (recipe: Recipe) => {
    const toSave = stampRecipeNotes(
      { ...recipe, addedBy: currentUser },
      state.recipes.find((r) => r.id === recipe.id),
      currentUser,
    );
    const nextRecipes = [...state.recipes.filter((r) => r.id !== toSave.id), toSave];
    commit(state, { ...state, recipes: nextRecipes });
  };

  const writeRecipe = (base: AppState, recipe: Recipe) => {
    const toSave = stampRecipeNotes(
      { ...recipe, lastModifiedBy: currentUser },
      base.recipes.find((r) => r.id === recipe.id),
      currentUser,
    );
    const nextRecipes = base.recipes.map((r) => (r.id === toSave.id ? toSave : r));
    commit(base, { ...base, recipes: nextRecipes });
  };

  const updateRecipe = async (recipe: Recipe) => writeRecipe(state, recipe);

  /**
   * Change one recipe, starting from its latest copy: a recipe left open while the other phone
   * changes it keeps their change when you save yours.
   */
  const changeRecipe = (id: string, change: (latest: Recipe) => Recipe) => {
    const s = stateRef.current;
    const latest = s.recipes.find((r) => r.id === id);
    if (!latest) return;
    const next = change(latest);
    if (next !== latest) writeRecipe(s, next);
  };

  const deleteRecipe = async (recipeId: string) => {
    const nextRecipes = state.recipes.filter((r) => r.id !== recipeId);
    commit(state, { ...state, recipes: nextRecipes });
  };

  const updateMealPlan = async (plan: MealPlan) => {
    // Weeks are merged day by day, so the change is worked out against the copy the caller
    // started from: the latest one if that's what it read (an Undo, say), otherwise this screen's.
    const latest = stateRef.current;
    const readLatest =
      latest.mealPlans.find((p) => p.startDate === plan.startDate)?.lastModifiedAt === plan.lastModifiedAt;
    writeMealPlan(readLatest ? latest : stateRaw, plan);
  };

  /** Change one week, starting from its latest copy (null: leave it as it is). */
  const changeMealPlan = (planId: string, change: (latest: MealPlan) => MealPlan | null) => {
    const s = stateRef.current;
    const latest = s.mealPlans.find((p) => p.id === planId);
    if (!latest) return;
    const next = change(latest);
    if (next && next !== latest) writeMealPlan(s, next);
  };

  const writeMealPlan = (state: AppState, plan: MealPlan) => {
    const currentMondayStr = formatDateISO(getMonday(new Date()));
    const expectedId = `plan-${plan.startDate}`;
    const processedPlan = {
      ...plan,
      id: expectedId,
      isCurrent: plan.startDate === currentMondayStr,
      days: cleanDays(plan.days),
    };

    const maxWeeks = state.preferences?.maxForwardWeeks || DEFAULT_PREFERENCES.maxForwardWeeks || 4;
    if (isWeekBeyondForwardLimit(processedPlan.startDate, maxWeeks)) {
      console.warn(`Cannot add meal plan beyond forward limit (${maxWeeks} weeks)`, processedPlan.startDate);
      return;
    }

    if (processedPlan.status !== 'finalized') {
      const hasMeals = Object.values(processedPlan.days).some((day) => day.meals && day.meals.length > 0);
      processedPlan.status = hasMeals ? 'draft' : 'not_started';
    }

    processedPlan.lastModifiedAt = Date.now();
    processedPlan.lastModifiedBy = currentUser;
    // Who changed which day (and wrote which note), for the blue / pink marks.
    const beforePlan = state.mealPlans.find((p) => p.id === expectedId || p.startDate === processedPlan.startDate);
    processedPlan.days = stampPlanDays(processedPlan.days, beforePlan?.days, currentUser);

    const existingIdx = state.mealPlans.findIndex(
      (p) => p.id === expectedId || p.startDate === processedPlan.startDate,
    );
    const nextMealPlans: MealPlan[] = [...state.mealPlans];
    if (existingIdx >= 0) {
      nextMealPlans[existingIdx] = processedPlan;
    } else {
      nextMealPlans.push(processedPlan);
    }

    // Filter and deduplicate meal plans
    const plansByDate = new Map<string, MealPlan>();
    nextMealPlans.forEach((p) => {
      const existing = plansByDate.get(p.startDate);
      if (!existing || (p.lastModifiedAt || 0) > (existing.lastModifiedAt || 0)) {
        plansByDate.set(p.startDate, p);
      }
    });
    const finalPlans = Array.from(plansByDate.values());

    commit(state, { ...state, mealPlans: finalPlans });
  };

  const duplicatePlanToWeek = async (sourcePlanId: string, targetStartDate: string) => {
    const source = state.mealPlans.find((p) => p.id === sourcePlanId);
    if (!source) return;

    const targetMonday = new Date(targetStartDate + 'T00:00:00');
    const targetMondayStr = formatDateISO(targetMonday);
    const currentMondayStr = formatDateISO(getMonday(new Date()));

    const targetDays: Record<string, DayPlan> = {};
    DAYS_OF_WEEK.forEach((d, i) => {
      const dDate = new Date(targetMonday);
      dDate.setDate(targetMonday.getDate() + i);
      const sourceDay = source.days[d];
      const clonedMeals: PlannedMeal[] = (sourceDay?.meals || []).map((m) => {
        const { cooked, ...rest } = m; // a copied meal hasn't been cooked yet
        return { ...rest, id: crypto.randomUUID() };
      });
      targetDays[d] = {
        date: formatDateISO(dDate),
        meals: clonedMeals,
      };
    });

    const newPlanId = `plan-${targetMondayStr}`;
    const newPlan: MealPlan = {
      id: newPlanId,
      startDate: targetMondayStr,
      days: targetDays,
      status: 'draft',
      isCurrent: targetMondayStr === currentMondayStr,
      lastModifiedAt: Date.now(),
    };

    const nextMealPlans = state.mealPlans.filter((p) => p.startDate !== targetMondayStr);
    nextMealPlans.push(newPlan);

    commit(state, { ...state, mealPlans: nextMealPlans });
  };

  const clearPastWeeks = async () => {
    const nextMealPlans = state.mealPlans.filter((p) => !isPastWeek(p.startDate));
    commit(state, { ...state, mealPlans: nextMealPlans });
  };

  const addBatch = async (batch: BatchItem) => {
    const stamped = stampBatch(
      batch,
      state.batches.find((b) => b.id === batch.id),
      currentUser,
    );
    const nextBatches = [...state.batches.filter((b) => b.id !== batch.id), stamped];
    commit(state, { ...state, batches: nextBatches });
  };

  const updateBatch = async (batch: BatchItem) => {
    const nextBatches = state.batches.map((b) => (b.id === batch.id ? stampBatch(batch, b, currentUser) : b));
    commit(state, { ...state, batches: nextBatches });
  };

  const removeBatch = async (batchId: string) => {
    const nextBatches = state.batches.filter((b) => b.id !== batchId);
    commit(state, { ...state, batches: nextBatches });
  };

  /** Change one freezer batch, starting from its latest copy (null takes it out of the freezer). */
  const changeBatch = (id: string, change: (latest: BatchItem) => BatchItem | null) => {
    const s = stateRef.current;
    const latest = s.batches.find((b) => b.id === id);
    if (!latest) return;
    const next = change(latest);
    if (next === latest) return;
    const nextBatches = next
      ? s.batches.map((b) => (b.id === id ? stampBatch(next, b, currentUser) : b))
      : s.batches.filter((b) => b.id !== id);
    commit(s, { ...s, batches: nextBatches });
  };

  const areItemsEqual = (a: ShoppingListItem, b: ShoppingListItem): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (key === 'addedBy' || key === 'lastModifiedBy' || key === 'lastModifiedAt') {
        continue;
      }
      const valA = (a as unknown as Record<string, unknown>)[key];
      const valB = (b as unknown as Record<string, unknown>)[key];

      if (valA === valB) continue;

      if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) {
        if (JSON.stringify(valA) === JSON.stringify(valB)) continue;
      }

      return false;
    }
    return true;
  };

  /**
   * Save the shopping list. Pass a function to work from the latest list (and data): a change
   * worked out from what's on screen can be a moment behind (two changes in one tap, a window
   * left open while the other phone syncs).
   */
  const updateShoppingList = async (
    listOrChange: ShoppingListItem[] | ((latest: ShoppingListItem[], latestState: AppState) => ShoppingListItem[]),
  ) => {
    const fromLatest = typeof listOrChange === 'function';
    const state = fromLatest ? stateRef.current : stateRaw;
    const list = fromLatest ? listOrChange(state.shoppingList, state) : listOrChange;
    if (fromLatest && list === state.shoppingList) return;
    const processedList = list.map((item) => {
      const existingItem = state.shoppingList.find((i) => i.id === item.id);
      if (!existingItem) {
        return {
          ...stampShoppingItem(item, undefined, currentUser),
          addedBy: item.addedBy || currentUser,
          lastModifiedBy: item.lastModifiedBy || currentUser,
          lastModifiedAt: item.lastModifiedAt || Date.now(),
        };
      }

      const hasChanged = !areItemsEqual(item, existingItem);
      if (!hasChanged) {
        return existingItem;
      }
      return {
        ...stampShoppingItem(item, existingItem, currentUser),
        addedBy: existingItem.addedBy || item.addedBy || currentUser,
        lastModifiedBy: currentUser,
        lastModifiedAt: Date.now(),
      };
    });

    commit(state, { ...state, shoppingList: processedList });
  };

  const updateGroceryDatabase = async (dbDb: GroceryItem[]) => {
    commit(state, { ...state, groceryDatabase: dbDb });
  };

  // ---- Products: everything is in the one shared list ----
  /** Apply a change to the latest data (so two quick changes in one tap both count). */
  const editLatest = (change: (s: AppState) => AppState | null) => {
    const s = stateRef.current;
    const next = change(s);
    if (next && next !== s) commit(s, next);
  };

  /** Add a product or save changes to one. */
  const saveProduct = (item: GroceryItem) => editLatest((s) => saveProductIn(s, item));

  /** Change some details of a product (older screens call this; it writes to the shared list). */
  const updateGroceryOverride = async (id: string, updates: Partial<GroceryItem>) => {
    editLatest((s) => updateProductIn(s, id, updates));
  };

  /** Take a product off the list; returns what Undo needs. */
  const removeProduct = (id: string): RemovedProduct | null => {
    const s = stateRef.current;
    const r = removeProductIn(s, id);
    if (!r) return null;
    commit(s, r.next);
    return r.undo;
  };
  const restoreProduct = (undo: RemovedProduct) => editLatest((s) => restoreProductIn(s, undo));

  /** "Same as…": merge one product into another. */
  const mergeProducts = (keepId: string, goneId: string) =>
    editLatest((s) => mergeProductsIn(s, catalogForState(s), keepId, goneId));
  /** "Not the same": the tidy-up check stops pairing these two. */
  const markProductsDifferent = (aId: string, bId: string) => editLatest((s) => markDifferentIn(s, aId, bId));
  /** Back to the app's own products. */
  const resetProducts = () => editLatest(resetProductsIn);
  /** Products loaded from a file. */
  const replaceProducts = (items: GroceryItem[]) => editLatest((s) => replaceProductsIn(s, items));

  /** Gemini's tidy-up suggestions: merges, renames and new aisles. */
  const applyGroceryCleanActions = async (actions: DatabaseCleanAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;
    editLatest((start) => {
      let s = start;
      for (const action of actions) {
        const product = catalogForState(s).byId.get(action.primaryItemId)?.item;
        if (!product) continue;
        if (action.actionType === 'merge' && action.secondaryItemId) {
          s = mergeProductsIn(s, catalogForState(s), action.primaryItemId, action.secondaryItemId) || s;
        }
        const changes: Partial<GroceryItem> = {};
        if (action.newName && action.newName.trim() && action.newName.trim() !== product.name) {
          changes.name = action.newName.trim();
          const current = (s.groceryDatabase || []).find((g) => g.id === product.id) || product;
          changes.aliases = [...new Set([...(current.aliases || []), product.name])];
        }
        if (action.newAisle && action.newAisle.trim()) changes.category = action.newAisle.trim();
        if (Object.keys(changes).length) s = updateProductIn(s, product.id, changes);
      }
      return s;
    });
  };

  const getHydratedGroceryItem = (id: string): GroceryItem | undefined =>
    catalogForState(stateRef.current).byId.get(id)?.item;

  /**
   * Change settings. Pass a function to work out the change from the latest settings (adding
   * to a list such as ratings or past shops); return null to change nothing.
   */
  const updatePreferences = async (
    prefsOrChange: Partial<UserPreferences> | ((latest: UserPreferences) => Partial<UserPreferences> | null),
  ) => {
    const base = typeof prefsOrChange === 'function' ? stateRef.current : state;
    const current = base.preferences || DEFAULT_PREFERENCES;
    const prefs = typeof prefsOrChange === 'function' ? prefsOrChange(current) : prefsOrChange;
    if (!prefs) return;
    commit(base, { ...base, preferences: { ...current, ...prefs } });
  };

  /** Settings back to how they started; keeps your staples, favourites, aisle order and shop history. */
  const resetPreferences = async () => {
    const keep = [
      'recurringItems',
      'favouriteItems',
      'aisleOrder',
      'shopRoute',
      'shopHistory',
      'catalogVersion',
      'ratings',
      'notStaples',
      'notProducts',
    ] as const;
    const kept: Partial<UserPreferences> = {};
    for (const k of keep) if (state.preferences?.[k] !== undefined) Object.assign(kept, { [k]: state.preferences[k] });
    commit(state, { ...state, preferences: { ...DEFAULT_PREFERENCES, ...kept } });
  };

  const exportAllData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importAllData = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        const s = stateRef.current;
        const next = normalizeState(parsed);
        commit(s, normaliseProducts(next, Date.now()));
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
          replaceState(
            normalizeState(mergeAppStates(dropDefaultsMissingFrom(stateRef.current, remoteState), remoteState)),
          );
        }
        const saved = await saveGist(config, stateRef.current, gistFilesRef.current);
        etagRef.current = saved.etag;
        gistFilesRef.current = saved.files;
      }
      setPending(false);
      writeLastSyncOk(Date.now());
      setGithubConfigState(config);
      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err) {
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
      writeLastSyncOk(Date.now());
      setGithubConfigState({ pat: pat.trim(), gistId: created.id });
      setSyncStatus('synced');
      setLastSynced(new Date());
      return created.id;
    } catch (err) {
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
    /** The last save on this phone failed (storage full). */
    saveProblem,
    /** The very latest state, including edits made earlier in the same tap (state is a render behind). */
    getState: () => stateRef.current,
    selectedPlanId,
    setSelectedPlanId,
    addRecipe,
    updateRecipe,
    changeRecipe,
    deleteRecipe,
    updateMealPlan,
    changeMealPlan,
    duplicatePlanToWeek,
    clearPastWeeks,
    addBatch,
    updateBatch,
    removeBatch,
    changeBatch,
    updateShoppingList,
    updateGroceryDatabase,
    updateGroceryOverride,
    applyGroceryCleanActions,
    getHydratedGroceryItem,
    saveProduct,
    removeProduct,
    restoreProduct,
    mergeProducts,
    markProductsDifferent,
    resetProducts,
    replaceProducts,
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
    syncNotice,
    clearSyncNotice: () => setSyncNotice(null),
    syncPollSeconds: fastSync ? FAST_SYNC_SECONDS : SYNC_POLL_SECONDS,
    setFastSync,
    /** Who is using this phone ('P' or 'R'). */
    currentUser,
    saveGithubConfig,
    createGistFromLocal,
    clearGithubConfig,
    manualSync,
  };
}
