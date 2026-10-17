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
  Edit3,
  ArrowUp,
  ArrowDown,
  ListOrdered,
  PackageCheck,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Share2,
  StickyNote,
} from 'lucide-react';
import { ShoppingListItem, Recipe, MealPlan, DayPlan } from '../types';
import { useGracefulCheckoff } from '../hooks/useGracefulCheckoff';
import { aggregateIngredients } from '../utils/aggregation';
import { matchProduct, groupingKey, canonicalUnit, formatUnit, largeUnitQuantity, formatAmount as formatShopAmount, unitInfo } from '../shopping';
import ShopAisleGroup from './ShopAisleGroup';
import CatalogDrawer from './CatalogDrawer';
import ShopRow from './shop/ShopRow';
import ItemSheet from './shop/ItemSheet';
import QuickAdd from './shop/QuickAdd';
import DoneShoppingSheet, { DoneChoice } from './shop/DoneShoppingSheet';
import {
  AggregatedShoppingListItem, aggregateShoppingItems, shopQuantityText, partLabel, defaultShopWeek, formatWeekSpan, weekStartShort,
  parseQuickAdd, quickAddLine, listAsText, carryItemsToWeek, shopDurationText, productKey,
} from '../shopList';
import { preferredWeekStart } from '../planning';
import { buildCatalog, matchProductDetailed } from '../shopping';
import BatchMealModal from './BatchMealModal';
import { IngredientTriageModal } from './IngredientTriageModal';
import { changedDaysSinceList } from '../planning';
import { weekLabelFor } from '../planShopping';
import { sendWeekToShoppingList } from '../planShopping';
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
  orderedAisles,
  aislePositions,
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
  /** Open on this week (e.g. "See the list" after sending a week from Planning). */
  openPlanId?: string | null;
  onOpenPlanHandled?: () => void;
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

