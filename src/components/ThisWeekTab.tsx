import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  ChefHat, 
  Sparkles, 
  FileText, 
  X,
  Clock,
  Flame,
  Utensils,
  RotateCcw,
  Snowflake,
  ShoppingBag,
  Plus,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { MealPlan, DayPlan, PlannedMeal, Recipe } from '../types';
import { 
  DAYS_OF_WEEK,
  formatWeekRange, 
  formatWeekStart, 
  getMonday, 
  getNextMonday, 
  formatDateISO, 
  isWeekWithinForwardLimit 
} from '../utils';
import CookMode from './CookMode';
import { RecipeModal } from './CookBookTab';

const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Helper to calculate automatic reheat or batch note
export function getAutomaticNoteForMeal(
  meal: PlannedMeal, 
  dayName: string, 
  days?: Record<string, DayPlan>
): string | null {
  if (!meal) return null;
  const isLeftover = meal.type === 'leftover' || /^leftovers?:\s*/i.test(meal.name || '');
  const isBatch = meal.type === 'batch' || /^batch:\s*/i.test(meal.name || '') || !!meal.batchId;

  if (isLeftover) {
    const currentDayIdx = DAYS_OF_WEEK.indexOf(dayName);
    let sourceDay: string | null = null;
    
    // Look at earlier days in the week
    if (currentDayIdx > 0 && days) {
      const cleanTargetName = (meal.name || '').toLowerCase().replace(/^leftovers?:\s*/i, '').trim();

      // First pass: look for fresh cook of the same recipe on an earlier day
      for (let i = currentDayIdx - 1; i >= 0; i--) {
        const earlierDayName = DAYS_OF_WEEK[i];
        const dayMeals = days[earlierDayName]?.meals || [];
        
        const freshCook = dayMeals.find(m => {
          if (meal.recipeId && m.recipeId === meal.recipeId && m.type === 'recipe') {
            return true;
          }
          if (m.type === 'recipe') {
            const cleanEarlierName = (m.name || '').toLowerCase().replace(/^leftovers?:\s*/i, '').trim();
            if (cleanEarlierName && cleanTargetName && (cleanEarlierName === cleanTargetName || cleanEarlierName.includes(cleanTargetName) || cleanTargetName.includes(cleanEarlierName))) {
              return true;
            }
          }
          return false;
        });

        if (freshCook) {
          sourceDay = earlierDayName;
          break;
        }
      }

      // Second pass: if no fresh cook found, look for any earlier occurrence of this meal/recipe
      if (!sourceDay) {
        for (let i = currentDayIdx - 1; i >= 0; i--) {
          const earlierDayName = DAYS_OF_WEEK[i];
          const dayMeals = days[earlierDayName]?.meals || [];

          const anyMatch = dayMeals.find(m => {
            if (meal.recipeId && m.recipeId === meal.recipeId) return true;
            const cleanEarlierName = (m.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
            return cleanEarlierName && cleanTargetName && (cleanEarlierName === cleanTargetName || cleanEarlierName.includes(cleanTargetName) || cleanTargetName.includes(cleanEarlierName));
          });

          if (anyMatch) {
            sourceDay = earlierDayName;
            break;
          }
        }
      }
    }

    if (sourceDay) {
      return `Reheat from ${sourceDay}`;
    }
    return `Reheat leftovers`;
  }

  if (isBatch) {
    return 'Heat up a premade batch';
  }

  return null;
}

// Compute calendar metadata for a day
function getDayDateMeta(activePlanStartDate: string, dayName: string, dayPlanDate?: string) {
  const dayIndex = DAYS_OF_WEEK.indexOf(dayName);
  let dateObj: Date;

  if (dayPlanDate && /^\d{4}-\d{2}-\d{2}$/.test(dayPlanDate)) {
    dateObj = new Date(dayPlanDate + 'T00:00:00');
  } else if (activePlanStartDate && dayIndex !== -1) {
    const start = new Date(activePlanStartDate + 'T00:00:00');
    dateObj = new Date(start);
    dateObj.setDate(start.getDate() + dayIndex);
  } else {
    dateObj = new Date();
  }

  const iso = formatDateISO(dateObj);
  const now = new Date();
  const todayIso = formatDateISO(now);

  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowIso = formatDateISO(tomorrow);

  const isToday = iso === todayIso;
  const isTomorrow = iso === tomorrowIso;
  const isPast = iso < todayIso;

  const dayNumber = dateObj.getDate();
  const monthName = SHORT_MONTH_NAMES[dateObj.getMonth()];
  const formattedDate = `${dayNumber} ${monthName}`;
  const weekdayShort = dayName.slice(0, 3);

  return {
    iso,
    isToday,
    isTomorrow,
    isPast,
    formattedDate,
    dayNumber,
    monthName,
    weekdayShort
  };
}

// Helper to determine if a fresh recipe needs to be doubled for leftovers later in the week
function getDoubleCookInfo(
  meal: PlannedMeal, 
  dayName: string, 
  activePlan: MealPlan, 
  dayNamesList: string[]
): { isDoubleCook: boolean; extraServings: number; leftoverDays: string[]; totalServings: number } {
  if (meal.type !== 'recipe' || !meal.recipeId) {
    return { isDoubleCook: false, extraServings: 0, leftoverDays: [], totalServings: meal.servings || 2 };
  }

  const startIdx = dayNamesList.indexOf(dayName);
  const leftoverDays: string[] = [];
  let extraServings = 0;

  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < dayNamesList.length; i++) {
      const nextDayName = dayNamesList[i];
      const nextDayMeals = activePlan.days[nextDayName]?.meals || [];
      let foundNewBatch = false;

      for (const m of nextDayMeals) {
        if (m.recipeId === meal.recipeId) {
          if (m.type === 'leftover') {
            const serv = m.servings || 2;
            extraServings += serv;
            leftoverDays.push(nextDayName);
          } else if (m.type === 'recipe') {
            foundNewBatch = true;
            break;
          }
        }
      }

      if (foundNewBatch) break;
    }
  }

  const totalServings = (meal.servings || 2) + extraServings;
  return {
    isDoubleCook: leftoverDays.length > 0,
    extraServings,
    leftoverDays,
    totalServings
  };
}

