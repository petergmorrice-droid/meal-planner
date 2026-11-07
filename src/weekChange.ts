/**
 * Changing a week's meals on the store, and keeping the week after in step: leftovers there of a cook
 * at the end of this week follow it (see followWeekBefore), so Tuesday's "Leftovers from Sunday"
 * isn't left with nothing to reheat. Undo puts back both weeks. Used by Planning, Cook and the
 * Freezer's "Have it on…".
 */
import type { DayPlan, MealPlan } from './types';
import {
  followWeekBefore,
  listSnapshot,
  otherWeekDay,
  undoDays,
  weekNeighbours,
  type WeekNeighbours,
} from './planning';

type Days = Record<string, DayPlan>;

/** What this needs of the store (the app's store, or a test's). */
export interface PlanStore {
  getState: () => { mealPlans: MealPlan[] };
  changeMealPlan: (planId: string, change: (latest: MealPlan) => MealPlan | null) => void;
}

/** What a change did, for Undo and for saying so. */
export interface WeekChange {
  planId: string;
  before: Days;
  after: Days;
  /** The week after, when its leftovers had to follow. */
  next?: { planId: string; before: Days; after: Days; freshDays: string[]; removedDays: string[] };
}

/**
 * A week sent to the list before the app kept a record of what it was made from is taken as matching
 * the list: the record is made from the week as it was, before the change.
 */
const keepRecord = (p: MealPlan, around: WeekNeighbours) =>
  p.status === 'finalized' && !p.lastFinalizedSnapshot ? { lastFinalizedSnapshot: listSnapshot(p, around) } : {};

/** The week before and after a week, from the store as it is now. */
export const aroundWeek = (store: PlanStore, plan: MealPlan | null | undefined): WeekNeighbours =>
  weekNeighbours(store.getState().mealPlans, plan);

/**
 * Change a week from its latest copy (`change` returns the new week, or null for no change), then
 * bring the week after's leftovers into line. With `removeOrphansNextWeek`, leftovers there whose
 * cook has gone are taken off (you said "Remove Leftovers"); otherwise they're cooked fresh. Null if
 * nothing changed.
 */
export function changeWeek(
  store: PlanStore,
  planId: string,
  change: (latest: MealPlan, around: WeekNeighbours) => MealPlan | null,
  { removeOrphansNextWeek = false }: { removeOrphansNextWeek?: boolean } = {},
): WeekChange | null {
  let before: Days | null = null;
  let after: Days | null = null;
  let changed: MealPlan | null = null;
  store.changeMealPlan(planId, (p) => {
    const around = aroundWeek(store, p);
    const next = change({ ...p, ...keepRecord(p, around) }, around);
    if (!next) return null;
    before = p.days;
    after = next.days;
    changed = next;
    return next;
  });
  if (!before || !after || !changed) return null;
  const result: WeekChange = { planId, before, after };
  const following = aroundWeek(store, changed).next;
  if (following) {
    const weekBefore: MealPlan = { ...(changed as MealPlan), days: before };
    store.changeMealPlan(following.id, (p) => {
      const r = followWeekBefore(p.days, before!, after!, { removeOrphans: removeOrphansNextWeek });
      if (!r) return null;
      result.next = { planId: p.id, before: p.days, after: r.days, freshDays: r.freshDays, removedDays: r.removedDays };
      const around = { prev: weekBefore, next: aroundWeek(store, p).next };
      return { ...p, ...keepRecord(p, around), days: r.days };
    });
  }
  return result;
}

/** Undo a change: the days it changed go back, in both weeks; anything else that's happened since stays. */
export function undoWeekChange(store: PlanStore, c: WeekChange) {
  store.changeMealPlan(c.planId, (p) => ({ ...p, days: undoDays(p.days, c.before, c.after) }));
  const n = c.next;
  if (n) store.changeMealPlan(n.planId, (p) => ({ ...p, days: undoDays(p.days, n.before, n.after) }));
}

/** What happened to next week's leftovers, to add to the message: " Tue 10 Nov now cooked fresh." */
export function nextWeekText(c: WeekChange | null): string {
  const n = c?.next;
  if (!n) return '';
  const said = (days: string[]) => days.map((d) => otherWeekDay(n.before, d)).join(' and ');
  const removed = n.removedDays.length ? ` Removed the leftovers on ${said(n.removedDays)}.` : '';
  const fresh = n.freshDays.length ? ` ${said(n.freshDays)} now cooked fresh.` : '';
  return removed + fresh;
}
