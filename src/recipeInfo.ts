// What the recipe cards and the recipe pop-up say about a recipe: its time, how it can be
// cooked, whether it's vegetarian, when you last had it or have it planned, and what's in
// the freezer. Pure functions so both tabs say the same thing (and they can be tested).
import { Recipe, MealPlan, BatchItem, CookingMethod } from './types';

export const METHOD_ORDER: CookingMethod[] = ['oven_hob', 'ninja'];
export const METHOD_LABEL: Record<CookingMethod, string> = { oven_hob: 'Oven/Hob', ninja: 'Ninja' };

const hasSteps = (steps?: string[]) => Array.isArray(steps) && steps.some((s) => typeof s === 'string' && s.trim() !== '');

/** The ways this recipe can actually be cooked: methods with written steps (or, failing that, the ones it's marked for). */
export function recipeMethods(recipe: Recipe): CookingMethod[] {
  const withSteps = METHOD_ORDER.filter((m) => hasSteps(recipe.methodInstructions?.[m]));
  const marked = recipe.cookingMethods && recipe.cookingMethods.length > 0 ? recipe.cookingMethods : null;
  if (withSteps.length > 0) {
    const both = marked ? withSteps.filter((m) => marked.includes(m)) : withSteps;
    return both.length > 0 ? both : withSteps;
  }
  return marked ? METHOD_ORDER.filter((m) => marked.includes(m)) : [];
}

/** Prep + cook in minutes, or null when the recipe doesn't say (never made up). */
export function totalMinutes(recipe: Recipe): number | null {
  const t = (Number(recipe.prepTime) || 0) + (Number(recipe.cookTime) || 0);
  return t > 0 ? Math.round(t) : null;
}

/** "45 min", "1 hr", "1 hr 15 min". */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export const isVegetarianRecipe = (r: Recipe) =>
  !!(r.isVegetarian || r.isVegan || r.tags?.some((t) => ['vegetarian', 'vegi', 'veggie', 'vegan'].includes(String(t).toLowerCase())));
export const isVeganRecipe = (r: Recipe) => !!(r.isVegan || r.tags?.some((t) => String(t).toLowerCase() === 'vegan'));

export interface RecipeHistory {
  /** Most recent day before today it was on the plan (ISO date). */
  lastHad?: string;
  /** Next day from today it's on the plan (ISO date). */
  nextPlanned?: string;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => iso(new Date());

/** When each recipe was last on the plan and when it's next on it, from all your weeks. */
export function recipeHistories(plans: MealPlan[] | undefined, today: string): Map<string, RecipeHistory> {
  const out = new Map<string, RecipeHistory>();
  for (const plan of plans || []) {
    if (!plan?.days) continue;
    DAY_NAMES.forEach((dayName, i) => {
      const day = plan.days[dayName];
      if (!day?.meals?.length) return;
      let date = day.date;
      if (!date && plan.startDate) {
        const d = new Date(plan.startDate + 'T00:00:00');
        d.setDate(d.getDate() + i);
        date = iso(d);
      }
      if (!date) return;
      for (const meal of day.meals) {
        if (!meal?.recipeId) continue;
        const h = out.get(meal.recipeId) || {};
        if (date < today) { if (!h.lastHad || date > h.lastHad) h.lastHad = date; }
        else if (!h.nextPlanned || date < h.nextPlanned) h.nextPlanned = date;
        out.set(meal.recipeId, h);
      }
    });
  }
  return out;
}

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000);

/** "yesterday", "3 days ago", "2 weeks ago", "4 months ago", "over a year ago". */
export function formatAgo(date: string, today: string): string {
  const d = daysBetween(date, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 56) { const w = Math.round(d / 7); return w === 1 ? '1 week ago' : `${w} weeks ago`; }
  const m = Math.round(d / 30.44);
  if (m >= 12) return 'over a year ago';
  return `${m} months ago`;
}

/** "today", "tomorrow", "Thu", or "Thu 29 Oct" for further ahead. */
export function formatPlannedDay(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  const dt = new Date(date + 'T12:00:00');
  const wd = dt.toLocaleDateString('en-GB', { weekday: 'short' });
  if (d > 1 && d < 7) return wd;
  return `${wd} ${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/** "12 Oct" (or "12 Oct 2025" if not this year). */
export function formatShortDate(date: string, today: string): string {
  const dt = new Date(date + 'T12:00:00');
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return dt.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Portions of this recipe in the freezer (batches linked to it, or with exactly its name). */
export function freezerPortions(recipe: Recipe, batches: BatchItem[] | undefined): number {
  const name = (recipe.name || '').trim().toLowerCase();
  return (batches || []).reduce((sum, b) => {
    const mine = b.recipeId ? b.recipeId === recipe.id : (b.name || '').trim().toLowerCase() === name;
    return mine ? sum + Math.max(0, Number(b.portions) || 0) : sum;
  }, 0);
}

export type RecipeSort = 'az' | 'not_lately' | 'newest' | 'added';
export const RECIPE_SORTS: { id: RecipeSort; label: string }[] = [
  { id: 'az', label: 'A–Z' },
  { id: 'not_lately', label: 'Not had lately' },
  { id: 'newest', label: 'Newest first' },
  { id: 'added', label: 'Oldest first' },
];
export const RECIPE_SORT_KEY = 'recipe_sort';
export function readRecipeSort(): RecipeSort {
  try {
    const v = localStorage.getItem(RECIPE_SORT_KEY);
    return RECIPE_SORTS.some((s) => s.id === v) ? (v as RecipeSort) : 'az';
  } catch { return 'az'; }
}
export function saveRecipeSort(sort: RecipeSort) {
  try { localStorage.setItem(RECIPE_SORT_KEY, sort); } catch { /* per-phone convenience only */ }
}

/**
 * Recipes in the chosen order. "Not had lately": never had first, then the longest since you
 * last had it; anything already planned from today on goes to the end.
 */
export function sortRecipes(recipes: Recipe[], sort: RecipeSort, histories: Map<string, RecipeHistory>): Recipe[] {
  const byName = (a: Recipe, b: Recipe) => (a.name || '').localeCompare(b.name || '', 'en-GB', { sensitivity: 'base' });
  const list = [...recipes];
  if (sort === 'added') return list;
  if (sort === 'newest') return list.reverse();
  if (sort === 'az') return list.sort(byName);
  const rank = (r: Recipe) => {
    const h = histories.get(r.id);
    if (h?.nextPlanned) return [2, h.nextPlanned] as const;
    if (!h?.lastHad) return [0, ''] as const;
    return [1, h.lastHad] as const;
  };
  return list.sort((a, b) => {
    const [ga, ka] = rank(a);
    const [gb, kb] = rank(b);
    if (ga !== gb) return ga - gb;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return byName(a, b);
  });
}

/** First web address in some pasted text, for "Website" on an imported recipe. */
export function firstUrl(text: string | undefined): string | undefined {
  const m = (text || '').match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!m) return undefined;
  return m[0].replace(/[.,;:!?]+$/, '');
}

// Filler the app used to put in the description when a recipe had no intro.
const FILLER_INTROS = [/^custom home-cooked meal\.?$/i, /^home-cooked meal portioned for 2 adults\.?$/i];
/** The recipe's own intro, or '' when it's only filler. */
export function recipeIntro(recipe: Recipe): string {
  const d = (recipe.description || '').trim();
  return FILLER_INTROS.some((re) => re.test(d)) ? '' : d;
}

/** "bbcgoodfood.com" from a link, for showing it short. */
export function siteName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
