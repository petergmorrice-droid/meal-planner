/** The two leftover questions: "How are you having it?" and "Remove Leftovers?". */
import type { HowPrompt, RemoveLeftoversPrompt } from './useWeekEditor';

/** Cooked earlier in the week or in the freezer: leftovers, from the freezer, or cook it fresh? */
export function HowAreYouHavingIt({
  prompt,
  defaultServings,
  onChoose,
  onCancel,
}: {
  prompt: HowPrompt;
  /** Your usual number of people (to say when the freezer has fewer portions). */
  defaultServings: number;
  onChoose: (how: 'leftover' | 'freezer' | 'fresh') => void;
  onCancel: () => void;
}) {
  const lastDay = prompt.existingDays[prompt.existingDays.length - 1];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div data-how-question>
          <h3 className="text-lg font-semibold text-zinc-900 leading-snug">{prompt.recipe.name}</h3>
          <p className="text-sm text-zinc-600 mt-1 mb-4">How are you having it on {prompt.dayName}?</p>
          <div className="space-y-2">
            {prompt.existingDays.length > 0 && (
              <button
                type="button"
                onClick={() => onChoose('leftover')}
                data-how="leftover"
                className="w-full text-left px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer"
              >
                <span className="block text-[15px] font-semibold text-amber-950">Leftovers from {lastDay}</span>
                <span className="block text-xs text-amber-900/80">Cook extra on {lastDay} and reheat it</span>
              </button>
            )}
            {prompt.freezer && (
              <button
                type="button"
                onClick={() => onChoose('freezer')}
                data-how="freezer"
                className="w-full text-left px-4 py-3 rounded-xl border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 cursor-pointer"
              >
                <span className="block text-[15px] font-semibold text-cyan-950">From the freezer</span>
                <span
                  className={`block text-xs ${prompt.freezer.portions < defaultServings ? 'text-amber-800 font-semibold' : 'text-cyan-900/80'}`}
                >
                  {prompt.freezer.portions} {prompt.freezer.portions === 1 ? 'portion' : 'portions'} in the freezer
                  {prompt.freezer.portions < defaultServings
                    ? ` (you usually cook for ${defaultServings})`
                    : '; nothing to buy'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onChoose('fresh')}
              data-how="fresh"
              className="w-full text-left px-4 py-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              <span className="block text-[15px] font-semibold text-zinc-900">Cook it fresh</span>
              <span className="block text-xs text-zinc-600">The ingredients go on the shopping list</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2 text-zinc-500 hover:text-zinc-700 text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Taking a meal away would leave its leftover days with nothing to reheat. */
export function RemoveLeftoversQuestion({
  prompt,
  onConfirm,
  onCancel,
}: {
  prompt: RemoveLeftoversPrompt;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150">
        <h3 className="text-lg font-semibold text-center text-zinc-900 mb-2">Remove Leftovers?</h3>
        <p className="text-xs text-zinc-500 text-center mb-6 leading-relaxed">
          If you {prompt.isReplacement ? 'replace' : 'remove'} {prompt.targetMealName}, you won't have any leftovers for{' '}
          <span className="font-semibold text-zinc-700">{prompt.leftoverDays.join(' and ')}</span>. The planned
          leftovers will also be removed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-zinc-700 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-white font-medium bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-2xs text-xs cursor-pointer"
          >
            Remove Leftovers
          </button>
        </div>
      </div>
    </div>
  );
}
