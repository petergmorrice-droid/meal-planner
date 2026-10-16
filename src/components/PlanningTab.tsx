import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown, 
  ChevronUp,
  Plus, 
  Minus,
  Users,
  Trash2, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Check,
  ShoppingBag, 
  ShoppingCart,
  ChefHat,
  RotateCcw, 
  Snowflake,
  Utensils,
  X,
  FileText,
  Search,
  SlidersHorizontal,
  GripVertical,
  Clock,
  Timer,
  Flame,
  Microwave,
  Zap,
  Sparkles,
  Info,
  AlertCircle,
  Eye,
  Leaf,
  Columns2,
  Rows,
  History,
  Database,
  Copy
} from 'lucide-react';
import { Recipe, MealPlan, DayPlan, PlannedMeal, MealType, BatchItem, ShoppingListItem, PlannedMealSide } from '../types';
import { 
  DAYS_OF_WEEK, 
  getMonday, 
  formatDateISO, 
  formatWeekRange, 
  formatWeekStart,
  createEmptyPlan, 
  generateShoppingListForPlan,
  canPlanFollowingWeek,
  isWeekWithinForwardLimit,
  isCurrentOrFutureWeek,
  MAX_FORWARD_WEEKS,
  getRecipeEmojis,
  getEmojiLabel,
  syncRecurringStaplesForPlan
} from '../utils';

import { RecipeModal } from './CookBookTab';
import { useHoldDrag } from './planner/useHoldDrag';
import { RecipeStrip, WeekDayRow, DragGhost, DropChoiceSheet, DropChoice, PlannerDragPayload, cleanMealName, isLeftoverMeal } from './planner/WeekLayout';

interface PlanningTabProps {
  store: any;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings', planId?: string) => void;
  targetPlanId?: string | null;
}

// Helper to determine if a candidate meal is a leftover derived from a main meal
function isLeftoverForMeal(mainMeal: PlannedMeal, candidateMeal: PlannedMeal): boolean {
  if (mainMeal.id === candidateMeal.id) return false;
  // If mainMeal itself is a leftover, it doesn't spawn child leftovers
  if (mainMeal.type === 'leftover' || /^leftovers?:\s*/i.test(mainMeal.name || '')) return false;

  const candidateIsLeftover = candidateMeal.type === 'leftover' || 
    /^leftovers?:\s*/i.test(candidateMeal.name || '');

  if (!candidateIsLeftover) return false;

  // 1. Match by recipeId if present on both
  if (mainMeal.recipeId && candidateMeal.recipeId && mainMeal.recipeId === candidateMeal.recipeId) {
    return true;
  }

  // 2. Match by batchId if present on both
  if (mainMeal.batchId && candidateMeal.batchId && mainMeal.batchId === candidateMeal.batchId) {
    return true;
  }

  // 3. Match by clean name (case-insensitive, ignoring "Leftovers: " prefix)
  const cleanMain = (mainMeal.name || '').toLowerCase().replace(/^leftovers?:\s*/i, '').trim();
  const cleanCandidate = (candidateMeal.name || '').toLowerCase().replace(/^leftovers?:\s*/i, '').trim();

  if (cleanMain && cleanCandidate) {
    if (cleanMain === cleanCandidate) return true;
    if (cleanCandidate.includes(cleanMain) || cleanMain.includes(cleanCandidate)) return true;
  }

  return false;
}

// Find all days that have leftovers dependent on the meal being changed/removed
function getOrphanedLeftoversForMeal(
  days: Record<string, DayPlan>, 
  targetDayName: string, 
  mealToRemove: PlannedMeal
): string[] {
  if (!days || !mealToRemove) return [];
  const leftoverDays: string[] = [];
  const targetDayIndex = DAYS_OF_WEEK.indexOf(targetDayName);

  DAYS_OF_WEEK.forEach((dName, dIndex) => {
    const dayPlan = days[dName];
    if (!dayPlan || !dayPlan.meals) return;

    // Check if this day has a leftover of mealToRemove
    const hasLeftover = dayPlan.meals.some(m => isLeftoverForMeal(mealToRemove, m));
    if (!hasLeftover) return;

    // Find if there is an alternative fresh cook before this leftover day (excluding targetDayName)
    let hasAlternativeCook = false;
    for (let i = 0; i < dIndex; i++) {
      const prevDayName = DAYS_OF_WEEK[i];
      if (prevDayName === targetDayName) continue;
      const prevMeals = days[prevDayName]?.meals || [];
      const hasFreshCook = prevMeals.some(m => 
        (m.type === 'recipe' || m.type === 'batch') && 
        !isLeftoverForMeal(mealToRemove, m) &&
        ((mealToRemove.recipeId && m.recipeId === mealToRemove.recipeId) ||
         ((m.name || '').toLowerCase().trim() === (mealToRemove.name || '').toLowerCase().trim()))
      );
      if (hasFreshCook) {
        hasAlternativeCook = true;
        break;
      }
    }

    if (!hasAlternativeCook) {
      leftoverDays.push(dName);
    }
  });

  return leftoverDays;
}

