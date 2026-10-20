import { useState } from 'react';
import { X, Repeat, Minus, Plus } from 'lucide-react';
import { canonicalUnit, formatUnit, formatAmount } from '../../shopping';
import type  { StapleSuggestion } from '../../shopList';

/** "Bin bags: add it every week?" — how much each week, then add it, or say it isn't a staple. */
export default function StapleSuggestSheet({ suggestion, step = 1, onAdd, onDecline, onClose }: {
  suggestion: StapleSuggestion;
  /** How much one more adds (1 pack, 500 g...). */
  step?: number;
  onAdd: (amount: number) => void;
  /** "Not a weekly staple": stop suggesting it. */
  onDecline: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(suggestion.amount || step || 1);
  const u = canonicalUnit(suggestion.unit);
  const unitText = u === 'each' ? '' : formatUnit(u, amount);
  const s = step > 0 ? step : 1;
  return (
    <div className="fixed inset-0 z-[60] bg-zinc-900/30 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Add ${suggestion.name} every week?`}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-200"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        data-staple-sheet={suggestion.name}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><Repeat className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-zinc-900 leading-snug">Add {suggestion.name} every week?</h3>
            <p className="text-sm text-zinc-600">You've added it yourself in {suggestion.weeks} of the last {suggestion.of} weeks. As a weekly staple it goes on every week's list by itself.</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shrink-0" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-zinc-50 border border-zinc-200 px-3 py-2" data-staple-amount>
          <span className="text-sm text-zinc-600 flex-1">Every week</span>
          <button type="button" onClick={() => setAmount((a) => Math.max(s, Math.round((a - s) * 100) / 100))} disabled={amount <= s} className="w-10 h-10 rounded-full border border-zinc-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="Less each week"><Minus className="w-4 h-4" /></button>
          <span className="min-w-[2rem] text-center text-base font-semibold tabular-nums" data-staple-amount-value>{formatAmount(amount)}</span>
          <button type="button" onClick={() => setAmount((a) => Math.round((a + s) * 100) / 100)} className="w-10 h-10 rounded-full border border-zinc-300 bg-white flex items-center justify-center cursor-pointer" aria-label="More each week"><Plus className="w-4 h-4" /></button>
          <span className="text-sm text-zinc-600 min-w-[3rem]">{unitText}</span>
        </div>
        <button type="button" onClick={() => onAdd(amount)} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer" data-staple-add>Add as a weekly staple</button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 cursor-pointer" data-staple-later>Not now</button>
          <button type="button" onClick={onDecline} className="flex-1 h-11 rounded-xl text-sm font-semibold text-zinc-500 cursor-pointer" data-staple-decline>Not a staple</button>
        </div>
      </div>
    </div>
  );
}
