import { useState, useMemo } from 'react';
import { X, Search, Plus, Minus, Check, Clock, ArrowLeft, Utensils, ChefHat, Sparkles, BookOpen } from 'lucide-react';
import { Recipe } from '../types';
import { convertToShoppingQuantity } from '../utils';
import type { AppStore } from '../store';
import { EMPTY_LIST } from '../emptyList';

interface BatchMealModalProps {
  store: AppStore;
  onClose: () => void;
  onAdd: (
    mealName: string,
    ingredients: { name: string; amount: number; unit: string; category?: string }[],
    options?: {
      recipeId?: string;
      portions?: number;
      alsoAddToFreezer?: boolean;
    },
  ) => void;
  weekLabel: string;
}

interface ScaledIngredientItem {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
  selected: boolean;
  baseAmount: number;
  baseUnit: string;
}

export default function BatchMealModal({ store, onClose, onAdd, weekLabel }: BatchMealModalProps) {
  const [activeTab, setActiveTab] = useState<'cookbook' | 'custom'>('cookbook');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Selected recipe state
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [portions, setPortions] = useState<number>(4);
  const [alsoAddToFreezer, setAlsoAddToFreezer] = useState<boolean>(false);

  // Scaled ingredients editable list
  const [ingredientList, setIngredientList] = useState<ScaledIngredientItem[]>([]);

  // Custom meal state
  const [customMealName, setCustomMealName] = useState('');
  const [customPortions, setCustomPortions] = useState(4);
  const [customIngredientLines, setCustomIngredientLines] = useState<
    { id: string; name: string; amount: number; unit: string; category: string }[]
  >([{ id: '1', name: '', amount: 1, unit: 'item', category: 'Produce' }]);

  const recipes: Recipe[] = store?.state?.recipes || EMPTY_LIST;

  // Extract all unique tags from recipes
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    recipes.forEach((r) => {
      r.tags?.forEach((t) => tags.add(t));
    });
    return Array.from(tags);
  }, [recipes]);

  // Filter recipes based on search and tag
  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        recipe.name.toLowerCase().includes(q) ||
        (recipe.description && recipe.description.toLowerCase().includes(q)) ||
        recipe.ingredients.some((ing) => ing.name.toLowerCase().includes(q));

      const matchesTag =
        selectedTag === 'all' ||
        (selectedTag === 'vegetarian' && (recipe.isVegetarian || recipe.isVegan)) ||
        (selectedTag === 'quick' && (recipe.prepTime || 0) + (recipe.cookTime || 0) <= 30) ||
        recipe.tags?.some((t) => t.toLowerCase() === selectedTag.toLowerCase());

      return matchesSearch && matchesTag;
    });
  }, [recipes, searchTerm, selectedTag]);

  // When a recipe is selected, initialize portions and scaled ingredients
  const handleSelectRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
    // Starts at the recipe's own number of people; change it for a batch cook or a crowd.
    const defaultPortions = baseServings;
    setPortions(defaultPortions);
    buildScaledIngredients(recipe, defaultPortions);
  };

  // Build scaled ingredients based on portions
  const buildScaledIngredients = (recipe: Recipe, currentPortions: number) => {
    const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
    const scale = currentPortions / baseServings;

    const items: ScaledIngredientItem[] = recipe.ingredients.map((ing, idx) => {
      const baseNum =
        typeof ing.amount === 'number' && !isNaN(ing.amount) ? ing.amount : parseFloat(String(ing.amount)) || 1;
      const rawScaled = Math.max(0.1, Math.round(baseNum * scale * 100) / 100);

      const converted = convertToShoppingQuantity(ing.name, rawScaled, ing.unit || '', ing.category || '');

      return {
        id: ing.id || `ing-${idx}`,
        name: ing.name,
        amount: converted.amount,
        unit: converted.unit || ing.unit || '',
        category: ing.category || converted.category || 'Other',
        selected: true,
        baseAmount: baseNum,
        baseUnit: ing.unit || '',
      };
    });

    setIngredientList(items);
  };

  // Handle portion changes when a recipe is active
  const handlePortionChange = (newPortions: number) => {
    const safePortions = Math.max(1, Math.min(30, newPortions));
    setPortions(safePortions);
    if (selectedRecipe) {
      const baseServings = selectedRecipe.servings && selectedRecipe.servings > 0 ? selectedRecipe.servings : 2;
      const scale = safePortions / baseServings;

      setIngredientList((prev) =>
        prev.map((item) => {
          const rawScaled = Math.max(0.1, Math.round(item.baseAmount * scale * 100) / 100);
          const converted = convertToShoppingQuantity(item.name, rawScaled, item.baseUnit, item.category);
          return {
            ...item,
            amount: converted.amount,
            unit: converted.unit || item.baseUnit,
          };
        }),
      );
    }
  };

  // Toggle individual ingredient selection
  const toggleIngredientSelection = (id: string) => {
    setIngredientList((prev) => prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
  };

  // Select all or deselect all ingredients
  const toggleSelectAll = (select: boolean) => {
    setIngredientList((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  // Adjust amount for a specific ingredient
  const handleAdjustIngredientAmount = (id: string, delta: number) => {
    setIngredientList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const step = item.amount >= 100 ? 50 : item.amount >= 10 ? 5 : 1;
          const nextAmount = Math.max(0.5, Math.round((item.amount + delta * step) * 10) / 10);
          return { ...item, amount: nextAmount };
        }
        return item;
      }),
    );
  };

  // Submit recipe batch ingredients to shopping list
  const handleSubmitRecipeBatch = () => {
    if (!selectedRecipe) return;

    const selectedIngredients = ingredientList
      .filter((item) => item.selected && item.amount > 0)
      .map((item) => ({
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category,
      }));

    if (selectedIngredients.length === 0) return;

    onAdd(selectedRecipe.name, selectedIngredients, {
      recipeId: selectedRecipe.id,
      portions,
      alsoAddToFreezer,
    });
  };

  // Custom meal helpers
  const handleAddCustomIngredientRow = () => {
    setCustomIngredientLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', amount: 1, unit: 'item', category: 'Produce' },
    ]);
  };

  const handleRemoveCustomIngredientRow = (id: string) => {
    setCustomIngredientLines((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleUpdateCustomRow = (id: string, field: string, value: any) => {
    setCustomIngredientLines((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSubmitCustomBatch = () => {
    const mealName = customMealName.trim();
    if (!mealName) return;

    const validIngredients = customIngredientLines
      .filter((r) => r.name.trim().length > 0 && r.amount > 0)
      .map((r) => ({
        name: r.name.trim(),
        amount: r.amount,
        unit: r.unit.trim(),
        category: r.category,
      }));

    if (validIngredients.length === 0) return;

    onAdd(mealName, validIngredients, {
      portions: customPortions,
      alsoAddToFreezer,
    });
  };

  const selectedCount = ingredientList.filter((i) => i.selected).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed inset-x-2 bottom-2 top-8 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:h-[88vh] bg-white rounded-2xl sm:rounded-3xl z-50 flex flex-col shadow-2xl overflow-hidden border border-zinc-200/80 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-zinc-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 leading-tight">Add a recipe's ingredients</h2>
                {weekLabel && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 hidden sm:inline-block">
                    {weekLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {selectedRecipe
                  ? `${selectedRecipe.name}: how many portions, and which ingredients to buy`
                  : 'Any recipe, for any number of people: a batch cook, or something not on the plan'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 2: Selected Recipe Configuration & Ingredient Review */}
        {selectedRecipe ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Bar with Back link & Recipe info */}
            <div className="p-4 bg-zinc-50/70 border-b border-zinc-200/70 shrink-0">
              <div className="flex items-center justify-between gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setSelectedRecipe(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Choose a different recipe</span>
                </button>
                <div className="text-[11px] text-zinc-400">Base recipe: serves {selectedRecipe.servings || 2}</div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-zinc-200/80 shadow-2xs">
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{selectedRecipe.name}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                    {selectedRecipe.description || `${selectedRecipe.ingredients.length} ingredients`}
                  </p>
                </div>

                {/* Portions Selector */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-zinc-600">Portions:</span>
                  <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => handlePortionChange(portions - (portions > 6 ? 2 : 1))}
                      disabled={portions <= 1}
                      className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                      title="Decrease portions"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-zinc-900 min-w-[2rem] text-center tabular-nums">
                      {portions}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePortionChange(portions + (portions >= 6 ? 2 : 1))}
                      disabled={portions >= 30}
                      className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                      title="Increase portions"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Quick portion chips */}
                  <div className="hidden sm:flex items-center gap-1">
                    {[2, 4, 6, 8].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePortionChange(p)}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          portions === p
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scaling ratio info */}
              <div className="flex items-center justify-between mt-2.5 px-1 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>
                    Scaling: <strong>{(portions / (selectedRecipe.servings || 2)).toFixed(1)}x</strong> recipe amounts
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-emerald-600 hover:underline cursor-pointer"
                  >
                    Select all
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    className="text-zinc-500 hover:underline cursor-pointer"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
            </div>

            {/* Ingredients Checklist */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-50">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                Ingredients to Add to List ({selectedCount} of {ingredientList.length} selected)
              </div>

              {ingredientList.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all ${
                    item.selected
                      ? 'bg-white border-zinc-200/90 shadow-2xs'
                      : 'bg-zinc-50/60 border-zinc-200/50 opacity-60'
                  }`}
                >
                  <div
                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none"
                    onClick={() => toggleIngredientSelection(item.id)}
                  >
                    <button
                      type="button"
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        item.selected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'
                      }`}
                    >
                      {item.selected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold text-zinc-900 truncate ${!item.selected ? 'line-through text-zinc-400' : ''}`}
                        >
                          {item.name}
                        </span>
                        {item.category && (
                          <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500 border border-zinc-200/60 font-medium hidden sm:inline-block">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        Base: {item.baseAmount} {item.baseUnit || 'item'}
                      </span>
                    </div>
                  </div>

                  {/* Quantity and Tweaks */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center bg-zinc-50 border border-zinc-200/80 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustIngredientAmount(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-white rounded transition-colors cursor-pointer"
                        title="Decrease amount"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="text-xs font-bold text-zinc-800 min-w-[3.5rem] text-center px-1 tabular-nums whitespace-nowrap">
                        {item.amount} {item.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustIngredientAmount(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-white rounded transition-colors cursor-pointer"
                        title="Increase amount"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer with actions */}
            <div className="p-4 bg-white border-t border-zinc-200/80 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-700 font-medium">
                  <input
                    type="checkbox"
                    checked={alsoAddToFreezer}
                    onChange={(e) => setAlsoAddToFreezer(e.target.checked)}
                    className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>
                    It's for the freezer: add <strong>{portions} portions</strong> to the Freezer tab
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedRecipe(null)}
                  className="px-3.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitRecipeBatch}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add {selectedCount} to the list</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 1: Choose a Meal (Cookbook vs Custom) */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs for Recipe Source */}
            <div className="px-5 pt-3 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('cookbook')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'cookbook'
                      ? 'border-emerald-600 text-emerald-600'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" />
                  <span>From the cookbook ({recipes.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('custom')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'custom'
                      ? 'border-emerald-600 text-emerald-600'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Your own list</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT: FROM COOKBOOK */}
            {activeTab === 'cookbook' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search & Filter */}
                <div className="p-4 border-b border-zinc-100 space-y-2.5 bg-white shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search recipes, meals or ingredients..."
                      className="w-full bg-zinc-100/80 focus:bg-white border border-transparent focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 rounded-xl py-2 pl-9 pr-8 text-xs font-medium transition-all"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedTag('all')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                        selectedTag === 'all'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTag('vegetarian')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                        selectedTag === 'vegetarian'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Vegetarian
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTag('quick')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                        selectedTag === 'quick'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Quick (&le;30m)
                    </button>
                    {allTags.slice(0, 4).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTag(t)}
                        className={`px-2.5 py-1 rounded-lg font-medium capitalize transition-colors cursor-pointer ${
                          selectedTag === t
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recipe List */}
                <div className="flex-1 overflow-y-auto p-4 bg-zinc-50">
                  {filteredRecipes.length === 0 ? (
                    <div className="text-center py-12 px-4 bg-white rounded-2xl border border-zinc-200/70">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-2 text-zinc-400">
                        <Utensils className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-800 mb-1">
                        {recipes.length === 0 ? 'No recipes in cookbook' : 'No matching recipes found'}
                      </h4>
                      <p className="text-[11px] text-zinc-400 max-w-xs mx-auto mb-3">
                        {recipes.length === 0
                          ? 'You can add recipes in the Cookbook tab, or type your own list here.'
                          : 'Try changing your search terms or filters.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('custom')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Type your own list</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredRecipes.map((recipe) => {
                        const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
                        const ingPreview = recipe.ingredients
                          .slice(0, 3)
                          .map((i) => i.name)
                          .join(', ');

                        return (
                          <div
                            key={recipe.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectRecipe(recipe)}
                            className="bg-white p-3.5 rounded-xl border border-zinc-200/80 shadow-2xs hover:border-emerald-300 hover:shadow-md transition-all active:scale-[0.99] text-left cursor-pointer flex flex-col justify-between group"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h4 className="font-bold text-xs text-zinc-900 group-hover:text-emerald-600 transition-colors line-clamp-1">
                                  {recipe.name}
                                </h4>
                                <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded shrink-0">
                                  Serves {recipe.servings || 2}
                                </span>
                              </div>

                              <p className="text-[11px] text-zinc-400 line-clamp-1 mb-2">
                                {recipe.description || `${recipe.ingredients.length} ingredients`}
                              </p>

                              <div className="text-[11px] text-zinc-500 bg-zinc-50 p-1.5 rounded-lg border border-zinc-100 line-clamp-1 mb-2">
                                <span className="font-medium text-zinc-600">Includes: </span>
                                {ingPreview}
                                {recipe.ingredients.length > 3 && ` +${recipe.ingredients.length - 3} more`}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 mt-auto text-[11px] text-zinc-400">
                              <div className="flex items-center gap-2">
                                {totalTime > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="w-3 h-3 text-zinc-400" />
                                    <span>{totalTime}m</span>
                                  </span>
                                )}
                                <span>{recipe.ingredients.length} items</span>
                              </div>

                              <span className="font-semibold text-emerald-600 group-hover:underline flex items-center gap-0.5">
                                <span>Choose</span>
                                <span>→</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: CUSTOM MEAL */}
            {activeTab === 'custom' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50">
                  {/* Meal Name & Portions */}
                  <div className="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-2xs space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">What's it for?</label>
                      <input
                        type="text"
                        value={customMealName}
                        onChange={(e) => setCustomMealName(e.target.value)}
                        placeholder="e.g. Lasagne for the freezer, birthday cake..."
                        className="w-full bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                      <div>
                        <span className="text-xs font-bold text-zinc-700 block">Portions</span>
                        <span className="text-[11px] text-zinc-500">How many it makes</span>
                      </div>
                      <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 border border-zinc-200">
                        <button
                          type="button"
                          onClick={() => setCustomPortions(Math.max(1, customPortions - 1))}
                          className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-zinc-900 min-w-[2rem] text-center tabular-nums">
                          {customPortions}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCustomPortions(customPortions + 1)}
                          className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Custom Ingredients rows */}
                  <div className="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700">Ingredients</span>
                      <button
                        type="button"
                        onClick={handleAddCustomIngredientRow}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Ingredient</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {customIngredientLines.map((row, idx) => (
                        <div key={row.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleUpdateCustomRow(row.id, 'name', e.target.value)}
                            placeholder={`Ingredient ${idx + 1} (e.g. Minced Beef)`}
                            className="flex-1 bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-emerald-400 rounded-xl px-2.5 py-1.5 text-xs font-medium"
                          />
                          <input
                            type="number"
                            value={row.amount}
                            min={0.1}
                            step={0.5}
                            onChange={(e) => handleUpdateCustomRow(row.id, 'amount', parseFloat(e.target.value) || 1)}
                            className="w-16 bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-emerald-400 rounded-xl px-2 py-1.5 text-xs font-medium text-center"
                          />
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => handleUpdateCustomRow(row.id, 'unit', e.target.value)}
                            placeholder="Unit (g, can, pack)"
                            className="w-24 bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-emerald-400 rounded-xl px-2 py-1.5 text-xs font-medium"
                          />
                          {customIngredientLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomIngredientRow(row.id)}
                              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remove ingredient"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddCustomIngredientRow}
                      className="w-full py-2 border border-dashed border-zinc-300 rounded-xl text-xs font-medium text-zinc-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add another ingredient</span>
                    </button>
                  </div>
                </div>

                {/* Footer for Custom Meal */}
                <div className="p-4 bg-white border-t border-zinc-200/80 shrink-0">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-700 font-medium">
                      <input
                        type="checkbox"
                        checked={alsoAddToFreezer}
                        onChange={(e) => setAlsoAddToFreezer(e.target.checked)}
                        className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>It's for the freezer: add {customPortions} portions to the Freezer tab</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitCustomBatch}
                      disabled={!customMealName.trim() || customIngredientLines.every((l) => !l.name.trim())}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to the list</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
