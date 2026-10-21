import { useEffect, useMemo, useRef, useState } from 'react';
import { RatingRows } from './Stars';
import { ratingsFor, withRating } from '../ratings';
import Notice from './Notice';
import { ChevronLeft, ChevronRight, ChefHat, Check, Pencil } from 'lucide-react';
import { MealPlan, PlannedMeal, Recipe, BatchItem, DayPlan, UserPreferences, TabName } from '../types';
import { DAYS_OF_WEEK, formatDateISO, getMonday, getNextMonday, isWeekWithinForwardLimit } from '../utils';
import { leftoverSourceDay, moveMeal, relinkLeftovers, cooksForText, undoDays } from '../planning';
import { formatWeekSpan, weekStartShort } from '../shopList';
import {
  recipeMinutes,
  startBy,
  clockText,
  parseClock,
  prepTonight,
  freezePortionsFromNote,
  eatAtFor,
} from '../cookInfo';
import { DaySheet, mealTitle } from './planner/DayListRow';
import { TimerBar } from './cook/TimerBar';
import CookMode from './CookMode';
import { RecipeModal } from './RecipePopup';
import type { AppStore } from '../store';
import { useLatest } from '../hooks/useLatest';
import { DayCard } from './cook/DayCard';
import { TonightPanel } from './cook/TonightPanel';
import { FreezePrompt } from './cook/FreezePrompt';
import { MoveSheet } from './cook/MoveSheet';
import { NoteSheet } from './cook/NoteSheet';
import { REHEAT_MINUTES, dayISO, isCookable, leftoversAfter, shortDay } from './cook/cookDays';

