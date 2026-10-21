/**
 * Changing recipes, weeks, the freezer and the shopping list. Each change is worked out here and
 * saved through the store's commit (see StoreCore), which merges it onto the newest data.
 */
import { stampShoppingItem, stampPlanDays, stampBatch, stampRecipeNotes } from '../whoChanged';
import { Recipe, MealPlan, PlannedMeal, BatchItem, ShoppingListItem, AppState, DayPlan } from '../types';
import { getMonday, formatDateISO, isPastWeek, isWeekBeyondForwardLimit, cleanDays, DAYS_OF_WEEK } from '../utils';
import { DEFAULT_PREFERENCES } from './saved';

/** What the ways to change the data are given by the store. */
export interface StoreCore {
  /** The data as the screen last drew it. */
  state: AppState;
  /** The newest data (a change made or downloaded a moment ago counts). */
  latest: () => AppState;
  /**
   * Save a change: `next` is `base` with the change made. Only the difference is applied, on top of
   * the newest data, so a change never undoes one it didn't touch.
   */
  commit: (base: AppState, next: AppState) => void;
  /** Who's using this phone ('P' or 'R'). */
  currentUser: string;
}

/** Changes to recipes, weeks, the freezer and the shopping list. */
export function dataEdits({ state, latest: newest, commit, currentUser }: StoreCore) {
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
    const s = newest();
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
    const latest = newest();
    const readLatest =
      latest.mealPlans.find((p) => p.startDate === plan.startDate)?.lastModifiedAt === plan.lastModifiedAt;
    writeMealPlan(readLatest ? latest : state, plan);
  };

  /** Change one week, starting from its latest copy (null: leave it as it is). */
  const changeMealPlan = (planId: string, change: (latest: MealPlan) => MealPlan | null) => {
    const s = newest();
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
    const s = newest();
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
    const base = fromLatest ? newest() : state;
    const list = fromLatest ? listOrChange(base.shoppingList, base) : listOrChange;
    if (fromLatest && list === base.shoppingList) return;
    const processedList = list.map((item) => {
      const existingItem = base.shoppingList.find((i) => i.id === item.id);
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

    commit(base, { ...base, shoppingList: processedList });
  };

  return {
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
  };
}
