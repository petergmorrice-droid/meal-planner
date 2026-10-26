/** One row in shopping mode: tap to tick, press and hold for out of stock, (i) for what it's for. */
import React, { useRef, useEffect } from 'react';
import { Check, Info, StickyNote } from 'lucide-react';
import { AggregatedShoppingListItem, shopQuantityText } from '../../shopList';
import PersonMark, { noteLook, personLook } from '../PersonMark';
import { handAddedBy, noteAuthor } from '../../whoChanged';

interface ShoppingModeItemRowProps {
  key?: React.Key;
  item: AggregatedShoppingListItem;
  onToggle: (id: string) => void;
  /** Ticked a moment ago: still in place, crossed out, with Undo. */
  justTicked?: boolean;
  /** Press and hold: out of stock. */
  onHold?: (id: string) => void;
  /** Ticked on the other phone (their name). */
  tickedBy?: string;
  compact?: boolean;
  /** (i): what it's for, what was added and by whom. */
  onInfo?: (item: AggregatedShoppingListItem) => void;
}

/** The (i) on a shopping-mode row: doesn't tick it or start a press-and-hold. */
function InfoButton({
  item,
  onInfo,
}: {
  item: AggregatedShoppingListItem;
  onInfo: (item: AggregatedShoppingListItem) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onInfo(item);
      }}
      className="w-9 h-9 -mr-1 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 active:bg-zinc-100 cursor-pointer"
      aria-label={`About ${item.name}: what it's for and who added it`}
      data-item-info
    >
      <Info className="w-[18px] h-[18px]" />
    </button>
  );
}

/** Press and hold (about half a second) without moving: a long-press that works on any phone. */
function usePressHold(onHold: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => {
          held.current = true;
          onHold();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** True (once) if the press that just ended was a hold, so the tap that follows is ignored. */
    wasHeld: () => {
      const h = held.current;
      held.current = false;
      return h;
    },
  };
}

/** "Out of stock" label on a row. */
const OutOfStockPill = () => (
  <span
    className="shrink-0 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-2 py-1"
    data-out-of-stock
  >
    Out of stock
  </span>
);

/** The Undo pill on a row that was just ticked. */
function UndoTick({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onUndo();
      }}
      className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-sm font-semibold cursor-pointer active:bg-emerald-50"
      aria-label={`Undo: ${name} not bought`}
      data-undo-tick
    >
      Undo
    </button>
  );
}

/**
 * The item's note ("size: regular", "semi-skimmed"), in a coloured box on its own line, in full,
 * so it's hard to miss in the shop. The colour is whoever wrote it (blue Peter, pink Rachel).
 */