interface CookTabProps {
  store: AppStore;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
}

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
    () =>
      (store.state.mealPlans || [])
        .filter((p: MealPlan) => isWeekWithinForwardLimit(p.startDate))
        .sort((a: MealPlan, b: MealPlan) => a.startDate.localeCompare(b.startDate)),
    [store.state.mealPlans],
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    const all: MealPlan[] = (store.state.mealPlans || []).filter((p: MealPlan) =>
      isWeekWithinForwardLimit(p.startDate),
    );
    return (
      (
        all.find((p) => p.startDate === currentMondayStr) ||
        all.sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
      )?.id || null
    );
  });
  const plan: MealPlan | null =
    plans.find((p) => p.id === selectedPlanId) ||
    plans.find((p) => p.startDate === currentMondayStr) ||
    plans[0] ||
    null;
  const planIndex = plan ? plans.findIndex((p) => p.id === plan.id) : -1;
  const prevPlan = planIndex > 0 ? plans[planIndex - 1] : null;
  const nextPlan = planIndex >= 0 && planIndex < plans.length - 1 ? plans[planIndex + 1] : null;
  const weekName = (start?: string) =>
    !start
      ? 'Cook'
      : start === currentMondayStr
        ? 'This week'
        : start === nextMondayStr
          ? 'Next week'
          : `w/c ${weekStartShort(start)}`;
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
    store.updatePreferences((p) => ({
      ratings: withRating(p.ratings, recipeId, store.currentUser || 'P', stars, new Date().toISOString().slice(0, 10)),
    }));
  };
  const [moving, setMoving] = useState<string | null>(null);
  const [noting, setNoting] = useState<string | null>(null);
  const [cooking, setCooking] = useState<{ planId: string; day: string; meal: PlannedMeal; servings?: number } | null>(
    null,
  );
  const [viewing, setViewing] = useState<{
    planId: string;
    day: string;
    meal: PlannedMeal;
    recipe: Recipe;
    servings: number;
  } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [freezePrompt, setFreezePrompt] = useState<{
    planId: string;
    day: string;
    mealId: string;
    name: string;
    recipeId?: string;
    portions: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const livePlan = (planId: string): MealPlan | null =>
    (latest().mealPlans || []).find((p: MealPlan) => p.id === planId) || null;
  /** Change one meal, on the latest copy of the week. */
  const patchMeal = (planId: string, day: string, mealId: string, patch: (m: PlannedMeal) => PlannedMeal) => {
    storeRef.current.changeMealPlan(planId, (p) => {
      const dp = p.days[day];
      if (!dp) return null;
      return {
        ...p,
        days: { ...p.days, [day]: { ...dp, meals: dp.meals.map((m) => (m.id === mealId ? patch(m) : m)) } },
      };
    });
  };
  const liveBatch = (id: string): BatchItem | null =>
    (latest().batches || []).find((b: BatchItem) => b.id === id) || null;
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
  const setCooked = (
    planId: string,
    day: string,
    mealId: string,
    cooked: boolean,
    extra?: { froze?: { batchId: string; portions: number } },
  ) => {
    const p = livePlan(planId);
    const meal = p?.days[day]?.meals.find((m) => m.id === mealId);
    if (!p || !meal || !!meal.cooked === cooked) return;
    const undo = () => setCooked(planId, day, mealId, !cooked);
    const title = mealTitle(meal);

    if (cooked) {
      if (meal.type === 'batch' && meal.batchId && !meal.tookFromFreezer) {
        const b = liveBatch(meal.batchId);
        const r = takeFromFreezer(meal.batchId, meal.servings || 2);
        patchMeal(planId, day, mealId, (m) => ({
          ...m,
          cooked: true,
          tookFromFreezer: r.took
            ? { batchId: meal.batchId!, portions: r.took, ...(r.snapshot ? { batch: r.snapshot } : {}) }
            : undefined,
        }));
        setToast({
          text: r.took
            ? `Took ${portionsText(r.took)} of ${batchName(b, meal)} out of the freezer · ${r.left ? `${r.left} left` : 'none left'}`
            : `${title} ticked`,
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
        setFreezePrompt({
          planId,
          day,
          mealId,
          name: recipeFor(meal)?.name || title,
          recipeId: meal.recipeId,
          portions: freeze,
        });
        return;
      }
      setToast({ text: `${title} ticked as cooked`, undo });
      return;
    }

    // Unticking: undo what ticking did to the freezer.
    const notes: string[] = [];
    if (meal.tookFromFreezer) {
      const t = meal.tookFromFreezer;
      addToFreezer(
        t.batchId,
        t.portions,
        t.batch || {
          id: t.batchId,
          name: recipeFor(meal)?.name || title,
          recipeId: meal.recipeId,
          portions: t.portions,
          dateAdded: new Date().toISOString(),
        },
      );
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
    if (portions <= 0) {
      setToast({ text: `${f.name} ticked as cooked`, undo: () => setCooked(f.planId, f.day, f.mealId, false) });
      return;
    }
    const batchId = crypto.randomUUID();
    storeRef.current.addBatch({
      id: batchId,
      name: f.name,
      recipeId: f.recipeId,
      portions,
      dateAdded: new Date().toISOString(),
    });
    patchMeal(f.planId, f.day, f.mealId, (m) => ({ ...m, froze: { batchId, portions } }));
    setToast({
      text: `${portionsText(portions)} of ${f.name} added to the freezer`,
      undo: () => setCooked(f.planId, f.day, f.mealId, false),
    });
  };

  /** Eating at a different time tonight (back to the usual time tomorrow). */
  const saveDinnerTime = (v: string) => {
    if (parseClock(v) === null || v === dinnerTime) return;
    store.updatePreferences({ eatAtTonight: v === eatAt.usual ? undefined : { date: todayIso, time: v } });
    setToast({
      text:
        v === eatAt.usual
          ? `Back to your usual ${clockText(parseClock(v)!)}`
          : `Eating at ${clockText(parseClock(v)!)} tonight. Your usual time is in Settings.`,
    });
  };

  // ---------- Day panel actions (same panel as Planning) ----------
  /** Change the week's days (from its latest copy), with Undo that puts back just the days it changed. */
  const changeDays = (change: (days: Record<string, DayPlan>) => Record<string, DayPlan>, text: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const after = change(before.days);
    storeRef.current.changeMealPlan(before.id, (p) => ({ ...p, days: change(p.days) }));
    setToast({
      text,
      undo: () =>
        storeRef.current.changeMealPlan(before.id, (p) => ({ ...p, days: undoDays(p.days, before.days, after) })),
    });
  };
  const moveDay = (from: string, to: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const r = moveMeal(before.days, from, to);
    const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
    changeDays(
      (days) => moveMeal(days, from, to).days,
      (r.swapped ? `Swapped ${from} and ${to}.` : `Moved to ${to}.`) + fresh,
    );
  };
  const removeDay = (day: string, mealId: string) => {
    const before = plan && livePlan(plan.id);
    if (!before) return;
    const without = (days: Record<string, DayPlan>) =>
      days[day]
        ? relinkLeftovers({ ...days, [day]: { ...days[day], meals: days[day].meals.filter((m) => m.id !== mealId) } })
        : { days, freshDays: [] as string[] };
    const fresh = without(before.days).freshDays;
    changeDays(
      (days) => without(days).days,
      `Removed from ${day}.${fresh.length ? ` ${fresh.join(' and ')} now cooked fresh.` : ''}`,
    );
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
  const todayInPlan =
    plan && isThisWeek ? DAYS_OF_WEEK.find((d) => plan.days[d] && dayISO(plan, d) === todayIso) : undefined;
  useEffect(() => {
    if (!todayInPlan) {
      scrollRef.current?.scrollTo?.({ top: 0 });
      return;
    }
    const raf = requestAnimationFrame(() => {
      const box = scrollRef.current;
      const el = box?.querySelector(`[data-cook-row="${todayInPlan}"]`) as HTMLElement | null;
      if (box && el)
        box.scrollTo({
          top: Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12),
        });
    });
    return () => cancelAnimationFrame(raf);
    // Also on a different week, even when today's day is the same name.
  }, [plan?.id, todayInPlan]);

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center app-page p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400">
          <ChefHat className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">Nothing planned yet</h2>
        <p className="text-sm text-zinc-600 mt-1 max-w-xs">
          Plan the week and it'll show here, with what to cook tonight.
        </p>
        <button
          type="button"
          onClick={() => onNavigateTab?.('planning')}
          className="mt-4 h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
        >
          Go to Planning
        </button>
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
    const minutes = !meal
      ? 0
      : meal.type === 'recipe'
        ? recipeMinutes(recipe, methodFor(recipe))
        : REHEAT_MINUTES[meal.type] || 0;
    const start = minutes ? startBy(dinnerTime, minutes) : null;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const dinner = parseClock(dinnerTime)!;
    const verb = meal?.type === 'recipe' ? 'Start' : 'Start reheating';
    const timeLine =
      start === null
        ? null
        : nowMins > dinner
          ? null
          : nowMins >= start
            ? `${verb} now to eat at`
            : `${verb} by ${clockText(start)} to eat at`;
    const showTime = !!meal && isCookable(meal) && !meal.cooked;

    const tm = tomorrowMeal?.meal || null;
    const b = tm?.batchId ? batches.find((x) => x.id === tm.batchId) || null : null;
    const prep = tm ? prepTonight(tm, recipeFor(tm), b?.name || recipeFor(tm)?.name) : null;
    if (!showTime && !prep) return null;

    return (
      <TonightPanel
        day={tonight.day}
        showTime={showTime}
        timeLine={timeLine}
        dinnerTime={dinnerTime}
        eatAt={eatAt}
        onSaveTime={saveDinnerTime}
        prep={prep}
        prepFromFreezer={tm?.type === 'batch'}
        prepNextWeek={!!tomorrowMeal && tomorrowMeal.plan.id !== plan.id}
      />
    );
  })();

  const sheetDay = daySheet
    ? rows.find((r) => r.day === daySheet) ||
      (tonight && tonight.day === daySheet ? { day: tonight.day, meal: tonight.meal } : null)
    : null;
  const sheetMeal = sheetDay?.meal || null;
  const sheetRecipe = recipeFor(sheetMeal);

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      <header className="app-bar border-b px-2 sm:px-5 py-1.5 shrink-0 relative z-20">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 min-w-0">
            <button
              type="button"
              onClick={() => prevPlan && setSelectedPlanId(prevPlan.id)}
              disabled={!prevPlan}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
              aria-label="Previous week"
              data-cook-week-prev
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 px-0.5 text-center">
              <div className="text-[15px] font-bold text-zinc-900 whitespace-nowrap leading-tight" data-cook-week-name>
                {weekName(plan.startDate)}
              </div>
              <div className="text-xs text-zinc-500 whitespace-nowrap leading-tight" data-cook-week-status>
                {formatWeekSpan(plan.startDate)} · {cookedCount} of {cookable.length} cooked
              </div>
            </div>
            <button
              type="button"
              onClick={() => nextPlan && setSelectedPlanId(nextPlan.id)}
              disabled={!nextPlan}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
              aria-label="Next week"
              data-cook-week-next
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('planning', plan.id)}
            className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 cursor-pointer shrink-0 inline-flex items-center gap-1.5"
            aria-label="Change the plan in Planning"
            data-cook-to-planning
          >
            <Pencil className="w-3.5 h-3.5" />
            Plan
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
                  prep={
                    recipe
                      ? Number(
                          recipe.methodPrepTime?.[method as keyof typeof recipe.methodPrepTime] ?? recipe.prepTime,
                        ) || 0
                      : 0
                  }
                  cook={
                    recipe
                      ? Number(
                          recipe.methodCookTime?.[method as keyof typeof recipe.methodCookTime] ?? recipe.cookTime,
                        ) || 0
                      : 0
                  }
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
        <Notice
          text={toast.text}
          action={toast.undo ? { label: 'Undo', run: toast.undo } : undefined}
          onDone={() => setToast(null)}
        />
      )}

      {moving && plan.days[moving]?.meals?.[0] && (
        <MoveSheet
          day={moving}
          meal={plan.days[moving].meals[0]}
          days={DAYS_OF_WEEK.filter((d) => plan.days[d]).map((d) => ({
            day: d,
            label: shortDay(plan, d),
            meal: plan.days[d].meals?.[0] || null,
          }))}
          onMove={(to) => {
            const from = moving;
            setMoving(null);
            moveDay(from, to);
          }}
          onClose={() => setMoving(null)}
        />
      )}

      {noting &&
        plan.days[noting]?.meals?.[0] &&
        (() => {
          const m = plan.days[noting].meals[0];
          return (
            <NoteSheet
              key={`${noting}-${m.id}`}
              title={`${noting}: ${mealTitle(m)}`}
              note={m.note || ''}
              onSave={(note) => {
                const d = noting;
                setNoting(null);
                saveNote(d, m.id, note);
              }}
              onClose={() => setNoting(null)}
            />
          );
        })()}

      {rating && (
        <div
          className="fixed inset-0 z-[60] bg-zinc-900/30 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setRating(null)}
        >
          <div
            role="dialog"
            aria-label={`Rate ${rating.name}`}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
            data-rate-sheet={rating.name}
          >
            <div>
              <p className="text-sm font-semibold text-zinc-500">How was it?</p>
              <h3 className="text-lg font-bold text-zinc-900 leading-snug">{rating.name}</h3>
            </div>
            <RatingRows
              ratings={ratingsFor(store.state.preferences?.ratings, rating.recipeId)}
              me={store.currentUser || 'P'}
              onRate={(n) => rateRecipe(rating.recipeId, n)}
              size="lg"
            />
            <button
              type="button"
              onClick={() => setRating(null)}
              className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer"
              data-rate-done
            >
              Done
            </button>
          </div>
        </div>
      )}

      {freezePrompt && (
        <FreezePrompt
          key={freezePrompt.mealId}
          name={freezePrompt.name}
          portions={freezePrompt.portions}
          onChoose={confirmFreeze}
        />
      )}

      {daySheet && sheetMeal && (
        <DaySheet
          key={`${daySheet}-${sheetMeal.id}`}
          day={daySheet}
          dayPlan={plan.days[daySheet]}
          meal={sheetMeal}
          cooksFor={cooksForText(plan.days, daySheet, sheetMeal)}
          fromDay={leftoverSourceDay(plan.days, daySheet, sheetMeal)}
          plannedDays={DAYS_OF_WEEK.map((d) => ({
            day: d,
            date: plan.days[d]?.date,
            meal: plan.days[d]?.meals?.[0] || null,
          }))}
          hasRecipe={!!sheetRecipe}
          onSave={(patch) =>
            patchMeal(plan.id, daySheet, sheetMeal.id, (m) => ({
              ...m,
              servings: m.type === 'no_meal' ? 0 : Math.max(1, Math.min(24, patch.servings)),
              note: patch.note || undefined,
            }))
          }
          onChangeMeal={() => {
            setDaySheet(null);
            onNavigateTab?.('planning', plan.id);
          }}
          onMove={(to) => {
            setDaySheet(null);
            moveDay(daySheet, to);
          }}
          onRemove={() => {
            setDaySheet(null);
            removeDay(daySheet, sheetMeal.id);
          }}
          onOpenRecipe={
            sheetRecipe
              ? () => {
                  const after = leftoversAfter(plan.days, daySheet, sheetMeal);
                  setViewing({
                    planId: plan.id,
                    day: daySheet,
                    meal: sheetMeal,
                    recipe: sheetRecipe,
                    servings: (sheetMeal.servings || 2) + after.extra,
                  });
                  setDaySheet(null);
                }
              : undefined
          }
          onClose={() => setDaySheet(null)}
          extra={
            isCookable(sheetMeal) ? (
              <div className="flex gap-2" data-day-cook-actions>
                {sheetMeal.type === 'recipe' && sheetRecipe && !sheetMeal.cooked && (
                  <button
                    type="button"
                    onClick={() => startCooking(plan.id, daySheet, sheetMeal)}
                    className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    data-day-start-cooking
                  >
                    <ChefHat className="w-5 h-5" />
                    Start cooking
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCooked(plan.id, daySheet, sheetMeal.id, !sheetMeal.cooked);
                    setDaySheet(null);
                  }}
                  className={`flex-1 h-12 rounded-xl border font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${sheetMeal.cooked ? 'border-zinc-300 text-zinc-700' : 'border-emerald-600 bg-emerald-600 text-white'}`}
                  data-day-tick
                >
                  <Check className="w-5 h-5" />
                  {sheetMeal.cooked ? 'Untick' : sheetMeal.type === 'recipe' ? 'Tick as cooked' : 'Tick as done'}
                </button>
              </div>
            ) : null
          }
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
          meal={cooking.meal}
          activePlan={livePlan(cooking.planId) || undefined}
          initialServings={cooking.servings}
          onClose={() => setCooking(null)}
          onMarkCooked={(mealId, cooked, extra) => setCooked(cooking.planId, cooking.day, mealId, cooked, extra)}
        />
      )}
    </div>
  );
}
