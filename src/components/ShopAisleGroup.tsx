import React, { useEffect, useState } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { AISLE_LOOK, AisleIcon } from './AisleLook';
import type  { FoodAisle } from '../utils';

/** What a row needs for the aisle's "left" count. */
type Countable = { checked?: boolean; outOfStock?: boolean };

interface ShopAisleGroupProps<T extends Countable> {
  key?: React.Key;
  aisle: string;
  info: { name: string; colorClass: string; order: number };
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  /** One-line rows separated by dividers instead of spaced cards. */
  compact?: boolean;
  /** Everything here is ticked (or out of stock): fold the aisle away. */
  allDone?: boolean;
}

export default function ShopAisleGroup<T extends Countable>({ aisle, info, items, renderItem, compact = false, allDone = false }: ShopAisleGroupProps<T>) {
  // Folded when finished, unless you open it again; your own choice wins until it's finished.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  useEffect(() => { if (allDone) setUserOpen(null); }, [allDone]);
  const isCollapsed = userOpen === null ? allDone : !userOpen;
  const setIsCollapsed = (collapsed: boolean) => setUserOpen(!collapsed);
  const itemsLeft = items.filter(i => !i.checked && !i.outOfStock).length;
  const look = AISLE_LOOK[aisle as FoodAisle];

  if (compact) {
    // Slim one-line header that stays in view while you scroll its aisle.
    return (
      <section className={`rounded-xl border overflow-clip ${allDone ? 'bg-emerald-50/60 border-emerald-200/70' : 'bg-white border-zinc-200/70'}`} data-aisle={aisle} data-aisle-done={allDone || undefined}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`sticky top-0 z-10 w-full flex items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer ${allDone ? 'bg-emerald-50' : look ? look.header : 'bg-zinc-50'} ${isCollapsed ? '' : 'border-b'}`}
          aria-expanded={!isCollapsed}
          data-aisle-header={info.name}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
            {look && <AisleIcon aisle={aisle as FoodAisle} />}
            <span className={`text-xs font-bold uppercase tracking-wider truncate ${allDone ? 'text-emerald-800' : look ? look.title : 'text-zinc-700'}`}>{info.name}</span>
          </span>
          {allDone ? (
            <span className="text-xs font-semibold text-emerald-700 shrink-0 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> done · {items.length}</span>
          ) : (
            <span className="text-xs font-semibold text-zinc-500 tabular-nums shrink-0">{itemsLeft} left</span>
          )}
        </button>
        {!isCollapsed && (
          <div className="divide-y divide-zinc-100 px-2">
            {items.map(renderItem)}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-2 border border-zinc-100 rounded-2xl bg-white p-3 shadow-3xs overflow-hidden relative">
      <div className="sticky top-0 z-10 backdrop-blur-md bg-white/80 -mx-3 -mt-3 px-3 py-2 border-b border-zinc-100/50">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between hover:bg-zinc-50/50 p-1.5 rounded-xl transition-all cursor-pointer text-left select-none"
          data-aisle-header={info.name}
        >
          <div className="flex items-center gap-2">
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
            {look && <AisleIcon aisle={aisle as FoodAisle} />}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${info.colorClass}`}>
              {info.name}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-bold bg-zinc-100 px-2.5 py-0.5 rounded-full">
            {itemsLeft} left
          </span>
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-1.5 pt-1">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}