function RowNote({
  note,
  look,
  faded,
  big = false,
}: {
  note: string;
  look: ReturnType<typeof noteLook>;
  faded: boolean;
  big?: boolean;
}) {
  return (
    <p
      className={`mt-1 inline-flex items-start gap-1.5 max-w-full rounded-lg border px-2 py-1 font-semibold break-words ${big ? 'text-[15px]' : 'text-sm'} ${faded ? 'bg-zinc-50 border-zinc-200 text-zinc-400' : `${look.box} ${look.text}`}`}
      data-row-note
    >
      <StickyNote
        className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} shrink-0 mt-0.5 ${faded ? 'text-zinc-400' : look.icon}`}
      />
      <span className="min-w-0">{note}</span>
    </p>
  );
}

export function ShoppingModeItemRow({
  item,
  onToggle,
  justTicked = false,
  onHold,
  tickedBy,
  compact = false,
  onInfo,
}: ShoppingModeItemRowProps) {
  // Blue (Peter) / pink (Rachel): who added or changed it by hand, who wrote the note, who ticked it.
  const addedBy = handAddedBy(item.parts || []);
  const note = noteLook(noteAuthor(item.parts || []));
  const tickerLook = personLook(item.checkedBy);
  const press = usePressHold(() => onHold?.(item.id));
  const tap = () => {
    if (!press.wasHeld()) onToggle(item.id);
  };
  const out = !!item.outOfStock;
  const noCallout = { WebkitTouchCallout: 'none' } as React.CSSProperties;
  if (compact) {
    // One line: tick, name, amount. Big enough to tap with a basket in the other hand.
    return (
      <div
        onClick={tap}
        {...press.handlers}
        style={noCallout}
        className={`flex items-center gap-3 px-1.5 min-h-[48px] py-1.5 cursor-pointer select-none transition-colors ${justTicked ? 'bg-emerald-50/70' : out ? 'bg-amber-50/60' : item.checked ? 'opacity-50' : 'active:bg-zinc-50'}`}
        data-row="compact"
        data-just-ticked={justTicked || undefined}
        data-row-out={out || undefined}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            item.checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'
          }`}
          aria-label={item.checked ? `Mark ${item.name} as unbought` : `Mark ${item.name} as bought`}
        >
          {item.checked && <Check className="w-4 h-4 stroke-[3]" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-base font-semibold truncate ${item.checked ? 'line-through text-zinc-400 font-medium' : out ? 'text-zinc-500' : 'text-zinc-900'}`}
            >
              {item.name}
            </span>
            {item.checkCupboard && !item.checked && (
              <span
                className="shrink-0 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-px"
                title="Store-cupboard item: check you have it"
              >
                cupboard
              </span>
            )}
            {item.needsCheck && !item.checked && (
              <span
                className="shrink-0 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-px"
                title={item.quantityNote}
              >
                check
              </span>
            )}
            {addedBy && !item.checked && <PersonMark who={addedBy} what="Added or changed" />}
            {tickedBy && !justTicked && (
              <span
                className={`shrink-0 text-xs font-semibold px-1.5 py-px rounded-full ring-1 ring-inset ${tickerLook ? tickerLook.mark : 'text-emerald-700 ring-emerald-200'}`}
                data-ticked-by
              >
                ✓ {tickedBy}
              </span>
            )}
          </div>
          {item.note && <RowNote note={item.note} look={note} faded={item.checked} />}
        </div>
        {justTicked ? (
          <UndoTick name={item.name} onUndo={() => onToggle(item.id)} />
        ) : out ? (
          <OutOfStockPill />
        ) : (
          <span className="shrink-0 flex flex-col items-end leading-tight">
            <span className={`text-base font-bold tabular-nums ${item.checked ? 'text-zinc-400' : 'text-emerald-700'}`}>
              {shopQuantityText(item)}
            </span>
            {item.neededText && !item.checked && (
              <span className="text-[11px] text-zinc-500 tabular-nums" data-row-need>
                need {item.neededText}
              </span>
            )}
          </span>
        )}
        {onInfo && !justTicked && <InfoButton item={item} onInfo={onInfo} />}
      </div>
    );
  }

  return (
    <div
      onClick={tap}
      {...press.handlers}
      style={noCallout}
      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] select-none ${
        justTicked
          ? 'bg-emerald-50/70 border-emerald-200'
          : out
            ? 'bg-amber-50/60 border-amber-200'
            : item.checked
              ? 'bg-zinc-100/60 border-zinc-200/70 opacity-55'
              : 'bg-white border-zinc-200/90 shadow-2xs hover:border-zinc-300'
      }`}
      data-row="detailed"
      data-just-ticked={justTicked || undefined}
    >
      {/* Left: Item name & Quantity with for meal in small print */}
      <div className="flex-1 min-w-0 pr-2">
        {/* Large item name */}
        <p
          className={`text-base sm:text-lg font-bold text-zinc-900 leading-snug tracking-tight flex items-center gap-1.5 ${
            item.checked ? 'line-through text-zinc-400 font-medium' : ''
          }`}
        >
          <span className="min-w-0">{item.name}</span>
          {addedBy && !item.checked && <PersonMark who={addedBy} what="Added or changed" />}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Large Quantity */}
          <span
            className={`text-sm sm:text-base font-bold tabular-nums ${
              item.checked ? 'text-zinc-400' : 'text-emerald-700'
            }`}
          >
            {shopQuantityText(item)}
          </span>
          {item.neededText && !item.checked && (
            <span className="text-xs text-zinc-600 tabular-nums" data-row-need>
              (meals use {item.neededText})
            </span>
          )}

          {/* for meal in small print */}
          {item.description && (
            <span className="text-xs text-zinc-400 font-normal truncate max-w-[280px]" title={item.description}>
              {item.description}
            </span>
          )}

          {item.checkCupboard && !item.checked && (
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
              check cupboard
            </span>
          )}
          {item.needsCheck && !item.checked && (
            <span
              className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5"
              title={item.quantityNote}
            >
              check amount
            </span>
          )}
        </div>
        {item.note && <RowNote note={item.note} look={note} faded={item.checked} big />}
        {item.quantityNote && !item.checked && (
          <p className={`text-xs mt-1 ${item.needsCheck ? 'text-rose-600' : 'text-zinc-500'}`}>{item.quantityNote}</p>
        )}
      </div>

      {tickedBy && !justTicked && (
        <span
          className={`shrink-0 text-xs font-semibold px-1.5 py-px rounded-full ring-1 ring-inset ${tickerLook ? tickerLook.mark : 'text-emerald-700 ring-emerald-200'}`}
          data-ticked-by
        >
          ✓ {tickedBy}
        </span>
      )}
      {out && !justTicked && <OutOfStockPill />}
      {justTicked && <UndoTick name={item.name} onUndo={() => onToggle(item.id)} />}
      {onInfo && !justTicked && <InfoButton item={item} onInfo={onInfo} />}
      {/* Right: Large Tick Box */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.id);
        }}
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs ${
          item.checked
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-zinc-300 hover:border-emerald-500 bg-white'
        }`}
        aria-label={item.checked ? `Mark ${item.name} as unbought` : `Mark ${item.name} as bought`}
      >
        {item.checked && <Check className="w-5 h-5 stroke-[3]" />}
      </button>
    </div>
  );
}
