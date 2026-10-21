import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PlannedMeal } from '../../types';
import { mealTitle } from '../planner/DayListRow';

/** Move a meal to another day, or swap it with that day's meal (leftovers follow their cook). */
export function MoveSheet({
  day,
  meal,
  days,
  onMove,
  onClose,
}: {
  day: string;
  meal: PlannedMeal;
  days: { day: string; label: string; meal: PlannedMeal | null }[];
  onMove: (to: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Move ${mealTitle(meal)}`}
        data-move-sheet={day}
        className="bg-white w-full sm:max-w-md max-h-[85dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-zinc-500 block">Move or swap · {day}</span>
            <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{mealTitle(meal)}</h3>
            <p className="text-sm text-zinc-600 mt-0.5">Pick a day. A day with a meal swaps with it.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          className="overflow-y-auto px-4 py-3 space-y-1.5"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {days
            .filter((x) => x.day !== day)
            .map((x) => (
              <button
                key={x.day}
                type="button"
                onClick={() => onMove(x.day)}
                data-move-sheet-to={x.day}
                className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 px-3 py-2.5 flex items-center gap-3 cursor-pointer"
              >
                <span className="w-14 text-sm font-bold text-zinc-700 shrink-0">{x.label}</span>
                <span className={`flex-1 min-w-0 text-[15px] truncate ${x.meal ? 'text-zinc-800' : 'text-zinc-400'}`}>
                  {x.meal ? mealTitle(x.meal) : 'Free'}
                </span>
                <span
                  className={`text-xs font-bold shrink-0 rounded-lg px-2 py-1 ${x.meal ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}
                >
                  {x.meal ? 'Swap' : 'Move here'}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
