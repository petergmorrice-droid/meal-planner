/**
 * Auto populate: meals from your cookbook for the days you pick, using up last week's leftovers
 * first. Each recipe gets a score:
 *
 * - how much of what's left it uses, the things that go off soonest counting most;
 * - your stars, favourites and "Have it again" (never "Not for us");
 * - how long since you had it (not twice in a fortnight; "Something new" prefers ones you haven't
 *   had, "Favourites" the ones you like);
 * - busy nights only get quick meals (30 min or less) or something from the freezer.
 *
 * Days are filled in order, so what goes off first is used early in the week, and each pick takes
 * what it uses off what's left before the next day is chosen. A little randomness (from `seed`)
 * breaks ties, so "Shuffle" gives a different week. Everything here is plain functions.
 */
import type { AutoPlanMood, DayPlan, MealPlan, PlannedMeal, Recipe, RecipeRating } from './types';
import type { FreezerGroup } from './freezer';
import { frozenAgo } from './freezer';
import type { Leftover } from './leftovers';
import { WEEK_DAYS, relinkLeftovers } from './planning';
import { formatAgo, formatMinutes, totalMinutes, type RecipeHistory } from './recipeInfo';
import { averageStars, ratingsFor } from './ratings';
import { planIngredientInputs } from './utils';
import { canonicalUnit, groupingKey, matchProduct, parseAmount, toBase, type Catalog } from './shopping';

/** Busy nights: this long or less (the same as the "Under 30 min" filter). */
export const QUICK_MINUTES = 30;

export interface AutoPlanAnswers {
  /** The days to fill. */
  days: string[];
  /** Days you're short of time: quick meals, or the freezer. */
  busyDays: string[];
  people: number;
  mood: AutoPlanMood;
  /** Freezer meals on busy nights. */
  useFreezer: boolean;
}

export interface DayPick {
  day: string;
  kind: 'recipe' | 'freezer';
  recipeId?: string;
  /** A freezer meal: the dish and its oldest batch. */
  freezerKey?: string;
  batchId?: string;
  /** A freezer meal: portions it takes. */
  portions?: number;
  name: string;
  /** Why this one: "Uses your chicken breasts and coriander", "A favourite", "Quick: 25 min". */
  reasons: string[];
  /** How much of each leftover it uses (by the leftover's key, in its amount's measure). */
  uses: Record<string, number>;
  score: number;
}

export interface AutoPlanContext {
  recipes: Recipe[];
  /** What you said you've still got. */
  leftovers: Leftover[];
  catalog: Catalog;
  history: Map<string, RecipeHistory>;
  ratings?: RecipeRating[];
  /** The freezer by dish (freezerGroups), with what's spare after what's already planned. */
  freezer: FreezerGroup[];
  /** The Monday of the week being filled. */
  weekStart: string;
  today: string;
  /** Recipes already on the week: not suggested again. */
  plannedRecipeIds: string[];
  /** What the meals already on the week use of the leftovers: taken off first. */
  alreadyUses?: Record<string, number>;
  seed?: number;
}

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000);

/** A steady number from 0 to 1 for a seed and an id (ties broken the same way until you shuffle). */
function jitter(seed: number, id: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const urgency = (l: Leftover) => (l.useWithin <= 2 ? 3 : l.useWithin <= 4 ? 2 : 1);

/** "chicken breasts and coriander", "a, b and c". */
export function andList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How much of each leftover a recipe uses when cooked for `people` (by the leftover's key). */
export function recipeUses(
  recipe: Recipe,
  people: number,
  leftovers: Leftover[],
  catalog: Catalog,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!leftovers.length || !Array.isArray(recipe.ingredients)) return out;
  const keys = new Set(leftovers.map((l) => l.key));
  const scale = Math.max(1, people) / (recipe.servings && recipe.servings > 0 ? recipe.servings : 2);
  for (const ing of recipe.ingredients) {
    if (!ing?.name) continue;
    const amount = parseAmount(ing.amount) * scale;
    const product = matchProduct(catalog, ing.name, {
      groceryId: ing.groceryId,
      unit: ing.unit,
      amount: isFinite(amount) ? amount : undefined,
    });
    const key = product ? `p:${product.id}` : `n:${groupingKey(ing.name)}|${canonicalUnit(ing.unit)}`;
    if (!keys.has(key)) continue;
    // "Salt to taste" or an amount that won't convert still uses some of it.
    const base = !isFinite(amount) || amount <= 0 ? null : product ? toBase(product, amount, ing.unit) : amount;
    out[key] = (out[key] ?? 0) + (base ?? 0.01);
  }
  return out;
}

/** What the meals already on a week use of the leftovers (so they aren't counted twice). */
export function weekUses(
  plan: MealPlan | undefined,
  recipes: Recipe[],
  leftovers: Leftover[],
  catalog: Catalog,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!plan || !leftovers.length) return out;
  const keys = new Set(leftovers.map((l) => l.key));
  for (const input of planIngredientInputs(plan, recipes)) {
    const amount = parseAmount(input.amount);
    if (!isFinite(amount) || amount <= 0) continue;
    const product = matchProduct(catalog, input.name, {
      groceryId: input.groceryId ?? undefined,
      unit: input.unit ?? undefined,
      amount,
    });
    const key = product ? `p:${product.id}` : `n:${groupingKey(input.name)}|${canonicalUnit(input.unit)}`;
    if (!keys.has(key)) continue;
    const base = product ? toBase(product, amount, input.unit) : amount;
    if (base !== null) out[key] = (out[key] ?? 0) + base;
  }
  return out;
}

