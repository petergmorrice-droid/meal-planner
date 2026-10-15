import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  Check, 
  Trash2, 
  ShoppingBag, 
  Snowflake, 
  X, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  RotateCcw, 
  BookOpen, 
  Coins, 
  ArrowUpDown, 
  Layers, 
  Store,
  Info,
  ShoppingCart,
  Eye,
  Heart,
  Search,
  UserPlus,
  MoreHorizontal,
  Sliders,
  Edit3
} from 'lucide-react';
import { ShoppingListItem, Recipe, MealPlan, DayPlan } from '../types';
import { useGracefulCheckoff } from '../hooks/useGracefulCheckoff';
import { aggregateIngredients } from '../utils/aggregation';
import { matchProduct, groupingKey, canonicalUnit, formatUnit } from '../shopping';
import ShopAisleGroup from './ShopAisleGroup';
import CatalogDrawer from './CatalogDrawer';
import EditItemDrawer from './EditItemDrawer';
import BatchMealModal from './BatchMealModal';
import { IngredientTriageModal } from './IngredientTriageModal';
import Fuse from 'fuse.js';
import { 
  formatWeekRange, 
  formatWeekStart, 
  generateShoppingListForPlan, 
  createEmptyPlan, 
  getMonday, 
  getNextMonday, 
  formatDateISO, 
  canPlanFollowingWeek, 
  isWeekWithinForwardLimit, 
  FoodAisle, 
  GROCERY_AISLES, 
  getGroceryAisle,
  DAYS_OF_WEEK,
  getIngredientStep,
  convertToShoppingQuantity,
  quantityForAddedItem,
  getCatalog,
  findGroceryDatabaseMatch,
  parseQtyAndUnit,
  syncRecurringStaplesForPlan,
  syncRecurringStaplesForAllPlans
} from '../utils';
import { INITIAL_GROCERY_DATABASE } from '../utils/initialGroceryDb';

interface ShopTabProps {
  store: any;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings', planId?: string) => void;
}

type ViewMode = 'sections' | 'food_type' | 'all';
type SortOption = 'food_type' | 'alpha' | 'status';

export interface MealRequirementDetail {
  recipeName: string;
  night: string;
  servings: number;
  amount: number | string;
  displayQuantity?: string;
  unit: string;
}

export interface PlannedRequirement {
  requiredAmount: number;
  recipes: string[];
  nights: string[];
  breakdown: MealRequirementDetail[];
}

export interface ThresholdWarningState {
  item: ShoppingListItem;
  targetAmount: number;
  isRemoval?: boolean;
  requirement: PlannedRequirement;
}

