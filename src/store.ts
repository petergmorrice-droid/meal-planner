import { useState, useEffect, useRef } from 'react';
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
  fetchFromGist, saveToGist, createPrivateGist, mergeAppStates, GistConfig 
} from './services/gistStorage';

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
  
  return [
    createEmptyPlan(currentMonday),
    createEmptyPlan(nextMonday)
  ];
};

const getInitialState = (): AppState => {
  try {
    const cached = localStorage.getItem('mealPlannerAppStateCache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return {
          recipes: parsed.recipes || [],
          mealPlans: parsed.mealPlans || getInitialMealPlans(),
          batches: parsed.batches || [],
          shoppingList: parsed.shoppingList || [],
          preferences: parsed.preferences || { ...DEFAULT_PREFERENCES },
          groceryDatabase: parsed.groceryDatabase || INITIAL_GROCERY_DATABASE,
          groceryOverrides: parsed.groceryOverrides || {}
        };
      }
    }
  } catch (e) {}

  // Fallback to legacy local storage structures if they exist
  let legacyDb = INITIAL_GROCERY_DATABASE;
  let legacyOverrides = {};
  try {
    const legacyStateStr = localStorage.getItem('mealPlannerState');
    if (legacyStateStr) {
      const parsed = JSON.parse(legacyStateStr);
      if (parsed.groceryDatabase) legacyDb = parsed.groceryDatabase;
      if (parsed.groceryOverrides) legacyOverrides = parsed.groceryOverrides;
    }
  } catch (e) {}

  let legacyPrefs = { ...DEFAULT_PREFERENCES };
  try {
    const storedFavs = localStorage.getItem('mealPlannerCustomFavouritesObj');
    if (storedFavs) {
      legacyPrefs.favouriteItems = JSON.parse(storedFavs);
    }
  } catch (e) {}

  return {
    recipes: [],
    mealPlans: getInitialMealPlans(),
    batches: [],
    shoppingList: [],
    preferences: legacyPrefs,
    groceryDatabase: legacyDb,
    groceryOverrides: legacyOverrides
  };
};

let syncTimeoutId: any = null;

