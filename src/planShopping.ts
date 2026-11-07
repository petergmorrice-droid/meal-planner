// Building a week's ingredients on the shopping list. Used by Planning ("Send to shopping list",
// "Update list") and by Shop's "Planning has changed" note.
import { MealPlan, Recipe, RecurringItem, ShoppingListItem } from './types';
import { generateShoppingListForPlan, getCurrentMondayStr, getNextMondayStr, formatWeekRange } from './utils';
import { changedDaysSinceList, listSnapshot, weekNeighbours, type WeekNeighbours } from './planning';
import { canonicalUnit, type Catalog } from './shopping';
import type { AppStore } from './store';

export function weekLabelFor(startDate: string): string {
  return startDate === getCurrentMondayStr()
    ? 'This Week'
    : startDate === getNextMondayStr()
      ? 'Next Week'
      : formatWeekRange(startDate);
}

/**
 * Put this week's meals on the shopping list, keeping other weeks, items added by hand, staples
 * you've adjusted and anything either of you removed. Then remember what the list was made from,
 * so later changes to the week can be spotted ("Shopping list out of date"). Works from the
 * latest copy of the week and the list (the screen's may be a moment behind).
 */
export function sendWeekToShoppingList(store: AppStore, plan: MealPlan, opts: { resetMeals?: boolean } = {}) {
  const plans = store.getState().mealPlans;
  const latest = plans.find((p) => p.id === plan.id) || plan;
  // Leftovers carried over from Sunday into next week are bought with the cook (see planIngredientInputs).
  const around = weekNeighbours(plans, latest);
  const sentPlan: MealPlan = { ...latest, status: 'finalized', lastFinalizedSnapshot: listSnapshot(latest, around) };
  store.updateMealPlan(sentPlan);
  const removed: string[] = store.dismissedShoppingItemIds || [];
  store.updateShoppingList((list, s) =>
    listWithWeek(list, sentPlan, s.recipes, s.preferences?.recurringItems || [], removed, undefined, {
      ...opts,
      around: weekNeighbours(s.mealPlans, sentPlan),
    }),
  );
}

/**
 * A meal line's cupboard answer once the week is worked out again: "Already got" because the
 * week's leftovers cover it follows the leftovers (worked out again each time); an answer you gave
 * yourself ("Have it", "Need it after all") stays.
 */
export function cupboardAfterUpdate(
  existing: ShoppingListItem,
  target: ShoppingListItem,
): ShoppingListItem['cupboard'] {
  const fromLeftovers = existing.cupboard === 'have' && !!existing.haveText;
  return existing.cupboard && !fromLeftovers ? existing.cupboard : target.cupboard;
}

/** Sets or clears the line's cupboard answer. */
function setCupboard(line: ShoppingListItem, value: ShoppingListItem['cupboard']) {
  if (value) line.cupboard = value;
  else delete line.cupboard;
}

/** The week's meal-ingredient lines (not staples, things added by hand or batch cooks). */
const isMealLine = (i: ShoppingListItem, planId: string) =>
  i.planId === planId && !i.isAdhoc && !i.isBatch && !i.isRecurring;

/** How many of the week's meal ingredients have been ticked (or marked out of stock) on the Shop tab. */
export function mealLinesShopped(list: ShoppingListItem[], planId: string): number {
  return list.filter((i) => isMealLine(i, planId) && (i.checked || i.outOfStock)).length;
}

/**
 * The shopping list with this week's staples and meal ingredients brought up to date (see above).
 * With `resetMeals` (Planning's "Update list"), the meal ingredients start again from the meals:
 * ticks, out-of-stock marks and amounts changed by hand go; notes and cupboard answers stay.
 * `around` (the weeks either side) lets leftovers that carry over be bought with their cook.
 */
