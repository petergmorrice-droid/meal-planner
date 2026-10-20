/**
 * Changing the meals on the week on screen: adding (asking "How are you having it?" when it could
 * be leftovers or from the freezer), replacing, moving, removing (with Undo, and asking first when
 * leftovers depend on it), notes and people, sides, copying a week, and sending it to the list.
 */
import { useRef, useState } from 'react';
import { BatchItem, DayPlan, MealPlan, MealType, PlannedMeal, PlannedMealSide, Recipe, TabName } from '../../types';
import { canPlanFollowingWeek, createEmptyPlan, formatDateISO, syncRecurringStaplesForPlan } from '../../utils';
import { changeDayMeal, copyWeekMeals, describeMealChange, earlierDaysWithRecipe, listSnapshot, mealOnDay, moveMeal } from '../../planning';
import { sendWeekToShoppingList } from '../../planShopping';
import { freezerBatchesFor } from '../../recipeInfo';
import type { ToastAction } from './usePlanToast';
import type { AppStore } from '../../store';

/** "How are you having it?": leftovers from an earlier day, from the freezer, or cooked fresh. */
export interface HowPrompt { dayName: string; recipe: Recipe; existingDays: string[]; freezer?: { batchId: string; portions: number } }

/** Taking a meal away would leave leftover days with nothing to be leftovers of. */
export interface RemoveLeftoversPrompt {
  targetDayName: string;
  targetMealName: string;
  leftoverDays: string[];
  nextDays: Record<string, DayPlan>;
  isReplacement: boolean;
}


