/** The Shop list's sections: a group of rows (an aisle, A–Z…), out of stock, bought, already in the cupboard. */
import { ChevronDown } from 'lucide-react';
import { ShoppingListItem } from '../../types';
import { AggregatedShoppingListItem } from '../../shopList';
import { FoodAisle } from '../../utils';
import { AISLE_LOOK, AisleIcon } from '../AisleLook';
import ShopRow from './ShopRow';

/** A list group that is an aisle (not "Added by you", "A–Z"...). */
const isAisleId = (id: string): id is FoodAisle => Object.prototype.hasOwnProperty.call(AISLE_LOOK, id);

type RowActions = {
  onTick: (row: AggregatedShoppingListItem) => void;
  onOpen: (row: AggregatedShoppingListItem) => void;
  onInfo: (row: AggregatedShoppingListItem) => void;
};

/** One group of rows still to buy, with its heading (an aisle's colour and icon). */
export function RowGroup({
  group,
  justTicked,
  onChangeStaples,
  onTick,
  onOpen,
  onInfo,
}: RowActions & {
  group: { id: string; title: string; rows: AggregatedShoppingListItem[] };
  justTicked: Record<string, unknown>;
  onChangeStaples: () => void;
}) {
  return (
    <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden" data-group={group.id}>
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${isAisleId(group.id) ? AISLE_LOOK[group.id].header : 'bg-zinc-50/80 border-zinc-100'}`}
      >
        <h3
          className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isAisleId(group.id) ? AISLE_LOOK[group.id].title : 'text-zinc-600'}`}
        >
          {isAisleId(group.id) && <AisleIcon aisle={group.id} />}
          {group.title}
        </h3>
        <span className="flex items-center gap-2">
          {group.id === 'recurring' && (
            <button
              type="button"
              onClick={onChangeStaples}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              Change
            </button>
          )}
          <span className="text-xs text-zinc-500 tabular-nums">{group.rows.length}</span>
        </span>
      </div>
      <div className="divide-y divide-zinc-100">
        {group.rows.map((row) => (
          <ShopRow
            key={row.key}
            row={row}
            justTicked={!!justTicked[row.key]}
            onTick={onTick}
            onOpen={onOpen}
            onInfo={onInfo}
          />
        ))}
      </div>
    </section>
  );
}

/** Out of stock at the shop: not counted, tap the circle if you get it after all. */
export function OutOfStockSection({
  rows,
  onTick,
  onOpen,
  onInfo,
}: RowActions & { rows: AggregatedShoppingListItem[] }) {
  if (!rows.length) return null;
  return (
    <section className="bg-white rounded-xl border border-amber-200 overflow-hidden" data-group="out-of-stock">
      <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-amber-50 border-b border-amber-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Out of stock</h3>
        <span className="text-xs text-amber-800 tabular-nums">{rows.length}</span>
      </div>
      <div className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <ShopRow key={row.key} row={row} onTick={onTick} onOpen={onOpen} onInfo={onInfo} />
        ))}
      </div>
    </section>
  );
}

/** Bought: out of the way at the end, one tap to look. */
export function BoughtSection({
  rows,
  open,
  onToggle,
  justTicked,
  onTick,
  onOpen,
  onInfo,
}: RowActions & {
  rows: AggregatedShoppingListItem[];
  open: boolean;
  onToggle: () => void;
  justTicked: Record<string, unknown>;
}) {
  if (!rows.length) return null;
  return (
    <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden" data-bought>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50 text-left"
        aria-expanded={open}
        data-bought-toggle
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Bought</span>
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">{rows.length}</span>
      </button>
      {open && (
        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          {rows.map((row) => (
            <ShopRow
              key={row.key}
              row={row}
              justTicked={!!justTicked[row.key]}
              onTick={onTick}
              onOpen={onOpen}
              onInfo={onInfo}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Things you said you already have: off the list, one tap to put back. */
export function InCupboardSection({
  items,
  open,
  onToggle,
  onNeed,
}: {
  items: ShoppingListItem[];
  open: boolean;
  onToggle: () => void;
  onNeed: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-zinc-50 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Already in the cupboard</span>
        </span>
        <span className="text-xs text-zinc-500">{items.length} · not on the list</span>
      </button>
      {open && (
        <ul className="border-t border-zinc-100 divide-y divide-zinc-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
              <span className="text-sm text-zinc-600 min-w-0 truncate">{item.name}</span>
              <button
                type="button"
                onClick={() => onNeed(item.id)}
                className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded-lg hover:bg-emerald-50 cursor-pointer"
              >
                Need it after all
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
