import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChefHat, Check, Clock, Snowflake, Moon, Minus, Plus, CalendarPlus, Pencil,
} from 'lucide-react';
import { MealPlan, PlannedMeal, Recipe, BatchItem, DayPlan } from '../types';
import { DAYS_OF_WEEK, formatDateISO, getMonday, getNextMonday, isWeekWithinForwardLimit } from '../utils';
import { leftoverSourceDay, moveMeal, relinkLeftovers, cooksForText } from '../planning';
import { formatWeekSpan, weekStartShort } from '../shopList';
import { recipeMinutes, startBy, clockText, parseClock, prepTonight, freezePortionsFromNote } from '../cookInfo';
import { DaySheet, describeMeal, mealTitle } from './planner/DayListRow';
import { TimerBar } from './cook/TimerBar';
import CookMode from './CookMode';
import { RecipeModal } from './RecipePopup';

type TabName = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';

interface CookTabProps {
  store: any;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
}

const DEFAULT_DINNER = '19:00';
const isCookable = (m?: PlannedMeal | null) => !!m && (m.type === 'recipe' || m.type === 'leftover' || m.type === 'batch');
/** Reheating leftovers or a freezer meal: roughly how long before dinner to start. */
const REHEAT_MINUTES: Record<string, number> = { leftover: 15, batch: 30 };

