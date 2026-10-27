/**
 * Auto populate: meals for the week's empty days from your cookbook, using up last week's
 * leftovers first. Three steps:
 *  1. "Still got these?": what's probably left from the week before (src/leftovers.ts), to tick
 *     or untick, and anything else you want to use up.
 *  2. "Your week": which days, busy nights, how many people, and what sort of week.
 *  3. The suggested meals (src/autoPlan.ts): Another, leave a day empty, Shuffle, and ideas from
 *     Gemini for what's left (written out and checked on the usual Add a recipe screen, saved to
 *     the cookbook and put on the day you pick). Then "Put on the week".
 * What you kept in step 1 is saved on the week, so it comes off the week's shopping.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Minus, Plus, RefreshCw, Shuffle, Snowflake, Sparkles, WandSparkles, X } from 'lucide-react';
import type { AutoPlanMood, MealPlan, OnHandItem, Recipe } from '../../types';
import { WEEK_DAYS } from '../../planning';
import { freezerGroups, planDayDate } from '../../freezer';
import { recipeHistories, todayISO } from '../../recipeInfo';
import { averagesById } from '../../ratings';
import { formatDateISO, getCatalog } from '../../utils';
import {
  leftoverAmountText,
  toOnHand,
  typedLeftover,
  keepsForDays,
  weekLeftovers,
  type Leftover,
} from '../../leftovers';
import {
  QUICK_MINUTES,
  andList,
  anotherPick,
  pickId,
  recipeUses,
  suggestWeek,
  unusedLeftovers,
  weekUses,
  type AutoPlanAnswers,
  type AutoPlanContext,
  type DayPick,
} from '../../autoPlan';
import { NoGeminiKeyError, geminiDetail, suggestMealIdeasApi, type MealIdea } from '../../services/geminiService';
import { AddRecipe } from '../AddRecipe';
import { MealIdeaCard, useIdeasInView } from '../MealIdeaCard';
import { messageOf } from '../../errors';
import type { AppStore } from '../../store';

type Step = 'left' | 'week' | 'picks';

const MOODS: { id: AutoPlanMood; label: string }[] = [
  { id: 'favourites', label: 'Favourites' },
  { id: 'mix', label: 'A mix' },
  { id: 'new', label: 'Something new' },
];

/** The Monday a week before. */
function weekBefore(startDate: string): string {
  const d = new Date(startDate + 'T12:00:00');
  d.setDate(d.getDate() - 7);
  return formatDateISO(d);
}

/** A leftover kept on the week before, as one to show again (typed ones, or ones no longer worked out). */
function fromOnHand(h: OnHandItem, catalog: ReturnType<typeof getCatalog>): Leftover {
  const p = h.groceryId ? catalog.byId.get(h.groceryId) : undefined;
  return {
    key: h.id,
    name: h.name,
    ...(h.groceryId ? { groceryId: h.groceryId } : {}),
    amount: h.amount,
    unit: h.unit,
    useWithin: keepsForDays(h.name, p?.aisle ?? null, p?.cupboard) ?? 7,
    why: 'You added it',
    added: true,
  };
}

const chip = (on: boolean, disabled = false) =>
  `h-9 min-w-11 px-2.5 rounded-lg border text-sm font-semibold transition-colors ${
    disabled
      ? 'border-zinc-100 bg-zinc-50 text-zinc-300 cursor-not-allowed'
      : on
        ? 'border-emerald-600 bg-emerald-600 text-white cursor-pointer'
        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer'
  }`;

