// Week-plan helpers used by Planning (and the Shop tab's "out of date" note). Pure functions.
import { DayPlan, MealPlan, PlannedMeal } from './types';

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const isLeftoverMeal = (m: PlannedMeal) => m.type === 'leftover' || /^leftovers?:\s*/i.test(m.name || '');
export const cleanMealName = (name: string) => (name || '').replace(/^(leftovers?|batch):\s*/i, '').trim();
/** A day that cooks this recipe from scratch (so later days can have its leftovers). */
const cooksFresh = (x: PlannedMeal, recipeId: string) =>
  x.recipeId === recipeId && !isLeftoverMeal(x) && x.type !== 'batch';
const dayCooks = (days: Record<string, DayPlan> | undefined, day: string, recipeId: string) =>
  (days?.[day]?.meals || []).some((x) => cooksFresh(x, recipeId));

// ---------- Leftovers carried over from the end of one week into the next ----------

/**
 * How many days back leftovers can come from a cook in the week before: last Thursday to Sunday for
 * Monday, Friday to Sunday for Tuesday, Saturday or Sunday for Wednesday, Sunday for Thursday.
 * Within a week, leftovers can come from any earlier day, as they always have.
 */
export const CARRY_OVER_DAYS = 4;

/** The weeks either side of a week: leftovers can carry over from the end of one into the next. */
export interface WeekNeighbours {
  prev?: MealPlan | null;
  next?: MealPlan | null;
}

const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The week before and the week after a week, if they've been made. */
export function weekNeighbours(
  plans: MealPlan[] | null | undefined,
  plan: MealPlan | null | undefined,
): WeekNeighbours {
  if (!plan?.startDate || !plans?.length) return {};
  const prev = shiftDate(plan.startDate, -7);
  const next = shiftDate(plan.startDate, 7);
  return {
    prev: plans.find((p) => p.startDate === prev) || null,
    next: plans.find((p) => p.startDate === next) || null,
  };
}

/**
 * A day in the week before or after the one you're looking at, by its date so it's clear which:
 * "Tue 10 Nov" ("Tue next week" if the day has no date).
 */
export function otherWeekDay(
  days: Record<string, DayPlan> | null | undefined,
  day: string,
  which: 'last' | 'next' = 'next',
): string {
  const iso = days?.[day]?.date;
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}T12:00:00`);
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
    return `${weekday} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
  }
  return `${day.slice(0, 3)} ${which} week`;
}

/** Where a leftovers meal comes from: a day this week, or a day at the end of last week. */
export interface LeftoverSource {
  day: string;
  lastWeek: boolean;
}

/**
 * The cook a leftovers meal comes from: the nearest earlier day this week that cooks it from
 * scratch, or else (given last week's days) one at the end of last week, no more than
 * CARRY_OVER_DAYS before.
 */
export function leftoverSource(
  days: Record<string, DayPlan>,
  day: string,
  meal: PlannedMeal | null,
  prevDays?: Record<string, DayPlan> | null,
): LeftoverSource | null {
  if (!meal || !isLeftoverMeal(meal) || !meal.recipeId) return null;
  const i = WEEK_DAYS.indexOf(day);
  if (i < 0) return null;
  for (let j = i - 1; j >= 0; j--)
    if (dayCooks(days, WEEK_DAYS[j], meal.recipeId)) return { day: WEEK_DAYS[j], lastWeek: false };
  if (prevDays) {
    for (let j = WEEK_DAYS.length - 1; j >= 0 && WEEK_DAYS.length - j + i <= CARRY_OVER_DAYS; j--) {
      if (dayCooks(prevDays, WEEK_DAYS[j], meal.recipeId)) return { day: WEEK_DAYS[j], lastWeek: true };
    }
  }
  return null;
}

/** A cook at the end of last week that a day this week could have the leftovers of (nearest first). */
export function lastWeekCookFor(
  day: string,
  recipeId: string | undefined,
  prevDays?: Record<string, DayPlan> | null,
): string | null {
  if (!recipeId || !prevDays) return null;
  return leftoverSource({}, day, { id: '', type: 'leftover', recipeId, name: '' }, prevDays)?.day ?? null;
}