export default function ShopTab({ store, onNavigateTab, openPlanId, onOpenPlanHandled }: ShopTabProps) {
  // The latest store, for buttons pressed later (Undo in a message).
  const storeRef = useRef(store);
  storeRef.current = store;
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
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null);
  const setToastMessage = (message: string | null, action?: { label: string; run: () => void }) => setToast(message ? { message, action } : null);
  const [isShoppingMode, setIsShoppingMode] = useState(false);

  // Grouping and sorting states
  // How the list is grouped (this phone): by aisle unless you chose otherwise.
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem('shop_view');
      return v === 'sections' || v === 'all' || v === 'food_type' ? v : 'food_type';
    } catch { return 'food_type'; }
  });
  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try { localStorage.setItem('shop_view', v); } catch { /* per-phone convenience only */ }
  };
  // The item panel follows one of the row's lines, so it stays open while you change its aisle or name.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [showBought, setShowBought] = useState(false);
  const [showDone, setShowDone] = useState(false);
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
  const [showCupboardCheck, setShowCupboardCheck] = useState(false);
  const [showAisleOrder, setShowAisleOrder] = useState(false);
  const [showInCupboard, setShowInCupboard] = useState(false);
  // One-line rows in shopping mode (this phone only).
  const [compactRows, setCompactRows] = useState<boolean>(() => {
    try { return localStorage.getItem('shop_compact_rows') !== '0'; } catch { return true; }
  });
  const handleCompactRows = (val: boolean) => {
    setCompactRows(val);
    try { localStorage.setItem('shop_compact_rows', val ? '1' : '0'); } catch { /* per-phone convenience only */ }
  };
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
    planned: true,
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

  // Auto-hide toast (longer when it has a button, e.g. Undo)
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.action ? 5000 : 2800);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  // The week to open on: the one you're most likely shopping for that still has things to buy
  // (this week Mon–Thu, next week Fri–Sun), else the earliest sent week with things to buy.
  const defaultWeekId = () => {
    const plans = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
    return defaultShopWeek(plans, store.state.shoppingList || [], preferredWeekStart(new Date(), currentMondayStr, nextMondayStr), nextMondayStr);
  };
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    if (openPlanId && (store.state.mealPlans || []).some((p: MealPlan) => p.id === openPlanId)) return openPlanId;
    return defaultWeekId();
  });
  useEffect(() => { if (openPlanId) onOpenPlanHandled?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected week valid (e.g. a week removed on the other phone)
  useEffect(() => {
    if (allPlans.length > 0) {
      if (!allPlans.some(p => p.id === selectedPlanId)) setSelectedPlanId(defaultWeekId() || allPlans[0].id);
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
    setToastMessage(`Added ${addedCount} ${addedCount === 1 ? 'ingredient' : 'ingredients'} for ${mealName}`);
  };

  // Aisles in the order you walk your shop (shared between phones).
  const aisleOrder: string[] | undefined = store.state.preferences?.aisleOrder;
  const aislePos = useMemo(() => aislePositions(aisleOrder), [aisleOrder]);
  const handleSaveAisleOrder = (order: string[] | null) => {
    store.updatePreferences?.({ aisleOrder: order || undefined });
    setToastMessage(order ? 'Aisle order saved' : 'Aisles back to the usual order');
  };

  // Cupboard check: 'have' takes an item off this week's list, 'need' keeps it (and stops asking).
  const handleCupboardAnswer = (ids: string[], answer: 'have' | 'need' | null) => {
    const idSet = new Set(ids);
    const nextList = (store.state.shoppingList || []).map((i: ShoppingListItem) => {
      if (!idSet.has(i.id)) return i;
      if (answer) return { ...i, cupboard: answer };
      const { cupboard, ...rest } = i;
      return rest as ShoppingListItem;
    });
    store.updateShoppingList(nextList);
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

  // Store-cupboard items still to check, and the ones you said you already have.
  const cupboardToCheck = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.checkCupboard && !i.checked && !i.cupboard),
    [currentWeekItems]
  );
  const inCupboardItems = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.cupboard === 'have'),
    [currentWeekItems]
  );
  // What you're actually buying this week.
  const buyingItems = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.cupboard !== 'have'),
    [currentWeekItems]
  );

  // Filter helper applied to items for status & source
  const filterItem = (item: ShoppingListItem): boolean => {
    if (item.cupboard === 'have') return false;
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
        const orderA = aislePos[getGroceryAisle(a)];
        const orderB = aislePos[getGroceryAisle(b)];
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
    const sortedAisleKeys = orderedAisles(aisleOrder);

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
  }, [currentWeekItems, sortBy, statusFilter, sourceFilter, aisleOrder]);

  // ---------- One row per product (the same rows and counts as shopping mode) ----------
  const rows = useMemo(() => aggregateShoppingItems(buyingItems), [buyingItems]);
  const byName = (a: AggregatedShoppingListItem, b: AggregatedShoppingListItem) => a.name.localeCompare(b.name);
  const toBuyRows = useMemo(() => rows.filter(r => !r.checked).sort(byName), [rows]);
  const boughtRows = useMemo(() => rows.filter(r => r.checked).sort(byName), [rows]);
  const totalCount = rows.length;
  const checkedCount = boughtRows.length;
  const percentDone = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0;
  const aisleOf = (r: { name: string; category?: string }) => getGroceryAisle(r);

  // The groups the list shows, in the chosen layout (things still to buy only; bought go to the end).
  const listGroups = useMemo(() => {
    if (viewMode === 'all') return toBuyRows.length ? [{ id: 'all', title: 'A–Z', rows: toBuyRows }] : [];
    if (viewMode === 'sections') {
      const sources: { id: string; title: string; test: (i: ShoppingListItem) => boolean }[] = [
        { id: 'adhoc', title: 'Added by you', test: i => i.isAdhoc && !i.isRecurring },
        { id: 'recurring', title: 'Weekly staples', test: i => !!i.isRecurring },
        { id: 'planned', title: 'For your meals', test: i => !i.isAdhoc && !i.isBatch && !i.isRecurring },
        { id: 'batch', title: 'Extra recipes', test: i => !!i.isBatch },
      ];
      return sources
        .map(src => ({ id: src.id, title: src.title, rows: aggregateShoppingItems(buyingItems.filter(src.test)).filter(r => !r.checked).sort(byName) }))
        .filter(g => g.rows.length > 0);
    }
    return orderedAisles(aisleOrder)
      .map(a => ({ id: a, title: GROCERY_AISLES[a].name, rows: toBuyRows.filter(r => aisleOf(r) === a) }))
      .filter(g => g.rows.length > 0);
  }, [viewMode, toBuyRows, buyingItems, aisleOrder]);

  const openRow = openRowId ? rows.find(r => r.underlyingIds.includes(openRowId)) || null : null;

  const tickRow = (row: AggregatedShoppingListItem) => handleToggleItem(row.underlyingIds, !row.checked);

  /** How much of a product is waiting on this week's list ("4 pints"), for Add items and the add box. */
  const onTheList = (name: string): string | null => {
    const key = productKey({ name });
    const row = toBuyRows.find(r => r.key === key || r.name.toLowerCase() === name.toLowerCase());
    return row ? shopQuantityText(row) : null;
  };

  // ---------- Weeks ----------
  const weekName = (startDate?: string) =>
    !startDate ? '' : startDate === currentMondayStr ? 'This week' : startDate === nextMondayStr ? 'Next week' : `w/c ${weekStartShort(startDate)}`;
  const planIndex = activePlan ? allPlans.findIndex(p => p.id === activePlan.id) : -1;
  const prevPlan = planIndex > 0 ? allPlans[planIndex - 1] : null;
  const nextPlan = planIndex >= 0 && planIndex < allPlans.length - 1 ? allPlans[planIndex + 1] : null;

  // The week after this one, for things you didn't get (made if needed, within the 4-week limit).
  const followingStart = (() => {
    if (!activePlan) return null;
    const d = new Date(activePlan.startDate + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return formatDateISO(d);
  })();
  const followingPlan: MealPlan | null = followingStart ? (store.state.mealPlans || []).find((p: MealPlan) => p.startDate === followingStart) || null : null;
  const canCarry = !!followingStart && (!!followingPlan || canPlanFollowingWeek(activePlan?.startDate));
  const followingShort = !canCarry || !followingStart ? null : followingStart === nextMondayStr ? 'next week' : `w/c ${weekStartShort(followingStart)}`;
  const followingListPhrase = !followingShort ? null : followingStart === nextMondayStr ? "next week's list" : `the ${followingShort} list`;

  /** Move these lines to the following week's list (making that week if it isn't there yet). */
  const carryToFollowingWeek = (ids: string[]): { moved: string[]; alreadyThere: string[] } | null => {
    if (!activePlan || !followingStart || !canCarry || ids.length === 0) return null;
    let list: ShoppingListItem[] = [...(store.state.shoppingList || [])];
    let target = followingPlan;
    if (!target) {
      target = createEmptyPlan(new Date(followingStart + 'T00:00:00'));
      store.updateMealPlan(target);
      const recurringPrefs = store.state.preferences?.recurringItems || [];
      if (recurringPrefs.length > 0) list = syncRecurringStaplesForPlan(target, list, recurringPrefs, dismissedItemIds);
    }
    const res = carryItemsToWeek(list, ids, target.id, `Week of ${formatWeekRange(target.startDate)}`);
    store.updateShoppingList(res.list);
    return { moved: res.moved, alreadyThere: res.alreadyThere };
  };

  // ---------- The item panel ----------
  const updateParts = (ids: string[], patch: (i: ShoppingListItem) => ShoppingListItem) => {
    const idSet = new Set(ids);
    store.updateShoppingList((store.state.shoppingList || []).map((i: ShoppingListItem) => (idSet.has(i.id) ? patch(i) : i)));
  };

  const removeRowParts = (row: AggregatedShoppingListItem) => {
    const removed = row.parts;
    const idSet = new Set(row.underlyingIds);
    store.updateShoppingList((store.state.shoppingList || []).filter((i: ShoppingListItem) => !idSet.has(i.id)));
    setOpenRowId(null);
    setToastMessage(`Removed ${row.name}`, {
      label: 'Undo',
      run: () => {
        const st = storeRef.current;
        const live = new Set((st.state.shoppingList || []).map((i: ShoppingListItem) => i.id));
        st.updateShoppingList([...(st.state.shoppingList || []), ...removed.filter(i => !live.has(i.id))]);
      },
    });
  };

  const setRowAisle = (row: AggregatedShoppingListItem, aisle: FoodAisle) => {
    const category = GROCERY_AISLES[aisle].name;
    // Remember it for the product, so it's in this aisle next time too (both phones).
    const found = matchProductDetailed(getCatalog(), row.name, { groceryId: row.parts[0]?.groceryId });
    let groceryId: string | undefined = found?.product.id;
    if (found && found.how !== 'partial') {
      store.updateGroceryOverride?.(found.product.id, { category });
    } else {
      groceryId = `gdb-custom-${crypto.randomUUID()}`;
      store.updateGroceryOverride?.(groceryId, {
        id: groceryId, name: row.name, category, unit: row.parts[0]?.unit || 'item', increment: 1, cost: 0, aliases: [row.name],
      });
    }
    updateParts(row.underlyingIds, i => ({ ...i, category, ...(groceryId ? { groceryId } : {}) }));
    setToastMessage(`${row.name}: ${category}`);
  };

  const partDetail = (part: ShoppingListItem): string => {
    if (part.isAdhoc || part.isBatch || part.isRecurring) return partLabel(part);
    const req = plannedRequirementsByName.get(part.name.toLowerCase().trim());
    if (!req || !req.breakdown.length) return partLabel(part);
    const seen = new Set<string>();
    const bits: string[] = [];
    for (const b of req.breakdown) {
      const t = `${b.recipeName} (${b.night.slice(0, 3)})`;
      if (!seen.has(t)) { seen.add(t); bits.push(t); }
    }
    return `For ${bits.join(', ')}`;
  };

  // ---------- Adding ----------
  /** Lines typed or picked: added to something you already added by hand, or as a new line. */
  const addLines = (lines: { name: string; amount: number; unit: string; category?: string; groceryId?: string }[]): string[] => {
    if (!activePlan || lines.length === 0) return [];
    const list: ShoppingListItem[] = [...(store.state.shoppingList || [])];
    const ids: string[] = [];
    for (const line of lines) {
      const key = productKey(line);
      const idx = list.findIndex(i => i.planId === activePlan.id && i.isAdhoc && !i.isRecurring && !i.checked && productKey(i) === key);
      if (idx > -1 && canonicalUnit(list[idx].unit) === canonicalUnit(line.unit)) {
        ids.push(list[idx].id);
        const amount = Math.round((list[idx].amount + line.amount) * 100) / 100;
        list[idx] = { ...list[idx], amount, unit: /^items?$/i.test(list[idx].unit || '') ? (amount === 1 ? 'item' : 'items') : formatUnit(canonicalUnit(line.unit), amount) };
      } else {
        const id = crypto.randomUUID();
        ids.push(id);
        list.push({
          id,
          name: line.name,
          amount: line.amount,
          unit: line.unit,
          category: line.category || '',
          ...(line.groceryId ? { groceryId: line.groceryId } : {}),
          checked: false,
          isAdhoc: true,
          isBatch: false,
          planId: activePlan.id,
          weekLabel: `Week of ${formatWeekRange(activePlan.startDate)}`,
        });
      }
    }
    store.updateShoppingList(list);
    return ids;
  };

  const handleQuickAdd = (text: string, asName?: string) => {
    const parsed = parseQuickAdd(text);
    if (asName) parsed.name = asName;
    if (!parsed.name) return;
    const line = quickAddLine(parsed);
    const [id] = addLines([line]);
    const key = productKey(line);
    const already = rows.some(r => r.key === key && !r.checked);
    setToastMessage(already ? `${line.name}: added ${shopQuantityText(line)} more` : `Added ${line.name} · ${shopQuantityText(line)}`, id ? { label: 'Edit', run: () => setOpenRowId(id) } : undefined);
  };

  const quickAddSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; aisle: string; favourite?: boolean }[] = [];
    const push = (name: string, category?: string, favourite?: boolean) => {
      const k = (name || '').toLowerCase().trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push({ name, aisle: GROCERY_AISLES[getGroceryAisle({ name, category })].name, favourite });
    };
    favourites.forEach(f => push(f.name, f.category, true));
    buildCatalog(store.state.groceryDatabase, store.state.groceryOverrides).products
      .filter((p: any) => !p.sameAs)
      .forEach((p: any) => push(p.name, p.category));
    (store.state.shoppingList || []).forEach((i: ShoppingListItem) => push(i.name, i.category));
    return out;
  }, [favourites, store.state.groceryDatabase, store.state.groceryOverrides, store.state.shoppingList]);

  // ---------- Sharing the list ----------
  const shareList = async () => {
    const title = `Shopping list · ${weekName(activePlan?.startDate)} (${formatWeekSpan(activePlan?.startDate || '')})`;
    const groups = orderedAisles(aisleOrder)
      .map(a => ({ name: GROCERY_AISLES[a].name, items: toBuyRows.filter(r => aisleOf(r) === a) }))
      .filter(g => g.items.length);
    const text = listAsText(title, groups);
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (nav?.share && touch) {
      try { await nav.share({ title, text }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    try {
      await nav.clipboard.writeText(text);
      setToastMessage(`List copied (${toBuyRows.length} ${toBuyRows.length === 1 ? 'item' : 'items'}): paste it anywhere`);
    } catch {
      setToastMessage("Couldn't copy the list on this device");
    }
  };

  // ---------- Shopping mode: timing and "Done shopping" ----------
  const startKey = activePlan ? `shop_started_${activePlan.id}` : '';
  const startShopping = () => {
    try { if (startKey && !localStorage.getItem(startKey)) localStorage.setItem(startKey, String(Date.now())); } catch { /* timing is a nicety */ }
    setIsShoppingMode(true);
  };
  const shopTook = (): string | null => {
    try {
      const t = Number(localStorage.getItem(startKey));
      return t ? shopDurationText(Date.now() - t) : null;
    } catch { return null; }
  };

  const finishShopping = (choice: DoneChoice) => {
    const notBought = toBuyRows;
    const ids = notBought.flatMap(r => r.underlyingIds);
    const took = shopTook();
    let extra = '';
    if (choice === 'move' && ids.length) {
      const res = carryToFollowingWeek(ids);
      if (res) extra = ` · ${res.moved.length + res.alreadyThere.length} moved to ${followingShort}`;
    } else if (choice === 'remove' && ids.length) {
      const idSet = new Set(ids);
      store.updateShoppingList((store.state.shoppingList || []).filter((i: ShoppingListItem) => !idSet.has(i.id)));
      extra = ` · ${notBought.length} taken off`;
    } else if (choice === 'keep' && ids.length) {
      extra = ` · ${notBought.length} still to get`;
    }
    try { if (startKey) localStorage.removeItem(startKey); } catch { /* ignore */ }
    setShowDone(false);
    setIsShoppingMode(false);
    setShowBought(false);
    setToastMessage(`Shop done: ${checkedCount} bought${took ? ` in ${took}` : ''}${extra}`);
  };

  if (isShoppingMode) {
    return (
      <>
      <ShoppingModeView
        items={buyingItems}
        activePlan={activePlan}
        onToggle={handleToggleItem}
        onExit={() => setIsShoppingMode(false)}
        onDone={() => setShowDone(true)}
        quickAdd={<QuickAdd suggestions={quickAddSuggestions} onTheList={onTheList} onAdd={handleQuickAdd} compact />}
        onUncheckAll={() => {
          const checkedIds = buyingItems.filter(item => item.checked).map(item => item.id);
          if (checkedIds.length > 0) {
            handleToggleItem(checkedIds, false);
          }
        }}
        dropCompletedToBottom={dropCompletedToBottom}
        onToggleDropCompleted={handleToggleDropCompleted}
        onEditStaples={() => setShowEditStaplesModal(true)}
        compactRows={compactRows}
        onCompactRows={handleCompactRows}
        aisleOrder={aisleOrder}
        onArrangeAisles={() => setShowAisleOrder(true)}
        cupboardToCheckCount={cupboardToCheck.length}
        onCupboardCheck={() => setShowCupboardCheck(true)}
      />
      {showCupboardCheck && (
        <CupboardCheckSheet items={cupboardToCheck} allItems={currentWeekItems} onAnswer={handleCupboardAnswer} onClose={() => setShowCupboardCheck(false)} />
      )}
      {showAisleOrder && (
        <AisleOrderSheet order={aisleOrder} onSave={handleSaveAisleOrder} onClose={() => setShowAisleOrder(false)} />
      )}
      {showDone && (
        <DoneShoppingSheet
          bought={checkedCount}
          total={totalCount}
          notBought={toBuyRows}
          took={shopTook()}
          nextWeekLabel={followingListPhrase}
          onChoose={finishShopping}
          onClose={() => setShowDone(false)}
        />
      )}
      {toast && <ShopToast toast={toast} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative overflow-hidden">
      {toast && <ShopToast toast={toast} onClose={() => setToast(null)} />}

      {/* Header: ‹ week › like Planning; share, layout and Go shopping on the right */}
      <header className="bg-white border-b border-zinc-200/80 px-2 sm:px-5 py-1.5 shrink-0 relative z-40">
        <div className="max-w-[900px] mx-auto w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 min-w-0">
            <button
              type="button"
              onClick={() => prevPlan && setSelectedPlanId(prevPlan.id)}
              disabled={!prevPlan}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
              aria-label="Previous week"
              data-shop-week-prev
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 px-0.5 text-center" data-shop-week>
              <div className="text-[15px] font-bold text-zinc-900 whitespace-nowrap leading-tight" data-shop-week-name>{weekName(activePlan?.startDate) || 'Shopping'}</div>
              {activePlan && (
                <div className="text-xs text-zinc-500 whitespace-nowrap leading-tight" data-shop-week-status>
                  {formatWeekSpan(activePlan.startDate)} · {isPlanFinalized ? <span className="text-emerald-700 font-semibold">Sent</span> : 'Not sent yet'}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => nextPlan && setSelectedPlanId(nextPlan.id)}
              disabled={!nextPlan}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
              aria-label="Next week"
              data-shop-week-next
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shareList}
              disabled={toBuyRows.length === 0}
              className="w-9 h-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
              aria-label="Share the list"
              title="Share or copy the list"
              data-share-list
            >
              <Share2 className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                id="btn-shop-view-options"
                onClick={() => setShowViewOptions(!showViewOptions)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer ${
                  showViewOptions ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600'
                }`}
                title="List options"
                aria-label="View options"
              >
                <Eye className="w-4 h-4" />
              </button>
              {showViewOptions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowViewOptions(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-zinc-200 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-1 pb-1.5">Show the list</span>
                    {([
                      ['food_type', 'view-option-foodtype', 'By aisle', Store],
                      ['sections', 'view-option-sections', "By where it's from", Layers],
                      ['all', 'view-option-all', 'A–Z', ShoppingBag],
                    ] as const).map(([mode, id, label, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        id={id}
                        onClick={() => { setViewMode(mode); setShowViewOptions(false); }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-sm cursor-pointer ${viewMode === mode ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                      >
                        <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-zinc-500" />{label}</span>
                        {viewMode === mode && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    ))}
                    <div className="border-t border-zinc-100 mt-1.5 pt-1.5">
                      <button
                        type="button"
                        id="btn-arrange-aisles"
                        onClick={() => { setShowViewOptions(false); setShowAisleOrder(true); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        <ListOrdered className="w-4 h-4 text-zinc-500" /> Arrange aisles…
                      </button>
                      <button
                        type="button"
                        id="btn-weekly-staples"
                        onClick={() => { setShowViewOptions(false); setShowEditStaplesModal(true); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 text-zinc-500" /> Weekly staples…
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              id="btn-go-shopping"
              onClick={startShopping}
              className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              title="Go shopping: full screen, tick as you go"
              aria-label="Go Shopping"
            >
              <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
              <span className="sm:hidden">Shop</span>
              <span className="hidden sm:inline">Go shopping</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-36" data-shop-scroll>
        <div className="max-w-[900px] mx-auto w-full p-3 md:p-5 space-y-3">
          {/* How much is bought (the same count as shopping mode) */}
          {totalCount > 0 && (
            <div className="flex items-center gap-3 px-1" data-shop-progress>
              <div className="flex-1 h-2 rounded-full bg-zinc-200 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${percentDone}%` }} />
              </div>
              <span className="text-sm text-zinc-600 tabular-nums whitespace-nowrap">
                <span className="font-semibold text-zinc-900">{checkedCount}</span> of {totalCount} bought
              </span>
            </div>
          )}

          {activePlan && (
            <QuickAdd suggestions={quickAddSuggestions} onTheList={onTheList} onAdd={handleQuickAdd} onBrowse={() => setShowCatalogModal(true)} />
          )}

          {/* Meals not sent to the list yet */}
          {!isPlanFinalized && activePlan && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-amber-900" data-shop-unsent>
              <div className="flex items-center gap-2 min-w-0">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm">
                  {Object.values(activePlan.days).some((day: any) => day.meals && day.meals.length > 0)
                    ? "This week's meals aren't on the list yet"
                    : 'No meals planned for this week yet'}
                </span>
              </div>
              {onNavigateTab && (
                <button type="button" onClick={() => onNavigateTab('planning', activePlan.id)} className="text-sm font-semibold text-amber-900 underline shrink-0 cursor-pointer">
                  Planning →
                </button>
              )}
            </div>
          )}

          {/* The week changed on Planning after it was sent: one tap brings the list up to date */}
          {activePlan && isPlanFinalized && changedDaysSinceList(activePlan).length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3" data-shop-out-of-date>
              <div className="flex items-start gap-2.5 min-w-0">
                <RefreshCw className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950">The meal plan has changed</p>
                  <p className="text-xs text-amber-900/80">{changedDaysSinceList(activePlan).join(', ')} changed since this list was made.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => sendWeekToShoppingList(store, activePlan)}
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-2 rounded-xl cursor-pointer"
                data-shop-update-list
              >
                Update list
              </button>
            </div>
          )}

          {/* Cupboard check: before you go, take off what you've already got */}
          {cupboardToCheck.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <PackageCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950">Check the cupboard</p>
                  <p className="text-xs text-amber-900/80">
                    {cupboardToCheck.length} {cupboardToCheck.length === 1 ? 'item' : 'items'} you may already have, like {formatListWithAnd(Array.from(new Set<string>(cupboardToCheck.map((i: ShoppingListItem) => i.name))).slice(0, 3))}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-cupboard-check"
                onClick={() => setShowCupboardCheck(true)}
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-2 rounded-xl cursor-pointer"
              >
                Check now
              </button>
            </div>
          )}

          {currentWeekItems.length === 0 ? (
            <div className="text-center text-zinc-500 p-7 bg-white rounded-xl border border-zinc-200" data-shop-empty>
              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-2 text-zinc-500">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-zinc-800 text-sm mb-1">Nothing on the list for {activePlan ? formatWeekSpan(activePlan.startDate) : 'this week'}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed mb-4 max-w-sm mx-auto">
                Send the week's meals from Planning, or add things above.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('planning', activePlan?.id)}
                    className="inline-flex items-center gap-1.5 bg-zinc-900 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" /> Plan the meals
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="inline-flex items-center gap-1.5 bg-white border border-zinc-200 text-zinc-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" /> Add a recipe's ingredients
                </button>
              </div>
            </div>
          ) : (
            <>
              {toBuyRows.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-center" data-all-bought>
                  <p className="text-base font-semibold text-emerald-950">Everything's bought</p>
                  <p className="text-sm text-emerald-900/80">Add anything else above, or look at another week.</p>
                </div>
              )}

              {listGroups.map(group => (
                <section key={group.id} className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden" data-group={group.id}>
                  <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-zinc-50/80 border-b border-zinc-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">{group.title}</h3>
                    <span className="flex items-center gap-2">
                      {group.id === 'recurring' && (
                        <button type="button" onClick={() => setShowEditStaplesModal(true)} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer">Change</button>
                      )}
                      <span className="text-xs text-zinc-500 tabular-nums">{group.rows.length}</span>
                    </span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {group.rows.map(row => (
                      <ShopRow key={row.key} row={row} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} />
                    ))}
                  </div>
                </section>
              ))}

              {/* Bought: out of the way at the end, one tap to look */}
              {boughtRows.length > 0 && (
                <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden" data-bought>
                  <button
                    type="button"
                    onClick={() => setShowBought(v => !v)}
                    className="w-full flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50 text-left"
                    aria-expanded={showBought}
                    data-bought-toggle
                  >
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showBought ? 'rotate-180' : ''}`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Bought</span>
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums">{boughtRows.length}</span>
                  </button>
                  {showBought && (
                    <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                      {boughtRows.map(row => (
                        <ShopRow key={row.key} row={row} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Items you said you already have: off the list, one tap to put back */}
              {inCupboardItems.length > 0 && (
                <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowInCupboard(v => !v)}
                    className="w-full flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50 text-left"
                    aria-expanded={showInCupboard}
                  >
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showInCupboard ? 'rotate-180' : ''}`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Already in the cupboard</span>
                    </span>
                    <span className="text-xs text-zinc-500">{inCupboardItems.length} · not on the list</span>
                  </button>
                  {showInCupboard && (
                    <ul className="border-t border-zinc-100 divide-y divide-zinc-100">
                      {inCupboardItems.map((item: ShoppingListItem) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                          <span className="text-sm text-zinc-600 min-w-0 truncate">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => handleCupboardAnswer([item.id], 'need')}
                            className="shrink-0 text-sm font-semibold text-indigo-700 hover:text-indigo-900 px-2 py-1 rounded-lg hover:bg-indigo-50 cursor-pointer"
                          >
                            Need it after all
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {activeWeekDismissedCount > 0 && (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={handleRestoreDismissed}
                    className="text-xs text-zinc-500 hover:text-zinc-700 inline-flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Bring back meal ingredients you removed</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {openRow && (
        <ItemSheet
          key={openRowId || openRow.key}
          row={openRow}
          aisle={aisleOf(openRow)}
          aisles={orderedAisles(aisleOrder)}
          partDetail={partDetail}
          isFavourite={favourites.some(f => f.name.toLowerCase() === openRow.name.toLowerCase())}
          nextWeekLabel={followingShort}
          onStep={(id, dir) => handleUpdateQuantity(id, dir)}
          onSetAmount={handleUpdateQtyAndUnit}
          onSaveNote={note => updateParts(openRow.underlyingIds, i => { const { note: _old, ...rest } = i; return note ? { ...rest, note } : rest; })}
          onRename={name => updateParts(openRow.underlyingIds, i => { const { groceryId: _g, ...rest } = i; return { ...rest, name }; })}
          onAisle={a => setRowAisle(openRow, a)}
          onFavourite={() => toggleFavourite(openRow.name, GROCERY_AISLES[aisleOf(openRow)].name)}
          onMove={() => {
            const res = carryToFollowingWeek(openRow.underlyingIds);
            setOpenRowId(null);
            if (res) setToastMessage(`${openRow.name}: moved to ${followingShort}`);
          }}
          onRemove={() => removeRowParts(openRow)}
          onManageStaples={() => { setOpenRowId(null); setShowEditStaplesModal(true); }}
          onClose={() => setOpenRowId(null)}
        />
      )}

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
        onTheList={onTheList}
        onAddRecipe={() => { setShowCatalogModal(false); setShowBatchModal(true); }}
      />

      {showEditStaplesModal && (
        <EditRecurringStaplesModal
          store={store}
          onClose={() => setShowEditStaplesModal(false)}
        />
      )}

      {showCupboardCheck && (
        <CupboardCheckSheet items={cupboardToCheck} allItems={currentWeekItems} onAnswer={handleCupboardAnswer} onClose={() => setShowCupboardCheck(false)} />
      )}

      {showAisleOrder && (
        <AisleOrderSheet order={aisleOrder} onSave={handleSaveAisleOrder} onClose={() => setShowAisleOrder(false)} />
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

/** Message at the top of the Shop tab, sometimes with a button (Undo, Edit). */
function ShopToast({ toast, onClose }: { toast: { message: string; action?: { label: string; run: () => void } }; onClose: () => void }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] bg-zinc-900 text-white text-sm font-medium pl-4 pr-2 py-2 rounded-xl shadow-lg flex items-center gap-3 max-w-[92vw] animate-in fade-in slide-in-from-top-2" role="status" data-shop-toast>
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="min-w-0">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          onClick={() => { const run = toast.action!.run; onClose(); run(); }}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-semibold cursor-pointer"
          data-toast-action
        >
          {toast.action.label}
        </button>
      ) : <span className="w-1" />}
    </div>
  );
}

function BelowThresholdWarningModal({ data, onClose, onKeepRequired, onConfirmReduce }: { data: any, onClose: () => void, onKeepRequired: () => void, onConfirmReduce: (amount: number) => void }) {
  const need = shopQuantityText({ amount: data.requirement?.requiredAmount ?? 0, unit: data.item?.unit });
  const recipes: string[] = data.requirement?.recipes || [];
  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" data-below-needed>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-semibold text-lg mb-2 text-zinc-900">Less than your meals need</h3>
        <p className="text-zinc-700 text-sm">
          {recipes.length ? `${formatListWithAnd(recipes)} need${recipes.length === 1 ? 's' : ''}` : 'Your meals need'} {need} of {data.item?.name}.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={onKeepRequired} className="w-full px-4 py-3 font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl">Keep {need}</button>
          <button onClick={() => onConfirmReduce(data.targetAmount)} className="w-full px-4 py-3 font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl">{data.isRemoval ? 'Remove it anyway' : 'Use less anyway'}</button>
          <button onClick={onClose} className="w-full px-4 py-2 font-medium text-zinc-500 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
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
  compactRows: boolean;
  onCompactRows: (val: boolean) => void;
  aisleOrder?: string[];
  onArrangeAisles: () => void;
  cupboardToCheckCount: number;
  onCupboardCheck: () => void;
  /** "Done shopping": what to do with anything you didn't get. */
  onDone: () => void;
  /** The add box, for something you forgot. */
  quickAdd?: React.ReactNode;
}

/** Keep the phone's screen on while shopping (where the browser allows it). */
function useScreenAwake() {
  useEffect(() => {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.wakeLock?.request) return;
    let lock: any = null;
    let stopped = false;
    const grab = async () => {
      try {
        if (document.visibilityState !== 'visible' || stopped) return;
        lock = await nav.wakeLock.request('screen');
      } catch { /* not allowed here: the screen just sleeps as usual */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void grab(); };
    void grab();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock?.release?.(); } catch { /* ignore */ }
    };
  }, []);
}

