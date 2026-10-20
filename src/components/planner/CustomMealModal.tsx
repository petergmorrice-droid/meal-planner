/** Takeaway, eating out or no meal on a day, with a note (and how many people, for the first two). */
import { FileText, Minus, Plus, ShoppingBag, Utensils, X } from 'lucide-react';
import type  { QuickMeal } from './DayPickerModal';

export interface CustomMealDraft { dayName: string; type: QuickMeal; note: string; servings: number }

export default function CustomMealModal({ draft, onChange, onAdd, onClose }: {
  draft: CustomMealDraft;
  onChange: (draft: CustomMealDraft) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${
              draft.type === 'takeout' ? 'bg-orange-50 border-orange-100 text-orange-600' :
              draft.type === 'eating_out' ? 'bg-blue-50 border-blue-100 text-blue-600' :
              'bg-zinc-100 border-zinc-200 text-zinc-700'
            }`}>
              {draft.type === 'takeout' ? <ShoppingBag className="w-5 h-5 text-orange-600" /> :
               draft.type === 'eating_out' ? <Utensils className="w-5 h-5 text-blue-600" /> :
               <X className="w-5 h-5 text-zinc-600" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-900">
                {draft.type === 'takeout' ? 'Takeaway' : draft.type === 'eating_out' ? 'Eating out' : 'No meal'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {draft.dayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-900 mb-1">
              Note <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={draft.note}
              onChange={(e) => onChange({ ...draft, note: e.target.value })}
              placeholder={
                draft.type === 'takeout'
                  ? 'e.g. Pizza from Franco Manca, order by 6:30pm...'
                  : draft.type === 'eating_out'
                  ? 'e.g. Reservation at Dishoom, 7:30pm under Peter...'
                  : 'e.g. Late work meeting, dinner provided / visiting family...'
              }
              rows={3}
              className="w-full text-xs p-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors resize-none placeholder:text-zinc-400 text-zinc-800"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>This note will appear in the Cook tab.</span>
            </p>
          </div>

          {/* Number of people for takeout and eating out */}
          {draft.type !== 'no_meal' && (
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-900 block">People</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, servings: Math.max(1, draft.servings - 1) })}
                  disabled={draft.servings <= 1}
                  className="w-7 h-7 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 disabled:opacity-30 flex items-center justify-center transition-colors"
                  title="Decrease people"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-zinc-900 tabular-nums">
                  {draft.servings}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, servings: Math.min(24, draft.servings + 1) })}
                  disabled={draft.servings >= 24}
                  className="w-7 h-7 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 flex items-center justify-center transition-colors"
                  title="Increase people"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {draft.type === 'no_meal' && (
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-[11px] text-zinc-500 leading-relaxed">
              Marks this day as not needing a home-cooked meal. You can leave a reminder or note above for reference.
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="flex-1 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors text-center shadow-2xs cursor-pointer"
          >
            Add to the week
          </button>
        </div>
      </div>
    </div>
  );
}