export function listWithWeek(
  list: ShoppingListItem[],
  plan: MealPlan,
  recipes: Recipe[],
  staples: RecurringItem[],
  dismissedItemIds: string[],
  catalog?: Catalog,
  { resetMeals = false, around }: { resetMeals?: boolean; around?: WeekNeighbours } = {},
): ShoppingListItem[] {
  const targetItems = generateShoppingListForPlan(plan, recipes, catalog, around);
  const existingItemsForPlan = list.filter((i) => i.planId === plan.id);
  const adhocOrBatchItems = existingItemsForPlan.filter((i) => i.isAdhoc || i.isBatch);
  const existingMealItems = existingItemsForPlan.filter((i) => !i.isAdhoc && !i.isBatch && !i.isRecurring);

  // 1. Weekly staples
  const recurringItemsToKeep: ShoppingListItem[] = [];
  const existingRecurring = existingItemsForPlan.filter((i) => i.isRecurring);
  staples.forEach((rec) => {
    const itemId = `recurring-${plan.id}-${rec.id}`;
    if (dismissedItemIds.includes(itemId)) return;
    const existing = existingRecurring.find((i) => i.id === itemId);
    if (!existing) {
      recurringItemsToKeep.push({
        id: itemId,
        name: rec.name,
        amount: rec.amount,
        unit: rec.unit,
        category: rec.category,
        checked: false,
        isAdhoc: false,
        isRecurring: true,
        planId: plan.id,
        weekLabel: `Week of ${weekLabelFor(plan.startDate)}`,
      } as ShoppingListItem);
    } else if (!existing.userAdjusted) {
      recurringItemsToKeep.push({
        ...existing,
        name: rec.name,
        amount: rec.amount,
        unit: rec.unit,
        category: rec.category,
      });
    } else {
      recurringItemsToKeep.push(existing);
    }
  });

  // 2. The meals' ingredients (keeping amounts you changed by hand, and ticks)
  const syncedMealItems: ShoppingListItem[] = [];
  targetItems.forEach((target) => {
    const key = target.name.toLowerCase().trim();
    const existing = existingMealItems.find((e) => e.name.toLowerCase().trim() === key);
    if (existing && resetMeals) {
      const line: ShoppingListItem = { ...target, id: existing.id };
      for (const k of ['note', 'noteBy', 'addedBy'] as const) {
        if (existing[k] !== undefined) (line as unknown as Record<string, unknown>)[k] = existing[k];
      }
      setCupboard(line, cupboardAfterUpdate(existing, target));
      syncedMealItems.push(line);
    } else if (existing) {
      const keep = existing.userAdjusted;
      const line: ShoppingListItem = {
        ...existing,
        amount: keep ? existing.amount : target.amount,
        unit: keep ? existing.unit : target.unit,
        recipeNames: target.recipeNames,
        neededText: target.neededText,
        haveText: target.haveText,
      };
      if (!line.haveText) delete line.haveText;
      setCupboard(line, cupboardAfterUpdate(existing, target));
      // "Check amount" goes with the amount it was about: worked out again, it's checked again.
      if (!keep) {
        delete line.needsCheck;
        delete line.quantityNote;
        if (target.needsCheck) line.needsCheck = true;
        if (target.quantityNote) line.quantityNote = target.quantityNote;
      }
      syncedMealItems.push(line);
    } else if (!dismissedItemIds.includes(target.id)) {
      syncedMealItems.push(target);
    }
  });

  const otherWeeksItems = list.filter((i) => i.planId !== plan.id);
  return [...otherWeeksItems, ...adhocOrBatchItems, ...recurringItemsToKeep, ...syncedMealItems];
}

/**
 * Lines on a sent week's list whose amount no longer matches what the meals need, because a recipe
 * or a product changed after the week was sent, or the app now works the amount out better (a
 * "400 g can" that used to need checking). Lines you've bought, or changed by hand, don't count;
 * meals added or taken off are the planner's "changed since" note instead. Returns their names.
 */
