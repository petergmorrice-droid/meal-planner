/**
 * Star ratings: Peter and Rachel each rate a recipe 1 to 5 stars. Kept in preferences.ratings,
 * one entry per recipe per person, synced one rating at a time (see PREF_LISTS in syncMerge).
 */
import type { RecipeRating } from './types';

export type PersonRatings = { P?: number; R?: number };

/** Both people's stars for a recipe. */
export function ratingsFor(list: RecipeRating[] | undefined, recipeId: string): PersonRatings {
  const out: PersonRatings = {};
  for (const r of list || []) {
    if (r?.recipeId !== recipeId || !(r.stars >= 1)) continue;
    if (r.who === 'P' || r.who === 'R') out[r.who] = Math.min(5, Math.round(r.stars));
  }
  return out;
}

/** The two ratings averaged (one decimal), or null if nobody's rated it. */
export function averageStars(r: PersonRatings): number | null {
  const v = [r.P, r.R].filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/** Every rated recipe's average, for sorting by "Best rated". */
export function averagesById(list: RecipeRating[] | undefined): Map<string, number> {
  const ids = new Set((list || []).map((r) => r?.recipeId).filter(Boolean) as string[]);
  const out = new Map<string, number>();
  for (const id of ids) {
    const avg = averageStars(ratingsFor(list, id));
    if (avg !== null) out.set(id, avg);
  }
  return out;
}

/** The list with this person's rating set (0 takes it off). */
export function withRating(list: RecipeRating[] | undefined, recipeId: string, who: string, stars: number, todayIso?: string): RecipeRating[] {
  const id = `${recipeId}:${who}`;
  const rest = (list || []).filter((r) => r?.id !== id);
  if (!(stars >= 1)) return rest;
  return [...rest, { id, recipeId, who, stars: Math.min(5, Math.round(stars)), ...(todayIso ? { at: todayIso } : {}) }];
}
