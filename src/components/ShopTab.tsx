/**
 * The Shop tab: this week's list (one row per product), and shopping mode when you're in the shop.
 * The pieces live in ./shop: the hooks hold the logic (which week, new products, staples, the (i)
 * panel, the trip), and src/shopListEdits.ts has the changes to the list as plain functions.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { BookOpen, Calendar, RotateCcw, ShoppingBag } from 'lucide-react';
import { ShoppingListItem, MealPlan, ShopRoute, TabName } from '../types';
import { useJustTicked } from '../hooks/useJustTicked';
import { matchProduct, matchProductDetailed, catalogForState, canonicalUnit, formatUnit } from '../shopping';
import {
  AggregatedShoppingListItem,
  aggregateShoppingItems,
  shopQuantityText,
  formatWeekSpan,
  parseQuickAdd,
  quickAddLine,
  listAsText,
  productKey,
  routeAisleOrder,
  BIG_SHOP,
} from '../shopList';
import {
  tickLines,
  markOutOfStock,
  answerCupboard,
  setLineAmount,
  setLineAmountAndUnit,
  stepLine,
  patchLines,
  removeLines,
  addHandLines,
  addCatalogItems,
  addRecipeIngredients,
  restoreRemoved,
  HandLine,
} from '../shopListEdits';
import { sendWeekToShoppingList } from '../planShopping';
import {
  formatWeekRange,
  createEmptyPlan,
  isWeekWithinForwardLimit,
  FoodAisle,
  GROCERY_AISLES,
  getGroceryAisle,
  orderedAisles,
  getIngredientStep,
} from '../utils';
import CatalogDrawer from './CatalogDrawer';
import BatchMealModal from './BatchMealModal';
import ItemSheet from './shop/ItemSheet';
import QuickAdd from './shop/QuickAdd';
import DoneShoppingSheet, { DoneChoice } from './shop/DoneShoppingSheet';
import ShopHistorySheet from './shop/ShopHistorySheet';
import ShopHeader from './shop/ShopHeader';
import { UnsentNotice, OutOfDateNotice, SaveForNextTime, StapleIdeas, CupboardNotice } from './shop/ShopNotices';
import { RowGroup, OutOfStockSection, BoughtSection, InCupboardSection } from './shop/ShopSections';
import { ShoppingModeView } from './shop/ShoppingModeView';
import { CupboardCheckSheet } from './shop/CupboardCheckSheet';
import { AisleOrderSheet } from './shop/AisleOrderSheet';
import { EditRecurringStaplesModal } from './shop/EditStaplesModal';
import { BelowThresholdWarningModal } from './shop/BelowNeededModal';
import { ShopToast, useShopToast } from './shop/ShopToast';
import { ThresholdWarningState, usePlannedNeeds } from './shop/needs';
import { useShopLayout } from './shop/useShopLayout';
import { useFavourites } from './shop/useFavourites';
import { useShopWeek } from './shop/useShopWeek';
import { useShoppingTrip } from './shop/useShoppingTrip';
import { useListUpkeep } from './shop/useListUpkeep';
import { useNewProducts } from './shop/useNewProducts';
import { useStapleSuggestions } from './shop/useStapleSuggestions';
import { useItemInfo } from './shop/useItemInfo';
import type  { AppStore } from '../store';

interface ShopTabProps {
  store: AppStore;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
  /** Open on this week (e.g. "See the list" after sending a week from Planning). */
  openPlanId?: string | null;
  onOpenPlanHandled?: () => void;
  /** Open one of the Shop's panels straight away (from Settings → Shopping). */
  openPanel?: 'aisles' | 'staples' | 'history' | null;
  onOpenPanelHandled?: () => void;
}

