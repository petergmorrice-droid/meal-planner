import React from 'react';
import { X, Trophy, Clock } from 'lucide-react';
import { ShopRecord } from '../../types';
import { shopStats, BIG_SHOP } from '../../shopList';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const who = (id?: string) => (id === 'R' ? 'Rachel' : id === 'P' ? 'Peter' : '');

/** Your last shops: when, how many items, how long; your best and average time. */
export default function ShopHistorySheet({ history, onClose }: { history: ShopRecord[]; onClose: () => void }) {
  const stats = shopStats(history);
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Past shops"
        data-history-sheet
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Past shops</h3>
            {stats.timed > 0 ? (
              <p className="text-sm text-zinc-600 mt-0.5 flex items-center gap-3" data-history-stats>
                <span className="inline-flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-500" /> Best {stats.best} min</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4 text-zinc-400" /> Average {stats.average} min</span>
              </p>
            ) : (
              <p className="text-sm text-zinc-500 mt-0.5">Shops of {BIG_SHOP}+ items that you time (Go shopping → Done shopping) give you a best and an average.</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500 text-center">No shops yet. Finish one with <strong>Done shopping</strong> and it appears here.</p>
        ) : (
          <ul className="overflow-y-auto divide-y divide-zinc-100" data-history-list>
            {history.map((r) => {
              const isBest = stats.best !== null && r.minutes === stats.best && r.bought >= BIG_SHOP;
              return (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3" data-history-row>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">{when(r.date)}{who(r.by) ? ` · ${who(r.by)}` : ''}</p>
                    <p className="text-xs text-zinc-500">{r.bought} of {r.total} items</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${isBest ? 'text-amber-600' : 'text-zinc-700'}`}>
                    {isBest && <Trophy className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}
                    {r.minutes !== null ? `${r.minutes} min` : '–'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