/** Next week's leftovers of a cook at the end of this week (they're bought with it, this week). */
export function carriedLeftovers(
  days: Record<string, DayPlan>,
  day: string,
  meal: PlannedMeal | null,
  nextDays?: Record<string, DayPlan> | null,
): { day: string; meal: PlannedMeal }[] {
  const out: { day: string; meal: PlannedMeal }[] = [];
  if (!nextDays || !meal?.recipeId || !cooksFresh(meal, meal.recipeId)) return out;
  const j = WEEK_DAYS.indexOf(day);
  if (j < 0) return out;
  for (let i = 0; WEEK_DAYS.length - j + i <= CARRY_OVER_DAYS; i++) {
    const d = WEEK_DAYS[i];
    for (const m of nextDays[d]?.meals || []) {
      if (!isLeftoverMeal(m) || m.recipeId !== meal.recipeId) continue;
      const src = leftoverSource(nextDays, d, m, days);
      if (src?.lastWeek && src.day === day) out.push({ day: d, meal: m });
    }
  }
  return out;
}

/** The week after's leftovers that came from this week before a change and have no cook after it. */
export function carriedOrphans(
  nextDays: Record<string, DayPlan>,
  before: Record<string, DayPlan>,
  after: Record<string, DayPlan>,
): string[] {
  const lost: string[] = [];
  for (const d of WEEK_DAYS.slice(0, CARRY_OVER_DAYS)) {
    const gone = (nextDays[d]?.meals || []).some(
      (m) => leftoverSource(nextDays, d, m, before)?.lastWeek && !leftoverSource(nextDays, d, m, after),
    );
    if (gone) lost.push(d);
  }
  return lost;
}

/**
 * The week after, once this week's days have changed: its leftovers of this week's cooks follow them
 * (the note says the day they're from now), and any whose cook has gone are cooked fresh instead
 * (`freshDays`), or taken off with `removeOrphans` (`removedDays`). Null when nothing changes.
 */
export function followWeekBefore(
  nextDays: Record<string, DayPlan>,
  before: Record<string, DayPlan>,
  after: Record<string, DayPlan>,
  { removeOrphans = false }: { removeOrphans?: boolean } = {},
): { days: Record<string, DayPlan>; freshDays: string[]; removedDays: string[] } | null {
  const key = (s: LeftoverSource | null) => (s ? `${s.day}|${s.lastWeek}` : '');
  const moved = WEEK_DAYS.slice(0, CARRY_OVER_DAYS).some((d) =>
    (nextDays[d]?.meals || []).some(
      (m) => key(leftoverSource(nextDays, d, m, before)) !== key(leftoverSource(nextDays, d, m, after)),
    ),
  );
  if (!moved) return null;
  let days = nextDays;
  const removedDays = removeOrphans ? carriedOrphans(nextDays, before, after) : [];
  if (removedDays.length) {
    days = { ...nextDays };
    for (const d of removedDays) {
      days[d] = {
        ...days[d],
        meals: days[d].meals.filter(
          (m) => !(leftoverSource(nextDays, d, m, before)?.lastWeek && !leftoverSource(nextDays, d, m, after)),
        ),
      };
    }
  }
  const r = relinkLeftovers(days, after);
  return { days: r.days, freshDays: r.freshDays, removedDays };
}

/** A meal's signature with what carries over: "last week" on leftovers bought then, "next week" portions on a cook. */
function carriedSignature(plan: MealPlan, day: string, m: PlannedMeal, around?: WeekNeighbours): string {
  let sig = mealSignature(m);
  if (around?.prev && leftoverSource(plan.days, day, m, around.prev.days)?.lastWeek) sig += '|from last week';
  const carried = carriedLeftovers(plan.days, day, m, around?.next?.days);
  if (carried.length) sig += `|next week ${carried.map((c) => `${c.day}:${c.meal.servings || 0}`).join(',')}`;
  return sig;
}

