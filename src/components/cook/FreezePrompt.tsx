import React, { useState } from 'react';
import { Snowflake, Minus, Plus } from 'lucide-react';

/** "Put 4 portions of chilli in the freezer?" after ticking a batch cook. */
export function FreezePrompt({
  name,
  portions,
  onChoose,
}: {
  key?: React.Key;
  name: string;
  portions: number;
  onChoose: (portions: number) => void;
}) {
  const [n, setN] = useState(portions);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => onChoose(0)}
    >
      <div
        role="dialog"
        aria-label="Add to the freezer"
        data-freeze-prompt
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          <Snowflake className="w-5 h-5 text-cyan-700" />
          <h3 className="text-lg font-bold text-zinc-900">Into the freezer?</h3>
        </div>
        <p className="text-[15px] text-zinc-700 mt-1">
          The plan says to freeze some {name}. How many portions went in?
        </p>
        <div className="flex items-center justify-center gap-4 my-4">
          <button
            type="button"
            onClick={() => setN((x) => Math.max(1, x - 1))}
            disabled={n <= 1}
            className="w-12 h-12 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer"
            aria-label="One fewer"
          >
            <Minus className="w-5 h-5" />
          </button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums" data-freeze-prompt-count>
            {n}
          </span>
          <button
            type="button"
            onClick={() => setN((x) => Math.min(24, x + 1))}
            className="w-12 h-12 rounded-xl border border-zinc-300 flex items-center justify-center cursor-pointer"
            aria-label="One more"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onChoose(n)}
          className="w-full h-12 rounded-xl bg-cyan-700 text-white font-semibold cursor-pointer"
          data-freeze-prompt-add
        >
          Add {n} {n === 1 ? 'portion' : 'portions'} to the freezer
        </button>
        <button
          type="button"
          onClick={() => onChoose(0)}
          className="w-full h-11 mt-1 text-sm font-semibold text-zinc-600 cursor-pointer"
          data-freeze-prompt-skip
        >
          Not this time
        </button>
      </div>
    </div>
  );
}
