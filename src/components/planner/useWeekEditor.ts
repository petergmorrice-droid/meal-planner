/**
 * Changing the meals on the week on screen: adding (asking "How are you having it?" when it could
 * be leftovers or from the freezer), replacing, moving, removing (with Undo, and asking first when
 * leftovers depend on it), notes and people, sides, copying a week, and sending it to the list.
 *
 * Every change is worked out from the latest copy of the week (what's on screen can be a moment
 * behind: a window left open while the other phone syncs), and Undo only puts back the days the
 * change touched.
 */
import { useState } from 'react';
import { BatchItem, DayPlan, MealPlan, MealType, PlannedMeal, PlannedMealSide, Recipe, TabName } from '../../types';
import { canPlanFollowingWeek, createEmptyPlan, formatDateISO, syncRecurringStaplesForPlan } from '../../utils';
import {
  changeDayMeal,
  copyWeekMeals,
  describeMealChange,
  earlierDaysWithRecipe,
  listSnapshot,
  mealOnDay,
  moveMeal,
  undoDays,
} from '../../planning';
import { sendWeekToShoppingList } from '../../planShopping';
import { freezerBatchesFor } from '../../recipeInfo';
import type { ToastAction } from './usePlanToast';
import type { AppStore } from '../../store';

/** "How are you having it?": leftovers from an earlier day, from the freezer, or cooked fresh. */
export interface HowPrompt {
  dayName: string;
  recipe: Recipe;
  existingDays: string[];
  freezer?: { batchId: string; portions: number };
}

/** Taking a meal away would leave leftover days with nothing to be leftovers of. */
export interface RemoveLeftoversPrompt {
  targetDayName: string;
  targetMealName: string;
  leftoverDays: string[];
  /** The change being asked about (made on the latest week when you say yes). */
  mealToRemove: PlannedMeal;
  newMeal: PlannedMeal | null;
  isReplacement: boolean;
}

type Days = Record<string, DayPlan>;

