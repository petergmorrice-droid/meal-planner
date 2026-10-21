import React from 'react';
import { Check, StickyNote, Info } from 'lucide-react';
import { AggregatedShoppingListItem, shopQuantityText } from '../../shopList';
import { handAddedBy, noteAuthor } from '../../whoChanged';
import PersonMark, { noteLook } from '../PersonMark';

/**
 * One product on the Shop list: the circle ticks it; the rest of the row opens its panel
 * (amount, note, aisle, which meals it's for, favourite, move, remove).
 */
export default function ShopRow({
  row,
  justTicked = false,
  onTick,
  onOpen,
  onInfo,
}: {
  key?: React.Key;
  row: AggregatedShoppingListItem;
  /** Ticked a moment ago: stays here, crossed out, with Undo, before moving to Bought. */
  justTicked?: boolean;
  onTick: (row: AggregatedShoppingListItem) => void;
  onOpen: (row: AggregatedShoppingListItem) => void;
  /** (i): which meals it's for, what was added and by whom. */
  onInfo?: (row: AggregatedShoppingListItem) => void;
}) {
  // Which meals it's for, and your note under it (the note never hides the meals).
  const meals = row.description || row.quantityNote;
  // Blue (Peter) / pink (Rachel): who last added or changed what was added by hand, and who wrote the note.
  const addedBy = handAddedBy(row.parts);
  const note = noteLook(noteAuthor(row.parts));
  return (
    <div
      className={`flex items-stretch min-h-[56px] ${justTicked ? 'bg-emerald-50/70' : row.checked ? 'bg-zinc-50/60' : 'bg-white'}`}
      data-item={row.name}
      data-just-ticked={justTicked || undefined}
    >
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
        className={`flex-1 min-w-0 flex items-center gap-3 py-2 text-left cursor-pointer active:bg-zinc-50 ${onInfo && !justTicked ? 'pr-1' : 'pr-3.5'}`}
        aria-label={`${row.name}: ${shopQuantityText(row)}. Open`}
        data-open-item
      >
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[15px] font-semibold truncate ${row.checked ? 'line-through text-zinc-400 font-medium' : 'text-zinc-900'}`}
            >
              {row.name}
            </span>
            {addedBy && <PersonMark who={addedBy} what="Added or changed" />}
            {row.checkCupboard && !row.checked && (
              <span
                className="shrink-0 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-px"
                title="Store-cupboard item: check you have it"
              >
                check cupboard
              </span>
            )}
            {row.outOfStock && (
              <span
                className="shrink-0 text-[11px] font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded px-1 py-px"
                data-out-of-stock
              >
                out of stock
              </span>
            )}
            {row.needsCheck && !row.checked && (
              <span
                className="shrink-0 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-px"
                title={row.quantityNote}
              >
                check amount
              </span>
            )}
          </span>
          {(meals || row.note) && (
            <span className="block min-w-0" data-item-sub>
              {meals && (
                <span className="block text-xs text-zinc-500 truncate" data-item-meals>
                  {meals}
                </span>
              )}
              {row.note && (
                <span className={`flex items-center gap-1 text-xs min-w-0 ${note.text}`} data-item-note-line>
                  <StickyNote className={`w-3 h-3 shrink-0 ${note.icon}`} />
                  <span className="truncate">{row.note}</span>
                </span>
              )}
            </span>
          )}
        </span>
        {!justTicked && (
          <span className="shrink-0 flex flex-col items-end leading-tight">
            <span
              className={`text-sm font-semibold tabular-nums ${row.checked ? 'text-zinc-400' : 'text-zinc-700'}`}
              data-item-qty
            >
              {shopQuantityText(row)}
            </span>
            {row.neededText && !row.checked && (
              <span className="text-[11px] text-zinc-500 tabular-nums" data-item-need title="What your meals use">
                need {row.neededText}
              </span>
            )}
          </span>
        )}
      </button>
      {onInfo && !justTicked && (
        <button
          type="button"
          onClick={() => onInfo(row)}
          className="w-11 shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-700 cursor-pointer active:bg-zinc-50"
          aria-label={`About ${row.name}: what it's for and who added it`}
          data-item-info
        >
          <Info className="w-[18px] h-[18px]" />
        </button>
      )}
      {justTicked && (
        <button
          type="button"
          onClick={() => onTick(row)}
          className="shrink-0 self-center mr-3 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-sm font-semibold cursor-pointer active:bg-emerald-50"
          aria-label={`Undo: ${row.name} not bought`}
          data-undo-tick
        >
          Undo
        </button>
      )}
    </div>
  );
}
