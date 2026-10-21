import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RatingRows } from './Stars';
import { ratingsFor, withRating } from '../ratings';
import PersonMark, { noteLook } from './PersonMark';
import { formatCookingAmount } from '../shopping';
import {
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Plus,
  Minus,
  Check,
  Timer,
  Type,
  Volume2,
  VolumeX,
  Snowflake,
  Refrigerator,
  NotebookPen,
  Mic,
  MicOff,
  MessageCircleQuestionMark,
  Send,
  LoaderCircle,
  X,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import { Recipe, PlannedMeal, MealPlan, CookingMethod, Ingredient } from '../types';
import { scaleRecipeStepQuantities, DAYS_OF_WEEK } from '../utils';
import { ingredientsForStep, stepMinutes, stepTimerLabel, timeLeft, timerText, freezePortionsFromNote } from '../cookInfo';
import { useCookTimers } from '../hooks/useCookTimers';
import { TimerBar } from './cook/TimerBar';
import { canSpeak, speak, stopSpeaking } from '../speech';
import { canListen, createListener, parseAlternatives, VoiceCommand } from '../voiceCommands';
import { askAboutRecipeApi, NoGeminiKeyError } from '../services/geminiService';
import type  { AppStore } from '../store';
import { useScreenAwake } from '../hooks/phone';

interface CookModeProps {
  store: AppStore;
  dayName: string;
  meals: PlannedMeal[];
  initialActiveMealId: string;
  onClose: () => void;
  activePlan?: MealPlan;
  /** Tick the meal as cooked; `froze` says what was put in the freezer from the Finished screen. */
  onMarkCooked?: (mealId: string, cooked: boolean, extra?: { froze?: { batchId: string; portions: number } }) => void;
  initialServings?: number;
}

const METHOD_LABEL: Record<string, string> = { oven_hob: 'Oven/Hob', ninja: 'Ninja' };
const readPref = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const savePref = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* per phone */ } };

/** "500 g potatoes", "4 pork sausages", "salt" for an ingredient at this scale. */
function ingredientLine(ing: Ingredient, scale: number): { amount: string; name: string } {
  const amount = formatCookingAmount((Number(ing.amount) || 0) * scale, ing.unit);
  return { amount: amount ? `${amount}${ing.unit ? ` ${ing.unit}` : ''}` : '', name: ing.name };
}

/**
 * Cooking mode: one column of steps, starting with "Get everything out". Each step shows what it
 * uses and can start a named timer. Big steps shows one step at a time in large text with a big
 * Next button; Read aloud reads each step out. Finishing asks what matters: fridge, freezer, how
 * it was and a note for next time.
 */
