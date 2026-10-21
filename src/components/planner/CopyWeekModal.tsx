/** "Copy a week": pick a week to copy, then (if this week has meals) confirm replacing them. */
import { X } from 'lucide-react';
import { MealPlan } from '../../types';
import { DAYS_OF_WEEK } from '../../utils';

export default function CopyWeekModal({
  state,
  plan,
  candidates,
  mealsPlanned,
  weekLabel,
  onState,
  onCopy,
  onClose,
}: {
  /** 'pick' lists the weeks; a week means "confirm replacing this week's meals with it". */
  state: 'pick' | MealPlan;
  /** The week on screen. */
  plan: MealPlan;
  candidates: MealPlan[];
  mealsPlanned: number;
  weekLabel: (startDate: string) => string;
  onState: (state: 'pick' | MealPlan) => void;
  onCopy: (source: MealPlan) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Copy a week"
      >
        {state === 'pick' ? (
          <>
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-zinc-100">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Copy a week</h3>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Fills {weekLabel(plan.startDate)} with the same meals, day by day. You can change any of them
                  afterwards.
                </p>
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
            <div className="overflow-y-auto p-3 space-y-2">
              {candidates.map((source: MealPlan) => {
                const meals = DAYS_OF_WEEK.flatMap((d) =>
                  (source.days?.[d]?.meals || []).map((m) => ({
                    day: d,
                    name: (m.name || '').replace(/^(leftovers?|batch):\s*/i, ''),
                  })),
                );
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => (mealsPlanned > 0 ? onState(source) : onCopy(source))}
                    className="w-full text-left p-3 rounded-xl border border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900">{weekLabel(source.startDate)}</span>
                      <span className="text-xs text-zinc-500 tabular-nums shrink-0">
                        {meals.length} meal{meals.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="mt-1.5 grid gap-0.5">
                      {meals.map((m, i) => (
                        <li key={i} className="text-sm text-zinc-600 truncate">
                          <span className="inline-block w-10 text-zinc-400">{m.day.slice(0, 3)}</span>
                          {m.name}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-center text-zinc-900 mb-2">Replace this week's meals?</h3>
            <p className="text-sm text-zinc-500 text-center mb-6 leading-relaxed">
              The {mealsPlanned} meal{mealsPlanned === 1 ? '' : 's'} planned for {weekLabel(plan.startDate)} will be
              replaced with the meals from {weekLabel(state.startDate)}.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onState('pick')}
                className="flex-1 py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onCopy(state)}
                className="flex-1 py-2.5 text-white font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors text-sm cursor-pointer"
              >
                Replace
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
