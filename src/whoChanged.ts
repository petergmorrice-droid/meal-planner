/**
 * Who changed what, so the app can colour it: Peter blue, Rachel pink.
 *
 * Worked out when something is saved on a phone (the store calls these with that phone's person)
 * and kept on the thing itself, so it syncs with it:
 *  - shopping lines: `editedBy` (added it or changed the amount, name or note; ticking it doesn't
 *    count, that's `checkedBy`) and `noteBy`;
 *  - meals: each day's `updatedBy`, and a meal's `noteBy`;
 *  - freezer: `addedBy`, `lastModifiedBy`, `noteBy`;
 *  - recipes: `notesBy` for your own notes on it.
 */
import type { ShoppingListItem, DayPlan, PlannedMeal, BatchItem, Recipe } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const noteOf = (x: { note?: string } | undefined | null) => (x?.note || '').trim();

/** Changes that aren't "editing" a shopping line: ticking it, out of stock, the cupboard answer, and the bookkeeping. */
const SHOP_QUIET = new Set([
  'checked',
  'checkedBy',
  'outOfStock',
  'cupboard',
  'addedBy',
  'lastModifiedBy',
  'lastModifiedAt',
  'editedBy',
  'noteBy',
]);

export function stampShoppingItem(
  item: ShoppingListItem,
  before: ShoppingListItem | undefined,
  who: string,
): ShoppingListItem {
  if (!before) {
    const out: ShoppingListItem = { ...item, editedBy: item.editedBy || item.addedBy || who };
    if (noteOf(item)) out.noteBy = item.noteBy || who;
    return out;
  }
  const out: ShoppingListItem = { ...item };
  const keys = new Set([...Object.keys(item), ...Object.keys(before)]);
  let edited = false;
  for (const k of keys) {
    if (SHOP_QUIET.has(k)) continue;
    if (!same((item as unknown as Record<string, unknown>)[k], (before as unknown as Record<string, unknown>)[k])) {
      edited = true;
      break;
    }
  }
  if (edited) out.editedBy = who;
  else if (!out.editedBy && before.editedBy) out.editedBy = before.editedBy;
  if (noteOf(item) !== noteOf(before)) {
    if (noteOf(item)) out.noteBy = who;
    else delete out.noteBy;
  } else if (!out.noteBy && before.noteBy) out.noteBy = before.noteBy;
  return out;
}

/** A day without the "who" marks, to tell whether anything real changed. */
const dayContent = (d: DayPlan | undefined) =>
  d ? { ...d, updatedBy: undefined, meals: (d.meals || []).map(({ noteBy: _n, ...m }) => m) } : null;

/** The days of a week as saved on this phone: changed days get `updatedBy`, changed notes `noteBy`. */
export function stampPlanDays(
  days: Record<string, DayPlan>,
  before: Record<string, DayPlan> | undefined,
  who: string,
): Record<string, DayPlan> {
  const out: Record<string, DayPlan> = {};
  for (const [d, day] of Object.entries(days || {})) {
    const prev = before?.[d];
    if (!day || !(day.meals || []).length || same(dayContent(day), dayContent(prev))) {
      out[d] = day;
      continue;
    }
    out[d] = {
      ...day,
      updatedBy: who,
      meals: day.meals.map((m) =>
        stampMealNote(
          m,
          prev?.meals?.find((x) => x.id === m.id),
          who,
        ),
      ),
    };
  }
  return out;
}

function stampMealNote(meal: PlannedMeal, prev: PlannedMeal | undefined, who: string): PlannedMeal {
  if (noteOf(meal) !== noteOf(prev)) {
    if (noteOf(meal)) return { ...meal, noteBy: who };
    const { noteBy: _n, ...rest } = meal;
    return rest;
  }
  if (!meal.noteBy && prev?.noteBy) return { ...meal, noteBy: prev.noteBy };
  return meal;
}

export function stampBatch(batch: BatchItem, before: BatchItem | undefined, who: string): BatchItem {
  const out: BatchItem = { ...batch, addedBy: batch.addedBy || before?.addedBy || who, lastModifiedBy: who };
  if (noteOf(batch) !== noteOf(before)) {
    if (noteOf(batch)) out.noteBy = who;
    else delete out.noteBy;
  } else if (!out.noteBy && before?.noteBy) out.noteBy = before.noteBy;
  return out;
}

export function stampRecipeNotes(recipe: Recipe, before: Recipe | undefined, who: string): Recipe {
  const now = (recipe.notes || '').trim();
  if (now !== (before?.notes || '').trim()) {
    if (now) return { ...recipe, notesBy: who };
    const { notesBy: _n, ...rest } = recipe;
    return rest;
  }
  if (!recipe.notesBy && before?.notesBy) return { ...recipe, notesBy: before.notesBy };
  return recipe;
}

// ---------- Reading it back ----------

const handAdded = (p: ShoppingListItem) => p.isAdhoc && !p.isRecurring && !p.isBatch;

/** Who last added or changed what was added by hand to this row (undefined if nothing was, or nobody's known). */
export function handAddedBy(parts: ShoppingListItem[]): string | undefined {
  const mine = parts.filter(handAdded);
  if (!mine.length) return undefined;
  const latest = [...mine].sort((a, b) => (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0))[0];
  return latest.editedBy || latest.addedBy || undefined;
}

/** Who wrote the row's note (unknown for notes written before this was recorded). */
export function noteAuthor(parts: ShoppingListItem[]): string | undefined {
  const withNote = parts.filter((p) => noteOf(p));
  if (!withNote.length) return undefined;
  const latest = [...withNote].sort((a, b) => (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0))[0];
  return latest.noteBy || undefined;
}