function ShoppingModeView({
  items,
  activePlan,
  onToggle: parentOnToggle,
  onExit,
  onUncheckAll,
  dropCompletedToBottom,
  onToggleDropCompleted,
  onEditStaples,
  compactRows,
  onCompactRows,
  aisleOrder,
  onArrangeAisles,
  cupboardToCheckCount,
  onCupboardCheck,
  onDone,
  quickAdd,
}: ShoppingModeViewProps) {
  useScreenAwake();
  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayStr = formatDateISO(getNextMonday(new Date()));
  const [filter, setFilter] = useState<'all' | 'to_buy' | 'bought'>('all');
  const [viewMode, setViewMode] = useState<'sections' | 'food_type' | 'all'>('food_type');
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    planned: false,
    batch: false,
    adhoc: false,
    recurring: false
  });

  const toggleAisle = (aisle: string) => {
    setCollapsedAisles(prev => ({ ...prev, [aisle]: !prev[aisle] }));
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // One row per product, exactly as on the Shop list (so the counts match).
  const aggregatedItems = useMemo(() => aggregateShoppingItems(items), [items]);

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

    const pos = aislePositions(aisleOrder);
    return Array.from(map.entries())
      .map(([aisle, list]) => ({
        aisle,
        info: GROCERY_AISLES[aisle],
        items: list
      }))
      .sort((a, b) => pos[a.aisle] - pos[b.aisle]);
  }, [filteredItems, aisleOrder]);

  // Compact: one line per item with dividers; detailed: cards with recipe names.
  const rowsClass = compactRows ? 'divide-y divide-zinc-100' : 'space-y-2';

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
              {activePlan ? (activePlan.startDate === currentMondayStr ? 'This week' : activePlan.startDate === nextMondayStr ? 'Next week' : formatWeekSpan(activePlan.startDate)) : 'This week'}
            </h2>

            {/* Middle: Filters */}
            <div className="flex items-center gap-0.5 bg-zinc-100 p-0.5 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === 'all' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('to_buy')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === 'to_buy' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                To Buy ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('bought')}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
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
                className={`h-7 px-2 sm:h-8 sm:px-2.5 rounded-lg sm:rounded-xl border flex items-center gap-1 transition-all cursor-pointer shadow-2xs text-[11px] sm:text-xs font-bold ${
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
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
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
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 font-bold">
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
                      <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer text-xs font-semibold text-zinc-700 select-none">
                        <input
                          type="checkbox"
                          id="toggle-compact-rows"
                          checked={compactRows}
                          onChange={(e) => onCompactRows(e.target.checked)}
                          className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Compact rows</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowViewOptions(false);
                          onArrangeAisles();
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer text-xs font-semibold text-zinc-700"
                      >
                        <ListOrdered className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Arrange aisles…</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Simplified Shopping List Area */}
      <div className={`flex-1 overflow-y-auto ${compactRows ? 'p-2.5 sm:p-5' : 'p-4 sm:p-6'} pb-6 max-w-2xl mx-auto w-full ${compactRows ? 'space-y-2.5' : 'space-y-4'}`}>
        {cupboardToCheckCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-sm text-amber-950">
              <PackageCheck className="w-4 h-4 inline -mt-0.5 mr-1.5 text-amber-700" />
              {cupboardToCheckCount} cupboard {cupboardToCheckCount === 1 ? 'item' : 'items'} to check
            </span>
            <button
              type="button"
              onClick={onCupboardCheck}
              className="shrink-0 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg cursor-pointer"
            >
              Check now
            </button>
          </div>
        )}
        {/* 100% Completion Celebration Card */}
        {totalCount > 0 && checkedCount === totalCount && (
          <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-5 text-center space-y-2 animate-in fade-in shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>
            <h3 className="text-lg font-bold text-emerald-950">Shop 100% complete!</h3>
            <p className="text-sm text-emerald-800 max-w-xs mx-auto">
              All {totalCount} items on your list have been ticked.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={onDone}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Done shopping
              </button>
              <button
                type="button"
                onClick={onUncheckAll}
                className="px-3 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                Untick all
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
              compact={compactRows}
              renderItem={(item) => (
                <ShoppingModeItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggle}
                  compact={compactRows}
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
                      <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                        Added by you
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {adhocModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className={`${rowsClass} pt-1`}>
                      {arrangeListItems(adhocModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
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
                      <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400 truncate max-w-[130px] sm:max-w-none">
                        Weekly staples
                      </span>
                    </button>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditStaples();
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer shrink-0"
                        title="Manage Staples"
                      >
                        <Sliders className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                        <span>Manage</span>
                      </button>

                      <span className="text-[11px] font-semibold text-zinc-400 shrink-0">
                        {recurringModeItems.filter(i => !i.checked).length} left
                      </span>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className={`${rowsClass} pt-1`}>
                      {arrangeListItems(recurringModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
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
                      <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                        For your meals
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {plannedModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className={`${rowsClass} pt-1`}>
                      {arrangeListItems(plannedModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
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
                      <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                        Extra recipes
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {batchModeItems.filter(i => !i.checked).length} left
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className={`${rowsClass} pt-1`}>
                      {arrangeListItems(batchModeItems).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
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
                <div className={rowsClass}>
                  {arrangeListItems(filteredItems).map(item => (
                    <ShoppingModeItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      compact={compactRows}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {filteredItems.filter(i => !i.checked).length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      To Buy ({filteredItems.filter(i => !i.checked).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter(i => !i.checked)).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredItems.filter(i => i.checked).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      Checked Off ({filteredItems.filter(i => i.checked).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter(i => i.checked)).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          compact={compactRows}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {quickAdd && totalCount > 0 && <div className="pt-1" data-shopping-quick-add>{quickAdd}</div>}
      </div>

      {/* Always in reach: finish the shop */}
      {totalCount > 0 && (
        <div className="shrink-0 bg-white border-t border-zinc-200 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <span className="text-sm text-zinc-600 tabular-nums">{pendingCount} left</span>
            <button
              type="button"
              onClick={onDone}
              className={`ml-auto px-5 py-2.5 rounded-xl text-[15px] font-semibold cursor-pointer ${
                pendingCount === 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'
              }`}
              data-done-shopping
            >
              Done shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ShoppingModeItemRowProps {
  key?: React.Key;
  item: AggregatedShoppingListItem;
  onToggle: (id: string) => void;
  compact?: boolean;
}

function ShoppingModeItemRow({
  item,
  onToggle,
  compact = false
}: ShoppingModeItemRowProps) {
  if (compact) {
    // One line: tick, name, amount. Big enough to tap with a basket in the other hand.
    return (
      <div
        onClick={() => onToggle(item.id)}
        className={`flex items-center gap-3 px-1.5 min-h-[48px] py-1.5 cursor-pointer select-none transition-colors ${item.checked ? 'opacity-50' : 'active:bg-zinc-50'}`}
        data-row="compact"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            item.checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'
          }`}
          aria-label={item.checked ? `Mark ${item.name} as unbought` : `Mark ${item.name} as bought`}
        >
          {item.checked && <Check className="w-4 h-4 stroke-[3]" />}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={`text-base font-semibold truncate ${item.checked ? 'line-through text-zinc-400 font-medium' : 'text-zinc-900'}`}>
            {item.name}
          </span>
          {item.checkCupboard && !item.checked && (
            <span className="shrink-0 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-px" title="Store-cupboard item: check you have it">
              cupboard
            </span>
          )}
          {item.needsCheck && !item.checked && (
            <span className="shrink-0 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-px" title={item.quantityNote}>
              check
            </span>
          )}
          {item.note && (
            <span className="min-w-0 truncate text-xs text-amber-800 inline-flex items-center gap-0.5" data-row-note>
              <StickyNote className="w-3 h-3 shrink-0" />{item.note}
            </span>
          )}
        </div>
        <span className={`shrink-0 text-base font-bold tabular-nums ${item.checked ? 'text-zinc-400' : 'text-emerald-700'}`}>
          {shopQuantityText(item)}
        </span>
      </div>
    );
  }

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
            {shopQuantityText(item)}
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
        {item.note && (
          <p className="text-sm mt-1 text-amber-800 flex items-center gap-1" data-row-note><StickyNote className="w-3.5 h-3.5 shrink-0" />{item.note}</p>
        )}
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

