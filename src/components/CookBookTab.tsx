import React, { useState, useRef, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { IngredientTriageModal } from './IngredientTriageModal';
import { buildCatalog, matchProduct, namesNeedingSuggestion, linkIngredients, formatCookingAmount } from '../shopping';
import { 
  parseRecipeApi, 
  suggestGroceryProductsApi,
  generateRecipeApi, 
  editRecipeApi, 
  generateAlternativeInstructionsApi 
} from '../services/geminiService';
import { 
  Search, 
  Plus, 
  Minus, 
  Sparkles, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Clock, 
  Users, 
  Utensils, 
  BookOpen, 
  Check, 
  RotateCcw,
  Flame,
  Microwave,
  Zap,
  Timer,
  Eye,
  Settings2,
  Leaf,
  Trash2,
  SlidersHorizontal,
  ChefHat,
  Pencil
} from 'lucide-react';
import { Recipe, CookingMethod } from '../types';
import { scaleRecipeStepQuantities, getRecipeEmojis, getEmojiLabel } from '../utils';
import CookMode from './CookMode';
import { RecipeModal } from './RecipePopup';
import { RecipeCard, CARD_FIELD_OPTIONS, cardFieldsFromPrefs } from './RecipeCard';
import { recipeHistories, sortRecipes, readRecipeSort, saveRecipeSort, RecipeSort, RECIPE_SORTS, todayISO, freezerPortions, firstUrl } from '../recipeInfo';

export default function CookBookTab({ store, onNavigateTab, onAddToDay }: { store: any, onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void, onAddToDay?: (recipe: Recipe) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'under20' | 'under30' | 'under45'>('all');
  const [cookingFilter, setCookingFilter] = useState<'all' | 'ninja' | 'oven_hob'>('all');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'vegetarian' | 'vegan'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookModeRecipe, setCookModeRecipe] = useState<Recipe | null>(null);
  const [cookModeRecipePortions, setCookModeRecipePortions] = useState<number | undefined>(undefined);
  const [showAddModal, setShowAddModal] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const prefs = store.state.preferences || {
    showPrepTime: true,
    showCookTime: true,
    showTotalTime: true,
    showMethod: true,
    showVegetarian: true,
    showVegan: true,
    showEmojis: true,
  };

  const togglePref = (key: keyof typeof prefs) => {
    store.updatePreferences({ [key]: !prefs[key] });
  };

  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    store.state.recipes.forEach((r: Recipe) => {
      r.tags?.forEach(t => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [store.state.recipes]);

  const filteredRecipes = useMemo(() => {
    return store.state.recipes.filter((r: Recipe) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch = !q || 
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        r.tags?.some(t => t.toLowerCase().includes(q));
      const matchesTag = selectedTag === 'all' || r.tags?.includes(selectedTag);
      const totalTime = (r.prepTime || 0) + (r.cookTime || 0);
      const matchesTime = 
        timeFilter === 'all' ? true :
        timeFilter === 'under20' ? totalTime <= 20 :
        timeFilter === 'under30' ? totalTime <= 30 :
        timeFilter === 'under45' ? totalTime <= 45 : true;
      const methods = r.cookingMethods && r.cookingMethods.length > 0 ? r.cookingMethods : ['ninja', 'oven_hob'];
      const matchesCooking = cookingFilter === 'all' || methods.includes(cookingFilter);
      
      const isVeg = r.isVegetarian || r.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()));
      const isVegan = r.isVegan || r.tags?.some(t => ['vegan'].includes(t.toLowerCase()));
      const matchesDietary = dietaryFilter === 'all' ? true :
        dietaryFilter === 'vegetarian' ? isVeg || isVegan :
        dietaryFilter === 'vegan' ? isVegan : true;

      return matchesSearch && matchesTag && matchesTime && matchesCooking && matchesDietary;
    });
  }, [store.state.recipes, searchTerm, selectedTag, timeFilter, cookingFilter, dietaryFilter]);

  // Cards: when each recipe was last had / is next planned, in the order chosen on this phone.
  const today = todayISO();
  const recipeHistory = useMemo(() => recipeHistories(store.state.mealPlans, today), [store.state.mealPlans, today]);
  const [recipeSort, setRecipeSortState] = useState<RecipeSort>(readRecipeSort);
  const setRecipeSort = (sort: RecipeSort) => { setRecipeSortState(sort); saveRecipeSort(sort); };
  const sortedRecipes = useMemo(() => sortRecipes(filteredRecipes, recipeSort, recipeHistory), [filteredRecipes, recipeSort, recipeHistory]);
  const cardFields = cardFieldsFromPrefs(prefs);

  const handleCloseSearch = () => {
    setSearchTerm('');
    setIsSearchExpanded(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative">
      <div className="bg-white border-b border-zinc-200/80 px-4 sm:px-5 py-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          {/* Left side: Results Count & Active Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-sm font-bold text-zinc-900 whitespace-nowrap">
              Cookbook
            </span>

            {/* Active Tag Filter Pill */}
            {selectedTag !== 'all' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-900 text-white pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in">
                <span>{selectedTag}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTag('all')}
                  className="hover:text-zinc-300 p-0.5 rounded-full cursor-pointer"
                  title="Clear category filter"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {/* Active Time Filter Pill */}
            {timeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200 pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in">
                <span>{timeFilter === 'under20' ? '≤20m' : timeFilter === 'under30' ? '≤30m' : '≤45m'}</span>
                <button
                  type="button"
                  onClick={() => setTimeFilter('all')}
                  className="hover:text-zinc-500 p-0.5 rounded-full cursor-pointer"
                  title="Clear time filter"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {/* Active Cooking Method Filter Pill */}
            {cookingFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-900 text-white pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in">
                {cookingFilter === 'ninja' && <Zap className="w-2.5 h-2.5 text-amber-400" />}
                {cookingFilter === 'oven_hob' && <Flame className="w-2.5 h-2.5 text-rose-400" />}
                <span>{cookingFilter === 'ninja' ? 'Ninja' : 'Oven/Hob'}</span>
                <button
                  type="button"
                  onClick={() => setCookingFilter('all')}
                  className="hover:text-zinc-300 p-0.5 rounded-full cursor-pointer"
                  title="Clear cooking method filter"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {/* Active Search Term Pill */}
            {searchTerm && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200 pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in max-w-[140px]">
                <span className="truncate">&quot;{searchTerm}&quot;</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setIsSearchExpanded(false);
                  }}
                  className="hover:text-zinc-500 p-0.5 rounded-full cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>

          {/* Right side: Concise Expandable Search + Filter Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Expandable Search: starts as icon, expands when clicked */}
            <div className="relative flex items-center">
              {isSearchExpanded ? (
                <div className="flex items-center bg-zinc-50 border border-zinc-300 rounded-xl px-2.5 py-1 w-48 sm:w-60 shadow-2xs transition-all animate-in fade-in slide-in-from-right-2">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0 mr-1.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Type to search..."
                    className="w-full text-xs bg-transparent focus:outline-none text-zinc-900 placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setIsSearchExpanded(false);
                    }}
                    className="p-0.5 text-zinc-400 hover:text-zinc-700 rounded transition-colors ml-1 cursor-pointer"
                    title="Close search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchExpanded(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                    searchTerm
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                  }`}
                  title="Search recipes"
                  aria-label="Search recipes"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Button with Options Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs relative ${
                  selectedTag !== 'all' || timeFilter !== 'all' || cookingFilter !== 'all' || dietaryFilter !== 'all' || showFilterDropdown
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                }`}
                title="Filter & Display Options"
                aria-label="Filter & Display Options"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {(selectedTag !== 'all' || timeFilter !== 'all' || cookingFilter !== 'all' || dietaryFilter !== 'all') && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              {/* Filter Popover Dropdown */}
              {showFilterDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowFilterDropdown(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-130px)] flex flex-col bg-white rounded-2xl border border-zinc-200/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between p-3 pb-2.5 border-b border-zinc-100 shrink-0">
                      <span className="text-xs font-semibold text-zinc-900">Filter & View</span>
                      {(selectedTag !== 'all' || timeFilter !== 'all' || cookingFilter !== 'all' || dietaryFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTag('all');
                            setTimeFilter('all');
                            setCookingFilter('all');
                            setDietaryFilter('all');
                          }}
                          className="text-[11px] text-zinc-400 hover:text-zinc-900 font-medium cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto p-3 space-y-3 flex-1 scrollbar-thin">
                      {/* Dietary Section */}
                      <div>
                        <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                          Dietary
                        </span>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => setDietaryFilter('all')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            dietaryFilter === 'all'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setDietaryFilter('vegetarian')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            dietaryFilter === 'vegetarian'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          Vegetarian
                        </button>
                        <button
                          type="button"
                          onClick={() => setDietaryFilter('vegan')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            dietaryFilter === 'vegan'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          Vegan
                        </button>
                      </div>
                    </div>

                    {/* Cooking Method Section */}
                    <div className="mb-3">
                      <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                        Cooking Method / Appliance
                      </span>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setCookingFilter('all')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            cookingFilter === 'all'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          All Methods
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookingFilter('ninja')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            cookingFilter === 'ninja'
                              ? 'bg-amber-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          <Zap className="w-3 h-3 text-amber-300" />
                          <span>Ninja Combi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookingFilter('oven_hob')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            cookingFilter === 'oven_hob'
                              ? 'bg-rose-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          <Flame className="w-3 h-3 text-rose-300" />
                          <span>Oven/Hob</span>
                        </button>
                      </div>
                    </div>

                    {/* Time Section */}
                    <div className="mb-3">
                      <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                        Total Time (Prep + Cook)
                      </span>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setTimeFilter('all')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            timeFilter === 'all'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          Any Time
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimeFilter('under20')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            timeFilter === 'under20'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          ≤ 20 mins
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimeFilter('under30')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            timeFilter === 'under30'
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          ≤ 30 mins
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimeFilter('under45')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            timeFilter === 'under45'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          ≤ 45 mins
                        </button>
                      </div>
                    </div>

                    {/* Tag Section */}
                    <div>
                      <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                        Category
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTag('all')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                            selectedTag === 'all'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          All
                        </button>
                        {allTags.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setSelectedTag(tag)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                              selectedTag === tag
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sort */}
                    <div className="pt-3 border-t border-zinc-100">
                      <span className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider block px-1 mb-1.5">Sort</span>
                      <div className="grid grid-cols-2 gap-1">
                        {RECIPE_SORTS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            data-sort={o.id}
                            onClick={() => setRecipeSort(o.id)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              recipeSort === o.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* What the cards show */}
                    <div className="pt-3 border-t border-zinc-100">
                      <span className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider block px-1 mb-1.5">
                        Show on cards
                      </span>
                      <div className="grid grid-cols-1 gap-0.5">
                      {CARD_FIELD_OPTIONS.map(({ pref, label }) => (
                        <label key={pref} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(prefs as any)[pref] !== false}
                            onChange={() => store.updatePreferences({ [pref]: (prefs as any)[pref] === false })}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                          />
                          <span className="text-xs font-medium text-zinc-700">{label}</span>
                        </label>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="fixed bottom-20 right-6 sm:bottom-20 sm:right-6 z-40 w-12 h-12 rounded-full border border-emerald-500/20 flex items-center justify-center transition-all cursor-pointer shadow-lg hover:shadow-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shrink-0 group focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              title="Add Recipe"
              aria-label="Add Recipe"
            >
              <Plus className="w-6 h-6 stroke-[2.5] group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {filteredRecipes.length === 0 ? (
          <div className="text-center text-zinc-400 mt-16 text-xs">
            {searchTerm ? `No recipes matching "${searchTerm}"` : 'No recipes found in cookbook.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 pb-20">
            {sortedRecipes.map((recipe: Recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                fields={cardFields}
                history={recipeHistory.get(recipe.id)}
                freezer={freezerPortions(recipe, store.state.batches)}
                today={today}
                onOpen={() => setSelectedRecipe(recipe)}
              />
            ))}
          </div>
        )}
      </div>

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
      
      {showAddModal && (
        <AddRecipeModal store={store} onClose={() => setShowAddModal(false)} onNavigateTab={onNavigateTab} />
      )}

      {recipeToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setRecipeToDelete(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full border border-zinc-200/90 shadow-xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/60 flex items-center justify-center shrink-0 text-rose-600">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-zinc-900">Delete Recipe</h4>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Are you sure you want to delete <span className="font-medium text-zinc-800">"{recipeToDelete.name}"</span>? This will permanently remove it from your cookbook.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRecipeToDelete(null)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  store.deleteRecipe(recipeToDelete.id);
                  if (selectedRecipe?.id === recipeToDelete.id) {
                    setSelectedRecipe(null);
                  }
                  setRecipeToDelete(null);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchJsonSafe(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    // If response is not JSON (e.g. HTML error page from network or proxy)
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Server returned error (${res.status}). Please check recipe text or try again.`);
    }
    throw new Error('Server returned an unexpected response format.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Server error (${res.status})`);
  }

  return data;
}

// The recipe pop-up lives in RecipePopup.tsx; other tabs import it from here.
export { RecipeModal } from './RecipePopup';

function AddRecipeModal({ store, onClose, onNavigateTab }: { store: any; onClose: () => void; onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void }) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [creationMode, setCreationMode] = useState<'paste' | 'generate'>('paste');
  const [text, setText] = useState('');
  const [selectedAppliance, setSelectedAppliance] = useState<CookingMethod | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [unmappedItems, setUnmappedItems] = useState<any[]>([]);
  const [pendingRecipe, setPendingRecipe] = useState<any>(null);

  // Review & Edit States
  const [reviewRecipe, setReviewRecipe] = useState<Recipe | null>(null);
  const [activeReviewMethod, setActiveReviewMethod] = useState<CookingMethod>('oven_hob');
  const [isRefining, setIsRefining] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refineError, setRefineError] = useState('');
  const [isGeneratingAlternative, setIsGeneratingAlternative] = useState<Record<string, boolean>>({});

  const INGREDIENT_CATEGORIES = ['Meat & Seafood', 'Produce', 'Dairy', 'Bakery', 'Frozen', 'Pantry'];

  const handleParse = async () => {
    if (!selectedAppliance) {
      setError('Please select whether this is a Stove/Oven or Ninja Combi recipe using the toggle above.');
      return;
    }
    if (!text.trim()) {
      setError(creationMode === 'generate'
        ? 'Please describe what you want to cook.'
        : 'Please paste or enter recipe text to extract.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      let data: any = null;
      if (creationMode === 'generate') {
        data = await generateRecipeApi(text, selectedAppliance);
      } else {
        data = await parseRecipeApi(text, selectedAppliance);
        // Keep the web address if one was pasted with the recipe ("Website" on the recipe).
        const url = firstUrl(text);
        if (url) data = { ...data, sourceUrl: url };
      }
      
      // Same product list the shopping list uses (your grocery list, your edits and custom items).
      const catalog = buildCatalog(store.state.groceryDatabase, store.state.groceryOverrides);
      const allItems = catalog.products.filter(p => !p.sameAs).map(p => p.item) as any[];

      const fuse = new Fuse(allItems, {
        keys: ['name', 'aliases'],
        threshold: 0.4
      });

      // Link each ingredient to a grocery-list product without changing its wording:
      // the app's exact matches first, then Gemini's suggestions (asked only about the
      // leftovers), then partial matches. Anything still unknown goes to Map Ingredient.
      const ingredientsIn: any[] = Array.isArray(data?.ingredients) ? data.ingredients : [];
      const pendingNames = namesNeedingSuggestion(ingredientsIn, catalog);
      const suggestions = pendingNames.length > 0
        ? await suggestGroceryProductsApi(pendingNames, allItems.map((i: any) => i.name))
        : {};
      const linked = linkIngredients(ingredientsIn, catalog, suggestions);
      data = { ...data, ingredients: linked.ingredients };
      const unmapped: any[] = linked.unmapped.map((ing: any) => ({
        ingredient: ing,
        suggestions: fuse.search(ing.name).slice(0, 3).map(r => r.item)
      }));

      if (unmapped.length > 0) {
        setUnmappedItems(unmapped);
        setPendingRecipe(data);
      } else {
        const ingredients = Array.isArray(data.ingredients)
          ? data.ingredients.map((i: any) => ({
              ...i,
              id: i?.id || crypto.randomUUID(),
              name: i?.name || 'Unknown Ingredient'
            }))
          : [];

        const preparedRecipe: Recipe = {
          ...data,
          id: data.id || crypto.randomUUID(),
          servings: data.servings || 2,
          ingredients
        };

        setReviewRecipe(preparedRecipe);
        
        // Pick user-selected cooking method as initial active tab
        const initialMethod = (selectedAppliance || (preparedRecipe.cookingMethods && preparedRecipe.cookingMethods.length > 0
          ? preparedRecipe.cookingMethods[0]
          : 'oven_hob')) as CookingMethod;
        setActiveReviewMethod(initialMethod);
        setStep('review');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRecipe = () => {
    if (!reviewRecipe) return;
    store.addRecipe({ ...reviewRecipe, sourceUrl: reviewRecipe.sourceUrl?.trim() || undefined });
    onClose();
  };

  const handleTriageComplete = (mappings?: any[]) => {
    if (pendingRecipe) {
      const updatedRecipe = { ...pendingRecipe };
      if (Array.isArray(updatedRecipe.ingredients) && mappings && mappings.length > 0) {
        updatedRecipe.ingredients = updatedRecipe.ingredients.map((ing: any) => {
          if (!ing || !ing.name) return ing;
          const mapping = mappings.find((m: any) => m && (m.originalName === ing.name || m.mappedGroceryName === ing.name));
          if (mapping && mapping.mappedGroceryId) {
            // Keep the recipe's own wording; just link it to the chosen product.
            return { ...ing, groceryId: mapping.mappedGroceryId };
          }
          return ing;
        });
      }
      
      const ingredients = Array.isArray(updatedRecipe.ingredients)
        ? updatedRecipe.ingredients.map((i: any) => ({
            ...i,
            id: i?.id || crypto.randomUUID(),
            name: i?.name || 'Unknown Ingredient'
          }))
        : [];

      const preparedRecipe: Recipe = {
        ...updatedRecipe,
        id: updatedRecipe.id || crypto.randomUUID(),
        servings: updatedRecipe.servings || 2,
        ingredients
      };

      setReviewRecipe(preparedRecipe);
      
      const initialMethod = (selectedAppliance || (preparedRecipe.cookingMethods && preparedRecipe.cookingMethods.length > 0
        ? preparedRecipe.cookingMethods[0]
        : 'oven_hob')) as CookingMethod;
      setActiveReviewMethod(initialMethod);
      setUnmappedItems([]);
      setStep('review');
    }
  };

  const handleRefineWithAi = async () => {
    if (!refineInstruction.trim() || !reviewRecipe) return;
    setIsRefining(true);
    setRefineError('');
    try {
      const data = await editRecipeApi(reviewRecipe, refineInstruction);
      
      setReviewRecipe(data);
      setRefineInstruction('');
    } catch (err: any) {
      if (err.message === 'GEMINI_API_KEY_MISSING') {
        setRefineError('Gemini API key is missing. Please configure it in your connections settings.');
      } else {
        setRefineError(err.message || 'Failed to refine recipe');
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleGenerateAlternative = async (targetMethod: CookingMethod) => {
    if (!reviewRecipe) return;
    setIsGeneratingAlternative(prev => ({ ...prev, [targetMethod]: true }));
    try {
      const existingMethods = reviewRecipe.cookingMethods || [];
      const primaryMethod = existingMethods[0] || 'oven_hob';
      const existingInstructions = reviewRecipe.methodInstructions?.[primaryMethod] || reviewRecipe.instructions || [];

      const data = await generateAlternativeInstructionsApi(
        reviewRecipe.name,
        reviewRecipe.ingredients,
        targetMethod,
        existingInstructions,
        existingMethods
      );

      const updatedCookingMethods = [...(reviewRecipe.cookingMethods || [])];
      if (!updatedCookingMethods.includes(targetMethod)) {
        updatedCookingMethods.push(targetMethod);
      }

      const updatedMethodInstructions = {
        ...(reviewRecipe.methodInstructions || {}),
        [targetMethod]: data.instructions || []
      };

      const updatedMethodPrepTime = {
        ...(reviewRecipe.methodPrepTime || {}),
        [targetMethod]: data.prepTime || 15
      };

      const updatedMethodCookTime = {
        ...(reviewRecipe.methodCookTime || {}),
        [targetMethod]: data.cookTime || 20
      };

      setReviewRecipe({
        ...reviewRecipe,
        cookingMethods: updatedCookingMethods,
        methodInstructions: updatedMethodInstructions,
        methodPrepTime: updatedMethodPrepTime,
        methodCookTime: updatedMethodCookTime
      });

      setActiveReviewMethod(targetMethod);
    } catch (err: any) {
      console.error('Failed to generate alternative instructions:', err);
      if (err.message === 'GEMINI_API_KEY_MISSING') {
        alert('Gemini API key is missing. Please configure it in Settings Connections.');
      } else {
        alert(err.message || 'Failed to generate alternative instructions');
      }
    } finally {
      setIsGeneratingAlternative(prev => ({ ...prev, [targetMethod]: false }));
    }
  };

  const makeMethodDefault = (method: CookingMethod) => {
    if (!reviewRecipe) return;
    const methods = reviewRecipe.cookingMethods || [];
    if (!methods.includes(method)) return;

    // Move selected method to index 0
    const updatedMethods = [method, ...methods.filter(m => m !== method)];

    // Sync main recipe fields to this new default method
    const steps = reviewRecipe.methodInstructions?.[method] || reviewRecipe.instructions || [];
    const prep = reviewRecipe.methodPrepTime?.[method] || reviewRecipe.prepTime || 15;
    const cook = reviewRecipe.methodCookTime?.[method] || reviewRecipe.cookTime || 20;

    setReviewRecipe({
      ...reviewRecipe,
      cookingMethods: updatedMethods,
      instructions: steps,
      prepTime: prep,
      cookTime: cook
    });
  };

  const activeInstructions = reviewRecipe 
    ? (reviewRecipe.methodInstructions?.[activeReviewMethod] || reviewRecipe.instructions || [])
    : [];

  const methodsToDisplay = reviewRecipe?.cookingMethods || [];

  return (
    <div 
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-md flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl border-0 sm:border border-stone-200/80 overflow-hidden transition-all duration-300 ${
          step === 'review' 
            ? 'w-full max-w-5xl h-[95vh] sm:h-[90vh]' 
            : 'p-5 pb-safe w-full max-w-lg animate-in slide-in-from-bottom-3 duration-150'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'input' ? (
          // Input screen
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-extrabold text-stone-900 tracking-tight">Add Recipe</h3>
              </div>
              <button 
                onClick={onClose} 
                className="p-1.5 text-stone-400 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Top-Level Mode Switcher */}
            <div className="flex bg-stone-200/60 p-1 rounded-2xl mb-3.5 border border-stone-200/80">
              <button
                type="button"
                onClick={() => {
                  setCreationMode('paste');
                  if (error) setError('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  creationMode === 'paste'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200/40'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Generate from Recipe</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationMode('generate');
                  if (error) setError('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  creationMode === 'generate'
                    ? 'bg-white text-emerald-900 shadow-sm border border-emerald-200/40'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Generate from Prompt</span>
              </button>
            </div>

            {/* Appliance Selection Toggle */}
            <div className="mb-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-stone-800 flex items-center gap-1">
                  <span>Cooking Appliance</span>
                  <span className="text-rose-500 font-bold">*</span>
                </span>
                {!selectedAppliance ? (
                  <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/70">
                    Press a toggle to select
                  </span>
                ) : (
                  <span className="text-[11px] text-stone-400 font-medium">
                    {selectedAppliance === 'ninja' ? 'Ninja Combi selected' : 'Stove / Oven selected'}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {/* Stove / Oven Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAppliance('oven_hob');
                    if (error) setError('');
                  }}
                  className={`relative p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedAppliance === 'oven_hob'
                      ? 'bg-rose-50/90 border-rose-500 ring-2 ring-rose-500/25 shadow-xs'
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/70 shadow-3xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        selectedAppliance === 'oven_hob' ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-500'
                      }`}>
                        <Flame className="w-4 h-4 fill-current" />
                      </div>
                      <span className={`text-xs font-bold ${
                        selectedAppliance === 'oven_hob' ? 'text-rose-950 font-extrabold' : 'text-stone-800'
                      }`}>
                        Stove / Oven
                      </span>
                    </div>
                    {selectedAppliance === 'oven_hob' && (
                      <div className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight ${
                    selectedAppliance === 'oven_hob' ? 'text-rose-800/90 font-medium' : 'text-stone-400'
                  }`}>
                    Hob, pan-sear, pots & conventional oven
                  </p>
                </button>

                {/* Ninja Combi Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAppliance('ninja');
                    if (error) setError('');
                  }}
                  className={`relative p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedAppliance === 'ninja'
                      ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/25 shadow-xs'
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/70 shadow-3xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        selectedAppliance === 'ninja' ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-500'
                      }`}>
                        <Zap className="w-4 h-4 fill-current" />
                      </div>
                      <span className={`text-xs font-bold ${
                        selectedAppliance === 'ninja' ? 'text-amber-950 font-extrabold' : 'text-stone-800'
                      }`}>
                        Ninja Combi
                      </span>
                    </div>
                    {selectedAppliance === 'ninja' && (
                      <div className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight ${
                    selectedAppliance === 'ninja' ? 'text-amber-800/90 font-medium' : 'text-stone-400'
                  }`}>
                    Combi Meals, Combi Bake, Air Fry, Slow Cook & Steam
                  </p>
                </button>
              </div>
            </div>

            <div className="mb-1">
              <label className="text-xs font-bold text-stone-800 mb-1.5 block">
                {creationMode === 'generate' ? 'Describe What You Want to Cook' : 'Recipe Details / Ingredients & Instructions'}
              </label>
              <textarea
                className="w-full flex-1 min-h-[140px] p-3.5 bg-white border border-stone-200 focus:border-stone-400 rounded-2xl resize-none outline-none text-xs text-stone-800 placeholder-stone-400 font-medium shadow-3xs"
                placeholder={
                  creationMode === 'generate'
                    ? 'Describe what you want to cook (e.g., A high-protein chicken dish for the Ninja Combi using broccoli and soy sauce)...'
                    : 'Paste recipe text here (ingredients, amounts, instructions)...'
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError('');
                }}
              />
            </div>
            
            {error && (
              <div className="text-rose-600 text-xs mt-2 font-semibold px-1 space-y-1">
                <p>
                  {error === 'GEMINI_API_KEY_MISSING' 
                    ? 'Gemini API key is missing. Please configure it in your connections settings.' 
                    : error}
                </p>
                {error === 'GEMINI_API_KEY_MISSING' && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateTab('settings');
                    }}
                    className="underline text-indigo-600 hover:text-indigo-800 font-bold block cursor-pointer"
                  >
                    Go to Connections Settings
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-4">
              <button
                onClick={handleParse}
                disabled={isLoading || !text.trim() || !selectedAppliance}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-200 disabled:text-stone-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs shadow-md shadow-emerald-600/10 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-100" />
                    <span>
                      {!selectedAppliance 
                        ? 'Select Appliance Above to Continue' 
                        : creationMode === 'generate'
                          ? 'Generate Recipe'
                          : `Extract for ${selectedAppliance === 'ninja' ? 'Ninja Combi' : 'Stove / Oven'} & Review`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          // Review & Customize Screen
          reviewRecipe && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-stone-200/60 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div>
                  <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-bold uppercase tracking-widest">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />
                    <span>{creationMode === 'generate' ? 'AI Recipe Generation & Customize Stage' : 'Recipe Review & Customize Stage'}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-stone-900 tracking-tight mt-0.5">
                    {creationMode === 'generate' ? 'Customize Generated Recipe' : 'Customize Parsed Recipe'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to go back? Your edits will be lost.')) {
                        setStep('input');
                      }
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer border border-stone-200 bg-white"
                  >
                    Back to Input
                  </button>
                  <button 
                    onClick={onClose} 
                    className="p-1.5 text-stone-400 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Main Content Areas Side-by-Side */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
                
                {/* Left Column (Metadata & Ingredients) */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  
                  {/* Basic Info */}
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-3xs space-y-3">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">Recipe Name</label>
                      <input
                        type="text"
                        value={reviewRecipe.name}
                        onChange={(e) => setReviewRecipe({ ...reviewRecipe, name: e.target.value })}
                        className="w-full text-xs font-bold bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-2 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                        placeholder="Recipe Name"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 block mb-1">Website (optional)</label>
                      <input
                        type="url"
                        inputMode="url"
                        value={reviewRecipe.sourceUrl || ''}
                        onChange={(e) => setReviewRecipe({ ...reviewRecipe, sourceUrl: e.target.value })}
                        className="w-full text-sm bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-2 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                        placeholder="https://… where the recipe came from"
                        aria-label="Website"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">Intro</label>
                      <textarea
                        value={reviewRecipe.description || ''}
                        onChange={(e) => setReviewRecipe({ ...reviewRecipe, description: e.target.value })}
                        className="w-full text-xs font-medium bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-2 outline-none transition-all text-stone-800 placeholder:text-stone-400 min-h-[50px] max-h-[80px]"
                        placeholder="Short summary..."
                      />
                    </div>

                    {/* Prep & Cook Times for Active Appliance */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                          Prep Time (mins)
                        </label>
                        <input
                          type="number"
                          value={reviewRecipe.methodPrepTime?.[activeReviewMethod] ?? reviewRecipe.prepTime ?? 10}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const updatedMethodPrepTime = {
                              ...(reviewRecipe.methodPrepTime || {}),
                              [activeReviewMethod]: val
                            };
                            setReviewRecipe({
                              ...reviewRecipe,
                              methodPrepTime: updatedMethodPrepTime,
                              prepTime: activeReviewMethod === reviewRecipe.cookingMethods?.[0] ? val : reviewRecipe.prepTime
                            });
                          }}
                          className="w-full text-xs font-bold bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-1.5 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                          Cook Time (mins)
                        </label>
                        <input
                          type="number"
                          value={reviewRecipe.methodCookTime?.[activeReviewMethod] ?? reviewRecipe.cookTime ?? 15}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const updatedMethodCookTime = {
                              ...(reviewRecipe.methodCookTime || {}),
                              [activeReviewMethod]: val
                            };
                            setReviewRecipe({
                              ...reviewRecipe,
                              methodCookTime: updatedMethodCookTime,
                              cookTime: activeReviewMethod === reviewRecipe.cookingMethods?.[0] ? val : reviewRecipe.cookTime
                            });
                          }}
                          className="w-full text-xs font-bold bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-1.5 outline-none font-mono"
                        />
                      </div>
                    </div>

                    {/* Tag Badges Checkboxes */}
                    <div className="pt-2">
                      <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1.5">Dietary Toggles</label>
                      <div className="flex gap-2">
                        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          reviewRecipe.isVegetarian 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                            : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!reviewRecipe.isVegetarian}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              const updatedTags = isChecked 
                                ? [...(reviewRecipe.tags || []), 'Vegetarian']
                                : (reviewRecipe.tags || []).filter(t => t !== 'Vegetarian');
                              setReviewRecipe({
                                ...reviewRecipe,
                                isVegetarian: isChecked,
                                tags: Array.from(new Set(updatedTags))
                              });
                            }}
                            className="sr-only"
                          />
                          <Leaf className="w-3.5 h-3.5 shrink-0" />
                          <span>Vegetarian</span>
                        </label>

                        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          reviewRecipe.isVegan 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                            : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!reviewRecipe.isVegan}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              const updatedTags = isChecked 
                                ? [...(reviewRecipe.tags || []), 'Vegan', 'Vegetarian']
                                : (reviewRecipe.tags || []).filter(t => t !== 'Vegan');
                              setReviewRecipe({
                                ...reviewRecipe,
                                isVegan: isChecked,
                                isVegetarian: isChecked ? true : reviewRecipe.isVegetarian,
                                tags: Array.from(new Set(updatedTags))
                              });
                            }}
                            className="sr-only"
                          />
                          <Leaf className="w-3.5 h-3.5 shrink-0" />
                          <span>Vegan</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Ingredients List */}
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-3xs flex-1 flex flex-col min-h-[250px]">
                    <div className="flex justify-between items-center pb-2 border-b border-stone-150 mb-2 shrink-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">Ingredients (serves {reviewRecipe.servings || 2})</span>
                      <span className="text-[11px] text-stone-400 font-bold">({reviewRecipe.ingredients.length} items)</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[300px] lg:max-h-[360px] pr-1.5 scrollbar-thin">
                      {reviewRecipe.ingredients.map((ing, idx) => (
                        <React.Fragment key={ing.id || idx}>
                        <div className="flex gap-1 py-1 px-1.5 items-center bg-stone-50/50 hover:bg-stone-50 rounded-xl border border-stone-200/60 transition-colors">
                          <input
                            type="number"
                            step="any"
                            value={ing.amount}
                            onChange={(e) => {
                              const updated = [...reviewRecipe.ingredients];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                            }}
                            className="w-12 text-center text-xs font-bold bg-white border border-stone-200 rounded-lg px-1 py-1 outline-none font-mono"
                            placeholder="Qty"
                          />
                          <input
                            type="text"
                            value={ing.unit}
                            onChange={(e) => {
                              const updated = [...reviewRecipe.ingredients];
                              updated[idx].unit = e.target.value;
                              setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                            }}
                            className="w-14 text-center text-xs font-semibold bg-white border border-stone-200 rounded-lg px-1 py-1 outline-none"
                            placeholder="Unit"
                          />
                          <input
                            type="text"
                            value={ing.name}
                            onChange={(e) => {
                              const updated = [...reviewRecipe.ingredients];
                              updated[idx].name = e.target.value;
                              setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                            }}
                            className="flex-1 text-xs font-bold bg-white border border-stone-200 rounded-lg px-2 py-1 outline-none"
                            placeholder="Ingredient Name"
                          />
                          <select
                            value={ing.category || 'Pantry'}
                            onChange={(e) => {
                              const updated = [...reviewRecipe.ingredients];
                              updated[idx].category = e.target.value;
                              updated[idx].suggestedAisle = e.target.value;
                              setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                            }}
                            className="text-[11px] font-bold bg-white border border-stone-200 rounded-lg py-1 px-1 outline-none max-w-[90px]"
                          >
                            {INGREDIENT_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = reviewRecipe.ingredients.filter((_, i) => i !== idx);
                              setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                            }}
                            className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {ing.note && (
                          <p className="text-[11px] text-stone-500 pl-2 -mt-0.5 mb-0.5">{ing.note}</p>
                        )}
                        </React.Fragment>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = [
                          ...reviewRecipe.ingredients,
                          {
                            id: crypto.randomUUID(),
                            name: '',
                            amount: 1,
                            unit: 'piece',
                            category: 'Pantry',
                            suggestedAisle: 'Pantry'
                          }
                        ];
                        setReviewRecipe({ ...reviewRecipe, ingredients: updated });
                      }}
                      className="w-full py-2 mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-200/40 cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Ingredient</span>
                    </button>
                  </div>

                  {/* AI Refinement Panel */}
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-150 shadow-3xs space-y-2.5 shrink-0">
                    <div className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">Smart AI Recipe Refiner</span>
                    </div>
                    
                    <p className="text-[11px] text-emerald-700 font-medium leading-relaxed">
                      Need adjustments? Describe what you want to change (e.g., &quot;Make it gluten free&quot;, &quot;Add secondary cooking instructions&quot; or &quot;Add garlic bread to the recipe&quot;) and the AI will rewrite it.
                    </p>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        placeholder="Ask AI to refine this recipe..."
                        className="flex-1 bg-white border border-emerald-200/60 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-stone-850 placeholder:text-stone-400 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRefineWithAi();
                        }}
                      />
                      <button
                        onClick={handleRefineWithAi}
                        disabled={isRefining || !refineInstruction.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-200 disabled:text-stone-400 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {isRefining ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <span>Refine</span>
                        )}
                      </button>
                    </div>
                    {refineError && <p className="text-rose-600 text-[11px] font-semibold mt-1">{refineError}</p>}
                  </div>
                </div>

                {/* Right Column (Appliance Steps & Switcher) */}
                <div className="lg:col-span-7 flex flex-col bg-white p-4 rounded-2xl border border-stone-200/80 shadow-3xs h-full min-h-[400px]">
                  
                  {/* Tabs header & make-default trigger */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-200/60 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">Step-by-Step Instructions</span>
                      <span className="text-[11px] text-stone-400 font-bold">({activeInstructions.length} steps)</span>
                    </div>

                    {/* Active Tab default status and action */}
                    {methodsToDisplay.length > 0 && (
                      <div className="flex items-center gap-2">
                        {methodsToDisplay[0] === activeReviewMethod ? (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500/25" />
                            <span>Default Cooking Method</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => makeMethodDefault(activeReviewMethod)}
                            className="text-[11px] font-extrabold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-2 py-1 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>Set {activeReviewMethod === 'ninja' ? 'Ninja Combi' : 'Oven/Hob'} as Default</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cooking Appliance Tabs Selector */}
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/50 my-3 shrink-0 overflow-x-auto scrollbar-none">
                    {methodsToDisplay.map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setActiveReviewMethod(method)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeReviewMethod === method
                            ? 'bg-white text-stone-900 shadow-sm border border-stone-200/30 font-extrabold'
                            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                        }`}
                      >
                        {method === 'ninja' ? (
                          <>
                            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>Ninja Combi</span>
                          </>
                        ) : (
                          <>
                            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>Oven/Hob</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Steps Content Area with Custom Scrollbar */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 relative scrollbar-thin before:absolute before:left-[17px] before:top-4 before:bottom-4 before:w-0.5 before:bg-stone-200/50 min-h-[150px]">
                    {activeInstructions.length === 0 ? (
                      <div className="text-center text-stone-400 py-10 text-xs">
                        No steps added yet for this method. Click "+ Add Step" below or generate them using AI.
                      </div>
                    ) : (
                      activeInstructions.map((stepText, idx) => (
                        <div key={idx} className="flex gap-3 relative group">
                          {/* Circle Index */}
                          <span className="shrink-0 w-8 h-8 rounded-full border-2 border-stone-200 bg-white text-stone-500 text-xs font-bold font-mono z-10 flex items-center justify-center transition-all group-hover:border-stone-400">
                            {idx + 1}
                          </span>
                          
                          <div className="flex-1 flex gap-2 bg-[#fafaf9] hover:bg-stone-50 border border-stone-200 p-2 rounded-xl transition-all shadow-3xs">
                            <textarea
                              value={stepText}
                              onChange={(e) => {
                                const updatedSteps = [...activeInstructions];
                                updatedSteps[idx] = e.target.value;
                                
                                const updatedMethodInstructions = {
                                  ...(reviewRecipe.methodInstructions || {}),
                                  [activeReviewMethod]: updatedSteps
                                };

                                setReviewRecipe({
                                  ...reviewRecipe,
                                  instructions: activeReviewMethod === reviewRecipe.cookingMethods?.[0] ? updatedSteps : reviewRecipe.instructions,
                                  methodInstructions: updatedMethodInstructions
                                });
                              }}
                              className="flex-1 text-xs text-stone-850 bg-transparent resize-y min-h-[50px] outline-none font-medium leading-relaxed"
                              placeholder={`Instruction Step ${idx + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updatedSteps = activeInstructions.filter((_, i) => i !== idx);
                                const updatedMethodInstructions = {
                                  ...(reviewRecipe.methodInstructions || {}),
                                  [activeReviewMethod]: updatedSteps
                                };

                                setReviewRecipe({
                                  ...reviewRecipe,
                                  instructions: activeReviewMethod === reviewRecipe.cookingMethods?.[0] ? updatedSteps : reviewRecipe.instructions,
                                  methodInstructions: updatedMethodInstructions
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors self-start shrink-0"
                              title="Delete Step"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const updatedSteps = [...activeInstructions, ''];
                        const updatedMethodInstructions = {
                          ...(reviewRecipe.methodInstructions || {}),
                          [activeReviewMethod]: updatedSteps
                        };

                        setReviewRecipe({
                          ...reviewRecipe,
                          instructions: activeReviewMethod === reviewRecipe.cookingMethods?.[0] ? updatedSteps : reviewRecipe.instructions,
                          methodInstructions: updatedMethodInstructions
                        });
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-200/30 cursor-pointer shadow-3xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Next Step</span>
                    </button>
                  </div>

                  {/* Alternative Generation Promoters (On-demand instructions) */}
                  <div className="pt-4 border-t border-stone-200/60 mt-4 shrink-0 space-y-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                      On-Demand Appliance Generation
                    </span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* Ninja Combi Generation Trigger */}
                      {!methodsToDisplay.includes('ninja') && (
                        <button
                          type="button"
                          onClick={() => handleGenerateAlternative('ninja')}
                          disabled={isGeneratingAlternative['ninja']}
                          className="px-3 py-2.5 rounded-xl border border-dashed border-stone-300 hover:border-amber-400 hover:bg-amber-50/20 text-[11px] font-bold text-stone-600 hover:text-stone-900 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isGeneratingAlternative['ninja'] ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                              <span>Generate Ninja Combi</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Oven/Hob Generation Trigger */}
                      {!methodsToDisplay.includes('oven_hob') && (
                        <button
                          type="button"
                          onClick={() => handleGenerateAlternative('oven_hob')}
                          disabled={isGeneratingAlternative['oven_hob']}
                          className="px-3 py-2.5 rounded-xl border border-dashed border-stone-300 hover:border-rose-400 hover:bg-rose-50/20 text-[11px] font-bold text-stone-600 hover:text-stone-900 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isGeneratingAlternative['oven_hob'] ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500/10" />
                              <span>Generate Oven/Hob</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Oven/Hob suitability fallback / generation trigger */}
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer Panel */}
              <div className="px-5 py-4 bg-white border-t border-stone-200/60 flex items-center justify-between shrink-0">
                <div className="text-[11px] font-bold text-stone-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span>Double check ingredients and steps before saving.</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4.5 py-2.5 text-xs font-bold rounded-xl text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveRecipe}
                    className="px-6 py-2.5 text-xs font-extrabold rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Save to Cookbook</span>
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {unmappedItems.length > 0 && (
        <IngredientTriageModal
          store={store}
          unmappedItems={unmappedItems}
          onComplete={handleTriageComplete}
        />
      )}
    </div>
  );
}

