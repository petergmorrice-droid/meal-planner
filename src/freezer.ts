// The freezer: what's in it, grouped by dish, how long it's been there, and what the plan
// already wants from it. A portion is one person's helping everywhere in the app (a meal for
// 2 takes 2 portions), so these helpers only ever count portions.
import { BatchItem, DayPlan, MealPlan, PlannedMeal, Recipe } from './types';
import { WEEK_DAYS, relinkLeftovers } from './planning';

/** Older than this and it says "use soon". */
export const USE_SOON_DAYS = 90;

const dayMs = 86_400_000;
const dateOnly = (iso: string | undefined) => String(iso || '').slice(0, 10);
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round(
    (new Date(dateOnly(toIso) + 'T12:00:00').getTime() - new Date(dateOnly(fromIso) + 'T12:00:00').getTime()) / dayMs,
  );

/** "today", "yesterday", "5 days ago", "3 weeks ago", "2 months ago", "over a year ago". */
export function frozenAgo(dateIso: string | undefined, todayIso: string): string {
  if (!dateIso) return '';
  const d = daysBetween(dateIso, todayIso);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30.4)} months ago`;
  return 'over a year ago';
}

/** "enough for 1 meal for 2, and 1 over" / "enough for 3 meals for 2" / "1 helping". */
export function mealsFor(portions: number, people: number): string {
  const p = Math.max(1, people || 2);
  const meals = Math.floor(portions / p);
  const over = portions - meals * p;
  if (meals === 0) return portions === 1 ? 'one helping' : `${portions} helpings, not quite a meal for ${p}`;
  return `enough for ${meals} ${meals === 1 ? 'meal' : 'meals'} for ${p}${over ? `, and ${over} over` : ''}`;
}

export interface FreezerPlanUse {
  planId: string;
  day: string;
  date: string;
  mealId: string;
  portions: number;
  batchId?: string;
}

export interface FreezerGroup {
  key: string;
  name: string;
  recipeId?: string;
  /** Oldest first. */
  batches: BatchItem[];
  portions: number;
  oldest: string;
  ageDays: number;
  useSoon: boolean;
  /** Freezer meals on the plan from today on, not yet eaten. */
  planned: FreezerPlanUse[];
  plannedPortions: number;
  spare: number;
}

const keyFor = (b: BatchItem) => (b.recipeId ? `r:${b.recipeId}` : `n:${(b.name || '').trim().toLowerCase()}`);

/** The date of a plan's day (from the day, or worked out from the week's Monday). */
export function planDayDate(plan: MealPlan, day: string): string {
  const own = plan.days?.[day]?.date;
  if (own && /^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  const d = new Date(plan.startDate + 'T12:00:00');
  d.setDate(d.getDate() + Math.max(0, WEEK_DAYS.indexOf(day)));
  return d.toISOString().slice(0, 10);
}

/**
 * The freezer grouped by dish (two chilli batches are one "Chilli con carne"), oldest dish first,
 * with what the plan wants from each.
 */
export function freezerGroups(
  batches: BatchItem[],
  recipes: Recipe[],
  plans: MealPlan[],
  todayIso: string,
): FreezerGroup[] {
  const groups = new Map<string, FreezerGroup>();
  for (const b of batches || []) {
    const k = keyFor(b);
    const recipe = b.recipeId ? recipes.find((r) => r.id === b.recipeId) : undefined;
    let g = groups.get(k);
    if (!g) {
      g = {
        key: k,
        name: (b.name || recipe?.name || 'Something frozen').trim(),
        recipeId: b.recipeId || undefined,
        batches: [],
        portions: 0,
        oldest: '',
        ageDays: 0,
        useSoon: false,
        planned: [],
        plannedPortions: 0,
        spare: 0,
      };
      groups.set(k, g);
    }
    g.batches.push(b);
  }
  // What the plan wants: freezer meals today or later, not eaten yet.
  const batchGroup = new Map<string, string>();
  for (const g of groups.values()) for (const b of g.batches) batchGroup.set(b.id, g.key);
  for (const p of plans || []) {
    for (const day of WEEK_DAYS) {
      const date = planDayDate(p, day);
      if (date < todayIso) continue;
      for (const m of p.days?.[day]?.meals || []) {
        if (m.type !== 'batch' || m.cooked) continue;
        const k = (m.batchId && batchGroup.get(m.batchId)) || (m.recipeId ? `r:${m.recipeId}` : null);
        const g = k ? groups.get(k) : undefined;
        if (!g) continue;
        g.planned.push({ planId: p.id, day, date, mealId: m.id, portions: m.servings || 2, batchId: m.batchId });
      }
    }
  }
  const out = [...groups.values()].map((g) => {
    g.batches.sort((a, b) => dateOnly(a.dateAdded).localeCompare(dateOnly(b.dateAdded)));
    g.portions = g.batches.reduce((s, b) => s + Math.max(0, Number(b.portions) || 0), 0);
    g.oldest = dateOnly(g.batches[0]?.dateAdded);
    g.ageDays = g.oldest ? Math.max(0, daysBetween(g.oldest, todayIso)) : 0;
    g.useSoon = g.ageDays > USE_SOON_DAYS;
    g.planned.sort((a, b) => a.date.localeCompare(b.date));
    g.plannedPortions = g.planned.reduce((s, x) => s + x.portions, 0);
    g.spare = g.portions - g.plannedPortions;
    return g;
  });
  return out.sort((a, b) => a.oldest.localeCompare(b.oldest) || a.name.localeCompare(b.name));
}

/** "Thu", "tomorrow", "today" or "Mon 26 Oct" for a planned day. */
export function whenText(date: string, todayIso: string): string {
  const d = daysBetween(todayIso, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  const dt = new Date(date + 'T12:00:00');
  const wd = dt.toLocaleDateString('en-GB', { weekday: 'short' });
  return d < 7 ? wd : `${wd} ${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/**
 * Put a freezer meal on a day (replacing what's there). Leftovers that depended on a cook that's
 * been replaced become fresh cooks. Returns the new days and what was replaced.
 */
export function planFreezerMeal(
  days: Record<string, DayPlan>,
  day: string,
  group: { name: string; recipeId?: string; batches: BatchItem[] },
  servings: number,
  newId: string,
): { days: Record<string, DayPlan>; replaced: PlannedMeal | null; freshDays: string[] } {
  const dp = days[day] || { date: '', meals: [] };
  const replaced = dp.meals?.[0] || null;
  const meal: PlannedMeal = {
    id: newId,
    type: 'batch',
    batchId: group.batches[0]?.id,
    ...(group.recipeId ? { recipeId: group.recipeId } : {}),
    name: `Batch: ${group.name}`,
    servings,
    note: '',
  };
  const r = relinkLeftovers({ ...days, [day]: { ...dp, meals: [meal] } });
  return { days: r.days, replaced, freshDays: r.freshDays };
}
