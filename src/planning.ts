// Week-plan helpers used by Planning (and the Shop tab's "out of date" note). Pure functions.
import { DayPlan, MealPlan, PlannedMeal } from './types';

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const isLeftoverMeal = (m: PlannedMeal) => m.type === 'leftover' || /^leftovers?:\s*/i.test(m.name || '');
export const cleanMealName = (name: string) => (name || '').replace(/^(leftovers?|batch):\s*/i, '').trim();

/** What a day's meal adds to the shopping list (notes don't). */
export function mealSignature(m?: PlannedMeal | null): string {
  if (!m) return '';
  const sides = (m.sides || []).map((s) => `${s.name}:${s.amount ?? ''}${s.unit ?? ''}`).sort().join(',');
  return [m.type, m.recipeId || m.batchId || cleanMealName(m.name).toLowerCase(), m.servings || 0, sides].join('|');
}

/** The week as the shopping list saw it: one signature per day. Stored when the list is made. */
export function listSnapshot(plan: MealPlan): string {
  const out: Record<string, string> = {};
  for (const d of WEEK_DAYS) out[d] = (plan.days[d]?.meals || []).map(mealSignature).join('+');
  return JSON.stringify(out);
}

/**
 * Days changed since the week was sent to the shopping list. Empty when it hasn't been sent, or
 * when it was sent before the app kept a record (nothing to compare with), or nothing changed.
 */
export function changedDaysSinceList(plan?: MealPlan | null): string[] {
  if (!plan || plan.status !== 'finalized' || !plan.lastFinalizedSnapshot) return [];
  let before: Record<string, string>;
  try { before = JSON.parse(plan.lastFinalizedSnapshot); } catch { return []; }
  if (!before || typeof before !== 'object') return [];
  const now = JSON.parse(listSnapshot(plan));
  return WEEK_DAYS.filter((d) => (before[d] ?? '') !== (now[d] ?? ''));
}

/**
 * After meals move around, point each leftover day at the cook it comes from ("Reheat from
 * Tuesday"). A leftover day left with no earlier cook becomes a fresh cook of that recipe.
 */
export function relinkLeftovers(days: Record<string, DayPlan>): { days: Record<string, DayPlan>; freshDays: string[] } {
  const next: Record<string, DayPlan> = {};
  const freshDays: string[] = [];
  WEEK_DAYS.forEach((day, i) => {
    const dp = days[day];
    if (!dp) return;
    next[day] = {
      ...dp,
      meals: (dp.meals || []).map((m) => {
        if (!isLeftoverMeal(m) || !m.recipeId) return m;
        let source: string | null = null;
        for (let j = i - 1; j >= 0 && !source; j--) {
          if ((days[WEEK_DAYS[j]]?.meals || []).some((x) => x.recipeId === m.recipeId && !isLeftoverMeal(x))) source = WEEK_DAYS[j];
        }
        const autoNote = !m.note || /^Reheat (from |leftovers)/i.test(m.note);
        if (source) return autoNote ? { ...m, note: `Reheat from ${source}` } : m;
        freshDays.push(day);
        return { ...m, type: 'recipe' as const, name: cleanMealName(m.name), note: autoNote ? '' : m.note };
      }),
    };
  });
  for (const k of Object.keys(days)) if (!next[k]) next[k] = days[k];
  return { days: next, freshDays };
}

/**
 * Move a day's meal to another day; if that day has a meal, they swap. Leftovers follow their cook.
 */
export function moveMeal(days: Record<string, DayPlan>, from: string, to: string): { days: Record<string, DayPlan>; swapped: boolean; freshDays: string[] } {
  if (from === to) return { days, swapped: false, freshDays: [] };
  const a = days[from]?.meals || [];
  const b = days[to]?.meals || [];
  const moved: Record<string, DayPlan> = {
    ...days,
    [from]: { ...(days[from] || { date: '', meals: [] }), meals: b.map((m) => ({ ...m })) },
    [to]: { ...(days[to] || { date: '', meals: [] }), meals: a.map((m) => ({ ...m })) },
  };
  const r = relinkLeftovers(moved);
  return { days: r.days, swapped: b.length > 0, freshDays: r.freshDays };
}

/** The day a leftover meal was cooked (nearest earlier day with the same recipe, cooked fresh). */
export function leftoverSourceDay(days: Record<string, DayPlan>, day: string, meal: PlannedMeal | null): string | null {
  if (!meal || !isLeftoverMeal(meal) || !meal.recipeId) return null;
  for (let j = WEEK_DAYS.indexOf(day) - 1; j >= 0; j--) {
    if ((days[WEEK_DAYS[j]]?.meals || []).some((x) => x.recipeId === meal.recipeId && !isLeftoverMeal(x))) return WEEK_DAYS[j];
  }
  return null;
}

/** "Cook for 6: leftovers Tue, Thu" for a fresh cook that later leftover days rely on. */
export function cooksForText(days: Record<string, DayPlan>, day: string, meal: PlannedMeal | null): string | null {
  if (!meal || meal.type !== 'recipe' || !meal.recipeId) return null;
  const later: string[] = [];
  let extra = 0;
  for (let i = WEEK_DAYS.indexOf(day) + 1; i < WEEK_DAYS.length; i++) {
    const m = days[WEEK_DAYS[i]]?.meals?.[0];
    if (!m || m.recipeId !== meal.recipeId) continue;
    if (isLeftoverMeal(m)) { later.push(WEEK_DAYS[i].slice(0, 3)); extra += m.servings || 2; } else break;
  }
  return later.length ? `Cook for ${(meal.servings || 2) + extra}: leftovers ${later.join(', ')}` : null;
}

/** Which week Planning should open on: Monday–Thursday this week, Friday–Sunday next week. */
export function preferredWeekStart(now: Date, thisMonday: string, nextMonday: string): string {
  const dow = now.getDay(); // 0 Sun … 6 Sat
  return dow === 0 || dow >= 5 ? nextMonday : thisMonday;
}