export default function PlanningTab({ store, onNavigateTab, targetPlanId }: PlanningTabProps) {
  const currentMonday = getMonday(new Date());
  const currentMondayStr = formatDateISO(currentMonday);
  const nextMondayDateTop = new Date(currentMondayStr + 'T00:00:00');
  nextMondayDateTop.setDate(nextMondayDateTop.getDate() + 7);
  const nextMondayStr = formatDateISO(nextMondayDateTop);
  // local nextMondayDate removed
  const maxWeeks = store.state.preferences?.maxForwardWeeks || MAX_FORWARD_WEEKS;
  // New meals are planned for your usual number of people (Settings → my household).
  const defaultServings = Math.max(1, Math.min(24, Number(store.state.preferences?.defaultServings) || 2));
  const lastMondayDate = new Date(currentMondayStr + 'T00:00:00');
  lastMondayDate.setDate(lastMondayDate.getDate() - 7);
  const lastMondayStr = formatDateISO(lastMondayDate);
  const weekLabel = (startDate: string) =>
    startDate === currentMondayStr ? 'This Week'
      : startDate === nextMondayStr ? 'Next Week'
      : startDate === lastMondayStr ? 'Last Week'
      : formatWeekRange(startDate);

  // Filter strictly to current and future weeks within forward limit (strictly NO past weeks)
  const allowedPlans: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((p: MealPlan) => isCurrentOrFutureWeek(p.startDate) && isWeekWithinForwardLimit(p.startDate, undefined, maxWeeks))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate));
  }, [store.state.mealPlans, currentMondayStr, maxWeeks]);

  // Ensure selected plan is current or future only, preferring targetPlanId if supplied
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const plans = (store.state.mealPlans || [])
      .filter((p: MealPlan) => isCurrentOrFutureWeek(p.startDate) && isWeekWithinForwardLimit(p.startDate, undefined, maxWeeks))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate));

    const preferredId = targetPlanId || store.selectedPlanId;
    if (preferredId) {
      const match = plans.find((p: MealPlan) => p.id === preferredId);
      if (match) return match.id;
    }

    // Default to next week if available
    // local nextMondayDate removed
    
    const nextWeekPlan = plans.find((p: MealPlan) => p.startDate === nextMondayStr);
    if (nextWeekPlan) return nextWeekPlan.id;

    const currentWeekPlan = plans.find((p: MealPlan) => p.startDate === currentMondayStr);
    if (currentWeekPlan) return currentWeekPlan.id;

    if (plans.length > 0) return plans[0].id;
    return null;
  });

  // Whenever targetPlanId or store.selectedPlanId changes, update selectedPlanId immediately
  useEffect(() => {
    const target = targetPlanId || store.selectedPlanId;
    if (target && target !== selectedPlanId) {
      const match = (store.state.mealPlans || []).find((p: MealPlan) => p.id === target);
      if (match && isWeekWithinForwardLimit(match.startDate, undefined, maxWeeks)) {
        setSelectedPlanId(match.id);
      }
    }
  }, [targetPlanId, store.selectedPlanId, store.state.mealPlans, maxWeeks]);

  // Ensure selectedPlanId doesn't randomly jump when plans update, and always resolves to an active plan
  useEffect(() => {
    if (allowedPlans.length === 0) {
      if (selectedPlanId !== null) setSelectedPlanId(null);
    } else if (!selectedPlanId || !allowedPlans.some(p => p.id === selectedPlanId)) {
      const nextWeekPlan = allowedPlans.find((p: MealPlan) => p.startDate === nextMondayStr);
      const currentWeekPlan = allowedPlans.find((p: MealPlan) => p.startDate === currentMondayStr);
      setSelectedPlanId(nextWeekPlan?.id || currentWeekPlan?.id || allowedPlans[0].id);
    }
  }, [allowedPlans, selectedPlanId, nextMondayStr, currentMondayStr]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editingServingsMeal, setEditingServingsMeal] = useState<{ dayName: string; meal: PlannedMeal } | null>(null);
  const [customMealModal, setCustomMealModal] = useState<{
    dayName: string;
    type: 'takeout' | 'eating_out' | 'no_meal';
    mealId?: string;
    note: string;
    servings: number;
  } | null>(null);
  const [addingNoteToMeal, setAddingNoteToMeal] = useState<{ dayName: string; meal: PlannedMeal } | null>(null);
  const [sidesEditingMeal, setSidesEditingMeal] = useState<{ dayName: string; meal: PlannedMeal } | null>(null);
  // Copy-a-week picker: 'pick' lists weeks; a plan means "confirm replacing this week's meals with it".
  const [copyWeekState, setCopyWeekState] = useState<'pick' | MealPlan | null>(null);
  // Planner layout on this phone: 'week' = recipe strip + week list (press-and-hold drag), 'classic' = recipe grid + day columns.
  const [plannerLayout, setPlannerLayoutState] = useState<'week' | 'classic'>(() => {
    try { return localStorage.getItem('planner_layout') === 'week' ? 'week' : 'classic'; } catch { return 'classic'; }
  });
  const setPlannerLayout = (layout: 'week' | 'classic') => {
    setPlannerLayoutState(layout);
    try { localStorage.setItem('planner_layout', layout); } catch { /* per-phone convenience only */ }
  };
  const [dropChoice, setDropChoice] = useState<DropChoice | null>(null);
  const weekListRef = useRef<HTMLDivElement>(null);
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'under20' | 'under30' | 'under45'>('all');
  const [cookingFilter, setCookingFilter] = useState<'all' | 'ninja' | 'oven_hob'>('all');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'vegetarian' | 'vegan'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [assigningRecipe, setAssigningRecipe] = useState<Recipe | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  
  const prefs = store.state.preferences || {
    showPrepTime: true,
    showCookTime: true,
    showTotalTime: true,
    showMethod: true,
    showEmojis: true,
  };

  const togglePref = (key: keyof typeof prefs) => {
    store.updatePreferences({ [key]: !prefs[key] });
  };

  const mealRowsLayout: 1 | 2 = prefs.mealRowsLayout === 1 ? 1 : 2;
  const setMealRowsLayout = (layout: 1 | 2) => {
    store.updatePreferences({ mealRowsLayout: layout });
  };
  const [showFinalizeConfirmModal, setShowFinalizeConfirmModal] = useState(false);
  const [showFinalizedSuccessModal, setShowFinalizedSuccessModal] = useState(false);
  const [showNoMealsToFinalizeModal, setShowNoMealsToFinalizeModal] = useState(false);
  const [showUpdateConfirmModal, setShowUpdateConfirmModal] = useState(false);
  const [pendingPlanChange, setPendingPlanChange] = useState<{ 
    updatedDays: Record<string, DayPlan>; 
    description?: string;
    orphanedDays?: string[];
    removedMealName?: string;
    newMeal?: PlannedMeal;
    dayName?: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [leftoverPrompt, setLeftoverPrompt] = useState<{ dayName: string; recipe: Recipe; existingDays: string[] } | null>(null);
  const [removeLeftoversPrompt, setRemoveLeftoversPrompt] = useState<{ 
    targetDayName: string; 
    targetMealName: string; 
    leftoverDays: string[]; 
    nextDays: Record<string, DayPlan>;
    isReplacement: boolean;
  } | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Find currently active plan from allowed current/future plans
  let currentPlan = allowedPlans.find((p: MealPlan) => p.id === selectedPlanId);
  
  if (!currentPlan && allowedPlans.length > 0) {
    // local nextMondayDate removed
    
    currentPlan = allowedPlans.find((p: MealPlan) => p.startDate === nextMondayStr) || 
                  allowedPlans.find((p: MealPlan) => p.startDate === currentMondayStr) || 
                  allowedPlans[0];
  }

  // Sync selectedPlanId with the resolved currentPlan to prevent detached state
  useEffect(() => {
    if (currentPlan && currentPlan.id !== selectedPlanId) {
      setSelectedPlanId(currentPlan.id);
    }
  }, [currentPlan?.id]);

  // Central helper to apply meal modifications or prompt for confirmation if plan is finalized
  const applyOrConfirmPlanChange = (nextDays: Record<string, DayPlan>, description?: string) => {
    if (!currentPlan) return;

    if (currentPlan.status === 'finalized') {
      // If the plan is finalized, prompt the user to confirm the modification (which updates the shopping list) or discard
      setPendingPlanChange({ updatedDays: nextDays, description });
      setShowUpdateConfirmModal(true);
    } else {
      // Draft or not_started plan - apply immediately
      const updatedPlan: MealPlan = {
        ...currentPlan,
        days: nextDays
      };
      store.updateMealPlan(updatedPlan);
    }
  };

  // Total meals currently planned across the week
  const totalPlannedMeals = useMemo(() => {
    if (!currentPlan) return 0;
    return DAYS_OF_WEEK.reduce((acc, day) => acc + (currentPlan.days[day]?.meals?.length || 0), 0);
  }, [currentPlan]);

  // Days with no meals allocated
  const unallocatedDays = useMemo(() => {
    if (!currentPlan) return [];
    return DAYS_OF_WEEK.filter(day => !currentPlan.days[day] || currentPlan.days[day].meals.length === 0);
  }, [currentPlan]);

  // True if every day has at least one meal planned
  const isPlanComplete = unallocatedDays.length === 0;

  // Switch or create following week plan (max 4 weeks forward)
  const handlePlanFollowingWeek = (fromStartDate?: string): string | null => {
    const baseDateStr = fromStartDate || currentPlan.startDate;
    if (!canPlanFollowingWeek(baseDateStr)) {
      setToastMessage('Maximum 4 weeks forward limit reached.');
      return null;
    }

    const baseDate = new Date(baseDateStr + 'T00:00:00');
    const nextMonday = new Date(baseDate);
    nextMonday.setDate(baseDate.getDate() + 7);
    const nextStartStr = formatDateISO(nextMonday);

    const existing = store.state.mealPlans.find((p: MealPlan) => p.startDate === nextStartStr);
    if (existing) {
      setSelectedPlanId(existing.id);
      store.setSelectedPlanId?.(existing.id);
      return existing.id;
    }

    const newPlan = createEmptyPlan(nextMonday);
    store.updateMealPlan(newPlan);
    const prefsRecurring = store.state.preferences?.recurringItems || [];
    if (prefsRecurring.length > 0 && store.updateShoppingList) {
      const nextList = syncRecurringStaplesForPlan(newPlan, store.state.shoppingList || [], prefsRecurring);
      store.updateShoppingList(nextList);
    }
    setSelectedPlanId(newPlan.id);
    store.setSelectedPlanId?.(newPlan.id);
    return newPlan.id;
  };

  // Check for duplicate recipe and prompt for leftover (only if cooked on an earlier day)
  const checkAndPromptDuplicateRecipe = (dayName: string, recipe: Recipe): boolean => {
    if (!currentPlan) return false;
    
    const existingDays: string[] = [];
    const targetDayIndex = DAYS_OF_WEEK.indexOf(dayName);

    Object.entries(currentPlan.days).forEach(([dName, dayPlanValue]) => {
      const dayPlan = dayPlanValue as DayPlan;
      const dIndex = DAYS_OF_WEEK.indexOf(dName);
      // Only consider it a candidate for "leftovers" if it was cooked on an EARLIER day in the week
      if (dName !== dayName && dIndex < targetDayIndex) {
        const hasRecipe = dayPlan.meals.some(m => 
          (m.type === 'recipe' || m.type === 'leftover') && 
          (m.recipeId === recipe.id || (m.name && recipe.name && m.name.toLowerCase().includes(recipe.name.toLowerCase())))
        );
        if (hasRecipe) {
          existingDays.push(dName);
        }
      }
    });

    if (existingDays.length > 0) {
      setLeftoverPrompt({ dayName, recipe, existingDays });
      return true;
    }
    return false;
  };

  // Unified handler for all meal modifications (adding, replacing, removing).
  // Automatically detects dependent leftovers across the week:
  // - On finalized plans: prompts with ONE combined popup asking to confirm changes,
  //   cleanly removing dependent leftovers and updating the shopping list together.
  // - On draft plans: prompts to remove dependent leftovers if any exist, or applies immediately.
  const executeMealChange = (
    dayName: string, 
    mealToRemove: PlannedMeal | null, 
    newMeal: PlannedMeal | null
  ) => {
    if (!currentPlan) return;

    // Detect dependent leftovers across the entire week if a meal is being removed or replaced
    const orphanedDays = mealToRemove 
      ? getOrphanedLeftoversForMeal(currentPlan.days, dayName, mealToRemove) 
      : [];

    // Calculate updated days:
    // 1. Remove or replace meal on dayName
    // 2. Remove orphaned leftovers across all other days
    const nextDays: Record<string, DayPlan> = {};
    DAYS_OF_WEEK.forEach(d => {
      const dayPlan = currentPlan!.days[d] || { date: '', meals: [] };
      let updatedMeals = [...dayPlan.meals];

      if (d === dayName) {
        if (newMeal) {
          updatedMeals = [newMeal];
        } else if (mealToRemove) {
          updatedMeals = updatedMeals.filter(m => m.id !== mealToRemove.id);
        }
      } else if (orphanedDays.includes(d) && mealToRemove) {
        // Filter out orphaned leftovers on this day
        updatedMeals = updatedMeals.filter(m => !isLeftoverForMeal(mealToRemove, m));
      }

      nextDays[d] = {
        ...dayPlan,
        meals: updatedMeals
      };
    });

    // Human-readable action description
    let description = '';
    if (mealToRemove && newMeal) {
      description = `Replaced ${mealToRemove.name} with ${newMeal.name} on ${dayName}`;
    } else if (mealToRemove) {
      description = `Removed ${mealToRemove.name} from ${dayName}`;
    } else if (newMeal) {
      const people = newMeal.servings ? ` for ${newMeal.servings}` : '';
      description = `Added ${newMeal.name.replace(/^(leftovers?|batch):\s*/i, '')} to ${dayName}${people}`;
    }

    // CASE 1: Finalized Plan -> Single combined modal handles confirmation, leftover removal, and shopping list sync
    if (currentPlan.status === 'finalized') {
      setPendingPlanChange({
        updatedDays: nextDays,
        description,
        orphanedDays: orphanedDays.length > 0 ? orphanedDays : undefined,
        removedMealName: mealToRemove?.name,
        newMeal: newMeal || undefined,
        dayName
      });
      setShowUpdateConfirmModal(true);
      return;
    }

    // CASE 2: Draft Plan with dependent leftovers -> Prompt to remove leftovers
    if (orphanedDays.length > 0 && mealToRemove) {
      setRemoveLeftoversPrompt({
        targetDayName: dayName,
        targetMealName: mealToRemove.name,
        leftoverDays: orphanedDays,
        nextDays,
        isReplacement: Boolean(newMeal)
      });
      return;
    }

    // CASE 3: Draft Plan without leftovers -> Apply immediately
    const updatedPlan: MealPlan = {
      ...currentPlan,
      days: nextDays
    };
    store.updateMealPlan(updatedPlan);
    if (description) {
      setToastMessage(description);
    }
  };

  const handleConfirmLeftover = (isLeftover: boolean) => {
    if (!leftoverPrompt || !currentPlan) return;
    const { dayName, recipe, existingDays } = leftoverPrompt;
    const sourceDay = existingDays && existingDays.length > 0 ? existingDays[existingDays.length - 1] : null;
    
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: isLeftover ? 'leftover' : 'recipe',
      recipeId: recipe.id,
      name: isLeftover ? `Leftovers: ${recipe.name}` : recipe.name,
      servings: defaultServings,
      note: isLeftover ? (sourceDay ? `Reheat from ${sourceDay}` : 'Reheat leftovers') : undefined
    };

    const dayPlan = currentPlan.days[dayName];
    const existingMeal = dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;

    setLeftoverPrompt(null);
    setSelectedDay(null);
    executeMealChange(dayName, existingMeal, newMeal);
  };

  // Enforce ONE meal per day on drag & drop
  const handleDrop = (dayName: string) => {
    if (!draggedRecipe || !currentPlan) return;
    
    if (checkAndPromptDuplicateRecipe(dayName, draggedRecipe)) {
      setDraggedRecipe(null);
      return;
    }

    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'recipe',
      recipeId: draggedRecipe.id,
      name: draggedRecipe.name,
      servings: defaultServings
    };

    const dayPlan = currentPlan.days[dayName];
    const existingMeal = dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;

    setDraggedRecipe(null);
    executeMealChange(dayName, existingMeal, newMeal);
  };

  // Direct assign helper for tap/click on recipes
  const handleAssignRecipeToDay = (dayName: string, recipe: Recipe) => {
    if (!currentPlan) return;
    
    if (checkAndPromptDuplicateRecipe(dayName, recipe)) {
      setAssigningRecipe(null);
      return;
    }

    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'recipe',
      recipeId: recipe.id,
      name: recipe.name,
      servings: defaultServings
    };

    const dayPlan = currentPlan.days[dayName];
    const existingMeal = dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;

    setAssigningRecipe(null);
    executeMealChange(dayName, existingMeal, newMeal);
  };

  // Enforce ONE meal per day for custom types
  const handleAddCustomMeal = (dayName: string, type: MealType, batchId?: string, note?: string, servings?: number) => {
    if (!currentPlan) return;
    
    let name = '';
    if (type === 'takeout') name = 'Takeout';
    if (type === 'eating_out') name = 'Eating Out';
    if (type === 'no_meal') name = 'No Meal Needed';
    if (type === 'batch' && batchId) {
      const batch = store.state.batches.find((b: BatchItem) => b.id === batchId);
      const recipe = batch?.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
      const batchTitle = batch?.name || recipe?.name || 'Batch Meal';
      name = `Batch: ${batchTitle}`;
      if (!note) {
        note = 'Heat up a premade batch';
      }
    }
    
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type,
      batchId,
      name,
      servings: type === 'no_meal' ? 0 : (servings || defaultServings),
      note: note?.trim() || ''
    };

    const dayPlan = currentPlan.days[dayName];
    const existingMeal = dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;

    setSelectedDay(null);
    executeMealChange(dayName, existingMeal, newMeal);
  };

  // Update note and servings for custom meal (takeout, eating out, no meal)
  const handleUpdateCustomMealDetails = (dayName: string, mealId: string, note?: string, servings?: number) => {
    if (!currentPlan) return;
    const day = currentPlan.days[dayName];
    if (!day) return;
    const meal = day.meals.find(m => m.id === mealId);
    if (!meal) return;

    const updatedMeal: PlannedMeal = {
      ...meal,
      note: note?.trim() || '',
      servings: meal.type === 'no_meal' ? 0 : (servings !== undefined ? servings : (meal.servings || 2))
    };

    const updatedMeals = day.meals.map(m => m.id === mealId ? updatedMeal : m);
    const nextDays = {
      ...currentPlan.days,
      [dayName]: {
        ...day,
        meals: updatedMeals
      }
    };

    const updatedPlan: MealPlan = {
      ...currentPlan,
      days: nextDays
    };
    store.updateMealPlan(updatedPlan);
    setToastMessage('Meal details updated.');
  };

  // Enforce ONE meal per day when choosing recipe from modal
  const handleAddRecipeMeal = (dayName: string, recipe: Recipe) => {
    if (!currentPlan) return;

    if (checkAndPromptDuplicateRecipe(dayName, recipe)) {
      return;
    }

    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'recipe',
      recipeId: recipe.id,
      name: recipe.name,
      servings: defaultServings
    };

    const dayPlan = currentPlan.days[dayName];
    const existingMeal = dayPlan && dayPlan.meals.length > 0 ? dayPlan.meals[0] : null;

    setSelectedDay(null);
    executeMealChange(dayName, existingMeal, newMeal);
  };

  // Update servings for a planned meal
  const handleUpdateMealServings = (dayName: string, mealId: string, newServings: number) => {
    if (!currentPlan) return;
    const clamped = Math.max(1, Math.min(24, newServings));
    const day = currentPlan.days[dayName];
    if (!day) return;
    const updatedMeals = day.meals.map(m => m.id === mealId ? { ...m, servings: clamped } : m);
    const nextDays = {
      ...currentPlan.days,
      [dayName]: {
        ...day,
        meals: updatedMeals
      }
    };
    applyOrConfirmPlanChange(nextDays, `Updated servings on ${dayName}`);
  };

  // Update both servings/portions and note for a planned recipe meal
  const handleUpdateRecipeMealDetails = (dayName: string, mealId: string, servings: number, note: string) => {
    if (!currentPlan) return;
    const clamped = Math.max(1, Math.min(24, servings));
    const day = currentPlan.days[dayName];
    if (!day) return;
    const updatedMeals = day.meals.map(m => m.id === mealId ? { ...m, servings: clamped, note: note.trim() } : m);
    const nextDays = {
      ...currentPlan.days,
      [dayName]: {
        ...day,
        meals: updatedMeals
      }
    };
    applyOrConfirmPlanChange(nextDays, `Updated portions and notes on ${dayName}`);
  };

  const handleRemoveMeal = (dayName: string, mealId: string) => {
    if (!currentPlan) return;
    const day = currentPlan.days[dayName];
    if (!day) return;
    const mealToRemove = day.meals.find(m => m.id === mealId);
    if (!mealToRemove) return;

    executeMealChange(dayName, mealToRemove, null);
  };

  // User confirmed removal with dependent leftovers on a draft plan
  const handleConfirmRemoveWithLeftovers = () => {
    if (!currentPlan || !removeLeftoversPrompt) return;
    const updatedPlan: MealPlan = {
      ...currentPlan,
      days: removeLeftoversPrompt.nextDays
    };
    store.updateMealPlan(updatedPlan);
    const daysStr = removeLeftoversPrompt.leftoverDays.join(' and ');
    setRemoveLeftoversPrompt(null);
    setToastMessage(`Meal and dependent leftovers on ${daysStr} removed.`);
  };

  // Compile recipe ingredients for THIS week into the shopping list, preserving other weeks and manual items
  const generateShoppingList = (plan: MealPlan) => {
    const targetItems = generateShoppingListForPlan(plan, store.state.recipes);
    
    // Items either of you removed from the list (shared via sync), so they aren't re-added.
    const dismissedItemIds: string[] = store.dismissedShoppingItemIds || [];

    const targetKeyMap = new Map<string, ShoppingListItem>();
    targetItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      targetKeyMap.set(key, item);
    });

    const currentShoppingList = [...(store.state.shoppingList || [])];
    const existingItemsForPlan = currentShoppingList.filter(i => i.planId === plan.id);
    
    const adhocOrBatchItems = existingItemsForPlan.filter(i => i.isAdhoc || i.isBatch);
    const existingMealItems = existingItemsForPlan.filter(i => !i.isAdhoc && !i.isBatch && !i.isRecurring);

    // 1. Sync recurring items
    const prefsRecurring = store.state.preferences?.recurringItems || [];
    const recurringItemsToKeep: ShoppingListItem[] = [];
    const existingRecurring = existingItemsForPlan.filter(i => i.isRecurring);
    
    prefsRecurring.forEach((rec: any) => {
      const itemId = `recurring-${plan.id}-${rec.id}`;
      if (dismissedItemIds.includes(itemId)) return;
      
      const existing = existingRecurring.find(i => i.id === itemId);
      if (!existing) {
        recurringItemsToKeep.push({
          id: itemId,
          name: rec.name,
          amount: rec.amount,
          unit: rec.unit,
          category: rec.category,
          checked: false,
          isAdhoc: false,
          isRecurring: true,
          planId: plan.id,
          weekLabel: `Week of ${plan.startDate === currentMondayStr ? 'This Week' : plan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(plan.startDate)}`
        });
      } else {
        if (!existing.userAdjusted) {
          recurringItemsToKeep.push({
            ...existing,
            name: rec.name,
            amount: rec.amount,
            unit: rec.unit,
            category: rec.category
          });
        } else {
          recurringItemsToKeep.push(existing);
        }
      }
    });

    // 2. Sync meal items
    const syncedMealItems: ShoppingListItem[] = [];

    targetItems.forEach(target => {
      const key = target.name.toLowerCase().trim();
      const existing = existingMealItems.find(
        e => e.name.toLowerCase().trim() === key
      );

      if (existing) {
        const keepUserAmount = existing.userAdjusted;
        const nextAmount = keepUserAmount ? existing.amount : target.amount;
        const nextUnit = keepUserAmount ? existing.unit : target.unit;
        
        syncedMealItems.push({
          ...existing,
          amount: nextAmount,
          unit: nextUnit,
          recipeNames: target.recipeNames
        });
      } else {
        if (!dismissedItemIds.includes(target.id)) {
          syncedMealItems.push(target);
        }
      }
    });

    // Keep all other items (other weeks entirely)
    const otherWeeksItems = currentShoppingList.filter(i => i.planId !== plan.id);
    store.updateShoppingList([...otherWeeksItems, ...adhocOrBatchItems, ...recurringItemsToKeep, ...syncedMealItems]);
  };

  // Finalize for the first time (Draft -> Finalized)
  const handleFirstFinalize = () => {
    if (!currentPlan) return;
    const updatedPlan: MealPlan = { 
      ...currentPlan, 
      status: 'finalized'
    };
    store.updateMealPlan(updatedPlan);
    
    // Generate shopping list for this week
    generateShoppingList(updatedPlan);

    // Pre-create following week so it is ready to be planned (if within 4-week limit)
    if (canPlanFollowingWeek(updatedPlan.startDate)) {
      const fromDate = new Date(updatedPlan.startDate + 'T00:00:00');
      const nextMonday = new Date(fromDate);
      nextMonday.setDate(fromDate.getDate() + 7);
      const nextStartStr = formatDateISO(nextMonday);
      if (!store.state.mealPlans.some((p: MealPlan) => p.startDate === nextStartStr)) {
        const nextPlan = createEmptyPlan(nextMonday);
        store.updateMealPlan(nextPlan);
        const prefsRecurring = store.state.preferences?.recurringItems || [];
        if (prefsRecurring.length > 0 && store.updateShoppingList) {
          const nextList = syncRecurringStaplesForPlan(nextPlan, store.state.shoppingList || [], prefsRecurring);
          store.updateShoppingList(nextList);
        }
      }
    }

    setShowFinalizedSuccessModal(true);
  };

  // User confirmed change on finalized plan (updates plan, removes leftovers if any, and updates shopping list)
  const handleConfirmUpdateWithShoppingList = () => {
    if (!currentPlan || !pendingPlanChange) {
      setShowUpdateConfirmModal(false);
      return;
    }
    const nextDays = pendingPlanChange.updatedDays;
    
    const updatedPlan: MealPlan = { 
      ...currentPlan, 
      status: 'finalized',
      days: nextDays
    };
    store.updateMealPlan(updatedPlan);
    generateShoppingList(updatedPlan);

    const orphanedMsg = pendingPlanChange.orphanedDays && pendingPlanChange.orphanedDays.length > 0
      ? ` Leftovers on ${pendingPlanChange.orphanedDays.join(' and ')} were removed.`
      : '';

    const newMeal = pendingPlanChange.newMeal;
    const dayName = pendingPlanChange.dayName;

    setPendingPlanChange(null);
    setShowUpdateConfirmModal(false);
    setToastMessage(`Plan, shopping list & cook tab updated.${orphanedMsg}`);
  };

  // User chose to discard changes
  const handleDiscardUpdate = () => {
    setPendingPlanChange(null);
    setShowUpdateConfirmModal(false);
    setToastMessage('Change discarded.');
  };

  const plannedDaysCount = currentPlan 
    ? DAYS_OF_WEEK.filter(day => currentPlan.days[day]?.meals?.length > 0).length 
    : 0;

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    store.state.recipes.forEach((r: Recipe) => {
      r.tags?.forEach(t => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [store.state.recipes]);

  const filteredRecipes = useMemo(() => {
    return store.state.recipes.filter((r: Recipe) => {
      const q = recipeSearch.trim().toLowerCase();
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
  }, [store.state.recipes, recipeSearch, selectedTag, timeFilter, cookingFilter, dietaryFilter]);

  // Navigate through current & future plans only (strictly NO past weeks)
  const allSortedPlans = allowedPlans;

  const handleSaveMealSides = (dayName: string, mealId: string, updatedSides: PlannedMealSide[]) => {
    if (!currentPlan) return;
    const day = currentPlan.days[dayName];
    if (!day) return;
    const meal = day.meals.find(m => m.id === mealId);
    if (!meal) return;

    const updatedMeal = { ...meal, sides: updatedSides };
    const updatedMeals = day.meals.map(m => m.id === mealId ? updatedMeal : m);
    const nextDays = {
      ...currentPlan.days,
      [dayName]: {
        ...day,
        meals: updatedMeals
      }
    };
    const updatedPlan: MealPlan = {
      ...currentPlan,
      days: nextDays
    };
    store.updateMealPlan(updatedPlan);
    
    if (updatedPlan.status === 'finalized') {
      generateShoppingList(updatedPlan);
    }

    setToastMessage(updatedSides.length ? 'Sides saved.' : 'Sides removed.');
    setSidesEditingMeal(null);
  };

  // ---- Week layout: press-and-hold drag of recipes and planned meals onto days ----
  const handlePlannerDrop = (payload: PlannerDragPayload, day: string) => {
    if (!currentPlan) return;
    if (payload.kind === 'recipe') {
      handleAssignRecipeToDay(day, payload.recipe);
      return;
    }
    const { fromDay, meal } = payload;
    if (fromDay === day) return;
    const target = currentPlan.days[day]?.meals?.[0] || null;
    const isRecipe = !!meal.recipeId && (meal.type === 'recipe' || meal.type === 'leftover');
    const canLeftover = isRecipe && DAYS_OF_WEEK.indexOf(day) > DAYS_OF_WEEK.indexOf(fromDay);
    setDropChoice({ fromDay, toDay: day, meal, replacing: target && target.id !== meal.id ? cleanMealName(target.name) : null, canLeftover, isRecipe });
  };
  const { drag: plannerDrag, bind: plannerBind, ghostRef: plannerGhostRef, ghostStart: plannerGhostStart } = useHoldDrag<PlannerDragPayload>({
    onDrop: handlePlannerDrop,
    getScrollContainer: () => weekListRef.current,
  });

  const dropChoiceTarget = () => (dropChoice && currentPlan ? currentPlan.days[dropChoice.toDay]?.meals?.[0] || null : null);
  const handleDropLeftovers = () => {
    if (!dropChoice) return;
    const { meal, fromDay, toDay } = dropChoice;
    const sourceDay = isLeftoverMeal(meal) ? ((meal.note || '').match(/from (\w+)/i)?.[1] || fromDay) : fromDay;
    const name = cleanMealName(meal.name);
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'leftover',
      recipeId: meal.recipeId,
      name: `Leftovers: ${name}`,
      servings: meal.servings || defaultServings,
      note: `Reheat from ${sourceDay}`
    };
    const target = dropChoiceTarget();
    setDropChoice(null);
    executeMealChange(toDay, target, newMeal);
  };
  const handleDropCookAgain = () => {
    if (!dropChoice) return;
    const { meal, toDay } = dropChoice;
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type: 'recipe',
      recipeId: meal.recipeId,
      name: cleanMealName(meal.name),
      servings: meal.servings || defaultServings,
      ...(meal.sides && meal.sides.length ? { sides: meal.sides.map(sd => ({ ...sd })) } : {})
    };
    const target = dropChoiceTarget();
    setDropChoice(null);
    executeMealChange(toDay, target, newMeal);
  };
  const handleDropCopy = () => {
    if (!dropChoice) return;
    const { cooked, ...rest } = dropChoice.meal;
    const target = dropChoiceTarget();
    const toDay = dropChoice.toDay;
    setDropChoice(null);
    executeMealChange(toDay, target, { ...rest, id: crypto.randomUUID() });
  };
  const handleDropMove = () => {
    if (!dropChoice || !currentPlan) return;
    const { meal, fromDay, toDay } = dropChoice;
    const nextDays: Record<string, DayPlan> = {};
    DAYS_OF_WEEK.forEach(d => {
      const dp = currentPlan!.days[d] || { date: '', meals: [] };
      if (d === fromDay) nextDays[d] = { ...dp, meals: dp.meals.filter(m => m.id !== meal.id) };
      else if (d === toDay) nextDays[d] = { ...dp, meals: [{ ...meal }] };
      else nextDays[d] = dp;
    });
    setDropChoice(null);
    applyOrConfirmPlanChange(nextDays, `Moved ${cleanMealName(meal.name)} to ${toDay}`);
    if (currentPlan.status !== 'finalized') setToastMessage(`Moved ${cleanMealName(meal.name)} to ${toDay}`);
  };

  // "Cooks for 2 + leftovers Tue, Wed": a fresh cook that later leftover days depend on.
  const cooksForText = (day: string, meal: PlannedMeal | null): string | null => {
    if (!currentPlan || !meal || meal.type !== 'recipe' || !meal.recipeId) return null;
    const later: string[] = [];
    let extra = 0;
    for (let i = DAYS_OF_WEEK.indexOf(day) + 1; i < DAYS_OF_WEEK.length; i++) {
      const m = currentPlan.days[DAYS_OF_WEEK[i]]?.meals?.[0];
      if (!m || m.recipeId !== meal.recipeId) continue;
      if (isLeftoverMeal(m)) { later.push(DAYS_OF_WEEK[i].slice(0, 3)); extra += m.servings || 2; }
      else break;
    }
    return later.length ? `Cook for ${(meal.servings || 2) + extra}: leftovers ${later.join(', ')}` : null;
  };

  // Copy every day's meals from another week into the week on screen.
  const copyCandidates: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((p: MealPlan) => p.id !== currentPlan?.id && Object.values(p.days || {}).some((d: any) => d?.meals?.length))
      .sort((a: MealPlan, b: MealPlan) => b.startDate.localeCompare(a.startDate))
      .slice(0, 12);
  }, [store.state.mealPlans, currentPlan?.id]);

  const handleCopyWeek = (source: MealPlan) => {
    if (!currentPlan || currentPlan.status === 'finalized') return;
    let copied = 0;
    const nextDays: Record<string, DayPlan> = {};
    DAYS_OF_WEEK.forEach(d => {
      const target = currentPlan!.days[d] || { date: '', meals: [] };
      const meals = (source.days?.[d]?.meals || []).map(m => {
        const { cooked, ...rest } = m;
        copied++;
        return { ...rest, id: crypto.randomUUID() };
      });
      nextDays[d] = { ...target, meals };
    });
    store.updateMealPlan({ ...currentPlan, days: nextDays });
    setCopyWeekState(null);
    setToastMessage(`Copied ${copied} meal${copied === 1 ? '' : 's'} from ${weekLabel(source.startDate)}`);
  };
  
    
  
  return (
    <div className="h-full flex flex-col bg-zinc-50/60 relative overflow-hidden">
      {/* Toast notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP SECTION: ALL MEALS (VISUALLY PRIORITIZED) */}
      <div className={`${plannerLayout === 'week' ? 'shrink-0' : 'flex-1 min-h-0'} flex flex-col relative ${showFilterDropdown || showViewOptions ? 'z-35' : 'z-10'}`}>
        {/* Sleek Top Bar: No 'All Meals' title, concise expandable search, and filter button with options dropdown */}
        <div className={`bg-white border-b border-zinc-200/80 px-4 sm:px-5 py-2 shrink-0 relative ${showFilterDropdown || showViewOptions ? 'z-35' : 'z-10'}`}>
          <div className="flex items-center justify-between gap-3">
            {/* Left side: Results Count & Active Filter Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-sm font-bold text-zinc-900 whitespace-nowrap">
                Planner
              </span>

              {/* Active Tag Filter Pill */}
              {selectedTag !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-indigo-600 text-white pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in">
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
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-indigo-600 text-white pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in">
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
              {recipeSearch && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200 pl-2 pr-1 py-0.5 rounded-full shrink-0 animate-in fade-in max-w-[140px]">
                  <span className="truncate">&quot;{recipeSearch}&quot;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipeSearch('');
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
                      value={recipeSearch}
                      onChange={(e) => setRecipeSearch(e.target.value)}
                      placeholder="Type to search..."
                      className="w-full text-xs bg-transparent focus:outline-none text-zinc-900 placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setRecipeSearch('');
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
                      recipeSearch
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    }`}
                    title="Search meals"
                    aria-label="Search meals"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View Options Dropdown */}
              <div className="relative">
                <button
                   type="button"
                   onClick={() => setShowViewOptions(!showViewOptions)}
                   className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                     showViewOptions
                       ? 'bg-indigo-600 text-white border-indigo-600'
                       : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                   }`}
                  title="View options"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                
                {showViewOptions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowViewOptions(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 max-h-[calc(100vh-140px)] overflow-y-auto bg-white rounded-2xl border border-zinc-200/90 shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2">
                      {/* Layout: week list (drag with a finger) or the classic grid */}
                      <div className="mb-2">
                          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5 px-1">Layout</span>
                          <div className="grid grid-cols-2 gap-1">
                            {(['week', 'classic'] as const).map(l => (
                              <button
                                key={l}
                                type="button"
                                id={`planner-layout-${l}`}
                                onClick={() => { setPlannerLayout(l); setShowViewOptions(false); }}
                                className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                  plannerLayout === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                                }`}
                              >
                                {l === 'week' ? 'Week list' : 'Classic'}
                              </button>
                            ))}
                          </div>
                        </div>
                      {/* Meal Rows Switcher */}
                      <div className="px-1 mb-2">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                          Display Rows
                        </span>
                        <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setMealRowsLayout(2)}
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
                            onClick={() => setMealRowsLayout(1)}
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

                      <div className="px-1 py-1 mb-1 border-t border-zinc-100">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Fields</span>
                      </div>
                      <div className="space-y-0.5 max-h-56 overflow-y-auto">
                        {Object.entries({
                          showPrepTime: 'Prep Time',
                          showCookTime: 'Cook Time',
                          showTotalTime: 'Total Time',
                          showMethod: 'Cooking Method',
                          showVegetarian: 'Vegetarian',
                          showVegan: 'Vegan',
                          showEmojis: 'Emojis'
                        }).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={prefs[key as keyof typeof prefs] ?? true}
                              onChange={() => togglePref(key as keyof typeof prefs)}
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            />
                            <span className="text-xs font-medium text-zinc-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Filter Button with Options Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                    selectedTag !== 'all' || timeFilter !== 'all' || cookingFilter !== 'all' || showFilterDropdown
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 hover:text-zinc-900'
                  }`}
                  title="Filter options"
                  aria-label="Filter meals by options"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filter</span>
                  {(selectedTag !== 'all' || timeFilter !== 'all' || cookingFilter !== 'all' || dietaryFilter !== 'all') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
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
                        <span className="text-xs font-semibold text-zinc-900">Filter Meals</span>
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
                            Reset all
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
                        <div>
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

                        {/* Cook Time Section */}
                        <div>
                          <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                            Time Needed
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
                                  ? 'bg-indigo-600 text-white'
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
                                  ? 'bg-indigo-600 text-white'
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

                        {/* Tag / Category Section */}
                        <div>
                          <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider block px-1 mb-1.5">
                            Category / Tag
                          </span>
                          <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTag('all');
                                setShowFilterDropdown(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                selectedTag === 'all'
                                  ? 'bg-indigo-600 text-white'
                                  : 'hover:bg-zinc-100 text-zinc-700'
                              }`}
                            >
                              <span>All Categories</span>
                              <span className="text-[11px] opacity-70">{store.state.recipes.length}</span>
                            </button>
                            {allTags.map(tag => {
                              const count = store.state.recipes.filter((r: Recipe) => r.tags?.includes(tag)).length;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTag(tag);
                                    setShowFilterDropdown(false);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                    selectedTag === tag
                                      ? 'bg-indigo-600 text-white'
                                      : 'hover:bg-zinc-100 text-zinc-700'
                                  }`}
                                >
                                  <span>{tag}</span>
                                  <span className="text-[11px] opacity-70">{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {plannerLayout === 'week' ? (
          <RecipeStrip
            recipes={filteredRecipes}
            bind={plannerBind}
            onOpen={(r) => setViewingRecipe(r)}
            draggingId={plannerDrag?.payload.kind === 'recipe' ? plannerDrag.payload.recipe.id : null}
          />
        ) : (
        /* Recipes Gallery Grid: strictly 2 rows of 3 on desktop */
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col justify-between min-h-0">
          {filteredRecipes.length === 0 ? (
            <div className="my-auto py-12 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-white/50">
              <ChefHat className="w-8 h-8 text-zinc-300 mb-2" />
              <p className="text-xs font-medium text-zinc-700">No meals found</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Try a different search query or filter</p>
            </div>
          ) : (
            <>
              {/* Grid layout: Rows of 2 vs Rows of 1 */}
              <div className={`grid ${mealRowsLayout === 1 ? 'grid-cols-1 gap-2 sm:gap-2.5' : 'grid-cols-2 gap-2 sm:gap-3'}`}>
                {filteredRecipes.map((recipe: Recipe) => {
                  const methods = recipe.cookingMethods && recipe.cookingMethods.length > 0 
                    ? recipe.cookingMethods 
                    : ['ninja', 'oven_hob'];
                  const hasNinja = methods.includes('ninja');
                  const hasOvenHob = methods.includes('oven_hob');

                  if (mealRowsLayout === 1) {
                    return (
                      <div
                        key={recipe.id}
                        draggable
                        onDragStart={() => setDraggedRecipe(recipe)}
                        onDragEnd={() => setDraggedRecipe(null)}
                        onClick={() => setViewingRecipe(recipe)}
                        className="group relative bg-white rounded-xl border border-zinc-200/90 hover:border-zinc-400 shadow-2xs hover:shadow-xs p-3 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                      >
                        {/* Left / Main info */}
                        <div className="flex-1 min-w-0 pr-8 sm:pr-0">
                          <h3 className="font-semibold text-xs sm:text-sm text-zinc-900 leading-snug line-clamp-1 mb-1" title={recipe.name}>
                            {recipe.name}
                          </h3>

                          {prefs.showEmojis !== false && (
                            <div className="flex flex-wrap gap-1 mb-1.5 text-base" onClick={(e) => e.stopPropagation()}>
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

                          {/* Inline Badges: Prep/Cook/Total times and Health/Cost/Vegi */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                            {prefs.showPrepTime && (
                              recipe.methodPrepTime && recipe.methodPrepTime.ninja && recipe.methodPrepTime.oven_hob && recipe.methodPrepTime.ninja !== recipe.methodPrepTime.oven_hob ? (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700" title="Preparation time">

                                  <span>Prep: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodPrepTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodPrepTime.oven_hob}m</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700" title="Preparation time">

                                  <span>Prep: {recipe.prepTime || 10}m</span>
                                </span>
                              )
                            )}

                            {prefs.showCookTime && (
                              recipe.methodCookTime && recipe.methodCookTime.ninja && recipe.methodCookTime.oven_hob && recipe.methodCookTime.ninja !== recipe.methodCookTime.oven_hob ? (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700" title="Cooking time">

                                  <span>Cook: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodCookTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodCookTime.oven_hob}m</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700" title="Cooking time">

                                  <span>Cook: {recipe.cookTime || 20}m</span>
                                </span>
                              )
                            )}

                            {prefs.showTotalTime && (
                              <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700">

                                <span>Total: {(recipe.prepTime || 10) + (recipe.cookTime || 20)}m</span>
                              </span>
                            )}

                            {prefs.showVegetarian && (recipe.isVegetarian || recipe.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()))) && (
                              <span 
                                className="flex items-center gap-1 font-medium text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
                                title="Vegetarian"
                              >
                                <Leaf className="w-2.5 h-2.5 fill-emerald-500/20" />
                                Vegi
                              </span>
                            )}

                            {prefs.showVegan && (recipe.isVegan || recipe.tags?.some(t => ['vegan'].includes(t.toLowerCase()))) && (
                              <span 
                                className="flex items-center gap-1 font-medium text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
                                title="Vegan"
                              >
                                <Leaf className="w-2.5 h-2.5 fill-emerald-500/20" />
                                Vegan
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right / Side actions: Cooking Methods & Drag Grip */}
                        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                          {prefs.showMethod && (
                            <div className="flex items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                  hasNinja
                                    ? 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold'
                                    : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                                }`}
                                title={hasNinja ? "Ninja Combi / Multi-cooker option available" : "Not suitable for Ninja Combi"}
                              >
                                <Zap className={`w-3 h-3 ${hasNinja ? 'text-amber-600 fill-amber-500/20' : 'text-zinc-300'}`} />
                                <span>Ninja</span>
                              </span>

                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                  hasOvenHob
                                    ? 'bg-rose-50 text-rose-900 border border-rose-300 font-semibold'
                                    : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                                }`}
                                title={hasOvenHob ? "Oven or Hob option available" : "Not suitable for Oven or Hob"}
                              >
                                <Flame className={`w-3 h-3 ${hasOvenHob ? 'text-rose-600 fill-rose-500/20' : 'text-zinc-300'}`} />
                                <span>Oven/Hob</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={recipe.id}
                      draggable
                      onDragStart={() => setDraggedRecipe(recipe)}
                      onDragEnd={() => setDraggedRecipe(null)}
                      onClick={() => setViewingRecipe(recipe)}
                      className="group relative bg-white rounded-xl border border-zinc-200/90 hover:border-zinc-400 shadow-2xs hover:shadow-xs p-3 flex flex-col justify-between cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-all"
                    >
                      <div>
                        {/* Recipe Name */}
                        <h3 className="font-semibold text-xs text-zinc-900 leading-snug line-clamp-2 mb-1.5" title={recipe.name}>
                          {recipe.name}
                        </h3>

                        {prefs.showEmojis !== false && (
                          <div className="flex flex-wrap gap-1 mb-1.5 text-base" onClick={(e) => e.stopPropagation()}>
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

                        {/* Prep Time and Cook Time */}
                        {(prefs.showPrepTime || prefs.showCookTime || prefs.showTotalTime) && (
                          <div className="flex flex-col gap-1 mb-1.5 text-[11px] font-medium text-zinc-600">
                            {prefs.showPrepTime && (
                              recipe.methodPrepTime && recipe.methodPrepTime.ninja && recipe.methodPrepTime.oven_hob && recipe.methodPrepTime.ninja !== recipe.methodPrepTime.oven_hob ? (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit" title="Preparation time">

                                  <span>Prep: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodPrepTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodPrepTime.oven_hob}m</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit" title="Preparation time">

                                  <span>Prep: {recipe.prepTime || 10}m</span>
                                </span>
                              )
                            )}
                            
                            {prefs.showCookTime && (
                              recipe.methodCookTime && recipe.methodCookTime.ninja && recipe.methodCookTime.oven_hob && recipe.methodCookTime.ninja !== recipe.methodCookTime.oven_hob ? (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit" title="Cooking time">

                                  <span>Cook: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {recipe.methodCookTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {recipe.methodCookTime.oven_hob}m</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit" title="Cooking time">

                                  <span>Cook: {recipe.cookTime || 20}m</span>
                                </span>
                              )
                            )}

                            {prefs.showTotalTime && (
                              <span className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded text-zinc-700 w-fit">

                                <span>Total: {(recipe.prepTime || 10) + (recipe.cookTime || 20)}m</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Diet labels */}
                        {(prefs.showVegetarian || prefs.showVegan) && (
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {prefs.showVegetarian && (recipe.isVegetarian || recipe.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()))) && (
                              <span 
                                className="flex items-center gap-1 font-medium text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
                                title="Vegetarian"
                              >
                                <Leaf className="w-2.5 h-2.5 fill-emerald-500/20" />
                                Vegi
                              </span>
                            )}
                            {prefs.showVegan && (recipe.isVegan || recipe.tags?.some(t => ['vegan'].includes(t.toLowerCase()))) && (
                              <span 
                                className="flex items-center gap-1 font-medium text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded"
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
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                hasNinja
                                  ? 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold'
                                  : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                              }`}
                              title={hasNinja ? "Ninja Combi / Multi-cooker option available" : "Not suitable for Ninja Combi"}
                            >
                              <Zap className={`w-3 h-3 ${hasNinja ? 'text-amber-600 fill-amber-500/20' : 'text-zinc-300'}`} />
                              <span>Ninja</span>
                            </span>

                            {/* Oven / Hob */}
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                hasOvenHob
                                  ? 'bg-rose-50 text-rose-900 border border-rose-300 font-semibold'
                                  : 'bg-zinc-50 text-zinc-300 border border-zinc-100 opacity-40'
                              }`}
                              title={hasOvenHob ? "Oven or Hob option available" : "Not suitable for Oven or Hob"}
                            >
                              <Flame className={`w-3 h-3 ${hasOvenHob ? 'text-rose-600 fill-rose-500/20' : 'text-zinc-300'}`} />
                              <span>Oven/Hob</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* BOTTOM SECTION: WEEKLY PLANNER DOCK (the whole page in the week layout) */}
      <div className={`bg-white border-t border-zinc-200/90 ${showWeekDropdown ? 'z-40' : 'z-20'} flex flex-col transition-all duration-200 relative ${
        plannerLayout === 'week'
          ? 'flex-1 min-h-0'
          : 'shadow-xl shrink-0 h-[32%] md:h-[40%] min-h-[225px] md:min-h-[260px] max-h-[290px] md:max-h-[370px]'
      }`}>
        {/* Week Selector Menu (Moved outside of scrollable container to prevent clipping) */}
        {showWeekDropdown && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowWeekDropdown(false)} 
            />
            <div className="absolute left-2 sm:left-4 bottom-full mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-zinc-200 p-2 z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Switch Week
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-1">
                {allSortedPlans.map((plan: MealPlan) => {
                  const isSelected = plan.id === currentPlan?.id;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                          store.setSelectedPlanId?.(plan.id);
                          setShowWeekDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-zinc-100 text-zinc-900 font-semibold' 
                          : 'hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="block font-medium">{plan.startDate === currentMondayStr ? 'This Week' : plan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(plan.startDate)}</span>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {Object.values(plan.days).reduce((acc, d) => acc + d.meals.length, 0)} meals planned
                        </span>
                      </div>
                      {plan.status === 'finalized' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 mt-1 border-t border-zinc-100 space-y-1">
                {currentPlan && currentPlan.status !== 'finalized' && copyCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowWeekDropdown(false);
                      setCopyWeekState('pick');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy meals from another week</span>
                  </button>
                )}
                {canPlanFollowingWeek(currentPlan?.startDate, undefined, maxWeeks) ? (
                  <button
                    onClick={() => {
                      handlePlanFollowingWeek();
                      setShowWeekDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Plan Following Week</span>
                  </button>
                ) : (
                  <div className="px-3 py-1.5 text-[11px] text-zinc-400 italic text-center">
                    Planning limit reached ({maxWeeks} weeks)
                  </div>
                )}

                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowWeekDropdown(false);
                      onNavigateTab('settings');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 flex items-center justify-between transition-colors cursor-pointer bg-zinc-50 border border-zinc-100"
                  >
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Past Weeks Archive</span>
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium">Settings →</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Dock Control Bar */}
        <div className="px-2 sm:px-4 py-2 border-b border-zinc-100 flex flex-nowrap items-center justify-between gap-4 bg-white shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
            {/* Week Dropdown Selector - Without redundant 'Week of' text */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 transition-colors shadow-2xs cursor-pointer"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs font-semibold text-zinc-900">
                  {currentPlan?.startDate === currentMondayStr ? 'This Week' : currentPlan?.startDate === nextMondayStr ? 'Next Week' : formatWeekStart(currentPlan?.startDate)}
                </span>
                {currentPlan?.status === 'finalized' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                )}
                <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showWeekDropdown ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {currentPlan && currentPlan.status !== 'finalized' && totalPlannedMeals === 0 && copyCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => setCopyWeekState('pick')}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Fill this week with the meals from another week"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy a week</span>
              </button>
            )}

            {canPlanFollowingWeek(currentPlan?.startDate, undefined, maxWeeks) && (
              <button
                onClick={() => handlePlanFollowingWeek()}
                className="hidden lg:flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-1 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Next Week</span>
              </button>
            )}
          </div>

          {/* Action Controls & Totals */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Plan Actions: Finalize */}
            <div className="flex items-center gap-1.5">
              {currentPlan?.status === 'finalized' ? (
                /* Once finalized, turns green */
                <button
                  type="button"
                  onClick={() => setShowFinalizedSuccessModal(true)}
                  className="p-1.5 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Plan is finalized. Click to view details."
                >
                  <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                  <span className="hidden sm:inline">Finalized & Sent to Shopping List</span>
                  <span className="sm:hidden">Sent to Shopping List</span>
                </button>
              ) : totalPlannedMeals === 0 ? (
                /* Grey button when no meals are added to any day of the week. Clicking triggers pop-up */
                <button
                  type="button"
                  onClick={() => setShowNoMealsToFinalizeModal(true)}
                  className="p-1.5 sm:px-3 sm:py-1.5 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Plan at least one meal to finalize"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Finalize Plan</span>
                </button>
              ) : (
                /* Meal added to any day: ready to finalize, NOT black */
                <button
                  type="button"
                  onClick={() => setShowFinalizeConfirmModal(true)}
                  className="p-1.5 sm:px-4 sm:py-2 bg-white hover:bg-emerald-50 text-zinc-900 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-400 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
                  title="Review and finalize weekly plan"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Finalize & Send to Shopping List</span>
                  <span className="sm:hidden">Send to Shopping List</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {plannerLayout === 'week' && currentPlan ? (
          <div ref={weekListRef} className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/60" data-week-list>
            <div className="max-w-2xl mx-auto w-full p-3 space-y-2 pb-6">
              {DAYS_OF_WEEK.map(day => {
                const dayPlan = currentPlan!.days[day];
                const meal = dayPlan?.meals?.[0] || null;
                return (
                  <WeekDayRow
                    key={day}
                    day={day}
                    dayPlan={dayPlan}
                    meal={meal}
                    isOver={plannerDrag?.over === day}
                    dragActive={!!plannerDrag}
                    bind={plannerBind}
                    cooksFor={cooksForText(day, meal)}
                    onAdd={() => setSelectedDay(day)}
                    onChange={() => setSelectedDay(day)}
                    onPeople={() => {
                      if (!meal) return;
                      if (meal.type === 'takeout' || meal.type === 'eating_out' || meal.type === 'no_meal') {
                        setCustomMealModal({ dayName: day, type: meal.type, mealId: meal.id, note: meal.note || '', servings: meal.servings || 2 });
                      } else {
                        setEditingServingsMeal({ dayName: day, meal });
                      }
                    }}
                    onRemove={() => meal && handleRemoveMeal(day, meal.id)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
        /* 7 Days Row - Utilizes full dock height and fit for meal info and notes */
        <div className="flex-1 p-2 md:p-3 overflow-x-auto overflow-y-hidden min-h-0 flex flex-col scrollbar-thin">
          <div className="grid grid-cols-7 gap-2.5 sm:gap-3.5 min-w-[1150px] lg:min-w-[1300px] flex-1 h-full">
            {currentPlan && DAYS_OF_WEEK.map(day => {
              const dayPlan = currentPlan.days[day];
              const hasMeal = dayPlan && dayPlan.meals && dayPlan.meals.length > 0;
              const meal = hasMeal ? dayPlan.meals[0] : null;

              if (meal) {
                const isLeftover = meal.type === 'leftover' || /^leftovers?:\s*/i.test(meal.name || '');
                const isBatch = meal.type === 'batch' || /^batch:\s*/i.test(meal.name || '');
                const cleanMealName = meal.name.replace(/^(leftovers?|batch):\s*/i, '').trim();

                // Define elegant vertical border accents based on meal type
                let accentBorderClass = 'border-l-indigo-500';
                if (isLeftover) accentBorderClass = 'border-l-amber-500';
                else if (isBatch) accentBorderClass = 'border-l-cyan-500';
                else if (meal.type === 'takeout') accentBorderClass = 'border-l-orange-500';
                else if (meal.type === 'eating_out') accentBorderClass = 'border-l-blue-500';
                else if (meal.type === 'no_meal') accentBorderClass = 'border-l-zinc-350';

                return (
                  <div
                    key={day}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(day)}
                    onClick={() => {
                      if (meal.type === 'takeout' || meal.type === 'eating_out' || meal.type === 'no_meal') {
                        setCustomMealModal({
                          dayName: day,
                          type: meal.type,
                          mealId: meal.id,
                          note: meal.note || '',
                          servings: meal.servings || 2
                        });
                      } else {
                        setEditingServingsMeal({ dayName: day, meal });
                      }
                    }}
                    className={`group bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 shadow-2xs hover:shadow-xs transition-all flex flex-col h-full min-h-0 p-2 sm:p-2.5 relative select-none border-l-4 cursor-pointer ${accentBorderClass} ${
                      draggedRecipe ? 'ring-2 ring-indigo-500 ring-offset-1 border-indigo-400 bg-indigo-50/10' : ''
                    }`}
                  >
                    {/* Day Header */}
                    <div className="flex justify-between items-center shrink-0 mb-1 sm:mb-2 border-b border-zinc-100 pb-1">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-zinc-900 tracking-wide">{day}</span>
                        <span className="text-[11px] font-medium text-zinc-400">
                          {dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMeal(day, meal.id);
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all p-1.5 rounded-lg cursor-pointer shrink-0 flex items-center justify-center min-w-[32px] min-h-[32px]"
                        title="Remove meal"
                        aria-label="Remove meal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Meal details */}
                    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5">
                      <h4 
                        className={`font-semibold text-zinc-900 break-words line-clamp-2 hover:text-indigo-600 cursor-pointer transition-colors ${
                          cleanMealName.length > 25 
                            ? 'text-[11px] leading-[1.3]' 
                            : 'text-xs leading-snug'
                        }`}
                        title={meal.name}
                      >
                        {cleanMealName}
                      </h4>

                      {/* Note display if present */}
                      {meal.note && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingNoteToMeal({ dayName: day, meal });
                          }}
                          className="mt-1 flex items-start gap-1 text-[11px] text-zinc-500 bg-zinc-50 hover:bg-zinc-100 px-1.5 py-1 rounded-md transition-colors cursor-pointer group/note"
                          title={meal.note}
                        >
                          <FileText className="w-3 h-3 text-zinc-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-1 italic text-zinc-600 flex-1">{meal.note}</span>
                        </div>
                      )}

                      {/* Sides display if present */}
                      {meal.sides && meal.sides.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {meal.sides.map((side) => (
                            <span 
                              key={side.id} 
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-600 bg-zinc-50 border border-zinc-200/60 rounded-md px-1.5 py-0.5 max-w-full truncate"
                              title={`${side.name}: ${side.amount} ${side.unit}`}
                            >
                              <span>🍚</span>
                              <span className="truncate">{side.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Footer: Quick Adjustment Buttons */}
                    <div className="mt-1.5 sm:mt-2.5 pt-1.5 border-t border-zinc-100 flex items-center justify-between shrink-0">
                      {meal.type !== 'no_meal' ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (meal.type === 'takeout' || meal.type === 'eating_out') {
                                setCustomMealModal({
                                  dayName: day,
                                  type: meal.type,
                                  mealId: meal.id,
                                  note: meal.note || '',
                                  servings: meal.servings || 2
                                });
                              } else {
                                setEditingServingsMeal({ dayName: day, meal });
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                            title={`Cooking for ${meal.servings || 2} ${(meal.servings || 2) === 1 ? 'person' : 'people'}. Click to adjust.`}
                          >
                            <span className="text-zinc-400 select-none">👤</span>
                            <span className="tabular-nums font-bold">{meal.servings || 2}</span>
                          </button>

                          {meal.sides && meal.sides.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSidesEditingMeal({ dayName: day, meal });
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100/75 border border-indigo-200/80 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                              title="Manage sides for this meal"
                            >
                              <span>🍚</span>
                              <span className="font-bold tabular-nums">{meal.sides.length}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSidesEditingMeal({ dayName: day, meal });
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                              title="Add sides to this meal"
                            >
                              <span className="text-zinc-400">🍚</span>
                              <span>+ Side</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400 italic">No cooking</span>
                      )}

                      {/* Note button removed */}
                    </div>
                  </div>
                );
              }

              // Empty day card (No meal assigned)
              return (
                <div
                  key={day}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(day)}
                  onClick={() => setSelectedDay(day)}
                  className={`bg-zinc-50/40 hover:bg-zinc-100/60 border border-dashed border-zinc-200 hover:border-zinc-350 rounded-xl transition-all flex flex-col h-full min-h-0 p-2.5 relative justify-between cursor-pointer ${
                    draggedRecipe
                      ? 'border-indigo-400 bg-indigo-50/10 ring-2 ring-indigo-400/50'
                      : ''
                  }`}
                >
                  <div className="flex flex-col shrink-0">
                    <span className="text-xs font-bold text-zinc-900 tracking-wide">{day}</span>
                    <span className="text-[11px] font-medium text-zinc-400">
                      {dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </div>

                  <div 
                    className="flex-1 flex flex-col items-center justify-center text-center group rounded-lg bg-white hover:bg-zinc-50 border border-dashed border-zinc-200 hover:border-zinc-300 transition-colors mt-2 p-1.5 shadow-2xs"
                    title={`Add meal to ${day}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-zinc-100 group-hover:bg-indigo-50 text-zinc-400 group-hover:text-indigo-600 flex items-center justify-center mb-1 transition-colors">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-500 group-hover:text-indigo-600 block transition-colors leading-tight">
                      Add Meal
                    </span>
                    <span className="text-[11px] text-zinc-400 hidden sm:block">
                      Drop or tap
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Week layout: the card under your finger, and what to do when a meal lands on another day */}
      {plannerDrag && (
        <DragGhost label={plannerDrag.label} over={plannerDrag.over} ghostRef={plannerGhostRef} start={plannerGhostStart()} />
      )}
      {dropChoice && (
        <DropChoiceSheet
          choice={dropChoice}
          onLeftovers={handleDropLeftovers}
          onCookAgain={handleDropCookAgain}
          onMove={handleDropMove}
          onCopy={handleDropCopy}
          onCancel={() => setDropChoice(null)}
        />
      )}

      {/* MODAL: Assign Recipe to Day (1-click assign from recipe cards) */}
      {assigningRecipe && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setAssigningRecipe(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-semibold text-sm text-zinc-900">Assign to Day</h3>
                <p className="text-xs text-zinc-500 truncate max-w-[240px] mt-0.5 font-medium">{assigningRecipe.name}</p>
              </div>
              <button 
                onClick={() => setAssigningRecipe(null)} 
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metadata Strip */}
            <div className="py-2 px-1 flex items-center justify-between gap-1.5 border-b border-zinc-100/80 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5 font-medium text-zinc-600">
                {assigningRecipe.methodPrepTime && assigningRecipe.methodPrepTime.ninja && assigningRecipe.methodPrepTime.oven_hob && assigningRecipe.methodPrepTime.ninja !== assigningRecipe.methodPrepTime.oven_hob ? (
                  <span>Prep: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {assigningRecipe.methodPrepTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {assigningRecipe.methodPrepTime.oven_hob}m</span>
                ) : (
                  <span>Prep: {assigningRecipe.prepTime || 10}m</span>
                )}
                <span className="hidden sm:inline">•</span>
                {assigningRecipe.methodCookTime && assigningRecipe.methodCookTime.ninja && assigningRecipe.methodCookTime.oven_hob && assigningRecipe.methodCookTime.ninja !== assigningRecipe.methodCookTime.oven_hob ? (
                  <span>Cook: <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 inline" /> {assigningRecipe.methodCookTime.ninja}m / <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500/20 inline" /> {assigningRecipe.methodCookTime.oven_hob}m</span>
                ) : (
                  <span>Cook: {assigningRecipe.cookTime || 20}m</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {(assigningRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('ninja') && (
                  <span className="p-1 rounded bg-amber-50 text-amber-700" title="Ninja Combi suitable">
                    <Zap className="w-3 h-3" />
                  </span>
                )}
                {(assigningRecipe.cookingMethods || ['ninja', 'oven_hob']).includes('oven_hob') && (
                  <span className="p-1 rounded bg-rose-50 text-rose-700" title="Oven or Hob suitable">
                    <Flame className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>
            
            <div className="py-3 space-y-1.5 max-h-72 overflow-y-auto">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                Select which day to plan this meal:
              </span>
              {DAYS_OF_WEEK.map(day => {
                const dayPlan = currentPlan?.days[day];
                const hasMeal = dayPlan && dayPlan.meals && dayPlan.meals.length > 0;
                const currentMealName = hasMeal ? dayPlan.meals[0].name : null;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleAssignRecipeToDay(day, assigningRecipe)}
                    className="w-full text-left p-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 flex items-center justify-between transition-colors group cursor-pointer"
                  >
                    <div>
                      <span className="font-semibold text-xs text-zinc-900 block">{day}</span>
                      <span className="text-[11px] text-zinc-400">
                        {hasMeal ? `Replaces: ${currentMealName}` : 'Empty day'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        Assign
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Day Options Modal (Includes Cook Book recipes, Takeout, Eating Out, Batches) */}
      {selectedDay && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedDay(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Select Meal for {selectedDay}</h3>
                <p className="text-[11px] text-zinc-400">Replaces current meal for this day</p>
              </div>
              <button 
                onClick={() => setSelectedDay(null)} 
                className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
              {/* Quick choices */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">Quick Options</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const day = selectedDay;
                      setSelectedDay(null);
                      setCustomMealModal({
                        dayName: day,
                        type: 'takeout',
                        note: '',
                        servings: defaultServings
                      });
                    }}
                    className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-100/80 text-orange-600 flex items-center justify-center transition-transform group-hover:scale-110">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-xs text-zinc-900 leading-tight">Takeout</span>
                    <span className="text-[11px] text-zinc-400">Add note</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const day = selectedDay;
                      setSelectedDay(null);
                      setCustomMealModal({
                        dayName: day,
                        type: 'eating_out',
                        note: '',
                        servings: defaultServings
                      });
                    }}
                    className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-110">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-xs text-zinc-900 leading-tight">Eat Out</span>
                    <span className="text-[11px] text-zinc-400">Add note</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const day = selectedDay;
                      setSelectedDay(null);
                      setCustomMealModal({
                        dayName: day,
                        type: 'no_meal',
                        note: '',
                        servings: 0
                      });
                    }}
                    className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 font-medium text-xs text-zinc-800 flex flex-col items-center justify-center gap-1.5 transition-colors text-center cursor-pointer shadow-2xs group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-200/80 text-zinc-600 flex items-center justify-center transition-transform group-hover:scale-110">
                      <X className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-xs text-zinc-900 leading-tight">No Meal</span>
                    <span className="text-[11px] text-zinc-400">Add note</span>
                  </button>
                </div>
              </div>

              {/* Batches if any */}
              {store.state.batches.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">Freezer Batches</span>
                  <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                    {store.state.batches.map((batch: BatchItem) => {
                      const recipe = batch.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
                      const displayName = batch.name || recipe?.name || 'Freezer Batch';
                      return (
                        <button
                          key={batch.id}
                          onClick={() => handleAddCustomMeal(selectedDay, 'batch', batch.id)}
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

              {/* Cook Book Recipes */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">Cook Book Recipes</span>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {store.state.recipes.map((r: Recipe) => (
                    <button
                      key={r.id}
                      onClick={() => handleAddRecipeMeal(selectedDay, r)}
                      className="w-full text-left p-2.5 rounded-xl border border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50 flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                          <ChefHat className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 block truncate">{r.name}</span>
                          <span className="text-[11px] text-zinc-400">{r.prepTime + r.cookTime}m</span>
                        </div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </button>
                  ))}
                  {store.state.recipes.length === 0 && (
                    <p className="text-xs text-zinc-400 italic py-2">No recipes in cook book yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 shrink-0">
              <button
                onClick={() => setSelectedDay(null)}
                className="w-full py-2.5 text-zinc-600 font-medium hover:bg-zinc-100 rounded-xl transition-colors text-xs border border-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Number of People / Servings Modal */}
      {editingServingsMeal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            handleUpdateRecipeMealDetails(
              editingServingsMeal.dayName,
              editingServingsMeal.meal.id,
              editingServingsMeal.meal.servings || 2,
              editingServingsMeal.meal.note || ''
            );
            setEditingServingsMeal(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">Number of People</h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                    {editingServingsMeal.dayName} • {editingServingsMeal.meal.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  handleUpdateRecipeMealDetails(
                    editingServingsMeal.dayName,
                    editingServingsMeal.meal.id,
                    editingServingsMeal.meal.servings || 2,
                    editingServingsMeal.meal.note || ''
                  );
                  setEditingServingsMeal(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-5 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Cooking For</span>
              
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    const currentServings = editingServingsMeal.meal.servings || 2;
                    const newServings = Math.max(1, currentServings - 1);
                    setEditingServingsMeal(prev => prev ? { ...prev, meal: { ...prev.meal, servings: newServings } } : null);
                  }}
                  disabled={(editingServingsMeal.meal.servings || 2) <= 1}
                  className="w-9 h-9 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-50 flex items-center justify-center font-bold transition-all"
                  title="Decrease people"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <div className="text-center min-w-[70px]">
                  <span className="text-2xl font-bold text-zinc-900 block leading-tight tabular-nums">
                    {editingServingsMeal.meal.servings || 2}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-400 block">
                    {(editingServingsMeal.meal.servings || 2) === 1 ? 'person' : 'people'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const currentServings = editingServingsMeal.meal.servings || 2;
                    const newServings = Math.min(24, currentServings + 1);
                    setEditingServingsMeal(prev => prev ? { ...prev, meal: { ...prev.meal, servings: newServings } } : null);
                  }}
                  disabled={(editingServingsMeal.meal.servings || 2) >= 24}
                  className="w-9 h-9 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 flex items-center justify-center font-bold transition-all"
                  title="Increase people"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-5">
                {[1, 2, 3, 4, 6, 8].map(count => {
                  const isSelected = (editingServingsMeal.meal.servings || 2) === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        setEditingServingsMeal(prev => prev ? { ...prev, meal: { ...prev.meal, servings: count } } : null);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isSelected 
                          ? 'bg-indigo-600 text-white shadow-2xs' 
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {count} {count === 1 ? 'person' : 'people'}{count === 2 ? ' (default)' : ''}
                    </button>
                  );
                })}
              </div>

              {/* Sides */}
              {editingServingsMeal.meal.type !== 'no_meal' && (
                <div className="w-full border-t border-zinc-100 pt-4 mt-4 text-left flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-700 min-w-0 truncate">
                    <span className="font-semibold text-zinc-900">Sides:</span>{' '}
                    {editingServingsMeal.meal.sides && editingServingsMeal.meal.sides.length
                      ? editingServingsMeal.meal.sides.map(sd => sd.name).join(', ')
                      : 'none'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const { dayName, meal } = editingServingsMeal;
                      handleUpdateRecipeMealDetails(dayName, meal.id, meal.servings || 2, meal.note || '');
                      setEditingServingsMeal(null);
                      setSidesEditingMeal({ dayName, meal });
                    }}
                    className="shrink-0 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-lg cursor-pointer"
                  >
                    {editingServingsMeal.meal.sides && editingServingsMeal.meal.sides.length ? 'Change sides' : 'Add sides'}
                  </button>
                </div>
              )}

              {/* Meal Note Field */}
              <div className="w-full border-t border-zinc-100 pt-4 mt-4 text-left">
                <label className="block text-xs font-semibold text-zinc-900 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Meal Notes <span className="text-zinc-400 font-normal">(optional)</span></span>
                </label>
                <textarea
                  value={editingServingsMeal.meal.note || ''}
                  onChange={(e) => {
                    setEditingServingsMeal({
                      ...editingServingsMeal,
                      meal: { ...editingServingsMeal.meal, note: e.target.value }
                    });
                  }}
                  placeholder="e.g. Prep veggies ahead, double the sauce..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-zinc-400 transition-colors resize-none placeholder:text-zinc-400 text-zinc-800"
                />
              </div>

              <p className="text-[11px] text-zinc-500 text-center mt-4 bg-zinc-50 p-2 rounded-xl border border-zinc-100 w-full">
                Ingredients will scale for this meal when generating shopping list.
              </p>
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => {
                  handleRemoveMeal(editingServingsMeal.dayName, editingServingsMeal.meal.id);
                  setEditingServingsMeal(null);
                }}
                className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUpdateRecipeMealDetails(
                    editingServingsMeal.dayName,
                    editingServingsMeal.meal.id,
                    editingServingsMeal.meal.servings || 2,
                    editingServingsMeal.meal.note || ''
                  );
                  setEditingServingsMeal(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors text-center cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Custom Meal Modal (Takeout, Eating Out, No Meal Needed) with Note and Portions */}
      {customMealModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setCustomMealModal(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${
                  customMealModal.type === 'takeout' ? 'bg-orange-50 border-orange-100 text-orange-600' :
                  customMealModal.type === 'eating_out' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                  'bg-zinc-100 border-zinc-200 text-zinc-700'
                }`}>
                  {customMealModal.type === 'takeout' ? <ShoppingBag className="w-5 h-5 text-orange-600" /> :
                   customMealModal.type === 'eating_out' ? <Utensils className="w-5 h-5 text-blue-600" /> :
                   <X className="w-5 h-5 text-zinc-600" />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">
                    {customMealModal.mealId ? 'Edit' : 'Add'} {
                      customMealModal.type === 'takeout' ? 'Takeout' :
                      customMealModal.type === 'eating_out' ? 'Eating Out' :
                      'No Meal Needed'
                    }
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {customMealModal.dayName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomMealModal(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Note input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-900 mb-1">
                  Note <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={customMealModal.note}
                  onChange={(e) => setCustomMealModal({ ...customMealModal, note: e.target.value })}
                  placeholder={
                    customMealModal.type === 'takeout' 
                      ? 'e.g. Pizza from Franco Manca, order by 6:30pm...' 
                      : customMealModal.type === 'eating_out'
                      ? 'e.g. Reservation at Dishoom, 7:30pm under Peter...'
                      : 'e.g. Late work meeting, dinner provided / visiting family...'
                  }
                  rows={3}
                  className="w-full text-xs p-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors resize-none placeholder:text-zinc-400 text-zinc-800"
                />
                <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>This note will appear in the Cook tab.</span>
                </p>
              </div>

              {/* Number of people for takeout and eating out */}
              {customMealModal.type !== 'no_meal' && (
                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">Number of People</span>
                    <span className="text-[11px] text-zinc-400">Portions to account for</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomMealModal({ ...customMealModal, servings: Math.max(1, customMealModal.servings - 1) })}
                      disabled={customMealModal.servings <= 1}
                      className="w-7 h-7 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 disabled:opacity-30 flex items-center justify-center transition-colors"
                      title="Decrease people"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-zinc-900 tabular-nums">
                      {customMealModal.servings}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomMealModal({ ...customMealModal, servings: Math.min(24, customMealModal.servings + 1) })}
                      disabled={customMealModal.servings >= 24}
                      className="w-7 h-7 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 flex items-center justify-center transition-colors"
                      title="Increase people"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {customMealModal.type === 'no_meal' && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-[11px] text-zinc-500 leading-relaxed">
                  Marks this day as not needing a home-cooked meal. You can leave a reminder or note above for reference.
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              {customMealModal.mealId && (
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveMeal(customMealModal.dayName, customMealModal.mealId!);
                    setCustomMealModal(null);
                  }}
                  className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setCustomMealModal(null)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customMealModal.mealId) {
                    handleUpdateCustomMealDetails(
                      customMealModal.dayName,
                      customMealModal.mealId,
                      customMealModal.note,
                      customMealModal.servings
                    );
                  } else {
                    handleAddCustomMeal(
                      customMealModal.dayName,
                      customMealModal.type,
                      undefined,
                      customMealModal.note,
                      customMealModal.servings
                    );
                  }
                  setCustomMealModal(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors text-center shadow-2xs cursor-pointer"
              >
                {customMealModal.mealId ? 'Save Changes' : 'Add to Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add/Edit Meal Note */}
      {addingNoteToMeal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setAddingNoteToMeal(null)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col border border-zinc-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                {addingNoteToMeal.meal.note ? 'Edit Note' : 'Add Note'}
              </h3>
              <button 
                onClick={() => setAddingNoteToMeal(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-200/50 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-3">
              <div className="text-xs text-zinc-500 mb-1">
                Note for <strong className="text-zinc-700 font-medium">{addingNoteToMeal.meal.name}</strong> on {addingNoteToMeal.dayName}
              </div>
              <textarea
                className="w-full p-3 text-sm border border-zinc-200 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none bg-white min-h-[100px]"
                placeholder="E.g. prep veggies in advance..."
                value={addingNoteToMeal.meal.note || ''}
                onChange={(e) => {
                  setAddingNoteToMeal({
                    ...addingNoteToMeal,
                    meal: { ...addingNoteToMeal.meal, note: e.target.value }
                  });
                }}
              />
            </div>

            <div className="p-4 pt-2 border-t border-zinc-100 flex gap-2">
              <button
                type="button"
                onClick={() => setAddingNoteToMeal(null)}
                className="flex-1 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currentPlan) {
                    const day = currentPlan.days[addingNoteToMeal.dayName];
                    if (day) {
                      const updatedMeals = day.meals.map(m => m.id === addingNoteToMeal.meal.id ? { ...addingNoteToMeal.meal } : m);
                      store.updateMealPlan({
                        ...currentPlan,
                        days: {
                          ...currentPlan.days,
                          [addingNoteToMeal.dayName]: { ...day, meals: updatedMeals }
                        }
                      });
                    }
                  }
                  setAddingNoteToMeal(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors text-center shadow-2xs cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2.5: Finalize Confirmation & Daily Meal Breakdown Check */}
      {showFinalizeConfirmModal && currentPlan && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowFinalizeConfirmModal(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] shadow-xl border border-zinc-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-zinc-900 leading-tight">
                    Finalize Weekly Plan
                  </h3>
                  <p className="text-xs text-zinc-400 truncate">
                    Week of {formatWeekRange(currentPlan.startDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFinalizeConfirmModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Unallocated Days Alert / Confirmation Note */}
              {unallocatedDays.length > 0 ? (
                <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-950">
                      Meals have not been allocated for {unallocatedDays.length === 1 ? '1 day' : `${unallocatedDays.length} days`}:
                    </p>
                    <p className="font-medium text-amber-900 bg-amber-100/60 px-2 py-1 rounded-md inline-block">
                      {unallocatedDays.join(', ')}
                    </p>
                    <p className="text-[11px] text-amber-800/90 pt-0.5 leading-relaxed">
                      You can still finalize this week now with these days left open, or click “Keep Editing” (or any day below) to add meals.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-950 flex items-center gap-2.5 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-900">All 7 days planned</p>
                    <p className="text-[11px] text-emerald-700">Every day of this week has a planned meal allocated.</p>
                  </div>
                </div>
              )}

              {/* Breakdown of meals for each day */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Daily Meal Breakdown
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                    {DAYS_OF_WEEK.length - unallocatedDays.length} / 7 days filled
                  </span>
                </div>

                <div className="space-y-1.5 max-h-60 sm:max-h-64 overflow-y-auto pr-1">
                  {DAYS_OF_WEEK.map(day => {
                    const dayPlan = currentPlan.days[day];
                    const meals = dayPlan?.meals || [];
                    const hasMeal = meals.length > 0;
                    const meal = hasMeal ? meals[0] : null;
                    const dayDate = dayPlan?.date 
                      ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) 
                      : '';

                    return (
                      <div
                        key={day}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                          hasMeal
                            ? 'bg-white border-zinc-200 shadow-2xs'
                            : 'bg-zinc-50/60 border-dashed border-zinc-200/80'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Day column label */}
                          <div className="w-20 shrink-0">
                            <span className="font-bold text-xs text-zinc-900 block">{day}</span>
                            <span className="text-[11px] text-zinc-400 block">{dayDate}</span>
                          </div>

                          {/* Meal Info */}
                          {meal ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 flex items-center justify-center">
                                {meal.type === 'takeout' ? (
                                  <ShoppingBag className="w-4 h-4 text-orange-600" />
                                ) : meal.type === 'eating_out' ? (
                                  <Utensils className="w-4 h-4 text-blue-600" />
                                ) : meal.type === 'no_meal' ? (
                                  <X className="w-4 h-4 text-zinc-500" />
                                ) : meal.type === 'batch' ? (
                                  <Snowflake className="w-4 h-4 text-cyan-600" />
                                ) : meal.type === 'leftover' ? (
                                  <RotateCcw className="w-4 h-4 text-amber-600" />
                                ) : (
                                  <ChefHat className="w-4 h-4 text-emerald-600" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <span className="font-semibold text-xs text-zinc-900 block truncate" title={meal.name}>
                                  {meal.name}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                                  {meal.type !== 'no_meal' && (
                                    <span className="flex items-center gap-1 font-medium text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded">
                                      <span className="text-[11px] leading-none" role="img" aria-label="people">👤</span>
                                      <span>{meal.servings || 2} {(meal.servings || 2) === 1 ? 'person' : 'people'}</span>
                                    </span>
                                  )}
                                  {meal.note && (
                                    <span className="text-amber-800 bg-amber-50 px-1 rounded truncate max-w-[140px]" title={meal.note}>
                                      {meal.note}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-zinc-400 italic">
                              <span>No meal allocated</span>
                            </div>
                          )}
                        </div>

                        {/* Quick edit button to jump to this day */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowFinalizeConfirmModal(false);
                            setSelectedDay(day);
                          }}
                          className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-1 rounded-md transition-colors shrink-0 cursor-pointer"
                          title={`Edit ${day}`}
                        >
                          {hasMeal ? 'Edit' : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Informational Note about Finalization */}
              <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/80 text-[11px] text-zinc-600 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-zinc-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>What happens when you finalize?</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  Finalizing creates your ingredients on the <strong>Shopping List</strong> and readies your cooking steps in the <strong>Cook</strong> tab. You can still make adjustments afterwards.
                </p>
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div className="px-5 py-3.5 border-t border-zinc-100 bg-zinc-50/60 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirmModal(false)}
                className="px-4 py-2 text-zinc-700 font-medium bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors text-xs cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFinalizeConfirmModal(false);
                  handleFirstFinalize();
                }}
                className="px-4 py-2 text-white font-medium bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-2xs transition-colors text-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Finalize</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP: Add Meals Before Finalizing */}
      {showNoMealsToFinalizeModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowNoMealsToFinalizeModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-600 flex items-center justify-center mx-auto mb-3.5 shadow-2xs">
              <AlertCircle className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-zinc-900 mb-1.5">
              Add Meals Before Finalizing
            </h3>
            
            <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
              Please add a meal to at least one day of the week before finalizing your meal plan.
            </p>

            <button
              type="button"
              onClick={() => setShowNoMealsToFinalizeModal(false)}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: "Plan Finalized" Pop-up */}
      {showFinalizedSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>

            <h3 className="text-lg font-semibold text-center text-zinc-900 mb-1">
              Plan Finalized
            </h3>
            
            <p className="text-xs text-zinc-500 text-center mb-4 leading-relaxed">
              Your meal plan for <span className="font-semibold text-zinc-800">{formatWeekRange(currentPlan?.startDate)}</span> has been finalized.
            </p>

            <div className="bg-zinc-50 rounded-xl p-3.5 mb-5 border border-zinc-200/80 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs text-zinc-700">
                <ShoppingCart className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                <span>Ingredients for this week have been added to your <strong>Shopping List</strong>.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-zinc-700">
                <ChefHat className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                <span>Planned meals and portions are ready in the <strong>Cook</strong> tab.</span>
              </div>
            </div>

            <button
              onClick={() => setShowFinalizedSuccessModal(false)}
              className="w-full py-2.5 text-white font-medium bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-2xs transition-colors text-xs text-center cursor-pointer"
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: Update Shopping List Prompt (When modifying a finalized plan) */}
      {showUpdateConfirmModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={handleDiscardUpdate}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center mx-auto mb-3">
              <RotateCcw className="w-5 h-5" />
            </div>

            <h3 className="text-lg font-semibold text-center text-zinc-900 mb-1">
              Confirm Plan Change
            </h3>
            
            <p className="text-xs text-zinc-500 text-center mb-4 leading-relaxed">
              {pendingPlanChange?.description 
                ? `You are modifying a finalized meal plan (${pendingPlanChange.description}).`
                : 'You are modifying a finalized meal plan.'}
            </p>

            {pendingPlanChange?.orphanedDays && pendingPlanChange.orphanedDays.length > 0 && (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 mb-4 text-left">
                <div className="flex items-start gap-2.5">
                  <span className="text-base shrink-0">🍱</span>
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-semibold text-amber-950">
                      Dependent Leftovers Will Be Removed
                    </p>
                    <p className="mt-0.5 text-amber-800 text-[11px]">
                      Planned leftovers on <span className="font-semibold text-amber-950">{pendingPlanChange.orphanedDays.join(' and ')}</span> will also be deleted because their source meal was modified.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[11px] text-zinc-400 text-center mb-5">
              Confirming this change will update your weekly plan, recalculate your shopping list, and update the cook tab.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleConfirmUpdateWithShoppingList}
                className="w-full py-2.5 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Confirm Change</span>
              </button>

              <button
                onClick={handleDiscardUpdate}
                className="w-full py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Discard Change</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Remove Leftovers Prompt (Draft Plans) */}
      {copyWeekState && currentPlan && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setCopyWeekState(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Copy a week"
          >
            {copyWeekState === 'pick' ? (
              <>
                <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-zinc-100">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">Copy a week</h3>
                    <p className="text-sm text-zinc-500 mt-0.5">Fills {weekLabel(currentPlan.startDate)} with the same meals, day by day. You can change any of them afterwards.</p>
                  </div>
                  <button type="button" onClick={() => setCopyWeekState(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-3 space-y-2">
                  {copyCandidates.map((plan: MealPlan) => {
                    const meals = DAYS_OF_WEEK.flatMap(d => (plan.days?.[d]?.meals || []).map(m => ({ day: d, name: (m.name || '').replace(/^(leftovers?|batch):\s*/i, '') })));
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => totalPlannedMeals > 0 ? setCopyWeekState(plan) : handleCopyWeek(plan)}
                        className="w-full text-left p-3 rounded-xl border border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{weekLabel(plan.startDate)}</span>
                          <span className="text-xs text-zinc-500 tabular-nums shrink-0">{meals.length} meal{meals.length === 1 ? '' : 's'}</span>
                        </div>
                        <ul className="mt-1.5 grid gap-0.5">
                          {meals.map((m, i) => (
                            <li key={i} className="text-sm text-zinc-600 truncate">
                              <span className="inline-block w-10 text-zinc-400">{m.day.slice(0, 3)}</span>{m.name}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-center text-zinc-900 mb-2">Replace this week's meals?</h3>
                <p className="text-sm text-zinc-500 text-center mb-6 leading-relaxed">
                  The {totalPlannedMeals} meal{totalPlannedMeals === 1 ? '' : 's'} planned for {weekLabel(currentPlan.startDate)} will be replaced with the meals from {weekLabel(copyWeekState.startDate)}.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCopyWeekState('pick')}
                    className="flex-1 py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyWeek(copyWeekState)}
                    className="flex-1 py-2.5 text-white font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Replace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {removeLeftoversPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold text-center text-zinc-900 mb-2">
              Remove Leftovers?
            </h3>
            <p className="text-xs text-zinc-500 text-center mb-6 leading-relaxed">
              If you {removeLeftoversPrompt.isReplacement ? 'replace' : 'remove'} {removeLeftoversPrompt.targetMealName}, you won't have any leftovers for <span className="font-semibold text-zinc-700">{removeLeftoversPrompt.leftoverDays.join(' and ')}</span>. The planned leftovers will also be removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveLeftoversPrompt(null)}
                className="flex-1 py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveWithLeftovers}
                className="flex-1 py-2.5 text-white font-medium bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-2xs text-xs cursor-pointer"
              >
                Remove Leftovers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Leftover Prompt */}
      {leftoverPrompt && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLeftoverPrompt(null)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-center text-zinc-900 mb-2">
              Eating Leftovers?
            </h3>
            
            <p className="text-xs text-zinc-500 text-center mb-5 leading-relaxed">
              You already plan to cook this on <span className="font-semibold text-zinc-700">{leftoverPrompt.existingDays.join(' and ')}</span>. Do you intend to eat leftovers on <span className="font-semibold text-zinc-700">{leftoverPrompt.dayName}</span>, or cook it fresh again?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleConfirmLeftover(true)}
                className="w-full py-2.5 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-all text-xs flex items-center justify-center gap-2"
              >
                <span>Yes, it's leftovers</span>
              </button>

              <button
                onClick={() => handleConfirmLeftover(false)}
                className="w-full py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-xs flex items-center justify-center gap-2"
              >
                <span>No, cook fresh again</span>
              </button>

              <button
                onClick={() => setLeftoverPrompt(null)}
                className="w-full py-2 text-zinc-400 hover:text-zinc-600 font-normal text-xs transition-colors mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freezer Status Widget (Desktop) */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-3 hidden lg:flex pointer-events-none z-10">
        <div className="bg-white p-4 rounded-xl shadow-lg border border-zinc-200/90 w-64 pointer-events-auto">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Freezer Status</h4>
            <span className="text-[11px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded font-medium">
              {store.state.batches.reduce((acc: number, b: BatchItem) => acc + b.portions, 0)} Meals left
            </span>
          </div>
          <ul className="text-xs space-y-1.5 max-h-32 overflow-y-auto">
            {store.state.batches.length === 0 && (
               <li className="text-zinc-400 italic">No batches</li>
            )}
            {store.state.batches.map((batch: BatchItem) => {
              const recipe = batch.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
              const displayName = batch.name || recipe?.name || 'Freezer Batch';
              return (
                <li key={batch.id} className="flex justify-between items-center text-zinc-700">
                  <span className="truncate pr-2 font-normal">{displayName}</span>
                  <span className="font-semibold text-zinc-900 shrink-0">({batch.portions} {batch.portions === 1 ? 'meal' : 'meals'})</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      
      {/* MODAL: View Recipe */}
      {viewingRecipe && (
        <RecipeModal store={store} recipe={viewingRecipe} onClose={() => setViewingRecipe(null)} />
      )}

      {/* MODAL: Manage Sides */}
      {sidesEditingMeal && (
        <SidesModalInner 
          dayName={sidesEditingMeal.dayName}
          meal={sidesEditingMeal.meal}
          store={store}
          onClose={() => setSidesEditingMeal(null)}
          onSave={(updatedSides) => handleSaveMealSides(sidesEditingMeal.dayName, sidesEditingMeal.meal.id, updatedSides)}
        />
      )}
    </div>
  );
}

interface SidesModalInnerProps {
  dayName: string;
  meal: PlannedMeal;
  store: any;
  onClose: () => void;
  onSave: (sides: PlannedMealSide[]) => void;
}

export function SidesModalInner({ dayName, meal, store, onClose, onSave }: SidesModalInnerProps) {
  const [chosenSides, setChosenSides] = useState<PlannedMealSide[]>(() => meal.sides || []);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Triage state
  const [triageSideName, setTriageSideName] = useState<string | null>(null);
  const [triageCategory, setTriageCategory] = useState('Produce');
  const [triageUnit, setTriageUnit] = useState('g');
  const [triageIncrement, setTriageIncrement] = useState(100);

  const POPULAR_SIDES = [
    { name: 'Peas', category: 'Produce', unit: 'g', amount: 150, increment: 100 },
    { name: 'Garlic Bread', category: 'Bakery', unit: 'pack', amount: 1, increment: 1 },
    { name: 'Broccoli', category: 'Produce', unit: 'head', amount: 1, increment: 1 },
    { name: 'Mixed Salad', category: 'Produce', unit: 'bag', amount: 1, increment: 1 },
    { name: 'Frozen Chips', category: 'Frozen', unit: 'g', amount: 300, increment: 250 },
    { name: 'Basmati Rice', category: 'Pantry', unit: 'g', amount: 150, increment: 100 }
  ];

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const db = store.state.groceryDatabase || [];
    return db.filter((item: any) => 
      item.name.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [searchQuery, store.state.groceryDatabase]);

  const handleAddSide = (sideItem: { name: string; category?: string; unit?: string; increment?: number; amount?: number }) => {
    const existing = chosenSides.find(s => s.name.toLowerCase() === sideItem.name.toLowerCase());
    if (existing) {
      setChosenSides(chosenSides.map(s => s.name.toLowerCase() === sideItem.name.toLowerCase()
        ? { ...s, amount: s.amount + (sideItem.increment || s.amount) }
        : s
      ));
    } else {
      const dbMatch = (store.state.groceryDatabase || []).find((g: any) => g.name.toLowerCase() === sideItem.name.toLowerCase());
      const cat = sideItem.category || dbMatch?.category || 'Pantry';
      const unit = sideItem.unit || dbMatch?.unit || 'item';
      const amt = sideItem.amount || dbMatch?.increment || sideItem.increment || 1;
      
      const newSide: PlannedMealSide = {
        id: dbMatch?.id || `side-custom-${crypto.randomUUID()}`,
        name: sideItem.name,
        amount: amt,
        unit: unit,
        category: cat
      };
      setChosenSides([...chosenSides, newSide]);
    }
    setSearchQuery('');
    setTriageSideName(null);
  };

  const handleRemoveSide = (id: string) => {
    setChosenSides(chosenSides.filter(s => s.id !== id));
  };

  const handleUpdateAmount = (id: string, delta: number) => {
    setChosenSides(chosenSides.map(s => {
      if (s.id !== id) return s;
      
      const dbMatch = (store.state.groceryDatabase || []).find((g: any) => g.id === s.id);
      const step = dbMatch?.increment || 1;
      const nextAmount = Math.max(step, s.amount + (delta * step));
      return { ...s, amount: nextAmount };
    }));
  };

  const handleAddCustomSide = () => {
    if (!triageSideName) return;
    
    const newId = `gdb-custom-${crypto.randomUUID()}`;
    const newItem = {
      id: newId,
      name: triageSideName,
      category: triageCategory,
      unit: triageUnit,
      increment: triageIncrement,
      aliases: [triageSideName]
    };
    
    store.updateGroceryOverride(newId, newItem);
    
    const newSide: PlannedMealSide = {
      id: newId,
      name: triageSideName,
      amount: triageIncrement,
      unit: triageUnit,
      category: triageCategory
    };
    
    setChosenSides([...chosenSides, newSide]);
    setTriageSideName(null);
    setSearchQuery('');
  };

  return (
    <div 
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-indigo-50/50">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
              <span>🥗</span>
              <span>Manage Sides for {meal.name}</span>
            </h3>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{dayName} Meal Plan</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-950 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {/* Selected Sides List */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Chosen Sides</h4>
            {chosenSides.length === 0 ? (
              <div className="text-center py-4 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                <span className="text-xs text-zinc-400">No sides added yet.</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {chosenSides.map(side => (
                  <div key={side.id} className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl">
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-xs text-zinc-900 block truncate">{side.name}</span>
                      <span className="text-[11px] text-zinc-400">{side.category || 'Pantry'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateAmount(side.id, -1)}
                          className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-zinc-950 px-1.5 min-w-[3rem] text-center tabular-nums">
                          {side.amount} {side.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateAmount(side.id, 1)}
                          className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSide(side.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove side"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Popular Sides */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Frequent / Popular</h4>
            <div className="flex flex-wrap gap-1.5">
              {/* Special 'None' Option */}
              <button
                type="button"
                onClick={() => setChosenSides([])}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                  chosenSides.length === 0
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                None
              </button>

              {POPULAR_SIDES.map(pop => {
                const isSelected = chosenSides.some(s => s.name.toLowerCase() === pop.name.toLowerCase());
                return (
                  <button
                    key={pop.name}
                    type="button"
                    onClick={() => handleAddSide(pop)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                      isSelected 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold' 
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {pop.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Bar */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Search Grocery Database</h4>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search sides... (e.g. Peas, Salad)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-xs focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* Autocomplete Dropdown Search Results */}
            {searchQuery.trim() !== '' && (
              <div className="mt-1.5 border border-zinc-200 bg-white rounded-xl shadow-lg overflow-hidden divide-y divide-zinc-100">
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddSide(item)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="font-medium text-zinc-900">{item.name}</span>
                    <span className="text-[11px] text-zinc-400 font-semibold">{item.category}</span>
                  </button>
                ))}

                {/* If no exact match and query is non-empty, allow Triage */}
                {!searchResults.some(r => r.name.toLowerCase() === searchQuery.toLowerCase().trim()) && (
                  <button
                    type="button"
                    onClick={() => setTriageSideName(searchQuery.trim())}
                    className="w-full text-left px-3 py-2.5 text-xs text-indigo-600 hover:bg-indigo-50 flex items-center gap-1.5 transition-colors cursor-pointer font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add custom side "{searchQuery.trim()}"...</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Triage Sub-form if adding a custom/unmapped side */}
          {triageSideName && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Triage Custom Side</span>
                  </h5>
                  <p className="text-[11px] text-indigo-800/80 mt-0.5">Map "{triageSideName}" to grocery database so it aggregates perfectly.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTriageSideName(null)}
                  className="text-indigo-400 hover:text-indigo-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-950 mb-1">Aisle / Category</label>
                  <select
                    value={triageCategory}
                    onChange={e => setTriageCategory(e.target.value)}
                    className="w-full p-1.5 border border-indigo-200/80 rounded-lg bg-white"
                  >
                    <option value="Produce">Produce</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Frozen">Frozen</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-950 mb-1">Unit</label>
                  <input
                    type="text"
                    placeholder="g, pack, head..."
                    value={triageUnit}
                    onChange={e => setTriageUnit(e.target.value)}
                    className="w-full p-1.5 border border-indigo-200/80 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-semibold text-indigo-950 mb-1">Default Amount / Increment</label>
                <div className="flex items-center gap-1.5 bg-white border border-indigo-200/80 rounded-lg p-0.5 w-fit">
                  <button
                    type="button"
                    onClick={() => setTriageIncrement(Math.max(1, triageIncrement - (triageUnit === 'g' ? 50 : 1)))}
                    className="w-5 h-5 rounded hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold text-zinc-950 px-2 min-w-[3rem] text-center">
                    {triageIncrement} {triageUnit}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTriageIncrement(triageIncrement + (triageUnit === 'g' ? 50 : 1))}
                    className="w-5 h-5 rounded hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCustomSide}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Database & Add Side</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(chosenSides)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Sides</span>
          </button>
        </div>
      </div>
    </div>
  );
}
