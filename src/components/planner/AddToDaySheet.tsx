/** "Add to a day" for a recipe (from the recipe pop-up or the Cookbook): pick the week and the day. */
import React from 'react';
import { Plus, X } from 'lucide-react';
import { MealPlan, Recipe } from '../../types';
import { DAYS_OF_WEEK } from '../../utils';

export default function AddToDaySheet({ recipe, plans, currentPlan, weekLabel, onPickWeek, today, onPick, onClose }: {
  recipe: Recipe;
  /** The weeks you can plan. */
  plans: MealPlan[];
  currentPlan: MealPlan | undefined;
  weekLabel: (startDate: string) => string;
  onPickWeek: (id: string) => void;
  today: string;
  onPick: (day: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center px-4 pt-[max(1rem,6vh)] pb-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Add ${recipe.name} to a day`}
        data-add-to-day
        className="bg-white rounded-2xl p-4 max-w-md w-full shadow-xl border border-zinc-200 max-h-[86vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-zinc-900">Add to a day</h3>
            <p className="text-sm text-zinc-600 break-words">{recipe.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {plans.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto py-3 shrink-0 -mx-1 px-1" role="tablist" aria-label="Week">
            {plans.map((p: MealPlan) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={currentPlan?.id === p.id}
                data-week-chip={weekLabel(p.startDate)}
                onClick={() => onPickWeek(p.id)}
                className={`shrink-0 h-9 px-3 rounded-full text-sm font-semibold border cursor-pointer ${
                  currentPlan?.id === p.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                {weekLabel(p.startDate)}
              </button>
            ))}
          </div>
        )}
        {currentPlan?.status === 'finalized' && (
          <p className="text-xs text-zinc-600 pb-2 shrink-0">This week's shopping list is made; you'll be asked whether to update it.</p>
        )}

        <div className="overflow-y-auto space-y-1.5 pt-1 pb-1">
          {currentPlan && DAYS_OF_WEEK.map(day => {
            const dayPlan = currentPlan.days[day];
            const meal = dayPlan?.meals?.[0];
            const date = dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00') : null;
            const past = !!dayPlan?.date && dayPlan.date < today;
            return (
              <button
                key={day}
                type="button"
                data-add-day={day}
                onClick={() => onPick(day)}
                className={`w-full text-left rounded-xl border flex items-stretch transition-colors cursor-pointer ${past ? 'border-zinc-100 bg-zinc-50/70' : 'border-zinc-200 hover:bg-zinc-50'}`}
              >
                <span className={`w-14 shrink-0 flex flex-col items-center justify-center border-r border-zinc-100 py-2 ${past ? 'text-zinc-400' : 'text-zinc-800'}`}>
                  <span className="text-xs font-bold uppercase">{day.slice(0, 3)}</span>
                  <span className="text-base font-bold tabular-nums leading-tight">{date ? date.getDate() : ''}</span>
                </span>
                <span className="flex-1 min-w-0 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    {meal ? (
                      <>
                        <span className="block text-sm font-medium text-zinc-900 truncate">{meal.name.replace(/^(leftovers?|batch):\s*/i, '')}</span>
                        <span className="block text-xs text-zinc-500">Tap to replace</span>
                      </>
                    ) : (
                      <span className="block text-sm text-zinc-500">Free</span>
                    )}
                  </span>
                  <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
