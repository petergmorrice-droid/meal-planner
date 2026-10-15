import React, { useState, useRef, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { IngredientTriageModal } from './IngredientTriageModal';
import { INITIAL_GROCERY_DATABASE } from '../utils/initialGroceryDb';
import { 
  parseRecipeApi, 
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

export default function CookBookTab({ store, onNavigateTab }: { store: any, onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void }) {
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
                          className="text-[10px] text-zinc-400 hover:text-zinc-900 font-medium cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto p-3 space-y-3 flex-1 scrollbar-thin">
                      {/* Dietary Section */}
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
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
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
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
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
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
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
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

                    {/* Display Fields Section */}
                    <div className="pt-3 border-t border-zinc-100">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                        Display Fields
                      </span>
                      <div className="grid grid-cols-2 gap-1">
                      {Object.entries({
                        showPrepTime: 'Prep Time',
                        showCookTime: 'Cook Time',
                        showTotalTime: 'Total Time',
                        showMethod: 'Cooking Method',
                        showVegetarian: 'Vegetarian',
                        showVegan: 'Vegan',
                        showEmojis: 'Emojis'
                      }).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prefs[key as keyof typeof prefs] ?? true}
                            onChange={() => togglePref(key as keyof typeof prefs)}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-3 h-3"
                          />
                          <span className="text-[11px] font-medium text-zinc-700">{label}</span>
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {filteredRecipes.map((recipe: Recipe) => (
              <div
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                className="bg-white p-3 rounded-xl border border-zinc-200/80 hover:border-zinc-300/90 transition-all cursor-pointer shadow-2xs hover:shadow-xs group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <h3 className="font-semibold text-xs text-zinc-900 leading-snug line-clamp-2" title={recipe.name}>
                      {recipe.name}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecipeToDelete(recipe);
                      }}
                      className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all shrink-0 -mr-1 -mt-0.5 cursor-pointer"
                      title={`Delete ${recipe.name}`}
                      aria-label={`Delete ${recipe.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {prefs.showEmojis !== false && (
                    <div className="flex flex-wrap gap-1 mb-2 text-base" onClick={(e) => e.stopPropagation()}>
                      {getRecipeEmojis(recipe).map((emoji) => (
                        <span 
                          key={emoji} 
                          title={getEmojiLabel(emoji)} 
                          className="hover:scale-115 transition-transform cursor-help inline-block select-none"
                        >
                          {emoji}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Time */}
                  {(prefs.showPrepTime || prefs.showCookTime || prefs.showTotalTime) && (
                    <div className="flex flex-col gap-1 mb-1.5 text-[10px] font-medium text-zinc-600">
                      {prefs.showPrepTime && (
                        recipe.methodPrepTime && recipe.methodPrepTime.ninja && recipe.methodPrepTime.oven_hob && recipe.methodPrepTime.ninja !== recipe.methodPrepTime.oven_hob ? (
                          <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                            <span>Prep: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodPrepTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodPrepTime.oven_hob}m</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                            <span>Prep: {recipe.prepTime}m</span>
                          </span>
                        )
                      )}
                      
                      {prefs.showCookTime && (
                        recipe.methodCookTime && recipe.methodCookTime.ninja && recipe.methodCookTime.oven_hob && recipe.methodCookTime.ninja !== recipe.methodCookTime.oven_hob ? (
                          <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                            <span>Cook: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodCookTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodCookTime.oven_hob}m</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                            <span>Cook: {recipe.cookTime}m</span>
                          </span>
                        )
                      )}

                      {prefs.showTotalTime && (
                        <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                          <span>Total: {recipe.prepTime + recipe.cookTime}m</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Health and Cost */}
                  {(prefs.showVegetarian || prefs.showVegan) && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {prefs.showVegetarian && (recipe.isVegetarian || recipe.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()))) && (
                        <span 
                          className="flex items-center gap-1 font-medium text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
                          title="Vegetarian"
                        >
                          <Leaf className="w-2.5 h-2.5 fill-emerald-500/20" />
                          Vegi
                        </span>
                      )}
                      {prefs.showVegan && (recipe.isVegan || recipe.tags?.some(t => ['vegan'].includes(t.toLowerCase()))) && (
                        <span 
                          className="flex items-center gap-1 font-medium text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
                          title="Vegan"
                        >
                          <Leaf className="w-2.5 h-2.5 fill-emerald-500/20" />
                          Vegan
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Cooking Options (Ninja / Hob / Oven) */}
                {prefs.showMethod && (
                  <div className="pt-2 border-t border-zinc-100 flex items-start justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Ninja Combi */}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          (recipe.cookingMethods || ['oven_hob', 'ninja']).includes('ninja')
                            ? 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold'
                            : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                        }`}
                        title={(recipe.cookingMethods || ['oven_hob', 'ninja']).includes('ninja') ? "Ninja Combi / Multi-cooker option available" : "Not suitable for Ninja Combi"}
                      >
                        <Zap className={`w-3 h-3 ${(recipe.cookingMethods || ['oven_hob', 'ninja']).includes('ninja') ? 'text-amber-600 fill-amber-500/20' : 'text-zinc-300'}`} />
                        <span>Ninja</span>
                      </span>

                      {/* Oven / Hob */}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          (recipe.cookingMethods || ['oven_hob', 'ninja']).includes('oven_hob')
                            ? 'bg-rose-50 text-rose-900 border border-rose-300 font-semibold'
                            : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                        }`}
                        title={(recipe.cookingMethods || ['oven_hob', 'ninja']).includes('oven_hob') ? "Oven or Hob option available" : "Not suitable for Oven or Hob"}
                      >
                        <Flame className={`w-3 h-3 ${(recipe.cookingMethods || ['oven_hob', 'ninja']).includes('oven_hob') ? 'text-rose-600 fill-rose-500/20' : 'text-zinc-300'}`} />
                        <span>Oven/Hob</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
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

function formatAmount(amount: number): string {
  if (amount === 0) return '0';
  if (Math.abs(amount - Math.round(amount)) < 0.001) {
    return Math.round(amount).toString();
  }
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toString();
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

export function RecipeModal({ 
  store,
  recipe, 
  onClose,
  initialServings,
  bannerMessage,
  onStartCook,
  onNavigateTab
}: { 
  store?: any;
  recipe: Recipe; 
  onClose: () => void;
  initialServings?: number;
  bannerMessage?: React.ReactNode;
  onStartCook?: (servings?: number) => void;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void;
}) {
  const basePortions = recipe.servings || 2;
  const [portions, setPortions] = useState<number>(initialServings ?? basePortions);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<'info' | 'recipe'>('info');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState<Recipe>(recipe);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isEditingWithAi, setIsEditingWithAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [isIngredientsCollapsed, setIsIngredientsCollapsed] = useState(false);

  // Sync editedRecipe with recipe if recipe changes
  useEffect(() => {
    setEditedRecipe(recipe);
  }, [recipe]);

  // Default to the first cooking method if available, otherwise just use 'ninja'
  const defaultMethod = editedRecipe.cookingMethods && editedRecipe.cookingMethods.length > 0 
    ? editedRecipe.cookingMethods[0] 
    : 'ninja';
  const [selectedCookingMethod, setSelectedCookingMethod] = useState<CookingMethod>(defaultMethod as CookingMethod);

  // Ensure selected cooking method is valid based on recipe cooking methods
  useEffect(() => {
    if (editedRecipe.cookingMethods && editedRecipe.cookingMethods.length > 0) {
      if (!editedRecipe.cookingMethods.includes(selectedCookingMethod)) {
        setSelectedCookingMethod(editedRecipe.cookingMethods[0]);
      }
    }
  }, [editedRecipe.cookingMethods]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditing]);

  const scale = portions / basePortions;

  const toggleIngredient = (id: string) => {
    setCheckedIngredients(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleStep = (idx: number) => {
    setCompletedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSaveEdit = () => {
    if (store) {
      store.updateRecipe(editedRecipe);
    }
    setIsEditing(false);
  };

  const handleAiEdit = async () => {
    if (!aiInstruction.trim()) return;
    setIsEditingWithAi(true);
    setAiError('');

    try {
      const updatedRecipe = await editRecipeApi(editedRecipe, aiInstruction);

      setEditedRecipe(updatedRecipe);
      if (store) {
        store.updateRecipe(updatedRecipe);
      }
      setAiInstruction('');
      setIsEditing(false);
      setShowAiPrompt(false);
    } catch (err: any) {
      if (err.message === 'GEMINI_API_KEY_MISSING') {
        setAiError('Gemini API key is missing. Please configure it in Settings Connections.');
      } else {
        setAiError(err.message || 'Something went wrong');
      }
    } finally {
      setIsEditingWithAi(false);
    }
  };

  const [isGeneratingAlternative, setIsGeneratingAlternative] = useState<Record<string, boolean>>({});

  const handleGenerateAlternative = async (targetMethod: CookingMethod) => {
    setIsGeneratingAlternative(prev => ({ ...prev, [targetMethod]: true }));
    try {
      const existingMethods = editedRecipe.cookingMethods && editedRecipe.cookingMethods.length > 0 
        ? editedRecipe.cookingMethods 
        : ['oven_hob'];
      const primaryMethod = existingMethods[0] || 'oven_hob';
      const existingInstructions = editedRecipe.methodInstructions?.[primaryMethod] || editedRecipe.instructions || [];

      const data = await generateAlternativeInstructionsApi(
        editedRecipe.name,
        editedRecipe.ingredients,
        targetMethod,
        existingInstructions,
        existingMethods
      );

      const updatedCookingMethods = [...(editedRecipe.cookingMethods || existingMethods)];
      if (!updatedCookingMethods.includes(targetMethod)) {
        updatedCookingMethods.push(targetMethod);
      }

      const updatedMethodInstructions = {
        ...(editedRecipe.methodInstructions || {}),
        [targetMethod]: data.instructions || []
      };

      const updatedMethodPrepTime = {
        ...(editedRecipe.methodPrepTime || {}),
        [targetMethod]: data.prepTime || 15
      };

      const updatedMethodCookTime = {
        ...(editedRecipe.methodCookTime || {}),
        [targetMethod]: data.cookTime || 20
      };

      const finalRecipe: Recipe = {
        ...editedRecipe,
        cookingMethods: updatedCookingMethods as CookingMethod[],
        methodInstructions: updatedMethodInstructions,
        methodPrepTime: updatedMethodPrepTime,
        methodCookTime: updatedMethodCookTime
      };

      setEditedRecipe(finalRecipe);
      setSelectedCookingMethod(targetMethod);

      if (store) {
        store.updateRecipe(finalRecipe);
      }
    } catch (err: any) {
      console.error('Failed to generate alternative:', err);
      if (err.message === 'GEMINI_API_KEY_MISSING') {
        alert('Gemini API key is missing. Please configure it in Settings Connections.');
      } else {
        alert(err.message || 'Failed to generate alternative instructions.');
      }
    } finally {
      setIsGeneratingAlternative(prev => ({ ...prev, [targetMethod]: false }));
    }
  };

  const isVeg = editedRecipe.isVegetarian || editedRecipe.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()));
  const isVgn = editedRecipe.isVegan || editedRecipe.tags?.some(t => ['vegan'].includes(t.toLowerCase()));

  const methodsToDisplay = editedRecipe.cookingMethods && editedRecipe.cookingMethods.length > 0 
    ? editedRecipe.cookingMethods 
    : (editedRecipe.methodInstructions && Object.keys(editedRecipe.methodInstructions).length > 0
        ? Object.keys(editedRecipe.methodInstructions) as CookingMethod[]
        : ['oven_hob']);

  const getActiveInstructions = (): string[] => {
    if (selectedCookingMethod && editedRecipe.methodInstructions?.[selectedCookingMethod]) {
      return editedRecipe.methodInstructions[selectedCookingMethod]!;
    }
    return editedRecipe.instructions || [];
  };

  const activeInstructions = getActiveInstructions();

  // Reset check-offs when switching cooking method
  useEffect(() => {
    setCompletedSteps({});
  }, [selectedCookingMethod]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAF9F6] w-full max-w-5xl h-[92vh] sm:h-[95vh] max-h-[92vh] sm:max-h-[95vh] rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200/80 flex flex-col overflow-hidden animate-in zoom-in-98 duration-200">
        
        {/* Cover Banner with Inline Editor - Compact layout to save vertical space on mobile */}
        <div className="relative bg-gradient-to-r from-[#FAF9F6] via-[#FFF] to-[#FAF9F6] text-stone-900 p-3 sm:p-4 shrink-0 flex flex-col justify-between overflow-hidden border-b border-stone-200/60 shadow-3xs">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.06),transparent_55%)] pointer-events-none" />
          
          <div className="relative flex items-center justify-between gap-4 z-10 w-full">
            <div className="min-w-0 flex-1">
              <div className="flex flex-col">
                {isEditing ? (
                  <input
                    value={editedRecipe.name}
                    onChange={(e) => setEditedRecipe({...editedRecipe, name: e.target.value})}
                    className="bg-white text-stone-950 placeholder-stone-400 border border-stone-200 rounded-xl px-3.5 py-1.5 text-xs sm:text-base font-bold w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm transition-all"
                    placeholder="Recipe Name"
                  />
                ) : (
                  <>
                    <h2 className="text-sm sm:text-xl font-extrabold tracking-tight text-stone-900 leading-tight truncate max-w-[50vw] sm:max-w-none">
                      {editedRecipe.name}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-stone-500 font-semibold mt-0.5">
                      <span>Prep: {editedRecipe.prepTime || 0}m</span>
                      <span aria-hidden="true" className="text-stone-300">·</span>
                      <span>Cook: {editedRecipe.cookTime || 0}m</span>
                      <span aria-hidden="true" className="text-stone-300">·</span>
                      <span>Total: {(editedRecipe.prepTime || 0) + (editedRecipe.cookTime || 0)}m</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actions Panel - Header buttons */}
            <div className="flex items-center gap-1.5 shrink-0 self-center">
              {isEditing && (
                <div className="flex items-center gap-1.5">
                  {showAiPrompt ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 animate-in slide-in-from-right-3 duration-200">
                        <input
                          type="text"
                          value={aiInstruction}
                          onChange={(e) => setAiInstruction(e.target.value)}
                          placeholder="e.g. 'Make it dairy-free'..."
                          className="text-xs bg-white border border-stone-200 rounded-full px-3 py-1.5 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36 sm:w-48 shadow-2xs"
                          disabled={isEditingWithAi}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAiEdit();
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAiEdit}
                          disabled={!aiInstruction.trim() || isEditingWithAi}
                          className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-500 rounded-full transition-all disabled:opacity-50 shadow-sm shrink-0 cursor-pointer"
                          title="Submit AI edit"
                        >
                          {isEditingWithAi ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAiPrompt(false);
                            setAiError('');
                          }}
                          className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-full border border-stone-200 transition-all shrink-0 cursor-pointer"
                          title="Cancel AI Prompt"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {aiError && (
                        <span className="text-[9px] text-rose-600 font-semibold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <span>{aiError}</span>
                          {aiError.includes('missing') && onNavigateTab && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateTab('settings');
                              }}
                              className="underline text-indigo-600 hover:text-indigo-800 ml-1 font-bold cursor-pointer"
                            >
                              Go to Settings
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAiPrompt(true)}
                      className="p-2.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-full transition-all shrink-0 cursor-pointer shadow-2xs hover:shadow-sm"
                      title="AI Edit Recipe"
                    >
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    </button>
                  )}
                </div>
              )}
              <button 
                onClick={() => {
                  setIsEditing(!isEditing);
                  setShowAiPrompt(false);
                  setAiError('');
                }} 
                className={`p-2.5 rounded-full transition-all shrink-0 cursor-pointer border ${
                  isEditing 
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200/80 hover:bg-emerald-100 shadow-sm scale-105' 
                    : 'text-stone-500 hover:text-stone-900 bg-white hover:bg-stone-50 border-stone-200 shadow-2xs hover:shadow-sm'
                }`}
                title={isEditing ? "Exit Edit Mode" : "Edit Recipe"}
                aria-label={isEditing ? "Exit Edit Mode" : "Edit Recipe"}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button 
                onClick={onClose} 
                className="p-2.5 text-stone-500 hover:text-stone-900 rounded-full bg-white hover:bg-stone-50 border border-stone-200 transition-all shrink-0 cursor-pointer shadow-2xs hover:shadow-sm"
                title="Close Panel"
                aria-label="Close Panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Elegant Segmented Tab Bar Switcher */}
          <div className="mt-4 pt-1 flex justify-center z-10">
            <div className="flex items-center gap-1 p-1 bg-stone-200/70 border border-stone-300/35 rounded-2xl w-full max-w-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'info'
                    ? 'bg-white text-stone-950 shadow-sm font-extrabold border border-stone-200/50'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Info</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recipe')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'recipe'
                    ? 'bg-white text-stone-950 shadow-sm font-extrabold border border-stone-200/50'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Instructions</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Workspace Container */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#FAF9F6]">
          
          {/* TAB 1: INFO & METADATA */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-200">
              <div className="max-w-5xl mx-auto space-y-5">
                
                {/* Kitchen Timings & Appliances - Now at the very top of Info Section */}
                <div className="bg-white rounded-2xl border border-stone-200/60 p-3 sm:p-5 shadow-3xs space-y-3">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {isEditing ? (
                      <>
                        <div>
                          <label className="text-[8px] sm:text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-0.5 sm:mb-1 block text-center sm:text-left">Prep (mins)</label>
                          <input 
                            type="number" 
                            value={editedRecipe.prepTime || 0}
                            onChange={e => setEditedRecipe({...editedRecipe, prepTime: parseInt(e.target.value) || 0})}
                            className="w-full text-[11px] sm:text-xs font-bold text-stone-950 border border-stone-200 rounded-lg sm:rounded-xl px-1 py-1 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs text-center font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] sm:text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-0.5 sm:mb-1 block text-center sm:text-left">Cook (mins)</label>
                          <input 
                            type="number" 
                            value={editedRecipe.cookTime || 0}
                            onChange={e => setEditedRecipe({...editedRecipe, cookTime: parseInt(e.target.value) || 0})}
                            className="w-full text-[11px] sm:text-xs font-bold text-stone-950 border border-stone-200 rounded-lg sm:rounded-xl px-1 py-1 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs text-center font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] sm:text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-0.5 sm:mb-1 block text-center sm:text-left">Total (mins)</label>
                          <div className="w-full text-[11px] sm:text-xs font-extrabold text-stone-500 border border-stone-200 rounded-lg sm:rounded-xl px-1 py-1 bg-stone-100 shadow-2xs text-center font-mono select-none h-[26px] sm:h-[34px] flex items-center justify-center">
                            {(editedRecipe.prepTime || 0) + (editedRecipe.cookTime || 0)}m
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-stone-50 border border-stone-150/60 p-1.5 sm:p-3 rounded-xl flex items-center gap-1.5 sm:gap-3 shadow-3xs min-w-0">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                            <Clock className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 stroke-[1.8]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[8px] sm:text-[9px] text-stone-400 font-bold uppercase tracking-wider block">Prep</span>
                            <span className="text-[11px] sm:text-sm font-extrabold text-stone-800 tracking-tight block">{editedRecipe.prepTime || 0} mins</span>
                          </div>
                        </div>
                        <div className="bg-stone-50 border border-stone-150/60 p-1.5 sm:p-3 rounded-xl flex items-center gap-1.5 sm:gap-3 shadow-3xs min-w-0">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                            <Utensils className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 stroke-[1.8]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[8px] sm:text-[9px] text-stone-400 font-bold uppercase tracking-wider block">Cook</span>
                            <span className="text-[11px] sm:text-sm font-extrabold text-stone-800 tracking-tight block">{editedRecipe.cookTime || 0} mins</span>
                          </div>
                        </div>
                        <div className="bg-stone-50 border border-stone-150/60 p-1.5 sm:p-3 rounded-xl flex items-center gap-1.5 sm:gap-3 shadow-3xs min-w-0">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                            <Timer className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 stroke-[1.8]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[8px] sm:text-[9px] text-stone-400 font-bold uppercase tracking-wider block">Total</span>
                            <span className="text-[11px] sm:text-sm font-extrabold text-stone-800 tracking-tight block">{(editedRecipe.prepTime || 0) + (editedRecipe.cookTime || 0)} mins</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Cooking Appliances section with no separate title header */}
                  <div className="pt-0.5">
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className={`flex flex-col sm:flex-row items-center justify-center gap-1 text-[9px] sm:text-xs font-semibold p-1.5 rounded-xl border cursor-pointer transition-colors ${
                          (editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('ninja')
                            ? 'border-amber-200 bg-amber-50/50 text-amber-900 font-bold'
                            : 'border-stone-200 bg-stone-50/30 text-stone-400'
                        }`}>
                          <span className="flex items-center gap-1 truncate">
                            <Zap className={`w-3 h-3 shrink-0 ${ (editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('ninja') ? 'text-amber-500' : 'text-stone-300' }`} />
                            <span className="hidden sm:inline">Ninja Combi</span>
                            <span className="sm:hidden">Ninja</span>
                          </span>
                          <input 
                            type="checkbox"
                            checked={(editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('ninja')}
                            onChange={e => {
                              const current = editedRecipe.cookingMethods || ['ninja', 'oven_hob'];
                              const updated = e.target.checked 
                                ? [...current, 'ninja'] 
                                : current.filter(c => c !== 'ninja');
                              setEditedRecipe({...editedRecipe, cookingMethods: updated as CookingMethod[]});
                            }}
                            className="rounded text-amber-600 focus:ring-amber-500 w-3 h-3 border-stone-300 cursor-pointer"
                          />
                        </label>

                        <label className={`flex flex-col sm:flex-row items-center justify-center gap-1 text-[9px] sm:text-xs font-semibold p-1.5 rounded-xl border cursor-pointer transition-colors ${
                          (editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('oven_hob')
                            ? 'border-rose-200 bg-rose-50/50 text-rose-900 font-bold'
                            : 'border-stone-200 bg-stone-50/30 text-stone-400'
                        }`}>
                          <span className="flex items-center gap-1 truncate">
                            <Flame className={`w-3 h-3 shrink-0 ${ (editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('oven_hob') ? 'text-rose-500' : 'text-stone-300' }`} />
                            <span className="hidden sm:inline">Oven or Hob</span>
                            <span className="sm:hidden">Oven/Hob</span>
                          </span>
                          <input 
                            type="checkbox"
                            checked={(editedRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('oven_hob')}
                            onChange={e => {
                              const current = editedRecipe.cookingMethods || ['ninja', 'oven_hob'];
                              const updated = e.target.checked 
                                ? [...current, 'oven_hob'] 
                                : current.filter(c => c !== 'oven_hob');
                              setEditedRecipe({...editedRecipe, cookingMethods: updated as CookingMethod[]});
                            }}
                            className="rounded text-rose-600 focus:ring-rose-500 w-3 h-3 border-stone-300 cursor-pointer"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { key: 'ninja', label: 'Ninja Combi', mobileLabel: 'Ninja', icon: Zap, colorClass: 'bg-amber-50 text-amber-950 border-amber-200', iconColor: 'text-amber-500' },
                          { key: 'oven_hob', label: 'Oven / Hob', mobileLabel: 'Oven/Hob', icon: Flame, colorClass: 'bg-rose-50 text-rose-950 border-rose-200', iconColor: 'text-rose-500' }
                        ].map(({ key, label, mobileLabel, icon: Icon, colorClass, iconColor }) => {
                          const isIncluded = (editedRecipe.cookingMethods || ['oven_hob', 'ninja']).includes(key as CookingMethod);
                          return (
                            <span
                              key={key}
                              className={`inline-flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold border transition-all truncate text-center ${
                                isIncluded
                                  ? colorClass
                                  : 'bg-stone-50 text-stone-400 border-stone-200/60'
                              }`}
                            >
                              <Icon className={`w-3 h-3 shrink-0 ${isIncluded ? iconColor : 'text-stone-300'}`} />
                              <span className="hidden sm:inline truncate">{label}</span>
                              <span className="sm:hidden truncate">{mobileLabel}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Dietary badges immediately underneath the appliance badges */}
                  <div className="pt-2 border-t border-stone-100">
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className={`flex items-center justify-center gap-1.5 text-[9px] sm:text-xs font-semibold p-1.5 rounded-xl border cursor-pointer transition-colors ${
                          editedRecipe.isVegetarian
                            ? 'border-emerald-250 bg-emerald-50 text-emerald-900 font-bold'
                            : 'border-stone-250/30 bg-stone-50/10 text-stone-400'
                        }`}>
                          <Leaf className={`w-3 h-3 shrink-0 ${editedRecipe.isVegetarian ? 'text-emerald-500 fill-emerald-500/10' : 'text-stone-300'}`} />
                          <span>Vegetarian</span>
                          <input 
                            type="checkbox"
                            checked={!!editedRecipe.isVegetarian}
                            onChange={e => setEditedRecipe({...editedRecipe, isVegetarian: e.target.checked})}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3 border-stone-300 cursor-pointer ml-1"
                          />
                        </label>
                        <label className={`flex items-center justify-center gap-1.5 text-[9px] sm:text-xs font-semibold p-1.5 rounded-xl border cursor-pointer transition-colors ${
                          editedRecipe.isVegan
                            ? 'border-emerald-250 bg-emerald-50 text-emerald-900 font-bold'
                            : 'border-stone-250/30 bg-stone-50/10 text-stone-400'
                        }`}>
                          <Leaf className={`w-3 h-3 shrink-0 ${editedRecipe.isVegan ? 'text-emerald-500 fill-emerald-500/10' : 'text-stone-300'}`} />
                          <span>Vegan</span>
                          <input 
                            type="checkbox"
                            checked={!!editedRecipe.isVegan}
                            onChange={e => setEditedRecipe({...editedRecipe, isVegan: e.target.checked})}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3 border-stone-300 cursor-pointer ml-1"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        <span
                          className={`inline-flex items-center justify-center gap-1.5 px-1.5 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold border transition-all truncate text-center ${
                            isVeg
                              ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                              : 'bg-stone-50 text-stone-400 border-stone-200/60'
                          }`}
                        >
                          <Leaf className={`w-3 h-3 shrink-0 ${isVeg ? 'text-emerald-500 fill-emerald-500/10' : 'text-stone-300'}`} />
                          <span className="truncate">Vegetarian</span>
                        </span>
                        <span
                          className={`inline-flex items-center justify-center gap-1.5 px-1.5 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold border transition-all truncate text-center ${
                            isVgn
                              ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                              : 'bg-stone-50 text-stone-400 border-stone-200/60'
                          }`}
                        >
                          <Leaf className={`w-3 h-3 shrink-0 ${isVgn ? 'text-emerald-500 fill-emerald-500/10' : 'text-stone-300'}`} />
                          <span className="truncate">Vegan</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Recipe Overview - Scrollable Tags & Description */}
                <div className="bg-white rounded-2xl border border-stone-200/60 p-4 sm:p-5 shadow-3xs space-y-3">
                  {/* Category / Tag list - unboxed elegant typography separators */}
                  {editedRecipe.tags && editedRecipe.tags.length > 0 && !isEditing && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs font-bold tracking-wider text-emerald-700 uppercase">
                      {editedRecipe.tags.slice(0, 6).map((tag, idx) => (
                        <React.Fragment key={tag}>
                          {idx > 0 && <span className="text-stone-300 font-normal">·</span>}
                          <span>{tag}</span>
                        </React.Fragment>
                      ))}
                      {editedRecipe.tags.length > 6 && (
                        <>
                          <span className="text-stone-300 font-normal">·</span>
                          <span>+{editedRecipe.tags.length - 6} More</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Description Editor / Viewer */}
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Description</label>
                      <textarea
                        value={editedRecipe.description || ''}
                        onChange={(e) => setEditedRecipe({...editedRecipe, description: e.target.value})}
                        className="bg-stone-50 text-stone-800 placeholder-stone-400 border border-stone-200 rounded-xl px-3.5 py-2 text-xs w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 min-h-[64px] shadow-sm transition-all"
                        placeholder="Describe this delightful recipe..."
                      />
                    </div>
                  ) : (
                    editedRecipe.description && (
                      <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
                        {editedRecipe.description}
                      </p>
                    )
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Visual Cover Image and Dietary Overview (Left block, 5 cols) */}
                <div className="md:col-span-5 space-y-5">
                  {/* Recipe Image Card - Only shown if imageUrl is present */}
                  {editedRecipe.imageUrl && (
                    <div className="relative rounded-2xl overflow-hidden bg-stone-100 border border-stone-200/50 h-44 sm:h-52 flex items-center justify-center shadow-3xs group shrink-0">
                      <img 
                        src={editedRecipe.imageUrl} 
                        alt={editedRecipe.name}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Danger Zone (Right block, 7 cols) */}
                <div className="md:col-span-7 space-y-5">
                  {/* Manual Admin controls for Delete in Info tab Danger Zone */}
                  {isEditing && store?.deleteRecipe && (
                    <div className="pt-4 border-t border-stone-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-stone-800 block uppercase tracking-wider">Danger Zone</span>
                        <span className="text-[10px] text-stone-400">This action permanently deletes this recipe</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all border border-rose-200/40 flex items-center gap-1.5 cursor-pointer shadow-3xs"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Recipe</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

          {/* TAB 2: RECIPE (INGREDIENTS & STEPS) */}
          {activeTab === 'recipe' && (
            <div className="flex-1 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0 bg-[#FAF9F6] animate-in fade-in duration-200">
              
              {/* Left Column (38% space on desktop) - Ingredients Checklist */}
              <div className="col-span-1 md:col-span-5 border-b md:border-b-0 md:border-r border-stone-200/60 flex flex-col md:min-h-0 bg-white shadow-3xs">
                <div className="p-4 sm:p-5 md:p-6 space-y-5 md:flex-1 md:overflow-y-auto scrollbar-thin">
                  
                  {/* Ingredients List */}
                  <div className="space-y-3.5">
                    <div 
                      onClick={() => setIsIngredientsCollapsed(!isIngredientsCollapsed)}
                      className="flex items-center justify-between pb-2 border-b border-stone-200/60 cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-2">
                        {isIngredientsCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-stone-500 transition-transform group-hover:text-stone-800" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-stone-500 transition-transform group-hover:text-stone-800" />
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-baseline gap-1.5">
                            <h3 className="text-xs sm:text-sm font-bold text-stone-900 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">Ingredients</h3>
                            <span className="text-[11px] text-stone-400">({editedRecipe.ingredients.length} items)</span>
                          </div>

                          {/* Portion Scaler directly to the right of the Ingredients Title */}
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 bg-stone-100 border border-stone-200/60 rounded-xl p-0.5 shadow-3xs ml-1 sm:ml-2"
                          >
                            <div className="flex items-center gap-1 px-1.5 text-stone-600">
                              <Users className="w-3 h-3 shrink-0" />
                              {isEditing ? (
                                <input 
                                  type="number" 
                                  min="1"
                                  max="24"
                                  value={editedRecipe.servings || 2}
                                  onChange={e => setEditedRecipe({...editedRecipe, servings: parseInt(e.target.value) || 2})}
                                  className="w-7 text-center text-[10px] font-bold text-stone-900 bg-transparent focus:outline-none focus:ring-0 p-0"
                                />
                              ) : (
                                <span className="font-extrabold text-stone-900 text-[10px] sm:text-xs tabular-nums">
                                  {portions}
                                </span>
                              )}
                            </div>
                            
                            {!isEditing && (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPortions(p => Math.max(1, p - 1));
                                  }}
                                  disabled={portions <= 1}
                                  className="w-5 h-5 rounded-md flex items-center justify-center text-stone-600 bg-white hover:bg-stone-50 disabled:opacity-30 shadow-3xs cursor-pointer"
                                  title="Decrease portions"
                                >
                                  <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPortions(p => Math.min(24, p + 1));
                                  }}
                                  disabled={portions >= 24}
                                  className="w-5 h-5 rounded-md flex items-center justify-center text-stone-600 bg-white hover:bg-stone-50 disabled:opacity-30 shadow-3xs cursor-pointer"
                                  title="Increase portions"
                                >
                                  <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {!isEditing && !isIngredientsCollapsed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCheckedIngredients({});
                          }}
                          disabled={Object.keys(checkedIngredients).length === 0}
                          className="text-[10px] font-bold text-stone-400 hover:text-emerald-700 disabled:opacity-0 transition-all cursor-pointer"
                        >
                          Clear Checks
                        </button>
                      )}
                    </div>

                    {!isIngredientsCollapsed && (
                      <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                        {editedRecipe.ingredients.map((ing, idx) => {
                          const scaledAmount = formatAmount(ing.amount * scale);
                          const isChecked = !!checkedIngredients[ing.id];
                          
                          if (isEditing) {
                            return (
                              <div key={ing.id || idx} className="flex gap-1.5 py-1.5 items-center bg-white p-2 rounded-xl border border-stone-200 shadow-3xs">
                                <input
                                  type="number"
                                  step="any"
                                  value={ing.amount}
                                  onChange={e => {
                                    const updated = [...editedRecipe.ingredients];
                                    updated[idx].amount = parseFloat(e.target.value) || 0;
                                    setEditedRecipe({...editedRecipe, ingredients: updated});
                                  }}
                                  className="w-12 text-xs border border-stone-200 bg-stone-50 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-center"
                                  placeholder="Qty"
                                />
                                <input
                                  type="text"
                                  value={ing.unit}
                                  onChange={e => {
                                    const updated = [...editedRecipe.ingredients];
                                    updated[idx].unit = e.target.value;
                                    setEditedRecipe({...editedRecipe, ingredients: updated});
                                  }}
                                  className="w-14 text-xs border border-stone-200 bg-stone-50 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                                  placeholder="Unit"
                                />
                                <input
                                  type="text"
                                  value={ing.name}
                                  onChange={e => {
                                    const updated = [...editedRecipe.ingredients];
                                    updated[idx].name = e.target.value;
                                    setEditedRecipe({...editedRecipe, ingredients: updated});
                                  }}
                                  className="flex-1 text-xs border border-stone-200 bg-stone-50 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                                  placeholder="Ingredient Name"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = editedRecipe.ingredients.filter((_, i) => i !== idx);
                                    setEditedRecipe({...editedRecipe, ingredients: updated});
                                  }}
                                  className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={ing.id || idx}
                              onClick={() => toggleIngredient(ing.id)}
                              className={`flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer transition-all border ${
                                isChecked 
                                  ? 'bg-stone-50/40 border-stone-150 opacity-60' 
                                  : 'bg-white border-transparent hover:border-stone-200/60 shadow-3xs hover:shadow-2xs'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                    isChecked
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-stone-300 bg-white'
                                  }`}
                                >
                                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <div className="min-w-0">
                                  <span className={`text-xs font-bold block tracking-tight ${
                                    isChecked ? 'line-through text-stone-400 font-normal' : 'text-stone-800'
                                  }`}>
                                    {ing.name}
                                  </span>
                                  {ing.category && (
                                    <span className="text-[8px] uppercase tracking-wider text-stone-400 font-extrabold block mt-0.5">
                                      {ing.category}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-xs font-bold tabular-nums shrink-0 ml-3 font-mono ${
                                isChecked ? 'text-stone-400' : 'text-stone-900'
                              }`}>
                                {scaledAmount} <span className="text-stone-500 font-medium text-[10px]">{ing.unit}</span>
                              </span>
                            </div>
                          );
                        })}
                        
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...editedRecipe.ingredients, {
                                id: crypto.randomUUID(),
                                name: '',
                                amount: 1,
                                unit: 'piece',
                                category: ''
                              }];
                              setEditedRecipe({...editedRecipe, ingredients: updated});
                            }}
                            className="w-full flex items-center justify-center gap-1 py-2 mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-200/40 cursor-pointer shadow-3xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Ingredient</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (62% space on desktop) - Cooking Appliance Sub-tabs & Checkable Cooking Steps */}
              <div className="col-span-1 md:col-span-7 flex flex-col md:min-h-0 bg-[#FAF9F6]">
                <div className="p-4 sm:p-5 md:p-6 space-y-6 md:flex-1 md:overflow-y-auto scrollbar-thin">
                  
                  {/* Steps section */}
                  <div className="space-y-4">
                    
                    {/* Cooking Method Selector / Switcher Sub-tabs */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-stone-200/60">
                      <div className="flex items-baseline gap-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-stone-900 uppercase tracking-wider">Cooking Instructions</h3>
                        <span className="text-[11px] text-stone-400">({activeInstructions.length} steps)</span>
                      </div>

                      {/* Appliance Switcher Tab Controls - Segmented, sleek styling */}
                      {methodsToDisplay.length > 1 && !isEditing && (
                        <div className="flex items-center gap-0.5 bg-stone-150/80 rounded-xl p-1 border border-stone-200/40 shadow-3xs">
                          {methodsToDisplay.map(method => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setSelectedCookingMethod(method)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize flex items-center gap-1.5 transition-all cursor-pointer ${
                                selectedCookingMethod === method
                                  ? 'bg-white text-stone-900 shadow-sm border border-stone-200/30 font-extrabold'
                                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100/50'
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
                      )}
                    </div>

                    {/* Step-by-step cooking steps checklists */}
                    <div className="space-y-3 relative before:absolute before:left-[17px] before:top-4 before:bottom-4 before:w-0.5 before:bg-stone-200/50">
                      {activeInstructions.map((step, idx) => {
                        const isStepCompleted = !!completedSteps[idx];
                        
                        return (
                          <div 
                            key={idx} 
                            onClick={() => !isEditing && toggleStep(idx)}
                            className={`flex gap-3.5 relative group ${!isEditing ? 'cursor-pointer' : ''}`}
                          >
                            {/* Interactive sphere index / check icon */}
                            <span className={`shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold font-mono z-10 transition-all ${
                              isStepCompleted 
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs scale-95' 
                                : 'bg-white border-stone-200 text-stone-500 group-hover:border-stone-400 group-hover:text-stone-800 shadow-3xs'
                            }`}>
                              {isStepCompleted ? (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ) : (
                                idx + 1
                              )}
                            </span>
                            
                            {isEditing ? (
                              <div className="flex-1 flex gap-2 bg-white p-2.5 rounded-xl border border-stone-200 shadow-3xs">
                                <textarea
                                  value={step}
                                  onChange={(e) => {
                                    const updated = [...activeInstructions];
                                    updated[idx] = e.target.value;
                                    
                                    if (selectedCookingMethod) {
                                      const currentMethodInstructions = editedRecipe.methodInstructions || {};
                                      setEditedRecipe({
                                        ...editedRecipe,
                                        methodInstructions: {
                                          ...currentMethodInstructions,
                                          [selectedCookingMethod]: updated
                                        }
                                      });
                                    } else {
                                      setEditedRecipe({
                                        ...editedRecipe,
                                        instructions: updated
                                      });
                                    }
                                  }}
                                  className="flex-1 text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-[56px] resize-y"
                                  placeholder={`Step ${idx + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = activeInstructions.filter((_, i) => i !== idx);
                                    if (selectedCookingMethod) {
                                      const currentMethodInstructions = editedRecipe.methodInstructions || {};
                                      setEditedRecipe({
                                        ...editedRecipe,
                                        methodInstructions: {
                                          ...currentMethodInstructions,
                                          [selectedCookingMethod]: updated
                                        }
                                      });
                                    } else {
                                      setEditedRecipe({
                                        ...editedRecipe,
                                        instructions: updated
                                      });
                                    }
                                  }}
                                  className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors self-start"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className={`flex-1 pt-1.5 transition-all ${
                                isStepCompleted ? 'opacity-50 text-stone-400 line-through' : 'text-stone-800'
                              }`}>
                                <p className="text-xs sm:text-sm font-medium leading-relaxed">
                                  {scaleRecipeStepQuantities(step, editedRecipe.ingredients, scale)}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...activeInstructions, ''];
                            if (selectedCookingMethod) {
                              const currentMethodInstructions = editedRecipe.methodInstructions || {};
                              setEditedRecipe({
                                ...editedRecipe,
                                methodInstructions: {
                                  ...currentMethodInstructions,
                                  [selectedCookingMethod]: updated
                                }
                              });
                            } else {
                              setEditedRecipe({
                                ...editedRecipe,
                                instructions: updated
                              });
                            }
                          }}
                          className="w-full flex items-center justify-center gap-1 py-2.5 mt-4 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-200/40 cursor-pointer shadow-3xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Next Step</span>
                        </button>
                      )}
                    </div>

                    {/* Alternative Generation Promoters (On-demand instructions) for existing recipes */}
                    {!isEditing && (
                      <div className="pt-4 border-t border-stone-200/60 mt-4 shrink-0 space-y-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
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
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Premium Action Footer Desk - Bright, elegant layout with strong CTAs */}
        <div className="px-5 py-4 bg-white border-t border-stone-200/60 flex items-center justify-between shrink-0">
          
          {/* Helpful helpful hint - hidden on mobile */}
          <div className="hidden sm:block text-[11px] text-stone-500 font-medium">
            {!isEditing ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> Cross off ingredients and instruction steps as you cook.
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Manual editor is active. Save changes to update database.
              </span>
            )}
          </div>

          {/* Action buttons suite */}
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditedRecipe(recipe);
                    setIsEditing(false);
                  }}
                  className="flex-1 sm:flex-none px-4.5 py-2.5 text-xs font-bold rounded-xl text-stone-600 bg-white hover:bg-stone-50 border border-stone-200 transition-all cursor-pointer text-center shadow-3xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="flex-1 sm:flex-none px-5.5 py-2.5 text-xs font-bold rounded-xl text-white bg-stone-900 hover:bg-stone-800 shadow-md active:scale-98 transition-all cursor-pointer text-center"
                >
                  Save Recipe
                </button>
              </>
            ) : (
              <>
                {onStartCook && (
                  <button
                    type="button"
                    onClick={() => onStartCook(portions)}
                    className="w-full sm:w-auto flex-1 sm:flex-none px-6.5 py-3 text-xs sm:text-sm font-extrabold rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/15 cursor-pointer"
                  >
                    <ChefHat className="w-4 h-4 stroke-[2.5]" />
                    <span>get cooking!</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Floating Delete Confirmation Modal overlay */}
        {showDeleteConfirm && (
          <div 
            className="fixed inset-0 z-60 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
          >
            <div 
              className="bg-white rounded-2xl p-5 max-w-sm w-full border border-stone-200/90 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-extrabold text-stone-900">Delete Recipe</h4>
                  <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-stone-800">&quot;{editedRecipe.name}&quot;</span>? This will permanently remove it from your cookbook.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3.5 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 rounded-lg border border-stone-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (store?.deleteRecipe) {
                      store.deleteRecipe(editedRecipe.id);
                    }
                    setShowDeleteConfirm(false);
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
      }
      
      const allItems = [
        ...INITIAL_GROCERY_DATABASE,
        ...Object.values(store.state.groceryOverrides || {})
      ] as any[];

      const fuse = new Fuse(allItems, {
        keys: ['name', 'aliases'],
        threshold: 0.4
      });

      const unmapped: any[] = [];
      if (data && Array.isArray(data.ingredients)) {
        data.ingredients.forEach((ing: any) => {
          if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) return;
          
          const exactMatch = allItems.find(item => {
            if (!item || typeof item.name !== 'string') return false;
            const ingNameLower = ing.name.toLowerCase();
            const itemNameLower = item.name.toLowerCase();
            return itemNameLower === ingNameLower || 
              (Array.isArray(item.aliases) && item.aliases.some((a: any) => typeof a === 'string' && a.toLowerCase() === ingNameLower));
          });
          
          if (!exactMatch) {
            const results = fuse.search(ing.name).slice(0, 3).map(r => r.item);
            unmapped.push({ ingredient: ing, suggestions: results });
          }
        });
      }

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
          servings: 2,
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
    store.addRecipe(reviewRecipe);
    onClose();
  };

  const handleTriageComplete = (mappings?: any[]) => {
    if (pendingRecipe) {
      const updatedRecipe = { ...pendingRecipe };
      if (Array.isArray(updatedRecipe.ingredients) && mappings && mappings.length > 0) {
        updatedRecipe.ingredients = updatedRecipe.ingredients.map((ing: any) => {
          if (!ing || !ing.name) return ing;
          const mapping = mappings.find((m: any) => m && m.originalName === ing.name);
          if (mapping && mapping.mappedGroceryName) {
            return { ...ing, name: mapping.mappedGroceryName };
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
        servings: 2,
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
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/70">
                    Press a toggle to select
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-400 font-medium">
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
                  <p className={`text-[10px] leading-tight ${
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
                  <p className={`text-[10px] leading-tight ${
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
                  <div className="flex items-center gap-2 text-[10px] text-emerald-700 font-bold uppercase tracking-widest">
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
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">Recipe Name</label>
                      <input
                        type="text"
                        value={reviewRecipe.name}
                        onChange={(e) => setReviewRecipe({ ...reviewRecipe, name: e.target.value })}
                        className="w-full text-xs font-bold bg-stone-50 focus:bg-white border border-stone-200 focus:border-stone-400 rounded-xl px-3 py-2 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                        placeholder="Recipe Name"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">Description</label>
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
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
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
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
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
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1.5">Dietary Toggles</label>
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
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">Ingredients (For 2 Adults)</span>
                      <span className="text-[10px] text-stone-400 font-bold">({reviewRecipe.ingredients.length} items)</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[300px] lg:max-h-[360px] pr-1.5 scrollbar-thin">
                      {reviewRecipe.ingredients.map((ing, idx) => (
                        <div key={ing.id || idx} className="flex gap-1 py-1 px-1.5 items-center bg-stone-50/50 hover:bg-stone-50 rounded-xl border border-stone-200/60 transition-colors">
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
                            className="text-[10px] font-bold bg-white border border-stone-200 rounded-lg py-1 px-1 outline-none max-w-[90px]"
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
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Smart AI Recipe Refiner</span>
                    </div>
                    
                    <p className="text-[10px] text-emerald-700 font-medium leading-relaxed">
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
                    {refineError && <p className="text-rose-600 text-[10px] font-semibold mt-1">{refineError}</p>}
                  </div>
                </div>

                {/* Right Column (Appliance Steps & Switcher) */}
                <div className="lg:col-span-7 flex flex-col bg-white p-4 rounded-2xl border border-stone-200/80 shadow-3xs h-full min-h-[400px]">
                  
                  {/* Tabs header & make-default trigger */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-200/60 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">Step-by-Step Instructions</span>
                      <span className="text-[10px] text-stone-400 font-bold">({activeInstructions.length} steps)</span>
                    </div>

                    {/* Active Tab default status and action */}
                    {methodsToDisplay.length > 0 && (
                      <div className="flex items-center gap-2">
                        {methodsToDisplay[0] === activeReviewMethod ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500/25" />
                            <span>Default Cooking Method</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => makeMethodDefault(activeReviewMethod)}
                            className="text-[10px] font-extrabold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-2 py-1 transition-colors flex items-center gap-1 cursor-pointer"
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
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
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
                <div className="text-[10px] font-bold text-stone-400 flex items-center gap-1.5">
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

