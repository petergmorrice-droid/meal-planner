/**
 * "Select meal for <day>": search, cooked earlier this week, quick options (and Auto populate, which
 * suggests one for the day), freezer batches, the cook book.
 */
import { ChefHat, Plus, RotateCcw, Search, ShoppingBag, Snowflake, Utensils, WandSparkles, X } from 'lucide-react';
import { BatchItem, Recipe } from '../../types';

export type QuickMeal = 'takeout' | 'eating_out' | 'no_meal';

export default function DayPickerModal({
  day,
  replacing,
  recipes,
  search,
  onSearch,
  earlier,
  others,
  batches,
  onRecipe,
  onQuick,
  onBatch,
  onAutoPopulate,
  onClose,
}: {
  day: string;
  /** The day has a meal already (this replaces it). */
  replacing: boolean;
  /** The whole cook book. */
  recipes: Recipe[];
  search: string;
  onSearch: (text: string) => void;
  /** Cooked in the few days before (likely leftovers), nearest first. */
  earlier: { recipe: Recipe; day: string }[];
  /** The rest of the book, A–Z. */
  others: Recipe[];
  batches: BatchItem[];
  onRecipe: (recipe: Recipe) => void;
  onQuick: (type: QuickMeal) => void;
  onBatch: (batchId: string) => void;
  /** Auto populate this day (left out where it isn't offered). */
  onAutoPopulate?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center px-4 pt-[max(1rem,6vh)] pb-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150 max-h-[86vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Select Meal for {day}</h3>
            <p className="text-xs text-zinc-500">
              {replacing ? 'Replaces the meal already on this day' : 'Pick a recipe or a quick option'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
          {recipes.length > 6 && (
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                inputMode="search"
                autoComplete="off"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search recipes or ingredients"
                aria-label="Search recipes"
                enterKeyHint="search"
                className="w-full h-11 pl-9 pr-9 rounded-xl border border-zinc-200 bg-zinc-50 text-base sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-200/70 flex items-center justify-center cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {earlier.length > 0 && (
            <div data-picker-earlier>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 block mb-1.5">
                Cooked earlier this week
              </span>
              <div className="space-y-1.5">
                {earlier.map(({ recipe: r, day: cookedOn }) => (
                  <button
                    key={`earlier-${r.id}`}
                    type="button"
                    onClick={() => onRecipe(r)}
                    className="w-full text-left p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 flex items-center justify-between gap-2 transition-colors text-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-zinc-900 block truncate">{r.name}</span>
                        <span className="text-xs text-zinc-600">{cookedOn}: leftovers or cook again</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick choices */}
          {!search.trim() && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">
                Quick Options
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onQuick('takeout')}
                  className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-100/80 text-orange-600 flex items-center justify-center transition-transform group-hover:scale-110">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-xs text-zinc-900 leading-tight">Takeaway</span>
                  <span className="text-[11px] text-zinc-400">Add note</span>
                </button>
                <button
                  type="button"
                  onClick={() => onQuick('eating_out')}
                  className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-110">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-xs text-zinc-900 leading-tight">Eating out</span>
                  <span className="text-[11px] text-zinc-400">Add note</span>
                </button>
                <button
                  type="button"
                  onClick={() => onQuick('no_meal')}
                  className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-200/80 text-zinc-600 flex items-center justify-center transition-transform group-hover:scale-110">
                    <X className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-xs text-zinc-900 leading-tight">No Meal</span>
                  <span className="text-[11px] text-zinc-400">Add note</span>
                </button>
              </div>
              {onAutoPopulate && (
                <button
                  type="button"
                  onClick={onAutoPopulate}
                  className="mt-2 w-full text-left p-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 flex items-center gap-2.5 transition-colors cursor-pointer shadow-2xs"
                  data-picker-auto-populate
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                    <WandSparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-violet-950 block">Auto populate</span>
                    <span className="block text-xs leading-snug text-violet-900/80">
                      Suggests a meal for {day} from your cookbook, or a new one from Gemini
                    </span>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Freezer batches, if any */}
          {batches.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
                Freezer Batches
              </span>
              <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                {batches.map((batch: BatchItem) => {
                  const recipe = batch.recipeId ? recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
                  const displayName = batch.name || recipe?.name || 'Freezer Batch';
                  return (
                    <button
                      key={batch.id}
                      onClick={() => onBatch(batch.id)}
                      className="w-full text-left p-3 hover:bg-zinc-50 text-xs text-zinc-800 flex justify-between items-center transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-100/80 text-cyan-700 flex items-center justify-center shrink-0">
                          <Snowflake className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-medium block text-zinc-900">{displayName}</span>
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Snowflake className="w-2.5 h-2.5 text-cyan-600" />
                            {batch.portions} {batch.portions === 1 ? 'portion' : 'portions'} available
                          </span>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-zinc-500" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* The cook book */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Cook Book Recipes
            </span>
            <div className="space-y-1.5" data-picker-recipes>
              {others.map((r: Recipe) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRecipe(r)}
                  className="w-full text-left p-2.5 rounded-xl border border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50 flex items-center justify-between gap-2 transition-colors text-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-900 block truncate">{r.name}</span>
                      <span className="text-xs text-zinc-500">{(r.prepTime || 0) + (r.cookTime || 0)} min</span>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
                </button>
              ))}
              {recipes.length === 0 && (
                <p className="text-sm text-zinc-500 italic py-2">No recipes in the cook book yet.</p>
              )}
              {recipes.length > 0 && others.length === 0 && earlier.length === 0 && batches.length === 0 && (
                <p className="text-sm text-zinc-500 py-2">No recipes match "{search.trim()}".</p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-zinc-600 font-medium hover:bg-zinc-100 rounded-xl transition-colors text-xs border border-zinc-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
