/**
 * "Select meal for <day>": its search, the recipes (anything cooked in the 3 days before first, as
 * likely leftovers, nearest first; then the rest of the book A–Z), and the freezer batches.
 */
import { useEffect, useMemo, useState } from 'react';
import { BatchItem, MealPlan, Recipe } from '../../types';
import { DAYS_OF_WEEK } from '../../utils';
import type { AppStore } from '../../store';

export function useDayPicker(store: AppStore, currentPlan: MealPlan | undefined, selectedDay: string | null) {
  const [pickerSearch, setPickerSearch] = useState('');
  useEffect(() => { setPickerSearch(''); }, [selectedDay]);

  const pickerRecipes = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matches = (r: Recipe) => !q ||
      r.name.toLowerCase().includes(q) ||
      r.tags?.some(t => t.toLowerCase().includes(q)) ||
      r.ingredients?.some(i => (i?.name || '').toLowerCase().includes(q));
    let all: Recipe[] = store.state.recipes.filter(matches).sort((a: Recipe, b: Recipe) => a.name.localeCompare(b.name));
    const earlier: { recipe: Recipe; day: string }[] = [];
    if (currentPlan && selectedDay) {
      const at = DAYS_OF_WEEK.indexOf(selectedDay);
      for (let i = at - 1; i >= Math.max(0, at - 3); i--) {
        const m = currentPlan.days[DAYS_OF_WEEK[i]]?.meals?.[0];
        if (!m || m.type !== 'recipe' || !m.recipeId || earlier.some(e => e.recipe.id === m.recipeId)) continue;
        const r = all.find((x: Recipe) => x.id === m.recipeId);
        if (r) earlier.push({ recipe: r, day: DAYS_OF_WEEK[i] });
      }
      all = all.filter((r: Recipe) => !earlier.some(e => e.recipe.id === r.id));
    }
    return { all, earlier };
  }, [store.state.recipes, pickerSearch, currentPlan, selectedDay]);

  const pickerBatches: BatchItem[] = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return store.state.batches;
    return store.state.batches.filter((b: BatchItem) => {
      const r = b.recipeId ? store.state.recipes.find((x: Recipe) => x.id === b.recipeId) : null;
      return (b.name || r?.name || '').toLowerCase().includes(q);
    });
  }, [store.state.batches, store.state.recipes, pickerSearch]);

  return { pickerSearch, setPickerSearch, pickerRecipes, pickerBatches };
}
