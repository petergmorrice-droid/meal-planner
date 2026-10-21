import { useState } from 'react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { AisleIcon } from '../AisleLook';
import { FoodAisle, GROCERY_AISLES, orderedAisles } from '../../utils';

/** Put the aisles in the order you walk your supermarket. Shared with the other phone. */
export function AisleOrderSheet({
  order,
  learnedFrom = 0,
  onSave,
  onClose,
}: {
  order?: string[];
  /** The order shown was learned from this many shops (0 = you arranged it, or the usual). */
  learnedFrom?: number;
  onSave: (order: string[] | null) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<FoodAisle[]>(() => orderedAisles(order));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    setList(next);
  };
  const usual = orderedAisles(null);
  const isUsual = list.every((id, i) => id === usual[i]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Arrange aisles"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Arrange aisles</h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              Put them in the order you walk round your usual shop. The list and shopping mode follow this order on both
              phones.
            </p>
            {learnedFrom > 0 && (
              <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5 mt-2" data-learned-note>
                This is the order you usually shop in, learned from {learnedFrom} {learnedFrom === 1 ? 'shop' : 'shops'}
                . Saving an order here uses yours instead.
              </p>
            )}
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
        <ol className="overflow-y-auto divide-y divide-zinc-100 px-2">
          {list.map((id, i) => {
            const info = GROCERY_AISLES[id];
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5" data-aisle={id}>
                <span className="w-6 text-sm font-semibold text-zinc-400 tabular-nums text-right">{i + 1}</span>
                <AisleIcon aisle={id} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{info.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{info.description}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="w-10 h-10 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label={`Move ${info.name} earlier`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    className="w-10 h-10 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label={`Move ${info.name} later`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setList(usual)}
            disabled={isUsual}
            className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            Usual order
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(isUsual ? null : list);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              Save order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
