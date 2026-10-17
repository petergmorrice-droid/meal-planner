import React, { useState } from 'react';
import { ArrowRight, Check, Trash2, Clock, PartyPopper, Trophy } from 'lucide-react';
import { AggregatedShoppingListItem } from '../../shopList';

export type DoneChoice = 'move' | 'keep' | 'remove' | 'finish';

const namesText = (rows: AggregatedShoppingListItem[], max = 6) => {
  const names = rows.map((i) => i.name);
  return names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
};

/**
 * End of the shop: how it went (time, personal best), and what to do with anything you didn't
 * get. Things not ticked: move to the following week's list, leave them, or take them off.
 * Out of stock: they stay on this list unless you say you want them next week too.
 */
export default function DoneShoppingSheet({
  bought,
  total,
  notBought,
  outOfStock = [],
  took,
  minutes = null,
  best = null,
  bigShop = false,
  nextWeekLabel,
  onChoose,
  onClose,
}: {
  bought: number;
  total: number;
  notBought: AggregatedShoppingListItem[];
  outOfStock?: AggregatedShoppingListItem[];
  took: string | null;
  minutes?: number | null;
  best?: number | null;
  /** Big enough to count for a personal best. */
  bigShop?: boolean;
  nextWeekLabel: string | null;
  onChoose: (choice: DoneChoice, outOfStockToNextWeek: boolean) => void;
  onClose: () => void;
}) {
  const [outToNext, setOutToNext] = useState(false);
  const allDone = notBought.length === 0;
  const newBest = bigShop && minutes !== null && (best === null || minutes < best);
  const choose = (c: DoneChoice) => onChoose(c, outToNext);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Done shopping"
        data-done-sheet
      >
        <div className="px-5 pt-5 pb-4 text-center border-b border-zinc-100">
          <div className={`w-12 h-12 rounded-2xl mx-auto mb-2 flex items-center justify-center ${allDone || newBest ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
            {newBest ? <Trophy className="w-6 h-6" /> : allDone ? <PartyPopper className="w-6 h-6" /> : <Check className="w-6 h-6 stroke-[3]" />}
          </div>
          <h3 className="text-xl font-bold text-zinc-900" data-done-title>
            {allDone ? `All ${total} bought` : `${bought} of ${total} bought`}
          </h3>
          {took && (
            <p className="text-sm text-zinc-500 mt-0.5 inline-flex items-center gap-1" data-done-time>
              <Clock className="w-3.5 h-3.5" /> in {took}
            </p>
          )}
          {newBest && (
            <p className="text-sm font-semibold text-emerald-700 mt-1" data-done-best>{best === null ? 'Your first timed shop: the time to beat!' : `A new personal best! (was ${best} min)`}</p>
          )}
          {!newBest && bigShop && best !== null && minutes !== null && (
            <p className="text-sm text-zinc-500 mt-1" data-done-best>Your best: {best} min</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2">
          {outOfStock.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-2" data-done-out>
              <p className="text-sm text-amber-950">
                <span className="font-semibold">Out of stock:</span> {namesText(outOfStock)}
              </p>
              {nextWeekLabel ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-amber-950 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={outToNext}
                    onChange={(e) => setOutToNext(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-emerald-600"
                    data-done-out-next
                  />
                  <span>Put them on {nextWeekLabel} too</span>
                </label>
              ) : null}
              {!outToNext && <p className="text-xs text-amber-900/80 mt-1">Otherwise they stay on this list, marked out of stock.</p>}
            </div>
          )}

          {allDone ? (
            <button
              type="button"
              onClick={() => choose('finish')}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              data-done="finish"
            >
              Finish
            </button>
          ) : (
            <>
              <p className="text-sm text-zinc-600 mb-2">
                <span className="font-semibold text-zinc-900">Didn't get:</span> {namesText(notBought)}
              </p>
              {nextWeekLabel && (
                <button
                  type="button"
                  onClick={() => choose('move')}
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
                onClick={() => choose('keep')}
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
                onClick={() => choose('remove')}
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
