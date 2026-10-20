/**
 * Which week's list the Shop shows, the weeks either side, and "the following week" (where things
 * you didn't get can go).
 */
import { useEffect, useMemo, useState } from 'react';
import { MealPlan, ShoppingListItem } from '../../types';
import { carryItemsToWeek, defaultShopWeek, weekStartShort } from '../../shopList';
import { preferredWeekStart } from '../../planning';
import {
  canPlanFollowingWeek, createEmptyPlan, formatDateISO, formatWeekRange, getMonday, getNextMonday,
  isWeekWithinForwardLimit, syncRecurringStaplesForPlan,
} from '../../utils';
import { readOpenShop } from './openShop';

export function useShopWeek(store: any, openPlanId?: string | null, onOpenPlanHandled?: () => void) {
  const nextMonday = getNextMonday(new Date());
  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayStr = formatDateISO(nextMonday);

  // The weeks you can shop for, in order: this week on, within the 4-week forward limit.
  const allPlans: MealPlan[] = useMemo(() => {
    return [...(store.state.mealPlans || [])]
      .filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate));
  }, [store.state.mealPlans]);

  // The week to open on: the one you're most likely shopping for that still has things to buy
  // (this week Mon–Thu, next week Fri–Sun), else the earliest sent week with things to buy.
  const defaultWeekId = () => {
    const plans = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
    return defaultShopWeek(plans, store.state.shoppingList || [], preferredWeekStart(new Date(), currentMondayStr, nextMondayStr), nextMondayStr);
  };
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const plans: MealPlan[] = store.state.mealPlans || [];
    if (openPlanId && plans.some((p) => p.id === openPlanId)) return openPlanId;
    const open = readOpenShop();
    if (open && plans.some((p) => p.id === open.planId)) return open.planId;
    return defaultWeekId();
  });
  useEffect(() => { if (openPlanId) onOpenPlanHandled?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected week valid (e.g. a week removed on the other phone)
  useEffect(() => {
    if (allPlans.length > 0) {
      if (!allPlans.some((p) => p.id === selectedPlanId)) setSelectedPlanId(defaultWeekId() || allPlans[0].id);
    } else if (selectedPlanId !== null) {
      setSelectedPlanId(null);
    }
  }, [allPlans, selectedPlanId, nextMondayStr]);

  // The other tabs open on the same week.
  useEffect(() => {
    if (selectedPlanId) store.setSelectedPlanId?.(selectedPlanId);
  }, [selectedPlanId]);

  const activePlan: MealPlan | null = useMemo(() => {
    if (selectedPlanId) {
      const match = allPlans.find((p) => p.id === selectedPlanId);
      if (match) return match;
    }
    const nextWeekPlan = allPlans.find((p) => p.startDate === nextMondayStr);
    if (nextWeekPlan) return nextWeekPlan;
    return allPlans[0] || null;
  }, [allPlans, selectedPlanId, nextMondayStr]);

  /** "This week", "Next week" or "w/c 3 Nov". */
  const weekName = (startDate?: string) =>
    !startDate ? '' : startDate === currentMondayStr ? 'This week' : startDate === nextMondayStr ? 'Next week' : `w/c ${weekStartShort(startDate)}`;
  const planIndex = activePlan ? allPlans.findIndex((p) => p.id === activePlan.id) : -1;
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
  /** "next week" or "w/c 10 Nov" (null when nothing can be moved on). */
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
      if (recurringPrefs.length > 0) list = syncRecurringStaplesForPlan(target, list, recurringPrefs, store.dismissedShoppingItemIds || []);
    }
    const res = carryItemsToWeek(list, ids, target.id, `Week of ${formatWeekRange(target.startDate)}`);
    store.updateShoppingList(res.list);
    return { moved: res.moved, alreadyThere: res.alreadyThere };
  };

  return {
    nextMonday, nextMondayStr, allPlans, selectedPlanId, setSelectedPlanId, activePlan,
    weekName, prevPlan, nextPlan, followingShort, followingListPhrase, carryToFollowingWeek,
  };
}
