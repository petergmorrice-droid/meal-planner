import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RatingRows, RatingChip } from './Stars';
import { ratingsFor, withRating, PersonRatings } from '../ratings';
import PersonMark, { noteLook } from './PersonMark';
import Notice from './Notice';
import {
  ChevronLeft, ChevronRight, ChefHat, Check, Clock, Snowflake, Moon, Minus, Plus, Pencil,
  ArrowLeftRight, RotateCcw, ShoppingBag, Utensils, X, FileText, BookOpen,
  Star,
} from 'lucide-react';
import { MealPlan, PlannedMeal, Recipe, BatchItem, DayPlan, UserPreferences, TabName } from '../types';
import { DAYS_OF_WEEK, formatDateISO, getMonday, getNextMonday, isWeekWithinForwardLimit } from '../utils';
import { leftoverSourceDay, moveMeal, relinkLeftovers, cooksForText, undoDays } from '../planning';
import { formatWeekSpan, weekStartShort } from '../shopList';
import { recipeMinutes, startBy, clockText, parseClock, prepTonight, freezePortionsFromNote, eatAtFor } from '../cookInfo';
import { DaySheet, describeMeal, mealTitle, dayTone } from './planner/DayListRow';
import { TimerBar } from './cook/TimerBar';
import CookMode from './CookMode';
import { RecipeModal } from './RecipePopup';
import type { AppStore } from '../store';
import { useLatest } from '../hooks/useLatest';