export function useWeekEditor({
  store,
  currentPlan,
  defaultServings,
  weekLabel,
  setToastMessage,
  onNavigateTab,
}: {
  store: AppStore;
  currentPlan: MealPlan | undefined;
  /** Your usual number of people (Settings → Household). */
  defaultServings: number;
  weekLabel: (startDate: string) => string;
  setToastMessage: (msg: string | null, action?: ToastAction | null) => void;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
}) {
  const [howPrompt, setHowPrompt] = useState<HowPrompt | null>(null);
  const [removeLeftoversPrompt, setRemoveLeftoversPrompt] = useState<RemoveLeftoversPrompt | null>(null);

  /** The week as it is now (a change made a moment ago, here or on the other phone, included). */
  const live = (): MealPlan | undefined =>
    currentPlan && (store.getState().mealPlans.find((p) => p.id === currentPlan.id) || currentPlan);

  // "Removed Chicken fajitas · Undo": the days the change touched go back as they were.
  const offerUndo = (label: string, planId: string, before: Days, after: Days) => {
    setToastMessage(label, {
      label: 'Undo',
      run: () => {
        store.changeMealPlan(planId, (p) => ({ ...p, days: undoDays(p.days, before, after) }));
        setToastMessage('Undone');
      },
    });
  };

  /**
   * Change the week's days, starting from the latest copy (null: no change). A week already sent
   * to the shopping list just gets an "Update list" button afterwards; weeks sent before the app
   * kept a record are taken as matching the list. With `undoLabel`, says so with Undo.
   * True if it changed something.
   */
  const editDays = (change: (days: Days) => Days | null, undoLabel?: string): boolean => {
    if (!currentPlan) return false;
    let before: Days | null = null;
    let after: Days | null = null;
    store.changeMealPlan(currentPlan.id, (p) => {
      const next = change(p.days);
      if (!next) return null;
      before = p.days;
      after = next;
      const keepRecord =
        p.status === 'finalized' && !p.lastFinalizedSnapshot ? { lastFinalizedSnapshot: listSnapshot(p) } : {};
      return { ...p, ...keepRecord, days: next };
    });
    if (!before || !after) return false;
    if (undoLabel) offerUndo(undoLabel, currentPlan.id, before, after);
    return true;
  };

  /** Change one meal on a day (null if the day or meal isn't there any more). */
  const editMeal = (
    days: Days,
    dayName: string,
    mealId: string,
    patch: (m: PlannedMeal) => PlannedMeal,
  ): Days | null => {
    const day = days[dayName];
    if (!day || !day.meals.some((m) => m.id === mealId)) return null;
    return { ...days, [dayName]: { ...day, meals: day.meals.map((m) => (m.id === mealId ? patch(m) : m)) } };
  };

  /** Cooked earlier in the week, or in the freezer? Then ask how you're having it. True if it asked. */
  const askHow = (dayName: string, recipe: Recipe): boolean => {
    const plan = live();
    if (!plan) return false;
    const existingDays = earlierDaysWithRecipe(plan.days, dayName, recipe);
    // Portions of it in the freezer (use the oldest batch first)
    const batches = freezerBatchesFor(recipe, store.state.batches);
    const portions = batches.reduce((n: number, b: BatchItem) => n + (Number(b.portions) || 0), 0);
    if (existingDays.length > 0 || portions > 0) {
      setHowPrompt({
        dayName,
        recipe,
        existingDays,
        freezer: portions > 0 ? { batchId: batches[0].id, portions } : undefined,
      });
      return true;
    }
    return false;
  };

  /**
   * Put a meal on a day (or take one off). If leftovers depend on the meal going, ask first;
   * otherwise save, with Undo when a meal was taken away.
   */
  const changeMeal = (dayName: string, mealToRemove: PlannedMeal | null, newMeal: PlannedMeal | null) => {
    const plan = live();
    if (!plan) return;
    const { orphanedDays } = changeDayMeal(plan.days, dayName, mealToRemove, newMeal);
    const description = describeMealChange(dayName, mealToRemove, newMeal);
    if (orphanedDays.length > 0 && mealToRemove) {
      setRemoveLeftoversPrompt({
        targetDayName: dayName,
        targetMealName: mealToRemove.name,
        leftoverDays: orphanedDays,
        mealToRemove,
        newMeal,
        isReplacement: Boolean(newMeal),
      });
      return;
    }
    const write = (days: Days) => changeDayMeal(days, dayName, mealToRemove, newMeal).days;
    if (mealToRemove) {
      editDays(write, description);
    } else {
      if (description) setToastMessage(description);
      editDays(write);
    }
  };

  /** What's on the day now (to be replaced). */
  const mealNow = (dayName: string) => {
    const plan = live();
    return plan ? mealOnDay(plan.days, dayName) : null;
  };

  /** A recipe onto a day (one meal per day). False if it asked how you're having it instead (or there's no week). */
  const placeRecipe = (dayName: string, recipe: Recipe): boolean => {
    if (!currentPlan) return false;
    if (askHow(dayName, recipe)) return false;
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'recipe',
      recipeId: recipe.id,
      name: recipe.name,
      servings: defaultServings,
    };
    changeMeal(dayName, mealNow(dayName), newMeal);
    return true;
  };

  /** The answer to "How are you having it?". */
  const confirmHow = (how: 'leftover' | 'freezer' | 'fresh'): boolean => {
    if (!howPrompt || !currentPlan) return false;
    const { dayName, recipe, existingDays, freezer } = howPrompt;
    const sourceDay = existingDays && existingDays.length > 0 ? existingDays[existingDays.length - 1] : null;
    const newMeal: PlannedMeal =
      how === 'freezer' && freezer
        ? {
            // From the freezer: no ingredients to buy; linked to the batch and the recipe
            id: crypto.randomUUID(),
            type: 'batch',
            batchId: freezer.batchId,
            recipeId: recipe.id,
            name: `Batch: ${recipe.name}`,
            servings: defaultServings,
            note: '',
          }
        : {
            id: crypto.randomUUID(),
            type: how === 'leftover' ? 'leftover' : 'recipe',
            recipeId: recipe.id,
            name: how === 'leftover' ? `Leftovers: ${recipe.name}` : recipe.name,
            servings: defaultServings,
            note: how === 'leftover' ? (sourceDay ? `Reheat from ${sourceDay}` : 'Reheat leftovers') : undefined,
          };
    setHowPrompt(null);
    changeMeal(dayName, mealNow(dayName), newMeal);
    return true;
  };

  /** Takeaway, eating out, no meal, or a freezer batch, on a day. */
  const addCustomMeal = (
    dayName: string,
    type: MealType,
    batchId?: string,
    note?: string,
    servings?: number,
  ): boolean => {
    if (!currentPlan) return false;
    let name = '';
    if (type === 'takeout') name = 'Takeaway';
    if (type === 'eating_out') name = 'Eating out';
    if (type === 'no_meal') name = 'No meal';
    if (type === 'batch' && batchId) {
      const batch = store.state.batches.find((b: BatchItem) => b.id === batchId);
      const recipe = batch?.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
      name = `Batch: ${batch?.name || recipe?.name || 'Batch Meal'}`;
      if (!note) note = 'Heat up a premade batch';
    }
    const batchRecipeId =
      type === 'batch' && batchId ? store.state.batches.find((b: BatchItem) => b.id === batchId)?.recipeId : undefined;
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type,
      batchId,
      ...(batchRecipeId ? { recipeId: batchRecipeId } : {}),
      name,
      servings: type === 'no_meal' ? 0 : servings || defaultServings,
      note: note?.trim() || '',
    };
    changeMeal(dayName, mealNow(dayName), newMeal);
    return true;
  };

  /** People and notes from the day panel. */
  const saveDayDetails = (dayName: string, mealId: string, patch: { servings: number; note: string }) => {
    const saved = editDays((days) =>
      editMeal(days, dayName, mealId, (m) => ({
        ...m,
        servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)),
        note: patch.note,
      })),
    );
    if (saved) setToastMessage('Saved');
  };

  /** Move a meal to another day (or swap two days). Leftovers follow their cook. */
  const moveDayMeal = (from: string, to: string) => {
    const plan = live();
    if (!plan || from === to) return;
    const r = moveMeal(plan.days, from, to);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    editDays(
      (days) => moveMeal(days, from, to).days,
      (r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh,
    );
  };

  const removeMeal = (dayName: string, mealId: string) => {
    const mealToRemove = live()?.days[dayName]?.meals.find((m) => m.id === mealId);
    if (!mealToRemove) return;
    changeMeal(dayName, mealToRemove, null);
  };

  /** "Remove Leftovers": take the meal away and the leftovers that depended on it. */
  const confirmRemoveWithLeftovers = () => {
    const p = removeLeftoversPrompt;
    if (!currentPlan || !p) return;
    editDays(
      (days) => changeDayMeal(days, p.targetDayName, p.mealToRemove, p.newMeal).days,
      `Removed, with the leftovers on ${p.leftoverDays.join(' and ')}.`,
    );
    setRemoveLeftoversPrompt(null);
  };

  const saveSides = (dayName: string, mealId: string, sides: PlannedMealSide[]): boolean => {
    const saved = editDays((days) => editMeal(days, dayName, mealId, (m) => ({ ...m, sides })));
    if (saved) setToastMessage(sides.length ? 'Sides saved.' : 'Sides removed.');
    return saved;
  };

  /** Copy every day's meals from another week into the week on screen (not once it's sent). */
  const copyWeek = (source: MealPlan): boolean => {
    if (!currentPlan || currentPlan.status === 'finalized') return false;
    let copied = 0;
    const done = editDays((days) => {
      const r = copyWeekMeals(days, source);
      copied = r.copied;
      return r.days;
    });
    if (done) setToastMessage(`Copied ${copied} meal${copied === 1 ? '' : 's'} from ${weekLabel(source.startDate)}`);
    return done;
  };

  const seeTheList = (planId: string) =>
    onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', planId) } : null;

  /** Send the week to the shopping list (first time), and get the week after ready. */
  const sendToList = () => {
    const plan = live();
    if (!plan) return;
    // Status, a record of what was sent, and the week's ingredients on the shopping list
    sendWeekToShoppingList(store, { ...plan, status: 'finalized' });

    // Pre-create following week so it is ready to be planned (if within 4-week limit)
    if (canPlanFollowingWeek(plan.startDate)) {
      const fromDate = new Date(plan.startDate + 'T00:00:00');
      const nextMonday = new Date(fromDate);
      nextMonday.setDate(fromDate.getDate() + 7);
      const nextStartStr = formatDateISO(nextMonday);
      if (!store.getState().mealPlans.some((p: MealPlan) => p.startDate === nextStartStr)) {
        const nextPlan = createEmptyPlan(nextMonday);
        store.updateMealPlan(nextPlan);
        store.updateShoppingList((list, s) => {
          const staples = s.preferences?.recurringItems || [];
          return staples.length ? syncRecurringStaplesForPlan(nextPlan, list, staples) : list;
        });
      }
    }
    setToastMessage('Sent: the ingredients are on the shopping list.', seeTheList(plan.id));
  };

  /**
   * "Update list": the week changed after it was sent. The meal ingredients start again from the
   * meals (anything already ticked on the Shop tab is unticked); staples and things added stay.
   */
  const updateList = () => {
    const plan = live();
    if (!plan) return;
    sendWeekToShoppingList(store, plan, { resetMeals: true });
    setToastMessage('Shopping list updated.', seeTheList(plan.id));
  };

  return {
    howPrompt,
    cancelHow: () => setHowPrompt(null),
    confirmHow,
    removeLeftoversPrompt,
    cancelRemoveLeftovers: () => setRemoveLeftoversPrompt(null),
    confirmRemoveWithLeftovers,
    placeRecipe,
    addCustomMeal,
    saveDayDetails,
    moveDayMeal,
    removeMeal,
    saveSides,
    copyWeek,
    sendToList,
    updateList,
  };
}
