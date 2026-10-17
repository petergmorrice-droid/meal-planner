import React from 'react';
import { Plus, Trash2, Users, Snowflake, ShoppingBag, Utensils, RotateCcw, X, ChevronRight } from 'lucide-react';
import { DayPlan, PlannedMeal } from '../../types';

export const cleanMealName = (name: string) => (name || '').replace(/^(leftovers?|batch):\s*/i, '').trim();
export const isLeftoverMeal = (m: PlannedMeal) => m.type === 'leftover' || /^leftovers?:\s*/i.test(m.name || '');

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const typeLabel = (meal: PlannedMeal): { text: string; icon: React.ReactNode; tone: string } | null => {
  if (isLeftoverMeal(meal)) return { text: 'Leftovers', icon: <RotateCcw className="w-3.5 h-3.5" />, tone: 'text-amber-800 bg-amber-50 border-amber-200' };
  if (meal.type === 'batch' || /^batch:/i.test(meal.name || '')) return { text: 'Freezer', icon: <Snowflake className="w-3.5 h-3.5" />, tone: 'text-cyan-800 bg-cyan-50 border-cyan-200' };
  if (meal.type === 'takeout') return { text: 'Takeaway', icon: <ShoppingBag className="w-3.5 h-3.5" />, tone: 'text-orange-800 bg-orange-50 border-orange-200' };
  if (meal.type === 'eating_out') return { text: 'Eating out', icon: <Utensils className="w-3.5 h-3.5" />, tone: 'text-blue-800 bg-blue-50 border-blue-200' };
  if (meal.type === 'no_meal') return { text: 'No meal', icon: <X className="w-3.5 h-3.5" />, tone: 'text-zinc-700 bg-zinc-100 border-zinc-200' };
  return null;
};

/**
 * One day in the List view of Planning: tap it to add or change the meal.
 * The people button and the bin sit on the right.
 */
export function DayListRow({
  day,
  dayPlan,
  meal,
  cooksFor,
  onOpen,
  onPeople,
  onRemove,
}: {
  day: string;
  dayPlan?: DayPlan;
  meal: PlannedMeal | null;
  /** e.g. "Cook for 6: leftovers Tue, Thu" when later days eat leftovers of this cook. */
  cooksFor?: string | null;
  onOpen: () => void;
  onPeople: () => void;
  onRemove: () => void;
}) {
  const date = dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00') : null;
  const isToday = !!dayPlan?.date && dayPlan.date === todayISO();

  let label = meal ? typeLabel(meal) : null;
  let note = meal?.note || '';
  if (meal && label) {
    // "Leftovers from Mon" rather than a badge plus "Reheat from Monday" underneath.
    const from = isLeftoverMeal(meal) ? note.match(/^Reheat from (\w+)$/i) : null;
    if (from) { label = { ...label, text: `Leftovers from ${from[1].slice(0, 3)}` }; note = ''; }
    // A takeaway called "Takeaway" doesn't need saying twice.
    if (!isLeftoverMeal(meal) && cleanMealName(meal.name).toLowerCase().replace('takeout', 'takeaway') === label.text.toLowerCase()) label = null;
  }

  return (
    <div className="flex items-stretch rounded-xl border border-zinc-200 bg-white min-h-[68px]" data-list-day={day}>
      <div className={`w-14 shrink-0 flex flex-col items-center justify-center border-r ${isToday ? 'border-emerald-200 bg-emerald-50 rounded-l-xl' : 'border-zinc-100'}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-emerald-800' : 'text-zinc-600'}`}>{day.slice(0, 3)}</span>
        <span className={`text-lg font-bold leading-tight tabular-nums ${isToday ? 'text-emerald-900' : 'text-zinc-900'}`}>{date ? date.getDate() : ''}</span>
      </div>

      {meal ? (
        <>
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-zinc-50 transition-colors"
            aria-label={`${day}: ${cleanMealName(meal.name)}. Tap to change.`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-zinc-900 leading-snug line-clamp-2 break-words">{cleanMealName(meal.name)}</span>
              <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {label && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-md px-1.5 py-px ${label.tone}`}>
                    {label.icon}{label.text}
                  </span>
                )}
                {note && <span className="text-xs text-zinc-600 truncate max-w-[180px]">{note}</span>}
                {!note && cooksFor && <span className="text-xs text-zinc-600">{cooksFor}</span>}
                {meal.sides && meal.sides.length > 0 && (
                  <span className="text-xs text-zinc-600 truncate">+ {meal.sides.map((s) => s.name).join(', ')}</span>
                )}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-1 pr-1.5 shrink-0">
            {meal.type !== 'no_meal' && (
              <button
                type="button"
                onClick={onPeople}
                className="h-10 min-w-[44px] px-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                aria-label={`Cooking for ${meal.servings || 2}. Change people, sides or notes`}
                title="People, sides and notes"
              >
                <Users className="w-4 h-4 text-zinc-500" />
                <span className="tabular-nums">{meal.servings || 2}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="h-10 w-10 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
              aria-label={`Remove ${cleanMealName(meal.name)} from ${day}`}
              title="Remove meal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 m-1.5 rounded-lg border border-dashed border-zinc-300 text-zinc-600 hover:bg-zinc-50 flex items-center justify-between px-3 text-sm font-semibold cursor-pointer transition-colors"
          aria-label={`Add a meal on ${day}`}
        >
          <span className="inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />Add meal</span>
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        </button>
      )}
    </div>
  );
}
