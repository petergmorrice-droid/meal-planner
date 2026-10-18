import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChefHat, Check, Clock, Snowflake, Moon, Minus, Plus, Pencil,
  ArrowLeftRight, RotateCcw, ShoppingBag, Utensils, X, FileText, BookOpen, Sparkles,
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
  const patchMeal = (planId: string, day: string, mealId: string, patch: (m: PlannedMeal) => PlannedMeal) => {
    const p = livePlan(planId);
    const dp = p?.days[day];
    if (!p || !dp) return;
    storeRef.current.updateMealPlan({ ...p, days: { ...p.days, [day]: { ...dp, meals: dp.meals.map((m) => (m.id === mealId ? patch(m) : m)) } } });
  };
  const liveBatch = (id: string): BatchItem | null => (latest().batches || []).find((b: BatchItem) => b.id === id) || null;
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
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const r = moveMeal(before.days, from, to);
    writeDays(before, r.days);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    setToast({ text: (r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh, undo: () => { const live = livePlan(before.id); if (live) writeDays(live, before.days); } });
  };
  const removeDay = (day: string, mealId: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const dp = before.days[day];
    const r = relinkLeftovers({ ...before.days, [day]: { ...dp, meals: dp.meals.filter((m) => m.id !== mealId) } });
    writeDays(before, r.days);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    setToast({ text: `Removed from ${day}.${fresh}`, undo: () => { const live = livePlan(before.id); if (live) writeDays(live, before.days); } });
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
  }, [plan?.id, todayInPlan]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---------- Today's card gets more: when to start, and anything to do tonight for tomorrow ----------
  const todayPanel = (() => {
    if (!isThisWeek || !tonight) return null;
    const { day, meal } = tonight;
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
      <div className="mt-3 space-y-2" data-tonight={day}>
        {showTime && (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-[15px] text-emerald-950" data-start-by>
            <Clock className="w-5 h-5 text-emerald-700 shrink-0 mt-px" />
            {editingTime ? (
              <span className="inline-flex items-center gap-2 flex-wrap">
                Eat at
                <input type="time" defaultValue={dinnerTime} autoFocus onBlur={(e) => saveDinnerTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveDinnerTime((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingTime(false); }}
                  className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-[15px]" data-dinner-input aria-label="Dinner time" />
              </span>
            ) : (
              <span className="min-w-0">
                <span className="font-semibold">{timeLine || 'Eat at'}</span>{' '}
                <button type="button" onClick={() => setEditingTime(true)} className="font-bold underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center gap-0.5" data-dinner-time aria-label={`Dinner at ${clockText(dinner)}. Change it`}>
                  {clockText(dinner)}<Pencil className="w-3 h-3 text-emerald-700/70" />
                </button>
                {minutes > 0 && meal!.type === 'recipe' && <span className="block text-sm text-emerald-900/70">{minutes} min of prep and cooking</span>}
              </span>
            )}
          </div>
        )}
        {prep && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[15px] text-amber-950" data-prep-tonight>
            {tm?.type === 'batch' ? <Snowflake className="w-5 h-5 shrink-0 mt-px text-cyan-700" /> : <Moon className="w-5 h-5 shrink-0 mt-px text-amber-700" />}
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

      <div className="flex-1 overflow-y-auto" ref={scrollRef} data-cook-scroll>
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24 space-y-3">
          <div className="space-y-3" data-cook-week>
            {rows.map(({ day, meal, iso, isToday, isPast }) => {
              const recipe = recipeFor(meal);
              const method = methodFor(recipe);
              return (
                <DayCard
                  key={day}
                  day={day}
                  dateText={new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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

const TYPE_STYLE: Record<string, { label: string; text: string; tile: string; icon: React.ReactNode }> = {
  recipe: { label: 'Fresh cook', text: 'text-emerald-700', tile: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <ChefHat className="w-5 h-5" /> },
  leftover: { label: 'Leftovers', text: 'text-amber-700', tile: 'bg-amber-50 border-amber-200 text-amber-700', icon: <RotateCcw className="w-5 h-5" /> },
  batch: { label: 'Freezer', text: 'text-cyan-700', tile: 'bg-cyan-50 border-cyan-200 text-cyan-700', icon: <Snowflake className="w-5 h-5" /> },
  takeout: { label: 'Takeaway', text: 'text-orange-700', tile: 'bg-orange-50 border-orange-200 text-orange-600', icon: <ShoppingBag className="w-5 h-5" /> },
  eating_out: { label: 'Eating out', text: 'text-blue-700', tile: 'bg-blue-50 border-blue-200 text-blue-600', icon: <Utensils className="w-5 h-5" /> },
  no_meal: { label: 'No meal', text: 'text-zinc-500', tile: 'bg-zinc-100 border-zinc-200 text-zinc-500', icon: <X className="w-5 h-5" /> },
};

/**
 * One day of the week: what's on, how long it takes, who for, sides, what it's cooking extra for,
 * the note, and the buttons you use most (tick, swap, recipe, cook). Today's card also says when
 * to start and anything to do tonight for tomorrow, with a big Start cooking button.
 * The buttons share the card's width evenly, so they always fit.
 */
function DayCard({
  day, dateText, meal, recipe, isToday, isTomorrow, isPast, fromDay, after, prep, cook,
  onOpen, onTick, onMove, onCook, onRecipe, onNote, onPlan, todayPanel,
}: {
  key?: React.Key;
  day: string;
  dateText: string;
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
  const style = meal ? TYPE_STYLE[meal.type] || TYPE_STYLE.recipe : null;
  const d = meal ? describeMeal(meal, fromDay) : null;
  const cooked = !!meal?.cooked;
  const label = meal?.type === 'leftover' ? (d?.label?.text || 'Leftovers') : style?.label;
  const people = meal ? (meal.servings || 2) + after.extra : 0;
  const note = (d?.note || '').trim();
  const canCook = meal?.type === 'recipe' && !!recipe && !cooked;
  const times = !meal ? null
    : meal.type === 'recipe' ? [prep ? `Prep ${prep}m` : '', cook ? `Cook ${cook}m` : ''].filter(Boolean).join(' · ')
    : meal.type === 'leftover' ? 'Reheat'
    : meal.type === 'batch' ? 'Heat through'
    : null;

  const btn = 'h-14 min-w-0 px-1 rounded-xl border text-[12px] font-semibold flex flex-col items-center justify-center gap-0.5 cursor-pointer';
  const actions: React.ReactNode[] = [];
  if (meal && isCookable(meal)) {
    actions.push(
      <button key="tick" type="button" onClick={onTick} aria-pressed={cooked} aria-label={cooked ? `Untick ${day}` : `Tick ${day} as cooked`} data-cook-tick={day}
        className={`${btn} ${cooked ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-zinc-300 text-zinc-700'}`}>
        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${cooked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-400 bg-white'}`}>{cooked && <Check className="w-3.5 h-3.5" />}</span>
        <span className="truncate max-w-full">{meal.type === 'recipe' ? 'Cooked' : 'Done'}</span>
      </button>,
    );
  }
  if (meal) {
    actions.push(
      <button key="swap" type="button" onClick={onMove} aria-label={`Move or swap ${day}`} data-cook-move={day} className={`${btn} bg-white border-zinc-300 text-zinc-700`}>
        <ArrowLeftRight className="w-5 h-5" /><span className="truncate max-w-full">Swap</span>
      </button>,
    );
  }
  if (recipe) {
    actions.push(
      <button key="recipe" type="button" onClick={onRecipe} aria-label={`Open the recipe for ${day}`} data-cook-recipe={day} className={`${btn} bg-white border-zinc-300 text-zinc-700`}>
        <BookOpen className="w-5 h-5" /><span className="truncate max-w-full">Recipe</span>
      </button>,
    );
  }
  if (canCook && !isToday) {
    actions.push(
      <button key="cook" type="button" onClick={onCook} data-cook-start={day} className={`${btn} bg-emerald-600 border-emerald-600 text-white`}>
        <ChefHat className="w-5 h-5" /><span className="truncate max-w-full">Cook</span>
      </button>,
    );
  }

  return (
    <section
      className={`rounded-2xl bg-white overflow-hidden ${isToday ? 'border-2 border-emerald-500 shadow-md' : 'border border-zinc-200'} ${isPast && !isToday ? 'opacity-80' : ''}`}
      data-cook-row={day}
    >
      <div className={`px-3.5 py-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b ${isToday ? 'bg-emerald-50 border-emerald-100' : 'bg-zinc-50 border-zinc-100'}`}>
        <span className={`text-sm font-bold ${isToday ? 'text-emerald-900' : 'text-zinc-900'}`}>{day}</span>
        <span className={`text-xs ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`}>{dateText}</span>
        {isToday && <span className="text-[11px] font-bold uppercase tracking-wide bg-emerald-600 text-white rounded-full px-2 py-px">Today</span>}
        {isTomorrow && <span className="text-[11px] font-semibold bg-zinc-200 text-zinc-700 rounded-full px-2 py-px">Tomorrow</span>}
        {times && <span className="ml-auto text-xs font-medium text-zinc-600 whitespace-nowrap" data-cook-times-row>{times}</span>}
      </div>

      {!meal ? (
        <div className="px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-zinc-500">Nothing planned</span>
            <button type="button" onClick={onPlan} className="h-10 text-sm font-semibold text-zinc-700 inline-flex items-center gap-0.5 cursor-pointer">Plan a meal<ChevronRight className="w-4 h-4" /></button>
          </div>
          {todayPanel}
        </div>
      ) : (
        <div className="px-3.5 pt-3 pb-3">
          <button type="button" onClick={onOpen} className="w-full flex items-start gap-3 text-left cursor-pointer" data-cook-open>
            {recipe?.imageUrl ? (
              <span className={`relative rounded-xl overflow-hidden border border-zinc-200 shrink-0 ${isToday ? 'w-16 h-16' : 'w-14 h-14'}`}>
                <img src={recipe.imageUrl} alt="" className={`w-full h-full object-cover ${cooked ? 'grayscale' : ''}`} />
                {cooked && <span className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center"><Check className="w-5 h-5 text-white" /></span>}
              </span>
            ) : (
              <span className={`rounded-xl border flex items-center justify-center shrink-0 ${isToday ? 'w-16 h-16' : 'w-14 h-14'} ${cooked ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : style!.tile}`}>
                {cooked ? <Check className="w-6 h-6" /> : style!.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 flex-wrap">
                {label && label.toLowerCase() !== mealTitle(meal).toLowerCase() && <span className={`text-[11px] font-bold uppercase tracking-wide ${cooked ? 'text-zinc-500' : style!.text}`}>{label}</span>}
                {cooked && <span className="inline-flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-wide rounded bg-emerald-100 text-emerald-800 px-1.5"><Check className="w-3 h-3" />{meal.type === 'recipe' ? 'Cooked' : 'Done'}</span>}
              </span>
              <span className={`block font-bold leading-snug break-words ${isToday ? 'text-xl' : 'text-base'} ${cooked ? 'text-zinc-500 line-through decoration-zinc-300' : 'text-zinc-900'}`}>{mealTitle(meal)}</span>
              <span className="block text-[13px] text-zinc-600 mt-0.5" data-cook-people>
                {meal.type === 'no_meal' ? 'No cooking' : `${people} ${people === 1 ? 'person' : 'people'}`}
                {meal.sides && meal.sides.length > 0 && <> · With {meal.sides.map((s) => `${s.name}${s.amount ? ` (${s.amount}${s.unit ? ` ${s.unit}` : ''})` : ''}`).join(', ')}</>}
              </span>
              {!cooked && after.extra > 0 && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900" data-cook-extra>
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />Cook for {people}: {after.extra} extra for {after.days.join(' and ')}
                </span>
              )}
              {!cooked && meal.type === 'batch' && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-xs font-semibold text-cyan-900">
                  <Snowflake className="w-3.5 h-3.5 text-cyan-600 shrink-0" />From the freezer: take it out the night before
                </span>
              )}
            </span>
          </button>

          {note ? (
            <button type="button" onClick={onNote} className="mt-2.5 w-full flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-left cursor-pointer" data-cook-note={day}>
              <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0 text-sm text-amber-950 whitespace-pre-line break-words">{note}</span>
              <span className="text-xs font-bold text-amber-700 shrink-0 mt-0.5">Edit</span>
            </button>
          ) : (
            <div className="flex justify-end -mt-1">
              <button type="button" onClick={onNote} className="h-8 px-2 rounded-lg text-[13px] font-semibold text-zinc-500 inline-flex items-center gap-1 cursor-pointer hover:bg-zinc-100" data-cook-add-note={day}>
                <Plus className="w-3.5 h-3.5" />Add a note
              </button>
            </div>
          )}

          {todayPanel}

          {isToday && canCook && (
            <button type="button" onClick={onCook} className="mt-3 w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer" data-tonight-start data-cook-start={day}>
              <ChefHat className="w-5 h-5" />Start cooking
            </button>
          )}

          <div className={`${note || todayPanel || (isToday && canCook) ? 'mt-3' : 'mt-1'} pt-3 border-t border-zinc-100 grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${Math.max(3, actions.length)}, minmax(0, 1fr))` }} data-cook-actions>
            {actions}
          </div>
        </div>
      )}
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
              <span className={`text-xs font-bold shrink-0 rounded-lg px-2 py-1 ${x.meal ? 'bg-zinc-900 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{x.meal ? 'Swap' : 'Move here'}</span>
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
          <button type="button" onClick={() => onSave(text)} className="h-12 px-5 rounded-xl bg-zinc-900 text-white text-sm font-semibold cursor-pointer" data-note-save>Save</button>
        </div>
      </div>
    </div>
  );
}
