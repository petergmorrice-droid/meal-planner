/**
 * A trip to the shop: shopping mode open or not (kept if the phone locks mid-shop), how long it's
 * taking, the order things are ticked in (to learn your route round the shop), and the record of
 * past shops when you're done.
 */
import { useEffect, useState } from 'react';
import { MealPlan, ShopRecord } from '../../types';
import { addShopRecord, BIG_SHOP, learnRoute, shopDurationText, shopStats } from '../../shopList';
import { readOpenShop, saveOpenShop } from './openShop';

export function useShoppingTrip(store: any, activePlan: MealPlan | null, openPlanId?: string | null) {
  const [isShoppingMode, setIsShoppingModeState] = useState<boolean>(() => {
    const open = readOpenShop();
    return !!open && (!openPlanId || openPlanId === open.planId) && (store.state.mealPlans || []).some((p: MealPlan) => p.id === open.planId);
  });

  // When this shop started (this phone).
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
      const next = ticked ? (seq.some((t) => t.key === key) ? seq : [...seq, { key, aisle }]) : seq.filter((t) => t.key !== key);
      localStorage.setItem(routeKey, JSON.stringify(next));
    } catch { /* learning the route is a nicety */ }
  };
  const readTicks = (): { key: string; aisle: string }[] => {
    try { return JSON.parse(localStorage.getItem(routeKey) || '[]'); } catch { return []; }
  };

  /** Whole minutes so far (null when it's too short or too long to count). */
  const tookMinutes = (): number | null => {
    try {
      const t = Number(localStorage.getItem(startKey));
      const ms = t ? Date.now() - t : NaN;
      return shopDurationText(ms) ? Math.max(1, Math.round(ms / 60_000)) : null;
    } catch { return null; }
  };
  /** "25 min" so far, or null. */
  const shopTook = (): string | null => {
    try {
      const t = Number(localStorage.getItem(startKey));
      return t ? shopDurationText(Date.now() - t) : null;
    } catch { return null; }
  };

  const history: ShopRecord[] = store.state.preferences?.shopHistory || [];
  const stats = shopStats(history);

  /** Remember the shop (shared): history, best time, and the route you took. True if it's a new best. */
  const recordShop = ({ bought, total, minutes }: { bought: number; total: number; minutes: number | null }): boolean => {
    const isBest = minutes !== null && bought >= BIG_SHOP && (stats.best === null || minutes < stats.best);
    const record: ShopRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      weekStart: activePlan?.startDate || '',
      bought,
      total,
      minutes,
      by: store.currentUser || 'P',
    };
    const shopRoute = store.state.preferences?.shopRoute;
    const learned = learnRoute(shopRoute, readTicks());
    store.updatePreferences?.({ shopHistory: addShopRecord(history, record), ...(learned && learned !== shopRoute ? { shopRoute: learned } : {}) });
    try { if (startKey) localStorage.removeItem(startKey); if (routeKey) localStorage.removeItem(routeKey); } catch { /* ignore */ }
    return isBest;
  };

  return { isShoppingMode, setIsShoppingMode, startShopping, recordTick, tookMinutes, shopTook, history, stats, recordShop };
}