export function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export default function ShopTab({ store, onNavigateTab }: ShopTabProps) {
  // Modal states
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showEditStaplesModal, setShowEditStaplesModal] = useState(false);
  const [catalogInitialTab, setCatalogInitialTab] = useState<'catalog' | 'batch'>('catalog');

  const DEFAULT_FAVOURITES = [
    { name: 'Milk', category: 'Dairy' },
    { name: 'Eggs', category: 'Dairy' },
    { name: 'Bread', category: 'Bakery' },
    { name: 'Butter', category: 'Dairy' },
    { name: 'Coffee', category: 'Pantry' },
    { name: 'Tea', category: 'Pantry' },
    { name: 'Toilet Paper', category: 'Household' },
    { name: 'Olive Oil', category: 'Pantry' }
  ];

  const favourites = useMemo<{ name: string; category: string }[]>(() => {
    if (store?.state?.preferences?.favouriteItems && store.state.preferences.favouriteItems.length > 0) {
      return store.state.preferences.favouriteItems;
    }
    try {
      const stored = localStorage.getItem('mealPlannerCustomFavouritesObj');
      if (stored) return JSON.parse(stored);
      const legacy = localStorage.getItem('mealPlannerCustomFavourites');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) return parsed.map((p: string) => ({ name: p, category: 'Staples' }));
      }
    } catch (err) {}
    return DEFAULT_FAVOURITES;
  }, [store?.state?.preferences?.favouriteItems]);

  const toggleFavourite = (name: string, category: string = 'Staples') => {
    const exists = favourites.some(f => f.name.toLowerCase() === name.toLowerCase());
    const nextFavs = exists
      ? favourites.filter(f => f.name.toLowerCase() !== name.toLowerCase())
      : [...favourites, { name, category }];

    try {
      localStorage.setItem('mealPlannerCustomFavouritesObj', JSON.stringify(nextFavs));
    } catch (err) {}

    if (store?.updatePreferences) {
      store.updatePreferences({ favouriteItems: nextFavs });
    }
  };
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isShoppingMode, setIsShoppingMode] = useState(false);

  // Grouping and sorting states
  const [viewMode, setViewMode] = useState<ViewMode>('sections');
  const [sortBy, setSortBy] = useState<SortOption>('food_type');
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'to_buy' | 'bought'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'planned' | 'batch' | 'adhoc'>('all');
  const [dropCompletedToBottom, setDropCompletedToBottom] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('shop_drop_completed_to_bottom');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [unmappedItems, setUnmappedItems] = useState<any[]>([]);
  const [pendingQuickAdd, setPendingQuickAdd] = useState<{name: string, category?: string} | null>(null);

  const handleToggleDropCompleted = (val: boolean) => {
    setDropCompletedToBottom(val);
    try {
      localStorage.setItem('shop_drop_completed_to_bottom', String(val));
    } catch {
      // ignore
    }
  };

  // Collapsible dropdown sections: Items open by default, Meal Ingredients & Batch Meals closed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    adhoc: true,
    recurring: true,
    planned: false,
    batch: false
  });

  const [openAisles, setOpenAisles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    (Object.keys(GROCERY_AISLES) as FoodAisle[]).forEach(k => {
      initial[k] = true;
    });
    return initial;
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const toggleAisle = (aisleKey: string) => {
    setOpenAisles(prev => ({
      ...prev,
      [aisleKey]: !prev[aisleKey]
    }));
  };

  // Auto-hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const currentMonday = getMonday(new Date());
  const nextMonday = getNextMonday(new Date());
  const currentMondayStr = formatDateISO(currentMonday);
  const nextMondayStr = formatDateISO(nextMonday);

  // All meal plans sorted chronologically, filtered to current and future weeks within 4-week forward limit
  const allPlans: MealPlan[] = useMemo(() => {
    return [...(store.state.mealPlans || [])]
      .filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate))
      .sort((a: MealPlan, b: MealPlan) => 
        a.startDate.localeCompare(b.startDate)
      );
  }, [store.state.mealPlans]);

  // Active selected week plan ID - defaults to NEXT week's list
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const plans = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
    const nextWeekPlan = plans.find((p: MealPlan) => p.startDate === nextMondayStr);
    if (nextWeekPlan) return nextWeekPlan.id;
    const current = plans.find((p: MealPlan) => p.startDate === currentMondayStr);
    if (current) return current.id;
    return plans[0]?.id || null;
  });

  // Keep selectedPlanId valid and default to next week when available
  useEffect(() => {
    if (allPlans.length > 0) {
      const exists = allPlans.some(p => p.id === selectedPlanId);
      if (!exists) {
        const nextWeekPlan = allPlans.find(p => p.startDate === nextMondayStr);
        if (nextWeekPlan) {
          setSelectedPlanId(nextWeekPlan.id);
        } else {
          setSelectedPlanId(allPlans[0].id);
        }
      }
    } else if (selectedPlanId !== null) {
      setSelectedPlanId(null);
    }
  }, [allPlans, selectedPlanId, nextMondayStr]);

  // Sync active plan selection with global store
  useEffect(() => {
    if (selectedPlanId) {
      store.setSelectedPlanId?.(selectedPlanId);
    }
  }, [selectedPlanId]);

  // Active MealPlan object
  const activePlan = useMemo(() => {
    if (selectedPlanId) {
      const match = allPlans.find(p => p.id === selectedPlanId);
      if (match) return match;
    }
    const nextWeekPlan = allPlans.find(p => p.startDate === nextMondayStr);
    if (nextWeekPlan) return nextWeekPlan;
    return allPlans[0] || null;
  }, [allPlans, selectedPlanId, nextMondayStr]);

  // Threshold Warning Modal state
  const [thresholdWarning, setThresholdWarning] = useState<ThresholdWarningState | null>(null);

  // Precompute planned requirements mapped by item name (independent of shoppingList changes)
  const plannedRequirementsByName = useMemo(() => {
    const map = new Map<string, PlannedRequirement>();
    if (!activePlan || !activePlan.days || activePlan.status !== 'finalized') return map;

    const recipes = store.state.recipes || [];
    const targetItems = generateShoppingListForPlan(activePlan, recipes);
    const catalog = getCatalog();
    const lineKeyFor = (name: string, unit?: string, amount?: number, groceryId?: string) => {
      const product = matchProduct(catalog, name, { unit, amount, groceryId });
      return product ? `p:${product.id}` : `n:${groupingKey(name)}`;
    };

    targetItems.forEach(target => {
      const recipeSet = new Set<string>();
      const nightSet = new Set<string>();
      const breakdown: MealRequirementDetail[] = [];
      const normItemName = target.name.toLowerCase().trim();
      const targetKey = target.groceryId ? `p:${target.groceryId}` : lineKeyFor(target.name);

      Object.entries(activePlan.days).forEach(([dayKey, dayPlan]) => {
        const dp = dayPlan as DayPlan;
        if (!dp || !dp.meals) return;

        let dayName = dayKey;
        if (DAYS_OF_WEEK.includes(dayKey)) {
          dayName = dayKey;
        } else if (dp.date) {
          const d = new Date(dp.date + 'T00:00:00');
          if (!isNaN(d.getTime())) {
            dayName = DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1] || dayKey;
          }
        }

        dp.meals.forEach(meal => {
          if ((meal.type === 'recipe' || meal.type === 'leftover') && meal.recipeId) {
            const recipe = recipes.find((r: Recipe) => r.id === meal.recipeId);
            if (!recipe || !recipe.ingredients) return;

            const mealServings = meal.servings ?? 2;
            const baseServings = recipe.servings ?? 2;
            const scale = mealServings / (baseServings || 2);

            recipe.ingredients.forEach(ing => {
              if (!ing || !ing.name) return;
              if (lineKeyFor(ing.name, ing.unit, ing.amount, ing.groceryId) === targetKey) {
                const scaled = Math.round(ing.amount * scale * 100) / 100;
                recipeSet.add(recipe.name);
                nightSet.add(dayName);
                breakdown.push({
                  recipeName: recipe.name,
                  night: dayName,
                  servings: mealServings,
                  amount: scaled,
                  unit: ing.unit
                });
              }
            });
          }
        });
      });

      const sortedNights = Array.from(nightSet).sort(
        (a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b)
      );

      map.set(normItemName, {
        requiredAmount: target.amount,
        recipes: Array.from(recipeSet),
        nights: sortedNights,
        breakdown
      });
    });

    return map;
  }, [activePlan, store.state.recipes]);

  // Map of item ID to PlannedRequirement for active plan items (now just lookups)
  const plannedRequirementsMap = useMemo(() => {
    const map = new Map<string, PlannedRequirement>();
    (store.state.shoppingList || []).forEach((item: ShoppingListItem) => {
      if (!item.isAdhoc && !item.isBatch && !item.isRecurring) {
        const req = plannedRequirementsByName.get(item.name.toLowerCase().trim());
        if (req) {
          map.set(item.id, req);
        }
      }
    });
    return map;
  }, [store.state.shoppingList, plannedRequirementsByName]);

  // Helper to calculate required amount, recipes, and nights for a planned meal ingredient
  const getPlannedRequirement = (item: ShoppingListItem): PlannedRequirement | null => {
    if (!activePlan || !activePlan.days || activePlan.status !== 'finalized' || item.isAdhoc || item.isBatch || item.isRecurring) {
      return null;
    }
    return plannedRequirementsByName.get(item.name.toLowerCase().trim()) || null;
  };

  // Generated items (recipe ingredients / staples) that either of you removed, so they don't
  // auto-regenerate. Shared between phones via sync; removing an item adds it here automatically.
  const dismissedItemIds: string[] = store.dismissedShoppingItemIds || [];
  const activeWeekDismissedCount = activePlan
    ? dismissedItemIds.filter(id => id.includes(activePlan.id)).length
    : 0;

  // Ensure recurring staples are populated and in sync for active week and future weeks
  useEffect(() => {
    if (!activePlan) return;
    const recurringPrefs = store.state.preferences?.recurringItems || [];
    if (recurringPrefs.length === 0) return;

    const currentList: ShoppingListItem[] = store.state.shoppingList || [];
    const syncedList = syncRecurringStaplesForPlan(activePlan, currentList, recurringPrefs, dismissedItemIds);

    const hasDiff =
      syncedList.length !== currentList.length ||
      syncedList.some((item, idx) => {
        const cur = currentList[idx];
        return !cur || cur.id !== item.id || cur.amount !== item.amount || cur.unit !== item.unit;
      });

    if (hasDiff) {
      store.updateShoppingList(syncedList);
    }
  }, [activePlan?.id, store.state.preferences?.recurringItems, dismissedItemIds]);

  const handlePlanFollowingWeek = (fromStartDate?: string) => {
    const baseDateStr = fromStartDate || activePlan?.startDate || allPlans[allPlans.length - 1]?.startDate;
    if (!canPlanFollowingWeek(baseDateStr)) {
      setToastMessage('Maximum 4 weeks forward limit reached.');
      return;
    }
    const base = new Date(baseDateStr + 'T00:00:00');
    const nextMon = new Date(base);
    nextMon.setDate(base.getDate() + 7);
    const nextStartStr = formatDateISO(nextMon);

    const existing = (store.state.mealPlans || []).find((p: MealPlan) => p.startDate === nextStartStr);
    if (existing) {
      setSelectedPlanId(existing.id);
      setShowWeekDropdown(false);
      return;
    }

    const nextPlan = createEmptyPlan(nextMon);
    store.updateMealPlan(nextPlan);
    const recurringPrefs = store.state.preferences?.recurringItems || [];
    if (recurringPrefs.length > 0) {
      const currentList: ShoppingListItem[] = store.state.shoppingList || [];
      const synced = syncRecurringStaplesForPlan(nextPlan, currentList, recurringPrefs, dismissedItemIds);
      store.updateShoppingList(synced);
    }
    setSelectedPlanId(nextPlan.id);
    setShowWeekDropdown(false);
    setToastMessage(`Created week of ${formatWeekRange(nextPlan.startDate)}`);
  };

  const handleToggleItem = (idOrIds: string | string[], forceState?: boolean) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const newList = (store.state.shoppingList || []).map((item: ShoppingListItem) => {
      if (ids.includes(item.id)) {
        return { ...item, checked: forceState !== undefined ? forceState : !item.checked };
      }
      return item;
    });
    store.updateShoppingList(newList);
  };

  const executeRemoveItem = (item: ShoppingListItem) => {
    const newList = (store.state.shoppingList || []).filter((i: ShoppingListItem) => i.id !== item.id);
    store.updateShoppingList(newList);
  };

  const handleRemoveItem = (item: ShoppingListItem) => {
    const requirement = getPlannedRequirement(item);
    if (requirement && requirement.requiredAmount > 0) {
      setThresholdWarning({
        item,
        targetAmount: 0,
        isRemoval: true,
        requirement
      });
      return;
    }
    executeRemoveItem(item);
  };

  const handleKeepRequired = (item: ShoppingListItem, requiredAmount: number) => {
    const newList = (store.state.shoppingList || []).map((i: ShoppingListItem) => {
      if (i.id === item.id) {
        return {
          ...i,
          amount: requiredAmount,
          userAdjusted: false
        };
      }
      return i;
    });
    store.updateShoppingList(newList);
    const COUNT_UNITS = ['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''];
    const isCount = !item.unit || COUNT_UNITS.includes(item.unit.toLowerCase().trim());
    const unitText = !isCount && item.unit ? ` ${item.unit}` : '';
    setToastMessage(`Kept required ${requiredAmount}${unitText} for planned meals`);
  };

  const handleConfirmReduce = (item: ShoppingListItem, targetAmount: number, isRemoval?: boolean) => {
    if (isRemoval || targetAmount <= 0) {
      executeRemoveItem(item);
      setToastMessage(`Removed ${item.name} from shopping list`);
      return;
    }

    const newList = (store.state.shoppingList || []).map((i: ShoppingListItem) => {
      if (i.id === item.id) {
        return {
          ...i,
          amount: targetAmount,
          userAdjusted: true
        };
      }
      return i;
    });
    store.updateShoppingList(newList);
    setToastMessage(`Updated ${item.name} to ${targetAmount} ${item.unit}`);
  };

  const handleRestoreDismissed = () => {
    if (!activePlan) return;

    // Bring back removed staples for this week (passing no dismissed IDs re-adds them all).
    let baseList: ShoppingListItem[] = [...(store.state.shoppingList || [])];
    const recurringPrefs = store.state.preferences?.recurringItems || [];
    if (recurringPrefs.length > 0) {
      baseList = syncRecurringStaplesForPlan(activePlan, baseList, recurringPrefs, []);
    }

    if (activePlan.status !== 'finalized') {
      store.updateShoppingList(baseList);
      setToastMessage('Restored recipe ingredients');
      return;
    }

    const targetItems = generateShoppingListForPlan(activePlan, store.state.recipes);
    const currentShoppingList = baseList;
    const existingItemsForPlan = currentShoppingList.filter(i => i.planId === activePlan.id);
    const adhocOrBatchItems = existingItemsForPlan.filter(i => i.isAdhoc || i.isBatch);
    const existingMealItems = existingItemsForPlan.filter(i => !i.isAdhoc && !i.isBatch && !i.isRecurring);
    const existingRecurring = existingItemsForPlan.filter(i => i.isRecurring);

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
        // We do NOT check dismissedItemIds here because we just cleared it!
        syncedMealItems.push(target);
      }
    });

    const otherWeeksItems = currentShoppingList.filter(i => i.planId !== activePlan.id);
    store.updateShoppingList([...otherWeeksItems, ...adhocOrBatchItems, ...existingRecurring, ...syncedMealItems]);

    setToastMessage('Restored recipe ingredients');
  };

  const handleAddItems = (items: { name: string; amount: number; category?: string }[]) => {
    if (!activePlan) return;
    const weekLabel = `Week of ${formatWeekRange(activePlan.startDate)}`;
    let currentList = [...(store.state.shoppingList || [])];

    let addedCount = 0;
    items.forEach(newItem => {
      const existingIndex = currentList.findIndex(item => 
        !item.checked && item.planId === activePlan.id && item.name.toLowerCase() === newItem.name.toLowerCase()
      );

      const converted = quantityForAddedItem(newItem.name, newItem.amount);
      if (existingIndex > -1) {
        const existing = currentList[existingIndex];
        // Same unit: add whole packs. Different unit (older items): leave the amount and let the user adjust.
        const sameUnit = canonicalUnit(existing.unit) === canonicalUnit(converted.unit);
        const newAmount = sameUnit ? Math.round((existing.amount + converted.amount) * 100) / 100 : existing.amount;
        currentList[existingIndex] = {
          ...existing,
          amount: newAmount,
          unit: sameUnit ? formatUnit(canonicalUnit(converted.unit), newAmount) : existing.unit
        };
      } else {
        currentList.push({
          id: crypto.randomUUID(),
          name: newItem.name,
          amount: converted.amount,
          unit: converted.unit || (converted.amount === 1 ? 'item' : 'items'),
          category: newItem.category || converted.category || '',
          groceryId: converted.groceryId,
          checked: false,
          isAdhoc: true,
          isBatch: false,
          planId: activePlan.id,
          weekLabel
        });
      }
      addedCount += newItem.amount;
    });

    store.updateShoppingList(currentList);
    setOpenSections(prev => ({ ...prev, adhoc: true }));
    if (items.length > 0) {
      setToastMessage(`Added ${items.length} ${items.length === 1 ? 'item' : 'items'} (${addedCount} total quantity)`);
    }
  };

  const handleTriageComplete = (mappings?: any[]) => {
    if (pendingQuickAdd) {
      const mapping = mappings?.find(m => m.originalName === pendingQuickAdd.name);
      const nameToUse = mapping ? mapping.mappedGroceryName : pendingQuickAdd.name;
      handleAddItems([{ name: nameToUse, amount: 1, category: pendingQuickAdd.category }]);
      setPendingQuickAdd(null);
    }
    setUnmappedItems([]);
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    const item = (store.state.shoppingList || []).find((i: ShoppingListItem) => i.id === id);
    if (!item) return;

    const step = getIngredientStep(item);
    const actualDelta = delta < 0 ? -step : step;

    if (actualDelta < 0) {
      const currentAmount = item.amount || 1;
      const targetAmount = Math.max(0, currentAmount + actualDelta);
      const requirement = getPlannedRequirement(item);

      if (requirement && targetAmount < requirement.requiredAmount) {
        setThresholdWarning({
          item,
          targetAmount,
          isRemoval: targetAmount <= 0,
          requirement
        });
        return;
      }
    }

    const newList = (store.state.shoppingList || []).map((i: ShoppingListItem) => {
      if (i.id === id) {
        const currentAmount = i.amount || 1;
        const newAmount = Math.max(step, currentAmount + actualDelta);
        // Keep the same unit, just singular/plural to match the new amount ("1 can" / "2 cans").
        const rawUnit = (i.unit || '').toLowerCase().trim();
        const nextUnit = /^items?$/.test(rawUnit)
          ? (newAmount === 1 ? 'item' : 'items')
          : formatUnit(canonicalUnit(i.unit), newAmount);
        return {
          ...i,
          amount: newAmount,
          unit: nextUnit,
          userAdjusted: true
        };
      }
      return i;
    });
    store.updateShoppingList(newList);
  };

  const handleUpdateQtyAndUnit = (id: string, amount: number, unit: string) => {
    const newList = (store.state.shoppingList || []).map((i: ShoppingListItem) => {
      if (i.id === id) {
        return {
          ...i,
          amount: Math.max(0.01, amount),
          unit: unit,
          userAdjusted: true
        };
      }
      return i;
    });
    store.updateShoppingList(newList);
  };

  const handleAddBatchMealIngredients = (
    mealName: string,
    ingredients: { name: string; amount: number; unit: string; category?: string }[],
    options?: {
      recipeId?: string;
      portions?: number;
      alsoAddToFreezer?: boolean;
    }
  ) => {
    let targetPlan = activePlan;
    if (!targetPlan) {
      const currentPlans = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
      targetPlan = currentPlans.find((p: MealPlan) => p.startDate === nextMondayStr) || currentPlans[0];
      if (!targetPlan) {
        targetPlan = createEmptyPlan(nextMonday);
        store.updateMealPlan(targetPlan);
        setSelectedPlanId(targetPlan.id);
      }
    }

    const weekLabel = `Week of ${formatWeekRange(targetPlan.startDate)} (Batch)`;
    const currentList = [...(store.state.shoppingList || [])];

    let addedCount = 0;
    ingredients.forEach(ing => {
      const converted = convertToShoppingQuantity(ing.name, ing.amount, ing.unit, ing.category);

      const existingIdx = currentList.findIndex(item => 
        item.planId === targetPlan.id &&
        item.isBatch &&
        item.batchRecipeName?.toLowerCase() === mealName.toLowerCase() &&
        item.name.toLowerCase().trim() === ing.name.toLowerCase().trim() &&
        !item.checked &&
        item.unit === converted.unit
      );

      if (existingIdx > -1) {
        currentList[existingIdx] = {
          ...currentList[existingIdx],
          amount: Math.round((currentList[existingIdx].amount + converted.amount) * 10) / 10
        };
      } else {
        currentList.push({
          id: crypto.randomUUID(),
          name: ing.name,
          amount: converted.amount,
          unit: converted.unit || ing.unit || 'item',
          category: converted.category || ing.category || '',
          groceryId: converted.groceryId,
          checkCupboard: converted.checkCupboard,
          needsCheck: converted.needsCheck,
          quantityNote: converted.quantityNote,
          checked: false,
          isAdhoc: false,
          isBatch: true,
          batchRecipeName: mealName,
          planId: targetPlan.id,
          weekLabel
        });
      }
      addedCount++;
    });

    if (options?.alsoAddToFreezer && store.addBatch) {
      store.addBatch({
        id: crypto.randomUUID(),
        name: mealName,
        recipeId: options?.recipeId || '',
        portions: options?.portions || 4,
        dateAdded: new Date().toISOString()
      });
    }

    store.updateShoppingList(currentList);
    setOpenSections(prev => ({ ...prev, batch: true }));
    setShowBatchModal(false);
    setToastMessage(`Added ${addedCount} batch ingredients for "${mealName}"`);
  };

  // Current active week's shopping items
  const currentWeekItems = useMemo(() => {
    if (!activePlan) return [];
    return (store.state.shoppingList || []).filter(
      (i: ShoppingListItem) => i.planId === activePlan.id
    );
  }, [activePlan, store.state.shoppingList]);

  // Section divisions for the active week
  const isPlanFinalized = activePlan?.status === 'finalized';

  // Filter helper applied to items for status & source
  const filterItem = (item: ShoppingListItem): boolean => {
    if (statusFilter === 'to_buy' && item.checked) return false;
    if (statusFilter === 'bought' && !item.checked) return false;
    if (sourceFilter === 'planned' && (item.isAdhoc || item.isBatch || item.isRecurring)) return false;
    if (sourceFilter === 'batch' && !item.isBatch) return false;
    if (sourceFilter === 'adhoc' && !item.isAdhoc && !item.isRecurring) return false;
    return true;
  };

  const plannedItems = useMemo(() => {
    if (!isPlanFinalized) return [];
    if (sourceFilter === 'batch' || sourceFilter === 'adhoc') return [];
    return currentWeekItems
      .filter(i => !i.isAdhoc && !i.isBatch && !i.isRecurring)
      .filter(filterItem);
  }, [currentWeekItems, isPlanFinalized, statusFilter, sourceFilter]);

  const batchItems = useMemo(() => {
    if (sourceFilter === 'planned' || sourceFilter === 'adhoc') return [];
    return currentWeekItems
      .filter(i => i.isBatch)
      .filter(filterItem);
  }, [currentWeekItems, statusFilter, sourceFilter]);

  const adhocItems = useMemo(() => {
    if (sourceFilter === 'planned' || sourceFilter === 'batch') return [];
    return currentWeekItems
      .filter(i => i.isAdhoc && !i.isRecurring)
      .filter(filterItem);
  }, [currentWeekItems, statusFilter, sourceFilter]);

  const recurringItems = useMemo(() => {
    if (sourceFilter === 'planned' || sourceFilter === 'batch') return [];
    return currentWeekItems
      .filter(i => i.isRecurring)
      .filter(filterItem);
  }, [currentWeekItems, statusFilter, sourceFilter]);

  // All items with active filters applied
  const allViewItems = useMemo(() => {
    return currentWeekItems.filter(filterItem);
  }, [currentWeekItems, statusFilter, sourceFilter]);

  // Sorting helper for shopping list items
  const sortItems = (items: ShoppingListItem[]): ShoppingListItem[] => {
    return [...items].sort((a, b) => {
      if (sortBy === 'status') {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
      }
      if (sortBy === 'food_type') {
        const orderA = GROCERY_AISLES[getGroceryAisle(a)].order;
        const orderB = GROCERY_AISLES[getGroceryAisle(b)].order;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'alpha') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  };

  const arrangeListItems = (items: ShoppingListItem[]): ShoppingListItem[] => {
    const sorted = sortItems(items);
    if (dropCompletedToBottom) {
      return [
        ...sorted.filter(i => !i.checked),
        ...sorted.filter(i => i.checked)
      ];
    }
    return sorted;
  };

  // Group items by grocery aisle / food type
  const itemsByAisle = useMemo(() => {
    const groups: { aisle: FoodAisle; info: typeof GROCERY_AISLES[FoodAisle]; items: ShoppingListItem[] }[] = [];
    const sortedAisleKeys = (Object.keys(GROCERY_AISLES) as FoodAisle[]).sort(
      (a, b) => GROCERY_AISLES[a].order - GROCERY_AISLES[b].order
    );

    const filtered = currentWeekItems.filter(filterItem);

    sortedAisleKeys.forEach(aisleKey => {
      const matchingItems = filtered.filter(item => getGroceryAisle(item) === aisleKey);
      if (matchingItems.length > 0) {
        groups.push({
          aisle: aisleKey,
          info: GROCERY_AISLES[aisleKey],
          items: sortItems(matchingItems)
        });
      }
    });

    return groups;
  }, [currentWeekItems, sortBy, statusFilter, sourceFilter]);

  const totalCount = currentWeekItems.length;
  const pendingCount = currentWeekItems.filter(i => !i.checked).length;
  const checkedCount = totalCount - pendingCount;

  if (isShoppingMode) {
    return (
      <ShoppingModeView
        items={currentWeekItems}
        activePlan={activePlan}
        onToggle={handleToggleItem}
        onExit={() => setIsShoppingMode(false)}
        onUncheckAll={() => {
          const checkedIds = currentWeekItems.filter(item => item.checked).map(item => item.id);
          if (checkedIds.length > 0) {
            handleToggleItem(checkedIds, false);
          }
        }}
        dropCompletedToBottom={dropCompletedToBottom}
        onToggleDropCompleted={handleToggleDropCompleted}
        onEditStaples={() => setShowEditStaplesModal(true)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-xs font-medium px-3.5 py-2 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header matching Planner and Cookbook tab styling */}
      <header className="bg-white border-b border-zinc-200/80 px-4 sm:px-5 py-2 shrink-0 relative z-40">
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <span className="text-sm font-bold text-zinc-900 whitespace-nowrap hidden sm:inline-block">
              Shopping List
            </span>

            <div className="flex items-center gap-2 relative z-30">
              <div className="relative">
                <button
                  type="button"
                  id="btn-week-selector"
                  onClick={() => {
                    setShowWeekDropdown(!showWeekDropdown);
                    setShowViewOptions(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 transition-colors shadow-2xs cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs font-semibold text-zinc-900">
                    {activePlan?.startDate === nextMondayStr 
                      ? `Next Week (${formatWeekStart(activePlan?.startDate)})` 
                      : activePlan?.startDate === currentMondayStr 
                      ? `This Week (${formatWeekStart(activePlan?.startDate)})` 
                      : formatWeekStart(activePlan?.startDate)}
                  </span>

                  {/* Status Indicator */}
                  {activePlan?.status === 'finalized' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                  )}
                  
                  <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showWeekDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Week Selector Dropdown */}
                {showWeekDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setShowWeekDropdown(false)} 
                    />
                    <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-zinc-200 p-2 z-40 animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Switch Shopping Week
                      </div>
                      
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {allPlans.map((plan: MealPlan) => {
                          const isSelected = plan.id === activePlan?.id;
                          const isNextWeek = plan.startDate === nextMondayStr;
                          const isThisWeek = plan.startDate === currentMondayStr;
                          const itemCount = (store.state.shoppingList || []).filter((i: ShoppingListItem) => i.planId === plan.id).length;

                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() => {
                                setSelectedPlanId(plan.id);
                                setShowWeekDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-zinc-100 text-zinc-900 font-semibold' 
                                  : 'hover:bg-zinc-50 text-zinc-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-zinc-900">{plan.startDate === currentMondayStr ? 'This Week' : plan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(plan.startDate)}</span>
                                  {isNextWeek && (
                                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                      Next Week
                                    </span>
                                  )}
                                  {isThisWeek && (
                                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                                      This Week
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-zinc-400">
                                  {itemCount} {itemCount === 1 ? 'item' : 'items'} on list
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

                      <div className="pt-2 mt-1 border-t border-zinc-100">
                        {canPlanFollowingWeek(activePlan?.startDate) ? (
                          <button
                            type="button"
                            onClick={() => handlePlanFollowingWeek()}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Plan Following Week</span>
                          </button>
                        ) : (
                          <div className="px-3 py-2 text-[11px] text-zinc-400 italic text-center">
                            4-week forward limit reached
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {canPlanFollowingWeek(activePlan?.startDate) && (
                <button
                  type="button"
                  onClick={() => handlePlanFollowingWeek()}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 px-2.5 py-1.5 rounded-xl border border-zinc-200 transition-colors cursor-pointer shadow-2xs hidden md:flex"
                  title="Plan following week"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Next Week</span>
                </button>
              )}
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2 relative z-50 shrink-0">
            {/* View Options Dropdown */}
            <div className="relative">
              <button
                type="button"
                id="btn-shop-view-options"
                onClick={() => {
                  setShowViewOptions(!showViewOptions);
                  setShowWeekDropdown(false);
                }}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                  showViewOptions || viewMode !== 'sections'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                }`}
                title="View options"
                aria-label="View options"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {showViewOptions && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowViewOptions(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl border border-zinc-200/90 shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-1 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        View Layout
                      </span>
                      <div className="space-y-1">
                        <button
                          type="button"
                          id="view-option-sections"
                          onClick={() => {
                            setViewMode('sections');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            viewMode === 'sections'
                              ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" />
                            <span>Sections</span>
                          </div>
                          {viewMode === 'sections' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>

                        <button
                          type="button"
                          id="view-option-foodtype"
                          onClick={() => {
                            setViewMode('food_type');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            viewMode === 'food_type'
                              ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Store className="w-3.5 h-3.5" />
                            <span>Food Type / Aisle</span>
                          </div>
                          {viewMode === 'food_type' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>

                        <button
                          type="button"
                          id="view-option-all"
                          onClick={() => {
                            setViewMode('all');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            viewMode === 'all'
                              ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>All Items</span>
                          </div>
                          {viewMode === 'all' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 my-2 pt-2 px-1">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5 font-bold">
                        List Options
                      </span>
                      <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer text-xs font-semibold text-zinc-700 select-none">
                        <input
                          type="checkbox"
                          checked={dropCompletedToBottom}
                          onChange={(e) => handleToggleDropCompleted(e.target.checked)}
                          className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Drop completed to bottom</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Add Item Button */}
            <button
              type="button"
              id="btn-header-add-item"
              onClick={() => setShowCatalogModal(true)}
              className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-850 border border-indigo-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
              title="Add Custom Grocery Item"
              aria-label="Add Custom Grocery Item"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Add Item</span>
            </button>

            {/* Add Batch Button */}
            <button
              type="button"
              id="btn-header-add-batch"
              onClick={() => setShowBatchModal(true)}
              className="flex items-center justify-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 active:bg-cyan-200 text-cyan-800 border border-cyan-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
              title="Add Batch Meal Ingredients"
              aria-label="Add Batch Meal Ingredients"
            >
              <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
              <span className="hidden sm:inline">Add Batch</span>
            </button>

            {/* Go Shopping Button - On mobile: trolley icon only; on sm+: icon + text */}
            <button
              type="button"
              id="btn-go-shopping"
              onClick={() => setIsShoppingMode(true)}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
              title="Go Shopping"
              aria-label="Go Shopping"
            >
              <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Go Shopping</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Concise Spacing */}
      <div className="flex-1 overflow-y-auto p-3.5 md:p-5 pb-36 max-w-[1400px] mx-auto w-full space-y-3">
        
        {/* Unfinalized Plan Banner */}
        {!isPlanFinalized && (
          <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-xs text-amber-900 shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-medium text-xs">
                {activePlan && Object.values(activePlan.days).some((day: any) => day.meals && day.meals.length > 0)
                  ? 'Your meal plan has not been finalized yet'
                  : 'Meals have not been planned for this week'}
              </span>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('planning', activePlan?.id)}
                className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 shrink-0 underline cursor-pointer"
              >
                View Plan →
              </button>
            )}
          </div>
        )}



        {/* Empty State */}
        {currentWeekItems.length === 0 ? (
          <div className="text-center text-zinc-500 mt-6 p-7 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-2 text-zinc-500">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-zinc-800 text-xs mb-1">
              No items for {activePlan ? formatWeekRange(activePlan.startDate) : 'this week'}
            </h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed mb-4 max-w-sm mx-auto">
              Ingredients from meals planned for this week in the Planning tab will appear here automatically.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('planning', activePlan?.id)}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Plan This Week's Meals</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCatalogModal(true)}
                className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-medium px-3 py-1.5 rounded-xl transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span>Add Custom Item</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="inline-flex items-center gap-1.5 bg-white border border-zinc-200 text-zinc-700 text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-2xs cursor-pointer"
              >
                <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
                <span>Add Batch Meal</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* VIEW MODE 1: SECTIONS WITH COLLAPSIBLE DROPDOWNS */}
            {viewMode === 'sections' && (
              <div className="space-y-3">
                {/* 1. Items Dropdown */}
                <div className="bg-white rounded-xl border border-zinc-200/80 shadow-2xs overflow-hidden transition-all">
                  <div 
                    onClick={() => toggleSection('adhoc')}
                    className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50/50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                        openSections.adhoc ? 'rotate-180' : ''
                      }`} />
                      <h3 className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Items</h3>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ({adhocItems.filter(i => !i.checked).length})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCatalogModal(true);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-650 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>

                  {openSections.adhoc && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-zinc-100">
                      {adhocItems.length === 0 ? (
                        <div className="text-center py-3 text-xs text-zinc-400">
                          <span>No items added. </span>
                          <button
                            type="button"
                            onClick={() => setShowCatalogModal(true)}
                            className="text-zinc-900 underline font-medium cursor-pointer"
                          >
                            + Add grocery item
                          </button>
                        </div>
                      ) : (
                        <>
                          {arrangeListItems(adhocItems).map(item => (
                            <ShoppingItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggleItem}
                              onRemove={handleRemoveItem}
                              onUpdateQuantity={handleUpdateQuantity}
                              onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                              requirement={plannedRequirementsMap.get(item.id)}
                              onResetToRequired={handleKeepRequired}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 1b. Recurring Staples Dropdown */}
                <div className="bg-white rounded-xl border border-zinc-200/80 shadow-2xs overflow-hidden transition-all">
                  <div 
                    onClick={() => toggleSection('recurring')}
                    className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50/50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                        openSections.recurring ? 'rotate-180' : ''
                      }`} />
                      <h3 className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">
                        <span className="hidden sm:inline">Recurring Staples</span>
                        <span className="sm:hidden">Staples</span>
                      </h3>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ({recurringItems.filter(i => !i.checked).length})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEditStaplesModal(true);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-650 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer shrink-0"
                        title="Manage Staples"
                      >
                        <Sliders className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                        <span>Manage</span>
                      </button>
                    </div>
                  </div>

                  {openSections.recurring && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-zinc-100">
                      {recurringItems.length === 0 ? (
                        <div className="text-center py-3 text-xs text-zinc-400">
                          <span>No recurring staples added.</span>
                        </div>
                      ) : (
                        <>
                          {arrangeListItems(recurringItems).map(item => (
                            <ShoppingItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggleItem}
                              onRemove={handleRemoveItem}
                              onUpdateQuantity={handleUpdateQuantity}
                              onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                              onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                              requirement={plannedRequirementsMap.get(item.id)}
                              onResetToRequired={handleKeepRequired}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Meal Ingredients Dropdown */}
                <div className="bg-white rounded-xl border border-zinc-200/80 shadow-2xs overflow-hidden transition-all">
                  <div 
                    onClick={() => toggleSection('planned')}
                    className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50/50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                        openSections.planned ? 'rotate-180' : ''
                      }`} />
                      <h3 className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Meal Ingredients</h3>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ({plannedItems.filter(i => !i.checked).length})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {onNavigateTab && (
                        <button
                          type="button"
                          id="btn-view-plan-section-header"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateTab('planning', activePlan?.id);
                          }}
                          className="inline-flex items-center text-[10px] font-medium text-zinc-650 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                          title="View plan in Planner tab"
                        >
                          <span>View Plan</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {openSections.planned && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-zinc-100">
                      {plannedItems.length === 0 ? (
                        <div className="text-center py-4 px-3 text-xs text-zinc-500 bg-zinc-50/60 rounded-lg border border-dashed border-zinc-200">
                          {!isPlanFinalized ? (
                            <>
                              <p className="font-semibold text-zinc-800 mb-1">
                                Meal Ingredients have not been added as the planned meals have not been finalized.
                              </p>
                              <p className="text-[11px] text-zinc-500 mb-2">
                                Finalize your meal plan in the Planner tab to add ingredients to your shopping list.
                              </p>
                              {onNavigateTab && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateTab('planning', activePlan?.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-900 hover:text-zinc-700 underline cursor-pointer"
                                >
                                  <span>View Plan</span>
                                  <span>→</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <span>No meal plan recipe ingredients yet. </span>
                              {onNavigateTab && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateTab('planning', activePlan?.id)}
                                  className="text-zinc-900 underline font-medium cursor-pointer"
                                >
                                  Plan meals →
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {arrangeListItems(plannedItems).map(item => (
                            <ShoppingItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggleItem}
                              onRemove={handleRemoveItem}
                              onUpdateQuantity={handleUpdateQuantity}
                              onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                              requirement={plannedRequirementsMap.get(item.id)}
                              onResetToRequired={handleKeepRequired}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Batch Meals Dropdown */}
                <div className="bg-white rounded-xl border border-zinc-200/80 shadow-2xs overflow-hidden transition-all">
                  <div 
                    onClick={() => toggleSection('batch')}
                    className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50/50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                        openSections.batch ? 'rotate-180' : ''
                      }`} />
                      <h3 className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Batch Meals</h3>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ({batchItems.filter(i => !i.checked).length})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowBatchModal(true);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-650 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Add Batch</span>
                      </button>
                    </div>
                  </div>

                  {openSections.batch && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-zinc-100">
                      {batchItems.length === 0 ? (
                        <div className="text-center py-3 text-xs text-zinc-400">
                          <span>No batch cooking ingredients added for this week. </span>
                          <button
                            type="button"
                            onClick={() => setShowBatchModal(true)}
                            className="text-zinc-900 underline font-medium cursor-pointer"
                          >
                            + Add batch meal
                          </button>
                        </div>
                      ) : (
                        <>
                          {arrangeListItems(batchItems).map(item => (
                            <ShoppingItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggleItem}
                              onRemove={handleRemoveItem}
                              onUpdateQuantity={handleUpdateQuantity}
                              onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                              requirement={plannedRequirementsMap.get(item.id)}
                              onResetToRequired={handleKeepRequired}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW MODE 2: FOOD TYPE (SHOP AISLES) WITH COLLAPSIBLE DROPDOWNS */}
            {viewMode === 'food_type' && (
              <div className="space-y-3">
                {itemsByAisle.map(group => {
                  const pendingAisleCount = group.items.filter(i => !i.checked).length;
                  const isOpen = openAisles[group.aisle] ?? true;

                  return (
                    <div key={group.aisle} className="bg-white rounded-xl border border-zinc-200/80 shadow-2xs overflow-hidden">
                      <div 
                        onClick={() => toggleAisle(group.aisle)}
                        className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50/50 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180' : ''
                          }`} />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              Aisle {group.info.order}
                            </span>
                            <span className="text-[10px] text-zinc-300">·</span>
                            <h3 className="font-bold text-xs text-zinc-900">{group.info.name}</h3>
                            <span className="text-[10px] text-zinc-400 font-normal hidden sm:inline">— {group.info.description}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-zinc-400">
                            ({pendingAisleCount})
                          </span>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-zinc-100">
                          {arrangeListItems(group.items).map(item => (
                            <ShoppingItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggleItem}
                              onRemove={handleRemoveItem}
                              onUpdateQuantity={handleUpdateQuantity}
                              onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                              requirement={plannedRequirementsMap.get(item.id)}
                              onResetToRequired={handleKeepRequired}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW MODE 3: ALL ITEMS (UNIFIED LIST) */}
            {viewMode === 'all' && (
              <div className="space-y-3">
                {!dropCompletedToBottom ? (
                  <div className="space-y-1.5">
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block px-1">
                      All Items ({allViewItems.length})
                    </span>
                    {arrangeListItems(allViewItems).map(item => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        onToggle={handleToggleItem}
                        onRemove={handleRemoveItem}
                        onUpdateQuantity={handleUpdateQuantity}
                        onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                        requirement={plannedRequirementsMap.get(item.id)}
                        onResetToRequired={handleKeepRequired}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {allViewItems.filter(i => !i.checked).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block px-1">
                          To Buy ({allViewItems.filter(i => !i.checked).length})
                        </span>
                        {sortItems(allViewItems.filter(i => !i.checked)).map(item => (
                          <ShoppingItemRow
                            key={item.id}
                            item={item}
                            onToggle={handleToggleItem}
                            onRemove={handleRemoveItem}
                            onUpdateQuantity={handleUpdateQuantity}
                            onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                            requirement={plannedRequirementsMap.get(item.id)}
                            onResetToRequired={handleKeepRequired}
                          />
                        ))}
                      </div>
                    )}

                    {allViewItems.filter(i => i.checked).length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block px-1">
                          Checked Off ({allViewItems.filter(i => i.checked).length})
                        </span>
                        {sortItems(allViewItems.filter(i => i.checked)).map(item => (
                          <ShoppingItemRow
                            key={item.id}
                            item={item}
                            onToggle={handleToggleItem}
                            onRemove={handleRemoveItem}
                            onUpdateQuantity={handleUpdateQuantity}
                            onUpdateQtyAndUnit={handleUpdateQtyAndUnit}
                            onEdit={setEditingItem}
                              isFavourite={favourites.some(f => f.name.toLowerCase() === item.name.toLowerCase())}
                              onToggleFavourite={toggleFavourite}
                            requirement={plannedRequirementsMap.get(item.id)}
                            onResetToRequired={handleKeepRequired}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {allViewItems.length === 0 && currentWeekItems.length > 0 && (
                  <div className="text-center py-6 px-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
                    <p className="text-xs font-semibold text-zinc-700 mb-1">No items match your active filters</p>
                    <p className="text-[11px] text-zinc-400 mb-3">Try clearing your filters to see all items.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setSourceFilter('all');
                      }}
                      className="text-xs font-semibold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Restore Dismissed Items Link */}
            {activeWeekDismissedCount > 0 && (
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={handleRestoreDismissed}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 inline-flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore removed recipe ingredients</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL: Threshold Warning Modal */}
      {thresholdWarning && (
        <BelowThresholdWarningModal
          data={thresholdWarning}
          onClose={() => setThresholdWarning(null)}
          onKeepRequired={() => {
            const warning = thresholdWarning;
            setThresholdWarning(null);
            handleKeepRequired(warning.item, warning.requirement.requiredAmount);
          }}
          onConfirmReduce={(chosenAmount) => {
            const warning = thresholdWarning;
            setThresholdWarning(null);
            handleConfirmReduce(warning.item, chosenAmount, chosenAmount <= 0);
          }}
        />
      )}

      {/* MODAL: Catalog Drawer */}
      <CatalogDrawer
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        onAddItems={handleAddItems}
        store={store}
        onToggleFavourite={toggleFavourite}
      />

      {showEditStaplesModal && (
        <EditRecurringStaplesModal
          store={store}
          onClose={() => setShowEditStaplesModal(false)}
        />
      )}

      {/* MODAL: Batch Cooking Meal Selector */}
      {showBatchModal && (
        <BatchMealModal
          store={store}
          onClose={() => setShowBatchModal(false)}
          onAdd={handleAddBatchMealIngredients}
          weekLabel={activePlan ? formatWeekRange(activePlan.startDate) : ''}
        />
      )}

      {editingItem && (
        <EditItemDrawer
          isOpen={true}
          onClose={() => setEditingItem(null)}
          item={editingItem}
          hydratedItem={
            (() => {
              const matchedMatch = findGroceryDatabaseMatch(editingItem.name, store.state.groceryDatabase || []);
              if (matchedMatch?.id) {
                return store.getHydratedGroceryItem?.(matchedMatch.id);
              }
              return undefined;
            })()
          }
          onSave={(id, updates) => {
            let targetId = id;
            if (!targetId || targetId === editingItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
              const matchedMatch = findGroceryDatabaseMatch(editingItem.name, store.state.groceryDatabase || []);
              targetId = matchedMatch?.id || editingItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            }
            store.updateGroceryOverride(targetId, updates);
            
            // Directly override the unit and category of the active list item instantly
            const currentList = store.state.shoppingList || [];
            const updatedList = currentList.map((i: any) => {
              if (i.id === editingItem.id) {
                return {
                  ...i,
                  unit: updates.unit !== undefined ? updates.unit : i.unit,
                  category: updates.category !== undefined ? updates.category : i.category
                };
              }
              return i;
            });
            store.updateShoppingList(updatedList);

            setToastMessage(`Overrode unit and saved database defaults for ${editingItem.name}`);
          }}
        />
      )}

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

function BelowThresholdWarningModal({ data, onClose, onKeepRequired, onConfirmReduce }: { data: any, onClose: () => void, onKeepRequired: () => void, onConfirmReduce: (amount: number) => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg mb-4 text-amber-600">Below Required Amount</h3>
        <p className="text-zinc-700 text-sm mb-4">You are reducing this item below what is required for your planned meals.</p>
        <div className="flex flex-col gap-3 mt-6">
          <button onClick={onKeepRequired} className="w-full px-4 py-3 font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg">Keep Required Amount</button>
          <button onClick={() => onConfirmReduce(data.targetAmount)} className="w-full px-4 py-3 font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg">Confirm Reduction</button>
          <button onClick={onClose} className="w-full px-4 py-3 font-medium text-zinc-500 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ShoppingItemRow({ 
  item, 
  onToggle, 
  onRemove,
  onUpdateQuantity,
  onUpdateQtyAndUnit,
  onEdit,
  requirement,
  onResetToRequired,
  isFavourite,
  onToggleFavourite,
  requiredFor
}: { 
  key?: React.Key;
  item: ShoppingListItem; 
  onToggle: (id: string) => void; 
  onRemove: (item: ShoppingListItem) => void; 
  onUpdateQuantity?: (id: string, delta: number) => void;
  onUpdateQtyAndUnit?: (id: string, amount: number, unit: string) => void;
  onEdit?: (item: ShoppingListItem) => void;
  requirement?: PlannedRequirement | null;
  onResetToRequired?: (item: ShoppingListItem, requiredAmount: number) => void;
  isFavourite?: boolean;
  onToggleFavourite?: (name: string, category: string) => void;
  requiredFor?: string[];
}) {
  const aisle = getGroceryAisle(item);
  const aisleInfo = GROCERY_AISLES[aisle];
  const isBelowRequirement = requirement && !item.isAdhoc && !item.isBatch && !item.isRecurring && item.amount < requirement.requiredAmount;

  const { checked, isPending, toggle, undo } = useGracefulCheckoff(item.checked, () => onToggle(item.id), 2500);

  const [localVal, setLocalVal] = React.useState<string>('');

  React.useEffect(() => {
    const displayUnit = item.unit && !['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(item.unit.toLowerCase().trim()) ? ` ${item.unit}` : '';
    setLocalVal(`${item.amount}${displayUnit}`);
  }, [item.amount, item.unit]);

  const handleBlurOrSubmit = () => {
    if (onUpdateQtyAndUnit) {
      const { amount, unit } = parseQtyAndUnit(localVal, item.unit || 'item');
      onUpdateQtyAndUnit(item.id, amount, unit);
    }
  };

  return (
    <div className={`relative flex flex-row items-center justify-between pl-3.5 pr-8 py-1.5 rounded-xl border transition-all gap-3 ${
      checked 
        ? 'bg-zinc-50/70 border-zinc-200/60 opacity-40' 
        : isBelowRequirement
          ? 'bg-amber-50/30 border-amber-300/80 shadow-2xs hover:border-amber-400'
          : 'bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300'
    }`}>
      {/* Absolute Bin/Delete button on the top right */}
      <div className="absolute top-1 right-1 z-20">
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(item); }} 
          className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
          title="Delete item"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Left section: Item name, unboxed metadata trail - Clickable to open Edit */}
      <div 
        onClick={() => onEdit?.(item)}
        className="flex-1 min-w-0 cursor-pointer hover:bg-zinc-50/40 p-1 rounded-lg transition-all"
        title="Click to edit item"
      >
        <div className="flex flex-col">
          {/* Title and Favourite */}
          <div className="flex items-center gap-1.5 justify-between pr-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
              <p className={`font-semibold text-xs text-zinc-900 leading-tight break-words ${checked ? 'line-through text-zinc-400 font-medium' : ''}`}>
                {item.name}
              </p>

              {item.isBatch && (
                <span className="text-cyan-500 shrink-0" title="Batch">
                  <Snowflake className="w-3 h-3" />
                </span>
              )}

              {item.isRecurring && (
                <span className="text-emerald-500 shrink-0" title="Recurring">
                  <RotateCcw className="w-3 h-3" />
                </span>
              )}

              {item.isAdhoc && (
                <span className="text-amber-500 shrink-0" title="Added Item">
                  <UserPlus className="w-3 h-3" />
                </span>
              )}

              {item.checkCupboard && !checked && (
                <span
                  className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 shrink-0"
                  title="Store-cupboard item: check you have it before buying"
                >
                  check cupboard
                </span>
              )}

              {item.needsCheck && !checked && (
                <span
                  className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5 shrink-0"
                  title={item.quantityNote || 'Part of this amount could not be worked out from the recipe'}
                >
                  check amount
                </span>
              )}

              {isBelowRequirement && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetToRequired?.(item, requirement.requiredAmount);
                  }}
                  className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/60 px-1 py-0.2 rounded hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
                  title={`${requirement.requiredAmount} required for meal plan. Click to restore.`}
                >
                  <Info className="w-2.5 h-2.5 text-amber-600" />
                  <span>Need {requirement.requiredAmount}</span>
                </button>
              )}
            </div>

            {onToggleFavourite && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavourite(item.name, aisleInfo.name);
                }}
                className={`p-0.5 rounded-full transition-colors shrink-0 ${
                  isFavourite 
                    ? 'text-rose-500 hover:bg-rose-50' 
                    : 'text-zinc-300 hover:text-rose-400 hover:bg-zinc-100'
                }`}
                title={isFavourite ? "Remove from favourites" : "Add to favourites"}
              >
                <Heart className={`w-3.5 h-3.5 ${isFavourite ? 'fill-rose-500' : ''}`} />
              </button>
            )}
          </div>

          {/* Subtext info (for recipes, batch cooking details) */}
          {((requiredFor && requiredFor.length > 0) || (!requiredFor && item.isBatch && item.batchRecipeName) || (!requiredFor && item.recipeNames && item.recipeNames.length > 0) || item.quantityNote) && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5 flex-wrap">
              {requiredFor && requiredFor.length > 0 && (
                <span className="truncate max-w-[200px]">
                  For: {requiredFor.join(', ')}
                </span>
              )}

              {!requiredFor && item.isBatch && item.batchRecipeName && (
                <span className="truncate max-w-[200px] text-zinc-500">
                  for Batch: {item.batchRecipeName}
                </span>
              )}

              {!requiredFor && item.recipeNames && item.recipeNames.length > 0 && (
                <span className="truncate max-w-[200px]">
                  for {item.recipeNames.join(', ')}
                </span>
              )}

              {item.quantityNote && (
                <span className={item.needsCheck ? 'text-rose-600' : 'text-zinc-500'}>
                  {item.quantityNote}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right/Bottom section: Quantity display, adjuster, edit, delete, complete checkbox */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {isPending && (
          <button
            onClick={undo}
            className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 active:bg-emerald-100 transition-colors cursor-pointer"
          >
            Undo
          </button>
        )}
        
        {!isPending && onUpdateQuantity && (
          <div className="flex items-center bg-zinc-50 border border-zinc-200/80 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, -1)}
              disabled={item.isAdhoc ? item.amount <= 1 : item.amount <= 0}
              className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-white disabled:opacity-25 transition-all cursor-pointer"
            >
              <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
            <input
              type="text"
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={handleBlurOrSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBlurOrSubmit();
                  e.currentTarget.blur();
                }
              }}
              className="text-[10px] font-bold text-zinc-800 w-11 sm:w-14 text-center bg-transparent border-0 p-0 outline-none focus:ring-0 focus:bg-white rounded px-0.5 select-text"
            />
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, 1)}
              className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-white transition-all cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
            checked 
              ? 'bg-emerald-500 border-emerald-500 shadow-inner' 
              : 'bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300'
          }`}
          aria-label={checked ? "Uncheck item" : "Check item"}
        >
          {checked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
        </button>
      </div>
    </div>  );
}

interface AggregatedShoppingListItem {
  id: string;
  name: string;
  amount: number | string;
  displayQuantity?: string;
  unit: string;
  category?: string;
  checked: boolean;
  isAdhoc: boolean;
  isBatch?: boolean;
  isRecurring?: boolean;
  batchRecipeName?: string;
  recipeNames?: string[];
  underlyingIds: string[];
  description: string;
  checkCupboard?: boolean;
  needsCheck?: boolean;
  quantityNote?: string;
}

interface ShoppingModeViewProps {
  items: ShoppingListItem[];
  activePlan: MealPlan | null;
  onToggle: (idOrIds: string | string[], forceState?: boolean) => void;
  onExit: () => void;
  onUncheckAll: () => void;
  dropCompletedToBottom: boolean;
  onToggleDropCompleted: (val: boolean) => void;
  onEditStaples: () => void;
}

function ShoppingModeView({
  items,
  activePlan,
  onToggle: parentOnToggle,
  onExit,
  onUncheckAll,
  dropCompletedToBottom,
  onToggleDropCompleted,
  onEditStaples
}: ShoppingModeViewProps) {
  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayStr = formatDateISO(getNextMonday(new Date()));
  const [filter, setFilter] = useState<'all' | 'to_buy' | 'bought'>('all');
  const [viewMode, setViewMode] = useState<'sections' | 'food_type' | 'all'>('food_type');
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    planned: true,
    batch: true,
    adhoc: false,
    recurring: false
  });

  const toggleAisle = (aisle: string) => {
    setCollapsedAisles(prev => ({ ...prev, [aisle]: !prev[aisle] }));
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Same product = same row, whatever it's called ("Chicken breasts" / "chicken breast fillets").
  const getGroupingKey = (name: string, groceryId?: string): string => {
    const product = matchProduct(getCatalog(), name, { groceryId });
    return product ? `p:${product.id}` : `n:${groupingKey(name)}`;
  };

  // Aggregate items with matching normalized names
  const aggregatedItems = useMemo(() => {
    const groups: Record<string, ShoppingListItem[]> = {};
    items.forEach(item => {
      const key = getGroupingKey(item.name, item.groceryId);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    const result: AggregatedShoppingListItem[] = [];

    Object.values(groups).forEach(groupItems => {
      if (groupItems.length === 0) return;

      const sortedByPreference = [...groupItems].sort((a, b) => {
        const getScore = (item: ShoppingListItem) => {
          if (!item.isAdhoc && !item.isBatch && !item.isRecurring) return 4;
          if (item.isBatch) return 3;
          if (item.isRecurring) return 2;
          return 1;
        };
        return getScore(b) - getScore(a);
      });

      const canonical = sortedByPreference[0];
      const { amount: totalAmount, unit, displayQuantity } = aggregateIngredients(groupItems);
      const checked = groupItems.every(item => item.checked);
      const underlyingIds = groupItems.map(item => item.id);

      const recipeNameSet = new Set<string>();
      const batchRecipeNameSet = new Set<string>();
      let extraAmount = 0;
      let isRecurring = false;
      let hasPlanned = false;
      let hasBatch = false;

      groupItems.forEach(item => {
        if (!item.isAdhoc && !item.isBatch && !item.isRecurring) {
          hasPlanned = true;
          if (item.recipeNames) {
            item.recipeNames.forEach(rn => recipeNameSet.add(rn));
          }
        } else if (item.isBatch) {
          hasBatch = true;
          if (item.batchRecipeName) {
            batchRecipeNameSet.add(item.batchRecipeName);
          }
        } else if (item.isRecurring) {
          isRecurring = true;
        } else if (item.isAdhoc) {
          extraAmount += item.amount || 0;
        }
      });

      const descParts: string[] = [];

      if (recipeNameSet.size > 0) {
        descParts.push(`For ${Array.from(recipeNameSet).join(', ')}`);
      } else if (hasPlanned) {
        descParts.push('For Planned meals');
      }

      if (batchRecipeNameSet.size > 0) {
        descParts.push(`for Batch: ${Array.from(batchRecipeNameSet).join(', ')}`);
      } else if (hasBatch) {
        descParts.push('for Batch cooking');
      }

      if (extraAmount > 0) {
        descParts.push(`${extraAmount} extra`);
      }

      if (isRecurring) {
        descParts.push('Recurring');
      }

      const description = descParts.join(' + ');

      const isAdhoc = groupItems.every(i => i.isAdhoc);
      const isBatch = groupItems.some(i => i.isBatch);
      const isRecurringFlag = groupItems.some(i => i.isRecurring);

      result.push({
        id: canonical.id,
        name: canonical.name,
        amount: totalAmount,
        unit: unit,
        displayQuantity: displayQuantity,
        category: canonical.category,
        checked,
        isAdhoc,
        isBatch,
        isRecurring: isRecurringFlag,
        batchRecipeName: canonical.batchRecipeName,
        recipeNames: Array.from(recipeNameSet),
        underlyingIds,
        description,
        checkCupboard: groupItems.every(i => i.checkCupboard),
        needsCheck: groupItems.some(i => i.needsCheck),
        quantityNote: groupItems.map(i => i.quantityNote).filter(Boolean).join('; ') || undefined
      });
    });

    return result;
  }, [items]);

  const totalCount = aggregatedItems.length;
  const checkedCount = aggregatedItems.filter(i => i.checked).length;
  const pendingCount = totalCount - checkedCount;
  const completionPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === 'to_buy') return aggregatedItems.filter(i => !i.checked);
    if (filter === 'bought') return aggregatedItems.filter(i => i.checked);
    return aggregatedItems;
  }, [aggregatedItems, filter]);

  // Sections sorting & grouping helpers
  const plannedModeItems = useMemo(() => {
    return filteredItems.filter(i => !i.isAdhoc && !i.isBatch && !i.isRecurring);
  }, [filteredItems]);

  const batchModeItems = useMemo(() => {
    return filteredItems.filter(i => i.isBatch);
  }, [filteredItems]);

  const recurringModeItems = useMemo(() => {
    return filteredItems.filter(i => i.isRecurring);
  }, [filteredItems]);

  const adhocModeItems = useMemo(() => {
    return filteredItems.filter(i => i.isAdhoc && !i.isRecurring);
  }, [filteredItems]);

  // Group by aisle for easy supermarket navigation
  const groupedAisles = useMemo(() => {
    const map = new Map<FoodAisle, AggregatedShoppingListItem[]>();
    filteredItems.forEach(item => {
      const aisle = getGroceryAisle(item as any);
      const list = map.get(aisle) || [];
      list.push(item);
      map.set(aisle, list);
    });

    return Array.from(map.entries())
      .map(([aisle, list]) => ({
        aisle,
        info: GROCERY_AISLES[aisle],
        items: list
      }))
      .sort((a, b) => a.info.order - b.info.order);
  }, [filteredItems]);

  // Dynamic sorting based on dropCompletedToBottom
  const arrangeListItems = (itemList: AggregatedShoppingListItem[]): AggregatedShoppingListItem[] => {
    const sorted = [...itemList].sort((a, b) => a.name.localeCompare(b.name));
    if (dropCompletedToBottom) {
      return [
        ...sorted.filter(i => !i.checked),
        ...sorted.filter(i => i.checked)
      ];
    }
    return sorted;
  };

  const onToggle = (itemId: string) => {
    const aggItem = aggregatedItems.find(i => i.id === itemId);
    if (!aggItem) return;
    const targetState = !aggItem.checked;
    parentOnToggle(aggItem.underlyingIds, targetState);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Header in Shopping Mode */}
      <header className="bg-white border-b border-zinc-200 shrink-0 sticky top-0 z-30 shadow-2xs">
        {/* At the top of the header in shopping mode, % of shop complete which is calculated by number of items ticked */}
        <div className="bg-emerald-600 text-white px-4 py-3 sm:px-6 relative">
          <div className="max-w-2xl mx-auto flex items-center justify-between pr-32 sm:pr-40">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-100 shrink-0 stroke-[2.5]" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">
                  Shopping Mode
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5 font-medium">
                {checkedCount} of {totalCount} {totalCount === 1 ? 'item' : 'items'} ticked
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-emerald-100 font-semibold hidden sm:inline">
                Shop Complete:
              </span>
              <span className="text-base sm:text-lg font-black tracking-tight tabular-nums bg-white/20 px-2.5 py-0.5 rounded-xl text-white">
                {completionPercent}%
              </span>
            </div>
          </div>

          {/* Very top-right exit button */}
          <button
            type="button"
            id="btn-exit-shopping-mode"
            onClick={onExit}
            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-4 flex items-center gap-1.5 px-3 py-1.5 sm:py-2 sm:px-4 rounded-xl bg-black/20 hover:bg-black/30 active:bg-black/40 text-white text-xs font-bold shadow-xs transition-all cursor-pointer z-40 border border-white/10"
            title="Exit Shop Mode"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Exit Shop Mode</span>
          </button>

          {/* Visual animated progress bar */}
          <div className="max-w-2xl mx-auto mt-2.5 w-full h-2 bg-black/20 rounded-full overflow-hidden p-0.5">
            <div 
              className="h-full bg-white rounded-full transition-all duration-300 ease-out"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* Sub-Header / Filter / View Options Bar */}
        <div className="px-3 py-2.5 sm:px-6 bg-white border-b border-zinc-200 relative">
          <div className="max-w-2xl mx-auto flex flex-row items-center justify-between gap-1.5 sm:gap-4 flex-nowrap w-full overflow-x-auto scrollbar-none">
            {/* Left: Date */}
            <h2 className="text-xs sm:text-sm font-bold text-zinc-900 leading-tight shrink-0 whitespace-nowrap">
              {activePlan ? (activePlan.startDate === currentMondayStr ? 'This Week' : activePlan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(activePlan.startDate)) : 'This Week'}
            </h2>

            {/* Middle: Filters */}
            <div className="flex items-center gap-0.5 bg-zinc-100 p-0.5 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === 'all' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('to_buy')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === 'to_buy' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                To Buy ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('bought')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === 'bought' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Bought ({checkedCount})
              </button>
            </div>

            {/* Right: View Options */}
            <div className="relative shrink-0">
              <button
                type="button"
                id="btn-shopping-mode-view-options"
                onClick={() => setShowViewOptions(!showViewOptions)}
                className={`h-7 px-2 sm:h-8 sm:px-2.5 rounded-lg sm:rounded-xl border flex items-center gap-1 transition-all cursor-pointer shadow-2xs text-[10px] sm:text-xs font-bold ${
                  showViewOptions
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                }`}
                title="View options"
                aria-label="View options"
              >
                <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">View Options</span>
              </button>

              {showViewOptions && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowViewOptions(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl border border-zinc-200/90 shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-1 mb-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        View Layout
                      </span>
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('sections');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            viewMode === 'sections'
                              ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" />
                            <span>Sections</span>
                          </div>
                          {viewMode === 'sections' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('food_type');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            viewMode === 'food_type'
                              ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Store className="w-3.5 h-3.5" />
                            <span>Grouped by Aisle</span>
                          </div>
                          {viewMode === 'food_type' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('all');
                            setShowViewOptions(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            viewMode === 'all'
                              ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Flat List</span>
                          </div>
                          {viewMode === 'all' && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 my-2 pt-2 px-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 font-bold">
                        List Options
                      </span>
                      <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer text-xs font-semibold text-zinc-700 select-none">
                        <input
                          type="checkbox"
                          checked={dropCompletedToBottom}
                          onChange={(e) => onToggleDropCompleted(e.target.checked)}
                          className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Drop completed to bottom</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Simplified Shopping List Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 max-w-2xl mx-auto w-full space-y-4">
        {/* 100% Completion Celebration Card */}
        {totalCount > 0 && checkedCount === totalCount && (
          <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-5 text-center space-y-2 animate-in fade-in shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>
            <h3 className="text-lg font-bold text-emerald-950">Shop 100% Complete!</h3>
            <p className="text-xs text-emerald-800 max-w-xs mx-auto">
              All {totalCount} items on your list have been checked off.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Exit Shopping Mode
              </button>
              <button
                type="button"
                onClick={onUncheckAll}
                className="px-3 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                Uncheck All
              </button>
            </div>
          </div>
        )}

        {totalCount === 0 ? (
          <div className="text-center p-8 bg-white rounded-2xl border border-zinc-200/80 mt-6 shadow-2xs">
            <ShoppingBag className="w-12 h-12 text-zinc-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-zinc-800">No items on this list</h3>
            <p className="text-xs text-zinc-400 mt-1 mb-4">
              There are no shopping items for {activePlan ? formatWeekRange(activePlan.startDate) : 'this week'}.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Back to Shopping Tab
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center p-8 bg-white rounded-2xl border border-zinc-200/80 mt-4 shadow-2xs">
            <p className="text-sm font-medium text-zinc-600">No {filter === 'to_buy' ? 'unbought' : 'bought'} items</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="text-xs text-emerald-600 font-semibold underline mt-2 cursor-pointer"
            >
              Show all items
            </button>
          </div>
        ) : viewMode === 'food_type' ? (
          groupedAisles.map(group => (
            <ShopAisleGroup
              key={group.aisle}
              aisle={group.aisle}
              info={group.info}
              items={arrangeListItems(group.items)}
              renderItem={(item) => (
                <ShoppingModeItemRow
                  key={item.id}
                  item={item}
                  onToggle={parentOnToggle}
                />
              )}
            />
          ))
        ) : viewMode === 'sections' ? (
          <div className="space-y-4">
            {/* Items */}
            {adhocModeItems.length > 0 && (() => {
              const isCollapsed = !!collapsedSections['adhoc'];
              return (
                <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                  <button
                    type="button"
                    onClick={() => toggleSection('adhoc')}
                    className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">
                        Items
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400">
                      {adhocModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 pt-1">
                      {arrangeListItems(adhocModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Recurring Staples */}
            {recurringModeItems.length > 0 && (() => {
              const isCollapsed = !!collapsedSections['recurring'];
              return (
                <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                  <div className="w-full flex items-center justify-between p-1 rounded-xl select-none">
                    <button
                      type="button"
                      onClick={() => toggleSection('recurring')}
                      className="flex items-center gap-1.5 hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left min-w-0"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-400 truncate max-w-[130px] sm:max-w-none">
                        <span className="hidden sm:inline">Recurring Staples</span>
                        <span className="sm:hidden">Staples</span>
                      </span>
                    </button>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditStaples();
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-650 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer shrink-0"
                        title="Manage Staples"
                      >
                        <Sliders className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                        <span>Manage</span>
                      </button>

                      <span className="text-[10px] font-semibold text-zinc-400 shrink-0">
                        {recurringModeItems.filter(i => !i.checked).length} left
                      </span>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="space-y-2 pt-1">
                      {arrangeListItems(recurringModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Meal Ingredients */}
            {plannedModeItems.length > 0 && (() => {
              const isCollapsed = !!collapsedSections['planned'];
              return (
                <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                  <button
                    type="button"
                    onClick={() => toggleSection('planned')}
                    className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">
                        Meal Ingredients
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400">
                      {plannedModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 pt-1">
                      {arrangeListItems(plannedModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Batch Meals */}
            {batchModeItems.length > 0 && (() => {
              const isCollapsed = !!collapsedSections['batch'];
              return (
                <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                  <button
                    type="button"
                    onClick={() => toggleSection('batch')}
                    className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">
                        Batch Meals
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400">
                      {batchModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 pt-1">
                      {arrangeListItems(batchModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            {!dropCompletedToBottom ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-700 border-zinc-200">
                    All Items
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium">
                    {filteredItems.filter(i => !i.checked).length} to buy
                  </span>
                </div>
                <div className="space-y-2">
                  {arrangeListItems(filteredItems).map(item => (
                    <ShoppingModeItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {filteredItems.filter(i => !i.checked).length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] block px-1">
                      To Buy ({filteredItems.filter(i => !i.checked).length})
                    </span>
                    <div className="space-y-2">
                      {arrangeListItems(filteredItems.filter(i => !i.checked)).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredItems.filter(i => i.checked).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] block px-1">
                      Checked Off ({filteredItems.filter(i => i.checked).length})
                    </span>
                    <div className="space-y-2">
                      {arrangeListItems(filteredItems.filter(i => i.checked)).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ShoppingModeItemRowProps {
  key?: React.Key;
  item: AggregatedShoppingListItem;
  onToggle: (id: string) => void;
}

function ShoppingModeItemRow({
  item,
  onToggle
}: ShoppingModeItemRowProps) {
  return (
    <div
      onClick={() => onToggle(item.id)}
      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] select-none ${
        item.checked
          ? 'bg-zinc-100/60 border-zinc-200/70 opacity-55'
          : 'bg-white border-zinc-200/90 shadow-2xs hover:border-zinc-300'
      }`}
    >
      {/* Left: Item name & Quantity with for meal in small print */}
      <div className="flex-1 min-w-0 pr-2">
        {/* Large item name */}
        <p className={`text-base sm:text-lg font-bold text-zinc-900 leading-snug tracking-tight ${
          item.checked ? 'line-through text-zinc-400 font-medium' : ''
        }`}>
          {item.name}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Large Quantity */}
          <span className={`text-sm sm:text-base font-bold tabular-nums ${
            item.checked ? 'text-zinc-400' : 'text-emerald-700'
          }`}>
            {(() => {
              if (item.displayQuantity) return item.displayQuantity;
              const rawUnit = item.unit ? item.unit.toLowerCase().trim() : '';
              const isCount = !rawUnit || ['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(rawUnit);
              return isCount ? `Qty: ${item.amount}` : `${item.amount}${item.unit ? ' ' + item.unit : ''}`;
            })()}
          </span>

          {/* for meal in small print */}
          {item.description && (
            <span className="text-xs text-zinc-400 font-normal truncate max-w-[280px]" title={item.description}>
              {item.description}
            </span>
          )}

          {item.checkCupboard && !item.checked && (
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
              check cupboard
            </span>
          )}
          {item.needsCheck && !item.checked && (
            <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5" title={item.quantityNote}>
              check amount
            </span>
          )}
        </div>
        {item.quantityNote && !item.checked && (
          <p className={`text-xs mt-1 ${item.needsCheck ? 'text-rose-600' : 'text-zinc-500'}`}>{item.quantityNote}</p>
        )}
      </div>

      {/* Right: Large Tick Box */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.id);
        }}
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs ${
          item.checked
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-zinc-300 hover:border-emerald-500 bg-white'
        }`}
        aria-label={item.checked ? `Mark ${item.name} as unbought` : `Mark ${item.name} as bought`}
      >
        {item.checked && <Check className="w-5 h-5 stroke-[3]" />}
      </button>
    </div>
  );
}

function EditRecurringStaplesModal({ store, onClose }: { store: any; onClose: () => void }) {
  const prefs = store.state.preferences || { recurringItems: [] };
  const recurringItems = prefs.recurringItems || [];
  const groceryDatabase = store.state.groceryDatabase || INITIAL_GROCERY_DATABASE || [];

  const [newItemName, setNewItemName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingStapleId, setEditingStapleId] = useState<string | null>(null);
  
  // Editing state for detailed edit popup inside the main modal
  const [editingStapleName, setEditingStapleName] = useState('');
  const [editingStapleAmount, setEditingStapleAmount] = useState<number>(1);
  const [editingStapleUnit, setEditingStapleUnit] = useState('item');
  const [editingStapleCategory, setEditingStapleCategory] = useState('Dairy & Eggs');

  const stapleSuggestions = useMemo(() => {
    if (!newItemName.trim()) return [];
    const query = newItemName.toLowerCase();
    return groceryDatabase
      .filter((g: any) => g.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [newItemName, groceryDatabase]);

  const handleQuickAddStaple = (name: string) => {
    if (!name.trim()) return;

    const matched = findGroceryDatabaseMatch(name, groceryDatabase);

    let finalName = name.trim();
    let finalUnit = 'item';
    let finalCategory = 'Dairy & Eggs';

    if (matched) {
      finalName = matched.name;
      finalUnit = matched.unit || finalUnit;
      finalCategory = matched.category || finalCategory;
    } else {
      const aisle = getGroceryAisle({ name: finalName });
      const catMap: Record<string, string> = {
        produce: 'Produce',
        meat_seafood: 'Meat & Seafood',
        dairy_eggs: 'Dairy & Eggs',
        grains_pasta: 'Grains & Pasta',
        canned_jars: 'Canned & Jars',
        bakery: 'Bakery',
        frozen: 'Frozen',
        pantry_spices: 'Pantry & Spices',
        household_other: 'Household & Other'
      };
      finalCategory = catMap[aisle] || 'Pantry & Spices';
    }

    const newRecItem = {
      id: crypto.randomUUID(),
      name: finalName,
      amount: 1,
      unit: finalUnit,
      category: finalCategory
    };

    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = [...currentRecurring, newRecItem];
    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }

    setNewItemName('');
    setShowSuggestions(false);
  };

  const handleRemoveRecurringItem = (id: string) => {
    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = currentRecurring.filter((item: any) => item.id !== id);
    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }
  };

  const getStapleStep = (name: string): number => {
    const matched = findGroceryDatabaseMatch(name, groceryDatabase);
    return matched?.increment || 1;
  };

  const handleUpdateStapleQuantity = (id: string, delta: number) => {
    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = currentRecurring.map((item: any) => {
      if (item.id === id) {
        const step = getStapleStep(item.name);
        const actualDelta = delta < 0 ? -step : step;
        const newAmount = Math.max(step, (item.amount || 1) + actualDelta);
        
        let nextUnit = item.unit;
        if (['item', 'items'].includes((item.unit || '').toLowerCase().trim())) {
          nextUnit = newAmount === 1 ? 'item' : 'items';
        }

        return {
          ...item,
          amount: Math.round(newAmount * 100) / 100,
          unit: nextUnit
        };
      }
      return item;
    });

    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-55 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-zinc-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-150 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-zinc-905 lowercase">Manage Recurring Staples</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-zinc-500 leading-normal font-medium">
            Staples configured here will automatically be included in your weekly shopping list.
          </p>

          {/* Quick Add Input */}
          <div className="relative z-30">
            <div className="flex items-center gap-2 bg-white border border-zinc-200/85 rounded-xl px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <Search className="w-4 h-4 text-zinc-400" />
              <input 
                type="text"
                placeholder="Quick add staple item (e.g. Milk, Eggs)"
                className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 outline-none font-medium"
                value={newItemName}
                onChange={(e) => {
                  setNewItemName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemName.trim()) {
                    handleQuickAddStaple(newItemName.trim());
                  }
                }}
              />
            </div>
            
            {showSuggestions && stapleSuggestions.length > 0 && (
              <>
                <div className="fixed inset-0 z-45" onClick={() => setShowSuggestions(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200/90 shadow-lg rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                  {stapleSuggestions.map((suggestion: any, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleQuickAddStaple(suggestion.name)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 text-left transition-colors border-b border-zinc-50 last:border-0 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-zinc-850">{suggestion.name}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
                        {suggestion.category}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Staples List */}
          {recurringItems.length === 0 ? (
            <div className="text-center py-8 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
              <p className="text-xs text-zinc-400 font-semibold">No recurring staples configured yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recurringItems.map((item: any) => {
                const aisle = getGroceryAisle(item);
                const aisleInfo = GROCERY_AISLES[aisle];
                return (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-xl border transition-all bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-xs text-zinc-900 truncate">
                          {item.name}
                        </p>
                        <span className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${aisleInfo.colorClass}`}>
                          {aisleInfo.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                        <span className="font-semibold text-zinc-700">
                          {item.amount}{item.unit && !['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(item.unit.toLowerCase().trim()) ? ` ${item.unit}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {/* Adjuster */}
                      <div className="flex items-center bg-zinc-100/90 border border-zinc-200/80 rounded-lg p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateStapleQuantity(item.id, -1)}
                          disabled={item.amount <= 0.1}
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-650 hover:text-zinc-950 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                        <span className="text-[11px] font-bold text-zinc-800 w-10 text-center select-none">
                          {item.amount}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateStapleQuantity(item.id, 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-650 hover:text-zinc-950 hover:bg-white transition-all cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Edit details */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStapleId(item.id);
                          setEditingStapleName(item.name);
                          setEditingStapleAmount(item.amount);
                          setEditingStapleUnit(item.unit);
                          setEditingStapleCategory(item.category || 'Dairy & Eggs');
                        }}
                        className="p-1 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveRecurringItem(item.id)}
                        className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-150 flex justify-end bg-zinc-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Editing details sub-modal */}
      {editingStapleId && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-zinc-200/90 overflow-hidden animate-in slide-in-from-bottom-4 duration-150">
            <div className="px-4 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">edit staple details</h3>
              <button 
                type="button" 
                onClick={() => setEditingStapleId(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Item Name</label>
                <input
                  type="text"
                  disabled
                  value={editingStapleName}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-500 cursor-not-allowed outline-none shadow-3xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    required
                    value={editingStapleAmount}
                    onChange={(e) => setEditingStapleAmount(parseFloat(e.target.value) || 1)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Unit (override)</label>
                  <input
                    type="text"
                    placeholder="e.g. litre, pack"
                    value={editingStapleUnit}
                    onChange={(e) => setEditingStapleUnit(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Aisle Category</label>
                <select
                  value={editingStapleCategory}
                  onChange={(e) => setEditingStapleCategory(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all font-semibold text-zinc-700 cursor-pointer shadow-3xs"
                >
                  <option value="Dairy & Eggs">Dairy & Eggs</option>
                  <option value="Produce">Produce</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Meat & Seafood">Meat & Seafood</option>
                  <option value="Grains & Pasta">Grains & Pasta</option>
                  <option value="Canned & Jars">Canned & Jars</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Pantry & Spices">Pantry & Spices</option>
                  <option value="Household & Other">Household & Other</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setEditingStapleId(null)}
                  className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentRecurring = prefs.recurringItems || [];
                    const updatedRecurring = currentRecurring.map((item: any) => {
                      if (item.id === editingStapleId) {
                        return {
                          ...item,
                          amount: Math.max(0.1, editingStapleAmount),
                          unit: editingStapleUnit.trim() || 'item',
                          category: editingStapleCategory
                        };
                      }
                      return item;
                    });
                    store.updatePreferences({
                      recurringItems: updatedRecurring
                    });
                    if (store.updateShoppingList) {
                      const nextShoppingList = syncRecurringStaplesForAllPlans(
                        store.state.mealPlans || [],
                        store.state.shoppingList || [],
                        updatedRecurring
                      );
                      store.updateShoppingList(nextShoppingList);
                    }
                    setEditingStapleId(null);
                  }}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