interface State {
  remaining: Map<string, number>;
  taken: Set<string>;
  freezerSpare: Map<string, number>;
}

function startState(ctx: AutoPlanContext): State {
  return {
    remaining: new Map(ctx.leftovers.map((l) => [l.key, l.amount - (ctx.alreadyUses?.[l.key] ?? 0)])),
    taken: new Set(ctx.plannedRecipeIds),
    freezerSpare: new Map(ctx.freezer.map((g) => [g.key, g.spare])),
  };
}

function take(state: State, pick: DayPick) {
  for (const [k, v] of Object.entries(pick.uses)) state.remaining.set(k, (state.remaining.get(k) ?? 0) - v);
  if (pick.recipeId && pick.kind === 'recipe') state.taken.add(pick.recipeId);
  if (pick.freezerKey) state.taken.add(`freezer:${pick.freezerKey}`);
  if (pick.kind === 'freezer' && pick.freezerKey) {
    state.freezerSpare.set(pick.freezerKey, (state.freezerSpare.get(pick.freezerKey) ?? 0) - (pick.portions ?? 0));
  }
}

/** Every possible meal for a day, best first. */
function candidates(day: string, answers: AutoPlanAnswers, ctx: AutoPlanContext, state: State): DayPick[] {
  const busy = answers.busyDays.includes(day);
  const seed = ctx.seed ?? 0;
  const people = Math.max(1, answers.people);
  const byKey = new Map(ctx.leftovers.map((l) => [l.key, l]));
  // Quick meals are worth keeping for busy nights still to come that the freezer won't cover.
  const busyLater = answers.days.filter(
    (d) => answers.busyDays.includes(d) && WEEK_DAYS.indexOf(d) > WEEK_DAYS.indexOf(day),
  ).length;
  const freezerMeals = answers.useFreezer
    ? [...state.freezerSpare.values()].reduce((n, spare) => n + Math.floor(Math.max(0, spare) / people), 0)
    : 0;
  const saveQuick = !busy && busyLater > freezerMeals;

  const out: DayPick[] = [];
  if (busy && answers.useFreezer) {
    for (const g of ctx.freezer) {
      if ((state.freezerSpare.get(g.key) ?? 0) < people || state.taken.has(`freezer:${g.key}`)) continue;
      const ago = frozenAgo(g.oldest, ctx.today);
      out.push({
        day,
        kind: 'freezer',
        ...(g.recipeId ? { recipeId: g.recipeId } : {}),
        freezerKey: g.key,
        batchId: g.batches[0]?.id,
        name: g.name,
        reasons: [`From the freezer${ago ? `, frozen ${ago}` : ''}`, ...(g.useSoon ? ['Use soon'] : [])],
        portions: people,
        uses: {},
        score: 20 + (g.useSoon ? 2 : 0) + g.ageDays / 365,
      });
    }
  }

  for (const r of ctx.recipes) {
    if (!r?.id || r.verdict === 'not_for_us' || state.taken.has(r.id)) continue;
    const minutes = totalMinutes(r);
    const quick = minutes !== null && minutes <= QUICK_MINUTES;
    if (busy && !quick) continue;

    // Using up what's left
    const uses = recipeUses(r, people, ctx.leftovers, ctx.catalog);
    let use = 0;
    const usedNames: string[] = [];
    for (const [key, amount] of Object.entries(uses)) {
      const left = state.remaining.get(key) ?? 0;
      const l = byKey.get(key);
      if (!l || left <= 0 || amount <= 0) continue;
      use += urgency(l) * Math.min(1, amount / left);
      usedNames.push(l.name.toLowerCase());
    }

    // What you think of it
    const stars = averageStars(ratingsFor(ctx.ratings, r.id));
    const liked = !!r.favourite || r.verdict === 'again' || (stars ?? 0) >= 4;
    let like = 0;
    if (stars !== null) like += (stars - 3) * 1.2;
    if (r.favourite) like += 1.5;
    if (r.verdict === 'again') like += 1.5;
    if (answers.mood === 'favourites' && !liked) like -= 4;

    // How recently you had it (or have it coming up)
    const h = ctx.history.get(r.id);
    const near = [h?.lastHad, h?.nextPlanned]
      .filter((d): d is string => !!d)
      .map((d) => Math.abs(daysBetween(d, ctx.weekStart)));
    const gap = near.length ? Math.min(...near) : null;
    let fresh = 0;
    if (gap === null) fresh += answers.mood === 'new' ? 3 : answers.mood === 'favourites' ? -1 : 0.3;
    else if (gap < 7) fresh -= 5;
    else if (gap < 14) fresh -= 2.5;
    else if (gap > 42) fresh += answers.mood === 'new' ? 1.5 : 0.8;

    const reasons: string[] = [];
    if (usedNames.length) reasons.push(`Uses your ${andList(usedNames.slice(0, 3))}`);
    if (r.favourite) reasons.push('A favourite');
    else if (r.verdict === 'again') reasons.push('You said have it again');
    else if (stars !== null && stars >= 4) reasons.push(`Rated ${stars} stars`);
    if (h?.lastHad && gap !== null && gap > 42) reasons.push(`Last had ${formatAgo(h.lastHad, ctx.today)}`);
    else if (gap === null) reasons.push('Not had it yet');
    if (busy && minutes !== null) reasons.push(`Quick: ${formatMinutes(minutes)}`);

    out.push({
      day,
      kind: 'recipe',
      recipeId: r.id,
      name: r.name,
      reasons,
      uses,
      score: use * 4 + like + fresh + (saveQuick && quick ? -1 : 0) + jitter(seed, r.id) * 0.6,
    });
  }

  // A busy night with nothing quick: the quickest there is, saying so.
  if (busy && !out.length) {
    const quickest = ctx.recipes
      .filter((r) => r?.id && r.verdict !== 'not_for_us' && !state.taken.has(r.id) && totalMinutes(r) !== null)
      .sort((a, b) => (totalMinutes(a) ?? 0) - (totalMinutes(b) ?? 0))[0];
    if (quickest) {
      out.push({
        day,
        kind: 'recipe',
        recipeId: quickest.id,
        name: quickest.name,
        reasons: [`Your quickest: ${formatMinutes(totalMinutes(quickest) ?? 0)}`],
        uses: recipeUses(quickest, people, ctx.leftovers, ctx.catalog),
        score: 0,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** A meal for each of the days asked for (in week order), where there's one to suggest. */
export function suggestWeek(answers: AutoPlanAnswers, ctx: AutoPlanContext): DayPick[] {
  const state = startState(ctx);
  const picks: DayPick[] = [];
  for (const day of WEEK_DAYS.filter((d) => answers.days.includes(d))) {
    const [best] = candidates(day, answers, ctx, state);
    if (!best) continue;
    picks.push(best);
    take(state, best);
  }
  return picks;
}

/**
 * Something else for one day ("Another"), given the other days' picks: the best not in `skip`
 * (recipe ids, or "freezer:<dish>"). Null if there's nothing else.
 */
export function anotherPick(
  day: string,
  picks: DayPick[],
  answers: AutoPlanAnswers,
  ctx: AutoPlanContext,
  skip: string[],
): DayPick | null {
  const state = startState(ctx);
  for (const p of picks) if (p.day !== day) take(state, p);
  for (const s of skip) state.taken.add(s);
  return candidates(day, answers, ctx, state)[0] ?? null;
}

/** What identifies a pick in `skip`. */
export const pickId = (p: DayPick) => (p.kind === 'freezer' ? `freezer:${p.freezerKey}` : p.recipeId || p.name);

/** Leftovers the picks (and the meals already planned) hardly touch: at least half of it still left. */
export function unusedLeftovers(leftovers: Leftover[], picks: DayPick[], alreadyUses?: Record<string, number>) {
  return leftovers.filter((l) => {
    const used = (alreadyUses?.[l.key] ?? 0) + picks.reduce((n, p) => n + (p.uses[l.key] ?? 0), 0);
    return l.amount - used >= l.amount * 0.5;
  });
}

/**
 * The picks as meals on the week (cooked fresh for `people`, or from the freezer). Only empty days
 * are filled, and the days in `replace` (Auto populate from a day's "Select meal"): any other day
 * given a meal meanwhile (on the other phone, say) keeps it. Leftover days that relied on a replaced
 * meal become fresh cooks (`freshDays`).
 */
export function fillDays(
  days: Record<string, DayPlan>,
  picks: DayPick[],
  people: number,
  { replace = [], newId = () => crypto.randomUUID() }: { replace?: string[]; newId?: () => string } = {},
): { days: Record<string, DayPlan>; added: number; replaced: PlannedMeal[]; freshDays: string[] } {
  let out = { ...days };
  let added = 0;
  const replaced: PlannedMeal[] = [];
  for (const pick of picks) {
    const dp = out[pick.day] || { date: '', meals: [] };
    const was = dp.meals?.[0];
    if ((was && !replace.includes(pick.day)) || (pick.kind === 'recipe' && !pick.recipeId)) continue;
    if (was) replaced.push(was);
    const meal: PlannedMeal =
      pick.kind === 'freezer'
        ? {
            id: newId(),
            type: 'batch',
            batchId: pick.batchId,
            ...(pick.recipeId ? { recipeId: pick.recipeId } : {}),
            name: `Batch: ${pick.name}`,
            servings: people,
            note: '',
          }
        : { id: newId(), type: 'recipe', recipeId: pick.recipeId, name: pick.name, servings: people };
    out[pick.day] = { ...dp, meals: [meal] };
    added++;
  }
  let freshDays: string[] = [];
  if (replaced.length) ({ days: out, freshDays } = relinkLeftovers(out));
  return { days: out, added, replaced, freshDays };
}
