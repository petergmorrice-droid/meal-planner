import { useState } from 'react';
import { RatingRows } from '../Stars';
import { ratingsFor, withRating } from '../../ratings';
import { ChefHat, Plus, Minus, Check, Snowflake, Refrigerator, NotebookPen } from 'lucide-react';
import { Recipe, PlannedMeal } from '../../types';
import { freezePortionsFromNote } from '../../cookInfo';
import type { AppStore } from '../../store';

/**
 * The end of cooking: what to do with what's left (fridge for later leftovers, freezer for a
 * batch), how it was (have it again / not for us), a note for next time (saved to the recipe),
 * then tick it as cooked.
 */
export function FinishedScreen({
  store,
  recipe,
  meal,
  dayName,
  servings,
  plannedMeal,
  fridge,
  onBack,
  onDone,
}: {
  store: AppStore;
  recipe: Recipe;
  meal: PlannedMeal;
  dayName: string;
  servings: number;
  /** A meal on the plan (so it can be ticked as cooked). */
  plannedMeal: boolean;
  fridge: { portions: number; days: string[] } | null;
  onBack: () => void;
  onDone: (result: { markCooked: boolean; froze?: { batchId: string; portions: number } }) => void;
}) {
  const fromNote = freezePortionsFromNote(meal.note) ?? 0;
  const [freeze, setFreeze] = useState<number>(fromNote);
  const [note, setNote] = useState('');
  // Your stars (saved straight away; the other person's are shown as they left them).
  const ratings = ratingsFor(store.state?.preferences?.ratings, recipe.id);
  const rate = (stars: number) => {
    store.updatePreferences((p) => ({
      ratings: withRating(p.ratings, recipe.id, store.currentUser || 'P', stars, new Date().toISOString().slice(0, 10)),
    }));
  };
  const isCook = meal.type === 'recipe';

  const finish = (markCooked: boolean) => {
    let froze: { batchId: string; portions: number } | undefined;
    if (isCook && freeze > 0 && store.addBatch) {
      const batchId = crypto.randomUUID();
      store.addBatch({
        id: batchId,
        name: recipe.name,
        recipeId: recipe.id,
        portions: freeze,
        dateAdded: new Date().toISOString(),
      });
      froze = { batchId, portions: freeze };
    }
    const trimmed = note.trim();
    if (trimmed) {
      // Added to the recipe's notes as they are now (the other phone may have added one meanwhile).
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      store.changeRecipe(recipe.id, (r) => ({
        ...r,
        notes: [r.notes?.trim(), `${date}: ${trimmed}`].filter(Boolean).join('\n'),
      }));
    }
    onDone({ markCooked, froze });
  };

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200" data-finished>
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 text-center">{recipe.name} is done</h2>
          <p className="text-sm text-zinc-500 text-center mt-1">
            for {servings}
            {dayName && dayName !== 'Cookbook' ? ` · ${dayName}` : ''}
          </p>

          <div className="mt-6 space-y-3">
            {fridge && (
              <div
                className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3"
                data-finished-fridge
              >
                <Refrigerator className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <p className="text-[15px] text-blue-950">
                  Put{' '}
                  <strong>
                    {fridge.portions} {fridge.portions === 1 ? 'portion' : 'portions'}
                  </strong>{' '}
                  in the fridge for {fridge.days.join(' and ')}.
                </p>
              </div>
            )}

            {isCook && (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3" data-finished-freeze>
                <div className="flex items-center gap-3">
                  <Snowflake className="w-5 h-5 text-cyan-700 shrink-0" />
                  <span className="flex-1 text-[15px] text-cyan-950 font-semibold">
                    {freeze > 0 ? `Freeze ${freeze} ${freeze === 1 ? 'portion' : 'portions'}` : 'Freeze some?'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFreeze((n) => Math.max(0, n - 1))}
                      disabled={freeze <= 0}
                      className="w-10 h-10 rounded-xl border border-cyan-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      aria-label="One fewer portion to freeze"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums" data-freeze-count>
                      {freeze}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFreeze((n) => Math.min(24, n + 1))}
                      className="w-10 h-10 rounded-xl border border-cyan-300 bg-white flex items-center justify-center cursor-pointer"
                      aria-label="One more portion to freeze"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {freeze > 0 && (
                  <p className="text-xs text-cyan-900/80 mt-1.5 pl-8">They'll be added to the Freezer tab.</p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 px-4 py-3" data-finished-rating>
              <p className="text-[15px] font-semibold text-zinc-900 mb-1">How was it?</p>
              <RatingRows ratings={ratings} me={store.currentUser || 'P'} onRate={rate} size="lg" />
            </div>

            <label className="block rounded-2xl border border-zinc-200 px-4 py-3">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900 mb-1.5">
                <NotebookPen className="w-4 h-4" /> Note for next time
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. needed more chilli, 10 mins less in the oven"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-[15px] outline-none focus:border-emerald-500"
                data-finished-note
              />
              <span className="text-xs text-zinc-500 mt-1 block">Saved to the recipe's notes.</span>
            </label>
          </div>
        </div>
      </div>
      <div
        className="shrink-0 border-t border-zinc-200 px-5 py-3 space-y-2"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto space-y-2">
          <button
            type="button"
            onClick={() => finish(plannedMeal)}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            data-finished-done
          >
            <Check className="w-4 h-4" /> {plannedMeal ? 'Done: tick it as cooked' : 'Done'}
          </button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-zinc-500 cursor-pointer py-1"
              data-finished-back
            >
              Back to the steps
            </button>
            {plannedMeal && (
              <button
                type="button"
                onClick={() => finish(false)}
                className="text-sm font-medium text-zinc-500 cursor-pointer py-1"
              >
                Done, don't tick it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
