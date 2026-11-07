/** Working out the Cook tab's days: what can be cooked, each day's date, and leftovers to cook extra for. */
import { MealPlan, PlannedMeal, DayPlan } from '../../types';
import { DAYS_OF_WEEK, formatDateISO } from '../../utils';
import { carriedLeftovers, otherWeekDay } from '../../planning';

export const isCookable = (m?: PlannedMeal | null) =>
  !!m && (m.type === 'recipe' || m.type === 'leftover' || m.type === 'batch');
/** Reheating leftovers or a freezer meal: roughly how long before dinner to start. */
export const REHEAT_MINUTES: Record<string, number> = { leftover: 15, batch: 30 };

/** The date of a day in a plan ("2026-10-15"). */
export function dayISO(plan: MealPlan, day: string): string {
  const own = plan.days[day]?.date;
  if (own && /^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  const d = new Date(plan.startDate + 'T00:00:00');
  d.setDate(d.getDate() + Math.max(0, DAYS_OF_WEEK.indexOf(day)));
  return formatDateISO(d);
}

/**
 * Later days that eat leftovers of this cook: how many extra portions, which days. Given next week's
 * days, a cook at the end of the week counts next week's leftovers of it too ("Tue 10 Nov").
 */
export function leftoversAfter(
  days: Record<string, DayPlan>,
  day: string,
  meal: PlannedMeal,
  nextDays?: Record<string, DayPlan> | null,
): { extra: number; days: string[] } {
  const out = { extra: 0, days: [] as string[] };
  if (meal.type !== 'recipe' || !meal.recipeId) return out;
  for (let i = DAYS_OF_WEEK.indexOf(day) + 1; i > 0 && i < DAYS_OF_WEEK.length; i++) {
    const m = days[DAYS_OF_WEEK[i]]?.meals?.[0];
    if (!m || m.recipeId !== meal.recipeId) continue;
    if (m.type === 'leftover') {
      out.extra += m.servings || 2;
      out.days.push(DAYS_OF_WEEK[i]);
    } else break;
  }
  for (const c of carriedLeftovers(days, day, meal, nextDays)) {
    out.extra += c.meal.servings || 2;
    out.days.push(otherWeekDay(nextDays, c.day));
  }
  return out;
}

export const shortDay = (plan: MealPlan, day: string) =>
  `${day.slice(0, 3)} ${new Date(dayISO(plan, day) + 'T00:00:00').getDate()}`;
