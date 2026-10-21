/**
 * Shopping mode: the full-screen list you use in the shop (aisles in your walking order,
 * % done, Undo, out of stock, cupboard check, Done shopping). Ticks stay on the phone if offline.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Check,
  ShoppingBag,
  X,
  ChevronDown,
  Layers,
  Store,
  ShoppingCart,
  Eye,
  Sliders,
  ListOrdered,
  PackageCheck,
  Trophy,
  WifiOff,
  Undo2,
  PartyPopper,
} from 'lucide-react';
import { ShoppingListItem, MealPlan, ShopRoute } from '../../types';
import { useJustTicked } from '../../hooks/useJustTicked';
import ShopAisleGroup from '../ShopAisleGroup';
import {
  AggregatedShoppingListItem,
  aggregateShoppingItems,
  formatWeekSpan,
  sortByRoute,
  milestoneCrossed,
} from '../../shopList';
import {
  formatWeekRange,
  getMonday,
  getNextMonday,
  formatDateISO,
  FoodAisle,
  GROCERY_AISLES,
  getGroceryAisle,
  aislePositions,
} from '../../utils';
import { ShoppingModeItemRow } from './ShoppingModeRow';
import { buzz, useOnline, useScreenAwake } from '../../hooks/phone';
import { personName } from '../PersonMark';

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
  /** (i) on a row: what it's for, what was added and by whom. */
  onInfo?: (row: AggregatedShoppingListItem) => void;
}
export function ShoppingModeView({
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
  onInfo,
}: ShoppingModeViewProps) {
  useScreenAwake();
  const online = useOnline();
  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayStr = formatDateISO(getNextMonday(new Date()));
  const [filter, setFilter] = useState<'all' | 'to_buy' | 'bought'>('all');
  const [viewMode, setViewMode] = useState<'sections' | 'food_type' | 'all'>('food_type');
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    planned: false,
    batch: false,
    adhoc: false,
    recurring: false,
  });

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // One row per product, exactly as on the Shop list (so the counts match).
  const aggregatedItems = useMemo(() => aggregateShoppingItems(items, neededOf), [items, neededOf]);
  const weekTitle = activePlan
    ? activePlan.startDate === currentMondayStr
      ? 'This week'
      : activePlan.startDate === nextMondayStr
        ? 'Next week'
        : formatWeekSpan(activePlan.startDate)
    : 'This week';

  // Out of stock doesn't count against you: the % is of what the shop actually had.
  const countable = aggregatedItems.filter((i) => !i.outOfStock);
  const totalCount = countable.length;
  const checkedCount = countable.filter((i) => i.checked).length;
  const pendingCount = totalCount - checkedCount;
  const completionPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Just ticked: counts straight away, but stays put (crossed out, with Undo) for a few seconds.
  const { justTicked, hold, release } = useJustTicked();
  const isDone = (i: AggregatedShoppingListItem) => (i.checked && !justTicked[i.key]) || !!i.outOfStock;

  // The last thing you did, with Undo in the bottom bar until you do something else.
  const [lastAction, setLastAction] = useState<{
    kind: 'tick' | 'out';
    key: string;
    name: string;
    ids: string[];
  } | null>(null);

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
    if (filter === 'to_buy') return aggregatedItems.filter((i) => !isDone(i));
    if (filter === 'bought') return aggregatedItems.filter((i) => i.checked);
    return aggregatedItems;
  }, [aggregatedItems, filter, justTicked]);

  // Sections sorting & grouping helpers
  const plannedModeItems = useMemo(() => {
    return filteredItems.filter((i) => !i.isAdhoc && !i.isBatch && !i.isRecurring);
  }, [filteredItems]);

  const batchModeItems = useMemo(() => {
    return filteredItems.filter((i) => i.isBatch);
  }, [filteredItems]);

  const recurringModeItems = useMemo(() => {
    return filteredItems.filter((i) => i.isRecurring);
  }, [filteredItems]);

  const adhocModeItems = useMemo(() => {
    return filteredItems.filter((i) => i.isAdhoc && !i.isRecurring);
  }, [filteredItems]);

  // Group by aisle for easy supermarket navigation
  const groupedAisles = useMemo(() => {
    const map = new Map<FoodAisle, AggregatedShoppingListItem[]>();
    filteredItems.forEach((item) => {
      const aisle = getGroceryAisle(item);
      const list = map.get(aisle) || [];
      list.push(item);
      map.set(aisle, list);
    });

    const pos = aislePositions(aisleOrder);
    return Array.from(map.entries())
      .map(([aisle, list]) => ({
        aisle,
        info: GROCERY_AISLES[aisle],
        items: list,
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
      return [...sorted.filter((i) => !isDone(i)), ...sorted.filter((i) => isDone(i))];
    }
    return sorted;
  };

  const onToggle = (itemId: string) => {
    const aggItem = aggregatedItems.find((i) => i.id === itemId);
    if (!aggItem) return;
    // Out of stock but there after all: tapping it ticks it.
    const targetState = aggItem.outOfStock ? true : !aggItem.checked;
    parentOnToggle(aggItem.underlyingIds, targetState);
    onTickRecorded(aggItem.key, getGroceryAisle(aggItem), targetState);
    if (targetState) {
      hold(aggItem.key);
      setLastAction({ kind: 'tick', key: aggItem.key, name: aggItem.name, ids: aggItem.underlyingIds });
    } else {
      release(aggItem.key);
      setLastAction((a) => (a?.key === aggItem.key ? null : a));
    }
  };

  /** Press and hold: out of stock (or back in stock). */
  const onHoldRow = (itemId: string) => {
    const aggItem = aggregatedItems.find((i) => i.id === itemId);
    if (!aggItem) return;
    const value = !aggItem.outOfStock;
    onOutOfStock(aggItem.underlyingIds, value);
    release(aggItem.key);
    if (aggItem.checked) onTickRecorded(aggItem.key, getGroceryAisle(aggItem), false);
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
    <div className="fixed inset-0 z-50 app-page flex flex-col overflow-hidden animate-in fade-in duration-150">
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
                <p className="text-sm text-white mt-0.5 font-bold animate-in fade-in zoom-in-95" data-milestone>
                  {milestone}
                </p>
              ) : (
                <p className="text-xs text-emerald-100 mt-0.5 font-medium truncate" data-shop-mode-sub>
                  {weekTitle} · {checkedCount} of {totalCount} ticked
                </p>
              )}
            </div>
            <span
              className="shrink-0 text-lg font-black tracking-tight tabular-nums bg-white/20 px-2.5 py-0.5 rounded-xl text-white"
              data-percent
            >
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
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-1 pb-1.5">
                      Show
                    </span>
                    <div className="flex gap-1 px-1 pb-1">
                      {(
                        [
                          ['all', `All ${totalCount}`],
                          ['to_buy', `To buy ${pendingCount}`],
                          ['bought', `Bought ${checkedCount}`],
                        ] as const
                      ).map(([f, label]) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            setFilter(f);
                            setShowViewOptions(false);
                          }}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${filter === f ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                          data-filter={f}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-2 pb-1.5 border-t border-zinc-100 mt-1">
                      Layout
                    </span>
                    {(
                      [
                        ['food_type', 'By aisle', Store],
                        ['sections', "By where it's from", Layers],
                        ['all', 'A–Z', ShoppingBag],
                      ] as const
                    ).map(([mode, label, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setViewMode(mode);
                          setShowViewOptions(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-sm cursor-pointer ${viewMode === mode ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-zinc-500" />
                          {label}
                        </span>
                        {viewMode === mode && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    ))}
                    <div className="border-t border-zinc-100 mt-1.5 pt-1.5 space-y-0.5">
                      <label className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700 select-none">
                        <input
                          type="checkbox"
                          checked={dropCompletedToBottom}
                          onChange={(e) => onToggleDropCompleted(e.target.checked)}
                          className="rounded border-zinc-300 text-emerald-600 w-4 h-4 cursor-pointer"
                        />
                        <span>Ticked items go to the bottom</span>
                      </label>
                      <label className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700 select-none">
                        <input
                          type="checkbox"
                          id="toggle-compact-rows"
                          checked={compactRows}
                          onChange={(e) => onCompactRows(e.target.checked)}
                          className="rounded border-zinc-300 text-emerald-600 w-4 h-4 cursor-pointer"
                        />
                        <span>Compact rows</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowViewOptions(false);
                          onArrangeAisles();
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700"
                      >
                        <ListOrdered className="w-4 h-4 text-zinc-500" /> Arrange aisles…
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowViewOptions(false);
                          onShowHistory();
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-50 rounded-xl cursor-pointer text-sm text-zinc-700"
                        data-open-history
                      >
                        <Trophy className="w-4 h-4 text-zinc-500" /> Past shops…
                      </button>
                      <p className="px-2.5 pt-1 pb-1 text-xs text-zinc-500">
                        Press and hold an item if it's out of stock.
                      </p>
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
            <div
              className="h-full bg-white rounded-full transition-all duration-300 ease-out"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
        {filter !== 'all' && (
          <div
            className="bg-white border-b border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 flex items-center justify-between"
            data-filter-note
          >
            <span>Showing {filter === 'to_buy' ? 'what’s left to buy' : 'what you’ve bought'}</span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="font-semibold text-emerald-700 cursor-pointer"
            >
              Show all
            </button>
          </div>
        )}
        {!online && (
          <div
            className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-sm text-amber-900 flex items-center gap-2"
            data-offline
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>No signal: your ticks are saved on this phone and will sync when you're back online.</span>
          </div>
        )}
      </header>

      {/* Main Simplified Shopping List Area */}
      <div
        className={`flex-1 overflow-y-auto ${compactRows ? 'p-2.5 sm:p-5' : 'p-4 sm:p-6'} pb-6 max-w-2xl mx-auto w-full ${compactRows ? 'space-y-2.5' : 'space-y-4'}`}
      >
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
            <h3 className="text-lg font-bold text-emerald-950" data-shop-complete>
              Shop 100% complete!
            </h3>
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
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
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
          groupedAisles.map((group) => (
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
                  onInfo={onInfo}
                  tickedBy={
                    item.checked && item.checkedBy && item.checkedBy !== currentUser
                      ? personName(item.checkedBy)
                      : undefined
                  }
                  compact={compactRows}
                />
              )}
            />
          ))
        ) : viewMode === 'sections' ? (
          <div className="space-y-4">
            {/* Items */}
            {adhocModeItems.length > 0 &&
              (() => {
                const isCollapsed = !!collapsedSections['adhoc'];
                return (
                  <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                    <button
                      type="button"
                      onClick={() => toggleSection('adhoc')}
                      className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                        <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                          Added by you
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-400">
                        {adhocModeItems.filter((i) => !i.checked).length} left
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className={`${rowsClass} pt-1`}>
                        {arrangeListItems(adhocModeItems).map((item) => (
                          <ShoppingModeItemRow
                            key={item.id}
                            item={item}
                            onToggle={onToggle}
                            justTicked={!!justTicked[item.key]}
                            onHold={onHoldRow}
                            onInfo={onInfo}
                            tickedBy={
                              item.checked && item.checkedBy && item.checkedBy !== currentUser
                                ? personName(item.checkedBy)
                                : undefined
                            }
                            compact={compactRows}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Recurring Staples */}
            {recurringModeItems.length > 0 &&
              (() => {
                const isCollapsed = !!collapsedSections['recurring'];
                return (
                  <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                    <div className="w-full flex items-center justify-between p-1 rounded-xl select-none">
                      <button
                        type="button"
                        onClick={() => toggleSection('recurring')}
                        className="flex items-center gap-1.5 hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left min-w-0"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
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
                          {recurringModeItems.filter((i) => !i.checked).length} left
                        </span>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className={`${rowsClass} pt-1`}>
                        {arrangeListItems(recurringModeItems).map((item) => (
                          <ShoppingModeItemRow
                            key={item.id}
                            item={item}
                            onToggle={onToggle}
                            justTicked={!!justTicked[item.key]}
                            onHold={onHoldRow}
                            onInfo={onInfo}
                            tickedBy={
                              item.checked && item.checkedBy && item.checkedBy !== currentUser
                                ? personName(item.checkedBy)
                                : undefined
                            }
                            compact={compactRows}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Meal Ingredients */}
            {plannedModeItems.length > 0 &&
              (() => {
                const isCollapsed = !!collapsedSections['planned'];
                return (
                  <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                    <button
                      type="button"
                      onClick={() => toggleSection('planned')}
                      className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                        <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                          For your meals
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-400">
                        {plannedModeItems.filter((i) => !i.checked).length} left
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className={`${rowsClass} pt-1`}>
                        {arrangeListItems(plannedModeItems).map((item) => (
                          <ShoppingModeItemRow
                            key={item.id}
                            item={item}
                            onToggle={onToggle}
                            justTicked={!!justTicked[item.key]}
                            onHold={onHoldRow}
                            onInfo={onInfo}
                            tickedBy={
                              item.checked && item.checkedBy && item.checkedBy !== currentUser
                                ? personName(item.checkedBy)
                                : undefined
                            }
                            compact={compactRows}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Batch Meals */}
            {batchModeItems.length > 0 &&
              (() => {
                const isCollapsed = !!collapsedSections['batch'];
                return (
                  <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs">
                    <button
                      type="button"
                      onClick={() => toggleSection('batch')}
                      className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                        <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">
                          Extra recipes
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-400">
                        {batchModeItems.filter((i) => !i.checked).length} left
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className={`${rowsClass} pt-1`}>
                        {arrangeListItems(batchModeItems).map((item) => (
                          <ShoppingModeItemRow
                            key={item.id}
                            item={item}
                            onToggle={onToggle}
                            justTicked={!!justTicked[item.key]}
                            onHold={onHoldRow}
                            onInfo={onInfo}
                            tickedBy={
                              item.checked && item.checkedBy && item.checkedBy !== currentUser
                                ? personName(item.checkedBy)
                                : undefined
                            }
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
                    {filteredItems.filter((i) => !i.checked).length} to buy
                  </span>
                </div>
                <div className={rowsClass}>
                  {arrangeListItems(filteredItems).map((item) => (
                    <ShoppingModeItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      justTicked={!!justTicked[item.key]}
                      onHold={onHoldRow}
                      onInfo={onInfo}
                      tickedBy={
                        item.checked && item.checkedBy && item.checkedBy !== currentUser
                          ? personName(item.checkedBy)
                          : undefined
                      }
                      compact={compactRows}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {filteredItems.filter((i) => !isDone(i)).length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      To Buy ({filteredItems.filter((i) => !i.checked).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter((i) => !isDone(i))).map((item) => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          onInfo={onInfo}
                          tickedBy={
                            item.checked && item.checkedBy && item.checkedBy !== currentUser
                              ? personName(item.checkedBy)
                              : undefined
                          }
                          compact={compactRows}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredItems.filter((i) => isDone(i)).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] block px-1">
                      Checked Off ({filteredItems.filter((i) => isDone(i)).length})
                    </span>
                    <div className={rowsClass}>
                      {arrangeListItems(filteredItems.filter((i) => isDone(i))).map((item) => (
                        <ShoppingModeItemRow
                          key={item.id}
                          item={item}
                          onToggle={onToggle}
                          justTicked={!!justTicked[item.key]}
                          onHold={onHoldRow}
                          onInfo={onInfo}
                          tickedBy={
                            item.checked && item.checkedBy && item.checkedBy !== currentUser
                              ? personName(item.checkedBy)
                              : undefined
                          }
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
        {quickAdd && totalCount > 0 && (
          <div className="pt-1" data-shopping-quick-add>
            {quickAdd}
          </div>
        )}
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
                <span className="truncate">
                  Undo {lastAction.kind === 'out' ? 'out of stock: ' : ''}
                  {lastAction.name}
                </span>
              </button>
            ) : (
              <span className="text-sm text-zinc-600 tabular-nums">{pendingCount} left</span>
            )}
            <button
              type="button"
              onClick={onDone}
              className={`ml-auto shrink-0 px-5 py-2.5 rounded-xl text-[15px] font-semibold cursor-pointer ${
                pendingCount === 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
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
