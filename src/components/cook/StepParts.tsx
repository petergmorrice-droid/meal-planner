/** The pieces of a cooking step: its timer button, what it uses, and the "Get everything out" list. */
import { Check, Timer } from 'lucide-react';
import type { Ingredient } from '../../types';
import { ingredientsForStep, stepMinutes, stepTimerLabel, timeLeft, timerText, type CookTimer } from '../../cookInfo';
import { ingredientLine } from './cookParts';

/** The kitchen timers, for a step's timer button. */
export interface StepTimers {
  timers: CookTimer[];
  now: number;
  start: (label: string, minutes: number, recipe?: string) => void;
  /** The recipe being cooked (each timer says which recipe it's for). */
  recipeName: string;
}

/** Timer button for a step (or the running timer, if there is one). */
export function StepTimer({ text, timers: { timers, now, start, recipeName } }: { text: string; timers: StepTimers }) {
  const minutes = stepMinutes(text);
  if (!minutes) return null;
  const label = stepTimerLabel(text);
  const running = timers.find((t) => t.label === label && t.recipe === recipeName);
  if (running) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${running.state === 'ringing' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}
        data-step-timer-running
      >
        <Timer className="w-4 h-4" />
        {running.state === 'ringing' ? 'Done!' : timerText(timeLeft(running, now))}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        start(label, minutes, recipeName);
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white text-emerald-800 font-semibold cursor-pointer active:bg-emerald-50 px-3 py-1.5 text-sm"
      data-start-timer={minutes}
    >
      <Timer className="w-4 h-4" /> Start {minutes} min timer
    </button>
  );
}

/** The ingredients a step uses, scaled for the people you're cooking for. */
export function StepNeeds({ text, ingredients, scale }: { text: string; ingredients: Ingredient[]; scale: number }) {
  const used = ingredientsForStep(text, ingredients);
  if (!used.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2" data-step-needs>
      {used.map((ing, i) => {
        const l = ingredientLine(ing, scale);
        return (
          <span
            key={ing.id || i}
            className="rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-2 py-0.5 text-sm"
          >
            {l.amount && <strong className="font-semibold">{l.amount} </strong>}
            {l.name}
          </span>
        );
      })}
    </div>
  );
}

/** "Get everything out": every ingredient, ticked off as it comes out. */
export function GetOutList({
  ingredients,
  scale,
  ticked,
  onToggle,
}: {
  ingredients: Ingredient[];
  scale: number;
  ticked: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="divide-y divide-zinc-100 mt-2" data-get-out>
      {ingredients.map((ing, idx) => {
        const key = ing.id || String(idx);
        const on = !!ticked[key];
        const l = ingredientLine(ing, scale);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(key);
              }}
              aria-pressed={on}
              className="w-full text-left flex items-start gap-3 cursor-pointer py-2"
            >
              <span
                className={`mt-0.5 rounded-md border flex items-center justify-center shrink-0 w-5 h-5 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}
              >
                {on && <Check className="w-3.5 h-3.5" />}
              </span>
              <span
                className={`min-w-0 flex-1 leading-snug text-[15px] ${on ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}
              >
                {l.amount && <span className="font-semibold tabular-nums">{l.amount} </span>}
                {l.name}
                {ing.note && (
                  <span className={`block text-[13px] ${on ? 'text-zinc-400' : 'text-zinc-500'}`}>{ing.note}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