const COUNT_UNITS = ['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''];

export default function ShopTab({ store, onNavigateTab, openPlanId, onOpenPlanHandled, openPanel, onOpenPanelHandled }: ShopTabProps) {
  // The latest store, for buttons pressed later (Undo in a message).
  const storeRef = useRef(store);
  storeRef.current = store;
  const currentList = (): ShoppingListItem[] => store.state.shoppingList || [];
  const saveList = (next: ShoppingListItem[]) => store.updateShoppingList(next);

  // Panels and sheets
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showEditStaplesModal, setShowEditStaplesModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCupboardCheck, setShowCupboardCheck] = useState(false);
  const [showAisleOrder, setShowAisleOrder] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showBought, setShowBought] = useState(false);
  const [showInCupboard, setShowInCupboard] = useState(false);
  // The item panel follows one of the row's lines, so it stays open while you change its aisle or name.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // "Less than your meals need": asked before taking a meal ingredient below what the meals use.
  const [thresholdWarning, setThresholdWarning] = useState<ThresholdWarningState | null>(null);

  const { toast, setToast, setToastMessage } = useShopToast();
  const { favourites, toggleFavourite } = useFavourites(store);
  const { viewMode, setViewMode, dropCompletedToBottom, handleToggleDropCompleted, compactRows, handleCompactRows } = useShopLayout();
  const week = useShopWeek(store, openPlanId, onOpenPlanHandled);
  const { activePlan, setSelectedPlanId } = week;

  // From Settings → Shopping: open that panel.
  useEffect(() => {
    if (!openPanel) return;
    if (openPanel === 'aisles') setShowAisleOrder(true);
    else if (openPanel === 'staples') setShowEditStaplesModal(true);
    else if (openPanel === 'history') setShowHistory(true);
    onOpenPanelHandled?.();
  }, [openPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const trip = useShoppingTrip(store, activePlan, openPlanId);
  const { isShoppingMode, setIsShoppingMode } = trip;
  const { requirementFor, neededOf, mealBreakdown, partDetail } = usePlannedNeeds(activePlan, store.state.recipes);

  // Meal ingredients and staples either of you removed, so they don't come back by themselves.
  // Shared between phones via sync; removing an item adds it here automatically.
  const dismissedItemIds: string[] = store.dismissedShoppingItemIds || [];
  const activeWeekDismissedCount = activePlan ? dismissedItemIds.filter(id => id.includes(activePlan.id)).length : 0;
  useListUpkeep(store, activePlan, dismissedItemIds);

  // ---------- Changing the list ----------
  const handleToggleItem = (idOrIds: string | string[], forceState?: boolean) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    saveList(tickLines(currentList(), ids, forceState, store.currentUser || 'P'));
  };

  /** Out of stock at the shop: not ticked, and not counted against the % done. */
  const handleOutOfStock = (ids: string[], value: boolean) => saveList(markOutOfStock(currentList(), ids, value));

  const handleKeepRequired = (item: ShoppingListItem, requiredAmount: number) => {
    saveList(setLineAmount(currentList(), item.id, requiredAmount, false));
    const isCount = !item.unit || COUNT_UNITS.includes(item.unit.toLowerCase().trim());
    const unitText = !isCount && item.unit ? ` ${item.unit}` : '';
    setToastMessage(`Kept required ${requiredAmount}${unitText} for planned meals`);
  };

  const handleConfirmReduce = (item: ShoppingListItem, targetAmount: number, isRemoval?: boolean) => {
    if (isRemoval || targetAmount <= 0) {
      saveList(removeLines(currentList(), [item.id]));
      setToastMessage(`Removed ${item.name} from shopping list`);
      return;
    }
    saveList(setLineAmount(currentList(), item.id, targetAmount, true));
    setToastMessage(`Updated ${item.name} to ${targetAmount} ${item.unit}`);
  };

  const handleRestoreDismissed = () => {
    if (!activePlan) return;
    saveList(restoreRemoved(currentList(), activePlan, store.state.recipes, store.state.preferences?.recurringItems || []));
    setToastMessage('Restored recipe ingredients');
  };

  /** From the products list. */
  const handleAddItems = (items: { name: string; amount: number; category?: string }[]) => {
    if (!activePlan) return;
    const { list, total } = addCatalogItems(currentList(), activePlan, items);
    saveList(list);
    if (items.length > 0) {
      setToastMessage(`Added ${items.length} ${items.length === 1 ? 'item' : 'items'} (${total} total quantity)`);
    }
  };

  /** + / − on a line. Going below what the meals need asks first. */
  const handleUpdateQuantity = (id: string, delta: number) => {
    const item = currentList().find((i) => i.id === id);
    if (!item) return;
    const step = getIngredientStep(item);
    if (delta < 0) {
      const targetAmount = Math.max(0, (item.amount || 1) - step);
      const requirement = requirementFor(item);
      if (requirement && targetAmount < requirement.requiredAmount) {
        setThresholdWarning({ item, targetAmount, isRemoval: targetAmount <= 0, requirement });
        return;
      }
    }
    saveList(stepLine(currentList(), id, step, delta));
  };

  const handleUpdateQtyAndUnit = (id: string, amount: number, unit: string) => saveList(setLineAmountAndUnit(currentList(), id, amount, unit));

  /** An extra recipe's ingredients (and, if you like, the meal in the freezer). */
  const handleAddBatchMealIngredients = (
    mealName: string,
    ingredients: { name: string; amount: number; unit: string; category?: string }[],
    options?: { recipeId?: string; portions?: number; alsoAddToFreezer?: boolean },
  ) => {
    let targetPlan = activePlan;
    if (!targetPlan) {
      const currentPlans = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
      targetPlan = currentPlans.find((p: MealPlan) => p.startDate === week.nextMondayStr) || currentPlans[0];
      if (!targetPlan) {
        targetPlan = createEmptyPlan(week.nextMonday);
        store.updateMealPlan(targetPlan);
        setSelectedPlanId(targetPlan.id);
      }
    }
    const { list, count } = addRecipeIngredients(currentList(), targetPlan, mealName, ingredients);
    if (options?.alsoAddToFreezer && store.addBatch) {
      store.addBatch({
        id: crypto.randomUUID(),
        name: mealName,
        recipeId: options?.recipeId || '',
        portions: options?.portions || 4,
        dateAdded: new Date().toISOString(),
      });
    }
    saveList(list);
    setShowBatchModal(false);
    setToastMessage(`Added ${count} ${count === 1 ? 'ingredient' : 'ingredients'} for ${mealName}`);
  };

  // Aisles in the order you walk your shop (shared between phones): the order you arranged, or
  // else the order learned from your shops.
  const shopRoute: ShopRoute | undefined = store.state.preferences?.shopRoute;
  const arrangedOrder: string[] | undefined = store.state.preferences?.aisleOrder;
  const aisleOrder: string[] | undefined = arrangedOrder?.length
    ? arrangedOrder
    : routeAisleOrder(shopRoute, orderedAisles(null)) || undefined;
  const handleSaveAisleOrder = (order: string[] | null) => {
    store.updatePreferences?.({ aisleOrder: order || undefined });
    setToastMessage(order ? 'Aisle order saved' : 'Aisles back to the usual order');
  };

  const handleCupboardAnswer = (ids: string[], answer: 'have' | 'need' | null) => saveList(answerCupboard(currentList(), ids, answer));

  // ---------- This week's list ----------
  const currentWeekItems = useMemo<ShoppingListItem[]>(() => {
    if (!activePlan) return [];
    return (store.state.shoppingList || []).filter((i: ShoppingListItem) => i.planId === activePlan.id);
  }, [activePlan, store.state.shoppingList]);
  const isPlanFinalized = activePlan?.status === 'finalized';

  // Store-cupboard items still to check, and the ones you said you already have.
  const cupboardToCheck = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.checkCupboard && !i.checked && !i.cupboard),
    [currentWeekItems],
  );
  const inCupboardItems = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.cupboard === 'have'),
    [currentWeekItems],
  );
  // What you're actually buying this week.
  const buyingItems = useMemo(
    () => currentWeekItems.filter((i: ShoppingListItem) => i.cupboard !== 'have'),
    [currentWeekItems],
  );

  // One row per product (the same rows and counts as shopping mode).
  const rows = useMemo(() => aggregateShoppingItems(buyingItems, neededOf), [buyingItems, neededOf]);

  const newProducts = useNewProducts({ store, weekItems: currentWeekItems, favourites, aisleOrder, setToast, setToastMessage, openRow: setOpenRowId });
  const staples = useStapleSuggestions({ store, activePlan, setToastMessage });

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

  // ---------- The item panel ----------
  const updateParts = (ids: string[], patch: (i: ShoppingListItem) => ShoppingListItem) => saveList(patchLines(currentList(), ids, patch));

  const removeRowParts = (row: AggregatedShoppingListItem) => {
    const removed = row.parts;
    saveList(removeLines(currentList(), row.underlyingIds));
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

  const info = useItemInfo({
    currentUser: store.currentUser,
    rows,
    mealBreakdown,
    onEdit: isShoppingMode ? undefined : (row) => setOpenRowId(row.id),
    clearToast: () => setToast(null),
  });

  // ---------- Adding ----------
  /** Lines typed or picked: added to something you already added by hand, or as a new line. */
  const addLines = (lines: HandLine[]): string[] => {
    if (!activePlan || lines.length === 0) return [];
    const res = addHandLines(currentList(), activePlan, lines, (line) =>
      matchProduct(catalogForState(store.getState?.() || store.state), line.name, { groceryId: line.groceryId }));
    saveList(res.list);
    return res.ids;
  };

  /** "Added by you" + in the item panel: one more of it on top of what the meals or staples need. */
  const addExtraToRow = (row: AggregatedShoppingListItem) => {
    const first = row.parts[0];
    const product = matchProduct(catalogForState(store.getState?.() || store.state), row.name, { groceryId: row.parts.find(p => p.groceryId)?.groceryId });
    let line: HandLine;
    if (product) {
      const q = quickAddLine({ name: product.name, packs: 1 });
      line = { ...q, groceryId: q.groceryId || product.id, category: q.category || first?.category };
    } else {
      const step = first ? getIngredientStep(first) : 1;
      line = { name: row.name, amount: step, unit: first ? formatUnit(canonicalUnit(first.unit), step) : '', category: first?.category };
    }
    addLines([line]);
  };

  /** − on a line you added: at its smallest it comes off (back to "Added by you: 0"), if the row has other lines. */
  const stepPart = (row: AggregatedShoppingListItem, id: string, dir: 1 | -1) => {
    const part = row.parts.find(p => p.id === id);
    const handAdded = !!part && part.isAdhoc && !part.isRecurring && !part.isBatch;
    if (dir < 0 && part && handAdded && row.parts.length > 1 && (part.amount || 0) <= getIngredientStep(part) + 1e-9) {
      const keep = row.parts.find(p => p.id !== id);
      if (keep && openRowId === id) setOpenRowId(keep.id);
      saveList(removeLines(currentList(), [id]));
      return;
    }
    handleUpdateQuantity(id, dir);
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
    // Something new? Ask straight away whether to save it for future shops (the "Save for next
    // time?" card at the top of the list keeps offering it until you answer).
    if (newProducts.askAboutNew(line, id, qty)) return false;
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
      .filter((p) => !p.sameAs)
      .forEach((p) => push(p.name, p.category));
    (store.state.shoppingList || []).forEach((i: ShoppingListItem) => push(i.name, i.category));
    return out;
  }, [favourites, store.state.groceryDatabase, store.state.groceryOverrides, store.state.shoppingList]);

  // ---------- Sharing the list ----------
  const shareList = async () => {
    const title = `Shopping list · ${week.weekName(activePlan?.startDate)} (${formatWeekSpan(activePlan?.startDate || '')})`;
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

  // ---------- "Done shopping" ----------
  /**
   * Finish the shop. Things not ticked: moved to the following week's list, left, or taken off.
   * Out-of-stock things stay on this list unless you ask for them next week too (you might not
   * need them by then).
   */
  const finishShopping = (choice: DoneChoice, outToNextWeek = false) => {
    const notBought = stillToBuy;
    const ids = notBought.flatMap(r => r.underlyingIds);
    const outIds = outRows.flatMap(r => r.underlyingIds);
    const took = trip.shopTook();
    const minutes = trip.tookMinutes();
    let extra = '';
    const toCarry = [...(choice === 'move' ? ids : []), ...(outToNextWeek ? outIds : [])];
    const toRemove = choice === 'remove' ? ids : [];
    if (toCarry.length) {
      const res = week.carryToFollowingWeek(toCarry, toRemove);
      if (res) extra = ` · ${res.moved.length + res.alreadyThere.length} moved to ${week.followingShort}`;
    } else if (toRemove.length) {
      saveList(removeLines(currentList(), toRemove));
    }
    if (choice === 'remove' && ids.length) extra += ` · ${notBought.length} taken off`;
    if (choice === 'keep' && ids.length) extra += ` · ${notBought.length} still to get`;

    const isBest = trip.recordShop({ bought: checkedCount, total: totalCount, minutes });
    setShowDone(false);
    setIsShoppingMode(false);
    setShowBought(false);
    setToastMessage(`Shop done: ${checkedCount} bought${took ? ` in ${took}` : ''}${isBest && trip.stats.timed ? ' · a new best!' : ''}${extra}`, { label: 'Past shops', run: () => setShowHistory(true) });
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
        onTickRecorded={trip.recordTick}
        route={shopRoute}
        currentUser={store.currentUser || 'P'}
        onShowHistory={() => setShowHistory(true)}
        onInfo={info.openInfo}
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
          took={trip.shopTook()}
          minutes={trip.tookMinutes()}
          best={trip.stats.best}
          bigShop={checkedCount >= BIG_SHOP}
          nextWeekLabel={week.followingListPhrase}
          onChoose={finishShopping}
          onClose={() => setShowDone(false)}
        />
      )}
      {showHistory && <ShopHistorySheet history={trip.history} onClose={() => setShowHistory(false)} />}
      {newProducts.sheet}
      {info.sheet}
      {toast && <ShopToast toast={toast} onClose={() => setToast(null)} shoppingMode />}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      {toast && <ShopToast toast={toast} onClose={() => setToast(null)} />}

      <ShopHeader
        title={week.weekName(activePlan?.startDate) || 'Shopping'}
        activePlan={activePlan}
        sent={isPlanFinalized}
        prevPlan={week.prevPlan}
        nextPlan={week.nextPlan}
        onSelectPlan={setSelectedPlanId}
        canShare={stillToBuy.length > 0}
        onShare={shareList}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onArrangeAisles={() => setShowAisleOrder(true)}
        onStaples={() => setShowEditStaplesModal(true)}
        onHistory={() => setShowHistory(true)}
        onGoShopping={trip.startShopping}
      />

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

          {!isPlanFinalized && activePlan && (
            <UnsentNotice plan={activePlan} onPlanning={onNavigateTab ? () => onNavigateTab('planning', activePlan.id) : undefined} />
          )}
          {activePlan && isPlanFinalized && (
            <OutOfDateNotice plan={activePlan} onUpdate={() => sendWeekToShoppingList(store, activePlan)} />
          )}
          <SaveForNextTime items={newProducts.newItems} onPick={newProducts.offerToSave} />
          <StapleIdeas suggestions={staples.suggestions} onPick={staples.offer} />
          <CupboardNotice items={cupboardToCheck} onCheck={() => setShowCupboardCheck(true)} />

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
                    className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-emerald-700 cursor-pointer"
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
                <RowGroup
                  key={group.id}
                  group={group}
                  justTicked={justTicked}
                  onChangeStaples={() => setShowEditStaplesModal(true)}
                  onTick={tickRow}
                  onOpen={r => setOpenRowId(r.id)}
                  onInfo={info.openInfo}
                />
              ))}

              <OutOfStockSection rows={outRows} onTick={tickRow} onOpen={r => setOpenRowId(r.id)} onInfo={info.openInfo} />

              <BoughtSection
                rows={boughtRows}
                open={showBought}
                onToggle={() => setShowBought(v => !v)}
                justTicked={justTicked}
                onTick={tickRow}
                onOpen={r => setOpenRowId(r.id)}
                onInfo={info.openInfo}
              />

              <InCupboardSection
                items={inCupboardItems}
                open={showInCupboard}
                onToggle={() => setShowInCupboard(v => !v)}
                onNeed={(id) => handleCupboardAnswer([id], 'need')}
              />

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
          nextWeekLabel={week.followingShort}
          onStep={(id, dir) => stepPart(openRow, id, dir)}
          onSetAmount={handleUpdateQtyAndUnit}
          onAddExtra={activePlan ? () => addExtraToRow(openRow) : undefined}
          onSaveNote={note => updateParts(openRow.underlyingIds, i => { const { note: _old, ...rest } = i; return note ? { ...rest, note } : rest; })}
          onRename={name => updateParts(openRow.underlyingIds, i => { const { groceryId: _g, ...rest } = i; return { ...rest, name }; })}
          onAisle={a => setRowAisle(openRow, a)}
          onFavourite={() => toggleFavourite(openRow.name, GROCERY_AISLES[aisleOf(openRow)].name)}
          onMove={() => {
            const res = week.carryToFollowingWeek(openRow.underlyingIds);
            setOpenRowId(null);
            if (res) setToastMessage(`${openRow.name}: moved to ${week.followingShort}`);
          }}
          onRemove={() => removeRowParts(openRow)}
          onManageStaples={() => { setOpenRowId(null); setShowEditStaplesModal(true); }}
          onBackInStock={() => handleOutOfStock(openRow.underlyingIds, false)}
          onSaveAsProduct={newProducts.isNewItem(openRow.name) ? () => { const part = openRow.parts.find((p) => p.isAdhoc && !p.groceryId) || openRow.parts[0]; setOpenRowId(null); newProducts.offerToSave(part); } : undefined}
          onClose={() => setOpenRowId(null)}
        />
      )}
      {newProducts.sheet}
      {info.sheet}
      {staples.sheet}

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

      {showBatchModal && (
        <BatchMealModal
          store={store}
          onClose={() => setShowBatchModal(false)}
          onAdd={handleAddBatchMealIngredients}
          weekLabel={activePlan ? formatWeekRange(activePlan.startDate) : ''}
        />
      )}

      {showHistory && <ShopHistorySheet history={trip.history} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