export function mealLinesOutOfDate(
  list: ShoppingListItem[],
  plan: MealPlan,
  recipes: Recipe[],
  staples: RecurringItem[],
  dismissedItemIds: string[],
  catalog?: Catalog,
  around?: WeekNeighbours,
): string[] {
  if (plan.status !== 'finalized') return [];
  const isMeal = (i: ShoppingListItem) => isMealLine(i, plan.id);
  const updated = new Map(
    listWithWeek(list, plan, recipes, staples, dismissedItemIds, catalog, { around })
      .filter(isMeal)
      .map((i) => [i.id, i]),
  );
  return list
    .filter((i) => isMeal(i) && !i.checked && !i.userAdjusted)
    .filter((i) => {
      const next = updated.get(i.id);
      return next && (next.amount !== i.amount || next.unit !== i.unit || !!next.needsCheck !== !!i.needsCheck);
    })
    .map((i) => i.name);
}

// ---------- Keeping a sent week's list in step with its meals ----------

/** What keeping a list in step did, to say so: things newly on the list, and things it now needs more of. */
export interface ListSync {
  added: string[];
  more: string[];
}

const nameKey = (name: string) => name.toLowerCase().trim();
const tidy = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A sent week's meal ingredients brought into line with its meals, without undoing your shopping:
 * - something new goes on, unticked ("Sweetcorn");
 * - a line not yet ticked takes the amount the meals need now (unless you changed it by hand);
 * - a line already ticked stays ticked, and if the meals now need more of it, the rest goes on as a
 *   separate unticked line (the "top-up", same product, so it shows on the same row);
 * - lines for meals taken off go, unless they're ticked (you've bought them).
 * Staples, things you added and extra recipes aren't touched; nor is anything either of you removed.
 */
export function syncWeekMeals(
  list: ShoppingListItem[],
  plan: MealPlan,
  recipes: Recipe[],
  dismissedItemIds: string[],
  catalog?: Catalog,
  around?: WeekNeighbours,
): ListSync & { list: ShoppingListItem[] } {
  const targets = generateShoppingListForPlan(plan, recipes, catalog, around);
  const mine = list.filter((i) => isMealLine(i, plan.id));
  const byName = new Map<string, ShoppingListItem[]>();
  for (const i of mine) byName.set(nameKey(i.name), [...(byName.get(nameKey(i.name)) || []), i]);
  const out: ShoppingListItem[] = [];
  const added: string[] = [];
  const more: string[] = [];
  const done = new Set<string>();

  for (const t of targets) {
    const key = nameKey(t.name);
    done.add(key);
    const lines = byName.get(key) || [];
    if (!lines.length) {
      if (!dismissedItemIds.includes(t.id)) {
        out.push(t);
        added.push(t.name);
      }
      continue;
    }
    // What the meals say about it, on every line for it (amounts aside).
    const withInfo = (l: ShoppingListItem): ShoppingListItem => {
      const line: ShoppingListItem = { ...l, recipeNames: t.recipeNames };
      setCupboard(line, cupboardAfterUpdate(l, t));
      return line;
    };
    const bought = lines.filter((l) => l.checked);
    const open = lines.filter((l) => !l.checked);

    if (!bought.length) {
      // Nothing ticked: one line with what the meals need (as before), any top-up folded back in.
      const first = open.find((l) => l.id === t.id) || open[0];
      const keep = first.userAdjusted;
      const line: ShoppingListItem = {
        ...withInfo(first),
        amount: keep ? first.amount : t.amount,
        unit: keep ? first.unit : t.unit,
        neededText: t.neededText,
        haveText: t.haveText,
      };
      if (!line.haveText) delete line.haveText;
      if (!line.neededText) delete line.neededText;
      if (!keep) {
        delete line.needsCheck;
        delete line.quantityNote;
        if (t.needsCheck) line.needsCheck = true;
        if (t.quantityNote) line.quantityNote = t.quantityNote;
        const was = open.reduce((n, l) => n + (canonicalUnit(l.unit) === canonicalUnit(t.unit) ? l.amount : 0), 0);
        if (canonicalUnit(first.unit) === canonicalUnit(t.unit) && t.amount > tidy(was)) more.push(t.name);
      }
      out.push(line);
      continue;
    }

    // Some already ticked: those stay as bought; what's still needed goes on an unticked line.
    for (const b of bought) {
      const line = { ...withInfo(b), neededText: t.neededText };
      if (!line.neededText) delete line.neededText;
      out.push(line);
    }
    const sameUnit = bought.every((b) => canonicalUnit(b.unit) === canonicalUnit(t.unit));
    const got = bought.reduce((n, b) => n + (Number(b.amount) || 0), 0);
    const need = sameUnit ? tidy(t.amount - got) : 0;
    const byHand = open.filter((l) => l.userAdjusted);
    for (const l of byHand) out.push(withInfo(l));
    if (need > 0 && !byHand.length) {
      const prev = open.find((l) => !l.userAdjusted);
      const topUp: ShoppingListItem = prev
        ? { ...withInfo(prev), amount: need, unit: t.unit }
        : {
            ...t,
            id: `${t.id}-more`,
            amount: need,
            checked: false,
          };
      delete topUp.neededText;
      delete topUp.haveText;
      delete topUp.needsCheck;
      delete topUp.quantityNote;
      out.push(topUp);
      if (!prev || need > (Number(prev.amount) || 0)) more.push(t.name);
    }
  }

  // Meals taken off: what you've ticked stays (you've bought it); the rest goes.
  for (const [key, lines] of byName) {
    if (done.has(key)) continue;
    for (const l of lines) if (l.checked) out.push(l);
  }
  return { list: [...list.filter((i) => !isMealLine(i, plan.id)), ...out], added, more };
}