/** The date of a day in a plan ("2026-10-15"). */
function dayISO(plan: MealPlan, day: string): string {
  const own = plan.days[day]?.date;
  if (own && /^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  const d = new Date(plan.startDate + 'T00:00:00');
  d.setDate(d.getDate() + Math.max(0, DAYS_OF_WEEK.indexOf(day)));
  return formatDateISO(d);
}

/** Later days this week that eat leftovers of this cook: how many extra portions, which days. */
function leftoversAfter(days: Record<string, DayPlan>, day: string, meal: PlannedMeal): { extra: number; days: string[] } {
  const out = { extra: 0, days: [] as string[] };
  if (meal.type !== 'recipe' || !meal.recipeId) return out;
  for (let i = DAYS_OF_WEEK.indexOf(day) + 1; i > 0 && i < DAYS_OF_WEEK.length; i++) {
    const m = days[DAYS_OF_WEEK[i]]?.meals?.[0];
    if (!m || m.recipeId !== meal.recipeId) continue;
    if (m.type === 'leftover') { out.extra += m.servings || 2; out.days.push(DAYS_OF_WEEK[i]); } else break;
  }
  return out;
}

const shortDay = (plan: MealPlan, day: string) => `${day.slice(0, 3)} ${new Date(dayISO(plan, day) + 'T00:00:00').getDate()}`;

/**
 * The Cook tab: what's for dinner tonight (and when to start), anything to do tonight for
 * tomorrow, then the week one line per day. Ticking a meal as cooked keeps the freezer right:
 * a freezer meal comes off it; a batch cook can go on it.
 */
export default function CookTab({ store, onNavigateTab }: CookTabProps) {
  const storeRef = useRef(store);
  storeRef.current = store;

  const now = new Date();
  const todayIso = formatDateISO(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowIso = formatDateISO(tomorrow);
  const currentMondayStr = formatDateISO(getMonday(now));
  const nextMondayStr = formatDateISO(getNextMonday(now));

  const recipes: Recipe[] = store.state.recipes || [];
  const batches: BatchItem[] = store.state.batches || [];
  const prefs = store.state.preferences || {};
  const dinnerTime: string = parseClock(prefs.dinnerTime) !== null ? prefs.dinnerTime : DEFAULT_DINNER;
  const recipeFor = (m?: PlannedMeal | null) => (m?.recipeId ? recipes.find((r) => r.id === m.recipeId) || null : null);
  const methodFor = (r: Recipe | null) => {
    const ms = r?.cookingMethods?.length ? r.cookingMethods : ['oven_hob'];
    const p = prefs.preferredCookingMethod;
    return p && p !== 'all' && ms.includes(p) ? p : ms[0];
  };

  // ---------- Which week ----------
  const plans: MealPlan[] = useMemo(
    () => (store.state.mealPlans || [])
      .filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate))
      .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate)),
    [store.state.mealPlans],
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const all: MealPlan[] = (store.state.mealPlans || []).filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate));
    return (all.find((p) => p.startDate === currentMondayStr) || all.sort((a, b) => a.startDate.localeCompare(b.startDate))[0])?.id || null;
  });
  const plan: MealPlan | null = plans.find((p) => p.id === selectedPlanId) || plans.find((p) => p.startDate === currentMondayStr) || plans[0] || null;
  const planIndex = plan ? plans.findIndex((p) => p.id === plan.id) : -1;
  const prevPlan = planIndex > 0 ? plans[planIndex - 1] : null;
  const nextPlan = planIndex >= 0 && planIndex < plans.length - 1 ? plans[planIndex + 1] : null;
  const weekName = (start?: string) => (!start ? 'Cook' : start === currentMondayStr ? 'This week' : start === nextMondayStr ? 'Next week' : `w/c ${weekStartShort(start)}`);
  const isThisWeek = plan?.startDate === currentMondayStr;

  // ---------- What's on ----------
  /** Any plan's meal on a date (tomorrow may be in next week's plan). */
  const mealOn = (iso: string): { plan: MealPlan; day: string; meal: PlannedMeal | null } | null => {
    for (const p of store.state.mealPlans || []) {
      for (const d of DAYS_OF_WEEK) {
        if (p.days?.[d] && dayISO(p, d) === iso) return { plan: p, day: d, meal: p.days[d].meals?.[0] || null };
      }
    }
    return null;
  };
  const tonight = mealOn(todayIso);
  const tomorrowMeal = mealOn(tomorrowIso);

  // ---------- Panels, toasts ----------
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [cooking, setCooking] = useState<{ planId: string; day: string; meal: PlannedMeal; servings?: number } | null>(null);
  const [viewing, setViewing] = useState<{ planId: string; day: string; meal: PlannedMeal; recipe: Recipe; servings: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [freezePrompt, setFreezePrompt] = useState<{ planId: string; day: string; mealId: string; name: string; recipeId?: string; portions: number } | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  // Keep "start by" right as the evening goes on.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setMinute((n) => n + 1), 60_000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- Writing ----------
  const livePlan = (planId: string): MealPlan | null => (storeRef.current.state.mealPlans || []).find((p: MealPlan) => p.id === planId) || null;
  const patchMeal = (planId: string, day: string, mealId: string, patch: (m: PlannedMeal) => PlannedMeal) => {
    const p = livePlan(planId);
    const dp = p?.days[day];
    if (!p || !dp) return;
    storeRef.current.updateMealPlan({ ...p, days: { ...p.days, [day]: { ...dp, meals: dp.meals.map((m) => (m.id === mealId ? patch(m) : m)) } } });
  };
  const liveBatch = (id: string): BatchItem | null => (storeRef.current.state.batches || []).find((b: BatchItem) => b.id === id) || null;
  const batchName = (b: BatchItem | null, m: PlannedMeal) => (b?.name || recipeFor(m)?.name || mealTitle(m)).trim();
  const portionsText = (n: number) => `${n} ${n === 1 ? 'portion' : 'portions'}`;

  /** Put portions back into a batch (or bring the batch back if it was used up). */
  const addToFreezer = (batchId: string, portions: number, fallback: BatchItem) => {
    const b = liveBatch(batchId);
    if (b) storeRef.current.updateBatch({ ...b, portions: b.portions + portions });
    else storeRef.current.addBatch({ ...fallback, id: batchId, portions });
  };
  /** Take portions out of a batch (removing it when it's empty). */
  const takeFromFreezer = (batchId: string, portions: number): { took: number; left: number; snapshot?: BatchItem } => {
    const b = liveBatch(batchId);
    if (!b) return { took: 0, left: 0 };
    const took = Math.min(portions, b.portions);
    const left = b.portions - took;
    if (left <= 0) { storeRef.current.removeBatch(b.id); return { took, left: 0, snapshot: b }; }
    storeRef.current.updateBatch({ ...b, portions: left });
    return { took, left };
  };

  /**
   * Tick or untick a meal. A freezer meal takes its portions out of the freezer (and unticking
   * puts them back); a cook with "freeze 4" in its notes asks about adding portions to the freezer.
   */
  const setCooked = (planId: string, day: string, mealId: string, cooked: boolean, extra?: { froze?: { batchId: string; portions: number } }) => {
    const p = livePlan(planId);
    const meal = p?.days[day]?.meals.find((m) => m.id === mealId);
    if (!p || !meal || !!meal.cooked === cooked) return;
    const undo = () => setCooked(planId, day, mealId, !cooked);
    const title = mealTitle(meal);

    if (cooked) {
      if (meal.type === 'batch' && meal.batchId && !meal.tookFromFreezer) {
        const b = liveBatch(meal.batchId);
        const r = takeFromFreezer(meal.batchId, meal.servings || 2);
        patchMeal(planId, day, mealId, (m) => ({ ...m, cooked: true, tookFromFreezer: r.took ? { batchId: meal.batchId!, portions: r.took, ...(r.snapshot ? { batch: r.snapshot } : {}) } : undefined }));
        setToast({
          text: r.took ? `Took ${portionsText(r.took)} of ${batchName(b, meal)} out of the freezer · ${r.left ? `${r.left} left` : 'none left'}` : `${title} ticked`,
          undo,
        });
        return;
      }
      patchMeal(planId, day, mealId, (m) => ({ ...m, cooked: true, ...(extra?.froze ? { froze: extra.froze } : {}) }));
      if (extra?.froze) {
        setToast({ text: `${title} cooked · ${portionsText(extra.froze.portions)} in the freezer`, undo });
        return;
      }
      const freeze = meal.type === 'recipe' ? freezePortionsFromNote(meal.note) : null;
      if (freeze && !meal.froze) {
        setFreezePrompt({ planId, day, mealId, name: recipeFor(meal)?.name || title, recipeId: meal.recipeId, portions: freeze });
        return;
      }
      setToast({ text: `${title} ticked as cooked`, undo });
      return;
    }

    // Unticking: undo what ticking did to the freezer.
    const notes: string[] = [];
    if (meal.tookFromFreezer) {
      const t = meal.tookFromFreezer;
      addToFreezer(t.batchId, t.portions, t.batch || { id: t.batchId, name: recipeFor(meal)?.name || title, recipeId: meal.recipeId, portions: t.portions, dateAdded: new Date().toISOString() });
      notes.push(`${portionsText(t.portions)} back in the freezer`);
    }
    if (meal.froze) {
      const r = takeFromFreezer(meal.froze.batchId, meal.froze.portions);
      if (r.took) notes.push(`${portionsText(r.took)} taken off the freezer`);
    }
    patchMeal(planId, day, mealId, (m) => {
      const { tookFromFreezer: _t, froze: _f, ...rest } = m;
      return { ...rest, cooked: false };
    });
    setToast({ text: `${title} unticked${notes.length ? ` · ${notes.join(', ')}` : ''}`, undo });
  };

  const confirmFreeze = (portions: number) => {
    const f = freezePrompt;
    setFreezePrompt(null);
    if (!f) return;
    if (portions <= 0) { setToast({ text: `${f.name} ticked as cooked`, undo: () => setCooked(f.planId, f.day, f.mealId, false) }); return; }
    const batchId = crypto.randomUUID();
    storeRef.current.addBatch({ id: batchId, name: f.name, recipeId: f.recipeId, portions, dateAdded: new Date().toISOString() });
    patchMeal(f.planId, f.day, f.mealId, (m) => ({ ...m, froze: { batchId, portions } }));
    setToast({ text: `${portionsText(portions)} of ${f.name} added to the freezer`, undo: () => setCooked(f.planId, f.day, f.mealId, false) });
  };

  const saveDinnerTime = (v: string) => {
    if (parseClock(v) !== null) store.updatePreferences({ dinnerTime: v });
    setEditingTime(false);
  };

  // ---------- Day panel actions (same panel as Planning) ----------
  const writeDays = (p: MealPlan, days: Record<string, DayPlan>) => store.updateMealPlan({ ...p, days });
  const moveDay = (from: string, to: string) => {
    if (!plan) return;
    const before = plan;
    const r = moveMeal(plan.days, from, to);
    writeDays(plan, r.days);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    setToast({ text: (r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh, undo: () => { const live = livePlan(before.id); if (live) writeDays(live, before.days); } });
  };
  const removeDay = (day: string, mealId: string) => {
    if (!plan) return;
    const before = plan;
    const dp = plan.days[day];
    const r = relinkLeftovers({ ...plan.days, [day]: { ...dp, meals: dp.meals.filter((m) => m.id !== mealId) } });
    writeDays(plan, r.days);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    setToast({ text: `Removed from ${day}.${fresh}`, undo: () => { const live = livePlan(before.id); if (live) writeDays(live, before.days); } });
  };

  const startCooking = (planId: string, day: string, meal: PlannedMeal, servings?: number) => {
    if (!recipeFor(meal)) return;
    setDaySheet(null);
    setViewing(null);
    setCooking({ planId, day, meal, servings });
  };

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#fafafa] p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400"><ChefHat className="w-7 h-7" /></div>
        <h2 className="text-lg font-semibold text-zinc-900">Nothing planned yet</h2>
        <p className="text-sm text-zinc-600 mt-1 max-w-xs">Plan the week and it'll show here, with what to cook tonight.</p>
        <button type="button" onClick={() => onNavigateTab?.('planning')} className="mt-4 h-11 px-5 rounded-xl bg-zinc-900 text-white text-sm font-semibold cursor-pointer">Go to Planning</button>
      </div>
    );
  }

  // ---------- The week ----------
  const days = DAYS_OF_WEEK.filter((d) => plan.days[d]);
  const rows = days.map((day) => {
    const meal = plan.days[day].meals?.[0] || null;
    const iso = dayISO(plan, day);
    return { day, meal, iso, isToday: iso === todayIso, isPast: iso < todayIso };
  });
  const cookable = rows.filter((r) => isCookable(r.meal));
  const cookedCount = cookable.filter((r) => r.meal!.cooked).length;
  const earlier = isThisWeek ? rows.filter((r) => r.isPast) : [];
  const earlierCooked = earlier.filter((r) => r.meal?.cooked).length;
  const earlierOpen = earlier.filter((r) => isCookable(r.meal) && !r.meal!.cooked).length;
  const shownRows = showEarlier || !earlier.length ? rows : rows.filter((r) => !r.isPast);

  // ---------- Tonight ----------
  const tonightCard = (() => {
    if (!isThisWeek || !tonight) return null;
    const { plan: tp, day, meal } = tonight;
    const d = meal ? describeMeal(meal, leftoverSourceDay(tp.days, day, meal)) : null;
    const recipe = recipeFor(meal);
    const after = meal ? leftoversAfter(tp.days, day, meal) : { extra: 0, days: [] };
    const people = meal ? (meal.servings || 2) + after.extra : 0;
    const minutes = !meal ? 0 : meal.type === 'recipe' ? recipeMinutes(recipe, methodFor(recipe)) : REHEAT_MINUTES[meal.type] || 0;
    const start = minutes ? startBy(dinnerTime, minutes) : null;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const dinner = parseClock(dinnerTime)!;
    const verb = meal?.type === 'recipe' ? 'Start' : 'Start reheating';
    const timeLine = start === null ? null : nowMins > dinner ? null : nowMins >= start ? `${verb} now to eat at` : `${verb} by ${clockText(start)} to eat at`;

    return (
      <section className="rounded-2xl bg-white border border-zinc-200 shadow-2xs overflow-hidden" data-tonight>
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Tonight · {shortDay(tp, day)}</span>
            {meal?.cooked && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><Check className="w-3.5 h-3.5" />{meal.type === 'recipe' ? 'Cooked' : 'Done'}</span>}
          </div>
          {meal ? (
            <>
              <button type="button" onClick={() => setDaySheet(day)} className="block text-left w-full cursor-pointer" data-tonight-meal>
                <h2 className={`text-[22px] font-bold leading-tight mt-1 break-words ${meal.cooked ? 'text-zinc-500' : 'text-zinc-900'}`}>{mealTitle(meal)}</h2>
              </button>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[15px] text-zinc-700">
                {d?.label?.text && <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-md px-1.5 py-px ${d.label.tone}`}>{d.label.icon}{d.label.text}</span>}
                {meal.type !== 'no_meal' && <span data-tonight-people>for {people}{after.extra ? ` (${after.extra} extra for ${after.days.map((x) => x.slice(0, 3)).join(', ')})` : ''}</span>}
              </div>
              {meal.sides && meal.sides.length > 0 && <p className="text-sm text-zinc-600 mt-1">With {meal.sides.map((s) => s.name).join(', ')}</p>}
              {d?.note && <p className="text-sm text-zinc-700 mt-1.5 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5" data-tonight-note>{d.note}</p>}

              {isCookable(meal) && !meal.cooked && (
                <div className="mt-2.5 flex items-center gap-1.5 text-[15px] text-zinc-800" data-start-by>
                  <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                  {editingTime ? (
                    <span className="inline-flex items-center gap-2">
                      Eat at
                      <input type="time" defaultValue={dinnerTime} autoFocus onBlur={(e) => saveDinnerTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveDinnerTime((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingTime(false); }}
                        className="h-9 rounded-lg border border-zinc-300 px-2 text-[15px]" data-dinner-input aria-label="Dinner time" />
                    </span>
                  ) : (
                    <span>
                      {timeLine || 'Eat at'}{' '}
                      <button type="button" onClick={() => setEditingTime(true)} className="font-semibold underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center gap-0.5" data-dinner-time aria-label={`Dinner at ${clockText(dinner)}. Change it`}>
                        {clockText(dinner)}<Pencil className="w-3 h-3 text-zinc-400" />
                      </button>
                      {minutes > 0 && meal.type === 'recipe' && <span className="text-zinc-500"> · {minutes} min</span>}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-zinc-500 mt-1">Nothing planned</h2>
              <button type="button" onClick={() => onNavigateTab?.('planning', tp.id)} className="mt-2 h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <CalendarPlus className="w-4 h-4" />Plan something
              </button>
            </>
          )}
        </div>

        {meal && meal.type !== 'no_meal' && (
          <div className="px-4 pb-3.5 flex gap-2">
            {meal.type === 'recipe' && recipe && !meal.cooked && (
              <button type="button" onClick={() => startCooking(tp.id, day, meal)} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer" data-tonight-start>
                <ChefHat className="w-5 h-5" />Start cooking
              </button>
            )}
            {isCookable(meal) ? (
              <button type="button" onClick={() => setCooked(tp.id, day, meal.id, !meal.cooked)} aria-pressed={!!meal.cooked}
                className={`h-12 rounded-xl border font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${meal.type === 'recipe' && recipe && !meal.cooked ? 'px-4 border-zinc-300 text-zinc-800' : 'flex-1'} ${meal.cooked ? 'border-zinc-300 text-zinc-600' : meal.type !== 'recipe' || !recipe ? 'bg-zinc-900 border-zinc-900 text-white' : ''}`}
                data-tonight-tick>
                <Check className="w-5 h-5" />{meal.cooked ? 'Untick' : meal.type === 'recipe' ? 'Cooked' : 'Done'}
              </button>
            ) : null}
          </div>
        )}

        {tomorrowMeal && (() => {
          const tm = tomorrowMeal.meal;
          const b = tm?.batchId ? batches.find((x) => x.id === tm.batchId) || null : null;
          const prep = tm ? prepTonight(tm, recipeFor(tm), b?.name || recipeFor(tm)?.name) : null;
          const label = tm ? describeMeal(tm, leftoverSourceDay(tomorrowMeal.plan.days, tomorrowMeal.day, tm)).label?.text : '';
          return (
            <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2.5" data-tomorrow>
              <p className="text-sm text-zinc-700 truncate"><span className="font-semibold text-zinc-900">Tomorrow:</span> {tm ? mealTitle(tm) : 'nothing planned'}{label ? ` · ${label}` : ''}</p>
              {prep && (
                <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-sm font-semibold text-amber-950" data-prep-tonight>
                  {tm?.type === 'batch' ? <Snowflake className="w-4 h-4 shrink-0 mt-0.5 text-cyan-700" /> : <Moon className="w-4 h-4 shrink-0 mt-0.5" />}{prep}
                </p>
              )}
            </div>
          );
        })()}
      </section>
    );
  })();

  const sheetDay = daySheet ? rows.find((r) => r.day === daySheet) || (tonight && tonight.day === daySheet ? { day: tonight.day, meal: tonight.meal } : null) : null;
  const sheetMeal = sheetDay?.meal || null;
  const sheetRecipe = recipeFor(sheetMeal);

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative overflow-hidden">
      <header className="bg-white border-b border-zinc-200/80 px-2 sm:px-5 py-1.5 shrink-0 relative z-20">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 min-w-0">
            <button type="button" onClick={() => prevPlan && setSelectedPlanId(prevPlan.id)} disabled={!prevPlan} className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0" aria-label="Previous week" data-cook-week-prev>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 px-0.5 text-center">
              <div className="text-[15px] font-bold text-zinc-900 whitespace-nowrap leading-tight" data-cook-week-name>{weekName(plan.startDate)}</div>
              <div className="text-xs text-zinc-500 whitespace-nowrap leading-tight" data-cook-week-status>{formatWeekSpan(plan.startDate)} · {cookedCount} of {cookable.length} cooked</div>
            </div>
            <button type="button" onClick={() => nextPlan && setSelectedPlanId(nextPlan.id)} disabled={!nextPlan} className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0" aria-label="Next week" data-cook-week-next>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button type="button" onClick={() => onNavigateTab?.('planning', plan.id)} className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 cursor-pointer shrink-0">
            Change the plan
          </button>
        </div>
      </header>

      {/* Cooking mode shows its own */}
      {!cooking && <TimerBar />}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 py-3 space-y-3">
          {tonightCard}

          <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden" data-cook-week>
            {earlier.length > 0 && (
              <button type="button" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-600 border-b border-zinc-100 cursor-pointer hover:bg-zinc-50" data-earlier-toggle>
                <ChevronDown className={`w-4 h-4 transition-transform ${showEarlier ? '' : '-rotate-90'}`} />
                <span>Earlier this week · {earlierCooked} cooked{earlierOpen ? ` · ${earlierOpen} not ticked` : ''}</span>
              </button>
            )}
            <ul className="divide-y divide-zinc-100">
              {shownRows.map(({ day, meal, isToday, isPast }) => {
                const d = meal ? describeMeal(meal, leftoverSourceDay(plan.days, day, meal)) : null;
                const after = meal ? leftoversAfter(plan.days, day, meal) : { extra: 0, days: [] };
                const people = meal ? (meal.servings || 2) + after.extra : 0;
                return (
                  <li key={day} className={`flex items-center gap-2 pl-3 pr-2 ${isToday ? 'bg-emerald-50/60' : ''}`} data-cook-row={day}>
                    <button type="button" onClick={() => (meal ? setDaySheet(day) : onNavigateTab?.('planning', plan.id))} className="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left cursor-pointer">
                      <span className={`w-12 shrink-0 text-sm font-bold ${isToday ? 'text-emerald-800' : isPast ? 'text-zinc-400' : 'text-zinc-700'}`}>{isToday ? 'Today' : shortDay(plan, day)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] font-semibold truncate ${!meal ? 'text-zinc-400 font-normal' : meal.cooked ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-900'}`}>{meal ? mealTitle(meal) : 'Nothing planned'}</span>
                        {meal && (d?.label?.text || meal.type === 'recipe') && (
                          <span className="block text-[13px] text-zinc-500 truncate">
                            {[d?.label?.text, meal.type !== 'no_meal' && meal.type !== 'takeout' && meal.type !== 'eating_out' ? `for ${people}` : '', after.extra ? `${after.extra} extra for ${after.days.map((x) => x.slice(0, 3)).join(', ')}` : '', freezePortionsFromNote(meal.note) && meal.type === 'recipe' ? `freeze ${freezePortionsFromNote(meal.note)}` : ''].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </button>
                    {isCookable(meal) ? (
                      <button type="button" onClick={() => setCooked(plan.id, day, meal!.id, !meal!.cooked)} aria-pressed={!!meal!.cooked} aria-label={meal!.cooked ? `Untick ${day}` : `Tick ${day} as cooked`}
                        className="w-11 h-11 flex items-center justify-center shrink-0 cursor-pointer" data-cook-tick={day}>
                        <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${meal!.cooked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}>
                          {meal!.cooked && <Check className="w-4 h-4" />}
                        </span>
                      </button>
                    ) : <span className="w-11 shrink-0" />}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {toast && (
        <div className="absolute left-3 right-3 bottom-3 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-md w-full bg-zinc-900 text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3" role="status" data-toast>
            <span className="flex-1 text-sm">{toast.text}</span>
            {toast.undo && (
              <button type="button" onClick={() => { const u = toast.undo!; setToast(null); u(); }} className="shrink-0 text-sm font-bold text-emerald-300 cursor-pointer" data-toast-undo>Undo</button>
            )}
          </div>
        </div>
      )}

      {freezePrompt && <FreezePrompt key={freezePrompt.mealId} name={freezePrompt.name} portions={freezePrompt.portions} onChoose={confirmFreeze} />}

      {daySheet && sheetMeal && (
        <DaySheet
          key={`${daySheet}-${sheetMeal.id}`}
          day={daySheet}
          dayPlan={plan.days[daySheet]}
          meal={sheetMeal}
          cooksFor={cooksForText(plan.days, daySheet, sheetMeal)}
          fromDay={leftoverSourceDay(plan.days, daySheet, sheetMeal)}
          plannedDays={DAYS_OF_WEEK.map((d) => ({ day: d, date: plan.days[d]?.date, meal: plan.days[d]?.meals?.[0] || null }))}
          hasRecipe={!!sheetRecipe}
          onSave={(patch) => patchMeal(plan.id, daySheet, sheetMeal.id, (m) => ({ ...m, servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)), note: patch.note || undefined }))}
          onChangeMeal={() => { setDaySheet(null); onNavigateTab?.('planning', plan.id); }}
          onMove={(to) => { setDaySheet(null); moveDay(daySheet, to); }}
          onRemove={() => { setDaySheet(null); removeDay(daySheet, sheetMeal.id); }}
          onOpenRecipe={sheetRecipe ? () => {
            const after = leftoversAfter(plan.days, daySheet, sheetMeal);
            setViewing({ planId: plan.id, day: daySheet, meal: sheetMeal, recipe: sheetRecipe, servings: (sheetMeal.servings || 2) + after.extra });
            setDaySheet(null);
          } : undefined}
          onClose={() => setDaySheet(null)}
          extra={isCookable(sheetMeal) ? (
            <div className="flex gap-2" data-day-cook-actions>
              {sheetMeal.type === 'recipe' && sheetRecipe && !sheetMeal.cooked && (
                <button type="button" onClick={() => startCooking(plan.id, daySheet, sheetMeal)} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer" data-day-start-cooking>
                  <ChefHat className="w-5 h-5" />Start cooking
                </button>
              )}
              <button type="button" onClick={() => { setCooked(plan.id, daySheet, sheetMeal.id, !sheetMeal.cooked); setDaySheet(null); }}
                className={`flex-1 h-12 rounded-xl border font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${sheetMeal.cooked ? 'border-zinc-300 text-zinc-700' : 'border-zinc-900 bg-zinc-900 text-white'}`} data-day-tick>
                <Check className="w-5 h-5" />{sheetMeal.cooked ? 'Untick' : sheetMeal.type === 'recipe' ? 'Tick as cooked' : 'Tick as done'}
              </button>
            </div>
          ) : null}
        />
      )}

      {viewing && (
        <RecipeModal
          store={store}
          recipe={viewing.recipe}
          initialServings={viewing.servings}
          onClose={() => setViewing(null)}
          onStartCook={(servings) => startCooking(viewing.planId, viewing.day, viewing.meal, servings)}
        />
      )}

      {cooking && (
        <CookMode
          store={store}
          dayName={cooking.day}
          meals={[cooking.meal]}
          initialActiveMealId={cooking.meal.id}
          activePlan={livePlan(cooking.planId) || undefined}
          initialServings={cooking.servings}
          onClose={() => setCooking(null)}
          onMarkCooked={(mealId, cooked, extra) => setCooked(cooking.planId, cooking.day, mealId, cooked, extra)}
        />
      )}
    </div>
  );
}

/** "Put 4 portions of chilli in the freezer?" after ticking a batch cook. */
function FreezePrompt({ name, portions, onChoose }: { key?: React.Key; name: string; portions: number; onChoose: (portions: number) => void }) {
  const [n, setN] = useState(portions);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={() => onChoose(0)}>
      <div role="dialog" aria-label="Add to the freezer" data-freeze-prompt className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-2">
          <Snowflake className="w-5 h-5 text-cyan-700" />
          <h3 className="text-lg font-bold text-zinc-900">Into the freezer?</h3>
        </div>
        <p className="text-[15px] text-zinc-700 mt-1">The plan says to freeze some {name}. How many portions went in?</p>
        <div className="flex items-center justify-center gap-4 my-4">
          <button type="button" onClick={() => setN((x) => Math.max(1, x - 1))} disabled={n <= 1} className="w-12 h-12 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="One fewer"><Minus className="w-5 h-5" /></button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums" data-freeze-prompt-count>{n}</span>
          <button type="button" onClick={() => setN((x) => Math.min(24, x + 1))} className="w-12 h-12 rounded-xl border border-zinc-300 flex items-center justify-center cursor-pointer" aria-label="One more"><Plus className="w-5 h-5" /></button>
        </div>
        <button type="button" onClick={() => onChoose(n)} className="w-full h-12 rounded-xl bg-cyan-700 text-white font-semibold cursor-pointer" data-freeze-prompt-add>Add {n} {n === 1 ? 'portion' : 'portions'} to the freezer</button>
        <button type="button" onClick={() => onChoose(0)} className="w-full h-11 mt-1 text-sm font-semibold text-zinc-600 cursor-pointer" data-freeze-prompt-skip>Not this time</button>
      </div>
    </div>
  );
}
