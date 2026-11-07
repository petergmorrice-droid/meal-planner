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
import {
  BatchItem,
  DayPlan,
  MealPlan,
  MealType,
  OnHandItem,
  PlannedMeal,
  PlannedMealSide,
  Recipe,
  TabName,
} from '../../types';
import { canPlanFollowingWeek, createEmptyPlan, formatDateISO, syncRecurringStaplesForPlan } from '../../utils';
import {
  carriedOrphans,
  changeDayMeal,
  copyWeekMeals,
  describeMealChange,
  earlierDaysWithRecipe,
  lastWeekCookFor,
  mealOnDay,
  otherWeekDay,
  moveMeal,
  type WeekNeighbours,
} from '../../planning';
import { aroundWeek, changeWeek, followOnText, undoWeekChange, type WeekChange } from '../../weekChange';
import { keepListsInStep, listSyncText, sendWeekToShoppingList } from '../../planShopping';
import { freezerBatchesFor } from '../../recipeInfo';
import { fillDays, type DayPick } from '../../autoPlan';
import type { ToastAction } from './usePlanToast';
import type { AppStore } from '../../store';

/** "How are you having it?": leftovers from an earlier day, from the freezer, or cooked fresh. */
export interface HowPrompt {
  dayName: string;
  recipe: Recipe;
  existingDays: string[];
  /** No earlier day this week cooks it, but this day at the end of last week does (Sunday's roast on Tuesday). */
  lastWeekDay?: string;
  /** That day by its date ("Sun 8 Nov"). */
  lastWeekDate?: string;
  freezer?: { batchId: string; portions: number };
}

/** Taking a meal away would leave leftover days with nothing to be leftovers of. */
export interface RemoveLeftoversPrompt {
  targetDayName: string;
  targetMealName: string;
  leftoverDays: string[];
  /** Leftover days next week that come from it (a Sunday cook's Monday or Tuesday), by date ("Tue 10 Nov"). */
  nextWeekDays: string[];
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

  // "Removed Chicken fajitas · Undo": the days the change touched go back as they were (in the
  // week after too, when its leftovers followed).
  const offerUndo = (label: string, change: WeekChange) => {
    setToastMessage(label, {
      label: 'Undo',
      run: () => {
        undoWeekChange(store, change);
        setToastMessage('Undone');
      },
    });
  };

  /**
   * Change the week's days, starting from the latest copy (null: no change). A week already sent
   * to the shopping list has its list brought up to date straight away, keeping what's ticked; next
   * week's leftovers of a cook at the end of this week follow it (see changeWeek). With
   * `undoLabel`, says so with Undo (and what else changed); `quiet` leaves saying so to the caller
   * (see say). Null if nothing changed.
   */
  const editDays = (
    change: (days: Days, around: WeekNeighbours) => Days | null,
    undoLabel?: string,
    { quiet = false, ...opts }: { removeOrphansNextWeek?: boolean; quiet?: boolean } = {},
  ): WeekChange | null => {
    if (!currentPlan) return null;
    const c = changeWeek(
      store,
      currentPlan.id,
      (p, around) => {
        const next = change(p.days, around);
        return next ? { ...p, days: next } : null;
      },
      opts,
    );
    if (!c || quiet) return c;
    const nextWeek = followOnText(c);
    if (undoLabel) offerUndo(undoLabel + nextWeek, c);
    else if (nextWeek) offerUndo(nextWeek.trim(), c);
    return c;
  };