/** The bits of the store keeping lists in step uses (the app's store, or a test's). */
export interface ListStore {
  getState: () => { mealPlans: MealPlan[]; recipes: Recipe[]; shoppingList: ShoppingListItem[] };
  changeMealPlan: (planId: string, change: (latest: MealPlan) => MealPlan | null) => void;
  updateShoppingList: (change: (latest: ShoppingListItem[]) => ShoppingListItem[]) => unknown;
  dismissedShoppingItemIds?: string[];
}

/**
 * Keep sent weeks' lists in step with their meals (see syncWeekMeals), straight after a change: for
 * each of `planIds` that's been sent and has changed since, the list follows and the record of what
 * it was made from is brought up to date, so there's no "Update list" to remember. With `always`,
 * it's done even when the meals haven't changed (a recipe or product has: Shop's note).
 */
export function keepListsInStep(
  store: ListStore,
  planIds: (string | null | undefined)[],
  { always = false }: { always?: boolean } = {},
): ListSync {
  const res: ListSync = { added: [], more: [] };
  for (const id of new Set(planIds.filter((x): x is string => !!x))) {
    const plans = store.getState().mealPlans;
    const plan = plans.find((p) => p.id === id);
    if (!plan || plan.status !== 'finalized') continue;
    const around = weekNeighbours(plans, plan);
    if (!always && (!plan.lastFinalizedSnapshot || !changedDaysSinceList(plan, around).length)) continue;
    store.updateShoppingList((list) => {
      const r = syncWeekMeals(
        list,
        plan,
        store.getState().recipes,
        store.dismissedShoppingItemIds || [],
        undefined,
        around,
      );
      res.added.push(...r.added);
      res.more.push(...r.more);
      return r.list;
    });
    store.changeMealPlan(id, (p) => ({
      ...p,
      lastFinalizedSnapshot: listSnapshot(p, weekNeighbours(store.getState().mealPlans, p)),
    }));
  }
  return res;
}

const andList = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** What happened to the shopping list, to add to a message: " Sweetcorn added to the shopping list." */
export function listSyncText(r: ListSync | null | undefined): string {
  if (!r) return '';
  const added = [...new Set(r.added)];
  const more = [...new Set(r.more)].filter((n) => !added.includes(n));
  const parts: string[] = [];
  if (added.length) parts.push(` ${andList(added)} added to the shopping list.`);
  if (more.length) parts.push(` More ${andList(more.map((n) => n.toLowerCase()))} on the shopping list.`);
  return parts.join('');
}