export function useStore() {
  const [state, setState] = useState<AppState>(getInitialState);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentUser = useDeviceIdentity();

  // GitHub Sync States
  const [githubConfig, setGithubConfigState] = useState<GistConfig | null>(getGistConfig);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Guard ref to prevent any automatic background/sync saves during initial fetch-and-merge
  const isInitialLoadingRef = useRef<boolean>(true);

  // Initial fetch/sync from Gist
  useEffect(() => {
    const config = getGistConfig();
    if (config) {
      setSyncStatus('loading');
      isInitialLoadingRef.current = true;
      fetchFromGist(config)
        .then((remoteState) => {
          if (remoteState) {
            // Merge remote state with local state (offline edits safe merge)
            const merged = mergeAppStates(getInitialState(), remoteState);
            setState(merged);
            // Save back to local cache
            localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(merged));
            localStorage.setItem('mealPlannerMealPlans', JSON.stringify(merged.mealPlans));
            localStorage.setItem('mealPlannerState', JSON.stringify({
              groceryDatabase: merged.groceryDatabase,
              groceryOverrides: merged.groceryOverrides
            }));
            
            // Sync any merged state back to the Gist in the background
            saveToGist(config, merged).catch(console.error);
          }
          setSyncStatus('synced');
          setLastSynced(new Date());
        })
        .catch((err) => {
          console.error('Initial Gist fetch failed:', err);
          setSyncStatus('error');
          setSyncError(err.message || 'Failed to load Gist. Working in offline mode.');
        })
        .finally(() => {
          isInitialLoadingRef.current = false;
        });
    } else {
      isInitialLoadingRef.current = false;
    }
  }, []);

  // Save state to local storage and queue sync to Gist
  const saveStateAndSync = (newState: AppState) => {
    // 1. Instantly save to local storage for zero-latency offline safety
    try {
      localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(newState));
      localStorage.setItem('mealPlannerMealPlans', JSON.stringify(newState.mealPlans));
      localStorage.setItem('mealPlannerState', JSON.stringify({
        groceryDatabase: newState.groceryDatabase,
        groceryOverrides: newState.groceryOverrides
      }));
    } catch (e) {
      console.error('Failed to write local storage state cache', e);
    }

    // 2. Debounce/Queue write to Gist if connected and not performing initial load
    const config = getGistConfig();
    if (config && !isInitialLoadingRef.current) {
      if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
      }
      setSyncStatus('loading');
      syncTimeoutId = setTimeout(async () => {
        try {
          await saveToGist(config, newState);
          setSyncStatus('synced');
          setLastSynced(new Date());
          setSyncError(null);
        } catch (err: any) {
          console.error('Debounced Gist save failed:', err);
          setSyncStatus('error');
          setSyncError(err.message || 'Failed to save changes to GitHub Gist.');
        }
      }, 1000); // 1-second debounce delay
    }
  };

  const addRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    withBreakdowns.addedBy = currentUser;
    const nextRecipes = [...state.recipes.filter(r => r.id !== withBreakdowns.id), withBreakdowns];
    const nextState = { ...state, recipes: nextRecipes };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const updateRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    const nextRecipes = state.recipes.map(r => r.id === withBreakdowns.id ? withBreakdowns : r);
    const nextState = { ...state, recipes: nextRecipes };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const deleteRecipe = async (recipeId: string) => {
    const nextRecipes = state.recipes.filter(r => r.id !== recipeId);
    const nextState = { ...state, recipes: nextRecipes };
    setState(nextState);
    saveStateAndSync(nextState);
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

    const nextState = { ...state, mealPlans: finalPlans };
    setState(nextState);
    saveStateAndSync(nextState);
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

    const nextState = { ...state, mealPlans: finalPlans };
    setState(nextState);
    saveStateAndSync(nextState);
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

    const nextState = { ...state, mealPlans: nextMealPlans };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const seedSamplePastWeeks = async () => {
    const sample = createSamplePastWeeks();
    const existingDates = new Set(state.mealPlans.map(p => p.startDate));
    const toAdd = sample.filter(p => !existingDates.has(p.startDate));
    
    if (toAdd.length === 0) return;

    toAdd.forEach(plan => {
      plan.lastModifiedAt = Date.now();
    });

    const nextMealPlans = [...state.mealPlans, ...toAdd];
    const nextState = { ...state, mealPlans: nextMealPlans };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const clearPastWeeks = async () => {
    const nextMealPlans = state.mealPlans.filter(p => !isPastWeek(p.startDate));
    const nextState = { ...state, mealPlans: nextMealPlans };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const addBatch = async (batch: BatchItem) => {
    const nextBatches = [...state.batches.filter(b => b.id !== batch.id), batch];
    const nextState = { ...state, batches: nextBatches };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const updateBatch = async (batch: BatchItem) => {
    const nextBatches = state.batches.map(b => b.id === batch.id ? batch : b);
    const nextState = { ...state, batches: nextBatches };
    setState(nextState);
    saveStateAndSync(nextState);
  };
  
  const removeBatch = async (batchId: string) => {
    const nextBatches = state.batches.filter(b => b.id !== batchId);
    const nextState = { ...state, batches: nextBatches };
    setState(nextState);
    saveStateAndSync(nextState);
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
      return {
        ...item,
        addedBy: existingItem.addedBy || item.addedBy || currentUser,
        lastModifiedBy: hasChanged ? currentUser : (existingItem.lastModifiedBy || currentUser),
        lastModifiedAt: hasChanged ? Date.now() : (existingItem.lastModifiedAt || Date.now())
      };
    });

    const nextState = { ...state, shoppingList: processedList };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const updateGroceryDatabase = async (dbDb: GroceryItem[]) => {
    const nextState = { ...state, groceryDatabase: dbDb };
    setState(nextState);
    saveStateAndSync(nextState);
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

    const nextState = {
      ...state,
      groceryDatabase: updatedItems,
      groceryOverrides: updatedOverrides
    };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const updateGroceryOverride = async (id: string, updates: Partial<GroceryItem>) => {
    const currentOverrides = state.groceryOverrides || {};
    const newOverrides = { ...currentOverrides, [id]: { ...(currentOverrides[id] || {}), ...updates } };
    const nextState = { ...state, groceryOverrides: newOverrides };
    setState(nextState);
    saveStateAndSync(nextState);
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
    const nextState = { ...state, preferences: newPrefs };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const resetPreferences = async () => {
    const nextState = { ...state, preferences: DEFAULT_PREFERENCES };
    setState(nextState);
    saveStateAndSync(nextState);
  };

  const exportAllData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importAllData = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        setState(parsed);
        saveStateAndSync(parsed);
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
      const remoteState = await fetchFromGist(config);
      saveGistConfig(pat, gistId);
      setGithubConfigState(config);

      let finalState = state;
      if (syncMode === 'pull') {
        if (remoteState) {
          finalState = remoteState;
        }
      } else if (syncMode === 'push') {
        await saveToGist(config, state);
      } else if (syncMode === 'merge') {
        if (remoteState) {
          finalState = mergeAppStates(state, remoteState);
          await saveToGist(config, finalState);
        } else {
          await saveToGist(config, state);
        }
      }

      setState(finalState);
      // Immediately trigger save to local storagecache and Gist
      try {
        localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(finalState));
        localStorage.setItem('mealPlannerMealPlans', JSON.stringify(finalState.mealPlans));
        localStorage.setItem('mealPlannerState', JSON.stringify({
          groceryDatabase: finalState.groceryDatabase,
          groceryOverrides: finalState.groceryOverrides
        }));
      } catch (e) {}

      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err: any) {
      console.error('Failed to configure Gist integration:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Failed to configure GitHub Gist.');
      throw err;
    }
  };

  const createGistFromLocal = async (pat: string): Promise<string> => {
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const newGistId = await createPrivateGist(pat.trim(), state);
      saveGistConfig(pat, newGistId);
      setGithubConfigState({ pat: pat.trim(), gistId: newGistId });
      setSyncStatus('synced');
      setLastSynced(new Date());
      return newGistId;
    } catch (err: any) {
      console.error('Failed to create private Gist:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Failed to create a private GitHub Gist.');
      throw err;
    }
  };

  const clearGithubConfig = () => {
    clearGistConfig();
    setGithubConfigState(null);
    setSyncStatus('idle');
    setLastSynced(null);
    setSyncError(null);
  };

  const manualSync = async () => {
    const config = getGistConfig();
    if (!config) return;
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const remoteState = await fetchFromGist(config);
      if (remoteState) {
        const merged = mergeAppStates(state, remoteState);
        setState(merged);
        await saveToGist(config, merged);
        // Save to cache
        localStorage.setItem('mealPlannerAppStateCache', JSON.stringify(merged));
        localStorage.setItem('mealPlannerMealPlans', JSON.stringify(merged.mealPlans));
        localStorage.setItem('mealPlannerState', JSON.stringify({
          groceryDatabase: merged.groceryDatabase,
          groceryOverrides: merged.groceryOverrides
        }));
      }
      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err: any) {
      console.error('Manual Gist sync failed:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Failed to sync with Gist.');
    }
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
    // GitHub Gist exports
    githubConfig,
    syncStatus,
    lastSynced,
    syncError,
    saveGithubConfig,
    createGistFromLocal,
    clearGithubConfig,
    manualSync
  };
}