// Helper to find the fresh cooking source day for a leftover meal
function findLeftoverSourceDay(
  meal: PlannedMeal, 
  currentDayName: string, 
  days?: Record<string, DayPlan>
): string | null {
  if (!days) return null;
  const isLeftover = meal.type === 'leftover' || /^leftovers?:\s*/i.test(meal.name || '');
  if (!isLeftover) return null;

  const currentDayIdx = DAYS_OF_WEEK.indexOf(currentDayName);
  const cleanTargetName = (meal.name || '').toLowerCase().replace(/^leftovers?:\s*/i, '').trim();

  // Search earlier days first
  if (currentDayIdx > 0) {
    for (let i = currentDayIdx - 1; i >= 0; i--) {
      const earlierDay = DAYS_OF_WEEK[i];
      const earlierMeals = days[earlierDay]?.meals || [];
      const freshCook = earlierMeals.find(m => {
        if (m.type === 'recipe') {
          if (meal.recipeId && m.recipeId === meal.recipeId) return true;
          const cleanEarlierName = (m.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
          return cleanEarlierName && cleanTargetName && (cleanEarlierName === cleanTargetName || cleanEarlierName.includes(cleanTargetName) || cleanTargetName.includes(cleanEarlierName));
        }
        return false;
      });
      if (freshCook) return earlierDay;
    }
  }

  // Fallback: search any earlier day that has the same recipe or name
  for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
    const day = DAYS_OF_WEEK[i];
    if (day === currentDayName) break;
    const dayMeals = days[day]?.meals || [];
    const match = dayMeals.find(m => {
      if (meal.recipeId && m.recipeId === meal.recipeId) return true;
      const cleanEarlierName = (m.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
      return cleanEarlierName && cleanTargetName && (cleanEarlierName === cleanTargetName || cleanEarlierName.includes(cleanTargetName) || cleanTargetName.includes(cleanEarlierName));
    });
    if (match) return day;
  }

  return null;
}

// Validate whether a reschedule (replace or swap) violates leftover chronology
function validateRescheduleLeftovers(
  meal: PlannedMeal,
  sourceDay: string,
  targetDay: string,
  mode: 'replace' | 'swap',
  days: Record<string, DayPlan>
): { valid: boolean; reason?: string } {
  const sourceIdx = DAYS_OF_WEEK.indexOf(sourceDay);
  const targetIdx = DAYS_OF_WEEK.indexOf(targetDay);
  if (sourceIdx === -1 || targetIdx === -1 || sourceDay === targetDay) {
    return { valid: true };
  }

  const isMealLeftover = meal.type === 'leftover' || /^leftovers?:\s*/i.test(meal.name || '');

  // Case 1: Moving/Replacing a leftover meal to a day before its fresh cook
  if (isMealLeftover) {
    const sourceCookDay = findLeftoverSourceDay(meal, sourceDay, days);
    if (sourceCookDay) {
      const cookIdx = DAYS_OF_WEEK.indexOf(sourceCookDay);
      if (targetIdx <= cookIdx) {
        return {
          valid: false,
          reason: `Leftovers for "${meal.name}" cannot be scheduled on ${targetDay} because the recipe is cooked on ${sourceCookDay}. Leftovers must follow the cooked meal.`
        };
      }
    }
  }

  // Case 2: Moving/Replacing a fresh cooked meal to a day after its existing leftovers
  if (meal.type === 'recipe') {
    for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
      const day = DAYS_OF_WEEK[i];
      if (day === sourceDay) continue; // The source day is being cleared
      const dayMeals = days[day]?.meals || [];
      const hasLeftover = dayMeals.some(m => {
        if (m.type === 'leftover') {
          if (meal.recipeId && m.recipeId === meal.recipeId) return true;
          const cleanName = (m.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
          const cleanFreshName = (meal.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
          return cleanName && cleanFreshName && (cleanName === cleanFreshName || cleanName.includes(cleanFreshName) || cleanFreshName.includes(cleanName));
        }
        return false;
      });

      if (hasLeftover) {
        // If moving this fresh meal to targetDay, targetDay must be on or before the leftover day
        if (targetIdx >= i) {
          return {
            valid: false,
            reason: `Moving "${meal.name}" to ${targetDay} would place the cook after scheduled leftovers on ${day}. Cook the recipe before scheduling its leftovers.`
          };
        }
      }
    }
  }

  // Case 3: If Swapping, also check if targetDay meals moving back to sourceDay violate chronology
  if (mode === 'swap') {
    const targetMeals = days[targetDay]?.meals || [];
    for (const tMeal of targetMeals) {
      const isTargetLeftover = tMeal.type === 'leftover' || /^leftovers?:\s*/i.test(tMeal.name || '');
      if (isTargetLeftover) {
        const cookDay = findLeftoverSourceDay(tMeal, targetDay, days);
        if (cookDay) {
          const cookIdx = DAYS_OF_WEEK.indexOf(cookDay);
          if (sourceIdx <= cookIdx) {
            return {
              valid: false,
              reason: `Swapping would move leftovers for "${tMeal.name}" to ${sourceDay}, which is before or on the day it is cooked (${cookDay}).`
            };
          }
        }
      }

      if (tMeal.type === 'recipe') {
        for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
          const day = DAYS_OF_WEEK[i];
          if (day === targetDay) continue;
          const dayMeals = days[day]?.meals || [];
          const hasLeftover = dayMeals.some(m => {
            if (m.type === 'leftover') {
              if (tMeal.recipeId && m.recipeId === tMeal.recipeId) return true;
              const cleanName = (m.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
              const cleanTargetName = (tMeal.name || '').toLowerCase().replace(/^(leftovers?|batch):\s*/i, '').trim();
              return cleanName && cleanTargetName && (cleanName === cleanTargetName || cleanName.includes(cleanTargetName) || cleanTargetName.includes(cleanTargetName));
            }
            return false;
          });

          if (hasLeftover && sourceIdx >= i) {
            return {
              valid: false,
              reason: `Swapping would place "${tMeal.name}" on ${sourceDay}, which is after its leftovers on ${day}.`
            };
          }
        }
      }
    }
  }

  return { valid: true };
}

interface ThisWeekTabProps {
  store: any;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings', planId?: string) => void;
}

export default function ThisWeekTab({ store, onNavigateTab }: ThisWeekTabProps) {
  const [cookModeData, setCookModeData] = useState<{
    dayName: string;
    meals: PlannedMeal[];
    activeMealId: string;
    customServings?: number;
  } | null>(null);

  const [selectedRecipeData, setSelectedRecipeData] = useState<{
    recipe: Recipe;
    initialServings: number;
    bannerMessage: React.ReactNode | null;
    meal: PlannedMeal;
    dayName: string;
  } | null>(null);

  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [editingNoteMeal, setEditingNoteMeal] = useState<{
    dayName: string;
    meal: PlannedMeal;
    noteText: string;
  } | null>(null);

  // Quick Reschedule / Swap Modal State
  const [rescheduleData, setRescheduleData] = useState<{
    sourceDay: string;
    meal: PlannedMeal;
    targetDay: string;
    mode: 'replace' | 'swap';
  } | null>(null);

  const currentMonday = getMonday(new Date());
  const nextMonday = getNextMonday(new Date());
  const currentMondayStr = formatDateISO(currentMonday);
  const nextMondayStr = formatDateISO(nextMonday);

  // Cook tab allows current week and future weeks up to 4-week forward limit (no past weeks)
  const allowedPlans: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((plan: MealPlan) => isWeekWithinForwardLimit(plan.startDate))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate));
  }, [store.state.mealPlans]);

  // Default to this week's list
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const plans = (store.state.mealPlans || []).filter((plan: MealPlan) => isWeekWithinForwardLimit(plan.startDate));
    const thisWeekPlan = plans.find((p: MealPlan) => p.startDate === currentMondayStr);
    if (thisWeekPlan) return thisWeekPlan.id;
    return plans[0]?.id || null;
  });

  // Determine active plan among allowed plans
  const activePlan: MealPlan | null = useMemo(() => {
    if (selectedPlanId) {
      const match = allowedPlans.find((p: MealPlan) => p.id === selectedPlanId);
      if (match) return match;
    }
    const currentWeekPlan = allowedPlans.find((p: MealPlan) => p.startDate === currentMondayStr);
    if (currentWeekPlan) return currentWeekPlan;

    return allowedPlans.length > 0 ? allowedPlans[0] : null;
  }, [allowedPlans, selectedPlanId, currentMondayStr]);

  // Keep selectedPlanId synchronized with allowedPlans
  useEffect(() => {
    if (allowedPlans.length > 0) {
      const exists = allowedPlans.some(p => p.id === selectedPlanId);
      if (!exists) {
        const currentWeekPlan = allowedPlans.find(p => p.startDate === currentMondayStr);
        setSelectedPlanId(currentWeekPlan ? currentWeekPlan.id : allowedPlans[0].id);
      }
    } else if (selectedPlanId !== null) {
      setSelectedPlanId(null);
    }
  }, [allowedPlans, selectedPlanId, currentMondayStr]);

  // Auto-sync default notes for leftover and batch meals removed to prevent background API calls and sync loops.
  // The rendering code already dynamically displays getAutomaticNoteForMeal if meal.note is empty.

  const dayNames = useMemo(() => {
    if (!activePlan?.days) return [];
    const standardDays = DAYS_OF_WEEK.filter(day => activePlan.days[day]);
    const extraDays = Object.keys(activePlan.days).filter(day => !DAYS_OF_WEEK.includes(day));
    return [...standardDays, ...extraDays];
  }, [activePlan?.days]);

  // Identify Today's dayName if present in active plan
  const todayDayName = useMemo(() => {
    if (!activePlan) return null;
    for (const d of dayNames) {
      const meta = getDayDateMeta(activePlan.startDate, d, activePlan.days[d]?.date);
      if (meta.isToday) return d;
    }
    return null;
  }, [activePlan, dayNames]);

  // Default scroll so that today is at the top of the screen on load
  useEffect(() => {
    if (todayDayName) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`day-tile-${todayDayName}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [todayDayName]);

  // Weekly aggregate overview
  const weekStats = useMemo(() => {
    if (!activePlan?.days) {
      return { 
        totalMeals: 0, 
        freshCount: 0, 
        leftoverCount: 0, 
        batchCount: 0, 
        takeoutCount: 0, 
        cookedCount: 0,
        totalCookMinutes: 0 
      };
    }

    let totalMeals = 0;
    let freshCount = 0;
    let leftoverCount = 0;
    let batchCount = 0;
    let takeoutCount = 0;
    let cookedCount = 0;
    let totalCookMinutes = 0;

    Object.values(activePlan.days).forEach((dayPlan: DayPlan) => {
      (dayPlan.meals || []).forEach(m => {
        totalMeals++;
        if (m.cooked) cookedCount++;
        if (m.type === 'recipe') {
          freshCount++;
          if (m.recipeId) {
            const r = (store.state.recipes || []).find((rec: Recipe) => rec.id === m.recipeId);
            if (r) {
              totalCookMinutes += (r.prepTime || 10) + (r.cookTime || 20);
            }
          }
        } else if (m.type === 'leftover') {
          leftoverCount++;
          totalCookMinutes += 10;
        } else if (m.type === 'batch') {
          batchCount++;
          totalCookMinutes += 15;
        } else if (m.type === 'takeout' || m.type === 'eating_out') {
          takeoutCount++;
        }
      });
    });

    return { totalMeals, freshCount, leftoverCount, batchCount, takeoutCount, cookedCount, totalCookMinutes };
  }, [activePlan, store.state.recipes]);

  const scrollToDay = (day: string) => {
    const element = document.getElementById(`day-tile-${day}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Toggle meal cooked status
  const handleToggleCooked = (dayName: string, mealId: string, currentStatus?: boolean) => {
    if (!activePlan) return;
    const targetStatus = !currentStatus;
    const day = activePlan.days[dayName];
    if (!day) return;

    const updatedMeals = day.meals.map(m => m.id === mealId ? { ...m, cooked: targetStatus } : m);
    const updatedPlan: MealPlan = {
      ...activePlan,
      days: {
        ...activePlan.days,
        [dayName]: {
          ...day,
          meals: updatedMeals
        }
      }
    };
    store.updateMealPlan(updatedPlan);
  };

  // Execute quick replace or swap of a meal
  const handleExecuteReschedule = () => {
    if (!rescheduleData || !activePlan) return;
    const { sourceDay, targetDay, meal, mode } = rescheduleData;
    if (sourceDay === targetDay) {
      setRescheduleData(null);
      return;
    }

    // Safety guard: ensure leftovers chronology is respected
    const validation = validateRescheduleLeftovers(
      meal,
      sourceDay,
      targetDay,
      mode,
      activePlan.days
    );
    if (!validation.valid) {
      return;
    }

    const sourceDayPlan = activePlan.days[sourceDay];
    const targetDayPlan = activePlan.days[targetDay];
    if (!sourceDayPlan || !targetDayPlan) return;

    const nextDays = { ...activePlan.days };

    if (mode === 'replace') {
      // Replace: Remove from source day, and replace whatever was on target day with this meal
      nextDays[sourceDay] = {
        ...sourceDayPlan,
        meals: sourceDayPlan.meals.filter(m => m.id !== meal.id)
      };
      nextDays[targetDay] = {
        ...targetDayPlan,
        meals: [meal]
      };
    } else if (mode === 'swap') {
      // Swap: Exchange meals between the two days
      const sourceMeals = [...(sourceDayPlan.meals || [])];
      const targetMeals = [...(targetDayPlan.meals || [])];
      nextDays[sourceDay] = {
        ...sourceDayPlan,
        meals: targetMeals
      };
      nextDays[targetDay] = {
        ...targetDayPlan,
        meals: sourceMeals
      };
    }

    store.updateMealPlan({
      ...activePlan,
      days: nextDays
    });

    setRescheduleData(null);
  };

  if (!activePlan) {
    return (
      <div className="h-full flex flex-col bg-[#fafafa] relative overflow-hidden items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400">
          <ChefHat className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">No Cooking Plan Available</h2>
        <p className="text-sm text-zinc-500 mt-2 max-w-sm leading-relaxed">
          Please check your planning tab to get started with your meals.
        </p>
      </div>
    );
  }

  const totalMealsInPlan = Object.values(activePlan.days).reduce((acc, d) => acc + (d.meals?.length || 0), 0);

  const handleSaveCookTabNote = () => {
    if (!editingNoteMeal || !activePlan) return;
    const { dayName, meal, noteText } = editingNoteMeal;
    const day = activePlan.days[dayName];
    if (!day) return;
    const updatedMeals = day.meals.map((m: PlannedMeal) => m.id === meal.id ? { ...m, note: noteText.trim() || undefined } : m);
    const updatedPlan: MealPlan = {
      ...activePlan,
      days: {
        ...activePlan.days,
        [dayName]: {
          ...day,
          meals: updatedMeals
        }
      }
    };
    store.updateMealPlan(updatedPlan);
    setEditingNoteMeal(null);
  };

  const handleStartCookMode = (dayName: string, meals: PlannedMeal[], preselectedMealId?: string, customServings?: number) => {
    const cookableMeals = meals.filter(m => m.recipeId && (m.type === 'recipe' || m.type === 'leftover' || m.type === 'batch'));
    if (cookableMeals.length === 0) return;
    
    setCookModeData({
      dayName,
      meals: cookableMeals,
      activeMealId: preselectedMealId || cookableMeals[0].id,
      customServings
    });
  };

  const handleMealClick = (meal: PlannedMeal, dayName: string) => {
    if (meal.type === 'takeout' || meal.type === 'eating_out' || meal.type === 'no_meal') {
      const autoNote = getAutomaticNoteForMeal(meal, dayName, activePlan?.days);
      setEditingNoteMeal({
        dayName,
        meal,
        noteText: meal.note || autoNote || ''
      });
      return;
    }

    if (meal.recipeId && activePlan) {
      const recipe = (store.state.recipes || []).find((r: Recipe) => r.id === meal.recipeId);
      if (!recipe) return;

      let bannerMessage: React.ReactNode = null;
      let totalServings = meal.servings || 2;

      if (meal.type === 'leftover') {
        bannerMessage = (
          <span>
            <strong>Leftover Meal:</strong> This portion should already be prepared in your fridge from earlier this week. No fresh prep required!
          </span>
        );
      } else if (meal.type === 'recipe') {
        const doubleCook = getDoubleCookInfo(meal, dayName, activePlan, dayNames);
        totalServings = doubleCook.totalServings;

        if (doubleCook.isDoubleCook) {
          bannerMessage = (
            <span>
              <strong>Cook Double!</strong> Scale ingredients up to prepare portions for leftovers on <strong>{doubleCook.leftoverDays.join(' & ')}</strong>.
            </span>
          );
        }
      } else if (meal.type === 'batch') {
        bannerMessage = (
          <span>
            <strong>Batch Cooking:</strong> This meal is planned for freezer storage. Follow standard portions!
          </span>
        );
      }

      setSelectedRecipeData({
        recipe,
        initialServings: totalServings,
        bannerMessage,
        meal,
        dayName
      });
    }
  };

  // Helper for quick rescheduling target default
  const openRescheduleModal = (meal: PlannedMeal, currentDay: string) => {
    const currentIdx = DAYS_OF_WEEK.indexOf(currentDay);
    const isMealLeftover = meal.type === 'leftover' || /^leftovers?:\s*/i.test(meal.name || '');
    const sourceCookDay = isMealLeftover ? findLeftoverSourceDay(meal, currentDay, activePlan?.days) : null;
    const cookIdx = sourceCookDay ? DAYS_OF_WEEK.indexOf(sourceCookDay) : -1;

    // Pick a valid candidate target day that is AFTER the cook day if it's a leftover
    let candidateDay = currentDay;
    for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
      const d = DAYS_OF_WEEK[i];
      if (d === currentDay) continue;
      if (isMealLeftover && cookIdx !== -1 && i <= cookIdx) continue;
      candidateDay = d;
      break;
    }

    setRescheduleData({
      sourceDay: currentDay,
      meal,
      targetDay: candidateDay,
      mode: 'replace'
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative overflow-hidden">
      {/* Header matching Planner, Cookbook and Shop tab styling */}
      <header className="bg-white border-b border-zinc-200/80 px-4 sm:px-5 py-2.5 shrink-0 relative z-40">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <span className="text-sm font-bold text-zinc-900 tracking-tight whitespace-nowrap">
              Cook Schedule
            </span>
          </div>
          
          <div className="flex items-center gap-2 relative z-50 shrink-0">
            {/* Week Dropdown Selector */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 transition-colors shadow-2xs cursor-pointer text-xs font-semibold"
              >
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs font-semibold text-zinc-900">
                  {activePlan.startDate === currentMondayStr 
                    ? `This Week (${formatWeekStart(activePlan.startDate)})` 
                    : activePlan.startDate === nextMondayStr
                    ? `Next Week (${formatWeekStart(activePlan.startDate)})`
                    : formatWeekStart(activePlan.startDate)}
                </span>
                {activePlan.status === 'finalized' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                )}
                <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showWeekDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Week Selector Menu */}
              {showWeekDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowWeekDropdown(false)} 
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-zinc-200 p-2 z-40 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Switch Week
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {allowedPlans.map((plan: MealPlan) => {
                        const isSelected = plan.id === activePlan?.id;
                        const isCurrent = plan.startDate === currentMondayStr;
                        const isNext = plan.startDate === nextMondayStr;
                        const mealCount = Object.values(plan.days).reduce((acc, d) => acc + (d.meals?.length || 0), 0);

                        return (
                          <button
                            key={plan.id}
                            type="button"
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
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-zinc-900 truncate">
                                  {plan.startDate === currentMondayStr ? 'This Week' : plan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(plan.startDate)}
                                </span>
                                {isCurrent && (
                                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                                    This Week
                                  </span>
                                )}
                                {isNext && (
                                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 shrink-0">
                                    Next Week
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-400 mt-0.5 block">
                                {mealCount} {mealCount === 1 ? 'meal' : 'meals'} planned
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3.5 sm:p-5 md:p-6 pb-24 max-w-3xl mx-auto w-full space-y-3.5 sm:space-y-5">
        {totalMealsInPlan === 0 && (
          <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-6 text-center shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-2.5 text-zinc-400">
              <ChefHat className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-900">No Meals Planned for this Week Yet</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              You can choose meals for {formatWeekRange(activePlan.startDate)} in the Planning tab, and they will appear here with portions and cooking details.
            </p>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('planning')}
                className="mt-3.5 px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
              >
                Go to Planning
              </button>
            )}
          </div>
        )}

        {/* Day Tiles */}
        {dayNames.map((dayName) => {
          const dayPlan = activePlan.days[dayName];
          const meals = dayPlan?.meals || [];
          const meta = getDayDateMeta(activePlan.startDate, dayName, dayPlan?.date);
          const isToday = meta.isToday;
          const isPast = meta.isPast;

          // Determine day meal composition (e.g. all leftovers, or fresh recipe cook)
          const hasFreshRecipe = meals.some(m => m.type === 'recipe');
          const isLeftoverDay = meals.length > 0 && !hasFreshRecipe && meals.some(m => m.type === 'leftover');

          // Calculate estimated prep and cook time for fresh cooking
          const dayTimes = meals.reduce((acc, m) => {
            if (m.type === 'recipe' && m.recipeId) {
              const r = (store.state.recipes || []).find((rec: Recipe) => rec.id === m.recipeId);
              if (r) {
                acc.prep += (r.prepTime || 10);
                acc.cook += (r.cookTime || 20);
                return acc;
              }
            } else if (m.type === 'recipe') {
              acc.prep += 10;
              acc.cook += 20;
            }
            return acc;
          }, { prep: 0, cook: 0 });

          const totalDayMinutes = dayTimes.prep + dayTimes.cook;

          return (
            <section
              key={dayName}
              id={`day-tile-${dayName}`}
              aria-label={`${dayName} meal plan`}
              className={`rounded-2xl transition-all scroll-mt-24 overflow-hidden ${
                isToday 
                  ? 'bg-white border-2 border-emerald-500/60 shadow-md ring-4 ring-emerald-500/10' 
                  : isPast 
                  ? 'bg-white border border-zinc-200/70 shadow-2xs opacity-95 hover:opacity-100'
                  : 'bg-white border border-zinc-200/90 shadow-2xs hover:shadow-xs'
              }`}
            >
              {/* Day Tile Header */}
              <div className={`px-3.5 py-2 sm:px-4 sm:py-2.5 border-b flex items-center justify-between ${
                isToday 
                  ? 'bg-emerald-50/70 border-emerald-100' 
                  : 'bg-zinc-50/70 border-zinc-100/90'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-baseline gap-1.5 sm:gap-2">
                    <h3 className={`font-bold text-sm tracking-tight ${isToday ? 'text-emerald-950 font-extrabold' : 'text-zinc-900'}`}>
                      {dayName}
                    </h3>
                    <span className={`text-[11px] sm:text-xs font-medium ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`}>
                      · {meta.formattedDate}
                    </span>
                  </div>

                  {isToday && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase bg-emerald-600 text-white shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Today
                    </span>
                  )}
                  {!isToday && meta.isTomorrow && (
                    <span className="inline-flex items-center px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold text-zinc-600 bg-zinc-200/80">
                      Tomorrow
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-zinc-500 shrink-0">
                  {meals.length === 0 ? (
                    <span className="text-zinc-400 font-medium">Rest day</span>
                  ) : isLeftoverDay ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                      <RotateCcw className="w-3 h-3 text-amber-600" />
                      <span>Reheat</span>
                    </span>
                  ) : totalDayMinutes > 0 ? (
                    <div className="flex items-center gap-1.5 text-zinc-600 font-medium">
                      {dayTimes.prep > 0 && (
                        <span>Prep {dayTimes.prep}m</span>
                      )}
                      {dayTimes.prep > 0 && dayTimes.cook > 0 && (
                        <span aria-hidden="true" className="text-zinc-300">·</span>
                      )}
                      {dayTimes.cook > 0 && (
                        <span>Cook {dayTimes.cook}m</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Meals List */}
              <div className="divide-y divide-zinc-100/80">
                {meals.length === 0 ? (
                  <div className="px-4 py-5 flex items-center justify-between text-zinc-400">
                    <span className="text-xs">No cooking scheduled for {dayName}.</span>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('planning')}
                        className="text-xs font-semibold text-zinc-700 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>Plan a meal</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  meals.map(meal => {
                    const isRecipeMeal = meal.type === 'recipe' || meal.type === 'leftover' || meal.type === 'batch';
                    const recipe = meal.recipeId ? (store.state.recipes || []).find((r: Recipe) => r.id === meal.recipeId) : null;
                    const autoNote = getAutomaticNoteForMeal(meal, dayName, activePlan.days);
                    const effectiveNote = meal.note || autoNote;
                    const doubleCookInfo = getDoubleCookInfo(meal, dayName, activePlan, dayNames);
                    const isCooked = !!meal.cooked;

                    // Descriptive label for meal type
                    const mealTypeLabel = 
                      meal.type === 'recipe' ? 'Fresh Cook' :
                      meal.type === 'leftover' ? 'Leftovers' :
                      meal.type === 'batch' ? 'Freezer Batch' :
                      meal.type === 'takeout' ? 'Takeout' :
                      meal.type === 'eating_out' ? 'Dining Out' : 'Rest Day';

                    return (
                      <div
                        key={meal.id}
                        className={`p-3 sm:p-4 transition-all group ${
                          isCooked ? 'bg-zinc-50/70 opacity-80 hover:opacity-100' : 'hover:bg-zinc-50/60'
                        }`}
                      >
                        {/* Main Meal Row: Responsive Stack on Mobile */}
                        <div 
                          onClick={() => handleMealClick(meal, dayName)}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                            {/* Visual Thumbnail or Domain Avatar with Cooked Overlay Checkbox */}
                            <div className="shrink-0 pt-0.5 sm:pt-0 relative">
                              {recipe?.imageUrl ? (
                                <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-zinc-200/80 shadow-2xs group-hover:border-emerald-300 transition-colors">
                                  <img 
                                    src={recipe.imageUrl} 
                                    alt={meal.name} 
                                    className={`w-full h-full object-cover transition-transform duration-300 ${
                                      isCooked ? 'grayscale-40 contrast-95' : 'group-hover:scale-105'
                                    }`} 
                                  />
                                  {isCooked ? (
                                    <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-2xs flex items-center justify-center">
                                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                                        <Check className="w-3 h-3 stroke-3" />
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {meal.type === 'leftover' && (
                                        <div className="absolute bottom-0 inset-x-0 bg-amber-900/80 text-white text-[7px] sm:text-[8px] font-bold text-center py-0.5 backdrop-blur-xs">
                                          Reheat
                                        </div>
                                      )}
                                      {meal.type === 'batch' && (
                                        <div className="absolute bottom-0 inset-x-0 bg-cyan-900/80 text-white text-[7px] sm:text-[8px] font-bold text-center py-0.5 backdrop-blur-xs">
                                          Freezer
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl flex flex-col items-center justify-center border shadow-2xs transition-transform ${
                                  isCooked 
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                                    : meal.type === 'takeout' ? 'bg-orange-50 border-orange-200/80 text-orange-600' 
                                    : meal.type === 'eating_out' ? 'bg-blue-50 border-blue-200/80 text-blue-600' 
                                    : meal.type === 'leftover' ? 'bg-amber-50 border-amber-200/80 text-amber-700' 
                                    : meal.type === 'batch' ? 'bg-cyan-50 border-cyan-200/80 text-cyan-700' 
                                    : meal.type === 'no_meal' ? 'bg-zinc-100 border-zinc-200 text-zinc-500' 
                                    : 'bg-emerald-50 border-emerald-200/80 text-emerald-700 group-hover:scale-102'
                                }`}>
                                  {isCooked ? (
                                    <>
                                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                                      <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider mt-0.5 text-emerald-700">Cooked</span>
                                    </>
                                  ) : (
                                    <>
                                      {meal.type === 'takeout' ? <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" /> :
                                       meal.type === 'eating_out' ? <Utensils className="w-4 h-4 sm:w-5 sm:h-5" /> :
                                       meal.type === 'leftover' ? <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" /> :
                                       meal.type === 'batch' ? <Snowflake className="w-4 h-4 sm:w-5 sm:h-5" /> :
                                       meal.type === 'no_meal' ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> :
                                       <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />}
                                      <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider mt-0.5 opacity-90">
                                        {meal.type === 'takeout' ? 'Takeout' :
                                         meal.type === 'eating_out' ? 'Dine Out' :
                                         meal.type === 'leftover' ? 'Reheat' :
                                         meal.type === 'batch' ? 'Freezer' :
                                         meal.type === 'no_meal' ? 'Rest' : 'Fresh'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Meal Info and Metadata */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                                  isCooked ? 'text-zinc-500' :
                                  meal.type === 'recipe' ? 'text-emerald-700' :
                                  meal.type === 'leftover' ? 'text-amber-700' :
                                  meal.type === 'batch' ? 'text-cyan-700' :
                                  meal.type === 'takeout' ? 'text-orange-700' :
                                  meal.type === 'eating_out' ? 'text-blue-700' : 'text-zinc-500'
                                }`}>
                                  {mealTypeLabel}
                                </span>

                                {isCooked && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                    <Check className="w-2.5 h-2.5 stroke-3" />
                                    Cooked
                                  </span>
                                )}
                              </div>

                              <h4 className={`font-bold text-sm sm:text-base leading-snug truncate transition-colors ${
                                isCooked ? 'text-zinc-500 line-through' : 'text-zinc-900 group-hover:text-emerald-800'
                              }`}>
                                {meal.name}
                              </h4>

                              {/* Unboxed Metadata with Typographic Separators */}
                              <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-zinc-500 mt-0.5">
                                <span>
                                  {meal.type === 'no_meal' ? 'No cooking' : `${meal.servings || 2} portions`}
                                </span>
                                {meal.sides && meal.sides.length > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50/50 border border-indigo-100 rounded px-1.5 py-0.2 text-[10px]">
                                      🥗 {meal.sides.map(s => `${s.name} (${s.amount}${s.unit})`).join(', ')}
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Contextual Smart Notice: Double Cook */}
                              {!isCooked && doubleCookInfo.isDoubleCook && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] sm:text-[11px] font-medium shadow-3xs">
                                  <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 shrink-0" />
                                  <span>
                                    <strong>Cook Double:</strong> {doubleCookInfo.totalServings} portions (extra for {doubleCookInfo.leftoverDays.join(' & ')})
                                  </span>
                                </div>
                              )}

                              {/* Contextual Smart Notice: Leftovers source */}
                              {!isCooked && meal.type === 'leftover' && autoNote && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/70 text-[10px] sm:text-[11px] font-medium shadow-3xs">
                                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 shrink-0" />
                                  <span>{autoNote}</span>
                                </div>
                              )}

                              {/* Contextual Smart Notice: Freezer Batch */}
                              {!isCooked && meal.type === 'batch' && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-cyan-50 text-cyan-900 border border-cyan-200/70 text-[10px] sm:text-[11px] font-medium shadow-3xs">
                                  <Snowflake className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-600 shrink-0" />
                                  <span>Freezer batch — thaw or reheat</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quick Actions Panel: Clean Row on Mobile */}
                          <div 
                            className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-zinc-100/90 sm:shrink-0" 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1.5">
                              {/* Mark as Cooked Checkbox / Action Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCooked(dayName, meal.id, meal.cooked);
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-3xs ${
                                  isCooked 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                    : 'bg-white hover:bg-zinc-100 text-zinc-600 border-zinc-200/90'
                                }`}
                                title={isCooked ? 'Mark as not cooked' : 'Mark meal as cooked'}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                                  isCooked 
                                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                                    : 'border-zinc-300 bg-white'
                                }`}>
                                  {isCooked && <Check className="w-2.5 h-2.5 stroke-3" />}
                                </div>
                                <span className="text-[11px]">
                                  {isCooked ? 'Cooked' : 'Mark cooked'}
                                </span>
                              </button>

                              {/* Quick Day Reschedule / Swap */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRescheduleModal(meal, dayName);
                                }}
                                className="p-1.5 sm:p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200/60 transition-all cursor-pointer"
                                title="Reschedule or swap to another day"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Cook Mode for fresh recipes */}
                            {meal.type === 'recipe' && (
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                {!isCooked && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartCookMode(dayName, [meal], meal.id);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold shadow-xs hover:shadow-sm transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white"
                                    title="Start Cook Mode for this recipe"
                                  >
                                    <ChefHat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    <span>Cook</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleMealClick(meal, dayName)}
                                  className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                                  title="View full recipe & ingredients"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Integrated Note inside the Meal Card */}
                        {effectiveNote && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingNoteMeal({ dayName, meal, noteText: effectiveNote });
                            }}
                            className="mt-2.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-50/80 hover:bg-amber-100/90 border border-amber-200/70 text-amber-950 text-xs flex items-center justify-between gap-2.5 cursor-pointer transition-all shadow-3xs group/note"
                            title="Click to edit meal note"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-700 shrink-0" />
                              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-amber-800 shrink-0">Note:</span>
                              <span className="text-[11px] sm:text-xs text-amber-950 font-medium truncate leading-normal">{effectiveNote}</span>
                            </div>
                            <span className="text-[10px] text-amber-700 font-bold opacity-70 group-hover/note:opacity-100 transition-opacity shrink-0">
                              Edit
                            </span>
                          </div>
                        )}

                        {/* Subtle Add Note trigger if no note exists */}
                        {!effectiveNote && (
                          <div className="mt-1.5 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNoteMeal({ dayName, meal, noteText: '' });
                              }}
                              className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                              title="Add note to this meal"
                            >
                              <Plus className="w-3 h-3 text-zinc-400" />
                              <span>Add note</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Quick Reschedule / Swap Day Modal */}
      {rescheduleData && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setRescheduleData(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-700">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">
                    Reschedule Meal
                  </h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                    {rescheduleData.meal.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleData(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Reschedule Type (Replace vs Swap) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                  Action
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleData({ ...rescheduleData, mode: 'replace' })}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      rescheduleData.mode === 'replace'
                        ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5" />
                      Replace
                    </span>
                    <span className={`text-[10px] ${rescheduleData.mode === 'replace' ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      Overwrites target meal
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRescheduleData({ ...rescheduleData, mode: 'swap' })}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      rescheduleData.mode === 'swap'
                        ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Swap Days
                    </span>
                    <span className={`text-[10px] ${rescheduleData.mode === 'swap' ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      Exchange both days
                    </span>
                  </button>
                </div>
              </div>

              {/* Destination Day Selection */}
              <div>
                <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                  Destination Day (Currently on {rescheduleData.sourceDay})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {dayNames.map(dName => {
                    const isCurrent = dName === rescheduleData.sourceDay;
                    const isTarget = dName === rescheduleData.targetDay;
                    const targetMeals = activePlan.days[dName]?.meals || [];
                    const firstTargetMealName = targetMeals[0]?.name;

                    // Validate if target day is valid under leftover chronology
                    const check = validateRescheduleLeftovers(
                      rescheduleData.meal,
                      rescheduleData.sourceDay,
                      dName,
                      rescheduleData.mode,
                      activePlan.days
                    );
                    const isInvalidLeftover = !check.valid;

                    return (
                      <button
                        key={dName}
                        type="button"
                        disabled={isCurrent || isInvalidLeftover}
                        onClick={() => setRescheduleData({ ...rescheduleData, targetDay: dName })}
                        className={`p-2 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer ${
                          isCurrent 
                            ? 'opacity-40 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed'
                            : isInvalidLeftover
                            ? 'opacity-40 border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed'
                            : isTarget
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-3xs ring-2 ring-emerald-500/20'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                        title={isInvalidLeftover ? check.reason : undefined}
                      >
                        <div className="flex items-center justify-between">
                          <span>{dName}</span>
                          {isTarget && !isInvalidLeftover && <Check className="w-3 h-3 text-emerald-600" />}
                        </div>
                        <span className="text-[10px] text-zinc-400 block mt-0.5 font-normal truncate max-w-[100px]">
                          {isCurrent 
                            ? 'Current day' 
                            : isInvalidLeftover
                            ? 'Before cook'
                            : firstTargetMealName 
                            ? firstTargetMealName 
                            : 'Empty'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Validation Warning or Action Context Summary */}
              {(() => {
                const currentValidation = validateRescheduleLeftovers(
                  rescheduleData.meal,
                  rescheduleData.sourceDay,
                  rescheduleData.targetDay,
                  rescheduleData.mode,
                  activePlan.days
                );

                if (!currentValidation.valid) {
                  return (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-xs text-amber-950 flex items-start gap-2 shadow-3xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 leading-snug">
                        <strong className="block text-amber-900 font-semibold mb-0.5">Chronology Error:</strong>
                        <span>{currentValidation.reason}</span>
                      </div>
                    </div>
                  );
                }

                if (rescheduleData.targetDay && rescheduleData.targetDay !== rescheduleData.sourceDay) {
                  return (
                    <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 text-[11px] text-zinc-600 leading-relaxed">
                      {rescheduleData.mode === 'replace' ? (
                        <p>
                          <strong>Replace:</strong> Moves <em>{rescheduleData.meal.name}</em> to <strong>{rescheduleData.targetDay}</strong> and removes {activePlan.days[rescheduleData.targetDay]?.meals?.length ? `existing meal (${activePlan.days[rescheduleData.targetDay].meals.map(m => m.name).join(', ')})` : 'any prior meals'}.
                        </p>
                      ) : (
                        <p>
                          <strong>Swap:</strong> Exchanges meals between <strong>{rescheduleData.sourceDay}</strong> and <strong>{rescheduleData.targetDay}</strong>.
                        </p>
                      )}
                    </div>
                  );
                }

                return null;
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setRescheduleData(null)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {(() => {
                const isValid = validateRescheduleLeftovers(
                  rescheduleData.meal,
                  rescheduleData.sourceDay,
                  rescheduleData.targetDay,
                  rescheduleData.mode,
                  activePlan.days
                ).valid && rescheduleData.sourceDay !== rescheduleData.targetDay;

                return (
                  <button
                    type="button"
                    disabled={!isValid}
                    onClick={handleExecuteReschedule}
                    className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors text-center shadow-2xs cursor-pointer"
                  >
                    {rescheduleData.mode === 'replace' 
                      ? `Replace on ${rescheduleData.targetDay}` 
                      : `Swap with ${rescheduleData.targetDay}`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNoteMeal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setEditingNoteMeal(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border shadow-2xs ${
                  editingNoteMeal.meal.type === 'takeout' ? 'bg-orange-50 border-orange-100 text-orange-600' :
                  editingNoteMeal.meal.type === 'eating_out' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                  editingNoteMeal.meal.type === 'leftover' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                  editingNoteMeal.meal.type === 'batch' ? 'bg-cyan-50 border-cyan-100 text-cyan-700' :
                  editingNoteMeal.meal.type === 'no_meal' ? 'bg-zinc-100 border-zinc-200 text-zinc-600' :
                  'bg-emerald-600 border-emerald-600 text-white'
                }`}>
                  {editingNoteMeal.meal.type === 'takeout' ? '🥡' : 
                   editingNoteMeal.meal.type === 'eating_out' ? '🍽️' : 
                   editingNoteMeal.meal.type === 'no_meal' ? '🚫' :
                   editingNoteMeal.meal.type === 'leftover' ? '🍱' : 
                   editingNoteMeal.meal.type === 'batch' ? '❄️' : '🍲'}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">
                    {editingNoteMeal.noteText ? 'Edit Note' : 'Add Note'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {editingNoteMeal.dayName} • {editingNoteMeal.meal.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingNoteMeal(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4">
              <label className="block text-xs font-semibold text-zinc-900 mb-1">
                Meal Note
              </label>
              <textarea
                value={editingNoteMeal.noteText}
                onChange={(e) => setEditingNoteMeal({ ...editingNoteMeal, noteText: e.target.value })}
                placeholder="Add note details for this meal (e.g. pickup time, prep in morning, thaw freezer batch)..."
                rows={4}
                className="w-full text-xs p-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors resize-none placeholder:text-zinc-400 text-zinc-800"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setEditingNoteMeal(null)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCookTabNote}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors text-center shadow-2xs cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Modal with Double-Cooking Scaling */}
      {selectedRecipeData && (
        <RecipeModal
          store={store}
          recipe={selectedRecipeData.recipe}
          initialServings={selectedRecipeData.initialServings}
          bannerMessage={selectedRecipeData.bannerMessage}
          onClose={() => setSelectedRecipeData(null)}
          onStartCook={(servings) => {
            const m = selectedRecipeData.meal;
            const dName = selectedRecipeData.dayName;
            setSelectedRecipeData(null);
            handleStartCookMode(dName, [m], m.id, servings);
          }}
        />
      )}

      {/* Interactive Step-by-Step Cook Mode with Screen Wake Lock & Mark Cooked */}
      {cookModeData && (
        <CookMode
          store={store}
          dayName={cookModeData.dayName}
          meals={cookModeData.meals}
          initialActiveMealId={cookModeData.activeMealId}
          activePlan={activePlan}
          onClose={() => setCookModeData(null)}
          onMarkCooked={(mealId, cooked) => {
            handleToggleCooked(cookModeData.dayName, mealId, !cooked);
          }}
          initialServings={cookModeData.customServings}
        />
      )}
    </div>
  );
}