export function useWeekEditor({ store, currentPlan, defaultServings, weekLabel, setToastMessage, onNavigateTab }: {
  store: AppStore;
  currentPlan: MealPlan | undefined;
  /** Your usual number of people (Settings → Household). */
  defaultServings: number;
  weekLabel: (startDate: string) => string;
  setToastMessage: (msg: string | null, action?: ToastAction | null) => void;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
}) {
  // The latest store, for actions that run after a re-render (Undo).
  const storeRef = useRef(store);
  storeRef.current = store;
  const [howPrompt, setHowPrompt] = useState<HowPrompt | null>(null);
  const [removeLeftoversPrompt, setRemoveLeftoversPrompt] = useState<RemoveLeftoversPrompt | null>(null);

  // Save the week's days. A week already sent to the shopping list just gets an "Update list"
  // button afterwards; weeks sent before the app kept a record are taken as matching the list.
  const writeDays = (nextDays: Record<string, DayPlan>) => {
    if (!currentPlan) return;
    const keepRecord = currentPlan.status === 'finalized' && !currentPlan.lastFinalizedSnapshot
      ? { lastFinalizedSnapshot: listSnapshot(currentPlan) }
      : {};
    store.updateMealPlan({ ...currentPlan, ...keepRecord, days: nextDays });
  };

  // "Removed Chicken fajitas · Undo": put the week back as it was.
  const offerUndo = (label: string) => {
    if (!currentPlan) return;
    const planId = currentPlan.id;
    const before = currentPlan.days;
    setToastMessage(label, {
      label: 'Undo',
      run: () => {
        const latest = (storeRef.current.state.mealPlans || []).find((p: MealPlan) => p.id === planId);
        if (latest) storeRef.current.updateMealPlan({ ...latest, days: before });
        setToastMessage('Undone');
      },
    });
  };

  /** Cooked earlier in the week, or in the freezer? Then ask how you're having it. True if it asked. */
  const askHow = (dayName: string, recipe: Recipe): boolean => {
    if (!currentPlan) return false;
    const existingDays = earlierDaysWithRecipe(currentPlan.days, dayName, recipe);
    // Portions of it in the freezer (use the oldest batch first)
    const batches = freezerBatchesFor(recipe, store.state.batches);
    const portions = batches.reduce((n: number, b: BatchItem) => n + (Number(b.portions) || 0), 0);
    if (existingDays.length > 0 || portions > 0) {
      setHowPrompt({ dayName, recipe, existingDays, freezer: portions > 0 ? { batchId: batches[0].id, portions } : undefined });
      return true;
    }
    return false;
  };

  /**
   * Put a meal on a day (or take one off). If leftovers depend on the meal going, ask first;
   * otherwise save, with Undo when a meal was taken away.
   */
  const changeMeal = (dayName: string, mealToRemove: PlannedMeal | null, newMeal: PlannedMeal | null) => {
    if (!currentPlan) return;
    const { days: nextDays, orphanedDays } = changeDayMeal(currentPlan.days, dayName, mealToRemove, newMeal);
    const description = describeMealChange(dayName, mealToRemove, newMeal);
    if (orphanedDays.length > 0 && mealToRemove) {
      setRemoveLeftoversPrompt({
        targetDayName: dayName,
        targetMealName: mealToRemove.name,
        leftoverDays: orphanedDays,
        nextDays,
        isReplacement: Boolean(newMeal),
      });
      return;
    }
    if (mealToRemove) offerUndo(description);
    else if (description) setToastMessage(description);
    writeDays(nextDays);
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
    changeMeal(dayName, mealOnDay(currentPlan.days, dayName), newMeal);
    return true;
  };

  /** The answer to "How are you having it?". */
  const confirmHow = (how: 'leftover' | 'freezer' | 'fresh'): boolean => {
    if (!howPrompt || !currentPlan) return false;
    const { dayName, recipe, existingDays, freezer } = howPrompt;
    const sourceDay = existingDays && existingDays.length > 0 ? existingDays[existingDays.length - 1] : null;
    const newMeal: PlannedMeal = how === 'freezer' && freezer
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
    changeMeal(dayName, mealOnDay(currentPlan.days, dayName), newMeal);
    return true;
  };

  /** Takeaway, eating out, no meal, or a freezer batch, on a day. */
  const addCustomMeal = (dayName: string, type: MealType, batchId?: string, note?: string, servings?: number): boolean => {
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
    const batchRecipeId = type === 'batch' && batchId ? store.state.batches.find((b: BatchItem) => b.id === batchId)?.recipeId : undefined;
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type,
      batchId,
      ...(batchRecipeId ? { recipeId: batchRecipeId } : {}),
      name,
      servings: type === 'no_meal' ? 0 : (servings || defaultServings),
      note: note?.trim() || '',
    };
    changeMeal(dayName, mealOnDay(currentPlan.days, dayName), newMeal);
    return true;
  };

  /** People and notes from the day panel. */
  const saveDayDetails = (dayName: string, mealId: string, patch: { servings: number; note: string }) => {
    if (!currentPlan) return;
    const day = currentPlan.days[dayName];
    if (!day) return;
    const meals = day.meals.map(m => m.id === mealId
      ? { ...m, servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)), note: patch.note }
      : m);
    writeDays({ ...currentPlan.days, [dayName]: { ...day, meals } });
    setToastMessage('Saved');
  };

  /** Move a meal to another day (or swap two days). Leftovers follow their cook. */
  const moveDayMeal = (from: string, to: string) => {
    if (!currentPlan || from === to) return;
    // The latest days: the panel may have just saved a note or people for this day.
    const live: MealPlan = (store.getState?.().mealPlans || []).find((p: MealPlan) => p.id === currentPlan.id) || currentPlan;
    const r = moveMeal(live.days, from, to);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    offerUndo((r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh);
    writeDays(r.days);
  };

  const removeMeal = (dayName: string, mealId: string) => {
    if (!currentPlan) return;
    const mealToRemove = currentPlan.days[dayName]?.meals.find(m => m.id === mealId);
    if (!mealToRemove) return;
    changeMeal(dayName, mealToRemove, null);
  };

  /** "Remove Leftovers": take the meal away and the leftovers that depended on it. */
  const confirmRemoveWithLeftovers = () => {
    if (!currentPlan || !removeLeftoversPrompt) return;
    offerUndo(`Removed, with the leftovers on ${removeLeftoversPrompt.leftoverDays.join(' and ')}.`);
    writeDays(removeLeftoversPrompt.nextDays);
    setRemoveLeftoversPrompt(null);
  };

  const saveSides = (dayName: string, mealId: string, sides: PlannedMealSide[]): boolean => {
    if (!currentPlan) return false;
    const day = currentPlan.days[dayName];
    const meal = day?.meals.find(m => m.id === mealId);
    if (!day || !meal) return false;
    const meals = day.meals.map(m => m.id === mealId ? { ...meal, sides } : m);
    writeDays({ ...currentPlan.days, [dayName]: { ...day, meals } });
    setToastMessage(sides.length ? 'Sides saved.' : 'Sides removed.');
    return true;
  };

  /** Copy every day's meals from another week into the week on screen (not once it's sent). */
  const copyWeek = (source: MealPlan): boolean => {
    if (!currentPlan || currentPlan.status === 'finalized') return false;
    const { days, copied } = copyWeekMeals(currentPlan.days, source);
    store.updateMealPlan({ ...currentPlan, days });
    setToastMessage(`Copied ${copied} meal${copied === 1 ? '' : 's'} from ${weekLabel(source.startDate)}`);
    return true;
  };

  const seeTheList = (planId: string) => (onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', planId) } : null);

  /** Send the week to the shopping list (first time), and get the week after ready. */
  const sendToList = () => {
    if (!currentPlan) return;
    const updatedPlan: MealPlan = { ...currentPlan, status: 'finalized' };
    // Status, a record of what was sent, and the week's ingredients on the shopping list
    sendWeekToShoppingList(store, updatedPlan);

    // Pre-create following week so it is ready to be planned (if within 4-week limit)
    if (canPlanFollowingWeek(updatedPlan.startDate)) {
      const fromDate = new Date(updatedPlan.startDate + 'T00:00:00');
      const nextMonday = new Date(fromDate);
      nextMonday.setDate(fromDate.getDate() + 7);
      const nextStartStr = formatDateISO(nextMonday);
      if (!store.state.mealPlans.some((p: MealPlan) => p.startDate === nextStartStr)) {
        const nextPlan = createEmptyPlan(nextMonday);
        store.updateMealPlan(nextPlan);
        const prefsRecurring = store.state.preferences?.recurringItems || [];
        if (prefsRecurring.length > 0 && store.updateShoppingList) {
          const nextList = syncRecurringStaplesForPlan(nextPlan, store.state.shoppingList || [], prefsRecurring);
          store.updateShoppingList(nextList);
        }
      }
    }
    setToastMessage('Sent: the ingredients are on the shopping list.', seeTheList(currentPlan.id));
  };

  /** "Update list": the week changed after it was sent. */
  const updateList = () => {
    if (!currentPlan) return;
    sendWeekToShoppingList(store, currentPlan);
    setToastMessage('Shopping list updated.', seeTheList(currentPlan.id));
  };

  return {
    howPrompt, cancelHow: () => setHowPrompt(null), confirmHow,
    removeLeftoversPrompt, cancelRemoveLeftovers: () => setRemoveLeftoversPrompt(null), confirmRemoveWithLeftovers,
    placeRecipe, addCustomMeal, saveDayDetails, moveDayMeal, removeMeal, saveSides, copyWeek, sendToList, updateList,
  };
}
