const fs = require('fs');

const code = `import { useState, useEffect } from 'react';
import { 
  Recipe, MealPlan, PlannedMeal, BatchItem, 
  ShoppingListItem, UserPreferences, GroceryItem, AppState, DayPlan 
} from './types';
import { 
  getMonday, formatDateISO, isPastWeek, isWeekBeyondForwardLimit,
  cleanDays, DAYS_OF_WEEK 
} from './utils';
import { INITIAL_GROCERY_DATABASE } from './utils/initialGroceryDb';
import { ensureRecipeBreakdowns } from './utils/recipeBreakdowns';
import { createSamplePastWeeks } from './utils/sampleData';
import { db, auth } from './firebaseConfig';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useDeviceIdentity } from './hooks/useDeviceIdentity';

const DEFAULT_PREFERENCES: UserPreferences = {
  showPrepTime: true,
  showCookTime: true,
  showTotalTime: true,
  showHealth: true,
  showCost: true,
  showMethod: true,
  showVegetarian: true,
  showVegan: true,
  defaultServings: 2,
  adultCount: 2,
  childCount: 0,
  currencySymbol: '£',
  weeklyBudgetLimit: 60,
  defaultTakeoutCost: 15,
  defaultEatingOutCost: 20,
  maxForwardWeeks: 4,
  firstDayOfWeek: 'Monday',
  preferredCookingMethod: 'all',
  targetHealthScore: 7.0,
  compactPlanningCards: false
};

const getInitialState = (): AppState => {
  return {
    recipes: [],
    mealPlans: [],
    batches: [],
    shoppingList: [],
    preferences: { ...DEFAULT_PREFERENCES },
    groceryDatabase: INITIAL_GROCERY_DATABASE,
    groceryOverrides: {}
  };
};

export function useStore() {
  const [state, setState] = useState<AppState>(getInitialState);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentUser = useDeviceIdentity();
  
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        // Sync Recipes
        const recipesUnsub = onSnapshot(collection(db, 'households/morrice-family/recipes'), (snapshot) => {
          const recipes = snapshot.docs.map(doc => doc.data() as Recipe);
          setState(s => ({ ...s, recipes }));
        });

        // Sync Meal Plans
        const plansUnsub = onSnapshot(collection(db, 'households/morrice-family/mealPlans'), (snapshot) => {
          const mealPlans = snapshot.docs.map(doc => doc.data() as MealPlan);
          setState(s => ({ ...s, mealPlans }));
        });

        // Sync Grocery Overrides
        const overridesUnsub = onSnapshot(doc(db, 'households/morrice-family/data/groceryOverrides'), (snapshot) => {
          if (snapshot.exists()) {
            setState(s => ({ ...s, groceryOverrides: snapshot.data().overrides || {} }));
          }
        });

        // Sync Preferences
        const prefsUnsub = onSnapshot(doc(db, 'households/morrice-family/data/preferences'), (snapshot) => {
          if (snapshot.exists()) {
            setState(s => ({ ...s, preferences: { ...DEFAULT_PREFERENCES, ...(snapshot.data() as UserPreferences) } }));
          }
        });

        // Sync Shopping State
        const shoppingUnsub = onSnapshot(doc(db, 'households/morrice-family/data/shoppingState'), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setState(s => ({ ...s, shoppingList: data.items || [] }));
          }
        });

        return () => {
          recipesUnsub();
          plansUnsub();
          overridesUnsub();
          prefsUnsub();
          shoppingUnsub();
        };
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const addRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    withBreakdowns.addedBy = currentUser;
    withBreakdowns.lastModifiedBy = currentUser;
    withBreakdowns.lastModifiedAt = Date.now();
    await setDoc(doc(db, 'households/morrice-family/recipes', withBreakdowns.id), withBreakdowns, { merge: true });
  };

  const updateRecipe = async (recipe: Recipe) => {
    const withBreakdowns = ensureRecipeBreakdowns(recipe);
    withBreakdowns.lastModifiedBy = currentUser;
    withBreakdowns.lastModifiedAt = Date.now();
    await setDoc(doc(db, 'households/morrice-family/recipes', withBreakdowns.id), withBreakdowns, { merge: true });
  };

  const deleteRecipe = async (recipeId: string) => {
    await deleteDoc(doc(db, 'households/morrice-family/recipes', recipeId));
  };

  const updateMealPlan = async (plan: MealPlan) => {
    const currentMondayStr = formatDateISO(getMonday(new Date()));
    let processedPlan = { 
      ...plan, 
      isCurrent: plan.startDate === currentMondayStr,
      days: cleanDays(plan.days) 
    };

    const maxWeeks = state.preferences?.maxForwardWeeks || DEFAULT_PREFERENCES.maxForwardWeeks || 4;
    if (isWeekBeyondForwardLimit(processedPlan.startDate, maxWeeks)) {
      console.warn(\`Cannot add meal plan beyond forward limit (\${maxWeeks} weeks)\`, processedPlan.startDate);
      return;
    }

    if (processedPlan.status !== 'finalized') {
      const hasMeals = Object.values(processedPlan.days).some((day: any) => day.meals && day.meals.length > 0);
      processedPlan.status = hasMeals ? 'draft' : 'not_started';
    }

    processedPlan.lastModifiedBy = currentUser;
    processedPlan.lastModifiedAt = Date.now();
    
    // Auto-detect existing date duplicates
    const indexByDate = state.mealPlans.findIndex(p => p.startDate === processedPlan.startDate);
    if (indexByDate >= 0 && state.mealPlans[indexByDate].id !== processedPlan.id) {
       // Delete the old duplicate one if ID differs
       await deleteDoc(doc(db, 'households/morrice-family/mealPlans', state.mealPlans[indexByDate].id));
    }

    await setDoc(doc(db, 'households/morrice-family/mealPlans', processedPlan.id), processedPlan, { merge: true });
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

    const existingTargetIdx = state.mealPlans.findIndex(p => p.startDate === targetMondayStr);
    const newPlanId = existingTargetIdx >= 0 ? state.mealPlans[existingTargetIdx].id : crypto.randomUUID();

    const newPlan: MealPlan = {
      id: newPlanId,
      startDate: targetMondayStr,
      days: targetDays,
      status: 'draft',
      isCurrent: targetMondayStr === currentMondayStr,
      lastModifiedBy: currentUser,
      lastModifiedAt: Date.now()
    };

    await setDoc(doc(db, 'households/morrice-family/mealPlans', newPlan.id), newPlan, { merge: true });
  };

  const seedSamplePastWeeks = async () => {
    const sample = createSamplePastWeeks();
    const existingDates = new Set(state.mealPlans.map(p => p.startDate));
    const toAdd = sample.filter(p => !existingDates.has(p.startDate));
    
    for (const plan of toAdd) {
      plan.lastModifiedBy = currentUser;
      plan.lastModifiedAt = Date.now();
      await setDoc(doc(db, 'households/morrice-family/mealPlans', plan.id), plan, { merge: true });
    }
  };

  const clearPastWeeks = async () => {
    const pastPlans = state.mealPlans.filter(p => isPastWeek(p.startDate));
    for (const plan of pastPlans) {
      await deleteDoc(doc(db, 'households/morrice-family/mealPlans', plan.id));
    }
  };

  const addBatch = (batch: BatchItem) => {
    setState(s => ({ ...s, batches: [...s.batches, batch] }));
  };

  const updateBatch = (batch: BatchItem) => {
    setState(s => {
      const index = s.batches.findIndex(b => b.id === batch.id);
      if (index >= 0) {
        const newBatches = [...s.batches];
        newBatches[index] = batch;
        return { ...s, batches: newBatches };
      }
      return s;
    });
  };
  
  const removeBatch = (batchId: string) => {
      setState(s => ({ ...s, batches: s.batches.filter(b => b.id !== batchId) }));
  };

  const updateShoppingList = async (list: ShoppingListItem[]) => {
    const processedList = list.map(item => ({
      ...item,
      lastModifiedBy: currentUser,
      lastModifiedAt: Date.now()
    }));
    await setDoc(doc(db, 'households/morrice-family/data/shoppingState'), { items: processedList }, { merge: true });
  };

  const updateGroceryDatabase = (dbDb: GroceryItem[]) => {
    // Only local static for now
    setState(s => ({ ...s, groceryDatabase: dbDb }));
  };

  const updateGroceryOverride = async (id: string, updates: Partial<GroceryItem>) => {
    const currentOverrides = state.groceryOverrides || {};
    const newOverrides = { ...currentOverrides, [id]: { ...(currentOverrides[id] || {}), ...updates } };
    await setDoc(doc(db, 'households/morrice-family/data/groceryOverrides'), { overrides: newOverrides }, { merge: true });
  };

  const getHydratedGroceryItem = (id: string): GroceryItem | undefined => {
    const baseItem = INITIAL_GROCERY_DATABASE.find(item => item.id === id);
    if (!baseItem) return undefined;
    const override = state.groceryOverrides?.[id] || {};
    return { ...baseItem, ...override };
  };

  const updatePreferences = async (prefs: Partial<AppState['preferences']>) => {
    const newPrefs = { ...(state.preferences || DEFAULT_PREFERENCES), ...prefs };
    await setDoc(doc(db, 'households/morrice-family/data/preferences'), newPrefs, { merge: true });
  };

  const resetPreferences = async () => {
    await setDoc(doc(db, 'households/morrice-family/data/preferences'), DEFAULT_PREFERENCES, { merge: true });
  };

  const exportAllData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importAllData = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        // Here we could iterate and save to firebase...
        // Leaving local state set for now
        setState(parsed);
        return true;
      }
    } catch (e) {
      console.error('Failed to import data', e);
    }
    return false;
  };

  return { 
    state, 
    selectedPlanId,
    setSelectedPlanId,
    addRecipe, 
    updateRecipe, 
    deleteRecipe, 
    updateMealPlan, 
    duplicatePlanToWeek,
    seedSamplePastWeeks,
    clearPastWeeks,
    addBatch, 
    updateBatch, 
    removeBatch, 
    updateShoppingList, 
    updateGroceryDatabase,
    updateGroceryOverride,
    getHydratedGroceryItem,
    updatePreferences,
    resetPreferences,
    exportAllData,
    importAllData
  };
}
`;

fs.writeFileSync('src/store.ts', code);
