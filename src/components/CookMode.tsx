import { useState, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef } from 'react';
import PersonMark, { noteLook } from './PersonMark';
import {
  ChevronLeft,
  ChefHat,
  Plus,
  Minus,
  Type,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  MessageCircleQuestionMark,
  LoaderCircle,
  X,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import { Recipe, PlannedMeal, MealPlan, CookingMethod } from '../types';
import { scaleRecipeStepQuantities, DAYS_OF_WEEK } from '../utils';
import { ingredientsForStep, stepMinutes, stepTimerLabel, timeLeft } from '../cookInfo';
import { useCookTimers } from '../hooks/useCookTimers';
import { TimerBar } from './cook/TimerBar';
import { BigSteps, StepList } from './cook/StepViews';
import type { StepTimers } from './cook/StepParts';
import { canSpeak, speak, stopSpeaking } from '../speech';
import { canListen, createListener, parseAlternatives, VoiceCommand } from '../voiceCommands';
import { askAboutRecipeApi, NoGeminiKeyError } from '../services/geminiService';
import type { AppStore } from '../store';
import { useScreenAwake } from '../hooks/phone';
import { useLatest } from '../hooks/useLatest';
import { AskSheet } from './cook/AskSheet';
import { FinishedScreen } from './cook/FinishedScreen';
import {
  HeaderButton,
  METHOD_LABEL,
  NO_LISTEN,
  NO_SPEECH,
  VOICE_HELP,
  i18nStep,
  ingredientLine,
  readPref,
  savePref,
} from './cook/cookParts';

interface CookModeProps {
  store: AppStore;
  dayName: string;
  /** The meal being cooked. */
  meal: PlannedMeal;
  onClose: () => void;
  activePlan?: MealPlan;
  /** Tick the meal as cooked; `froze` says what was put in the freezer from the Finished screen. */
  onMarkCooked?: (mealId: string, cooked: boolean, extra?: { froze?: { batchId: string; portions: number } }) => void;
  initialServings?: number;
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
  meal,
  onClose,
  activePlan,
  onMarkCooked,
  initialServings,
}: CookModeProps) {
  useScreenAwake();
  const { timers, now, start, stop } = useCookTimers();
  const [finished, setFinished] = useState(false);
  const [big, setBig] = useState(() => readPref('cook_big_steps'));
  const speechOK = useMemo(() => canSpeak(), []);
  const [readAloud, setReadAloud] = useState(() => speechOK && readPref('cook_read_aloud'));
  // For an answer that arrives after a wait: is Read on by then?
  const readAloudRef = useLatest(readAloud);
  const [speaking, setSpeaking] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  useEffect(() => {
    if (!readNote) return;
    const t = setTimeout(() => setReadNote(null), 8000);
    return () => clearTimeout(t);
  }, [readNote]);

  const recipe = useMemo<Recipe | null>(
    () => (meal?.recipeId ? store.state.recipes.find((r: Recipe) => r.id === meal.recipeId) || null : null),
    [store.state.recipes, meal],
  );

  // Cook extra for later leftovers ("Cook for 6: extra for Wednesday").
  const plan = useMemo(() => {
    if (!meal || !recipe) return { servings: 2, leftoverDays: [] as string[], extra: 0, banner: null as string | null };
    if (meal.type === 'leftover')
      return {
        servings: meal.servings || 2,
        leftoverDays: [],
        extra: 0,
        banner: 'Leftovers: just reheat until piping hot.',
      };
    if (meal.type === 'batch')
      return {
        servings: meal.servings || 2,
        leftoverDays: [],
        extra: 0,
        banner: 'From the freezer: heat it through until piping hot.',
      };
    const days = activePlan ? DAYS_OF_WEEK.filter((d) => activePlan.days[d]) : [];
    let extra = 0;
    const leftoverDays: string[] = [];
    for (let i = days.indexOf(dayName) + 1; i > 0 && i < days.length; i++) {
      const m = (activePlan!.days[days[i]].meals || []).find((x) => x.recipeId === meal.recipeId);
      if (!m) continue;
      if (m.type === 'leftover') {
        extra += m.servings || 2;
        leftoverDays.push(days[i]);
      } else break;
    }
    const own = meal.servings || 2;
    return {
      servings: own + extra,
      leftoverDays,
      extra,
      banner: extra ? `Cook for ${own + extra}: ${extra} extra for ${leftoverDays.join(' and ')}.` : null,
    };
  }, [meal, recipe, activePlan, dayName]);

  const baseServings = recipe?.servings || 2;
  const [servings, setServings] = useState<number>(initialServings ?? plan.servings);
  useEffect(() => {
    setServings(initialServings ?? plan.servings);
  }, [plan.servings, initialServings]);

  const methods = (
    recipe?.cookingMethods && recipe.cookingMethods.length ? recipe.cookingMethods : ['oven_hob']
  ) as CookingMethod[];
  // Start on the appliance you said you prefer, when the recipe has steps for it.
  const preferred = store.state.preferences?.preferredCookingMethod;
  const firstMethod = (
    preferred && preferred !== 'all' && methods.includes(preferred) ? preferred : methods[0]
  ) as CookingMethod;
  const [method, setMethod] = useState<CookingMethod>(firstMethod);

  const instructions = useMemo<string[]>(() => {
    if (!recipe) return [];
    return recipe.methodInstructions?.[method] || recipe.instructions || [];
  }, [recipe, method]);

  // Step 0 is "Get everything out"; the recipe's steps follow.
  const stepCount = instructions.length + 1;
  const [step, setStep] = useState(0);
  // The day's note and our notes on the recipe: open to start with, folded once you're past the first step (tap to see again).
  const dayNote = (meal?.note || '').trim();
  const recipeNotes = (recipe?.notes || '').trim();
  const [notesOpen, setNotesOpen] = useState(true);
  const foldedNotes = useRef(false);
  useEffect(() => {
    if (step > 0 && !foldedNotes.current) {
      foldedNotes.current = true;
      setNotesOpen(false);
    }
  }, [step]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setTicked({});
    setStep(0);
  }, [method]);

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
    if (i === 0)
      return `Get everything out. ${ingredients
        .map((ing) => {
          const l = ingredientLine(ing, scale);
          return `${l.amount} ${l.name}`.trim();
        })
        .join(', ')}.`;
    return scaleRecipeStepQuantities(instructions[i - 1] || '', ingredients, scale);
  };
  // ---- Voice: "next", "back", "repeat", "start the timer", "question, …" ----
  const listenOK = useMemo(() => canListen(), []);
  const [voiceOn, setVoiceOn] = useState(false);
  // Read by the microphone's callbacks; also set straight away when Voice is turned on.
  const voiceOnRef = useLatest(voiceOn);
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
    const done = () => {
      setSpeaking(false);
      if (voiceOnRef.current) listenerRef.current?.resume();
    };
    const ok = speak(text, {
      onStart: () => setSpeaking(true),
      onEnd: done,
      onError: (reason) => {
        done();
        setReadNote(
          reason === 'not-allowed'
            ? 'Your phone stopped the reading. Tap “Read it again”.'
            : "Couldn't read that out. Check the phone's volume and try “Read it again”.",
        );
      },
    });
    if (!ok) {
      done();
      (onFail || (() => setReadNote(NO_SPEECH)))();
    }
  };
  const sayStep = (i: number) => talk(i18nStep(i, stepCount, stepText(i)));
  const toggleRead = () => {
    if (!speechOK) {
      setReadNote(NO_SPEECH);
      return;
    }
    const v = !readAloud;
    setReadAloud(v);
    savePref('cook_read_aloud', v);
    if (v) sayStep(step);
    else {
      stopSpeaking();
      setSpeaking(false);
      if (voiceOnRef.current) listenerRef.current?.resume();
    }
  };
  const firstStep = useRef(true);
  // Opening cooking mode with Read on reads the first step; after that, each step you move to
  // (and always when you're cooking by voice). Read and Voice being turned on or off don't
  // re-read the step by themselves, so they're read here as they are now rather than watched.
  const readStepShown = useEffectEvent(() => {
    if (firstStep.current) {
      firstStep.current = false;
      if (!readAloud) return;
    }
    if ((readAloud || voiceOnRef.current) && !finished) sayStep(step);
  });
  useEffect(() => {
    readStepShown();
  }, [step, method]);

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
        ingredients: ingredients.map((ing) => {
          const l = ingredientLine(ing, scale);
          return `${l.amount} ${l.name}${ing.note ? `, ${ing.note}` : ''}`.trim();
        }),
      });
    } catch (e) {
      problem = true;
      a =
        e instanceof NoGeminiKeyError
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
  const minutesLeft = (ms: number) => {
    const m = Math.ceil(ms / 60000);
    return m <= 1 ? 'about a minute' : `${m} minutes`;
  };
  const runCommand = (c: VoiceCommand) => {
    switch (c.kind) {
      case 'next':
        next();
        break;
      case 'back':
        if (step === 0) talk("You're at the start.");
        else setStep((x) => Math.max(0, x - 1));
        break;
      case 'repeat':
        sayStep(step);
        break;
      case 'goto':
        if (c.step >= 1 && c.step <= instructions.length) setStep(c.step);
        else talk(`There are ${instructions.length} steps.`);
        break;
      case 'finish':
        setFinished(true);
        break;
      case 'timer_start': {
        if (c.minutes) {
          start(`Timer`, c.minutes, recipe!.name);
          talk(`Timer set for ${c.minutes === 1 ? 'one minute' : `${c.minutes} minutes`}.`);
          break;
        }
        const t = timerFor(step);
        if (!t) {
          talk("This step doesn't have a time. Say, set a timer for ten minutes.");
          break;
        }
        const running = timers.find((x) => x.label === t.label && x.recipe === recipe!.name);
        if (running) {
          talk(`${t.label} is already running, ${minutesLeft(timeLeft(running, Date.now()))} left.`);
          break;
        }
        start(t.label, t.minutes, recipe!.name);
        talk(`${t.label} timer started, ${t.minutes} minutes.`);
        break;
      }
      case 'timer_stop': {
        const ringing = timers.filter((x) => x.state === 'ringing');
        const target = ringing.length ? ringing : timers.slice(-1);
        if (!target.length) {
          talk('No timers are running.');
          break;
        }
        target.forEach((x) => stop(x.id));
        talk(target.length > 1 ? 'Timers stopped.' : `${target[0].label} stopped.`);
        break;
      }
      case 'time_left': {
        if (!timers.length) {
          talk('No timers are running.');
          break;
        }
        talk(
          timers
            .map((x) =>
              x.state === 'ringing'
                ? `${x.label} is done.`
                : `${x.label}, ${minutesLeft(timeLeft(x, Date.now()))} left.`,
            )
            .join(' '),
        );
        break;
      }
      case 'ingredients': {
        const used = step === 0 ? ingredients : ingredientsForStep(instructions[step - 1] || '', ingredients);
        talk(
          used.length
            ? `${step === 0 ? 'You need' : 'For this step'}: ${used
                .map((ing) => {
                  const l = ingredientLine(ing, scale);
                  return `${l.amount} ${l.name}`.trim();
                })
                .join(', ')}.`
            : "This step doesn't use any of the ingredients.",
        );
        break;
      }
      case 'help':
        talk(VOICE_HELP);
        break;
      case 'question':
        ask(c.text, true);
        break;
    }
  };
  // The microphone is set up once; what it hears is acted on with the screen as it is now.
  const runCommandRef = useLatest(runCommand);

  const stopVoice = () => {
    listenerRef.current?.stop();
    setVoiceOn(false);
    setListening(false);
  };
  const toggleVoice = () => {
    if (voiceOn) {
      stopVoice();
      return;
    }
    if (!listenOK) {
      setReadNote(NO_LISTEN);
      return;
    }
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
          setReadNote(
            problem === 'blocked'
              ? "The microphone isn't allowed here. Allow it for this site in your browser's settings (it can't be used inside a preview in another app), then tap Voice again."
              : problem === 'no-mic'
                ? "Couldn't find a microphone."
                : problem === 'network'
                  ? 'Voice needs internet. Check your connection and tap Voice again.'
                  : problem === 'unsupported'
                    ? NO_LISTEN
                    : 'Voice stopped listening. Tap Voice to start again.',
          );
        },
      });
    }
    setVoiceOn(true);
    voiceOnRef.current = true;
    listenerRef.current.start();
  };
  useEffect(() => {
    if (finished) {
      stopSpeaking();
      setSpeaking(false);
      listenerRef.current?.pause();
    } else if (voiceOnRef.current) listenerRef.current?.resume();
  }, [finished, voiceOnRef]);
  useEffect(
    () => () => {
      stopSpeaking();
      listenerRef.current?.stop();
    },
    [],
  );

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
    const RO = window.ResizeObserver;
    if (!RO) return;
    const ro = new RO(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
    // Refitted whenever what's on the step's card changes, as well as on resize.
  }, [big, step, method, servings, tickedCount, timers.length, readAloud]);

  if (!meal || !recipe) {
    return (
      <div className="fixed inset-0 z-50 app-page flex flex-col items-center justify-center p-6 text-center">
        <ChefHat className="w-8 h-8 text-zinc-400 mb-3" />
        <h3 className="font-semibold text-zinc-900">Couldn't find this recipe</h3>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl">
          Close
        </button>
      </div>
    );
  }

  const next = () => (step >= stepCount - 1 ? setFinished(true) : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const toggleTicked = (key: string) => setTicked((t) => ({ ...t, [key]: !t[key] }));
  const stepTimers: StepTimers = { timers, now, start, recipeName: recipe.name };

  return (
    <div
      id="cook-mode-overlay"
      className="fixed inset-0 z-50 app-page flex flex-col overflow-hidden animate-in fade-in duration-200"
      data-cook-mode
    >
      {asking && (
        <AskSheet
          recipeName={recipe.name}
          canDictate={false}
          onAsk={(q) => {
            setAsking(false);
            ask(q, false);
          }}
          onClose={() => setAsking(false)}
        />
      )}
      {finished && (
        <FinishedScreen
          store={store}
          recipe={recipe}
          meal={meal}
          dayName={dayName}
          servings={servings}
          plannedMeal={!!onMarkCooked && dayName !== 'Cookbook'}
          fridge={plan.extra > 0 ? { portions: plan.extra, days: plan.leftoverDays } : null}
          onBack={() => setFinished(false)}
          onDone={(result) => {
            if (result.markCooked && onMarkCooked) onMarkCooked(meal.id, true, { froze: result.froze });
            onClose();
          }}
        />
      )}

      {/* Header: the recipe, who for, times; method, big steps, read aloud */}
      <header className="bg-white border-b border-zinc-200 px-3 pt-2.5 pb-2 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600 shrink-0 cursor-pointer"
            aria-label="Leave cooking mode"
            data-cook-close
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-zinc-900 truncate leading-tight" data-cook-title>
              {recipe.name}
            </h2>
            <p className="text-xs text-zinc-500 truncate" data-cook-times>
              {prep ? `Prep ${prep}` : ''}
              {prep && cook ? ' · ' : ''}
              {cook ? `cook ${cook}` : ''}
              {prep || cook ? ' min' : ''}
              {dayName && dayName !== 'Cookbook' ? ` · ${dayName}` : ''}
            </p>
          </div>
          <div className="flex items-center shrink-0 rounded-xl border border-zinc-200 bg-zinc-50" data-cook-people>
            <button
              type="button"
              onClick={() => setServings((n) => Math.max(1, n - 1))}
              className="w-9 h-10 flex items-center justify-center text-zinc-600 cursor-pointer"
              aria-label="One fewer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-zinc-900 whitespace-nowrap tabular-nums" data-cook-servings>
              for {servings}
            </span>
            <button
              type="button"
              onClick={() => setServings((n) => Math.min(24, n + 1))}
              className="w-9 h-10 flex items-center justify-center text-zinc-600 cursor-pointer"
              aria-label="One more"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-2 mt-2">
          {methods.length > 1 && (
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200" data-cook-method>
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={`px-2.5 h-9 text-[13px] font-semibold rounded-lg cursor-pointer ${method === m ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}
                >
                  {METHOD_LABEL[m] || m}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto flex items-center gap-1">
            {(
              [
                {
                  key: 'big',
                  label: 'Big',
                  on: big,
                  icon: <Type className="w-4 h-4" />,
                  onClick: () => {
                    const v = !big;
                    setBig(v);
                    savePref('cook_big_steps', v);
                  },
                  attrs: { 'data-cook-big': true, 'aria-label': 'Big steps: one step at a time in large text' },
                },
                {
                  key: 'read',
                  label: 'Read',
                  on: readAloud,
                  dim: !speechOK,
                  icon: readAloud ? (
                    <Volume2 className={`w-4 h-4 ${speaking ? 'animate-pulse' : ''}`} />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  ),
                  onClick: toggleRead,
                  attrs: {
                    'data-cook-read': true,
                    'aria-label': readAloud ? 'Stop reading the steps aloud' : 'Read the steps aloud',
                  },
                },
                {
                  key: 'voice',
                  label: 'Voice',
                  on: voiceOn,
                  dim: !listenOK,
                  icon: voiceOn ? (
                    <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  ),
                  onClick: toggleVoice,
                  attrs: {
                    'data-cook-voice': true,
                    'aria-label': voiceOn ? 'Stop listening' : 'Voice: say next, back, repeat, or ask a question',
                  },
                },
                {
                  key: 'ask',
                  label: 'Ask',
                  on: asking,
                  icon: <MessageCircleQuestionMark className="w-4 h-4" />,
                  onClick: () => setAsking(true),
                  attrs: { 'data-cook-ask': true, 'aria-label': 'Ask a question about this recipe' },
                },
              ] as const
            ).map((b: HeaderButton) => (
              <button
                key={b.key}
                type="button"
                onClick={b.onClick}
                aria-pressed={b.on}
                {...b.attrs}
                className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold leading-none cursor-pointer ${b.on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'} ${b.dim ? 'opacity-60' : ''}`}
              >
                {b.icon}
                {b.label}
              </button>
            ))}
          </span>
        </div>
      </header>

      {readNote && (
        <div
          className="shrink-0 bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-2 text-sm"
          role="status"
          data-read-note
        >
          <div className="max-w-2xl mx-auto flex items-start gap-2">
            <VolumeX className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{readNote}</span>
          </div>
        </div>
      )}
      {(readAloud || voiceOn) && !readNote && (
        <div
          className="shrink-0 bg-zinc-100 border-b border-zinc-200 px-4 py-1.5 text-[13px] text-zinc-700"
          data-read-on
        >
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            {voiceOn ? (
              <Mic
                className={`w-4 h-4 shrink-0 ${listening && !speaking ? 'text-rose-600 animate-pulse' : 'text-zinc-400'}`}
              />
            ) : (
              <Volume2
                className={`w-4 h-4 shrink-0 ${speaking ? 'text-emerald-600 animate-pulse' : 'text-zinc-500'}`}
              />
            )}
            <span className="flex-1 min-w-0 truncate" data-voice-status>
              {heard ? (
                heard.understood ? (
                  <>
                    Heard “<strong>{heard.text}</strong>”
                  </>
                ) : (
                  <span className="text-zinc-500">Heard “{heard.text}”, not a command</span>
                )
              ) : speaking ? (
                'Reading…'
              ) : voiceOn ? (
                listening ? (
                  'Listening: say “next”, “back”, “repeat” or “question, …”'
                ) : (
                  'Starting the microphone…'
                )
              ) : (
                'Reads each step as you go'
              )}
            </span>
            <button
              type="button"
              onClick={() => sayStep(step)}
              className="shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
              data-read-again
            >
              Read it again
            </button>
          </div>
        </div>
      )}
      {answer && (
        <div className="shrink-0 bg-blue-50 border-b border-blue-200 px-4 py-2" data-answer>
          <div className="max-w-2xl mx-auto flex items-start gap-2">
            <MessageCircleQuestionMark className="w-4 h-4 shrink-0 mt-0.5 text-blue-700" />
            <div className="flex-1 min-w-0 max-h-36 overflow-y-auto">
              <p className="text-[13px] font-semibold text-blue-950" data-answer-q>
                {answer.q}
              </p>
              {answer.loading ? (
                <p className="text-sm text-blue-900/80 inline-flex items-center gap-1.5 mt-0.5">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  Asking Gemini…
                </p>
              ) : (
                <p
                  className={`text-sm leading-snug mt-0.5 ${answer.problem ? 'text-rose-800' : 'text-blue-950'}`}
                  data-answer-a
                >
                  {answer.a}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  askSeq.current++;
                  setAnswer(null);
                }}
                className="w-8 h-8 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-blue-800 cursor-pointer"
                aria-label="Close the answer"
                data-answer-close
              >
                <X className="w-4 h-4" />
              </button>
              {answer.a && !answer.problem && speechOK && (
                <button
                  type="button"
                  onClick={() => talk(answer.a!)}
                  className="text-xs font-semibold text-blue-800 underline underline-offset-2 cursor-pointer"
                  data-answer-read
                >
                  Read it
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {(plan.banner || (meal.sides && meal.sides.length > 0)) && (
        <div
          className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-950"
          data-cook-banner
        >
          <div className="max-w-2xl mx-auto space-y-0.5">
            {plan.banner && <p className="font-semibold">{plan.banner}</p>}
            {meal.sides && meal.sides.length > 0 && <p>With: {meal.sides.map((s) => s.name).join(', ')}</p>}
          </div>
        </div>
      )}

      {(dayNote || recipeNotes) && (
        <div
          className={`shrink-0 border-b px-4 py-2 ${notesOpen ? 'bg-white border-zinc-200' : 'bg-zinc-50 border-zinc-200'}`}
          data-cook-notes
        >
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="w-full flex items-center gap-1.5 text-left text-sm font-semibold text-zinc-800 cursor-pointer"
              data-cook-notes-toggle
            >
              <StickyNote className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                Notes
                {!notesOpen && (
                  <span className="font-normal text-zinc-500">
                    {' '}
                    ·{' '}
                    {[dayNote, recipeNotes].filter(Boolean).length === 2
                      ? "today's and the recipe's"
                      : dayNote
                        ? "today's"
                        : "the recipe's"}
                    : tap to see
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${notesOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {notesOpen && (
              <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                {dayNote && (
                  <div
                    className={`rounded-xl border px-3 py-2 ${noteLook(meal.noteBy).box}`}
                    data-cook-day-note={meal.noteBy || ''}
                  >
                    <p className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                      For {dayName}
                      <PersonMark who={meal.noteBy} what="Note written" />
                    </p>
                    <p className={`text-[15px] leading-snug whitespace-pre-line ${noteLook(meal.noteBy).text}`}>
                      {dayNote}
                    </p>
                  </div>
                )}
                {recipeNotes && (
                  <div
                    className={`rounded-xl border px-3 py-2 ${noteLook(recipe?.notesBy).box}`}
                    data-cook-recipe-notes={recipe?.notesBy || ''}
                  >
                    <p className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                      Our notes on the recipe
                      <PersonMark who={recipe?.notesBy} what="Notes written" />
                    </p>
                    <p className={`text-[15px] leading-snug whitespace-pre-line ${noteLook(recipe?.notesBy).text}`}>
                      {recipeNotes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <TimerBar />

      {big ? (
        <BigSteps
          fitRef={fitRef}
          step={step}
          stepCount={stepCount}
          stepText={stepText(step)}
          instructions={instructions}
          ingredients={ingredients}
          scale={scale}
          ticked={ticked}
          tickedCount={tickedCount}
          onToggle={toggleTicked}
          timers={stepTimers}
          back={back}
          next={next}
        />
      ) : (
        <StepList
          listRef={listRef}
          step={step}
          setStep={setStep}
          stepCount={stepCount}
          instructions={instructions}
          ingredients={ingredients}
          scale={scale}
          ticked={ticked}
          tickedCount={tickedCount}
          onToggle={toggleTicked}
          timers={stepTimers}
          back={back}
          next={next}
        />
      )}
    </div>
  );
}