/**
 * Cupboard check: one pass over the store-cupboard items (oil, spices, rice, stock...)
 * before you go. "Have it" takes an item off this week's list; "Need it" keeps it.
 * The list is fixed when the sheet opens, so answered rows stay put and can be changed.
 */
function CupboardCheckSheet({
  items,
  allItems,
  onAnswer,
  onClose
}: {
  items: ShoppingListItem[];
  allItems: ShoppingListItem[];
  onAnswer: (ids: string[], answer: 'have' | 'need' | null) => void;
  onClose: () => void;
}) {
  // Same product = one question, even if two recipes need it.
  const [groups] = useState(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const product = matchProduct(getCatalog(), item.name, { groceryId: item.groceryId });
      const key = product ? `p:${product.id}` : `n:${groupingKey(item.name)}`;
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({ key, ids: list.map(i => i.id), first: list[0], list }));
  });
  const answerOf = (ids: string[]): 'have' | 'need' | undefined => {
    const live = allItems.filter(i => ids.includes(i.id));
    if (live.length && live.every(i => i.cupboard === 'have')) return 'have';
    if (live.length && live.every(i => i.cupboard === 'need')) return 'need';
    return undefined;
  };
  const answered = groups.filter(g => answerOf(g.ids)).length;
  const haveCount = groups.filter(g => answerOf(g.ids) === 'have').length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Cupboard check"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Cupboard check</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Tap <strong className="font-semibold text-zinc-700">Have it</strong> for anything already in the cupboard. It comes off this week's list.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="overflow-y-auto divide-y divide-zinc-100 px-2">
          {groups.map(g => {
            const answer = answerOf(g.ids);
            const agg = aggregateIngredients(g.list);
            const amount = agg.displayQuantity || shopQuantityText({ ...(g.first as any), amount: agg.amount, unit: agg.unit, underlyingIds: g.ids, description: '' });
            const forRecipes = Array.from(new Set(g.list.flatMap(i => i.recipeNames || [])));
            return (
              <li key={g.key} className="flex items-center gap-3 px-3 py-3" data-cupboard-row={g.first.name}>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-semibold truncate ${answer === 'have' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{g.first.name}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {amount}{forRecipes.length ? ` · for ${forRecipes.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0" role="group" aria-label={`${g.first.name}: have it or need it`}>
                  <button
                    type="button"
                    onClick={() => onAnswer(g.ids, answer === 'have' ? null : 'have')}
                    aria-pressed={answer === 'have'}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      answer === 'have' ? 'bg-zinc-800 border-zinc-800 text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    Have it
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(g.ids, answer === 'need' ? null : 'need')}
                    aria-pressed={answer === 'need'}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      answer === 'need' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    Need it
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-500 tabular-nums">
            {answered} of {groups.length} checked{haveCount ? ` · ${haveCount} off the list` : ''}
          </span>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Put the aisles in the order you walk your supermarket. Shared with the other phone. */
function AisleOrderSheet({
  order,
  onSave,
  onClose
}: {
  order?: string[];
  onSave: (order: string[] | null) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<FoodAisle[]>(() => orderedAisles(order));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    setList(next);
  };
  const usual = orderedAisles(null);
  const isUsual = list.every((id, i) => id === usual[i]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Arrange aisles"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Arrange aisles</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Put them in the order you walk round your usual shop. The list and shopping mode follow this order on both phones.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ol className="overflow-y-auto divide-y divide-zinc-100 px-2">
          {list.map((id, i) => {
            const info = GROCERY_AISLES[id];
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5" data-aisle={id}>
                <span className="w-6 text-sm font-semibold text-zinc-400 tabular-nums text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{info.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{info.description}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="w-10 h-10 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label={`Move ${info.name} earlier`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    className="w-10 h-10 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label={`Move ${info.name} later`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setList(usual)}
            disabled={isUsual}
            className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            Usual order
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onSave(isUsual ? null : list); onClose(); }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
            >
              Save order
            </button>
          </div>
        </div>
      </div>
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
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-base text-zinc-900">Weekly staples</h3>
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
                      <span className="text-xs font-semibold text-zinc-800">{suggestion.name}</span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
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
                        <span className={`text-[11px] font-medium px-1.5 py-0.2 rounded border ${aisleInfo.colorClass}`}>
                          {aisleInfo.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
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
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                        <span className="text-[11px] font-bold text-zinc-800 w-10 text-center select-none">
                          {item.amount}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateStapleQuantity(item.id, 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white transition-all cursor-pointer"
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
        <div className="px-5 py-4 border-t border-zinc-200 flex justify-end bg-zinc-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Item Name</label>
                <input
                  type="text"
                  disabled
                  value={editingStapleName}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-500 cursor-not-allowed outline-none shadow-3xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Quantity</label>
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
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Unit (override)</label>
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
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Aisle Category</label>
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
