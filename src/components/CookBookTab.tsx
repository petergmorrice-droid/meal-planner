import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, SlidersHorizontal, BookOpen, Star, Clock, Leaf, Zap, Snowflake, History } from 'lucide-react';
import { Recipe } from '../types';
import CookMode from './CookMode';
import { RecipeModal } from './RecipePopup';
import { AddRecipe } from './AddRecipe';
import { RecipeCard, CARD_FIELD_OPTIONS, cardFieldsFromPrefs } from './RecipeCard';
import {
  recipeHistories, sortRecipes, readRecipeSort, saveRecipeSort, RecipeSort, RECIPE_SORTS, todayISO, freezerPortions,
  recipeMatchesSearch, matchesQuickFilters, QUICK_FILTERS, QuickFilter, readFavouritesFirst, saveFavouritesFirst,
} from '../recipeInfo';

type TabName = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';

const FILTER_ICON: Record<QuickFilter, React.ReactNode> = {
  favourites: <Star className="w-3.5 h-3.5" />,
  not_lately: <History className="w-3.5 h-3.5" />,
  quick: <Clock className="w-3.5 h-3.5" />,
  veggie: <Leaf className="w-3.5 h-3.5" />,
  ninja: <Zap className="w-3.5 h-3.5" />,
  freezer: <Snowflake className="w-3.5 h-3.5" />,
};

// The recipe pop-up lives in RecipePopup.tsx; other tabs import it from here.
export { RecipeModal } from './RecipePopup';

/**
 * The recipe book: search (names, ingredients and notes), one-tap filters, sort, and adding
 * recipes by pasting them, from a link, from a photo or by asking Gemini.
 */
