import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCookingAmount } from '../shopping';
import { 
  ChevronLeft, 
  ChefHat, 
  Plus, 
  Minus, 
  X, 
  Zap, 
  Flame, 
  Timer, 
  Check, 
  RotateCcw, 
  Sparkles, 
  Clock, 
  Users,
  Sun
} from 'lucide-react';
import { Recipe, PlannedMeal, MealPlan, CookingMethod } from '../types';
import { scaleRecipeStepQuantities, DAYS_OF_WEEK } from '../utils';

interface CookModeProps {
  store: any;
  dayName: string;
  meals: PlannedMeal[];
  initialActiveMealId: string;
  onClose: () => void;
  activePlan?: MealPlan;
  onMarkCooked?: (mealId: string, cooked: boolean) => void;
  initialServings?: number;
}

// Extract first duration in minutes found in instructions (e.g. "Simmer for 10-15 minutes" -> 10)
function extractMinutes(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:-|to)?\s*(\d+)?\s*(?:minutes|mins|minute|min)\b/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

export default function CookMode({ 
  store, 
  dayName, 
  meals, 
  initialActiveMealId, 
  onClose,
  activePlan,
  onMarkCooked,
  initialServings
}: CookModeProps) {
  const [activeMealId, setActiveMealId] = useState<string>(initialActiveMealId);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'ingredients' | 'steps'>('ingredients');

  // Screen Wake Lock State & API
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const isSupported = 'wakeLock' in navigator;
    setWakeLockSupported(isSupported);

    if (isSupported) {
      let isSubscribed = true;

      const requestLock = async () => {
        try {
          if (!wakeLockRef.current && isSubscribed) {
            const lock = await (navigator as any).wakeLock.request('screen');
            wakeLockRef.current = lock;
            setWakeLockActive(true);

            lock.addEventListener('release', () => {
              if (isSubscribed) {
                wakeLockRef.current = null;
                setWakeLockActive(false);
              }
            });
          }
        } catch (err) {
          // May fail if tab in background or battery saver
          if (isSubscribed) setWakeLockActive(false);
        }
      };

      requestLock();

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isSubscribed) {
          requestLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        isSubscribed = false;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      };
    }
  }, []);

  // Find currently active meal in the list
  const activeMeal = useMemo(() => {
    return meals.find(m => m.id === activeMealId) || meals[0];
  }, [meals, activeMealId]);

  // Find the full recipe details for the active meal
  const recipe = useMemo<Recipe | null>(() => {
    if (!activeMeal?.recipeId) return null;
    return store.state.recipes.find((r: Recipe) => r.id === activeMeal.recipeId) || null;
  }, [store.state.recipes, activeMeal]);

  // Calculate servings and banner double cooking message for active recipe
  const servingsData = useMemo(() => {
    if (!activeMeal || !recipe) return { servings: 2, bannerMessage: null, isDoubleCook: false, isTripleCook: false };

    if (activeMeal.type === 'leftover') {
      return {
        servings: activeMeal.servings || 2,
        bannerMessage: (
          <span>
            <strong>Leftover Meal:</strong> This portion should already be prepared in your fridge from earlier this week. No fresh prep required!
          </span>
        ),
        isDoubleCook: false,
        isTripleCook: false
      };
    }

    if (activeMeal.type === 'batch') {
      return {
        servings: activeMeal.servings || recipe.servings || 2,
        bannerMessage: (
          <span>
            <strong>Batch Cooking:</strong> This meal is planned for freezer storage. Follow standard portions!
          </span>
        ),
        isDoubleCook: false,
        isTripleCook: false
      };
    }

    // Cooking Fresh (Recipe) -> Check for subsequent leftovers
    const dayNames = activePlan
      ? [
          ...DAYS_OF_WEEK.filter(day => activePlan.days[day]),
          ...Object.keys(activePlan.days).filter(day => !DAYS_OF_WEEK.includes(day))
        ]
      : [];
    const startIdx = dayNames.indexOf(dayName);
    let totalServings = activeMeal.servings || 2;
    const leftoverDays: string[] = [];

    if (activePlan && startIdx !== -1) {
      for (let i = startIdx + 1; i < dayNames.length; i++) {
        const nextDayMeals = activePlan.days[dayNames[i]].meals;
        let foundNewBatch = false;

        for (const m of nextDayMeals) {
          if (m.recipeId === activeMeal.recipeId) {
            if (m.type === 'leftover') {
              totalServings += (m.servings || 2);
              leftoverDays.push(dayNames[i]);
            } else if (m.type === 'recipe') {
              foundNewBatch = true;
              break;
            }
          }
        }

        if (foundNewBatch) break;
      }
    }

    const isDoubleCook = leftoverDays.length > 0;
    const isTripleCook = isDoubleCook && (totalServings / (activeMeal.servings || 2) >= 3);

    let bannerMessage = null;
    if (isDoubleCook) {
      const doubleTripleWord = isTripleCook ? 'Triple' : 'Double';
      bannerMessage = (
        <span>
          <strong>Cook {doubleTripleWord}!</strong> Scale ingredients up to prepare portions for leftovers on <strong>{leftoverDays.join(' & ')}</strong>.
        </span>
      );
    }

    return {
      servings: totalServings,
      bannerMessage,
      isDoubleCook,
      isTripleCook,
      leftoverDays
    };
  }, [activeMeal, recipe, activePlan, dayName]);

  const baseServings = recipe?.servings || 2;
  const [servings, setServings] = useState<number>(initialServings ?? servingsData.servings);

  // Sync servings state whenever the active meal changes or initialServings updates
  useEffect(() => {
    setServings(initialServings ?? servingsData.servings);
  }, [servingsData, initialServings]);

  // Handle selected cooking method
  const defaultMethod = useMemo<CookingMethod>(() => {
    if (recipe?.cookingMethods && recipe.cookingMethods.length > 0) {
      return recipe.cookingMethods[0];
    }
    return 'oven_hob';
  }, [recipe]);

  const [selectedCookingMethod, setSelectedCookingMethod] = useState<CookingMethod>(defaultMethod);

  // Sync cooking method whenever the active meal/recipe changes
  useEffect(() => {
    setSelectedCookingMethod(defaultMethod);
  }, [defaultMethod]);

  const activeInstructions = useMemo<string[]>(() => {
    if (!recipe) return [];
    if (recipe.methodInstructions && selectedCookingMethod && recipe.methodInstructions[selectedCookingMethod]) {
      return recipe.methodInstructions[selectedCookingMethod]!;
    }
    return recipe.instructions || [];
  }, [recipe, selectedCookingMethod]);

  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});

  // Reset checked ingredients and step index on meal change
  useEffect(() => {
    setCheckedIngredients({});
    setActiveStepIndex(0);
  }, [activeMealId]);

  if (!activeMeal || !recipe) {
    return (
      <div className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400">
          <ChefHat className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-sm text-zinc-900">No Recipe Data</h3>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          Could not find recipe details. Try closing and opening again.
        </p>
        <button 
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl"
        >
          Close
        </button>
      </div>
    );
  }

  const scale = servings / baseServings;

  const toggleIngredient = (id: string) => {
    setCheckedIngredients(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentPrepTime = recipe.methodPrepTime?.[selectedCookingMethod] ?? recipe.prepTime ?? 10;
  const currentCookTime = recipe.methodCookTime?.[selectedCookingMethod] ?? recipe.cookTime ?? 20;

  return (
    <div id="cook-mode-overlay" className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col overflow-hidden animate-in fade-in duration-200">
      
      {/* Immersive Celebratory Success Dialog */}
      {isCompleted && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200 select-none">
          <div className="max-w-md w-full flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6 animate-bounce">
              <ChefHat className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">Cooking Finished! 🍲</h2>
            <p className="text-sm text-zinc-500 mt-3 max-w-sm leading-relaxed">
              Fantastic work! You have successfully prepared <strong>{recipe.name}</strong> for <strong>{dayName}</strong>. Ready to serve {servings} {servings === 1 ? 'portion' : 'portions'}.
            </p>
            <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 mt-6 w-full text-left flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-zinc-950 uppercase tracking-wider">Chef Tip</h4>
                <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                  If you scaled up to cook extra for leftovers, allow the additional portions to cool fully before storing them in airtight containers inside the fridge!
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onMarkCooked && activeMeal?.id) {
                  onMarkCooked(activeMeal.id, true);
                }
                onClose();
              }}
              className="mt-8 px-6 py-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Mark as Cooked & Return</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2.5 px-6 py-2 w-full text-zinc-500 hover:text-zinc-800 text-xs font-medium cursor-pointer transition-colors"
            >
              Close without marking cooked
            </button>
          </div>
        </div>
      )}

      {/* Header based on Cookbook / Planner / Shop styling */}
      <header className="bg-white border-b border-zinc-200/80 px-4 sm:px-5 py-3 shrink-0 relative z-40">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          
          {/* Back Action & Context */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-full transition-all cursor-pointer shadow-3xs"
              title="Exit Cook Mode"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                  {dayName === 'Cookbook' ? 'Cookbook' : `${dayName}`} Mode
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100 uppercase tracking-wider shrink-0">
                  Active Cook
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate leading-tight mt-0.5">
                {recipe.name}
              </h2>
            </div>
          </div>

          {/* Cooking Method / Servings / Wake Lock Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-auto sm:ml-0">
            {/* Screen Wake Lock Status Indicator (Non-interactive, Always on by default) */}
            {wakeLockActive && (
              <div 
                className="flex items-center gap-1.5 px-1 py-1.5 text-zinc-500 animate-pulse"
                title="Screen stay-awake is active automatically during cooking mode"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-semibold text-zinc-500 lowercase">screen awake active</span>
              </div>
            )}

            {/* Prep/Cook Timing Badges */}
            <div className="hidden md:flex items-center gap-1.5 mr-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 bg-zinc-50 border border-zinc-200/60 rounded-xl shadow-3xs">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Prep: {currentPrepTime}m</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 bg-zinc-50 border border-zinc-200/60 rounded-xl shadow-3xs">
                <Timer className="w-3.5 h-3.5 text-zinc-400" />
                <span>Cook: {currentCookTime}m</span>
              </span>
            </div>

            {/* Selected Cooking Method Switcher */}
            {recipe.cookingMethods && recipe.cookingMethods.length > 1 && (
              <div className="flex items-center bg-zinc-100/80 p-0.5 rounded-xl border border-zinc-200 shrink-0">
                {recipe.cookingMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setSelectedCookingMethod(m);
                      setActiveStepIndex(0);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      selectedCookingMethod === m
                        ? 'bg-white text-zinc-900 shadow-3xs font-extrabold border border-zinc-200/30'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {m === 'ninja' ? 'Combi' : m === 'oven_hob' ? 'Oven/Hob' : 'Slow'}
                  </button>
                ))}
              </div>
            )}

            {/* Contextual Double/Triple Cook Badge next to portion counter */}
            {servingsData.isDoubleCook && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200/60 rounded-xl shadow-3xs shrink-0 select-none">
                <span>
                  <strong>Cook {servingsData.isTripleCook ? 'Triple' : 'Double'}:</strong> {servingsData.servings} portions (extra for {servingsData.leftoverDays.join(' & ')})
                </span>
              </span>
            )}

            {/* Dynamic Servings Controls */}
            <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 shrink-0 shadow-3xs">
              <button
                type="button"
                onClick={() => setServings(prev => Math.max(1, prev - 1))}
                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-200/60 transition-colors cursor-pointer"
                title="Decrease portions"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-xs font-bold text-zinc-800 px-1.5 min-w-[24px] text-center font-mono">
                {servings}p
              </span>
              <button
                type="button"
                onClick={() => setServings(prev => Math.min(24, prev + 1))}
                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-200/60 transition-colors cursor-pointer"
                title="Increase portions"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Header Tabs for Multiple Cooking Meals on Same Day */}
      {meals.length > 1 && (
        <div className="bg-white border-b border-zinc-100 px-4 py-1.5 shrink-0 z-30">
          <div className="max-w-6xl mx-auto w-full flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider shrink-0 mr-1">Meals Today:</span>
            {meals.map((m) => {
              const isSelected = m.id === activeMealId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveMealId(m.id);
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold'
                      : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {m.name.replace(/^Leftovers?:\s*/i, '')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Responsive Body Layout */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row max-w-6xl mx-auto w-full">
        
        {/* Mobile View Toggle Tabs (Only visible on mobile screens) */}
        <div className="block md:hidden bg-white border-b border-zinc-100 px-4 py-2 shrink-0 z-20">
          <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/80">
            <button
              type="button"
              onClick={() => setMobileView('ingredients')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                mobileView === 'ingredients'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Ingredients ({recipe.ingredients.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileView('steps')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                mobileView === 'steps'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Cooking Steps ({activeInstructions.length})
            </button>
          </div>
        </div>

        {/* Panel 1: Ingredients Checklist (visible on desktop or if mobileView === 'ingredients') */}
        <div className={`${mobileView === 'ingredients' ? 'flex' : 'hidden md:flex'} md:w-80 lg:w-96 border-r border-zinc-200/60 bg-white flex-col h-full overflow-hidden shrink-0`}>
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
              Ingredients
            </h3>
            <button
              type="button"
              onClick={() => setCheckedIngredients({})}
              className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Reset Checklist
            </button>
          </div>
          
          {servingsData.bannerMessage && (
            <div className="p-4 bg-amber-50/60 border-b border-amber-100/70 text-amber-900 text-xs leading-relaxed flex items-start gap-2 shrink-0">
              <div>{servingsData.bannerMessage}</div>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {recipe.ingredients.map((ing, idx) => {
              const formattedAmount = formatCookingAmount(ing.amount * scale, ing.unit);
              const isChecked = checkedIngredients[ing.id] || false;

              return (
                <label
                  key={ing.id || idx}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'bg-emerald-50/30 border-emerald-100 text-zinc-400'
                      : 'bg-white hover:bg-zinc-50 border-zinc-100 text-zinc-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleIngredient(ing.id)}
                    className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-semibold leading-relaxed ${isChecked ? 'line-through text-zinc-400' : 'text-zinc-800'}`}>
                      {ing.name}
                    </span>
                    {ing.note && (
                      <span className={`text-sm leading-relaxed ${isChecked ? 'text-zinc-400' : 'text-zinc-500'}`}>, {ing.note}</span>
                    )}
                    {ing.amount > 0 && (
                      <span className="text-xs font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded ml-2 font-bold whitespace-nowrap">
                        {formattedAmount} {ing.unit}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Cooking Steps List (visible on desktop or if mobileView === 'steps') */}
        <div className={`${mobileView === 'steps' ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-[#fafafa] overflow-hidden`}>
          
          {/* Progress Indicators & Double Leftovers Notice */}
          <div className="p-4 bg-white border-b border-zinc-100 space-y-3 shrink-0">
            
            {activeMeal.sides && activeMeal.sides.length > 0 && (
              <div className="bg-indigo-50 text-indigo-950 px-3.5 py-2.5 rounded-xl border border-indigo-200/60 text-xs leading-relaxed flex items-start gap-2.5 shadow-2xs animate-in slide-in-from-top-1">
                <span className="text-base shrink-0">🥗</span>
                <div>
                  <strong>Cook Side Dish:</strong> This meal is planned with side dish{activeMeal.sides.length === 1 ? '' : 'es'} that need to be prepared: <strong>{activeMeal.sides.map(s => `${s.name} (${s.amount}${s.unit})`).join(', ')}</strong>.
                </div>
              </div>
            )}

            {/* Stepper Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                <span>Cooking Progress</span>
                <span className="font-mono">
                  {Math.round(((activeStepIndex + 1) / activeInstructions.length) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/50">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${((activeStepIndex + 1) / activeInstructions.length) * 100}%` }}
                />
              </div>
            </div>

          </div>

          {/* Stepper Steps Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4">
            {activeInstructions.map((step, idx) => {
              const isActive = idx === activeStepIndex;
              const isPassed = idx < activeStepIndex;
              const stepTimerMinutes = extractMinutes(step);
              const scaledStep = scaleRecipeStepQuantities(step, recipe.ingredients, scale);

              return (
                <div
                  key={idx}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    isActive
                      ? 'bg-white border-indigo-600 shadow-xs ring-1 ring-indigo-600'
                      : isPassed
                      ? 'bg-zinc-50/50 border-zinc-200/60 opacity-50'
                      : 'bg-white border-zinc-200/80 hover:border-zinc-300 opacity-80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    
                    {/* Circle step badge */}
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isActive 
                        ? 'bg-indigo-600 text-white shadow-xs' 
                        : isPassed 
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/40' 
                        : 'bg-zinc-100 text-zinc-500 border border-zinc-200/50'
                    }`}>
                      {isPassed ? '✓' : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm sm:text-base leading-relaxed ${
                        isActive 
                          ? 'text-zinc-950 font-semibold' 
                          : 'text-zinc-600'
                      }`}>
                        {scaledStep}
                      </p>

                      {/* Display timer inside the step details if time matches! */}
                      {stepTimerMinutes && (
                        <div className="mt-1">
                          <CookingTimer 
                            key={`${selectedCookingMethod}-${idx}-${stepTimerMinutes}`} 
                            durationMinutes={stepTimerMinutes} 
                          />
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Stepper Controls bottom panel */}
          <div className="p-4 border-t border-zinc-200 bg-white flex items-center justify-between shrink-0 z-30 shadow-md">
            <button
              type="button"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex(prev => Math.max(0, prev - 1))}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                activeStepIndex === 0
                  ? 'text-zinc-300 border-zinc-100 bg-zinc-50 cursor-not-allowed'
                  : 'text-zinc-700 hover:bg-zinc-50 bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              Previous Step
            </button>
            
            <div className="text-xs font-bold text-zinc-500 font-mono">
              {activeStepIndex + 1} / {activeInstructions.length}
            </div>

            {activeStepIndex === activeInstructions.length - 1 ? (
              <button
                type="button"
                onClick={() => setIsCompleted(true)}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Finish Cooking 🎉
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveStepIndex(prev => Math.min(activeInstructions.length - 1, prev + 1))}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Next Step
              </button>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

interface CookingTimerProps {
  key?: string;
  durationMinutes: number;
}

function CookingTimer({ durationMinutes }: CookingTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(durationMinutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasFinished, setHasFinished] = useState<boolean>(false);

  // Sync state whenever the duration minutes prop updates
  useEffect(() => {
    setSecondsLeft(durationMinutes * 60);
    setIsRunning(false);
    setHasFinished(false);
  }, [durationMinutes]);

  useEffect(() => {
    let intervalId: any = null;
    if (isRunning && secondsLeft > 0) {
      intervalId = setInterval(() => {
        setSecondsLeft(prev => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0 && isRunning) {
      setIsRunning(false);
      setHasFinished(true);
      // Play a soft notification beep if audio context supports it
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } catch (e) {
        // Fallback silently if audio context block is active
      }
    }
    return () => clearInterval(intervalId);
  }, [isRunning, secondsLeft]);

  // Handle resetting the timer
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRunning(false);
    setSecondsLeft(durationMinutes * 60);
    setHasFinished(false);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasFinished) {
      // Re-trigger from beginning if completed
      setSecondsLeft(durationMinutes * 60);
      setHasFinished(false);
      setIsRunning(true);
    } else {
      setIsRunning(!isRunning);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div 
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-3 border px-3 py-1.5 rounded-xl transition-all shadow-2xs mt-2 select-none ${
        hasFinished 
          ? 'bg-amber-50 border-amber-200 text-amber-900 animate-pulse' 
          : 'bg-zinc-100 hover:bg-zinc-200/80 border-zinc-200 text-zinc-800'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {isRunning && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${
            hasFinished ? 'bg-amber-500' : isRunning ? 'bg-emerald-500' : 'bg-zinc-400'
          }`}></span>
        </span>
        <span className="text-xs font-mono font-bold">
          {formatTime(secondsLeft)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggle}
          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
            hasFinished
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              : isRunning
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {hasFinished ? 'Restart' : isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-zinc-200 text-zinc-700 hover:bg-zinc-300 transition-colors cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
