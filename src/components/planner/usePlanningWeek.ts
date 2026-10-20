/**
 * Which week Planning shows: this week and the next few (never past weeks), opening on this week
 * Monday–Thursday and next week Friday–Sunday, and following the other tabs' choice of week.
 */
import { useEffect, useMemo, useState } from 'react';
import { MealPlan } from '../../types';
import {
  createEmptyPlan, formatDateISO, formatWeekRange, getMonday, canPlanFollowingWeek, isCurrentOrFutureWeek,
  isWeekWithinForwardLimit, MAX_FORWARD_WEEKS, syncRecurringStaplesForPlan,
} from '../../utils';
import { preferredWeekStart } from '../../planning';
import type { AppStore } from '../../store';

export function usePlanningWeek(store: AppStore, targetPlanId: string | null | undefined, setToastMessage: (msg: string | null) => void) {
  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayDate = new Date(currentMondayStr + 'T00:00:00');
  nextMondayDate.setDate(nextMondayDate.getDate() + 7);
  const nextMondayStr = formatDateISO(nextMondayDate);
  const lastMondayDate = new Date(currentMondayStr + 'T00:00:00');
  lastMondayDate.setDate(lastMondayDate.getDate() - 7);
  const lastMondayStr = formatDateISO(lastMondayDate);
  const maxWeeks = store.state.preferences?.maxForwardWeeks || MAX_FORWARD_WEEKS;

  /** "This Week", "Next Week", "Last Week", or the dates. */
  const weekLabel = (startDate: string) =>
    startDate === currentMondayStr ? 'This Week'
      : startDate === nextMondayStr ? 'Next Week'
      : startDate === lastMondayStr ? 'Last Week'
      : formatWeekRange(startDate);

  // This week and later ones within the forward limit (never past weeks).
  const allowedPlans: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((p: MealPlan) => isCurrentOrFutureWeek(p.startDate) && isWeekWithinForwardLimit(p.startDate, undefined, maxWeeks))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate));
  }, [store.state.mealPlans, currentMondayStr, maxWeeks]);

  // The week asked for (from another tab), else the one you're most likely planning.
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

  // The week on screen (falling back the same way while the selection catches up).
  let currentPlan = allowedPlans.find((p: MealPlan) => p.id === selectedPlanId);
  if (!currentPlan && allowedPlans.length > 0) {
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

  // ‹ › between weeks
  const planIndex = currentPlan ? allowedPlans.findIndex((p: MealPlan) => p.id === currentPlan!.id) : -1;
  const prevPlan = planIndex > 0 ? allowedPlans[planIndex - 1] : null;
  const nextPlan = planIndex >= 0 && planIndex < allowedPlans.length - 1 ? allowedPlans[planIndex + 1] : null;

  /** Go to the week after (making it, with its weekly staples, if it isn't there yet). */
  const planFollowingWeek = (fromStartDate?: string): string | null => {
    const baseDateStr = fromStartDate || currentPlan!.startDate;
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

  return { maxWeeks, weekLabel, allowedPlans, setSelectedPlanId, currentPlan, prevPlan, nextPlan, planFollowingWeek };
}