export default function CookBookTab({
  store,
  onNavigateTab,
  onAddToDay,
  startAddWith,
  onStartAddHandled,
}: {
  store: any;
  onNavigateTab?: (tab: TabName) => void;
  onAddToDay?: (recipe: Recipe) => void;
  /** Text or a link shared to the app (Android): opens "Add a recipe" with it. */
  startAddWith?: string | null;
  onStartAddHandled?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<QuickFilter[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookModeRecipe, setCookModeRecipe] = useState<Recipe | null>(null);
  const [cookModeRecipePortions, setCookModeRecipePortions] = useState<number | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState<string | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!startAddWith) return;
    setAddText(startAddWith);
    setAddOpen(true);
    onStartAddHandled?.();
  }, [startAddWith]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  const prefs = store.state.preferences || {};
  const recipes: Recipe[] = store.state.recipes || [];
  const today = todayISO();
  const history = useMemo(() => recipeHistories(store.state.mealPlans, today), [store.state.mealPlans, today]);
  const [sort, setSortState] = useState<RecipeSort>(readRecipeSort);
  const setSort = (s: RecipeSort) => { setSortState(s); saveRecipeSort(s); };
  const [favFirst, setFavFirstState] = useState<boolean>(readFavouritesFirst);
  const setFavFirst = (on: boolean) => { setFavFirstState(on); saveFavouritesFirst(on); };

  const visible = useMemo(() => {
    const list = recipes.filter((r) =>
      recipeMatchesSearch(r, search) &&
      matchesQuickFilters(r, filters, { history: history.get(r.id), freezer: freezerPortions(r, store.state.batches), today }),
    );
    return sortRecipes(list, sort, history, favFirst);
  }, [recipes, search, filters, history, store.state.batches, today, sort, favFirst]);

  const cardFields = cardFieldsFromPrefs(prefs);
  const filtering = search.trim() !== '' || filters.length > 0;
  const toggleFilter = (f: QuickFilter) => setFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const clearAll = () => { setFilters([]); setSearch(''); setSearchOpen(false); };
  const noFavourites = !recipes.some((r) => r.favourite);

  return (
    <div className="h-full flex flex-col app-page relative">
      <div className="app-bar border-b shrink-0">
        <div className="px-4 pt-2.5 pb-2 flex items-center gap-2 min-h-[52px]">
          {searchOpen ? (
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipes, ingredients or notes"
                  aria-label="Search recipes"
                  className="w-full h-10 pl-9 pr-9 rounded-xl border border-zinc-300 bg-zinc-50 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-zinc-500 flex items-center justify-center cursor-pointer" aria-label="Clear search">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { setSearch(''); setSearchOpen(false); }} className="h-10 px-2 text-sm font-semibold text-zinc-700 cursor-pointer" aria-label="Close search">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <h1 className="text-lg font-bold text-zinc-900">Cookbook</h1>
                <span className="text-sm text-zinc-500" data-recipe-count>{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}</span>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-10 h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center cursor-pointer"
                aria-label="Search recipes"
                title="Search recipes"
              >
                <Search className="w-4 h-4" />
              </button>
            </>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer ${showOptions ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'}`}
              aria-label="Sort and display options"
              title="Sort and display options"
              aria-expanded={showOptions}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {showOptions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowOptions(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-140px)] overflow-y-auto bg-white rounded-2xl border border-zinc-200 shadow-2xl z-50 p-3 space-y-4" data-cookbook-options>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 block mb-1.5">Sort</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {RECIPE_SORTS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          data-sort={o.id}
                          onClick={() => setSort(o.id)}
                          className={`h-10 px-2 rounded-lg text-sm font-semibold border cursor-pointer ${sort === o.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 mt-2 px-1 py-1.5 text-sm text-zinc-800 cursor-pointer">
                      <input type="checkbox" checked={favFirst} onChange={(e) => setFavFirst(e.target.checked)} className="rounded border-zinc-300" data-fav-first />
                      Favourites first
                    </label>
                  </div>
                  <div className="pt-3 border-t border-zinc-100">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 block mb-1">Show on cards</span>
                    {CARD_FIELD_OPTIONS.map(({ pref, label }) => (
                      <label key={pref} className="flex items-center gap-2 px-1 py-1.5 text-sm text-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(prefs as any)[pref] !== false}
                          onChange={() => store.updatePreferences({ [pref]: (prefs as any)[pref] === false })}
                          className="rounded border-zinc-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* One-tap filters */}
        {recipes.length > 0 && (
        <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Filters" data-quick-filters>
          {QUICK_FILTERS.map(({ id, label }) => {
            const on = filters.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleFilter(id)}
                aria-pressed={on}
                data-filter={id}
                className={`shrink-0 h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-zinc-700 border-zinc-300'
                }`}
              >
                {FILTER_ICON[id]}{label}
              </button>
            );
          })}
        </div>
        )}
        {filtering && (
          <div className="px-4 pb-2 -mt-0.5 flex items-center gap-2 text-sm text-zinc-600" data-filter-status>
            <span>{visible.length} of {recipes.length} recipes</span>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={clearAll} className="font-semibold text-emerald-800 underline underline-offset-2 cursor-pointer">Clear</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        {recipes.length === 0 ? (
          <div className="max-w-sm mx-auto mt-10 text-center bg-white border border-zinc-200 rounded-2xl p-6" data-empty-cookbook>
            <BookOpen className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
            <h2 className="text-base font-bold text-zinc-900">Your cookbook is empty</h2>
            <p className="text-sm text-zinc-600 mt-1">Add a recipe by pasting it, pasting a link to it, or taking a photo of a cookbook page.</p>
            <button type="button" onClick={() => setAddOpen(true)} className="mt-4 h-11 px-4 rounded-xl bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" />Add your first recipe
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="max-w-sm mx-auto mt-10 text-center" data-no-match>
            <p className="text-base font-semibold text-zinc-900">No recipes match</p>
            <p className="text-sm text-zinc-600 mt-1">
              {filters.includes('favourites') && noFavourites
                ? 'No favourites yet: open a recipe and tap "Add to favourites".'
                : search.trim()
                  ? `Nothing has "${search.trim()}" in its name, ingredients or notes${filters.length ? ' with these filters' : ''}.`
                  : 'Try fewer filters.'}
            </p>
            <button type="button" onClick={clearAll} className="mt-3 h-10 px-4 rounded-xl border border-zinc-300 bg-white text-sm font-semibold cursor-pointer">Clear search and filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 pb-24">
            {visible.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                fields={cardFields}
                history={history.get(recipe.id)}
                freezer={freezerPortions(recipe, store.state.batches)}
                today={today}
                onOpen={() => setSelectedRecipe(recipe)}
              />
            ))}
          </div>
        )}
      </div>

      {recipes.length > 0 && (
        <button
          type="button"
          onClick={() => { setAddText(undefined); setAddOpen(true); }}
          className="fixed bottom-20 right-4 z-30 h-12 pl-4 pr-5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-base font-semibold shadow-lg inline-flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          data-add-recipe-button
        >
          <Plus className="w-5 h-5" />Add recipe
        </button>
      )}

      {selectedRecipe && (
        <RecipeModal
          store={store}
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onStartCook={(servings) => {
            setCookModeRecipe(selectedRecipe);
            setCookModeRecipePortions(servings);
            setSelectedRecipe(null);
          }}
          onAddToDay={onAddToDay ? (r) => { setSelectedRecipe(null); onAddToDay(r); } : undefined}
          onNavigateTab={onNavigateTab}
        />
      )}

      {cookModeRecipe && (
        <CookMode
          store={store}
          dayName="Cookbook"
          meals={[{
            id: 'cookbook-temp',
            recipeId: cookModeRecipe.id,
            name: cookModeRecipe.name,
            type: 'recipe',
            servings: cookModeRecipePortions || cookModeRecipe.servings || 2
          }]}
          initialActiveMealId="cookbook-temp"
          onClose={() => {
            setCookModeRecipe(null);
            setCookModeRecipePortions(undefined);
          }}
          initialServings={cookModeRecipePortions}
        />
      )}

      {addOpen && (
        <AddRecipe
          store={store}
          initialText={addText}
          onClose={() => { setAddOpen(false); setAddText(undefined); }}
          onSaved={(recipe) => { setAddOpen(false); setAddText(undefined); setSelectedRecipe(recipe); }}
          onNavigateTab={onNavigateTab}
        />
      )}
    </div>
  );
}
