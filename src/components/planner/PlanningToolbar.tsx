/**
 * Planning's title row: search and one-tap filters (Classic), or just the title (List); the view
 * options on the right (Classic or List, rows of 1 or 2, sort, what the cards show).
 */
import React, { useRef } from 'react';
import { Columns2, Eye, Rows, Search, X } from 'lucide-react';
import { CARD_FIELD_OPTIONS } from '../RecipeCard';
import { RECIPE_SORTS, RecipeSort, QUICK_FILTERS, QuickFilter } from '../../recipeInfo';
import type { PlanningView } from './useMealBrowser';

export default function PlanningToolbar({
  planningView, onPlanningView, searchOpen, onSearchOpen, search, onSearch, quickFilters, onToggleFilter,
  optionsOpen, onOptionsOpen, mealRowsLayout, onMealRowsLayout, recipeSort, onRecipeSort, favFirst, onFavFirst, prefs, onCardPref,
}: {
  planningView: PlanningView;
  onPlanningView: (view: PlanningView) => void;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  search: string;
  onSearch: (text: string) => void;
  quickFilters: QuickFilter[];
  onToggleFilter: (f: QuickFilter) => void;
  optionsOpen: boolean;
  onOptionsOpen: (open: boolean) => void;
  mealRowsLayout: 1 | 2;
  onMealRowsLayout: (layout: 1 | 2) => void;
  recipeSort: RecipeSort;
  onRecipeSort: (sort: RecipeSort) => void;
  favFirst: boolean;
  onFavFirst: (on: boolean) => void;
  /** The shared preferences (which fields the cards show). */
  prefs: any;
  /** Turn a card field on or off. */
  onCardPref: (pref: string) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`app-bar border-b px-3 sm:px-5 py-2 shrink-0 relative ${optionsOpen ? 'z-35' : 'z-10'}`}>
      <div className="flex items-center gap-2">
        {planningView === 'classic' ? (
          searchOpen ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Search meals, ingredients or notes"
                  aria-label="Search meals"
                  className="w-full h-9 pl-9 pr-8 rounded-xl border border-zinc-300 bg-zinc-50 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
                />
                {search && (
                  <button type="button" onClick={() => onSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-zinc-500 flex items-center justify-center cursor-pointer" aria-label="Clear search">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { onSearch(''); onSearchOpen(false); }} className="h-9 px-1.5 text-sm font-semibold text-zinc-700 cursor-pointer" aria-label="Close search">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { onSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                className="w-9 h-9 rounded-xl border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center shrink-0 cursor-pointer"
                title="Search meals"
                aria-label="Search meals"
              >
                <Search className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Filters" data-quick-filters>
                {QUICK_FILTERS.map(({ id, label }) => {
                  const on = quickFilters.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggleFilter(id)}
                      aria-pressed={on}
                      data-filter={id}
                      className={`shrink-0 h-9 px-3 rounded-full border text-sm font-semibold cursor-pointer transition-colors ${
                        on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-zinc-700 border-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )
        ) : (
          <h1 className="flex-1 text-lg font-bold text-zinc-900">Planning</h1>
        )}

        {/* View options */}
        <div className="relative">
          <button
            type="button"
            onClick={() => onOptionsOpen(!optionsOpen)}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              optionsOpen
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
            }`}
            title="View options"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {optionsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => onOptionsOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 max-h-[calc(100vh-140px)] overflow-y-auto bg-white rounded-2xl border border-zinc-200/90 shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2">
                {/* View: Classic (drag and drop) or List (tap a day) */}
                <div className="px-1 mb-3">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">View</span>
                  <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl">
                    {(['classic', 'list'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        id={`planning-view-${v}`}
                        onClick={() => { onPlanningView(v); onOptionsOpen(false); }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          planningView === v ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        {v === 'classic' ? 'Classic' : 'List'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">
                    {planningView === 'classic' ? 'Drag meals onto the week below.' : 'Tap a day to choose its meal.'}
                  </p>
                </div>

                {planningView === 'classic' && (<>
                {/* Rows of 2 or 1 */}
                <div className="px-1 mb-2">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Display Rows
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => onMealRowsLayout(2)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        mealRowsLayout === 2
                          ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      title="Rows of 2"
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      <span>Rows of 2</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMealRowsLayout(1)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        mealRowsLayout === 1
                          ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      title="Rows of 1"
                    >
                      <Rows className="w-3.5 h-3.5" />
                      <span>Rows of 1</span>
                    </button>
                  </div>
                </div>

                <div className="px-1 mb-2 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">Sort</span>
                  <div className="grid grid-cols-2 gap-1">
                    {RECIPE_SORTS.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        data-sort={o.id}
                        onClick={() => onRecipeSort(o.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          recipeSort === o.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 mt-1.5 px-1 py-1 text-xs font-medium text-zinc-700 cursor-pointer">
                    <input type="checkbox" checked={favFirst} onChange={(e) => onFavFirst(e.target.checked)} className="rounded border-zinc-300" />
                    Favourites first
                  </label>
                </div>

                <div className="px-1 py-1 mb-1 border-t border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Show on cards</span>
                </div>
                <div className="space-y-0.5">
                  {CARD_FIELD_OPTIONS.map(({ pref, label }) => (
                    <label key={pref} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefs[pref] !== false}
                        onChange={() => onCardPref(pref)}
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="text-xs font-medium text-zinc-700">{label}</span>
                    </label>
                  ))}
                </div>
                </>)}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
