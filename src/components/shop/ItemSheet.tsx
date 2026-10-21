import React, { useEffect, useState } from 'react';
import { Minus, Plus, X, Heart, Trash2, ArrowRight, StickyNote, RotateCcw, PackagePlus } from 'lucide-react';
import { ShoppingListItem } from '../../types';
import { AggregatedShoppingListItem, shopQuantityText, partLabel } from '../../shopList';
import { FoodAisle, GROCERY_AISLES, parseQtyAndUnit } from '../../utils';
import { largeUnitQuantity, formatAmount, unitInfo } from '../../shopping';
import { AisleIcon } from '../AisleLook';
import PersonMark from '../PersonMark';
import { noteAuthor } from '../../whoChanged';

/** "1 kg" rather than "1000 g" in the box; the line keeps its own unit. */
function boxText(part: ShoppingListItem): string {
  const big = largeUnitQuantity(part.amount, part.unit);
  if (big) return `${formatAmount(big.amount)} ${big.unit}`;
  return shopQuantityText(part);
}

/** −/+ and a box you can type "1.5 kg" into, for one line behind the row. */
function PartAmount({
  part,
  label,
  by,
  onStep,
  onSet,
}: {
  key?: React.Key;
  part: ShoppingListItem;
  label: string;
  /** Who added it or last changed it (lines added by hand): a blue / pink mark. */
  by?: string;
  onStep: (id: string, dir: 1 | -1) => void;
  onSet: (id: string, amount: number, unit: string) => void;
}) {
  const shown = boxText(part);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = () => {
    if (text.trim() === shown.trim() || !text.trim()) {
      setText(shown);
      return;
    }
    let { amount, unit } = parseQtyAndUnit(text, part.unit || 'item');
    // Typed "1.5 kg" for a line kept in grams: store 1500 g, so − / + still step in grams.
    const typed = unitInfo(unit);
    const own = unitInfo(part.unit);
    if (typed.dimension !== 'count' && typed.dimension === own.dimension && typed.unit !== own.unit) {
      amount = Math.round(((amount * typed.factor) / own.factor) * 100) / 100;
      unit = part.unit;
    }
    onSet(part.id, amount, unit);
  };

  return (
    <div className="flex items-center gap-3" data-part={part.id}>
      <span className="flex-1 min-w-0 text-sm text-zinc-600 leading-snug">
        {label}
        {by && <PersonMark who={by} what="Added or changed" className="ml-1.5 align-[1px]" />}
      </span>
      <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl shrink-0">
        <button
          type="button"
          onClick={() => onStep(part.id, -1)}
          className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-zinc-900 cursor-pointer"
          aria-label="Less"
          data-less
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-20 text-center text-sm font-semibold text-zinc-900 bg-transparent border-0 outline-none focus:bg-white rounded"
          aria-label="Amount"
          data-amount
        />
        <button
          type="button"
          onClick={() => onStep(part.id, 1)}
          className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-zinc-900 cursor-pointer"
          aria-label="More"
          data-more
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Added by hand (not for a meal, an extra recipe or a weekly staple). */
const isHandAdded = (p: ShoppingListItem) => p.isAdhoc && !p.isRecurring && !p.isBatch;
/** Meals first, then extra recipes, weekly staple, and what you added last. */
const partOrder = (p: ShoppingListItem) => (isHandAdded(p) ? 3 : p.isRecurring ? 2 : p.isBatch ? 1 : 0);

/** "Added by you: 0  +" when you haven't added any yourself, so you can always add one more on top. */
function AddExtra({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex items-center gap-3" data-part-extra>
      <span className="flex-1 min-w-0 text-sm text-zinc-600 leading-snug">Added by you</span>
      <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl shrink-0">
        <span className="w-10 h-10 flex items-center justify-center text-zinc-300" aria-hidden="true">
          <Minus className="w-4 h-4" />
        </span>
        <span className="w-20 text-center text-sm font-semibold text-zinc-400" data-amount>
          0
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-zinc-900 cursor-pointer"
          aria-label="Add one more yourself"
          data-more
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** One panel for a product on the list: amount, note, aisle, what it's for, favourite, move, remove. */
export default function ItemSheet({
  row,
  aisle,
  aisles,
  partDetail,
  isFavourite,
  nextWeekLabel,
  onStep,
  onSetAmount,
  onSaveNote,
  onRename,
  onAisle,
  onFavourite,
  onMove,
  onRemove,
  onManageStaples,
  onBackInStock,
  onSaveAsProduct,
  onAddExtra,
  onClose,
}: {
  row: AggregatedShoppingListItem;
  aisle: FoodAisle;
  aisles: FoodAisle[];
  /** "For Chilli con carne (Wed), Spaghetti bolognese (Thu)" for a meal line, else the usual label. */
  partDetail: (part: ShoppingListItem) => string;
  isFavourite: boolean;
  nextWeekLabel: string | null;
  onStep: (id: string, dir: 1 | -1) => void;
  onSetAmount: (id: string, amount: number, unit: string) => void;
  onSaveNote: (note: string) => void;
  onRename: (name: string) => void;
  onAisle: (aisle: FoodAisle) => void;
  onFavourite: () => void;
  onMove: () => void;
  onRemove: () => void;
  onManageStaples: () => void;
  /** Clear "out of stock". */
  onBackInStock?: () => void;
  /** Something added by hand that isn't a product yet: save it as one. */
  onSaveAsProduct?: () => void;
  /** Add one more yourself, on top of what the meals or staples need. */
  onAddExtra?: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(row.note || '');
  const [name, setName] = useState(row.name);
  // Only things you added by hand can be renamed: meal ingredients and staples are matched by name.
  const canRename = row.parts.every((p) => p.isAdhoc && !p.isRecurring);
  const hasStaple = row.parts.some((p) => p.isRecurring);

  const saveAndClose = () => {
    if ((note.trim() || '') !== (row.note || '')) onSaveNote(note.trim());
    if (canRename && name.trim() && name.trim() !== row.name) onRename(name.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={saveAndClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={row.name}
        data-item-sheet={row.name}
      >
        <div className="px-5 pt-4 pb-3 border-b border-zinc-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {canRename ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-lg font-semibold text-zinc-900 border-0 border-b border-transparent focus:border-zinc-300 outline-none p-0 bg-transparent"
                aria-label="Name"
                data-item-name
              />
            ) : (
              <h3 className="text-lg font-semibold text-zinc-900 truncate">{row.name}</h3>
            )}
            <p className="text-sm text-zinc-500 tabular-nums">
              {shopQuantityText(row)} on the list{row.checked ? ' · bought' : ''}
            </p>
            {row.neededText && (
              <p className="text-sm text-zinc-700 tabular-nums" data-item-sheet-need>
                Your meals use {row.neededText}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={saveAndClose}
            className="p-1.5 -mr-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {row.outOfStock && (
            <div
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
              data-item-out
            >
              <span className="flex-1 text-sm text-amber-950">Out of stock at the shop</span>
              {onBackInStock && (
                <button
                  type="button"
                  onClick={onBackInStock}
                  className="shrink-0 text-sm font-semibold text-amber-900 underline cursor-pointer"
                  data-back-in-stock
                >
                  Back on the list
                </button>
              )}
            </div>
          )}
          <section className="space-y-3">
            {[...row.parts]
              .sort((a, b) => partOrder(a) - partOrder(b))
              .map((part) => (
                <PartAmount
                  key={part.id}
                  part={part}
                  label={partDetail(part)}
                  by={isHandAdded(part) ? part.editedBy || part.addedBy : undefined}
                  onStep={onStep}
                  onSet={onSetAmount}
                />
              ))}
            {onAddExtra && !row.parts.some(isHandAdded) && <AddExtra onAdd={onAddExtra} />}
            {row.quantityNote && (
              <p className={`text-xs ${row.needsCheck ? 'text-rose-700' : 'text-zinc-500'}`}>{row.quantityNote}</p>
            )}
            {hasStaple && (
              <button
                type="button"
                onClick={onManageStaples}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                data-manage-staples
              >
                <RotateCcw className="w-3.5 h-3.5" /> Change weekly staples…
              </button>
            )}
          </section>

          {onSaveAsProduct && (
            <button
              type="button"
              onClick={onSaveAsProduct}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-left cursor-pointer"
              data-item-save-product
            >
              <PackagePlus className="w-5 h-5 shrink-0 text-emerald-700" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-emerald-950">Save as a product for next time</span>
                <span className="block text-xs text-emerald-900/80">So it goes straight into the right aisle</span>
              </span>
            </button>
          )}

          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 mb-1">
              <StickyNote className="w-3.5 h-3.5" /> Note
              {row.note && <PersonMark who={noteAuthor(row.parts)} what="Note written" />}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note.trim() !== (row.note || '')) onSaveNote(note.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              placeholder="e.g. semi-skimmed, big tub, if on offer"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
              data-item-note
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-zinc-600 mb-1 block">Aisle</span>
            <span className="flex items-center gap-2">
              <AisleIcon aisle={aisle} size="md" />
              <select
                value={aisle}
                onChange={(e) => onAisle(e.target.value as FoodAisle)}
                className="flex-1 min-w-0 rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px] bg-white cursor-pointer"
                data-item-aisle
              >
                {aisles.map((a) => (
                  <option key={a} value={a}>
                    {GROCERY_AISLES[a].name}
                  </option>
                ))}
              </select>
            </span>
            <span className="text-xs text-zinc-500 mt-1 block">Remembered for next time, on both phones.</span>
          </label>

          <button
            type="button"
            onClick={onFavourite}
            aria-pressed={isFavourite}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left cursor-pointer ${isFavourite ? 'border-rose-200 bg-rose-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}
            data-item-favourite
          >
            <Heart className={`w-5 h-5 shrink-0 ${isFavourite ? 'text-rose-500 fill-rose-500' : 'text-zinc-400'}`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-zinc-900">
                {isFavourite ? 'A favourite' : 'Make it a favourite'}
              </span>
              <span className="block text-xs text-zinc-500">Favourites come first when you add items</span>
            </span>
          </button>

          {nextWeekLabel && (
            <button
              type="button"
              onClick={onMove}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left cursor-pointer"
              data-move-item
            >
              <ArrowRight className="w-5 h-5 shrink-0 text-zinc-500" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900">Move to {nextWeekLabel}</span>
                <span className="block text-xs text-zinc-500">Off this list, onto the following week's</span>
              </span>
            </button>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 flex items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
            data-remove-item
          >
            <Trash2 className="w-4 h-4" /> Remove
          </button>
          <button
            type="button"
            onClick={saveAndClose}
            className="ml-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            data-item-done
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export { partLabel };
