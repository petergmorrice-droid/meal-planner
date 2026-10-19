import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Notice from './Notice';
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
  PackagePlus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Share2,
  StickyNote,
  Trophy,
  WifiOff,
  Undo2,
  PartyPopper,
} from 'lucide-react';
import { ShoppingListItem, Recipe, MealPlan, DayPlan, ShopRoute, ShopRecord, RecurringItem } from '../types';
import { useJustTicked } from '../hooks/useJustTicked';
import { aggregateIngredients } from '../utils/aggregation';
import { matchProduct, groupingKey, canonicalUnit, formatUnit, largeUnitQuantity, formatAmount as formatShopAmount, unitInfo, formatCookingAmount } from '../shopping';
import ShopAisleGroup from './ShopAisleGroup';
import CatalogDrawer from './CatalogDrawer';
import ShopRow from './shop/ShopRow';
import ItemSheet from './shop/ItemSheet';
import QuickAdd from './shop/QuickAdd';
import DoneShoppingSheet, { DoneChoice } from './shop/DoneShoppingSheet';
import {
  AggregatedShoppingListItem, aggregateShoppingItems, shopQuantityText, partLabel, defaultShopWeek, formatWeekSpan, weekStartShort,
  parseQuickAdd, quickAddLine, listAsText, carryItemsToWeek, shopDurationText, productKey,
  learnRoute, routeAisleOrder, sortByRoute, addShopRecord, shopStats, milestoneCrossed, BIG_SHOP, notYetProducts,
  stapleQuantity, stapleTakesOver,
} from '../shopList';
import ShopHistorySheet from './shop/ShopHistorySheet';
import SaveProductSheet, { NewProductDetails } from './shop/SaveProductSheet';
import { preferredWeekStart } from '../planning';
import { matchProductDetailed, catalogForState, aisleCategory, productMatchesSearch } from '../shopping';
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
  parseQtyAndUnit,
  syncRecurringStaplesForPlan,
  syncRecurringStaplesForAllPlans
} from '../utils';

interface ShopTabProps {
  store: any;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings', planId?: string) => void;
  /** Open on this week (e.g. "See the list" after sending a week from Planning). */
  openPlanId?: string | null;
  onOpenPlanHandled?: () => void;
  /** Open one of the Shop's panels straight away (from Settings → Shopping). */
  openPanel?: 'aisles' | 'staples' | 'history' | null;
  onOpenPanelHandled?: () => void;
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
  /** What the meals actually use, when less than you buy ("100 g"). */
  neededText?: string;
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

// Shopping mode survives the phone locking or the app closing mid-shop (for a few hours).
const OPEN_SHOP_KEY = 'shop_mode_open';
const OPEN_SHOP_MS = 6 * 3600_000;
export function readOpenShop(): { planId: string; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_SHOP_KEY) || 'null');
    if (v && typeof v.planId === 'string' && typeof v.at === 'number' && Date.now() - v.at < OPEN_SHOP_MS) return v;
  } catch { /* nothing saved */ }
  return null;
}
const saveOpenShop = (planId: string | null) => {
  try {
    if (planId) localStorage.setItem(OPEN_SHOP_KEY, JSON.stringify({ planId, at: Date.now() }));
    else localStorage.removeItem(OPEN_SHOP_KEY);
  } catch { /* per-phone convenience only */ }
};