export default function CookMode({
  store,
  dayName,
  meals,
  initialActiveMealId,
  onClose,
  activePlan,
  onMarkCooked,
  initialServings,
}: CookModeProps) {
  useScreenAwake();
  const { timers, now, start, stop } = useCookTimers();
  const [activeMealId, setActiveMealId] = useState<string>(initialActiveMealId);
  const [finished, setFinished] = useState(false);
  const [big, setBig] = useState(() => readPref('cook_big_steps'));
  const speechOK = useMemo(() => canSpeak(), []);
  const [readAloud, setReadAloud] = useState(() => speechOK && readPref('cook_read_aloud'));
  const readAloudRef = useRef(readAloud);
  readAloudRef.current = readAloud;
  const [speaking, setSpeaking] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  useEffect(() => {
    if (!readNote) return;
    const t = setTimeout(() => setReadNote(null), 8000);
    return () => clearTimeout(t);
  }, [readNote]);

  const activeMeal = useMemo(() => meals.find((m) => m.id === activeMealId) || meals[0], [meals, activeMealId]);
  const recipe = useMemo<Recipe | null>(
    () => (activeMeal?.recipeId ? store.state.recipes.find((r: Recipe) => r.id === activeMeal.recipeId) || null : null),
    [store.state.recipes, activeMeal],
  );

  // Cook extra for later leftovers ("Cook for 6: extra for Wednesday").
  const plan = useMemo(() => {
    if (!activeMeal || !recipe) return { servings: 2, leftoverDays: [] as string[], extra: 0, banner: null as string | null };
    if (activeMeal.type === 'leftover') return { servings: activeMeal.servings || 2, leftoverDays: [], extra: 0, banner: 'Leftovers: just reheat until piping hot.' };
    if (activeMeal.type === 'batch') return { servings: activeMeal.servings || 2, leftoverDays: [], extra: 0, banner: 'From the freezer: heat it through until piping hot.' };
    const days = activePlan ? DAYS_OF_WEEK.filter((d) => activePlan.days[d]) : [];
    let extra = 0;
    const leftoverDays: string[] = [];
    for (let i = days.indexOf(dayName) + 1; i > 0 && i < days.length; i++) {
      const m = (activePlan!.days[days[i]].meals || []).find((x) => x.recipeId === activeMeal.recipeId);
      if (!m) continue;
      if (m.type === 'leftover') { extra += m.servings || 2; leftoverDays.push(days[i]); } else break;
    }
    const own = activeMeal.servings || 2;
    return {
      servings: own + extra,
      leftoverDays,
      extra,
      banner: extra ? `Cook for ${own + extra}: ${extra} extra for ${leftoverDays.join(' and ')}.` : null,
    };
  }, [activeMeal, recipe, activePlan, dayName]);

  const baseServings = recipe?.servings || 2;
  const [servings, setServings] = useState<number>(initialServings ?? plan.servings);
  useEffect(() => { setServings(initialServings ?? plan.servings); }, [plan.servings, initialServings]);

  const methods = (recipe?.cookingMethods && recipe.cookingMethods.length ? recipe.cookingMethods : ['oven_hob']) as CookingMethod[];
  // Start on the appliance you said you prefer, when the recipe has steps for it.
  const preferred = store.state.preferences?.preferredCookingMethod;
  const firstMethod = (preferred && preferred !== 'all' && methods.includes(preferred) ? preferred : methods[0]) as CookingMethod;
  const [method, setMethod] = useState<CookingMethod>(firstMethod);
  useEffect(() => { setMethod(firstMethod); }, [recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const instructions = useMemo<string[]>(() => {
    if (!recipe) return [];
    return recipe.methodInstructions?.[method] || recipe.instructions || [];
  }, [recipe, method]);

  // Step 0 is "Get everything out"; the recipe's steps follow.
  const stepCount = instructions.length + 1;
  const [step, setStep] = useState(0);
  // The day's note and our notes on the recipe: open to start with, folded once you're past the first step (tap to see again).
  const dayNote = (activeMeal?.note || '').trim();
  const recipeNotes = (recipe?.notes || '').trim();
  const [notesOpen, setNotesOpen] = useState(true);
  const foldedNotes = useRef(false);
  useEffect(() => { if (step > 0 && !foldedNotes.current) { foldedNotes.current = true; setNotesOpen(false); } }, [step]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  useEffect(() => { setTicked({}); setStep(0); }, [activeMealId, method]);

  const scale = servings / baseServings;
  const prep = (recipe?.methodPrepTime?.[method] ?? recipe?.prepTime ?? 0) as number;
  const cook = (recipe?.methodCookTime?.[method] ?? recipe?.cookTime ?? 0) as number;
  const ingredients = recipe?.ingredients || [];
  const tickedCount = ingredients.filter((i, idx) => ticked[i.id || String(idx)]).length;

  // Keep the current step in view in the list.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (big) return;
    const el = listRef.current?.querySelector(`[data-step="${step}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [step, big]);

  // Read each step out as you get to it (Read on). Reading starts from the tap itself, which
  // phones need before they'll speak.
  const stepText = (i: number) => {
    if (i === 0) return `Get everything out. ${ingredients.map((ing) => { const l = ingredientLine(ing, scale); return `${l.amount} ${l.name}`.trim(); }).join(', ')}.`;
    return scaleRecipeStepQuantities(instructions[i - 1] || '', ingredients, scale);
  };
  // ---- Voice: "next", "back", "repeat", "start the timer", "question, …" ----
  const listenOK = useMemo(() => canListen(), []);
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceOnRef = useRef(false);
  voiceOnRef.current = voiceOn;
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<{ text: string; understood: boolean } | null>(null);
  useEffect(() => {
    if (!heard) return;
    const t = setTimeout(() => setHeard(null), 4000);
    return () => clearTimeout(t);
  }, [heard]);
  const listenerRef = useRef<ReturnType<typeof createListener> | null>(null);

  /** Say something; the microphone pauses meanwhile so it doesn't hear itself. */
  const talk = (text: string, onFail?: () => void) => {
    listenerRef.current?.pause();
    const done = () => { setSpeaking(false); if (voiceOnRef.current) listenerRef.current?.resume(); };
    const ok = speak(text, {
      onStart: () => setSpeaking(true),
      onEnd: done,
      onError: (reason) => {
        done();
        setReadNote(reason === 'not-allowed' ? 'Your phone stopped the reading. Tap “Read it again”.' : "Couldn't read that out. Check the phone's volume and try “Read it again”.");
      },
    });
    if (!ok) { done(); (onFail || (() => setReadNote(NO_SPEECH)))(); }
  };
  const sayStep = (i: number) => talk(i18nStep(i, stepCount, stepText(i)));
  const toggleRead = () => {
    if (!speechOK) { setReadNote(NO_SPEECH); return; }
    const v = !readAloud;
    setReadAloud(v);
    savePref('cook_read_aloud', v);
    if (v) sayStep(step);
    else { stopSpeaking(); setSpeaking(false); if (voiceOnRef.current) listenerRef.current?.resume(); }
  };
  const firstStep = useRef(true);
  useEffect(() => {
    // Opening cooking mode with Read on reads the first step; after that, each step you move to
    // (and always when you're cooking by voice).
    if (firstStep.current) { firstStep.current = false; if (!readAloudRef.current) return; }
    if ((readAloudRef.current || voiceOnRef.current) && !finished) sayStep(step);
  }, [step, method, activeMealId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Questions: typed or spoken, answered by Gemini from this recipe as you're cooking it.
  const [answer, setAnswer] = useState<{ q: string; a?: string; loading?: boolean; problem?: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const askSeq = useRef(0);
  const ask = async (question: string, aloud: boolean) => {
    const q = question.trim();
    if (!q || !recipe) return;
    const seq = ++askSeq.current;
    setAnswer({ q, loading: true });
    if (aloud) talk('Let me check.', () => {});
    let a: string;
    let problem = false;
    try {
      a = await askAboutRecipeApi(recipe, q, {
        method,
        servings,
        step,
        steps: instructions.map((x) => scaleRecipeStepQuantities(x, ingredients, scale)),
        ingredients: ingredients.map((ing) => { const l = ingredientLine(ing, scale); return `${l.amount} ${l.name}${ing.note ? `, ${ing.note}` : ''}`.trim(); }),
      });
    } catch (e) {
      problem = true;
      a = e instanceof NoGeminiKeyError
        ? 'To ask questions, add your Gemini key in Settings, under This phone.'
        : "Sorry, I couldn't get an answer just now. Check you're online and try again.";
    }
    if (seq !== askSeq.current) return;
    setAnswer({ q, a, problem });
    if (aloud || readAloudRef.current) talk(a, () => {});
  };

  const timerFor = (i: number) => {
    const text = instructions[i - 1];
    const minutes = i > 0 && text ? stepMinutes(text) : null;
    return minutes ? { label: stepTimerLabel(text), minutes } : null;
  };
  const minutesLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m <= 1 ? 'about a minute' : `${m} minutes`; };
  const runCommand = (c: VoiceCommand) => {
    switch (c.kind) {
      case 'next': next(); break;
      case 'back': if (step === 0) talk("You're at the start."); else setStep((x) => Math.max(0, x - 1)); break;
      case 'repeat': sayStep(step); break;
      case 'goto':
        if (c.step >= 1 && c.step <= instructions.length) setStep(c.step);
        else talk(`There are ${instructions.length} steps.`);
        break;
      case 'finish': setFinished(true); break;
      case 'timer_start': {
        if (c.minutes) { start(`Timer`, c.minutes, recipe!.name); talk(`Timer set for ${c.minutes === 1 ? 'one minute' : `${c.minutes} minutes`}.`); break; }
        const t = timerFor(step);
        if (!t) { talk("This step doesn't have a time. Say, set a timer for ten minutes."); break; }
        const running = timers.find((x) => x.label === t.label && x.recipe === recipe!.name);
        if (running) { talk(`${t.label} is already running, ${minutesLeft(timeLeft(running, Date.now()))} left.`); break; }
        start(t.label, t.minutes, recipe!.name);
        talk(`${t.label} timer started, ${t.minutes} minutes.`);
        break;
      }
      case 'timer_stop': {
        const ringing = timers.filter((x) => x.state === 'ringing');
        const target = ringing.length ? ringing : timers.slice(-1);
        if (!target.length) { talk('No timers are running.'); break; }
        target.forEach((x) => stop(x.id));
        talk(target.length > 1 ? 'Timers stopped.' : `${target[0].label} stopped.`);
        break;
      }
      case 'time_left': {
        if (!timers.length) { talk('No timers are running.'); break; }
        talk(timers.map((x) => (x.state === 'ringing' ? `${x.label} is done.` : `${x.label}, ${minutesLeft(timeLeft(x, Date.now()))} left.`)).join(' '));
        break;
      }
      case 'ingredients': {
        const used = step === 0 ? ingredients : ingredientsForStep(instructions[step - 1] || '', ingredients);
        talk(used.length ? `${step === 0 ? 'You need' : 'For this step'}: ${used.map((ing) => { const l = ingredientLine(ing, scale); return `${l.amount} ${l.name}`.trim(); }).join(', ')}.` : "This step doesn't use any of the ingredients.");
        break;
      }
      case 'help': talk(VOICE_HELP); break;
      case 'question': ask(c.text, true); break;
    }
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  const stopVoice = () => { listenerRef.current?.stop(); setVoiceOn(false); setListening(false); };
  const toggleVoice = () => {
    if (voiceOn) { stopVoice(); return; }
    if (!listenOK) { setReadNote(NO_LISTEN); return; }
    if (!listenerRef.current) {
      listenerRef.current = createListener({
        onHeard: (alts) => {
          const hit = parseAlternatives(alts);
          setHeard({ text: hit?.heard || alts[0], understood: !!hit });
          if (hit) runCommandRef.current(hit.command);
        },
        onListening: (on) => setListening(on),
        onProblem: (problem) => {
          setVoiceOn(false);
          setListening(false);
          setReadNote(problem === 'blocked' ? "The microphone isn't allowed here. Allow it for this site in your browser's settings (it can't be used inside a preview in another app), then tap Voice again."
            : problem === 'no-mic' ? "Couldn't find a microphone."
            : problem === 'network' ? 'Voice needs internet. Check your connection and tap Voice again.'
            : problem === 'unsupported' ? NO_LISTEN
            : 'Voice stopped listening. Tap Voice to start again.');
        },
      });
    }
    setVoiceOn(true);
    voiceOnRef.current = true;
    listenerRef.current.start();
  };
  useEffect(() => { if (finished) { stopSpeaking(); setSpeaking(false); listenerRef.current?.pause(); } else if (voiceOnRef.current) listenerRef.current?.resume(); }, [finished]);
  useEffect(() => () => { stopSpeaking(); listenerRef.current?.stop(); }, []);

  // Big steps: the step's text shrinks until it fits the screen (down to a size that's still easy
  // to read; past that it scrolls).
  const fitRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!big || !el) return;
    const fit = () => {
      let size = 30;
      el.style.setProperty('--fit', `${size}px`);
      while (size > 17 && el.scrollHeight > el.clientHeight + 1) {
        size -= 1;
        el.style.setProperty('--fit', `${size}px`);
      }
    };
    fit();
    const RO = (window as any).ResizeObserver;
    if (!RO) return;
    const ro = new RO(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [big, step, method, activeMealId, servings, tickedCount, timers.length, readAloud]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeMeal || !recipe) {
    return (
      <div className="fixed inset-0 z-50 app-page flex flex-col items-center justify-center p-6 text-center">
        <ChefHat className="w-8 h-8 text-zinc-400 mb-3" />
        <h3 className="font-semibold text-zinc-900">Couldn't find this recipe</h3>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl">Close</button>
      </div>
    );
  }

  const next = () => (step >= stepCount - 1 ? setFinished(true) : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  /** Timer button for a step (or the running timer, if there is one). */
  const stepTimer = (text: string, large = false) => {
    const minutes = stepMinutes(text);
    if (!minutes) return null;
    const label = stepTimerLabel(text);
    const running = timers.find((t) => t.label === label && t.recipe === recipe.name);
    if (running) {
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 ${large ? 'py-2.5 text-lg' : 'py-1.5 text-sm'} font-semibold ${running.state === 'ringing' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`} data-step-timer-running>
          <Timer className="w-4 h-4" />{running.state === 'ringing' ? 'Done!' : timerText(timeLeft(running, now))}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); start(label, minutes, recipe.name); }}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white text-emerald-800 font-semibold cursor-pointer active:bg-emerald-50 ${large ? 'px-4 py-3 text-lg' : 'px-3 py-1.5 text-sm'}`}
        data-start-timer={minutes}
      >
        <Timer className={large ? 'w-5 h-5' : 'w-4 h-4'} /> Start {minutes} min timer
      </button>
    );
  };

  const needs = (text: string, large = false) => {
    const used = ingredientsForStep(text, ingredients);
    if (!used.length) return null;
    return (
      <div className={`flex flex-wrap gap-1.5 ${large ? 'mt-4' : 'mt-2'}`} data-step-needs>
        {used.map((ing, i) => {
          const l = ingredientLine(ing, scale);
          return (
            <span key={ing.id || i} className={`rounded-lg bg-amber-50 border border-amber-200 text-amber-950 ${large ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-sm'}`}>
              {l.amount && <strong className="font-semibold">{l.amount} </strong>}{l.name}
            </span>
          );
        })}
      </div>
    );
  };

  const checklist = (large = false) => (
    <ul className={`divide-y divide-zinc-100 ${large ? 'mt-3' : 'mt-2'}`} data-get-out>
      {ingredients.map((ing, idx) => {
        const key = ing.id || String(idx);
        const on = !!ticked[key];
        const l = ingredientLine(ing, scale);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setTicked((t) => ({ ...t, [key]: !t[key] })); }}
              aria-pressed={on}
              className={`w-full text-left flex items-start gap-3 cursor-pointer ${large ? 'py-3' : 'py-2'}`}
            >
              <span className={`mt-0.5 rounded-md border flex items-center justify-center shrink-0 ${large ? 'w-7 h-7' : 'w-5 h-5'} ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}>
                {on && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className={`min-w-0 flex-1 leading-snug ${large ? 'text-xl' : 'text-[15px]'} ${on ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                {l.amount && <span className="font-semibold tabular-nums">{l.amount} </span>}{l.name}
                {ing.note && <span className={`block ${large ? 'text-base' : 'text-[13px]'} ${on ? 'text-zinc-400' : 'text-zinc-500'}`}>{ing.note}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div id="cook-mode-overlay" className="fixed inset-0 z-50 app-page flex flex-col overflow-hidden animate-in fade-in duration-200" data-cook-mode>
      {asking && (
        <AskSheet
          recipeName={recipe.name}
          canDictate={false}
          onAsk={(q) => { setAsking(false); ask(q, false); }}
          onClose={() => setAsking(false)}
        />
      )}
      {finished && (
        <FinishedScreen
          store={store}
          recipe={recipe}
          meal={activeMeal}
          dayName={dayName}
          servings={servings}
          plannedMeal={!!onMarkCooked && dayName !== 'Cookbook'}
          fridge={plan.extra > 0 ? { portions: plan.extra, days: plan.leftoverDays } : null}
          onBack={() => setFinished(false)}
          onDone={(result) => {
            if (result.markCooked && onMarkCooked) onMarkCooked(activeMeal.id, true, { froze: result.froze });
            onClose();
          }}
        />
      )}

      {/* Header: the recipe, who for, times; method, big steps, read aloud */}
      <header className="bg-white border-b border-zinc-200 px-3 pt-2.5 pb-2 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600 shrink-0 cursor-pointer" aria-label="Leave cooking mode" data-cook-close>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-zinc-900 truncate leading-tight" data-cook-title>{recipe.name}</h2>
            <p className="text-xs text-zinc-500 truncate" data-cook-times>
              {prep ? `Prep ${prep}` : ''}{prep && cook ? ' · ' : ''}{cook ? `cook ${cook}` : ''}{prep || cook ? ' min' : ''}{dayName && dayName !== 'Cookbook' ? ` · ${dayName}` : ''}
            </p>
          </div>
          <div className="flex items-center shrink-0 rounded-xl border border-zinc-200 bg-zinc-50" data-cook-people>
            <button type="button" onClick={() => setServings((n) => Math.max(1, n - 1))} className="w-9 h-10 flex items-center justify-center text-zinc-600 cursor-pointer" aria-label="One fewer"><Minus className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-zinc-900 whitespace-nowrap tabular-nums" data-cook-servings>for {servings}</span>
            <button type="button" onClick={() => setServings((n) => Math.min(24, n + 1))} className="w-9 h-10 flex items-center justify-center text-zinc-600 cursor-pointer" aria-label="One more"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-2 mt-2">
          {methods.length > 1 && (
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200" data-cook-method>
              {methods.map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
                  className={`px-2.5 h-9 text-[13px] font-semibold rounded-lg cursor-pointer ${method === m ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}>
                  {METHOD_LABEL[m] || m}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto flex items-center gap-1">
            {([
              { key: 'big', label: 'Big', on: big, icon: <Type className="w-4 h-4" />, onClick: () => { const v = !big; setBig(v); savePref('cook_big_steps', v); }, attrs: { 'data-cook-big': true, 'aria-label': 'Big steps: one step at a time in large text' } },
              { key: 'read', label: 'Read', on: readAloud, dim: !speechOK, icon: readAloud ? <Volume2 className={`w-4 h-4 ${speaking ? 'animate-pulse' : ''}`} /> : <VolumeX className="w-4 h-4" />, onClick: toggleRead, attrs: { 'data-cook-read': true, 'aria-label': readAloud ? 'Stop reading the steps aloud' : 'Read the steps aloud' } },
              { key: 'voice', label: 'Voice', on: voiceOn, dim: !listenOK, icon: voiceOn ? <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} /> : <MicOff className="w-4 h-4" />, onClick: toggleVoice, attrs: { 'data-cook-voice': true, 'aria-label': voiceOn ? 'Stop listening' : 'Voice: say next, back, repeat, or ask a question' } },
              { key: 'ask', label: 'Ask', on: asking, icon: <MessageCircleQuestionMark className="w-4 h-4" />, onClick: () => setAsking(true), attrs: { 'data-cook-ask': true, 'aria-label': 'Ask a question about this recipe' } },
            ] as const).map((b: any) => (
              <button key={b.key} type="button" onClick={b.onClick} aria-pressed={b.on} {...b.attrs}
                className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold leading-none cursor-pointer ${b.on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'} ${b.dim ? 'opacity-60' : ''}`}>
                {b.icon}{b.label}
              </button>
            ))}
          </span>
        </div>
        {meals.length > 1 && (
          <div className="max-w-2xl mx-auto flex items-center gap-1.5 mt-2 overflow-x-auto">
            {meals.map((m) => (
              <button key={m.id} type="button" onClick={() => setActiveMealId(m.id)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-lg border shrink-0 cursor-pointer ${m.id === activeMealId ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-zinc-200 text-zinc-700'}`}>
                {m.name.replace(/^(Leftovers?|Batch):\s*/i, '')}
              </button>
            ))}
          </div>
        )}
      </header>

      {readNote && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-2 text-sm" role="status" data-read-note>
          <div className="max-w-2xl mx-auto flex items-start gap-2"><VolumeX className="w-4 h-4 shrink-0 mt-0.5" /><span>{readNote}</span></div>
        </div>
      )}
      {(readAloud || voiceOn) && !readNote && (
        <div className="shrink-0 bg-zinc-100 border-b border-zinc-200 px-4 py-1.5 text-[13px] text-zinc-700" data-read-on>
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            {voiceOn
              ? <Mic className={`w-4 h-4 shrink-0 ${listening && !speaking ? 'text-rose-600 animate-pulse' : 'text-zinc-400'}`} />
              : <Volume2 className={`w-4 h-4 shrink-0 ${speaking ? 'text-emerald-600 animate-pulse' : 'text-zinc-500'}`} />}
            <span className="flex-1 min-w-0 truncate" data-voice-status>
              {heard
                ? (heard.understood ? <>Heard “<strong>{heard.text}</strong>”</> : <span className="text-zinc-500">Heard “{heard.text}”, not a command</span>)
                : speaking ? 'Reading…'
                : voiceOn ? (listening ? 'Listening: say “next”, “back”, “repeat” or “question, …”' : 'Starting the microphone…')
                : 'Reads each step as you go'}
            </span>
            <button type="button" onClick={() => sayStep(step)} className="shrink-0 font-semibold underline underline-offset-2 cursor-pointer" data-read-again>Read it again</button>
          </div>
        </div>
      )}
      {answer && (
        <div className="shrink-0 bg-blue-50 border-b border-blue-200 px-4 py-2" data-answer>
          <div className="max-w-2xl mx-auto flex items-start gap-2">
            <MessageCircleQuestionMark className="w-4 h-4 shrink-0 mt-0.5 text-blue-700" />
            <div className="flex-1 min-w-0 max-h-36 overflow-y-auto">
              <p className="text-[13px] font-semibold text-blue-950" data-answer-q>{answer.q}</p>
              {answer.loading
                ? <p className="text-sm text-blue-900/80 inline-flex items-center gap-1.5 mt-0.5"><LoaderCircle className="w-3.5 h-3.5 animate-spin" />Asking Gemini…</p>
                : <p className={`text-sm leading-snug mt-0.5 ${answer.problem ? 'text-rose-800' : 'text-blue-950'}`} data-answer-a>{answer.a}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button type="button" onClick={() => { askSeq.current++; setAnswer(null); }} className="w-8 h-8 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-blue-800 cursor-pointer" aria-label="Close the answer" data-answer-close><X className="w-4 h-4" /></button>
              {answer.a && !answer.problem && speechOK && <button type="button" onClick={() => talk(answer.a!)} className="text-xs font-semibold text-blue-800 underline underline-offset-2 cursor-pointer" data-answer-read>Read it</button>}
            </div>
          </div>
        </div>
      )}
      {(plan.banner || (activeMeal.sides && activeMeal.sides.length > 0)) && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-950" data-cook-banner>
          <div className="max-w-2xl mx-auto space-y-0.5">
            {plan.banner && <p className="font-semibold">{plan.banner}</p>}
            {activeMeal.sides && activeMeal.sides.length > 0 && <p>With: {activeMeal.sides.map((s) => s.name).join(', ')}</p>}
          </div>
        </div>
      )}

      {(dayNote || recipeNotes) && (
        <div className={`shrink-0 border-b px-4 py-2 ${notesOpen ? 'bg-white border-zinc-200' : 'bg-zinc-50 border-zinc-200'}`} data-cook-notes>
          <div className="max-w-2xl mx-auto">
            <button type="button" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen} className="w-full flex items-center gap-1.5 text-left text-sm font-semibold text-zinc-800 cursor-pointer" data-cook-notes-toggle>
              <StickyNote className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                Notes{!notesOpen && <span className="font-normal text-zinc-500"> · {[dayNote, recipeNotes].filter(Boolean).length === 2 ? "today's and the recipe's" : dayNote ? "today's" : "the recipe's"}: tap to see</span>}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
            </button>
            {notesOpen && (
              <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                {dayNote && (
                  <div className={`rounded-xl border px-3 py-2 ${noteLook(activeMeal.noteBy).box}`} data-cook-day-note={activeMeal.noteBy || ''}>
                    <p className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">For {dayName}<PersonMark who={activeMeal.noteBy} what="Note written" /></p>
                    <p className={`text-[15px] leading-snug whitespace-pre-line ${noteLook(activeMeal.noteBy).text}`}>{dayNote}</p>
                  </div>
                )}
                {recipeNotes && (
                  <div className={`rounded-xl border px-3 py-2 ${noteLook(recipe?.notesBy).box}`} data-cook-recipe-notes={recipe?.notesBy || ''}>
                    <p className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">Our notes on the recipe<PersonMark who={recipe?.notesBy} what="Notes written" /></p>
                    <p className={`text-[15px] leading-snug whitespace-pre-line ${noteLook(recipe?.notesBy).text}`}>{recipeNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <TimerBar />

      {big ? (
        // ---------- Big steps: one at a time, as big as fits on the screen ----------
        <div className="flex-1 flex flex-col min-h-0" data-big-step={step}>
          <div ref={fitRef} className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-2" style={{ ['--fit' as any]: '30px' }} data-big-fit>
            <div className="max-w-2xl mx-auto">
              <p className="font-semibold text-zinc-500 mb-1.5" style={{ fontSize: 'max(13px, calc(var(--fit) * 0.5))' }}>{step === 0 ? 'First' : `Step ${step} of ${stepCount - 1}`}</p>
              {step === 0 ? (
                <>
                  <h3 className="font-bold text-zinc-900 leading-tight" style={{ fontSize: 'var(--fit)' }}>Get everything out</h3>
                  <p className="text-zinc-500 mt-0.5" style={{ fontSize: 'max(13px, calc(var(--fit) * 0.55))' }}>{tickedCount} of {ingredients.length} out</p>
                  <ul className="divide-y divide-zinc-100 mt-1" data-get-out>
                    {ingredients.map((ing, idx) => {
                      const key = ing.id || String(idx);
                      const on = !!ticked[key];
                      const l = ingredientLine(ing, scale);
                      return (
                        <li key={key}>
                          <button type="button" onClick={() => setTicked((t) => ({ ...t, [key]: !t[key] }))} aria-pressed={on}
                            className="w-full text-left flex items-center gap-3 cursor-pointer" style={{ paddingTop: 'calc(var(--fit) * 0.25)', paddingBottom: 'calc(var(--fit) * 0.25)', fontSize: 'max(15px, calc(var(--fit) * 0.68))' }}>
                            <span className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
                            <span className={`min-w-0 flex-1 leading-snug ${on ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                              {l.amount && <span className="font-semibold tabular-nums">{l.amount} </span>}{l.name}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-semibold text-zinc-900" style={{ fontSize: 'var(--fit)', lineHeight: 1.3 }} data-big-text>{stepText(step)}</p>
                  {(() => {
                    const used = ingredientsForStep(instructions[step - 1], ingredients);
                    return used.length ? (
                      <div className="flex flex-wrap gap-1.5 mt-3" data-step-needs style={{ fontSize: 'max(14px, calc(var(--fit) * 0.6))' }}>
                        {used.map((ing, i) => {
                          const l = ingredientLine(ing, scale);
                          return <span key={ing.id || i} className="rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-2.5 py-1">{l.amount && <strong className="font-semibold">{l.amount} </strong>}{l.name}</span>;
                        })}
                      </div>
                    ) : null;
                  })()}
                  {stepMinutes(instructions[step - 1]) && <div className="mt-3">{stepTimer(instructions[step - 1])}</div>}
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex gap-2 px-3 pt-2 app-page border-t border-zinc-200" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={back} disabled={step === 0} className="w-14 h-14 rounded-xl border border-zinc-300 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0" aria-label="Back a step" data-big-back>
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={next} className={`flex-1 h-14 rounded-xl text-white text-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] ${step >= stepCount - 1 ? 'bg-emerald-600' : 'bg-emerald-600'}`} data-big-next>
              {step >= stepCount - 1 ? 'Finished' : 'Next'} <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        // ---------- All the steps in one column ----------
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3">
            <div className="max-w-2xl mx-auto space-y-2.5">
              <section
                data-step={0}
                onClick={() => setStep(0)}
                className={`rounded-2xl border p-4 cursor-pointer ${step === 0 ? 'bg-white border-zinc-900 ring-1 ring-zinc-900' : 'bg-white border-zinc-200'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-zinc-900">Get everything out</h3>
                  <span className="text-sm text-zinc-500 tabular-nums">{tickedCount} of {ingredients.length}</span>
                </div>
                {checklist()}
              </section>
              {instructions.map((text, i) => {
                const n = i + 1;
                const active = n === step;
                const passed = n < step;
                return (
                  <section
                    key={i}
                    data-step={n}
                    onClick={() => setStep(n)}
                    className={`rounded-2xl border p-4 cursor-pointer ${active ? 'bg-white border-zinc-900 ring-1 ring-zinc-900' : passed ? 'bg-zinc-50 border-zinc-200 opacity-60' : 'bg-white border-zinc-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${active ? 'bg-emerald-600 text-white' : passed ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>
                        {passed ? <Check className="w-4 h-4" /> : n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[17px] leading-relaxed ${active ? 'text-zinc-950 font-semibold' : 'text-zinc-700'}`}>{scaleRecipeStepQuantities(text, ingredients, scale)}</p>
                        {needs(text)}
                        {stepMinutes(text) && <div className="mt-2.5">{stepTimer(text)}</div>}
                      </div>
                    </div>
                  </section>
                );
              })}
              {instructions.length === 0 && <p className="text-sm text-zinc-500 px-1">This recipe has no steps yet.</p>}
            </div>
          </div>
          <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-3" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={back} disabled={step === 0} className="h-12 px-4 rounded-xl border border-zinc-300 text-zinc-700 font-semibold disabled:opacity-30 cursor-pointer" data-cook-back>Back</button>
            <span className="flex-1 text-center text-sm text-zinc-500 tabular-nums" data-cook-step>{step === 0 ? 'Get everything out' : `Step ${step} of ${stepCount - 1}`}</span>
            <button type="button" onClick={next} className={`h-12 px-6 rounded-xl text-white font-semibold cursor-pointer ${step >= stepCount - 1 ? 'bg-emerald-600' : 'bg-emerald-600'}`} data-cook-next>
              {step >= stepCount - 1 ? 'Finished' : 'Next'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const NO_LISTEN = "Voice commands aren't available here. They work in Chrome on Android and Safari on iPhone (and need internet), not inside some other apps' browsers.";
const VOICE_HELP = 'Say next, back, or repeat. Say start the timer, how long left, or stop. Or say question, then ask anything about the recipe.';

/** Type a question about the recipe (or pick a common one). */
function AskSheet({ recipeName, onAsk, onClose }: { recipeName: string; canDictate?: boolean; onAsk: (q: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ideas = ['What can I use instead of…', 'Can I make this ahead?', 'How do I know when it’s done?', 'Can I freeze this?'];
  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Ask about this recipe" data-ask-sheet className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <span className="text-sm font-semibold text-zinc-500 block">Ask about</span>
        <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{recipeName}</h3>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q); }} className="mt-3 flex items-end gap-2">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} autoFocus placeholder="e.g. Can I use crème fraîche instead of soured cream?"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (q.trim()) onAsk(q); } }}
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-base leading-snug outline-none focus:border-emerald-500 resize-none" data-ask-input aria-label="Your question" />
          <button type="submit" disabled={!q.trim()} className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0" aria-label="Ask" data-ask-send><Send className="w-4 h-4" /></button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ideas.map((x) => (
            <button key={x} type="button" onClick={() => (x.endsWith('…') ? setQ(x.replace('…', ' ')) : onAsk(x))} className="h-8 px-2.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 cursor-pointer">{x}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Gemini answers from this recipe, for the number of people you're cooking for. With Voice on you can also just say “question,” then ask.</p>
      </div>
    </div>
  );
}

const NO_SPEECH = "Reading aloud isn't available here. It works when the app is opened in Chrome or Safari (or added to your home screen), not inside some other apps' browsers.";

/** What's read out for a step: "Step 2 of 4. Boil the potatoes…". */
function i18nStep(step: number, count: number, text: string) {
  return step === 0 ? text : `Step ${step} of ${count - 1}. ${text}`;
}

/**
 * The end of cooking: what to do with what's left (fridge for later leftovers, freezer for a
 * batch), how it was (have it again / not for us), a note for next time (saved to the recipe),
 * then tick it as cooked.
 */
function FinishedScreen({
  store,
  recipe,
  meal,
  dayName,
  servings,
  plannedMeal,
  fridge,
  onBack,
  onDone,
}: {
  store: AppStore;
  recipe: Recipe;
  meal: PlannedMeal;
  dayName: string;
  servings: number;
  /** A meal on the plan (so it can be ticked as cooked). */
  plannedMeal: boolean;
  fridge: { portions: number; days: string[] } | null;
  onBack: () => void;
  onDone: (result: { markCooked: boolean; froze?: { batchId: string; portions: number } }) => void;
}) {
  const fromNote = freezePortionsFromNote(meal.note) ?? 0;
  const [freeze, setFreeze] = useState<number>(fromNote);
  const [note, setNote] = useState('');
  // Your stars (saved straight away; the other person's are shown as they left them).
  const ratings = ratingsFor(store.state?.preferences?.ratings, recipe.id);
  const rate = (stars: number) => {
    store.updatePreferences((p) => ({ ratings: withRating(p.ratings, recipe.id, store.currentUser || 'P', stars, new Date().toISOString().slice(0, 10)) }));
  };
  const isCook = meal.type === 'recipe';

  const finish = (markCooked: boolean) => {
    let froze: { batchId: string; portions: number } | undefined;
    if (isCook && freeze > 0 && store.addBatch) {
      const batchId = crypto.randomUUID();
      store.addBatch({ id: batchId, name: recipe.name, recipeId: recipe.id, portions: freeze, dateAdded: new Date().toISOString() });
      froze = { batchId, portions: freeze };
    }
    const trimmed = note.trim();
    if (trimmed) {
      // Added to the recipe's notes as they are now (the other phone may have added one meanwhile).
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      store.changeRecipe(recipe.id, (r) => ({ ...r, notes: [r.notes?.trim(), `${date}: ${trimmed}`].filter(Boolean).join('\n') }));
    }
    onDone({ markCooked, froze });
  };

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200" data-finished>
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 text-center">{recipe.name} is done</h2>
          <p className="text-sm text-zinc-500 text-center mt-1">for {servings}{dayName && dayName !== 'Cookbook' ? ` · ${dayName}` : ''}</p>

          <div className="mt-6 space-y-3">
            {fridge && (
              <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3" data-finished-fridge>
                <Refrigerator className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <p className="text-[15px] text-blue-950">
                  Put <strong>{fridge.portions} {fridge.portions === 1 ? 'portion' : 'portions'}</strong> in the fridge for {fridge.days.join(' and ')}.
                </p>
              </div>
            )}

            {isCook && (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3" data-finished-freeze>
                <div className="flex items-center gap-3">
                  <Snowflake className="w-5 h-5 text-cyan-700 shrink-0" />
                  <span className="flex-1 text-[15px] text-cyan-950 font-semibold">{freeze > 0 ? `Freeze ${freeze} ${freeze === 1 ? 'portion' : 'portions'}` : 'Freeze some?'}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setFreeze((n) => Math.max(0, n - 1))} disabled={freeze <= 0} className="w-10 h-10 rounded-xl border border-cyan-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="One fewer portion to freeze"><Minus className="w-4 h-4" /></button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums" data-freeze-count>{freeze}</span>
                    <button type="button" onClick={() => setFreeze((n) => Math.min(24, n + 1))} className="w-10 h-10 rounded-xl border border-cyan-300 bg-white flex items-center justify-center cursor-pointer" aria-label="One more portion to freeze"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                {freeze > 0 && <p className="text-xs text-cyan-900/80 mt-1.5 pl-8">They'll be added to the Freezer tab.</p>}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 px-4 py-3" data-finished-rating>
              <p className="text-[15px] font-semibold text-zinc-900 mb-1">How was it?</p>
              <RatingRows ratings={ratings} me={store.currentUser || 'P'} onRate={rate} size="lg" />
            </div>

            <label className="block rounded-2xl border border-zinc-200 px-4 py-3">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900 mb-1.5"><NotebookPen className="w-4 h-4" /> Note for next time</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. needed more chilli, 10 mins less in the oven"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-[15px] outline-none focus:border-emerald-500" data-finished-note />
              <span className="text-xs text-zinc-500 mt-1 block">Saved to the recipe's notes.</span>
            </label>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-zinc-200 px-5 py-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-md mx-auto space-y-2">
          <button type="button" onClick={() => finish(plannedMeal)} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer" data-finished-done>
            <Check className="w-4 h-4" /> {plannedMeal ? 'Done: tick it as cooked' : 'Done'}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack} className="text-sm font-medium text-zinc-500 cursor-pointer py-1" data-finished-back>Back to the steps</button>
            {plannedMeal && <button type="button" onClick={() => finish(false)} className="text-sm font-medium text-zinc-500 cursor-pointer py-1">Done, don't tick it</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

