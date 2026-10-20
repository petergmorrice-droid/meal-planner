/**
 * The meals at the top of Planning (Classic view): search, one-tap filters, sort, and what the
 * cards show. Also which view this phone uses: Classic (drag meals onto the week) or List.
 */
import { useMemo, useState } from 'react';
import { MealPlan, Recipe } from '../../types';
import { DAYS_OF_WEEK } from '../../utils';
import { averagesById } from '../../ratings';
import { cardFieldsFromPrefs } from '../RecipeCard';
import {
  recipeHistories, sortRecipes, readRecipeSort, saveRecipeSort, RecipeSort, todayISO, freezerPortions,
  recipeMatchesSearch, readFavouritesFirst, saveFavouritesFirst, matchesQuickFilters, QuickFilter,
} from '../../recipeInfo';

export type PlanningView = 'classic' | 'list';

/** Classic or List, and the cards' layout and fields (the view is this phone's; the rest is shared). */
export function usePlanningLayout(store: any) {
  const [planningView, setPlanningViewState] = useState<PlanningView>(() => {
    try { return localStorage.getItem('planning_view') === 'list' ? 'list' : 'classic'; } catch { return 'classic'; }
  });
  const setPlanningView = (view: PlanningView) => {
    setPlanningViewState(view);
    try { localStorage.setItem('planning_view', view); } catch { /* per-phone convenience only */ }
  };

  const prefs = store.state.preferences || {
    showPrepTime: true,
    showCookTime: true,
    showTotalTime: true,
    showMethod: true,
    showEmojis: true,
  };
  const mealRowsLayout: 1 | 2 = prefs.mealRowsLayout === 1 ? 1 : 2;
  const setMealRowsLayout = (layout: 1 | 2) => {
    store.updatePreferences({ mealRowsLayout: layout });
  };
  const cardFields = cardFieldsFromPrefs(prefs);

  return { planningView, setPlanningView, prefs, mealRowsLayout, setMealRowsLayout, cardFields };
}

export function useMealBrowser(store: any, currentPlan: MealPlan | undefined) {
  const [recipeSearch, setRecipeSearch] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  // Cards: when each recipe was last had / is next planned, in the order chosen on this phone.
  const today = todayISO();
  const recipeHistory = useMemo(() => recipeHistories(store.state.mealPlans, today), [store.state.mealPlans, today]);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const toggleQuickFilter = (f: QuickFilter) => setQuickFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const filteredRecipes: Recipe[] = useMemo(() => {
    return store.state.recipes.filter((r: Recipe) =>
      recipeMatchesSearch(r, recipeSearch) &&
      matchesQuickFilters(r, quickFilters, { history: recipeHistory.get(r.id), freezer: freezerPortions(r, store.state.batches), today }),
    );
  }, [store.state.recipes, recipeSearch, quickFilters, recipeHistory, store.state.batches, today]);
  const [recipeSort, setRecipeSortState] = useState<RecipeSort>(readRecipeSort);
  const setRecipeSort = (sort: RecipeSort) => { setRecipeSortState(sort); saveRecipeSort(sort); };
  const [favFirst, setFavFirstState] = useState<boolean>(readFavouritesFirst);
  const setFavFirst = (on: boolean) => { setFavFirstState(on); saveFavouritesFirst(on); };
  const ratingAverages = useMemo(() => averagesById(store.state.preferences?.ratings), [store.state.preferences?.ratings]);
  const sortedRecipes = useMemo(() => sortRecipes(filteredRecipes, recipeSort, recipeHistory, favFirst, ratingAverages), [filteredRecipes, recipeSort, recipeHistory, favFirst, ratingAverages]);

  // "This week: Tue" on cards for the week on screen.
  const daysInWeek = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!currentPlan) return m;
    DAYS_OF_WEEK.forEach((d) => (currentPlan!.days[d]?.meals || []).forEach((meal) => {
      if (!meal.recipeId) return;
      m.set(meal.recipeId, [...(m.get(meal.recipeId) || []), d.slice(0, 3)]);
    }));
    return m;
  }, [currentPlan]);

  /** Clear the search and filters (and close the search box). */
  const clearFilters = () => { setQuickFilters([]); setRecipeSearch(''); setIsSearchExpanded(false); };

  return {
    today, recipeSearch, setRecipeSearch, isSearchExpanded, setIsSearchExpanded, quickFilters, toggleQuickFilter, clearFilters,
    recipeHistory, filteredRecipes, sortedRecipes, recipeSort, setRecipeSort, favFirst, setFavFirst, daysInWeek,
  };
}