interface CookTabProps {
  store: AppStore;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
}

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
  // The newest store, for Undo and other changes made a moment after what's on screen.
  const storeRef = useLatest(store);

  const now = new Date();
  const todayIso = formatDateISO(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowIso = formatDateISO(tomorrow);
  const currentMondayStr = formatDateISO(getMonday(now));
  const nextMondayStr = formatDateISO(getNextMonday(now));

  const recipes: Recipe[] = store.state.recipes || [];
  const batches: BatchItem[] = store.state.batches || [];
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  // Your usual time is in Settings (6pm if not set); the Cook tab can change it just for tonight.
  const eatAt = eatAtFor(prefs, todayIso);
  const dinnerTime = eatAt.time;
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
  // "Rate it": both of your stars for a recipe you've cooked.
  const [rating, setRating] = useState<{ recipeId: string; name: string } | null>(null);
  const rateRecipe = (recipeId: string, stars: number) => {
    store.updatePreferences((p) => ({ ratings: withRating(p.ratings, recipeId, store.currentUser || 'P', stars, new Date().toISOString().slice(0, 10)) }));
  };
  const [moving, setMoving] = useState<string | null>(null);
  const [noting, setNoting] = useState<string | null>(null);
  const [cooking, setCooking] = useState<{ planId: string; day: string; meal: PlannedMeal; servings?: number } | null>(null);
  const [viewing, setViewing] = useState<{ planId: string; day: string; meal: PlannedMeal; recipe: Recipe; servings: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [freezePrompt, setFreezePrompt] = useState<{ planId: string; day: string; mealId: string; name: string; recipeId?: string; portions: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  // The very latest state (a note saved a moment ago in the same tap isn't in store.state yet).
  const latest = () => storeRef.current.getState?.() || storeRef.current.state;
  const livePlan = (planId: string): MealPlan | null => (latest().mealPlans || []).find((p: MealPlan) => p.id === planId) || null;
  /** Change one meal, on the latest copy of the week. */
  const patchMeal = (planId: string, day: string, mealId: string, patch: (m: PlannedMeal) => PlannedMeal) => {
    storeRef.current.changeMealPlan(planId, (p) => {
      const dp = p.days[day];
      if (!dp) return null;
      return { ...p, days: { ...p.days, [day]: { ...dp, meals: dp.meals.map((m) => (m.id === mealId ? patch(m) : m)) } } };
    });
  };
  const liveBatch = (id: string): BatchItem | null => (latest().batches || []).find((b: BatchItem) => b.id === id) || null;
  const batchName = (b: BatchItem | null, m: PlannedMeal) => (b?.name || recipeFor(m)?.name || mealTitle(m)).trim();
  const portionsText = (n: number) => `${n} ${n === 1 ? 'portion' : 'portions'}`;

  /** Put portions back into a batch (or bring the batch back if it was used up). */
  const addToFreezer = (batchId: string, portions: number, fallback: BatchItem) => {
    if (liveBatch(batchId)) storeRef.current.changeBatch(batchId, (b) => ({ ...b, portions: b.portions + portions }));
    else storeRef.current.addBatch({ ...fallback, id: batchId, portions });
  };
  /** Take portions out of a batch (removing it when it's empty). */
  const takeFromFreezer = (batchId: string, portions: number): { took: number; left: number; snapshot?: BatchItem } => {
    const b = liveBatch(batchId);
    if (!b) return { took: 0, left: 0 };
    const took = Math.min(portions, b.portions);
    const left = b.portions - took;
    // Gone when it's empty.
    storeRef.current.changeBatch(b.id, (latestBatch) => (left <= 0 ? null : { ...latestBatch, portions: left }));
    return left <= 0 ? { took, left: 0, snapshot: b } : { took, left };
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

  /** Eating at a different time tonight (back to the usual time tomorrow). */
  const saveDinnerTime = (v: string) => {
    setEditingTime(false);
    if (parseClock(v) === null || v === dinnerTime) return;
    store.updatePreferences({ eatAtTonight: v === eatAt.usual ? undefined : { date: todayIso, time: v } });
    setToast({ text: v === eatAt.usual ? `Back to your usual ${clockText(parseClock(v)!)}` : `Eating at ${clockText(parseClock(v)!)} tonight. Your usual time is in Settings.` });
  };

  // ---------- Day panel actions (same panel as Planning) ----------
  /** Change the week's days (from its latest copy), with Undo that puts back just the days it changed. */
  const changeDays = (change: (days: Record<string, DayPlan>) => Record<string, DayPlan>, text: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const after = change(before.days);
    storeRef.current.changeMealPlan(before.id, (p) => ({ ...p, days: change(p.days) }));
    setToast({ text, undo: () => storeRef.current.changeMealPlan(before.id, (p) => ({ ...p, days: undoDays(p.days, before.days, after) })) });
  };
  const moveDay = (from: string, to: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const r = moveMeal(before.days, from, to);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    changeDays((days) => moveMeal(days, from, to).days, (r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh);
  };
  const removeDay = (day: string, mealId: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const without = (days: Record<string, DayPlan>) => (days[day]
      ? relinkLeftovers({ ...days, [day]: { ...days[day], meals: days[day].meals.filter((m) => m.id !== mealId) } })
      : { days, freshDays: [] as string[] });
    const fresh = without(before.days).freshDays;
    changeDays((days) => without(days).days, `Removed from ${day}.${fresh.length ? ` ${fresh.join(' and ')} now cooked fresh.` : ''}`);
  };
  const saveNote = (day: string, mealId: string, note: string) => {
    if (!plan) return;
    patchMeal(plan.id, day, mealId, (m) => ({ ...m, note: note.trim() || undefined }));
    setToast({ text: note.trim() ? 'Note saved' : 'Note removed' });
  };

  const startCooking = (planId: string, day: string, meal: PlannedMeal, servings?: number) => {
    if (!recipeFor(meal)) return;
    setDaySheet(null);
    setViewing(null);
    setCooking({ planId, day, meal, servings });
  };

  // Open at today's card (Monday to Sunday are all there; earlier days are just above).
  const todayInPlan = plan && isThisWeek ? DAYS_OF_WEEK.find((d) => plan.days[d] && dayISO(plan, d) === todayIso) : undefined;
  useEffect(() => {
    if (!todayInPlan) { scrollRef.current?.scrollTo?.({ top: 0 }); return; }
    const raf = requestAnimationFrame(() => {
      const box = scrollRef.current;
      const el = box?.querySelector(`[data-cook-row="${todayInPlan}"]`) as HTMLElement | null;
      if (box && el) box.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12) });
    });
    return () => cancelAnimationFrame(raf);
    // Also on a different week, even when today's day is the same name.
  }, [plan?.id, todayInPlan]);

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center app-page p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400"><ChefHat className="w-7 h-7" /></div>
        <h2 className="text-lg font-semibold text-zinc-900">Nothing planned yet</h2>
        <p className="text-sm text-zinc-600 mt-1 max-w-xs">Plan the week and it'll show here, with what to cook tonight.</p>
        <button type="button" onClick={() => onNavigateTab?.('planning')} className="mt-4 h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer">Go to Planning</button>
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

  // ---------- Today's card gets more: when to start, and anything to do tonight for tomorrow ----------
  const todayPanel = (() => {
    if (!isThisWeek || !tonight) return null;
    const { meal } = tonight;
    const recipe = recipeFor(meal);
    const minutes = !meal ? 0 : meal.type === 'recipe' ? recipeMinutes(recipe, methodFor(recipe)) : REHEAT_MINUTES[meal.type] || 0;
    const start = minutes ? startBy(dinnerTime, minutes) : null;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const dinner = parseClock(dinnerTime)!;
    const verb = meal?.type === 'recipe' ? 'Start' : 'Start reheating';
    const timeLine = start === null ? null : nowMins > dinner ? null : nowMins >= start ? `${verb} now to eat at` : `${verb} by ${clockText(start)} to eat at`;
    const showTime = !!meal && isCookable(meal) && !meal.cooked;

    const tm = tomorrowMeal?.meal || null;
    const b = tm?.batchId ? batches.find((x) => x.id === tm.batchId) || null : null;
    const prep = tm ? prepTonight(tm, recipeFor(tm), b?.name || recipeFor(tm)?.name) : null;
    if (!showTime && !prep) return null;

    return (
      <div className="mt-2 space-y-1.5" data-tonight={tonight.day}>
        {showTime && (
          <div className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[13px] text-emerald-950" data-start-by>
            <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-px" />
            {editingTime ? (
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                Eat at
                <input type="time" defaultValue={dinnerTime} autoFocus onBlur={(e) => saveDinnerTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveDinnerTime((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingTime(false); }}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-1.5 text-[13px]" data-dinner-input aria-label="Dinner time tonight" />
                <span className="text-emerald-900/70">just tonight</span>
              </span>
            ) : (
              <span className="min-w-0">
                <span className="font-semibold">{timeLine || 'Eat at'}</span>{' '}
                <button type="button" onClick={() => setEditingTime(true)} className="font-bold underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center gap-0.5" data-dinner-time aria-label={`Dinner at ${clockText(dinner)}. Change it for tonight`}>
                  {clockText(dinner)}<Pencil className="w-3 h-3 text-emerald-700/70" />
                </button>
                {eatAt.tonightOnly && (
                  <span className="block text-emerald-900/70" data-eat-at-tonight>
                    Just tonight · usually {clockText(parseClock(eatAt.usual)!)}{' '}
                    <button type="button" onClick={() => saveDinnerTime(eatAt.usual)} className="font-semibold underline underline-offset-2 cursor-pointer" data-eat-at-reset>use {clockText(parseClock(eatAt.usual)!)}</button>
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {prep && (
          <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-950" data-prep-tonight>
            {tm?.type === 'batch' ? <Snowflake className="w-4 h-4 shrink-0 mt-px text-cyan-700" /> : <Moon className="w-4 h-4 shrink-0 mt-px text-amber-700" />}
            <span><span className="font-semibold">For tomorrow{tomorrowMeal && tomorrowMeal.plan.id !== plan.id ? ' (next week)' : ''}:</span> {prep}</span>
          </div>
        )}
      </div>
    );
  })();

  const sheetDay = daySheet ? rows.find((r) => r.day === daySheet) || (tonight && tonight.day === daySheet ? { day: tonight.day, meal: tonight.meal } : null) : null;
  const sheetMeal = sheetDay?.meal || null;
  const sheetRecipe = recipeFor(sheetMeal);

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      <header className="app-bar border-b px-2 sm:px-5 py-1.5 shrink-0 relative z-20">
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
          <button type="button" onClick={() => onNavigateTab?.('planning', plan.id)} className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 cursor-pointer shrink-0 inline-flex items-center gap-1.5" aria-label="Change the plan in Planning" data-cook-to-planning>
            <Pencil className="w-3.5 h-3.5" />Plan
          </button>
        </div>
      </header>

      {/* Cooking mode shows its own */}
      {!cooking && <TimerBar />}

      <div className="flex-1 overflow-y-auto" ref={scrollRef} data-cook-scroll>
        <div className="max-w-2xl mx-auto px-3 pt-2.5 pb-24">
          <div className="space-y-2" data-cook-week>
            {rows.map(({ day, meal, iso, isToday, isPast }) => {
              const recipe = recipeFor(meal);
              const method = methodFor(recipe);
              return (
                <DayCard
                  key={day}
                  day={day}
                  iso={iso}
                  updatedBy={meal ? plan.days[day]?.updatedBy : undefined}
                  ratings={recipe ? ratingsFor(store.state.preferences?.ratings, recipe.id) : undefined}
                  me={store.currentUser || 'P'}
                  onRate={recipe ? () => setRating({ recipeId: recipe.id, name: recipe.name }) : undefined}
                  meal={meal}
                  recipe={recipe}
                  isToday={isToday}
                  isTomorrow={iso === tomorrowIso}
                  isPast={isPast}
                  fromDay={meal ? leftoverSourceDay(plan.days, day, meal) : null}
                  after={meal ? leftoversAfter(plan.days, day, meal) : { extra: 0, days: [] }}
                  prep={recipe ? Number(recipe.methodPrepTime?.[method as keyof typeof recipe.methodPrepTime] ?? recipe.prepTime) || 0 : 0}
                  cook={recipe ? Number(recipe.methodCookTime?.[method as keyof typeof recipe.methodCookTime] ?? recipe.cookTime) || 0 : 0}
                  onOpen={() => setDaySheet(day)}
                  onTick={() => meal && setCooked(plan.id, day, meal.id, !meal.cooked)}
                  onMove={() => setMoving(day)}
                  onCook={() => meal && startCooking(plan.id, day, meal)}
                  onRecipe={() => {
                    if (!meal || !recipe) return;
                    const a = leftoversAfter(plan.days, day, meal);
                    setViewing({ planId: plan.id, day, meal, recipe, servings: (meal.servings || 2) + a.extra });
                  }}
                  onNote={() => setNoting(day)}
                  onPlan={() => onNavigateTab?.('planning', plan.id)}
                  todayPanel={isToday ? todayPanel : null}
                />
              );
            })}
          </div>
        </div>
      </div>

      {toast && <Notice text={toast.text} action={toast.undo ? { label: 'Undo', run: toast.undo } : undefined} onDone={() => setToast(null)} />}

      {moving && plan.days[moving]?.meals?.[0] && (
        <MoveSheet
          day={moving}
          meal={plan.days[moving].meals[0]}
          days={DAYS_OF_WEEK.filter((d) => plan.days[d]).map((d) => ({ day: d, label: shortDay(plan, d), meal: plan.days[d].meals?.[0] || null }))}
          onMove={(to) => { const from = moving; setMoving(null); moveDay(from, to); }}
          onClose={() => setMoving(null)}
        />
      )}

      {noting && plan.days[noting]?.meals?.[0] && (() => {
        const m = plan.days[noting].meals[0];
        return (
          <NoteSheet
            key={`${noting}-${m.id}`}
            title={`${noting}: ${mealTitle(m)}`}
            note={m.note || ''}
            onSave={(note) => { const d = noting; setNoting(null); saveNote(d, m.id, note); }}
            onClose={() => setNoting(null)}
          />
        );
      })()}

      {rating && (
        <div className="fixed inset-0 z-[60] bg-zinc-900/30 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setRating(null)}>
          <div role="dialog" aria-label={`Rate ${rating.name}`} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()} data-rate-sheet={rating.name}>
            <div>
              <p className="text-sm font-semibold text-zinc-500">How was it?</p>
              <h3 className="text-lg font-bold text-zinc-900 leading-snug">{rating.name}</h3>
            </div>
            <RatingRows ratings={ratingsFor(store.state.preferences?.ratings, rating.recipeId)} me={store.currentUser || 'P'} onRate={(n) => rateRecipe(rating.recipeId, n)} size="lg" />
            <button type="button" onClick={() => setRating(null)} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer" data-rate-done>Done</button>
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
                className={`flex-1 h-12 rounded-xl border font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${sheetMeal.cooked ? 'border-zinc-300 text-zinc-700' : 'border-emerald-600 bg-emerald-600 text-white'}`} data-day-tick>
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

/** How each kind of meal is labelled ("Freezer", "Takeaway"); a fresh cook needs no label. */
const TYPE_CHIP: Record<string, { tone: string; icon: React.ReactNode }> = {
  leftover: { tone: 'bg-amber-50 text-amber-800', icon: <RotateCcw className="w-3 h-3" /> },
  batch: { tone: 'bg-cyan-50 text-cyan-800', icon: <Snowflake className="w-3 h-3" /> },
  takeout: { tone: 'bg-orange-50 text-orange-800', icon: <ShoppingBag className="w-3 h-3" /> },
  eating_out: { tone: 'bg-blue-50 text-blue-800', icon: <Utensils className="w-3 h-3" /> },
  no_meal: { tone: 'bg-zinc-100 text-zinc-600', icon: <X className="w-3 h-3" /> },
};
const TYPE_LABEL: Record<string, string> = { leftover: 'Leftovers', batch: 'Freezer', takeout: 'Takeaway', eating_out: 'Eating out', no_meal: 'No meal' };

/**
 * One day, compact: the date down the left, the meal and one line about it (kind, people, time,
 * extra for leftovers, sides), the note if there is one, a tick on the right and small buttons
 * underneath (Swap, Recipe, Note) that wrap rather than spill off the card. The recipe has
 * Start cooking; today's card has its own big button.
 * Today's card adds when to start, what to do tonight for tomorrow and a Start cooking button.
 */
function DayCard({
  day, meal, iso, recipe, isToday, isTomorrow, isPast, fromDay, after, prep, cook, updatedBy, ratings, me, onRate,
  onOpen, onTick, onMove, onCook, onRecipe, onNote, onPlan, todayPanel,
}: {
  key?: React.Key;
  day: string;
  /** Peter's and Rachel's stars for the recipe, who's using this phone, and "Rate it". */
  ratings?: PersonRatings;
  me?: string;
  onRate?: () => void;
  /** Who last changed this day's meal: a blue (Peter) / pink (Rachel) mark. */
  updatedBy?: string;
  iso: string;
  meal: PlannedMeal | null;
  recipe: Recipe | null;
  isToday: boolean;
  isTomorrow: boolean;
  isPast: boolean;
  fromDay: string | null;
  after: { extra: number; days: string[] };
  prep: number;
  cook: number;
  onOpen: () => void;
  onTick: () => void;
  onMove: () => void;
  onCook: () => void;
  onRecipe: () => void;
  onNote: () => void;
  onPlan: () => void;
  todayPanel?: React.ReactNode;
}) {
  const date = new Date(iso + 'T00:00:00');
  const d = meal ? describeMeal(meal, fromDay) : null;
  const cooked = !!meal?.cooked;
  // Leftover days amber, freezer meals faint ice blue.
  const tone = dayTone(meal);
  const note = (d?.note || '').trim();
  const canCook = meal?.type === 'recipe' && !!recipe && !cooked;
  const title = meal ? mealTitle(meal) : '';
  const chipText = !meal || meal.type === 'recipe' ? '' : meal.type === 'leftover' ? (d?.label?.text || 'Leftovers') : TYPE_LABEL[meal.type] || '';
  const showChip = !!chipText && chipText.toLowerCase() !== title.toLowerCase();
  const people = meal ? (meal.servings || 2) + after.extra : 0;
  const minutes = prep + cook;
  const eats = !!meal && meal.type !== 'takeout' && meal.type !== 'eating_out' && meal.type !== 'no_meal';

  // One line about the meal; it's cut short rather than wrapping.
  const facts: React.ReactNode[] = [];
  if (meal && eats) {
    facts.push(after.extra > 0
      ? <span key="p" className="text-amber-800 font-semibold" data-cook-extra>Cook for {people} ({after.extra} for {after.days.map((x) => x.slice(0, 3)).join(', ')})</span>
      : <span key="p">{people} {people === 1 ? 'person' : 'people'}</span>);
  }
  if (meal?.type === 'recipe' && minutes) facts.push(<span key="t" data-cook-times-row>{minutes} min</span>);
  if (meal?.sides?.length) facts.push(<span key="s">with {meal.sides.map((x) => x.name.toLowerCase()).join(', ')}</span>);
  // Past days just need the tick (the panel has the rest).
  const showButtons = !!meal && (!isPast || isToday);

  const pill = 'h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap';

  return (
    <section
      className={`rounded-xl ${tone ? tone.card.split(' ')[0] : 'bg-white'} ${isToday ? 'border-2 border-emerald-500 shadow-sm px-3 py-2.5' : `border ${tone ? tone.card.split(' ')[1] : 'border-zinc-200'} px-3 py-2`} ${isPast && !isToday ? 'opacity-70' : ''}`}
      data-cook-row={day}
      data-day-tone={tone?.kind}
    >
      <div className="flex items-start gap-2.5">
        {/* Date */}
        <div className={`w-9 shrink-0 text-center leading-none pt-0.5 ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`} aria-label={`${day} ${date.getDate()}`}>
          <div className="text-[11px] font-bold uppercase">{day.slice(0, 3)}</div>
          <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-emerald-800' : 'text-zinc-900'}`}>{date.getDate()}</div>
          {(isToday || isTomorrow) && <div className={`text-[9px] font-bold uppercase mt-0.5 ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`}>{isToday ? 'Today' : 'Tmrw'}</div>}
        </div>

        {/* Meal */}
        <div className="min-w-0 flex-1">
          {!meal ? (
            <div className="flex items-center justify-between gap-2 min-h-9">
              <span className="text-sm text-zinc-400">Nothing planned</span>
              <button type="button" onClick={onPlan} className="h-8 px-2 text-xs font-semibold text-zinc-600 inline-flex items-center gap-0.5 cursor-pointer">Plan<ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button type="button" onClick={onOpen} className="block w-full text-left cursor-pointer" data-cook-open>
              <span className={`block font-semibold leading-snug break-words ${isToday ? 'text-[17px]' : 'text-[15px]'} ${cooked ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-900'}`}>{title}{updatedBy && <PersonMark who={updatedBy} what="Last changed" className="ml-1.5 align-[2px] no-underline" />}</span>
              {(showChip || facts.length > 0) && (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 min-w-0 whitespace-nowrap" data-cook-people>
                  {showChip && (
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-px font-semibold ${TYPE_CHIP[meal.type]?.tone || 'bg-zinc-100 text-zinc-600'}`}>{TYPE_CHIP[meal.type]?.icon}{chipText}</span>
                  )}
                  {facts.length > 0 && (
                    <span className="min-w-0 truncate">
                      {facts.map((f, i) => <React.Fragment key={i}>{i > 0 && <span aria-hidden className="text-zinc-300"> · </span>}{f}</React.Fragment>)}
                    </span>
                  )}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Tick */}
        {meal && isCookable(meal) && (
          <button type="button" onClick={onTick} aria-pressed={cooked} aria-label={cooked ? `Untick ${day}` : `Tick ${day} as cooked`} data-cook-tick={day}
            className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 flex items-center justify-center cursor-pointer">
            <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${cooked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}>{cooked && <Check className="w-4 h-4" />}</span>
          </button>
        )}
      </div>

      {meal && (
        <div className="pl-[46px]">
          {note && (
            <button type="button" onClick={onNote} className={`mt-1 w-full flex items-start gap-1.5 text-left text-[13px] cursor-pointer ${meal.noteBy ? noteLook(meal.noteBy).text : 'text-amber-900'}`} data-cook-note={day} data-note-by={meal.noteBy || undefined}>
              <FileText className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${noteLook(meal.noteBy).icon}`} />
              <span className="min-w-0 flex-1 line-clamp-2 break-words">{note}</span>
            </button>
          )}

          {cooked && recipe && onRate && meal.type === 'recipe' && (
            <button type="button" onClick={onRate} className="mt-1 inline-flex items-center gap-1.5 cursor-pointer" data-cook-rate={day}>
              {ratings && (ratings.P || ratings.R) ? <RatingChip ratings={ratings} /> : null}
              {!(ratings && me && ratings[me as 'P' | 'R']) && (
                <span className="h-7 px-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" />Rate it</span>
              )}
            </button>
          )}

          {recipe && (recipe.notes || '').trim() && (
            <button type="button" onClick={onRecipe} className={`mt-1 w-full flex items-start gap-1.5 text-left text-[13px] cursor-pointer ${recipe.notesBy ? noteLook(recipe.notesBy).text : 'text-amber-900'}`} data-cook-recipe-note={day} data-note-by={recipe.notesBy || undefined}>
              <BookOpen className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${noteLook(recipe.notesBy).icon}`} />
              <span className="min-w-0 flex-1 line-clamp-2 break-words whitespace-pre-line"><span className="font-semibold">Recipe notes: </span>{recipe.notes!.trim()}</span>
            </button>
          )}

          {todayPanel}

          {isToday && canCook && (
            <button type="button" onClick={onCook} className="mt-2 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer" data-tonight-start data-cook-start={day}>
              <ChefHat className="w-4 h-4" />Start cooking
            </button>
          )}

          {showButtons && <div className="mt-2 flex flex-wrap items-center gap-1.5" data-cook-actions>
            <button type="button" onClick={onMove} aria-label={`Move or swap ${day}`} data-cook-move={day} className={`${pill} border-zinc-200 bg-white text-zinc-700`}>
              <ArrowLeftRight className="w-3.5 h-3.5" />Swap
            </button>
            {recipe && (
              <button type="button" onClick={onRecipe} aria-label={`Open the recipe for ${day}`} data-cook-recipe={day} className={`${pill} border-zinc-200 bg-white text-zinc-700`}>
                <BookOpen className="w-3.5 h-3.5" />Recipe
              </button>
            )}
            {!note && (
              <button type="button" onClick={onNote} data-cook-add-note={day} className={`${pill} border-transparent text-zinc-500 hover:bg-zinc-100`}>
                <Plus className="w-3.5 h-3.5" />Note
              </button>
            )}
          </div>}
        </div>
      )}
      {!meal && todayPanel && <div className="pl-[46px]">{todayPanel}</div>}
    </section>
  );
}

/** Move a meal to another day, or swap it with that day's meal (leftovers follow their cook). */
function MoveSheet({ day, meal, days, onMove, onClose }: {
  day: string;
  meal: PlannedMeal;
  days: { day: string; label: string; meal: PlannedMeal | null }[];
  onMove: (to: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div role="dialog" aria-label={`Move ${mealTitle(meal)}`} data-move-sheet={day} className="bg-white w-full sm:max-w-md max-h-[85dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-zinc-500 block">Move or swap · {day}</span>
            <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{mealTitle(meal)}</h3>
            <p className="text-sm text-zinc-600 mt-0.5">Pick a day. A day with a meal swaps with it.</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-3 space-y-1.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {days.filter((x) => x.day !== day).map((x) => (
            <button key={x.day} type="button" onClick={() => onMove(x.day)} data-move-sheet-to={x.day}
              className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 px-3 py-2.5 flex items-center gap-3 cursor-pointer">
              <span className="w-14 text-sm font-bold text-zinc-700 shrink-0">{x.label}</span>
              <span className={`flex-1 min-w-0 text-[15px] truncate ${x.meal ? 'text-zinc-800' : 'text-zinc-400'}`}>{x.meal ? mealTitle(x.meal) : 'Free'}</span>
              <span className={`text-xs font-bold shrink-0 rounded-lg px-2 py-1 ${x.meal ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{x.meal ? 'Swap' : 'Move here'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Add or change a day's note. */
function NoteSheet({ title, note, onSave, onClose }: { key?: React.Key; title: string; note: string; onSave: (note: string) => void; onClose: () => void }) {
  const [text, setText] = useState(note);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div role="dialog" aria-label="Note" data-note-sheet className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <span className="text-sm font-semibold text-zinc-500 block">Note</span>
        <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{title}</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus placeholder="e.g. prep veg in the morning, Pizza from Franco Manca"
          className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-base leading-relaxed outline-none focus:border-emerald-500" data-note-input aria-label="Note" />
        <div className="mt-3 flex items-center gap-2">
          {note && <button type="button" onClick={() => onSave('')} className="h-12 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer" data-note-remove>Remove</button>}
          <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer ml-auto">Cancel</button>
          <button type="button" onClick={() => onSave(text)} className="h-12 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer" data-note-save>Save</button>
        </div>
      </div>
    </div>
  );
}