/** What a day's meal adds to the shopping list (notes don't). */
export function mealSignature(m?: PlannedMeal | null): string {
  if (!m) return '';
  const sides = (m.sides || [])
    .map((s) => `${s.name}:${s.amount ?? ''}${s.unit ?? ''}`)
    .sort()
    .join(',');
  return [m.type, m.recipeId || m.batchId || cleanMealName(m.name).toLowerCase(), m.servings || 0, sides].join('|');
}

/**
 * The week as the shopping list saw it: one signature per day. Stored when the list is made. With
 * the weeks either side, it also says what carries over (Sunday's cook buying for Tuesday next
 * week's leftovers), so changing those makes "Update list" appear on the week that buys for them.
 */
export function listSnapshot(plan: MealPlan, around?: WeekNeighbours): string {
  const out: Record<string, string> = {};
  for (const d of WEEK_DAYS)
    out[d] = (plan.days[d]?.meals || []).map((m) => carriedSignature(plan, d, m, around)).join('+');
  return JSON.stringify(out);
}

/**
 * Days changed since the week was sent to the shopping list. Empty when it hasn't been sent, or
 * when it was sent before the app kept a record (nothing to compare with), or nothing changed.
 */
export function changedDaysSinceList(plan?: MealPlan | null, around?: WeekNeighbours): string[] {
  if (!plan || plan.status !== 'finalized' || !plan.lastFinalizedSnapshot) return [];
  let before: Record<string, string>;
  try {
    before = JSON.parse(plan.lastFinalizedSnapshot);
  } catch {
    return [];
  }
  if (!before || typeof before !== 'object') return [];
  const now = JSON.parse(listSnapshot(plan, around));
  return WEEK_DAYS.filter((d) => (before[d] ?? '') !== (now[d] ?? ''));
}

/**
 * After meals move around, point each leftover day at the cook it comes from ("Reheat from
 * Tuesday"). A leftover day left with no earlier cook becomes a fresh cook of that recipe. Given
 * last week's days, a cook at the end of last week counts too (see leftoverSource).
 */
