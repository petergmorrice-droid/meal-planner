import React from 'react';
import { Check, StickyNote } from 'lucide-react';
import { AggregatedShoppingListItem, shopQuantityText } from '../../shopList';

/**
 * One product on the Shop list: the circle ticks it; the rest of the row opens its panel
 * (amount, note, aisle, which meals it's for, favourite, move, remove).
 */
export default function ShopRow({
  row,
  onTick,
  onOpen,
}: {
  key?: React.Key;
  row: AggregatedShoppingListItem;
  onTick: (row: AggregatedShoppingListItem) => void;
  onOpen: (row: AggregatedShoppingListItem) => void;
}) {
  const sub = row.note || row.description || row.quantityNote;
  return (
    <div className={`flex items-stretch min-h-[56px] ${row.checked ? 'bg-zinc-50/60' : 'bg-white'}`} data-item={row.name}>
      <button
        type="button"
        onClick={() => onTick(row)}
        className="w-12 shrink-0 flex items-center justify-center cursor-pointer active:bg-zinc-50"
        aria-label={row.checked ? `Untick ${row.name}` : `Tick ${row.name}`}
        aria-pressed={row.checked}
        data-tick
      >
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            row.checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'
          }`}
        >
          {row.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="flex-1 min-w-0 flex items-center gap-3 py-2 pr-3.5 text-left cursor-pointer active:bg-zinc-50"
        aria-label={`${row.name}: ${shopQuantityText(row)}. Open`}
        data-open-item
      >
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[15px] font-semibold truncate ${row.checked ? 'line-through text-zinc-400 font-medium' : 'text-zinc-900'}`}>
              {row.name}
            </span>
            {row.checkCupboard && !row.checked && (
              <span className="shrink-0 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-px" title="Store-cupboard item: check you have it">
                check cupboard
              </span>
            )}
            {row.needsCheck && !row.checked && (
              <span className="shrink-0 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-px" title={row.quantityNote}>
                check amount
              </span>
            )}
          </span>
          {sub && (
            <span className={`flex items-center gap-1 text-xs truncate ${row.note ? 'text-amber-800' : 'text-zinc-500'}`} data-item-sub>
              {row.note && <StickyNote className="w-3 h-3 shrink-0" />}
              <span className="truncate">{sub}</span>
            </span>
          )}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${row.checked ? 'text-zinc-400' : 'text-zinc-700'}`} data-item-qty>
          {shopQuantityText(row)}
        </span>
      </button>
    </div>
  );
}
