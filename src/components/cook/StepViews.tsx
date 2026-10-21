/**
 * The steps in cooking mode, two ways: big steps (one at a time, as big as fits on the screen) or
 * all the steps in one column. Each has Back and Next (Finished on the last step).
 */
import type { CSSProperties, RefObject } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Ingredient } from '../../types';
import { scaleRecipeStepQuantities } from '../../utils';
import { ingredientsForStep, stepMinutes } from '../../cookInfo';
import { ingredientLine } from './cookParts';
import { GetOutList, StepNeeds, StepTimer, type StepTimers } from './StepParts';

/** Big steps: one step at a time; its text shrinks to fit the screen (fitRef is measured for that). */
export function BigSteps({
  fitRef,
  step,
  stepCount,
  stepText,
  instructions,
  ingredients,
  scale,
  ticked,
  tickedCount,
  onToggle,
  timers,
  back,
  next,
}: {
  fitRef: RefObject<HTMLDivElement | null>;
  step: number;
  /** "Get everything out" plus the recipe's steps. */
  stepCount: number;
  instructions: string[];
  ingredients: Ingredient[];
  scale: number;
  ticked: Record<string, boolean>;
  tickedCount: number;
  onToggle: (key: string) => void;
  timers: StepTimers;
  back: () => void;
  next: () => void;
  /** This step's text, scaled (and the ingredients, for "Get everything out"). */
  stepText: string;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0" data-big-step={step}>
      <div
        ref={fitRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-2"
        style={{ '--fit': '30px' } as CSSProperties}
        data-big-fit
      >
        <div className="max-w-2xl mx-auto">
          <p className="font-semibold text-zinc-500 mb-1.5" style={{ fontSize: 'max(13px, calc(var(--fit) * 0.5))' }}>
            {step === 0 ? 'First' : `Step ${step} of ${stepCount - 1}`}
          </p>
          {step === 0 ? (
            <>
              <h3 className="font-bold text-zinc-900 leading-tight" style={{ fontSize: 'var(--fit)' }}>
                Get everything out
              </h3>
              <p className="text-zinc-500 mt-0.5" style={{ fontSize: 'max(13px, calc(var(--fit) * 0.55))' }}>
                {tickedCount} of {ingredients.length} out
              </p>
              <ul className="divide-y divide-zinc-100 mt-1" data-get-out>
                {ingredients.map((ing, idx) => {
                  const key = ing.id || String(idx);
                  const on = !!ticked[key];
                  const l = ingredientLine(ing, scale);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => onToggle(key)}
                        aria-pressed={on}
                        className="w-full text-left flex items-center gap-3 cursor-pointer"
                        style={{
                          paddingTop: 'calc(var(--fit) * 0.25)',
                          paddingBottom: 'calc(var(--fit) * 0.25)',
                          fontSize: 'max(15px, calc(var(--fit) * 0.68))',
                        }}
                      >
                        <span
                          className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}
                        >
                          {on && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <span
                          className={`min-w-0 flex-1 leading-snug ${on ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}
                        >
                          {l.amount && <span className="font-semibold tabular-nums">{l.amount} </span>}
                          {l.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p
                className="font-semibold text-zinc-900"
                style={{ fontSize: 'var(--fit)', lineHeight: 1.3 }}
                data-big-text
              >
                {stepText}
              </p>
              {(() => {
                const used = ingredientsForStep(instructions[step - 1], ingredients);
                return used.length ? (
                  <div
                    className="flex flex-wrap gap-1.5 mt-3"
                    data-step-needs
                    style={{ fontSize: 'max(14px, calc(var(--fit) * 0.6))' }}
                  >
                    {used.map((ing, i) => {
                      const l = ingredientLine(ing, scale);
                      return (
                        <span
                          key={ing.id || i}
                          className="rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-2.5 py-1"
                        >
                          {l.amount && <strong className="font-semibold">{l.amount} </strong>}
                          {l.name}
                        </span>
                      );
                    })}
                  </div>
                ) : null;
              })()}
              {stepMinutes(instructions[step - 1]) && (
                <div className="mt-3">
                  <StepTimer text={instructions[step - 1]} timers={timers} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div
        className="shrink-0 flex gap-2 px-3 pt-2 app-page border-t border-zinc-200"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="w-14 h-14 rounded-xl border border-zinc-300 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0"
          aria-label="Back a step"
          data-big-back
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={next}
          className={`flex-1 h-14 rounded-xl text-white text-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] bg-emerald-600`}
          data-big-next
        >
          {step >= stepCount - 1 ? 'Finished' : 'Next'} <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

/** All the steps in one column; tap one to make it the current step. */
export function StepList({
  listRef,
  step,
  setStep,
  stepCount,
  instructions,
  ingredients,
  scale,
  ticked,
  tickedCount,
  onToggle,
  timers,
  back,
  next,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  setStep: (step: number) => void;
  step: number;
  /** "Get everything out" plus the recipe's steps. */
  stepCount: number;
  instructions: string[];
  ingredients: Ingredient[];
  scale: number;
  ticked: Record<string, boolean>;
  tickedCount: number;
  onToggle: (key: string) => void;
  timers: StepTimers;
  back: () => void;
  next: () => void;
}) {
  return (
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
              <span className="text-sm text-zinc-500 tabular-nums">
                {tickedCount} of {ingredients.length}
              </span>
            </div>
            <GetOutList ingredients={ingredients} scale={scale} ticked={ticked} onToggle={onToggle} />
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
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${active ? 'bg-emerald-600 text-white' : passed ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}
                  >
                    {passed ? <Check className="w-4 h-4" /> : n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[17px] leading-relaxed ${active ? 'text-zinc-950 font-semibold' : 'text-zinc-700'}`}
                    >
                      {scaleRecipeStepQuantities(text, ingredients, scale)}
                    </p>
                    <StepNeeds text={text} ingredients={ingredients} scale={scale} />
                    {stepMinutes(text) && (
                      <div className="mt-2.5">
                        <StepTimer text={text} timers={timers} />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
          {instructions.length === 0 && <p className="text-sm text-zinc-500 px-1">This recipe has no steps yet.</p>}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-3"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="h-12 px-4 rounded-xl border border-zinc-300 text-zinc-700 font-semibold disabled:opacity-30 cursor-pointer"
          data-cook-back
        >
          Back
        </button>
        <span className="flex-1 text-center text-sm text-zinc-500 tabular-nums" data-cook-step>
          {step === 0 ? 'Get everything out' : `Step ${step} of ${stepCount - 1}`}
        </span>
        <button
          type="button"
          onClick={next}
          className={`h-12 px-6 rounded-xl text-white font-semibold cursor-pointer bg-emerald-600`}
          data-cook-next
        >
          {step >= stepCount - 1 ? 'Finished' : 'Next'}
        </button>
      </div>
    </>
  );
}
