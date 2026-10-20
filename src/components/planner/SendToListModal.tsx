/** "Send this week to the shopping list": every day in full first (meal, people, sides, notes), then send. */
import React from 'react';
import { AlertCircle, BookOpen, Check, CheckCircle2, Sparkles, StickyNote, X } from 'lucide-react';
import { MealPlan, Recipe } from '../../types';
import { DAYS_OF_WEEK, formatWeekRange } from '../../utils';
import { cooksForText, leftoverSourceDay } from '../../planning';
import PersonMark, { noteLook } from '../PersonMark';
import { describeMeal, mealTitle, dayTone } from './DayListRow';

export default function SendToListModal({ plan, recipes, emptyDays, onEditDay, onSend, onClose }: {
  plan: MealPlan;
  recipes: Recipe[];
  /** Days with nothing planned. */
  emptyDays: string[];
  /** "Edit" / "+ Add" on a day. */
  onEditDay: (day: string, hasMeal: boolean) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] shadow-xl border border-zinc-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 leading-tight">
                Send this week to the shopping list
              </h3>
              <p className="text-xs text-zinc-400 truncate">
                Week of {formatWeekRange(plan.startDate)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Days with nothing planned, or all seven done */}
          {emptyDays.length > 0 ? (
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-950">
                  Meals have not been allocated for {emptyDays.length === 1 ? '1 day' : `${emptyDays.length} days`}:
                </p>
                <p className="font-medium text-amber-900 bg-amber-100/60 px-2 py-1 rounded-md inline-block">
                  {emptyDays.join(', ')}
                </p>
                <p className="text-[11px] text-amber-800/90 pt-0.5 leading-relaxed">
                  You can still send it now and add these later, or tap a day below to add a meal first.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-950 flex items-center gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900">All 7 days planned</p>
                <p className="text-[11px] text-emerald-700">Every day of this week has a meal.</p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                The week's meals
              </span>
              <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                {DAYS_OF_WEEK.length - emptyDays.length} / 7 days filled
              </span>
            </div>

            {/* Every day in full: the meal, what kind, people, sides, who it cooks for, and the notes. */}
            <div className="space-y-1.5" data-send-breakdown>
              {DAYS_OF_WEEK.map(day => {
                const dayPlan = plan.days[day];
                const meal = dayPlan?.meals?.[0] || null;
                const dayDate = dayPlan?.date
                  ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : '';
                const d = meal ? describeMeal(meal, leftoverSourceDay(plan.days, day, meal)) : null;
                const cooks = meal ? cooksForText(plan.days, day, meal) : null;
                const tone = dayTone(meal);
                const recipe = meal?.recipeId ? recipes.find((r: Recipe) => r.id === meal.recipeId) : null;
                const recipeNotes = (recipe?.notes || '').trim();
                return (
                  <div
                    key={day}
                    className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                      meal ? (tone ? tone.card : 'bg-white border-zinc-200') : 'bg-zinc-50/60 border-dashed border-zinc-200/80'
                    }`}
                    data-send-day={day}
                  >
                    <div className="w-14 shrink-0 leading-tight pt-0.5">
                      <span className="font-bold text-xs text-zinc-900 block">{day.slice(0, 3)}</span>
                      <span className="text-[11px] text-zinc-500 block">{dayDate}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {meal && d ? (
                        <>
                          <span className="font-semibold text-sm text-zinc-900 block break-words leading-snug">{mealTitle(meal)}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-zinc-600">
                            {d.label && d.label.text && (
                              <span className={`inline-flex items-center gap-1 font-semibold border rounded-md px-1.5 py-px [&>svg]:w-3 [&>svg]:h-3 ${d.label.tone}`}>{d.label.icon}{d.label.text}</span>
                            )}
                            {meal.type !== 'no_meal' && <span>{meal.servings || 2} {(meal.servings || 2) === 1 ? 'person' : 'people'}</span>}
                            {cooks && <span>{cooks}</span>}
                            {meal.sides && meal.sides.length > 0 && <span>+ {meal.sides.map((x) => x.name).join(', ')}</span>}
                          </span>
                          {d.note && (
                            <span className={`mt-1 flex items-start gap-1 text-xs break-words ${noteLook(meal.noteBy).text}`} data-send-note>
                              <StickyNote className={`w-3 h-3 shrink-0 mt-0.5 ${noteLook(meal.noteBy).icon}`} />
                              <span className="min-w-0">{d.note}</span>
                              <PersonMark who={meal.noteBy} what="Note written" />
                            </span>
                          )}
                          {recipeNotes && (
                            <span className={`mt-1 flex items-start gap-1 text-xs break-words whitespace-pre-line ${noteLook(recipe?.notesBy).text}`} data-send-recipe-note>
                              <BookOpen className={`w-3 h-3 shrink-0 mt-0.5 ${noteLook(recipe?.notesBy).icon}`} />
                              <span className="min-w-0"><span className="font-semibold">Recipe notes: </span>{recipeNotes}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">Nothing planned</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditDay(day, !!meal)}
                      className="text-xs font-semibold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-md transition-colors shrink-0 cursor-pointer"
                      title={`Edit ${day}`}
                    >
                      {meal ? 'Edit' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What sending does */}
          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/80 text-[11px] text-zinc-600 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-zinc-800">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>What happens when you send it?</span>
            </div>
            <p className="text-zinc-500 leading-relaxed">
              The week's ingredients go on the <strong>shopping list</strong> and the meals appear in the <strong>Cook</strong> tab. You can still change the week afterwards: an <strong>Update list</strong> button appears.
            </p>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-100 bg-zinc-50/60 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-zinc-700 font-medium bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors text-xs cursor-pointer"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onSend}
            className="px-4 py-2 text-white font-medium bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-2xs transition-colors text-xs cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Send to shopping list</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Send to list with nothing planned yet. */
export function NoMealsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-600 flex items-center justify-center mx-auto mb-3.5 shadow-2xs">
          <AlertCircle className="w-5 h-5" />
        </div>

        <h3 className="text-base font-bold text-zinc-900 mb-1.5">
          Add a meal first
        </h3>

        <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
          Add a meal to at least one day first, then send the week to the shopping list.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
        >
          Okay
        </button>
      </div>
    </div>
  );
}