export default function AutoPopulateSheet({
  store,
  plan,
  day,
  weekLabel,
  defaultServings,
  onApply,
  onClose,
}: {
  store: AppStore;
  /** The week being filled. */
  plan: MealPlan;
  /** Started from this day's "Select meal": just this day to begin with (its meal, if any, is replaced). */
  day?: string;
  weekLabel: (startDate: string) => string;
  defaultServings: number;
  onApply: (picks: DayPick[], people: number, onHand: OnHandItem[]) => void;
  onClose: () => void;
}) {
  const s = store.state;
  const prefs = s.preferences;
  const [today] = useState(todayISO);
  const catalog = useMemo(() => getCatalog(), []);
  const lastStart = weekBefore(plan.startDate);
  const lastWeek = s.mealPlans.find((p) => p.startDate === lastStart);
  const lastLabel = weekLabel(lastStart);
  const lastText = /^(This|Last|Next) Week$/.test(lastLabel) ? lastLabel.toLowerCase() : `the week of ${lastLabel}`;

  // ---- Step 1: what's left ----
  const [found] = useState<Leftover[]>(() =>
    weekLeftovers({
      plan: lastWeek,
      recipes: s.recipes,
      shoppingList: s.shoppingList,
      catalog,
      today,
      staples: prefs?.recurringItems,
    }),
  );
  // Done before for this week: what you kept then is ticked, and what you added is back.
  const [keep, setKeep] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(found.map((l) => [l.key, !plan.onHand || plan.onHand.some((h) => h.id === l.key)])),
  );
  const [typed, setTyped] = useState<Leftover[]>(() =>
    (plan.onHand || []).filter((h) => !found.some((l) => l.key === h.id)).map((h) => fromOnHand(h, catalog)),
  );
  const [typing, setTyping] = useState('');
  const confirmed = useMemo(
    () => [...found.filter((l) => keep[l.key] && !typed.some((t) => t.key === l.key)), ...typed],
    [found, keep, typed],
  );
  const addTyped = () => {
    const l = typedLeftover(typing, catalog);
    if (!l) return;
    setTyped((list) => [...list.filter((t) => t.key !== l.key), l]);
    setTyping('');
  };

  // ---- Step 2: the week ----
  const fillable = (d: string) => d === day || (!plan.days[d]?.meals?.length && planDayDate(plan, d) >= today);
  const [days, setDays] = useState<string[]>(() => (day ? [day] : WEEK_DAYS.filter(fillable)));
  // The meal being replaced doesn't count as planned (its recipe can come up again; it uses nothing).
  const weekNow = useMemo(
    () =>
      day && plan.days[day]?.meals?.length
        ? { ...plan, days: { ...plan.days, [day]: { ...plan.days[day], meals: [] } } }
        : plan,
    [plan, day],
  );
  const [busy, setBusy] = useState<string[]>(() => prefs?.autoPlanBusyDays || []);
  const [people, setPeople] = useState(defaultServings);
  const [mood, setMood] = useState<AutoPlanMood>(prefs?.autoPlanMood || 'mix');
  const [useFreezer, setUseFreezer] = useState(prefs?.autoPlanFreezer !== false);
  const freezer = useMemo(
    () => freezerGroups(s.batches, s.recipes, s.mealPlans, today).filter((g) => g.spare > 0),
    [s.batches, s.recipes, s.mealPlans, today],
  );
  const toggle = (list: string[], day: string) =>
    list.includes(day) ? list.filter((d) => d !== day) : WEEK_DAYS.filter((d) => d === day || list.includes(d));

  // ---- Step 3: the suggestions ----
  const [step, setStep] = useState<Step>('left');
  const [seed, setSeed] = useState(1);
  const [picks, setPicks] = useState<DayPick[]>([]);
  const [seen, setSeen] = useState<Record<string, string[]>>({});
  const [dayNote, setDayNote] = useState<Record<string, string>>({});
  const answers: AutoPlanAnswers = {
    days,
    busyDays: busy.filter((d) => days.includes(d)),
    people,
    mood,
    useFreezer: useFreezer && freezer.length > 0,
  };
  const alreadyUses = useMemo(
    () => weekUses(weekNow, s.recipes, confirmed, catalog),
    [weekNow, s.recipes, confirmed, catalog],
  );
  const ctx = (): AutoPlanContext => ({
    recipes: store.state.recipes,
    leftovers: confirmed,
    catalog,
    history: recipeHistories(s.mealPlans, today),
    ratings: prefs?.ratings,
    freezer,
    weekStart: plan.startDate,
    today,
    plannedRecipeIds: WEEK_DAYS.flatMap((d) => (weekNow.days[d]?.meals || []).map((m) => m.recipeId || '')).filter(
      Boolean,
    ),
    alreadyUses,
    seed,
  });

  const suggest = (nextSeed = seed) => {
    setPicks(suggestWeek(answers, { ...ctx(), seed: nextSeed }));
    setSeen({});
    setDayNote({});
  };
  const toSuggestions = () => {
    // Remember the answers for next time (both phones).
    const was = prefs;
    const busyNow = answers.busyDays;
    if (
      JSON.stringify(was?.autoPlanBusyDays || []) !== JSON.stringify(busyNow) ||
      (was?.autoPlanMood || 'mix') !== mood ||
      (was?.autoPlanFreezer !== false) !== useFreezer
    ) {
      store.updatePreferences({ autoPlanBusyDays: busyNow, autoPlanMood: mood, autoPlanFreezer: useFreezer });
    }
    suggest();
    setStep('picks');
  };
  const another = (day: string) => {
    const current = picks.find((p) => p.day === day);
    const skip = [...(seen[day] || []), ...(current ? [pickId(current)] : [])];
    const next = anotherPick(day, picks, answers, ctx(), skip);
    if (!next) {
      setDayNote((n) => ({ ...n, [day]: current ? 'Nothing else to suggest for this day.' : 'Nothing to suggest.' }));
      if (current) setSeen((v) => ({ ...v, [day]: [] }));
      return;
    }
    setSeen((v) => ({ ...v, [day]: skip }));
    setDayNote((n) => ({ ...n, [day]: '' }));
    setPicks((list) => [...list.filter((p) => p.day !== day), next]);
  };
  const leaveEmpty = (day: string) => setPicks((list) => list.filter((p) => p.day !== day));
  const keptPicks = picks.filter((p) => days.includes(p.day));

  // ---- Ideas from Gemini for what's left ----
  const [ideas, setIdeas] = useState<MealIdea[] | null>(null);
  const ideasRef = useIdeasInView(ideas);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState({ text: '', detail: '' });
  const [ideaDay, setIdeaDay] = useState<Record<string, string>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState<{ idea: MealIdea; day: string } | null>(null);
  const unused = unusedLeftovers(confirmed, keptPicks, alreadyUses);
  const forIdeas = unused.length ? unused : confirmed;
  const leftText = (l: Leftover) => `${leftoverAmountText(l, catalog)} ${l.name.toLowerCase()}`;
  // The day an idea goes on: one with nothing yet, else the one whose pick uses least of what's left.
  const defaultIdeaDay = () =>
    days.find((d) => !keptPicks.some((p) => p.day === d)) ||
    [...keptPicks].sort(
      (a, b) =>
        Object.keys(a.uses).length - Object.keys(b.uses).length || a.score - b.score || a.day.localeCompare(b.day),
    )[0]?.day ||
    days[0];
  const askIdeas = async () => {
    setIdeasBusy(true);
    setIdeasError({ text: '', detail: '' });
    try {
      const recipes = store.state.recipes;
      const stars = averagesById(prefs?.ratings);
      const got = await suggestMealIdeasApi(forIdeas.map(leftText), {
        people,
        appliance: prefs?.preferredCookingMethod || 'all',
        liked: recipes
          .filter((r: Recipe) => r.favourite || r.verdict === 'again' || (stars.get(r.id) ?? 0) >= 4)
          .map((r) => r.name),
        disliked: recipes.filter((r: Recipe) => r.verdict === 'not_for_us').map((r) => r.name),
        have: recipes.map((r) => r.name),
      });
      setIdeas(got);
      const d = defaultIdeaDay();
      setIdeaDay(Object.fromEntries(got.map((i) => [i.name, d])));
      if (!got.length) setIdeasError({ text: 'Gemini had no ideas this time. Try again.', detail: '' });
    } catch (err) {
      setIdeasError(
        err instanceof NoGeminiKeyError
          ? { text: 'Gemini needs its key first: add it in Settings → Phone.', detail: '' }
          : { text: messageOf(err) || 'Something went wrong. Please try again.', detail: geminiDetail(err) },
      );
    } finally {
      setIdeasBusy(false);
    }
  };
  const ideaText = (idea: MealIdea) => {
    const uses = forIdeas.filter((l) => idea.uses.some((u) => u.toLowerCase().includes(l.name.toLowerCase())));
    return `${idea.name} for ${people}. ${idea.description} Use up ${(uses.length ? uses : forIdeas)
      .map(leftText)
      .join(', ')}.`;
  };
  const savedIdea = (recipe: Recipe) => {
    if (!writing) return;
    const day = writing.day;
    const uses = recipeUses(recipe, people, confirmed, catalog);
    const usedNames = confirmed.filter((l) => uses[l.key]).map((l) => l.name.toLowerCase());
    setPicks((list) => [
      ...list.filter((p) => p.day !== day),
      {
        day,
        kind: 'recipe',
        recipeId: recipe.id,
        name: recipe.name,
        reasons: [
          'New: written by Gemini, now in your cookbook',
          ...(usedNames.length ? [`Uses your ${andList(usedNames.slice(0, 3))}`] : []),
        ],
        uses,
        score: 100,
      },
    ]);
    setWritten((w) => ({ ...w, [writing.idea.name]: day }));
    setWriting(null);
  };

  const title = step === 'left' ? 'Still got these?' : step === 'week' ? 'Your week' : 'Suggested meals';
  const stepNo = step === 'left' ? 1 : step === 'week' ? 2 : 3;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Auto populate"
          data-auto-populate={step}
        >
          <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
                <WandSparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-zinc-900 leading-tight">{title}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Auto populate {day || weekLabel(plan.startDate)} · step {stepNo} of 3
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {step === 'left' && (
              <>
                <p className="text-sm text-zinc-600">
                  {found.length
                    ? `Probably left over from ${lastText}. Untick anything you've used or thrown away: the rest gets used first, and comes off the shopping.`
                    : lastWeek
                      ? `Nothing obvious left over from ${lastText}.`
                      : `There's no plan for ${lastText} to work out leftovers from.`}
                </p>
                {found.length > 0 && (
                  <ul className="space-y-1.5" data-leftovers>
                    {found.map((l) => {
                      const on = !!keep[l.key] && !typed.some((t) => t.key === l.key);
                      return (
                        <li key={l.key}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => setKeep((k) => ({ ...k, [l.key]: !on }))}
                            data-leftover={l.name}
                            className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                              on ? 'border-emerald-200 bg-emerald-50/50' : 'border-zinc-200 bg-white'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'
                              }`}
                            >
                              {on && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className={`text-sm font-semibold ${on ? 'text-zinc-900' : 'text-zinc-500'}`}>
                                  {l.name}
                                  {l.useWithin <= 2 && (
                                    <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-px">
                                      Use first
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-zinc-600 tabular-nums shrink-0">
                                  {leftoverAmountText(l, catalog)}
                                </span>
                              </span>
                              <span className="block text-xs text-zinc-500 mt-0.5">{l.why}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {typed.length > 0 && (
                  <ul className="space-y-1.5" data-typed-leftovers>
                    {typed.map((l) => (
                      <li
                        key={l.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50"
                      >
                        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 truncate">{l.name}</span>
                        <span className="text-xs text-zinc-600 tabular-nums shrink-0">
                          {leftoverAmountText(l, catalog)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setTyped((list) => list.filter((t) => t.key !== l.key))}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white cursor-pointer"
                          aria-label={`Take off ${l.name}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTyped();
                  }}
                >
                  <input
                    value={typing}
                    onChange={(e) => setTyping(e.target.value)}
                    placeholder="Anything else to use up? (half a cabbage)"
                    aria-label="Anything else to use up?"
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <button
                    type="submit"
                    disabled={!typing.trim()}
                    className="h-10 px-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </form>
              </>
            )}

            {step === 'week' && (
              <>
                <section>
                  <h4 className="text-sm font-semibold text-zinc-900">Days to fill</h4>
                  <p className="text-xs text-zinc-500 mb-2">
                    {day && plan.days[day]?.meals?.length
                      ? `${day}'s meal is replaced. Other days that already have a meal, or have gone, stay as they are.`
                      : 'Days that already have a meal, or have gone, stay as they are.'}
                  </p>
                  <div className="flex flex-wrap gap-1.5" data-fill-days>
                    {WEEK_DAYS.map((d) => {
                      const can = fillable(d);
                      const meal = plan.days[d]?.meals?.[0];
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={!can}
                          aria-pressed={days.includes(d)}
                          onClick={() => setDays((list) => toggle(list, d))}
                          className={chip(days.includes(d), !can)}
                          title={meal ? `${d}: ${meal.name}` : can ? d : `${d} has gone`}
                          data-fill-day={d}
                        >
                          {d.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  {!WEEK_DAYS.some(fillable) && (
                    <p className="text-sm text-amber-800 mt-2">
                      Every day of this week already has a meal. Take one off to fill it.
                    </p>
                  )}
                </section>

                {days.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold text-zinc-900">Busy nights</h4>
                    <p className="text-xs text-zinc-500 mb-2">
                      Only quick meals ({QUICK_MINUTES} min or less)
                      {freezer.length ? ', or something from the freezer' : ''}.
                    </p>
                    <div className="flex flex-wrap gap-1.5" data-busy-days>
                      {days.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={busy.includes(d)}
                          onClick={() => setBusy((list) => toggle(list, d))}
                          className={chip(busy.includes(d))}
                          data-busy-day={d}
                        >
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">People</h4>
                    <p className="text-xs text-zinc-500">Each meal is for this many.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPeople((n) => Math.max(1, n - 1))}
                      className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center cursor-pointer"
                      aria-label="Fewer people"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center text-base font-semibold tabular-nums" data-people>
                      {people}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPeople((n) => Math.min(24, n + 1))}
                      className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center cursor-pointer"
                      aria-label="More people"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-semibold text-zinc-900 mb-2">What sort of week?</h4>
                  <div className="grid grid-cols-3 gap-1 bg-zinc-100 p-1 rounded-xl" role="radiogroup">
                    {MOODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={mood === m.id}
                        onClick={() => setMood(m.id)}
                        className={`h-9 rounded-lg text-sm font-semibold cursor-pointer ${
                          mood === m.id ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                        }`}
                        data-mood={m.id}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </section>

                {freezer.length > 0 && (
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                        <Snowflake className="w-4 h-4 text-cyan-600" />
                        Freezer meals on busy nights
                      </span>
                      <span className="block text-xs text-zinc-500">Nothing to cook, nothing to buy.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={useFreezer}
                      onChange={(e) => setUseFreezer(e.target.checked)}
                      className="w-5 h-5 accent-emerald-600 shrink-0"
                      data-use-freezer
                    />
                  </label>
                )}
              </>
            )}

            {step === 'picks' && (
              <>
                <p className="text-sm text-zinc-600">
                  {store.state.recipes.length
                    ? 'Tap Another for something else, or × to leave a day empty.'
                    : 'Your cookbook is empty, so there is nothing to suggest yet. Gemini can suggest some below.'}
                </p>
                <ul className="space-y-1.5">
                  {days.map((day) => {
                    const pick = keptPicks.find((p) => p.day === day);
                    return (
                      <li key={day} className="rounded-xl border border-zinc-200 px-3 py-2.5" data-pick-day={day}>
                        <div className="flex items-start gap-3">
                          <span className="w-9 shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 pt-0.5">
                            {day.slice(0, 3)}
                          </span>
                          <div className="min-w-0 flex-1">
                            {pick ? (
                              <>
                                <div className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                                  {pick.kind === 'freezer' && (
                                    <Snowflake className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                                  )}
                                  <span className="min-w-0" data-pick-name>
                                    {pick.name}
                                  </span>
                                </div>
                                {pick.reasons.length > 0 && (
                                  <div className="text-xs text-zinc-500 mt-0.5" data-pick-why>
                                    {pick.reasons.join(' · ')}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-zinc-400 italic">Left empty</div>
                            )}
                            {dayNote[day] && <p className="text-xs text-amber-800 mt-1">{dayNote[day]}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => another(day)}
                              className="h-8 px-2 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 flex items-center gap-1 hover:bg-zinc-50 cursor-pointer"
                              aria-label={pick ? `Another for ${day}` : `Suggest one for ${day}`}
                              data-another={day}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>{pick ? 'Another' : 'Suggest'}</span>
                            </button>
                            {pick && (
                              <button
                                type="button"
                                onClick={() => leaveEmpty(day)}
                                className="w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center cursor-pointer"
                                aria-label={`Leave ${day} empty`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-gemini-ideas>
                  <div>
                    <h4 className="text-sm font-semibold text-violet-950">
                      {confirmed.length && unused.length
                        ? `Not used up yet: ${unused.map((l) => l.name.toLowerCase()).join(', ')}`
                        : 'New meals from Gemini'}
                    </h4>
                    <p className="text-xs text-violet-900/80 mt-0.5">
                      {confirmed.length
                        ? 'Gemini can suggest new meals that use them up. Pick one and it writes the recipe; check it, save it to your cookbook, and it goes on the day you choose.'
                        : 'Tell Gemini what you have in step 1 and it can suggest new meals that use it up.'}
                    </p>
                  </div>
                  {confirmed.length > 0 && (
                    <button
                      type="button"
                      onClick={askIdeas}
                      disabled={ideasBusy}
                      className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                      data-ask-ideas
                    >
                      <Sparkles className="w-4 h-4" />
                      {ideasBusy ? 'Thinking…' : ideas ? 'Other ideas' : 'Ideas from Gemini'}
                    </button>
                  )}
                  {ideasError.text && (
                    <div className="text-sm text-rose-800" role="alert">
                      {ideasError.text}
                      {ideasError.detail && (
                        <span className="block text-[11px] text-rose-700/80 mt-0.5">{ideasError.detail}</span>
                      )}
                    </div>
                  )}
                  {ideas && ideas.length > 0 && (
                    <ul className="space-y-1.5 scroll-mt-2" data-ideas ref={ideasRef}>
                      {ideas.map((idea) => {
                        const day = ideaDay[idea.name] || days[0];
                        return (
                          <MealIdeaCard key={idea.name} idea={idea}>
                            {written[idea.name] ? (
                              <p className="text-xs font-semibold text-emerald-700 mt-1.5 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> In your cookbook, on {written[idea.name]}
                              </p>
                            ) : (
                              days.length > 0 && (
                                <div className="flex items-center gap-2 mt-2">
                                  <label className="text-xs text-zinc-600 flex items-center gap-1">
                                    For
                                    <select
                                      value={day}
                                      onChange={(e) => setIdeaDay((m) => ({ ...m, [idea.name]: e.target.value }))}
                                      className="h-8 px-1.5 rounded-lg border border-zinc-200 text-xs bg-white"
                                      aria-label={`Day for ${idea.name}`}
                                    >
                                      {days.map((d) => (
                                        <option key={d} value={d}>
                                          {d}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setWriting({ idea, day })}
                                    className="h-8 px-2.5 rounded-lg border border-violet-300 text-violet-800 text-xs font-semibold hover:bg-violet-50 cursor-pointer"
                                    data-write-idea
                                  >
                                    Write it
                                  </button>
                                </div>
                              )
                            )}
                          </MealIdeaCard>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-zinc-100 flex items-center gap-2 shrink-0">
            {step === 'left' ? (
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(step === 'picks' ? 'week' : 'left')}
                className="h-11 px-3 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step === 'picks' && (
              <button
                type="button"
                onClick={() => {
                  setSeed((n) => n + 1);
                  suggest(seed + 1);
                }}
                className="h-11 px-3 text-zinc-700 font-medium border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm flex items-center gap-1 cursor-pointer"
                data-shuffle
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </button>
            )}
            <button
              type="button"
              disabled={(step === 'week' && days.length === 0) || (step === 'picks' && keptPicks.length === 0)}
              onClick={() => {
                if (step === 'left') setStep('week');
                else if (step === 'week') toSuggestions();
                else onApply(keptPicks, people, confirmed.map(toOnHand));
              }}
              className="ml-auto h-11 px-4 text-white font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm disabled:opacity-40 cursor-pointer"
              data-ap-next
            >
              {step === 'left' ? 'Next' : step === 'week' ? 'Suggest meals' : `Put ${keptPicks.length} on the week`}
            </button>
          </div>
        </div>
      </div>

      {/* Outside the window above, so taps on it don't count as tapping outside the window. */}
      {writing && (
        <AddRecipe
          store={store}
          initialMode="generate"
          autoStart
          initialText={ideaText(writing.idea)}
          onClose={() => setWriting(null)}
          onSaved={savedIdea}
        />
      )}
    </>
  );
}
