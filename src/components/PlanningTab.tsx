import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  RefreshCw,
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
import { Recipe, MealPlan, DayPlan, PlannedMeal, MealType, BatchItem, ShoppingListItem, PlannedMealSide, CookingMethod } from '../types';
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
import { DayListRow, WeekDayCard, WeekGlance, DaySheet, isLeftoverMeal } from './planner/DayListRow';
import { changedDaysSinceList, listSnapshot, moveMeal, cooksForText as weekCooksForText, preferredWeekStart, leftoverSourceDay } from '../planning';
import { sendWeekToShoppingList } from '../planShopping';
import { RecipeCard, CARD_FIELD_OPTIONS, cardFieldsFromPrefs } from './RecipeCard';
import { recipeHistories, sortRecipes, readRecipeSort, saveRecipeSort, RecipeSort, RECIPE_SORTS, todayISO, freezerPortions, freezerBatchesFor, recipeMatchesSearch, totalMinutes, recipeMethods, isVegetarianRecipe, isVeganRecipe, readFavouritesFirst, saveFavouritesFirst, matchesQuickFilters, QUICK_FILTERS, QuickFilter } from '../recipeInfo';

interface PlanningTabProps {
  store: any;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings', planId?: string) => void;
  targetPlanId?: string | null;
  /** A recipe to plan, sent from the Cookbook's "Add to a day…". */
  pendingAddRecipeId?: string | null;
  onPendingAddDone?: () => void;
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

export default function PlanningTab({ store, onNavigateTab, targetPlanId, pendingAddRecipeId, onPendingAddDone }: PlanningTabProps) {
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

    // Monday–Thursday: this week (what's for tea tonight); Friday–Sunday: next week (planning time).
    const preferred = plans.find((p: MealPlan) => p.startDate === preferredWeekStart(new Date(), currentMondayStr, nextMondayStr));
    if (preferred) return preferred.id;
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
      const preferred = allowedPlans.find((p: MealPlan) => p.startDate === preferredWeekStart(new Date(), currentMondayStr, nextMondayStr));
      const nextWeekPlan = allowedPlans.find((p: MealPlan) => p.startDate === nextMondayStr);
      const currentWeekPlan = allowedPlans.find((p: MealPlan) => p.startDate === currentMondayStr);
      setSelectedPlanId(preferred?.id || nextWeekPlan?.id || currentWeekPlan?.id || allowedPlans[0].id);
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
  // Planning view on this phone: 'classic' = meals to search, filter and drag onto the week below; 'list' = the seven days, tap one to add a meal.
  const [planningView, setPlanningViewState] = useState<'classic' | 'list'>(() => {
    try { return localStorage.getItem('planning_view') === 'list' ? 'list' : 'classic'; } catch { return 'classic'; }
  });
  const setPlanningView = (view: 'classic' | 'list') => {
    setPlanningViewState(view);
    try { localStorage.setItem('planning_view', view); } catch { /* per-phone convenience only */ }
  };
  // Search inside "Select meal for <day>".
  const [pickerSearch, setPickerSearch] = useState('');
  useEffect(() => { setPickerSearch(''); }, [selectedDay]);
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
  // "Add to a day…" from the Cookbook: open the day chooser for that recipe.
  useEffect(() => {
    if (!pendingAddRecipeId) return;
    const recipe = (store.state.recipes || []).find((r: Recipe) => r.id === pendingAddRecipeId);
    if (recipe) setAssigningRecipe(recipe);
    onPendingAddDone?.();
  }, [pendingAddRecipeId]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [toastMessage, setToastMessageState] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const setToastMessage = (msg: string | null, action: { label: string; run: () => void } | null = null) => {
    setToastMessageState(msg);
    setToastAction(action);
  };
  // The latest store, for actions that run after a re-render (Undo).
  const storeRef = useRef(store);
  storeRef.current = store;
  // The day whose panel is open (people, sides, notes, change, move, remove).
  const [daySheet, setDaySheet] = useState<string | null>(null);
  // "How are you having it?": leftovers from an earlier day, from the freezer, or cooked fresh.
  const [leftoverPrompt, setLeftoverPrompt] = useState<{ dayName: string; recipe: Recipe; existingDays: string[]; freezer?: { batchId: string; portions: number } } | null>(null);
  const [removeLeftoversPrompt, setRemoveLeftoversPrompt] = useState<{ 
    targetDayName: string; 
    targetMealName: string; 
    leftoverDays: string[]; 
    nextDays: Record<string, DayPlan>;
    isReplacement: boolean;
  } | null>(null);

  // Auto-hide toast (longer when it offers Undo)
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), toastAction ? 6000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, toastAction]);

  // Find currently active plan from allowed current/future plans
  let currentPlan = allowedPlans.find((p: MealPlan) => p.id === selectedPlanId);
  
  if (!currentPlan && allowedPlans.length > 0) {
    // local nextMondayDate removed
    
    currentPlan = allowedPlans.find((p: MealPlan) => p.startDate === preferredWeekStart(new Date(), currentMondayStr, nextMondayStr)) ||
                  allowedPlans.find((p: MealPlan) => p.startDate === nextMondayStr) || 
                  allowedPlans.find((p: MealPlan) => p.startDate === currentMondayStr) || 
                  allowedPlans[0];
  }

  // Sync selectedPlanId with the resolved currentPlan to prevent detached state
  useEffect(() => {
    if (currentPlan && currentPlan.id !== selectedPlanId) {
      setSelectedPlanId(currentPlan.id);
    }
  }, [currentPlan?.id]);

  // Save the week's days. A week already sent to the shopping list just gets an "Update list"
  // button afterwards; weeks sent before the app kept a record are taken as matching the list.
  const writeDays = (nextDays: Record<string, DayPlan>) => {
    if (!currentPlan) return;
    const keepRecord = currentPlan.status === 'finalized' && !currentPlan.lastFinalizedSnapshot
      ? { lastFinalizedSnapshot: listSnapshot(currentPlan) }
      : {};
    store.updateMealPlan({ ...currentPlan, ...keepRecord, days: nextDays });
  };

  // "Removed Chicken fajitas · Undo": put the week back as it was.
  const offerUndo = (label: string) => {
    if (!currentPlan) return;
    const planId = currentPlan.id;
    const before = currentPlan.days;
    setToastMessage(label, {
      label: 'Undo',
      run: () => {
        const latest = (storeRef.current.state.mealPlans || []).find((p: MealPlan) => p.id === planId);
        if (latest) storeRef.current.updateMealPlan({ ...latest, days: before });
        setToastMessage('Undone');
      },
    });
  };

  const applyOrConfirmPlanChange = (nextDays: Record<string, DayPlan>, description?: string) => {
    writeDays(nextDays);
    if (description) setToastMessage(description);
  };

  // ‹ › between weeks
  const planIndex = currentPlan ? allowedPlans.findIndex((p: MealPlan) => p.id === currentPlan!.id) : -1;
  const prevPlan = planIndex > 0 ? allowedPlans[planIndex - 1] : null;
  const nextPlan = planIndex >= 0 && planIndex < allowedPlans.length - 1 ? allowedPlans[planIndex + 1] : null;
  const switchToPlan = (id: string) => { setSelectedPlanId(id); store.setSelectedPlanId?.(id); setShowWeekDropdown(false); };
  // Days changed since this week was sent to the shopping list
  const changedDays = changedDaysSinceList(currentPlan);

  // Jump to a day (week-at-a-glance), and open each week on today when it's in view
  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const jumpToDay = (day: string, smooth = true) => {
    const strip = stripRef.current;
    const card = strip?.querySelector(`[data-week-day="${day}"]`) as HTMLElement | null;
    if (strip && card) strip.scrollTo({ left: Math.max(0, card.offsetLeft - 8), behavior: smooth ? 'smooth' : 'auto' });
    const row = listRef.current?.querySelector(`[data-list-day="${day}"]`) as HTMLElement | null;
    if (row) row.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    if (!currentPlan) return;
    const todayDay = DAYS_OF_WEEK.find((d) => currentPlan!.days[d]?.date === todayISO());
    const t = setTimeout(() => {
      if (todayDay) jumpToDay(todayDay, false);
      else if (stripRef.current) stripRef.current.scrollLeft = 0;
    }, 30);
    return () => clearTimeout(t);
  }, [currentPlan?.id, planningView]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Portions of it in the freezer (use the oldest batch first)
    const batches = freezerBatchesFor(recipe, store.state.batches);
    const portions = batches.reduce((n: number, b: BatchItem) => n + (Number(b.portions) || 0), 0);

    if (existingDays.length > 0 || portions > 0) {
      setLeftoverPrompt({ dayName, recipe, existingDays, freezer: portions > 0 ? { batchId: batches[0].id, portions } : undefined });
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
    const plain = (m: PlannedMeal) => (m.name || '').replace(/^(leftovers?|batch):\s*/i, '');
    const how = (m: PlannedMeal) => (m.type === 'batch' ? ' from the freezer' : m.type === 'leftover' ? ' (leftovers)' : '');
    if (mealToRemove && newMeal) {
      description = `Replaced ${plain(mealToRemove)} with ${plain(newMeal)}${how(newMeal)} on ${dayName}`;
    } else if (mealToRemove) {
      description = `Removed ${plain(mealToRemove)} from ${dayName}`;
    } else if (newMeal) {
      const people = newMeal.servings ? ` for ${newMeal.servings}` : '';
      description = `Added ${plain(newMeal)}${how(newMeal)} to ${dayName}${people}`;
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

    // CASE 3: No leftovers depend on it -> apply now (with Undo when a meal was taken away)
    if (mealToRemove) offerUndo(description);
    else if (description) setToastMessage(description);
    writeDays(nextDays);
  };

  const handleConfirmLeftover = (how: boolean | 'leftover' | 'freezer' | 'fresh') => {
    if (!leftoverPrompt || !currentPlan) return;
    const choice = how === true ? 'leftover' : how === false ? 'fresh' : how;
    const { dayName, recipe, existingDays, freezer } = leftoverPrompt;
    const sourceDay = existingDays && existingDays.length > 0 ? existingDays[existingDays.length - 1] : null;
    
    const newMeal: PlannedMeal = choice === 'freezer' && freezer
      ? {
          // From the freezer: no ingredients to buy; linked to the batch and the recipe
          id: crypto.randomUUID(),
          type: 'batch',
          batchId: freezer.batchId,
          recipeId: recipe.id,
          name: `Batch: ${recipe.name}`,
          servings: defaultServings,
          note: '',
        }
      : {
          id: crypto.randomUUID(),
          type: choice === 'leftover' ? 'leftover' : 'recipe',
          recipeId: recipe.id,
          name: choice === 'leftover' ? `Leftovers: ${recipe.name}` : recipe.name,
          servings: defaultServings,
          note: choice === 'leftover' ? (sourceDay ? `Reheat from ${sourceDay}` : 'Reheat leftovers') : undefined
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
    if (type === 'takeout') name = 'Takeaway';
    if (type === 'eating_out') name = 'Eating out';
    if (type === 'no_meal') name = 'No meal';
    if (type === 'batch' && batchId) {
      const batch = store.state.batches.find((b: BatchItem) => b.id === batchId);
      const recipe = batch?.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
      const batchTitle = batch?.name || recipe?.name || 'Batch Meal';
      name = `Batch: ${batchTitle}`;
      if (!note) {
        note = 'Heat up a premade batch';
      }
    }
    
    const batchRecipeId = type === 'batch' && batchId ? store.state.batches.find((b: BatchItem) => b.id === batchId)?.recipeId : undefined;
    const newMeal: PlannedMeal = {
      id: crypto.randomUUID(),
      type,
      batchId,
      ...(batchRecipeId ? { recipeId: batchRecipeId } : {}),
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
    writeDays({ ...currentPlan.days, [dayName]: { ...day, meals: updatedMeals } });
    setToastMessage('Saved');
  };

  // People and notes from the day panel.
  const handleSaveDayDetails = (dayName: string, mealId: string, patch: { servings: number; note: string }) => {
    if (!currentPlan) return;
    const day = currentPlan.days[dayName];
    if (!day) return;
    const meals = day.meals.map(m => m.id === mealId
      ? { ...m, servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)), note: patch.note }
      : m);
    writeDays({ ...currentPlan.days, [dayName]: { ...day, meals } });
    setToastMessage('Saved');
  };

  // Move a meal to another day (or swap two days). Leftovers follow their cook.
  const handleMoveMeal = (from: string, to: string) => {
    if (!currentPlan || from === to) return;
    const r = moveMeal(currentPlan.days, from, to);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    offerUndo((r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh);
    writeDays(r.days);
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
    const daysStr = removeLeftoversPrompt.leftoverDays.join(' and ');
    offerUndo(`Removed, with the leftovers on ${daysStr}.`);
    writeDays(removeLeftoversPrompt.nextDays);
    setRemoveLeftoversPrompt(null);
  };

  // Finalize for the first time (Draft -> Finalized)
  const handleFirstFinalize = () => {
    if (!currentPlan) return;
    const updatedPlan: MealPlan = { 
      ...currentPlan, 
      status: 'finalized'
    };
    // Status, a record of what was sent, and the week's ingredients on the shopping list
    sendWeekToShoppingList(store, updatedPlan);

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

    setToastMessage('Sent: the ingredients are on the shopping list.', onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', currentPlan.id) } : null);
  };

  // "Update list": the week changed after it was sent.
  const handleUpdateShoppingList = () => {
    if (!currentPlan) return;
    sendWeekToShoppingList(store, currentPlan);
    setToastMessage('Shopping list updated.', onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', currentPlan.id) } : null);
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

  // Cards: when each recipe was last had / is next planned, in the order chosen on this phone.
  const today = todayISO();
  const recipeHistory = useMemo(() => recipeHistories(store.state.mealPlans, today), [store.state.mealPlans, today]);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const toggleQuickFilter = (f: QuickFilter) => setQuickFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const filteredRecipes = useMemo(() => {
    return store.state.recipes.filter((r: Recipe) =>
      recipeMatchesSearch(r, recipeSearch) &&
      matchesQuickFilters(r, quickFilters, { history: recipeHistory.get(r.id), freezer: freezerPortions(r, store.state.batches), today }),
    );
  }, [store.state.recipes, recipeSearch, quickFilters, recipeHistory, store.state.batches, today]);
  const [recipeSort, setRecipeSortState] = useState<RecipeSort>(readRecipeSort);
  const setRecipeSort = (sort: RecipeSort) => { setRecipeSortState(sort); saveRecipeSort(sort); };
  const [favFirst, setFavFirstState] = useState<boolean>(readFavouritesFirst);
  const setFavFirst = (on: boolean) => { setFavFirstState(on); saveFavouritesFirst(on); };
  const sortedRecipes = useMemo(() => sortRecipes(filteredRecipes, recipeSort, recipeHistory, favFirst), [filteredRecipes, recipeSort, recipeHistory, favFirst]);
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
  const cardFields = cardFieldsFromPrefs(prefs);

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
    writeDays({ ...currentPlan.days, [dayName]: { ...day, meals: updatedMeals } });

    setToastMessage(updatedSides.length ? 'Sides saved.' : 'Sides removed.');
    setSidesEditingMeal(null);
  };

  // Recipes in "Select meal for <day>": anything cooked in the 3 days before (likely leftovers), nearest
  // first, then the rest of the book A-Z.
  const pickerRecipes = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matches = (r: Recipe) => !q ||
      r.name.toLowerCase().includes(q) ||
      r.tags?.some(t => t.toLowerCase().includes(q)) ||
      r.ingredients?.some(i => (i?.name || '').toLowerCase().includes(q));
    let all = store.state.recipes.filter(matches).sort((a: Recipe, b: Recipe) => a.name.localeCompare(b.name));
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
  const pickerBatches = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return store.state.batches;
    return store.state.batches.filter((b: BatchItem) => {
      const r = b.recipeId ? store.state.recipes.find((x: Recipe) => x.id === b.recipeId) : null;
      return (b.name || r?.name || '').toLowerCase().includes(q);
    });
  }, [store.state.batches, store.state.recipes, pickerSearch]);

  // "Cook for 6: leftovers Tue, Thu": a fresh cook that later leftover days depend on.
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
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(520px,calc(100%-24px))] bg-zinc-900 text-white text-sm font-medium pl-4 pr-2 py-2 rounded-2xl shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2" role="status" data-toast>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 min-w-0">{toastMessage}</span>
          {toastAction && (
            <button
              type="button"
              onClick={() => { const run = toastAction.run; setToastMessage(null); run(); }}
              className="h-9 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold shrink-0 cursor-pointer"
              data-toast-action
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}

      {/* TOP SECTION: ALL MEALS (VISUALLY PRIORITIZED) */}
      <div className={`${planningView === 'list' ? 'shrink-0' : 'flex-1 min-h-0'} flex flex-col relative ${showFilterDropdown || showViewOptions ? 'z-35' : 'z-10'}`}>
        {/* Title row: search and one-tap filters (Classic), or just the title (List); view options on the right */}
        <div className={`bg-white border-b border-zinc-200/80 px-3 sm:px-5 py-2 shrink-0 relative ${showViewOptions ? 'z-35' : 'z-10'}`}>
          <div className="flex items-center gap-2">
            {planningView === 'classic' ? (
              isSearchExpanded ? (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      inputMode="search"
                      enterKeyHint="search"
                      value={recipeSearch}
                      onChange={(e) => setRecipeSearch(e.target.value)}
                      placeholder="Search meals, ingredients or notes"
                      aria-label="Search meals"
                      className="w-full h-9 pl-9 pr-8 rounded-xl border border-zinc-300 bg-zinc-50 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
                    />
                    {recipeSearch && (
                      <button type="button" onClick={() => setRecipeSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-zinc-500 flex items-center justify-center cursor-pointer" aria-label="Clear search">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => { setRecipeSearch(''); setIsSearchExpanded(false); }} className="h-9 px-1.5 text-sm font-semibold text-zinc-700 cursor-pointer" aria-label="Close search">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setIsSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
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
                          onClick={() => toggleQuickFilter(id)}
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
                      {/* View: Classic (drag and drop) or List (tap a day) */}
                      <div className="px-1 mb-3">
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">View</span>
                        <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl">
                          {(['classic', 'list'] as const).map(v => (
                            <button
                              key={v}
                              type="button"
                              id={`planning-view-${v}`}
                              onClick={() => { setPlanningView(v); setShowViewOptions(false); }}
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

                      <div className="px-1 mb-2 pt-2 border-t border-zinc-100">
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">Sort</span>
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
                        <label className="flex items-center gap-2 mt-1.5 px-1 py-1 text-xs font-medium text-zinc-700 cursor-pointer">
                          <input type="checkbox" checked={favFirst} onChange={(e) => setFavFirst(e.target.checked)} className="rounded border-zinc-300" />
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
                              checked={(prefs as any)[pref] !== false}
                              onChange={() => store.updatePreferences({ [pref]: (prefs as any)[pref] === false })}
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

        {planningView === 'classic' && (
        /* Recipes Gallery Grid: strictly 2 rows of 3 on desktop */
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col justify-between min-h-0">
          {(recipeSearch.trim() || quickFilters.length > 0) && (
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-600" data-filter-status>
              <span>{filteredRecipes.length} of {store.state.recipes.length} meals</span>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => { setQuickFilters([]); setRecipeSearch(''); setIsSearchExpanded(false); }} className="font-semibold text-emerald-800 underline underline-offset-2 cursor-pointer">Clear</button>
            </div>
          )}
          {filteredRecipes.length === 0 ? (
            <div className="my-auto py-12 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-white/50">
              <ChefHat className="w-8 h-8 text-zinc-300 mb-2" />
              <p className="text-sm font-semibold text-zinc-700">No meals match</p>
              <p className="text-sm text-zinc-500 mt-0.5">{quickFilters.includes('favourites') && !store.state.recipes.some((r: Recipe) => r.favourite) ? 'No favourites yet: star recipes in the Cookbook.' : 'Try fewer filters or another word.'}</p>
            </div>
          ) : (
            <>
              {/* Grid layout: Rows of 2 vs Rows of 1 */}
              <div className={`grid ${mealRowsLayout === 1 ? 'grid-cols-1 gap-2' : 'grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3'}`}>
                {sortedRecipes.map((recipe: Recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    fields={cardFields}
                    history={recipeHistory.get(recipe.id)}
                    freezer={freezerPortions(recipe, store.state.batches)}
                    today={today}
                    inWeek={daysInWeek.get(recipe.id)}
                    wide={mealRowsLayout === 1}
                    onOpen={() => setViewingRecipe(recipe)}
                    dragProps={{
                      draggable: true,
                      onDragStart: () => setDraggedRecipe(recipe),
                      onDragEnd: () => setDraggedRecipe(null),
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* BOTTOM SECTION: WEEKLY PLANNER DOCK (the whole page in the List view) */}
      <div className={`bg-white border-t border-zinc-200/90 ${showWeekDropdown ? 'z-40' : 'z-20'} flex flex-col transition-all duration-200 relative ${
        planningView === 'list'
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
                Weeks
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
                    <span>Plan the week after</span>
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
                      <span>Past weeks</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 font-medium">in Settings →</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Dock bar: ‹ week › and sending to the shopping list */}
        <div className="px-2 sm:px-4 py-1.5 border-b border-zinc-100 flex items-center justify-between gap-2 bg-white shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => prevPlan && switchToPlan(prevPlan.id)}
              disabled={!prevPlan}
              className="w-9 h-9 rounded-lg border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0"
              aria-label="Previous week"
              data-week-prev
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowWeekDropdown(!showWeekDropdown)}
              className="h-9 flex items-center gap-1 px-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 transition-colors cursor-pointer shrink-0"
              aria-label="Choose a week"
              data-week-name
            >
              <span className="text-sm font-semibold text-zinc-900 whitespace-nowrap">
                {currentPlan ? weekLabel(currentPlan.startDate) : ''}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${showWeekDropdown ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (nextPlan) switchToPlan(nextPlan.id);
                else if (currentPlan && canPlanFollowingWeek(currentPlan.startDate, undefined, maxWeeks)) handlePlanFollowingWeek();
              }}
              disabled={!nextPlan && !(currentPlan && canPlanFollowingWeek(currentPlan.startDate, undefined, maxWeeks))}
              className="w-9 h-9 rounded-lg border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0"
              aria-label="Next week"
              data-week-next
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="shrink-0">
            {currentPlan?.status === 'finalized' ? (
              changedDays.length > 0 ? (
                <button
                  type="button"
                  onClick={handleUpdateShoppingList}
                  className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-amber-950 rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title={`Changed since the list was made: ${changedDays.join(', ')}`}
                  data-update-list
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Update list</span>
                  <span className="text-xs font-semibold bg-amber-950/10 rounded px-1">{changedDays.length}<span className="hidden sm:inline"> {changedDays.length === 1 ? 'change' : 'changes'}</span></span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setToastMessage('This week is on the shopping list.', onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', currentPlan?.id) } : null)}
                  className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Sent to the shopping list"
                  data-sent
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Sent</span>
                </button>
              )
            ) : totalPlannedMeals === 0 ? (
              <button
                type="button"
                onClick={() => setShowNoMealsToFinalizeModal(true)}
                className="h-9 px-3 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Plan at least one meal first"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Send to list</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowFinalizeConfirmModal(true)}
                className="h-9 px-3 bg-white hover:bg-emerald-50 text-zinc-900 border border-emerald-400 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                title="Check the week and send it to the shopping list"
                data-send-to-list
              >
                <ShoppingCart className="w-4 h-4 text-emerald-700" />
                <span className="sm:hidden">Send to list</span>
                <span className="hidden sm:inline">Send to shopping list</span>
              </button>
            )}
          </div>
        </div>

        {currentPlan && (
          <WeekGlance
            days={currentPlan.days}
            today={today}
            onJump={jumpToDay}
            action={currentPlan.status !== 'finalized' && totalPlannedMeals === 0 && copyCandidates.length > 0 ? (
              <button
                type="button"
                onClick={() => setCopyWeekState('pick')}
                className="h-8 flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 rounded-lg border border-indigo-200 cursor-pointer whitespace-nowrap"
                title="Fill this week with the meals from another week"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy a week</span>
              </button>
            ) : undefined}
          />
        )}

        {planningView === 'list' && currentPlan ? (
          <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/60" data-day-list ref={listRef}>
            <div className="max-w-2xl mx-auto w-full p-3 space-y-2 pb-6">
              {DAYS_OF_WEEK.map(day => {
                const dayPlan = currentPlan!.days[day];
                const meal = dayPlan?.meals?.[0] || null;
                return (
                  <DayListRow
                    key={day}
                    day={day}
                    dayPlan={dayPlan}
                    meal={meal}
                    today={today}
                    cooksFor={weekCooksForText(currentPlan!.days, day, meal)}
                    fromDay={leftoverSourceDay(currentPlan!.days, day, meal)}
                    onOpen={() => (meal ? setDaySheet(day) : setSelectedDay(day))}
                  />
                );
              })}
            </div>
          </div>
        ) : (
        /* The week strip: drop recipes onto a day, tap a day for its panel */
        <div className="flex-1 p-2 md:p-3 overflow-x-auto overflow-y-hidden min-h-0 flex flex-col scrollbar-thin" ref={stripRef} data-week-strip>
          <div className="grid grid-cols-7 gap-2 sm:gap-3 min-w-[1050px] md:min-w-0 flex-1 h-full">
            {currentPlan && DAYS_OF_WEEK.map(day => {
              const dayPlan = currentPlan!.days[day];
              const meal = dayPlan?.meals?.[0] || null;
              return (
                <WeekDayCard
                  key={day}
                  day={day}
                  dayPlan={dayPlan}
                  meal={meal}
                  today={today}
                  cooksFor={weekCooksForText(currentPlan!.days, day, meal)}
                  fromDay={leftoverSourceDay(currentPlan!.days, day, meal)}
                  dragActive={!!draggedRecipe}
                  onDrop={() => handleDrop(day)}
                  onOpen={() => setDaySheet(day)}
                  onAdd={() => setSelectedDay(day)}
                />
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* The day's panel: people, sides, notes, change, move or swap, remove */}
      {daySheet && currentPlan && currentPlan.days[daySheet]?.meals?.[0] && (() => {
        const day = daySheet;
        const meal = currentPlan.days[day].meals[0];
        const recipe = meal.recipeId ? store.state.recipes.find((r: Recipe) => r.id === meal.recipeId) : null;
        return (
          <DaySheet
            key={`${day}-${meal.id}`}
            day={day}
            dayPlan={currentPlan.days[day]}
            meal={meal}
            cooksFor={weekCooksForText(currentPlan.days, day, meal)}
            fromDay={leftoverSourceDay(currentPlan.days, day, meal)}
            plannedDays={DAYS_OF_WEEK.map((d) => ({ day: d, date: currentPlan!.days[d]?.date, meal: currentPlan!.days[d]?.meals?.[0] || null }))}
            hasRecipe={!!recipe}
            onSave={(patch) => handleSaveDayDetails(day, meal.id, patch)}
            onSides={() => { setDaySheet(null); setSidesEditingMeal({ dayName: day, meal }); }}
            onChangeMeal={() => { setDaySheet(null); setSelectedDay(day); }}
            onMove={(to) => { setDaySheet(null); handleMoveMeal(day, to); }}
            onRemove={() => { setDaySheet(null); handleRemoveMeal(day, meal.id); }}
            onOpenRecipe={recipe ? () => { setDaySheet(null); setViewingRecipe(recipe); } : undefined}
            onClose={() => setDaySheet(null)}
          />
        );
      })()}

      {/* MODAL: Add a recipe to a day (from the recipe pop-up) */}
      {assigningRecipe && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center px-4 pt-[max(1rem,6vh)] pb-4 animate-in fade-in duration-150"
          onClick={() => setAssigningRecipe(null)}
        >
          <div
            role="dialog"
            aria-label={`Add ${assigningRecipe.name} to a day`}
            data-add-to-day
            className="bg-white rounded-2xl p-4 max-w-md w-full shadow-xl border border-zinc-200 max-h-[86vh] flex flex-col animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-100 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-zinc-900">Add to a day</h3>
                <p className="text-sm text-zinc-600 break-words">{assigningRecipe.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningRecipe(null)}
                className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {allowedPlans.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto py-3 shrink-0 -mx-1 px-1" role="tablist" aria-label="Week">
                {allowedPlans.map((p: MealPlan) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={currentPlan?.id === p.id}
                    data-week-chip={weekLabel(p.startDate)}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`shrink-0 h-9 px-3 rounded-full text-sm font-semibold border cursor-pointer ${
                      currentPlan?.id === p.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200'
                    }`}
                  >
                    {weekLabel(p.startDate)}
                  </button>
                ))}
              </div>
            )}
            {currentPlan?.status === 'finalized' && (
              <p className="text-xs text-zinc-600 pb-2 shrink-0">This week's shopping list is made; you'll be asked whether to update it.</p>
            )}

            <div className="overflow-y-auto space-y-1.5 pt-1 pb-1">
              {currentPlan && DAYS_OF_WEEK.map(day => {
                const dayPlan = currentPlan!.days[day];
                const meal = dayPlan?.meals?.[0];
                const date = dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00') : null;
                const past = !!dayPlan?.date && dayPlan.date < today;
                return (
                  <button
                    key={day}
                    type="button"
                    data-add-day={day}
                    onClick={() => handleAssignRecipeToDay(day, assigningRecipe)}
                    className={`w-full text-left rounded-xl border flex items-stretch transition-colors cursor-pointer ${past ? 'border-zinc-100 bg-zinc-50/70' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    <span className={`w-14 shrink-0 flex flex-col items-center justify-center border-r border-zinc-100 py-2 ${past ? 'text-zinc-400' : 'text-zinc-800'}`}>
                      <span className="text-xs font-bold uppercase">{day.slice(0, 3)}</span>
                      <span className="text-base font-bold tabular-nums leading-tight">{date ? date.getDate() : ''}</span>
                    </span>
                    <span className="flex-1 min-w-0 px-3 py-2 flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        {meal ? (
                          <>
                            <span className="block text-sm font-medium text-zinc-900 truncate">{meal.name.replace(/^(leftovers?|batch):\s*/i, '')}</span>
                            <span className="block text-xs text-zinc-500">Tap to replace</span>
                          </>
                        ) : (
                          <span className="block text-sm text-zinc-500">Free</span>
                        )}
                      </span>
                      <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Day Options Modal (Cookbook recipes, Takeaway, Eating out, Freezer) */}
      {selectedDay && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center px-4 pt-[max(1rem,6vh)] pb-4 animate-in fade-in duration-150"
          onClick={() => setSelectedDay(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150 max-h-[86vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Select Meal for {selectedDay}</h3>
                <p className="text-xs text-zinc-500">
                  {currentPlan?.days[selectedDay]?.meals?.length ? 'Replaces the meal already on this day' : 'Pick a recipe or a quick option'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedDay(null)} 
                className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
                {store.state.recipes.length > 6 && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      inputMode="search"
                      autoComplete="off"
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Search recipes or ingredients"
                      aria-label="Search recipes"
                      enterKeyHint="search"
                      className="w-full h-11 pl-9 pr-9 rounded-xl border border-zinc-200 bg-zinc-50 text-base sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-200/70 flex items-center justify-center cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}


              {pickerRecipes.earlier.length > 0 && (
                <div data-picker-earlier>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 block mb-1.5">Cooked earlier this week</span>
                  <div className="space-y-1.5">
                    {pickerRecipes.earlier.map(({ recipe: r, day }) => (
                      <button
                        key={`earlier-${r.id}`}
                        type="button"
                        onClick={() => handleAddRecipeMeal(selectedDay, r)}
                        className="w-full text-left p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 flex items-center justify-between gap-2 transition-colors text-sm cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <RotateCcw className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-900 block truncate">{r.name}</span>
                            <span className="text-xs text-zinc-600">{day}: leftovers or cook again</span>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick choices */}
              {!pickerSearch.trim() && (
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
                    <span className="font-semibold text-xs text-zinc-900 leading-tight">Takeaway</span>
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
                    <span className="font-semibold text-xs text-zinc-900 leading-tight">Eating out</span>
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
              )}

              {/* Batches if any */}
              {pickerBatches.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">Freezer Batches</span>
                  <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                    {pickerBatches.map((batch: BatchItem) => {
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">Cook Book Recipes</span>
                <div className="space-y-1.5" data-picker-recipes>
                  {pickerRecipes.all.map((r: Recipe) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleAddRecipeMeal(selectedDay, r)}
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
                  {store.state.recipes.length === 0 && (
                    <p className="text-sm text-zinc-500 italic py-2">No recipes in the cook book yet.</p>
                  )}
                  {store.state.recipes.length > 0 && pickerRecipes.all.length === 0 && pickerRecipes.earlier.length === 0 && pickerBatches.length === 0 && (
                    <p className="text-sm text-zinc-500 py-2">No recipes match "{pickerSearch.trim()}".</p>
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

      {/* MODAL: Takeaway, Eating out or No meal, with a note and people */}
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
                    {customMealModal.type === 'takeout' ? 'Takeaway' : customMealModal.type === 'eating_out' ? 'Eating out' : 'No meal'}
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
                    <span className="text-xs font-semibold text-zinc-900 block">People</span>
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
                {customMealModal.mealId ? 'Save' : 'Add to the week'}
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
                    Send this week to the shopping list
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
                      You can still send it now and add these later, or tap a day below to add a meal first.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-950 flex items-center gap-2.5 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-900">All 7 days planned</p>
                    <p className="text-[11px] text-emerald-700">Every day of this week has a meal.</p>
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
                              <span>Nothing planned</span>
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
                  <span>What happens when you send it?</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  The week's ingredients go on the <strong>shopping list</strong> and the meals appear in the <strong>Cook</strong> tab. You can still change the week afterwards: an <strong>Update list</strong> button appears.
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
                <span>Send to shopping list</span>
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
              Add a meal first
            </h3>
            
            <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
              Add a meal to at least one day first, then send the week to the shopping list.
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
            <div data-how-question>
              <h3 className="text-lg font-semibold text-zinc-900 leading-snug">{leftoverPrompt.recipe.name}</h3>
              <p className="text-sm text-zinc-600 mt-1 mb-4">How are you having it on {leftoverPrompt.dayName}?</p>
              <div className="space-y-2">
                {leftoverPrompt.existingDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleConfirmLeftover('leftover')}
                    data-how="leftover"
                    className="w-full text-left px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer"
                  >
                    <span className="block text-[15px] font-semibold text-amber-950">Leftovers from {leftoverPrompt.existingDays[leftoverPrompt.existingDays.length - 1]}</span>
                    <span className="block text-xs text-amber-900/80">Cook extra on {leftoverPrompt.existingDays[leftoverPrompt.existingDays.length - 1]} and reheat it</span>
                  </button>
                )}
                {leftoverPrompt.freezer && (
                  <button
                    type="button"
                    onClick={() => handleConfirmLeftover('freezer')}
                    data-how="freezer"
                    className="w-full text-left px-4 py-3 rounded-xl border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 cursor-pointer"
                  >
                    <span className="block text-[15px] font-semibold text-cyan-950">From the freezer</span>
                    <span className={`block text-xs ${leftoverPrompt.freezer.portions < defaultServings ? 'text-amber-800 font-semibold' : 'text-cyan-900/80'}`}>
                      {leftoverPrompt.freezer.portions} {leftoverPrompt.freezer.portions === 1 ? 'portion' : 'portions'} in the freezer
                      {leftoverPrompt.freezer.portions < defaultServings ? ` (you usually cook for ${defaultServings})` : '; nothing to buy'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleConfirmLeftover('fresh')}
                  data-how="fresh"
                  className="w-full text-left px-4 py-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 cursor-pointer"
                >
                  <span className="block text-[15px] font-semibold text-zinc-900">Cook it fresh</span>
                  <span className="block text-xs text-zinc-600">The ingredients go on the shopping list</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeftoverPrompt(null)}
                  className="w-full py-2 text-zinc-500 hover:text-zinc-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
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
        <RecipeModal
          store={store}
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onAddToDay={(recipe) => { setViewingRecipe(null); setAssigningRecipe(recipe); }}
          onNavigateTab={onNavigateTab}
        />
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
              <span>Sides for {meal.name.replace(/^(leftovers?|batch):\s*/i, '')}</span>
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
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Search your grocery list</h4>
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
                  <p className="text-[11px] text-indigo-800/80 mt-0.5">Pick what you buy for "{triageSideName}" so it lands in the right aisle.</p>
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