export function relinkLeftovers(
  days: Record<string, DayPlan>,
  prevDays?: Record<string, DayPlan> | null,
): { days: Record<string, DayPlan>; freshDays: string[] } {
  const next: Record<string, DayPlan> = {};
  const freshDays: string[] = [];
  WEEK_DAYS.forEach((day) => {
    const dp = days[day];
    if (!dp) return;
    next[day] = {
      ...dp,
      meals: (dp.meals || []).map((m) => {
        if (!isLeftoverMeal(m) || !m.recipeId) return m;
        const source = leftoverSource(days, day, m, prevDays)?.day ?? null;
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
export function moveMeal(
  days: Record<string, DayPlan>,
  from: string,
  to: string,
  prevDays?: Record<string, DayPlan> | null,
): { days: Record<string, DayPlan>; swapped: boolean; freshDays: string[] } {
  if (from === to) return { days, swapped: false, freshDays: [] };
  const a = days[from]?.meals || [];
  const b = days[to]?.meals || [];
  const moved: Record<string, DayPlan> = {
    ...days,
    [from]: { ...(days[from] || { date: '', meals: [] }), meals: b.map((m) => ({ ...m })) },
    [to]: { ...(days[to] || { date: '', meals: [] }), meals: a.map((m) => ({ ...m })) },
  };
  const r = relinkLeftovers(moved, prevDays);
  return { days: r.days, swapped: b.length > 0, freshDays: r.freshDays };
}

/**
 * The day a leftover meal was cooked (nearest earlier day with the same recipe, cooked fresh; given
 * last week's days, possibly one at the end of last week).
 */
export function leftoverSourceDay(
  days: Record<string, DayPlan>,
  day: string,
  meal: PlannedMeal | null,
  prevDays?: Record<string, DayPlan> | null,
): string | null {
  return leftoverSource(days, day, meal, prevDays)?.day ?? null;
}

/**
 * "Cook for 6: leftovers Tue, Thu" for a fresh cook that later leftover days rely on ("leftovers
 * Tue 10 Nov" for a Sunday cook, given next week's days).
 */
export function cooksForText(
  days: Record<string, DayPlan>,
  day: string,
  meal: PlannedMeal | null,
  nextDays?: Record<string, DayPlan> | null,
): string | null {
  if (!meal || meal.type !== 'recipe' || !meal.recipeId) return null;
  const later: string[] = [];
  let extra = 0;
  for (let i = WEEK_DAYS.indexOf(day) + 1; i < WEEK_DAYS.length; i++) {
    const m = days[WEEK_DAYS[i]]?.meals?.[0];
    if (!m || m.recipeId !== meal.recipeId) continue;
    if (isLeftoverMeal(m)) {
      later.push(WEEK_DAYS[i].slice(0, 3));
      extra += m.servings || 2;
    } else break;
  }
  const carried = carriedLeftovers(days, day, meal, nextDays);
  for (const c of carried) extra += c.meal.servings || 2;
  for (const c of carried) later.push(otherWeekDay(nextDays, c.day));
  return later.length ? `Cook for ${(meal.servings || 2) + extra}: leftovers ${later.join(', ')}` : null;
}

// ---------- Changing the meals on a week (Planning) ----------

/** Is `candidate` a leftovers meal of `main` (same recipe, freezer batch, or name)? */
export function isLeftoverOf(main: PlannedMeal, candidate: PlannedMeal): boolean {
  if (main.id === candidate.id) return false;
  // A leftovers meal doesn't have leftovers of its own.
  if (main.type === 'leftover' || /^leftovers?:\s*/i.test(main.name || '')) return false;
  if (!(candidate.type === 'leftover' || /^leftovers?:\s*/i.test(candidate.name || ''))) return false;
  if (main.recipeId && candidate.recipeId && main.recipeId === candidate.recipeId) return true;
  if (main.batchId && candidate.batchId && main.batchId === candidate.batchId) return true;
  // By name (ignoring "Leftovers: ").
  const cleanMain = (main.name || '')
    .toLowerCase()
    .replace(/^leftovers?:\s*/i, '')
    .trim();
  const cleanCandidate = (candidate.name || '')
    .toLowerCase()
    .replace(/^leftovers?:\s*/i, '')
    .trim();
  if (cleanMain && cleanCandidate) {
    if (cleanMain === cleanCandidate) return true;
    if (cleanCandidate.includes(cleanMain) || cleanMain.includes(cleanCandidate)) return true;
  }
  return false;
}

/** Days whose leftovers come from this meal (and no other earlier cook of it): they'd go if it went. */
export function orphanedLeftoverDays(
  days: Record<string, DayPlan>,
  targetDayName: string,
  mealToRemove: PlannedMeal,
): string[] {
  if (!days || !mealToRemove) return [];
  const leftoverDays: string[] = [];
  WEEK_DAYS.forEach((dName, dIndex) => {
    const dayPlan = days[dName];
    if (!dayPlan || !dayPlan.meals) return;
    if (!dayPlan.meals.some((m) => isLeftoverOf(mealToRemove, m))) return;
    // Another fresh cook of it before this day (not the day being changed) keeps the leftovers.
    let hasAlternativeCook = false;
    for (let i = 0; i < dIndex; i++) {
      const prevDayName = WEEK_DAYS[i];
      if (prevDayName === targetDayName) continue;
      const prevMeals = days[prevDayName]?.meals || [];
      const hasFreshCook = prevMeals.some(
        (m) =>
          (m.type === 'recipe' || m.type === 'batch') &&
          !isLeftoverOf(mealToRemove, m) &&
          ((mealToRemove.recipeId && m.recipeId === mealToRemove.recipeId) ||
            (m.name || '').toLowerCase().trim() === (mealToRemove.name || '').toLowerCase().trim()),
      );
      if (hasFreshCook) {
        hasAlternativeCook = true;
        break;
      }
    }
    if (!hasAlternativeCook) leftoverDays.push(dName);
  });
  return leftoverDays;
}

/** The day's meal (one per day), or null. */
export function mealOnDay(days: Record<string, DayPlan>, day: string): PlannedMeal | null {
  const dayPlan = days[day];
  return dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;
}

/**
 * Put a meal on a day (replacing what's there) or take one off. Leftovers that depended on the
 * meal taken away go too (orphanedDays says which, so you can be asked first).
 */
export function changeDayMeal(
  days: Record<string, DayPlan>,
  dayName: string,
  mealToRemove: PlannedMeal | null,
  newMeal: PlannedMeal | null,
): { days: Record<string, DayPlan>; orphanedDays: string[] } {
  const orphanedDays = mealToRemove ? orphanedLeftoverDays(days, dayName, mealToRemove) : [];
  const nextDays: Record<string, DayPlan> = {};
  WEEK_DAYS.forEach((d) => {
    const dayPlan = days[d] || { date: '', meals: [] };
    let meals = [...dayPlan.meals];
    if (d === dayName) {
      if (newMeal) meals = [newMeal];
      else if (mealToRemove) meals = meals.filter((m) => m.id !== mealToRemove.id);
    } else if (orphanedDays.includes(d) && mealToRemove) {
      meals = meals.filter((m) => !isLeftoverOf(mealToRemove, m));
    }
    nextDays[d] = { ...dayPlan, meals };
  });
  return { days: nextDays, orphanedDays };
}

/** "Replaced X with Y (leftovers) on Tuesday", "Removed X from Tuesday", "Added X to Tuesday for 4". */
export function describeMealChange(dayName: string, removed: PlannedMeal | null, added: PlannedMeal | null): string {
  const plain = (m: PlannedMeal) => (m.name || '').replace(/^(leftovers?|batch):\s*/i, '');
  const how = (m: PlannedMeal) =>
    m.type === 'batch' ? ' from the freezer' : m.type === 'leftover' ? ' (leftovers)' : '';
  if (removed && added) return `Replaced ${plain(removed)} with ${plain(added)}${how(added)} on ${dayName}`;
  if (removed) return `Removed ${plain(removed)} from ${dayName}`;
  if (added) return `Added ${plain(added)}${how(added)} to ${dayName}${added.servings ? ` for ${added.servings}` : ''}`;
  return '';
}

/** Earlier days this week with this recipe on (cooked, or as leftovers): it could be leftovers from them. */
export function earlierDaysWithRecipe(
  days: Record<string, DayPlan>,
  dayName: string,
  recipe: { id: string; name: string },
): string[] {
  const existingDays: string[] = [];
  const targetDayIndex = WEEK_DAYS.indexOf(dayName);
  Object.entries(days).forEach(([dName, dayPlan]) => {
    const dIndex = WEEK_DAYS.indexOf(dName);
    if (dName !== dayName && dIndex < targetDayIndex) {
      const hasRecipe = dayPlan.meals.some(
        (m) =>
          (m.type === 'recipe' || m.type === 'leftover') &&
          (m.recipeId === recipe.id ||
            (m.name && recipe.name && m.name.toLowerCase().includes(recipe.name.toLowerCase()))),
      );
      if (hasRecipe) existingDays.push(dName);
    }
  });
  return existingDays;
}

/** Another week's meals, day by day, as new meals (not marked cooked) on this week's days. */
export function copyWeekMeals(
  days: Record<string, DayPlan>,
  source: MealPlan,
): { days: Record<string, DayPlan>; copied: number } {
  let copied = 0;
  const nextDays: Record<string, DayPlan> = {};
  WEEK_DAYS.forEach((d) => {
    const target = days[d] || { date: '', meals: [] };
    const meals = (source.days?.[d]?.meals || []).map((m) => {
      const { cooked: _cooked, ...rest } = m;
      copied++;
      return { ...rest, id: crypto.randomUUID() };
    });
    nextDays[d] = { ...target, meals };
  });
  return { days: nextDays, copied };
}

/**
 * Undo a change to a week: the days it changed go back to how they were, and any other day keeps
 * what's happened to it since (on this phone or the other one).
 */
export function undoDays(
  latest: Record<string, DayPlan>,
  before: Record<string, DayPlan>,
  after: Record<string, DayPlan>,
): Record<string, DayPlan> {
  const out = { ...latest };
  for (const d of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[d]) === JSON.stringify(after[d])) continue;
    if (before[d]) out[d] = before[d];
    else delete out[d];
  }
  return out;
}
