import React from 'react';
import { ArrowRight, Check, Trash2, Clock, PartyPopper } from 'lucide-react';
import { AggregatedShoppingListItem } from '../../shopList';

export type DoneChoice = 'move' | 'keep' | 'remove' | 'finish';

/**
 * End of the shop: how it went, and what to do with anything you didn't get —
 * move it to next week's list, leave it on this list, or take it off.
 */
export default function DoneShoppingSheet({
  bought,
  total,
  notBought,
  took,
  nextWeekLabel,
  onChoose,
  onClose,
}: {
  bought: number;
  total: number;
  notBought: AggregatedShoppingListItem[];
  took: string | null;
  nextWeekLabel: string | null;
  onChoose: (choice: DoneChoice) => void;
  onClose: () => void;
}) {
  const names = notBought.map((i) => i.name);
  const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '');
  const allDone = notBought.length === 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Done shopping"
        data-done-sheet
      >
        <div className="px-5 pt-5 pb-4 text-center border-b border-zinc-100">
          <div className={`w-12 h-12 rounded-2xl mx-auto mb-2 flex items-center justify-center ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
            {allDone ? <PartyPopper className="w-6 h-6" /> : <Check className="w-6 h-6 stroke-[3]" />}
          </div>
          <h3 className="text-xl font-bold text-zinc-900" data-done-title>
            {allDone ? `All ${total} bought` : `${bought} of ${total} bought`}
          </h3>
          {took && (
            <p className="text-sm text-zinc-500 mt-0.5 inline-flex items-center gap-1" data-done-time>
              <Clock className="w-3.5 h-3.5" /> in {took}
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2">
          {allDone ? (
            <button
              type="button"
              onClick={() => onChoose('finish')}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              data-done="finish"
            >
              Finish
            </button>
          ) : (
            <>
              <p className="text-sm text-zinc-600 mb-2">
                <span className="font-semibold text-zinc-900">Didn't get:</span> {shown}
              </p>
              {nextWeekLabel && (
                <button
                  type="button"
                  onClick={() => onChoose('move')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-left cursor-pointer"
                  data-done="move"
                >
                  <ArrowRight className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>
                    <span className="block text-[15px] font-semibold text-emerald-950">Move to {nextWeekLabel}</span>
                    <span className="block text-xs text-emerald-900/80">Get them next time</span>
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onChoose('keep')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-left cursor-pointer"
                data-done="keep"
              >
                <Check className="w-5 h-5 text-zinc-600 shrink-0" />
                <span>
                  <span className="block text-[15px] font-semibold text-zinc-900">Leave them on this list</span>
                  <span className="block text-xs text-zinc-500">For another shop this week</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onChoose('remove')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-left cursor-pointer"
                data-done="remove"
              >
                <Trash2 className="w-5 h-5 text-zinc-600 shrink-0" />
                <span>
                  <span className="block text-[15px] font-semibold text-zinc-900">Take them off the list</span>
                  <span className="block text-xs text-zinc-500">You don't need them after all</span>
                </span>
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="w-full py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 cursor-pointer" data-done-cancel>
            Keep shopping
          </button>
        </div>
      </div>
    </div>
  );
}