export function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export default function ShopTab({ store, onNavigateTab, openPlanId, onOpenPlanHandled, openPanel, onOpenPanelHandled }: ShopTabProps) {
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
  const [isShoppingMode, setIsShoppingModeState] = useState<boolean>(() => {
    const open = readOpenShop();
    return !!open && (!openPlanId || openPlanId === open.planId) && (store.state.mealPlans || []).some((p: MealPlan) => p.id === open.planId);
  });
  const [showHistory, setShowHistory] = useState(false);

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
  /** Something added by hand that you're saving as a product. */
  // "Save it as a product for future shops?" (justAdded: opened by itself, straight after adding something new).
  const [saveAsProduct, setSaveAsProduct] = useState<{ name: string; amount?: number; unit?: string; category?: string; justAdded?: boolean; addedId?: string; addedQty?: string } | null>(null);
  // New things already asked about on this phone this time (so "Not now" isn't asked again straight away).
  const askedAboutRef = useRef<Set<string>>(new Set());
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
    const plans: MealPlan[] = store.state.mealPlans || [];
    if (openPlanId && plans.some(p => p.id === openPlanId)) return openPlanId;
    const open = readOpenShop();
    if (open && plans.some(p => p.id === open.planId)) return open.planId;
    return defaultWeekId();
  });
  useEffect(() => { if (openPlanId) onOpenPlanHandled?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // From Settings → Shopping: open that panel.
  useEffect(() => {
    if (!openPanel) return;
    if (openPanel === 'aisles') setShowAisleOrder(true);
    else if (openPanel === 'staples') setShowEditStaplesModal(true);
    else if (openPanel === 'history') setShowHistory(true);
    onOpenPanelHandled?.();
  }, [openPanel]); // eslint-disable-line react-hooks/exhaustive-deps

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
        neededText: target.neededText,
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
    const me = store.currentUser || 'P';
    const newList = (store.state.shoppingList || []).map((item: ShoppingListItem) => {
      if (ids.includes(item.id)) {
        const checked = forceState !== undefined ? forceState : !item.checked;
        const { checkedBy: _by, outOfStock: _out, ...rest } = item;
        // Who ticked it shows on the other phone; ticking something "out of stock" means it was there after all.
        return checked ? { ...rest, checked, checkedBy: me } : { ...rest, checked };
      }
      return item;
    });
    store.updateShoppingList(newList);
  };

  /** Out of stock at the shop: not ticked, and not counted against the % done. */
  const handleOutOfStock = (ids: string[], value: boolean) => {
    const idSet = new Set(ids);
    store.updateShoppingList((store.state.shoppingList || []).map((item: ShoppingListItem) => {
      if (!idSet.has(item.id)) return item;
      const { outOfStock: _out, checkedBy: _by, ...rest } = item;
      return value ? { ...rest, checked: false, outOfStock: true } : { ...rest };
    }));
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
          recipeNames: target.recipeNames,
          neededText: target.neededText,
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

  // Aisles in the order you walk your shop (shared between phones): the order you arranged, or
  // else the order learned from your shops.
  const shopRoute: ShopRoute | undefined = store.state.preferences?.shopRoute;
  const arrangedOrder: string[] | undefined = store.state.preferences?.aisleOrder;
  const aisleOrder: string[] | undefined = arrangedOrder?.length
    ? arrangedOrder
    : routeAisleOrder(shopRoute, orderedAisles(null)) || undefined;
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
  /** What the meals use for a meal line, worked out from the week as it is now. */
  const neededOf = useCallback(
    (part: ShoppingListItem) => (plannedRequirementsByName.size ? plannedRequirementsByName.get(part.name.toLowerCase().trim())?.neededText ?? '' : undefined),
    [plannedRequirementsByName],
  );
  const rows = useMemo(() => aggregateShoppingItems(buyingItems, neededOf), [buyingItems, neededOf]);

  // ---------- Things added by hand that aren't products yet: offer to save them ----------
  const declinedProducts = store.state.preferences?.notProducts;
  const newItems = useMemo(
    () => notYetProducts(currentWeekItems, declinedProducts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentWeekItems, declinedProducts, store.state.groceryDatabase],
  );
  const isNewItem = (name: string) => newItems.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const isStapleName = (name: string) => (store.state.preferences?.recurringItems || []).some((r: RecurringItem) => sameName(r.name, name));
  const isFavouriteName = (name: string) => favourites.some((f) => sameName(f.name, name));
  const saveNewProduct = (from: { name: string }, d: NewProductDetails) => {
    const id = `gdb-custom-${crypto.randomUUID()}`;
    const category = GROCERY_AISLES[d.aisle].name;
    const product = { id, name: d.name, unit: d.unit, increment: d.increment, category };
    if (store.saveProduct) store.saveProduct(product);
    else store.updateGroceryOverride?.(id, product);
    // This week's line(s) become that product too.
    const key = from.name.trim().toLowerCase();
    const now = store.getState?.() || store.state;
    let list: ShoppingListItem[] = (now.shoppingList || []).map((i: ShoppingListItem) => (i.isAdhoc && !i.groceryId && i.name.trim().toLowerCase() === key ? { ...i, name: d.name, groceryId: id, category } : i));
    const isThis = (n: string) => sameName(n, from.name) || sameName(n, d.name);
    const prefPatch: Record<string, unknown> = {};
    const also: string[] = [];
    // Weekly staple: on the list every week from now on; the line you just added becomes the staple's line.
    if (d.staple) {
      const recurring: RecurringItem[] = now.preferences?.recurringItems || [];
      if (!recurring.some((r) => isThis(r.name))) {
        const q = stapleQuantity(d.unit, d.increment, d.staple.packs);
        const rec: RecurringItem = { id: crypto.randomUUID(), name: d.name, amount: q.amount, unit: q.unit, category };
        const nextRecurring = [...recurring, rec];
        prefPatch.recurringItems = nextRecurring;
        list = stapleTakesOver(syncRecurringStaplesForAllPlans(now.mealPlans || [], list, nextRecurring, dismissedItemIds), rec.id, (i) => i.groceryId === id);
      }
      also.push('a weekly staple');
    }
    // Favourite: in your favourites, quick to add.
    if (d.favourite) {
      if (!favourites.some((f) => isThis(f.name))) {
        const nextFavs = [...favourites, { name: d.name, category }];
        try { localStorage.setItem('mealPlannerCustomFavouritesObj', JSON.stringify(nextFavs)); } catch { /* the synced copy is the one that matters */ }
        prefPatch.favouriteItems = nextFavs;
      }
      also.push('a favourite');
    }
    if (Object.keys(prefPatch).length) store.updatePreferences(prefPatch);
    store.updateShoppingList(list);
    setSaveAsProduct(null);
    setToastMessage(also.length ? `Saved ${d.name} (${category}). It's now ${also.join(' and ')} too.` : `Saved ${d.name}: next time it goes straight to ${category}`);
  };
  const declineNewProduct = (from: { name: string }) => {
    const key = from.name.trim().toLowerCase();
    const current = store.state.preferences?.notProducts || [];
    if (!current.includes(key)) store.updatePreferences({ notProducts: [...current, key] });
    setSaveAsProduct(null);
    setToastMessage(`OK, won't ask about ${from.name} again`);
  };
  /** "Not now": if it had just been added, say so (with Edit), like any other add. */
  const notNowNewProduct = () => {
    const s = saveAsProduct;
    setSaveAsProduct(null);
    if (s?.justAdded) {
      const qty = s.addedQty && s.addedQty !== '1' ? ` · ${s.addedQty}` : '';
      const addedId = s.addedId;
      setToastMessage(`Added ${s.name}${qty}`, addedId ? { label: 'Edit', run: () => setOpenRowId(addedId) } : undefined);
    }
  };
  const saveProductSheet = saveAsProduct && (
    <SaveProductSheet
      key={saveAsProduct.name}
      item={saveAsProduct}
      aisleOrder={aisleOrder}
      justAdded={!!saveAsProduct.justAdded}
      already={{ staple: isStapleName(saveAsProduct.name), favourite: isFavouriteName(saveAsProduct.name) }}
      onSave={(d) => saveNewProduct(saveAsProduct, d)}
      onDecline={() => declineNewProduct(saveAsProduct)}
      onClose={notNowNewProduct}
    />
  );
  const byName = (a: AggregatedShoppingListItem, b: AggregatedShoppingListItem) => a.name.localeCompare(b.name);
  // Just ticked: counts straight away, but stays in its place (crossed out, with Undo) for a few
  // seconds before moving down to Bought, so a mis-tap is easy to put right.
  const { justTicked, hold: holdTicked, release: releaseTicked } = useJustTicked();
  const stillToBuy = useMemo(() => rows.filter(r => !r.checked && !r.outOfStock).sort(byName), [rows]);
  const outRows = useMemo(() => rows.filter(r => r.outOfStock).sort(byName), [rows]);
  const toBuyRows = useMemo(() => rows.filter(r => (!r.checked && !r.outOfStock) || justTicked[r.key]).sort(byName), [rows, justTicked]);
  const boughtRows = useMemo(() => rows.filter(r => r.checked && !justTicked[r.key]).sort(byName), [rows, justTicked]);
  // Out of stock doesn't count against you (same as shopping mode).
  const totalCount = rows.length - outRows.length;
  const checkedCount = rows.filter(r => r.checked).length;
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
        .map(src => ({ id: src.id, title: src.title, rows: aggregateShoppingItems(buyingItems.filter(src.test), neededOf).filter(r => (!r.checked && !r.outOfStock) || justTicked[r.key]).sort(byName) }))
        .filter(g => g.rows.length > 0);
    }
    return orderedAisles(aisleOrder)
      .map(a => ({ id: a, title: GROCERY_AISLES[a].name, rows: toBuyRows.filter(r => aisleOf(r) === a) }))
      .filter(g => g.rows.length > 0);
  }, [viewMode, toBuyRows, buyingItems, aisleOrder, justTicked]);

  const openRow = openRowId ? rows.find(r => r.underlyingIds.includes(openRowId)) || null : null;

  const tickRow = (row: AggregatedShoppingListItem) => {
    handleToggleItem(row.underlyingIds, !row.checked);
    if (!row.checked) holdTicked(row.key); else releaseTicked(row.key);
  };

  /** How much of a product is waiting on this week's list ("4 pints"), for Add items and the add box. */
  const onTheList = (name: string): string | null => {
    const key = productKey({ name });
    const row = stillToBuy.find(r => r.key === key || r.name.toLowerCase() === name.toLowerCase());
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
  const carryToFollowingWeek = (ids: string[], removeFirst: string[] = []): { moved: string[]; alreadyThere: string[] } | null => {
    if (!activePlan || !followingStart || !canCarry || ids.length === 0) return null;
    const gone = new Set(removeFirst);
    let list: ShoppingListItem[] = (store.state.shoppingList || []).filter((i: ShoppingListItem) => !gone.has(i.id));
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
    const found = matchProductDetailed(catalogForState(store.getState?.() || store.state), row.name, { groceryId: row.parts[0]?.groceryId });
    let groceryId: string | undefined = found?.product.id;
    if (found && found.how !== 'partial') {
      store.updateGroceryOverride?.(found.product.id, { category });
    } else {
      groceryId = `gdb-custom-${crypto.randomUUID()}`;
      store.updateGroceryOverride?.(groceryId, {
        id: groceryId, name: row.name, category, unit: row.parts[0]?.unit || 'item', increment: 1,
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
      const n = Number(b.amount);
      const label = formatUnit(b.unit || '', n);
      const amount = n > 0 ? `: ${formatCookingAmount(n, b.unit)}${label ? ` ${label}` : ''}` : '';
      const t = `${b.recipeName} (${b.night.slice(0, 3)})${amount}`;
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

  /** Returns false when it opened the "Save it as a product?" question (so the add box lets go of the keyboard). */
  const handleQuickAdd = (text: string, asName?: string): boolean => {
    const parsed = parseQuickAdd(text);
    if (asName) parsed.name = asName;
    if (!parsed.name) return true;
    const line = quickAddLine(parsed);
    const [id] = addLines([line]);
    const key = productKey(line);
    const already = rows.some(r => r.key === key && !r.checked);
    const qty = shopQuantityText(line);
    // Something new (not a product yet, and you haven't said it isn't one)? Ask straight away
    // whether to save it for future shops. Once per item each time the app is opened; the
    // "Save for next time?" card at the top of the list keeps offering it until you answer.
    const nameKey = line.name.trim().toLowerCase();
    const asNew = { ...line, id: id || '', checked: false, isAdhoc: true, isBatch: false, isRecurring: false } as ShoppingListItem;
    if (id && !askedAboutRef.current.has(nameKey) && notYetProducts([asNew], declinedProducts).length > 0) {
      askedAboutRef.current.add(nameKey);
      setToast(null);
      setSaveAsProduct({ name: line.name, amount: line.amount, unit: line.unit, category: line.category, justAdded: true, addedId: id, addedQty: qty });
      return false;
    }
    setToastMessage(already ? `${line.name}: added ${qty} more` : `Added ${line.name}${qty === '1' ? '' : ` · ${qty}`}`, id ? { label: 'Edit', run: () => setOpenRowId(id) } : undefined);
    return true;
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
    catalogForState(store.state).products
      .filter((p: any) => !p.sameAs)
      .forEach((p: any) => push(p.name, p.category));
    (store.state.shoppingList || []).forEach((i: ShoppingListItem) => push(i.name, i.category));
    return out;
  }, [favourites, store.state.groceryDatabase, store.state.groceryOverrides, store.state.shoppingList]);

  // ---------- Sharing the list ----------
  const shareList = async () => {
    const title = `Shopping list · ${weekName(activePlan?.startDate)} (${formatWeekSpan(activePlan?.startDate || '')})`;
    const groups = orderedAisles(aisleOrder)
      .map(a => ({ name: GROCERY_AISLES[a].name, items: stillToBuy.filter(r => aisleOf(r) === a) }))
      .filter(g => g.items.length);
    const text = listAsText(title, groups);
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (nav?.share && touch) {
      try { await nav.share({ title, text }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    try {
      await nav.clipboard.writeText(text);
      setToastMessage(`List copied (${stillToBuy.length} ${stillToBuy.length === 1 ? 'item' : 'items'}): paste it anywhere`);
    } catch {
      setToastMessage("Couldn't copy the list on this device");
    }
  };

  // ---------- Shopping mode: timing and "Done shopping" ----------
  const startKey = activePlan ? `shop_started_${activePlan.id}` : '';
  const setIsShoppingMode = (open: boolean) => {
    saveOpenShop(open && activePlan ? activePlan.id : null);
    setIsShoppingModeState(open);
  };
  const startShopping = () => {
    try { if (startKey && !localStorage.getItem(startKey)) localStorage.setItem(startKey, String(Date.now())); } catch { /* timing is a nicety */ }
    setIsShoppingMode(true);
  };
  // While shopping, check for the other phone's ticks every few seconds.
  useEffect(() => {
    if (!isShoppingMode) return;
    store.setFastSync?.(true);
    return () => store.setFastSync?.(false);
  }, [isShoppingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // The order things are ticked in this shop (this phone), to learn your route.
  const routeKey = activePlan ? `shop_route_${activePlan.id}` : '';
  const recordTick = (key: string, aisle: string, ticked: boolean) => {
    if (!routeKey) return;
    try {
      const seq: { key: string; aisle: string }[] = JSON.parse(localStorage.getItem(routeKey) || '[]');
      const next = ticked ? (seq.some(t => t.key === key) ? seq : [...seq, { key, aisle }]) : seq.filter(t => t.key !== key);
      localStorage.setItem(routeKey, JSON.stringify(next));
    } catch { /* learning the route is a nicety */ }
  };
  const readTicks = (): { key: string; aisle: string }[] => {
    try { return JSON.parse(localStorage.getItem(routeKey) || '[]'); } catch { return []; }
  };
  const tookMinutes = (): number | null => {
    try {
      const t = Number(localStorage.getItem(startKey));
      const ms = t ? Date.now() - t : NaN;
      return shopDurationText(ms) ? Math.max(1, Math.round(ms / 60_000)) : null;
    } catch { return null; }
  };
  const history: ShopRecord[] = store.state.preferences?.shopHistory || [];
  const stats = shopStats(history);
  const shopTook = (): string | null => {
    try {
      const t = Number(localStorage.getItem(startKey));
      return t ? shopDurationText(Date.now() - t) : null;
    } catch { return null; }
  };

  /**
   * Finish the shop. Things not ticked: moved to the following week's list, left, or taken off.
   * Out-of-stock things stay on this list unless you ask for them next week too (you might not
   * need them by then).
   */
  const finishShopping = (choice: DoneChoice, outToNextWeek = false) => {
    const notBought = stillToBuy;
    const ids = notBought.flatMap(r => r.underlyingIds);
    const outIds = outRows.flatMap(r => r.underlyingIds);
    const took = shopTook();
    const minutes = tookMinutes();
    let extra = '';
    const toCarry = [...(choice === 'move' ? ids : []), ...(outToNextWeek ? outIds : [])];
    const toRemove = choice === 'remove' ? ids : [];
    if (toCarry.length) {
      const res = carryToFollowingWeek(toCarry, toRemove);
      if (res) extra = ` · ${res.moved.length + res.alreadyThere.length} moved to ${followingShort}`;
    } else if (toRemove.length) {
      const idSet = new Set(toRemove);
      store.updateShoppingList((store.state.shoppingList || []).filter((i: ShoppingListItem) => !idSet.has(i.id)));
    }
    if (choice === 'remove' && ids.length) extra += ` · ${notBought.length} taken off`;
    if (choice === 'keep' && ids.length) extra += ` · ${notBought.length} still to get`;

    // Remember the shop (shared): history, best time, and the route you took.
    const isBest = minutes !== null && checkedCount >= BIG_SHOP && (stats.best === null || minutes < stats.best);
    const record: ShopRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      weekStart: activePlan?.startDate || '',
      bought: checkedCount,
      total: totalCount,
      minutes,
      by: store.currentUser || 'P',
    };
    const learned = learnRoute(shopRoute, readTicks());
    store.updatePreferences?.({ shopHistory: addShopRecord(history, record), ...(learned && learned !== shopRoute ? { shopRoute: learned } : {}) });

    try { if (startKey) localStorage.removeItem(startKey); if (routeKey) localStorage.removeItem(routeKey); } catch { /* ignore */ }
    setShowDone(false);
    setIsShoppingMode(false);
    setShowBought(false);
    setToastMessage(`Shop done: ${checkedCount} bought${took ? ` in ${took}` : ''}${isBest && stats.timed ? ' · a new best!' : ''}${extra}`, { label: 'Past shops', run: () => setShowHistory(true) });
  };

  if (isShoppingMode) {
    return (
      <>
      <ShoppingModeView
        items={buyingItems}
        neededOf={neededOf}
        activePlan={activePlan}
        onToggle={handleToggleItem}
        onExit={() => setIsShoppingMode(false)}
        onDone={() => setShowDone(true)}
        onOutOfStock={handleOutOfStock}
        onTickRecorded={recordTick}
        route={shopRoute}
        currentUser={store.currentUser || 'P'}
        onShowHistory={() => setShowHistory(true)}
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
        <AisleOrderSheet order={aisleOrder} learnedFrom={!arrangedOrder?.length ? shopRoute?.shops || 0 : 0} onSave={handleSaveAisleOrder} onClose={() => setShowAisleOrder(false)} />
      )}
      {showDone && (
        <DoneShoppingSheet
          bought={checkedCount}
          total={totalCount}
          notBought={stillToBuy}
          outOfStock={outRows}
          took={shopTook()}
          minutes={tookMinutes()}
          best={stats.best}
          bigShop={checkedCount >= BIG_SHOP}
          nextWeekLabel={followingListPhrase}
          onChoose={finishShopping}
          onClose={() => setShowDone(false)}
        />
      )}
      {showHistory && <ShopHistorySheet history={history} onClose={() => setShowHistory(false)} />}
      {saveProductSheet}
      {toast && <ShopToast toast={toast} onClose={() => setToast(null)} shoppingMode />}
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
              disabled={stillToBuy.length === 0}
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
                      <button
                        type="button"
                        id="btn-shop-history"
                        onClick={() => { setShowViewOptions(false); setShowHistory(true); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        <Trophy className="w-4 h-4 text-zinc-500" /> Past shops…
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
          {newItems.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3" data-new-products>
              <div className="flex items-start gap-2.5">
                <PackagePlus className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-950">Save for next time?</p>
                  <p className="text-xs text-emerald-900/80">
                    {newItems.length === 1 ? "This isn't a saved product yet" : "These aren't saved products yet"}. Save {newItems.length === 1 ? 'it' : 'them'} and next time {newItems.length === 1 ? 'it goes' : 'they go'} straight into the right aisle.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {newItems.map((i) => (
                      <button key={i.id} type="button" onClick={() => setSaveAsProduct(i)} className="h-8 px-3 rounded-full bg-white border border-emerald-300 text-sm font-semibold text-emerald-900 cursor-pointer" data-save-product={i.name}>
                        {i.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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
              {stillToBuy.length === 0 && toBuyRows.length === 0 && (
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
                      <ShopRow key={row.key} row={row} justTicked={!!justTicked[row.key]} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} />
                    ))}
                  </div>
                </section>
              ))}

              {/* Out of stock at the shop: not counted, tap the circle if you get it after all */}
              {outRows.length > 0 && (
                <section className="bg-white rounded-xl border border-amber-200 overflow-hidden" data-group="out-of-stock">
                  <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-amber-50 border-b border-amber-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Out of stock</h3>
                    <span className="text-xs text-amber-800 tabular-nums">{outRows.length}</span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {outRows.map(row => (
                      <ShopRow key={row.key} row={row} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} />
                    ))}
                  </div>
                </section>
              )}

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
                        <ShopRow key={row.key} row={row} justTicked={!!justTicked[row.key]} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} />
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
          onBackInStock={() => handleOutOfStock(openRow.underlyingIds, false)}
          onSaveAsProduct={isNewItem(openRow.name) ? () => { const part = openRow.parts.find((p) => p.isAdhoc && !p.groceryId) || openRow.parts[0]; setOpenRowId(null); setSaveAsProduct(part); } : undefined}
          onClose={() => setOpenRowId(null)}
        />
      )}
      {saveProductSheet}

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
        <AisleOrderSheet order={aisleOrder} learnedFrom={!arrangedOrder?.length ? shopRoute?.shops || 0 : 0} onSave={handleSaveAisleOrder} onClose={() => setShowAisleOrder(false)} />
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

      {showHistory && <ShopHistorySheet history={history} onClose={() => setShowHistory(false)} />}

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

/** The Shop's short message (Undo, Edit…): the app's light notice, above shopping mode's bottom bar when that's open. */
function ShopToast({ toast, onClose, shoppingMode = false }: { toast: { message: string; action?: { label: string; run: () => void } }; onClose: () => void; shoppingMode?: boolean }) {
  return <Notice text={toast.message} action={toast.action} onDone={onClose} shop placement={shoppingMode ? 'screen' : 'tab'} lift={shoppingMode ? 84 : 12} />;
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
  /** What the meals use for a meal line (see aggregateShoppingItems). */
  neededOf?: (part: ShoppingListItem) => string | undefined;
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
  /** Mark (or clear) "out of stock" on these lines. */
  onOutOfStock: (ids: string[], value: boolean) => void;
  /** Remember the order things are ticked in (to learn your route round the shop). */
  onTickRecorded: (key: string, aisle: string, ticked: boolean) => void;
  /** The order you usually pick things up, learned from past shops. */
  route?: ShopRoute;
  /** Who is using this phone ('P' or 'R'). */
  currentUser: string;
  onShowHistory: () => void;
}

const personName = (id?: string) => (id === 'R' ? 'Rachel' : id === 'P' ? 'Peter' : '');

/** Is the phone online? (Ticks are kept on the phone either way.) */
function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

/** A little buzz on phones that can (Android); nothing elsewhere. */
const buzz = (pattern: number | number[]) => {
  try { (navigator as any).vibrate?.(pattern); } catch { /* not supported */ }
};

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
  neededOf,
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
  onOutOfStock,
  onTickRecorded,
  route,
  currentUser,
  onShowHistory,
}: ShoppingModeViewProps) {
  useScreenAwake();
  const online = useOnline();
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
  const aggregatedItems = useMemo(() => aggregateShoppingItems(items, neededOf), [items, neededOf]);
  const weekTitle = activePlan ? (activePlan.startDate === currentMondayStr ? 'This week' : activePlan.startDate === nextMondayStr ? 'Next week' : formatWeekSpan(activePlan.startDate)) : 'This week';

  // Out of stock doesn't count against you: the % is of what the shop actually had.
  const countable = aggregatedItems.filter(i => !i.outOfStock);
  const totalCount = countable.length;
  const checkedCount = countable.filter(i => i.checked).length;
  const pendingCount = totalCount - checkedCount;
  const completionPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Just ticked: counts straight away, but stays put (crossed out, with Undo) for a few seconds.
  const { justTicked, hold, release } = useJustTicked();
  const isDone = (i: AggregatedShoppingListItem) => (i.checked && !justTicked[i.key]) || !!i.outOfStock;

  // The last thing you did, with Undo in the bottom bar until you do something else.
  const [lastAction, setLastAction] = useState<{ kind: 'tick' | 'out'; key: string; name: string; ids: string[] } | null>(null);

  // 25 / 50 / 75%: a moment in the header (and a buzz on Android); 100% gets the big one.
  const [milestone, setMilestone] = useState<string | null>(null);
  const lastPercent = useRef(completionPercent);
  useEffect(() => {
    const before = lastPercent.current;
    lastPercent.current = completionPercent;
    const msg = milestoneCrossed(before, completionPercent);
    if (msg) {
      setMilestone(msg);
      buzz(40);
    }
    if (before < 100 && completionPercent === 100 && totalCount > 0) buzz([60, 40, 60, 40, 120]);
  }, [completionPercent]);
  // The moment lasts a couple of seconds, however fast you keep ticking.
  useEffect(() => {
    if (!milestone) return;
    const t = setTimeout(() => setMilestone(null), 2500);
    return () => clearTimeout(t);
  }, [milestone]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === 'to_buy') return aggregatedItems.filter(i => !isDone(i));
    if (filter === 'bought') return aggregatedItems.filter(i => i.checked);
    return aggregatedItems;
  }, [aggregatedItems, filter, justTicked]);

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
    // In the order you usually pick things up (learned), else A–Z.
    const sorted = sortByRoute(itemList, route);
    if (dropCompletedToBottom) {
      return [
        ...sorted.filter(i => !isDone(i)),
        ...sorted.filter(i => isDone(i))
      ];
    }
    return sorted;
  };

  const onToggle = (itemId: string) => {
    const aggItem = aggregatedItems.find(i => i.id === itemId);
    if (!aggItem) return;
    // Out of stock but there after all: tapping it ticks it.
    const targetState = aggItem.outOfStock ? true : !aggItem.checked;
    parentOnToggle(aggItem.underlyingIds, targetState);
    onTickRecorded(aggItem.key, getGroceryAisle(aggItem as any), targetState);
    if (targetState) {
      hold(aggItem.key);
      setLastAction({ kind: 'tick', key: aggItem.key, name: aggItem.name, ids: aggItem.underlyingIds });
    } else {
      release(aggItem.key);
      setLastAction(a => (a?.key === aggItem.key ? null : a));
    }
  };

  /** Press and hold: out of stock (or back in stock). */
  const onHoldRow = (itemId: string) => {
    const aggItem = aggregatedItems.find(i => i.id === itemId);
    if (!aggItem) return;
    const value = !aggItem.outOfStock;
    onOutOfStock(aggItem.underlyingIds, value);
    release(aggItem.key);
    if (aggItem.checked) onTickRecorded(aggItem.key, getGroceryAisle(aggItem as any), false);
    buzz(30);
    setLastAction(value ? { kind: 'out', key: aggItem.key, name: aggItem.name, ids: aggItem.underlyingIds } : null);
  };

  const undoLast = () => {
    if (!lastAction) return;
    if (lastAction.kind === 'tick') {
      parentOnToggle(lastAction.ids, false);
      release(lastAction.key);
      onTickRecorded(lastAction.key, '', false);
    } else {
      onOutOfStock(lastAction.ids, false);
    }
    setLastAction(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Header: what's left and the % done (the game), with the list options and close */}
      <header className="shrink-0 sticky top-0 z-30 shadow-2xs">
        <div className="bg-emerald-600 text-white px-4 pt-3 pb-3 sm:px-6">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-100 shrink-0 stroke-[2.5]" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Shopping mode</span>
              </div>
              {milestone ? (
                <p className="text-sm text-white mt-0.5 font-bold animate-in fade-in zoom-in-95" data-milestone>{milestone}</p>
              ) : (
                <p className="text-xs text-emerald-100 mt-0.5 font-medium truncate" data-shop-mode-sub>
                  {weekTitle} · {checkedCount} of {totalCount} ticked
                </p>
              )}
            </div>
            <span className="shrink-0 text-lg font-black tracking-tight tabular-nums bg-white/20 px-2.5 py-0.5 rounded-xl text-white" data-percent>
              {completionPercent}%
            </span>
            <div className="relative shrink-0">
              <button
                type="button"
                id="btn-shopping-mode-view-options"
                onClick={() => setShowViewOptions(!showViewOptions)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer ${showViewOptions ? 'bg-white text-emerald-700' : 'bg-black/20 hover:bg-black/30 text-white'}`}
                title="List options"
                aria-label="View options"
              >
                <Eye className="w-4 h-4" />
              </button>
              {showViewOptions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowViewOptions(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white text-zinc-800 rounded-2xl border border-zinc-200 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-1 pb-1.5">Show</span>
                    <div className="flex gap-1 px-1 pb-1">
                      {([['all', `All ${totalCount}`], ['to_buy', `To buy ${pendingCount}`], ['bought', `Bought ${checkedCount}`]] as const).map(([f, label]) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => { setFilter(f); setShowViewOptions(false); }}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${filter === f ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                          data-filter={f}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-2 pb-1.5 border-t border-zinc-100 mt-1">Layout</span>
                    {([['food_type', 'By aisle', Store], ['sections', "By where it's from", Layers], ['all', 'A–Z', ShoppingBag]] as const).map(([mode, label, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setViewMode(mode); setShowViewOptions(false); }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-sm cursor-pointer ${viewMode === mode ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                      >
                        <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-zinc-500" />{label}</span>
                        {viewMode === mode && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    ))}
                    <div className="border-t border-zinc-100 mt-1.5 pt-1.5 space-y-0.5">
                      <label className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700 select-none">
                        <input type="checkbox" checked={dropCompletedToBottom} onChange={(e) => onToggleDropCompleted(e.target.checked)} className="rounded border-zinc-300 text-emerald-600 w-4 h-4 cursor-pointer" />
                        <span>Ticked items go to the bottom</span>
                      </label>
                      <label className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700 select-none">
                        <input type="checkbox" id="toggle-compact-rows" checked={compactRows} onChange={(e) => onCompactRows(e.target.checked)} className="rounded border-zinc-300 text-emerald-600 w-4 h-4 cursor-pointer" />
                        <span>Compact rows</span>
                      </label>
                      <button type="button" onClick={() => { setShowViewOptions(false); onArrangeAisles(); }} className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700">
                        <ListOrdered className="w-4 h-4 text-zinc-500" /> Arrange aisles…
                      </button>
                      <button type="button" onClick={() => { setShowViewOptions(false); onShowHistory(); }} className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700" data-open-history>
                        <Trophy className="w-4 h-4 text-zinc-500" /> Past shops…
                      </button>
                      <p className="px-2.5 pt-1 pb-1 text-xs text-zinc-500">Press and hold an item if it's out of stock.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              id="btn-exit-shopping-mode"
              onClick={onExit}
              className="shrink-0 w-9 h-9 rounded-xl bg-black/20 hover:bg-black/30 active:bg-black/40 text-white flex items-center justify-center cursor-pointer"
              title="Leave shopping mode"
              aria-label="Leave shopping mode"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="max-w-2xl mx-auto mt-2.5 w-full h-2 bg-black/20 rounded-full overflow-hidden p-0.5">
            <div className="h-full bg-white rounded-full transition-all duration-300 ease-out" style={{ width: `${completionPercent}%` }} />
          </div>
        </div>
        {filter !== 'all' && (
          <div className="bg-white border-b border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 flex items-center justify-between" data-filter-note>
            <span>Showing {filter === 'to_buy' ? 'what’s left to buy' : 'what you’ve bought'}</span>
            <button type="button" onClick={() => setFilter('all')} className="font-semibold text-emerald-700 cursor-pointer">Show all</button>
          </div>
        )}
        {!online && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-sm text-amber-900 flex items-center gap-2" data-offline>
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>No signal: your ticks are saved on this phone and will sync when you're back online.</span>
          </div>
        )}
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
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto animate-bounce">
              <PartyPopper className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-emerald-950" data-shop-complete>Shop 100% complete!</h3>
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
              allDone={group.items.length > 0 && group.items.every(isDone)}
              renderItem={(item) => (
                <ShoppingModeItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggle}
                  justTicked={!!justTicked[item.key]}
                  onHold={onHoldRow}
                  tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
                      justTicked={!!justTicked[item.key]}
                      onHold={onHoldRow}
                      tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
                      compact={compactRows}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {filteredItems.filter(i => !isDone(i)).length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      To Buy ({filteredItems.filter(i => !i.checked).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter(i => !isDone(i))).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
                          compact={compactRows}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredItems.filter(i => isDone(i)).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      Checked Off ({filteredItems.filter(i => isDone(i)).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter(i => isDone(i))).map(item => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          tickedBy={item.checked && item.checkedBy && item.checkedBy !== currentUser ? personName(item.checkedBy) : undefined}
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
        {totalCount > 0 && (
          <p className="text-xs text-zinc-500 text-center pt-1">Tip: press and hold an item if it's out of stock.</p>
        )}
      </div>

      {/* Always in reach: finish the shop */}
      {totalCount > 0 && (
        <div className="shrink-0 bg-white border-t border-zinc-200 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {lastAction ? (
              <button
                type="button"
                onClick={undoLast}
                className="min-w-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 cursor-pointer active:bg-zinc-100"
                data-undo-last
              >
                <Undo2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Undo {lastAction.kind === 'out' ? 'out of stock: ' : ''}{lastAction.name}</span>
              </button>
            ) : (
              <span className="text-sm text-zinc-600 tabular-nums">{pendingCount} left</span>
            )}
            <button
              type="button"
              onClick={onDone}
              className={`ml-auto shrink-0 px-5 py-2.5 rounded-xl text-[15px] font-semibold cursor-pointer ${
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
  /** Ticked a moment ago: still in place, crossed out, with Undo. */
  justTicked?: boolean;
  /** Press and hold: out of stock. */
  onHold?: (id: string) => void;
  /** Ticked on the other phone (their name). */
  tickedBy?: string;
  compact?: boolean;
}

/** Press and hold (about half a second) without moving: a long-press that works on any phone. */
function usePressHold(onHold: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => { held.current = true; onHold(); }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** True (once) if the press that just ended was a hold, so the tap that follows is ignored. */
    wasHeld: () => { const h = held.current; held.current = false; return h; },
  };
}

/** "Out of stock" label on a row. */
const OutOfStockPill = () => (
  <span className="shrink-0 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-2 py-1" data-out-of-stock>
    Out of stock
  </span>
);

/** The Undo pill on a row that was just ticked. */
function UndoTick({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onUndo(); }}
      className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold cursor-pointer active:bg-zinc-700"
      aria-label={`Undo: ${name} not bought`}
      data-undo-tick
    >
      Undo
    </button>
  );
}

function ShoppingModeItemRow({
  item,
  onToggle,
  justTicked = false,
  onHold,
  tickedBy,
  compact = false
}: ShoppingModeItemRowProps) {
  const press = usePressHold(() => onHold?.(item.id));
  const tap = () => { if (!press.wasHeld()) onToggle(item.id); };
  const out = !!item.outOfStock;
  const noCallout = { WebkitTouchCallout: 'none' } as React.CSSProperties;
  if (compact) {
    // One line: tick, name, amount. Big enough to tap with a basket in the other hand.
    return (
      <div
        onClick={tap}
        {...press.handlers}
        style={noCallout}
        className={`flex items-center gap-3 px-1.5 min-h-[48px] py-1.5 cursor-pointer select-none transition-colors ${justTicked ? 'bg-emerald-50/70' : out ? 'bg-amber-50/60' : item.checked ? 'opacity-50' : 'active:bg-zinc-50'}`}
        data-row="compact"
        data-just-ticked={justTicked || undefined}
        data-row-out={out || undefined}
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
          <span className={`text-base font-semibold truncate ${item.checked ? 'line-through text-zinc-400 font-medium' : out ? 'text-zinc-500' : 'text-zinc-900'}`}>
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
          {tickedBy && !justTicked && (
            <span className="shrink-0 text-xs font-semibold text-emerald-700" data-ticked-by>✓ {tickedBy}</span>
          )}
        </div>
        {justTicked ? (
          <UndoTick name={item.name} onUndo={() => onToggle(item.id)} />
        ) : out ? (
          <OutOfStockPill />
        ) : (
          <span className="shrink-0 flex flex-col items-end leading-tight">
            <span className={`text-base font-bold tabular-nums ${item.checked ? 'text-zinc-400' : 'text-emerald-700'}`}>
              {shopQuantityText(item)}
            </span>
            {item.neededText && !item.checked && <span className="text-[11px] text-zinc-500 tabular-nums" data-row-need>need {item.neededText}</span>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={tap}
      {...press.handlers}
      style={noCallout}
      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] select-none ${
        justTicked
          ? 'bg-emerald-50/70 border-emerald-200'
          : out
          ? 'bg-amber-50/60 border-amber-200'
          : item.checked
          ? 'bg-zinc-100/60 border-zinc-200/70 opacity-55'
          : 'bg-white border-zinc-200/90 shadow-2xs hover:border-zinc-300'
      }`}
      data-row="detailed"
      data-just-ticked={justTicked || undefined}
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
          {item.neededText && !item.checked && (
            <span className="text-xs text-zinc-600 tabular-nums" data-row-need>(meals use {item.neededText})</span>
          )}

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

      {tickedBy && !justTicked && <span className="shrink-0 text-xs font-semibold text-emerald-700" data-ticked-by>✓ {tickedBy}</span>}
      {out && !justTicked && <OutOfStockPill />}
      {justTicked && <UndoTick name={item.name} onUndo={() => onToggle(item.id)} />}
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
  learnedFrom = 0,
  onSave,
  onClose
}: {
  order?: string[];
  /** The order shown was learned from this many shops (0 = you arranged it, or the usual). */
  learnedFrom?: number;
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
            {learnedFrom > 0 && (
              <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5 mt-2" data-learned-note>
                This is the order you usually shop in, learned from {learnedFrom} {learnedFrom === 1 ? 'shop' : 'shops'}. Saving an order here uses yours instead.
              </p>
            )}
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
  // The shared product list (what the Shop knows how to buy).
  const catalog = catalogForState(store.state);
  const aisleNames = Object.values(GROCERY_AISLES).sort((a, b) => a.order - b.order).map((a) => a.name);

  const [newItemName, setNewItemName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingStapleId, setEditingStapleId] = useState<string | null>(null);
  
  // Editing state for detailed edit popup inside the main modal
  const [editingStapleName, setEditingStapleName] = useState('');
  const [editingStapleAmount, setEditingStapleAmount] = useState<number>(1);
  const [editingStapleUnit, setEditingStapleUnit] = useState('item');
  const [editingStapleCategory, setEditingStapleCategory] = useState(GROCERY_AISLES.dairy_eggs.name);

  const stapleSuggestions = useMemo(() => {
    if (!newItemName.trim()) return [];
    const query = newItemName.toLowerCase().trim();
    const starts = (p: any) => (p.name.toLowerCase().startsWith(query) ? 0 : 1);
    return catalog.products
      .filter((p) => productMatchesSearch(p, query))
      .sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((p) => p.item);
  }, [newItemName, catalog]);

  const handleQuickAddStaple = (name: string) => {
    if (!name.trim()) return;

    const matched = matchProduct(catalog, name)?.item;

    let finalName = name.trim();
    let finalUnit = 'item';
    let finalCategory = GROCERY_AISLES.pantry_spices.name;

    if (matched) {
      finalName = matched.name;
      finalUnit = matched.unit || finalUnit;
      finalCategory = aisleCategory(matched) || finalCategory;
    } else {
      finalCategory = GROCERY_AISLES[getGroceryAisle({ name: finalName })].name;
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
    const matched = matchProduct(catalog, name)?.item;
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
            aria-label="Close"
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
                          setEditingStapleCategory(aisleCategory({ name: item.name, category: item.category }) || GROCERY_AISLES[getGroceryAisle({ name: item.name, category: item.category })].name);
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
                  {aisleNames.map((a) => <option key={a} value={a}>{a}</option>)}
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