  /** "Saved", plus what else changed ("Sweetcorn added to the shopping list"), with Undo then. */
  const say = (text: string, c: WeekChange | null) => {
    const more = followOnText(c);
    if (c && more) offerUndo(text + more, c);
    else setToastMessage(text);
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

  /**
   * Cooked earlier in the week (or at the end of last week, close enough for leftovers), or in the
   * freezer? Then ask how you're having it. True if it asked.
   */
  const askHow = (dayName: string, recipe: Recipe): boolean => {
    const plan = live();
    if (!plan) return false;
    const existingDays = earlierDaysWithRecipe(plan.days, dayName, recipe);
    const prevDays = aroundWeek(store, plan).prev?.days;
    const lastWeekDay = existingDays.length ? null : lastWeekCookFor(dayName, recipe.id, prevDays);
    // Portions of it in the freezer (use the oldest batch first)
    const batches = freezerBatchesFor(recipe, store.state.batches);
    const portions = batches.reduce((n: number, b: BatchItem) => n + (Number(b.portions) || 0), 0);
    if (existingDays.length > 0 || lastWeekDay || portions > 0) {
      setHowPrompt({
        dayName,
        recipe,
        existingDays,
        ...(lastWeekDay ? { lastWeekDay, lastWeekDate: otherWeekDay(prevDays, lastWeekDay, 'last') } : {}),
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
    const { orphanedDays, days: afterDays } = changeDayMeal(plan.days, dayName, mealToRemove, newMeal);
    const following = aroundWeek(store, plan).next;
    const nextWeekDays =
      mealToRemove && following
        ? carriedOrphans(following.days, plan.days, afterDays).map((d) => otherWeekDay(following.days, d))
        : [];
    const description = describeMealChange(dayName, mealToRemove, newMeal);
    if ((orphanedDays.length > 0 || nextWeekDays.length > 0) && mealToRemove) {
      setRemoveLeftoversPrompt({
        targetDayName: dayName,
        targetMealName: mealToRemove.name,
        leftoverDays: orphanedDays,
        nextWeekDays,
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
      // Adding: just says so, unless the shopping list changed too (then with Undo).
      const c = editDays(write, undefined, { quiet: true });
      if (description || followOnText(c)) say(description, c);
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
    const { dayName, recipe, existingDays, lastWeekDay, freezer } = howPrompt;
    const sourceDay =
      existingDays && existingDays.length > 0 ? existingDays[existingDays.length - 1] : lastWeekDay || null;
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
    const c = editDays(
      (days) =>
        editMeal(days, dayName, mealId, (m) => ({
          ...m,
          servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)),
          note: patch.note,
        })),
      undefined,
      { quiet: true },
    );
    if (c) say('Saved.', c);
  };

  /** Move a meal to another day (or swap two days). Leftovers follow their cook. */
  const moveDayMeal = (from: string, to: string) => {
    const plan = live();
    if (!plan || from === to) return;
    const r = moveMeal(plan.days, from, to, aroundWeek(store, plan).prev?.days);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    editDays(
      (days, around) => moveMeal(days, from, to, around.prev?.days).days,
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
    const all = [...p.leftoverDays, ...p.nextWeekDays];
    // Next week's leftovers are said here, so don't say them twice.
    const c = editDays((days) => changeDayMeal(days, p.targetDayName, p.mealToRemove, p.newMeal).days, undefined, {
      removeOrphansNextWeek: true,
      quiet: true,
    });
    if (c) offerUndo(`Removed, with the leftovers on ${all.join(' and ')}.${listSyncText(c.list)}`, c);
    setRemoveLeftoversPrompt(null);
  };

  const saveSides = (dayName: string, mealId: string, sides: PlannedMealSide[]): boolean => {
    const c = editDays((days) => editMeal(days, dayName, mealId, (m) => ({ ...m, sides })), undefined, {
      quiet: true,
    });
    if (c) say(sides.length ? 'Sides saved.' : 'Sides removed.', c);
    return !!c;
  };

  /**
   * Copy every day's meals from another week into the week on screen. A week already sent to the
   * list has its list brought up to date, as for any other change.
   */
  const copyWeek = (source: MealPlan): boolean => {
    if (!currentPlan) return false;
    let copied = 0;
    const c = editDays(
      (days) => {
        const r = copyWeekMeals(days, source);
        copied = r.copied;
        return r.days;
      },
      undefined,
      { quiet: true },
    );
    if (c) say(`Copied ${copied} meal${copied === 1 ? '' : 's'} from ${weekLabel(source.startDate)}.`, c);
    return !!c;
  };

  /**
   * Auto populate: the meals you kept onto the week's empty days (and onto `replaceDay`, when it was
   * started from that day's "Select meal"), and what you said you've already got (it comes off the
   * week's shopping; left out when leftovers weren't used, so the week keeps what it had). Says what
   * changed, with Undo for the meals. Returns how many meals it added.
   */
  const autoPopulate = (picks: DayPick[], people: number, onHand?: OnHandItem[], replaceDay?: string): number => {
    if (!currentPlan) return 0;
    let added = 0;
    let replaced: PlannedMeal[] = [];
    let freshDays: string[] = [];
    const c = changeWeek(store, currentPlan.id, (p, around) => {
      const r = fillDays(p.days, picks, people, {
        replace: replaceDay ? [replaceDay] : [],
        prevDays: around.prev?.days,
      });
      if (!r.added && (!onHand || JSON.stringify(p.onHand || []) === JSON.stringify(onHand))) return null;
      added = r.added;
      replaced = r.replaced;
      freshDays = r.freshDays;
      const { onHand: was, ...rest } = p;
      const got = onHand ?? was ?? [];
      return { ...rest, ...(got.length ? { onHand: got } : {}), days: r.days };
    });
    if (c && added) {
      const one = added === 1 && picks.length === 1 ? picks[0] : null;
      const label =
        one && replaceDay
          ? describeMealChange(one.day, replaced[0] || null, mealOnDay(c.after, one.day) || null)
          : `Added ${added} meal${added === 1 ? '' : 's'}`;
      const fresh = (freshDays.length ? ` ${freshDays.join(' and ')} now cooked fresh.` : '') + followOnText(c);
      offerUndo(label + (fresh ? '.' + fresh : ''), c);
    }
    return added;
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
   * "Update list": only there when the list and the week have got out of step some other way (a
   * week changed on an older copy of the app). Brings the meal ingredients up to date the same way
   * every change does, keeping what's ticked (see syncWeekMeals).
   */
  const updateList = () => {
    const plan = live();
    if (!plan) return;
    const r = keepListsInStep(store, [plan.id], { always: true });
    setToastMessage(('Shopping list updated.' + listSyncText(r)).trim(), seeTheList(plan.id));
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
    autoPopulate,
    sendToList,
    updateList,
  };
}
