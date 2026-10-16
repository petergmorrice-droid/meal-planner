import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ShoppingListItem } from '../types';

interface ShopAisleGroupProps {
  key?: React.Key;
  aisle: string;
  info: { name: string; colorClass: string; order: number };
  items: any[];
  renderItem: (item: any) => React.ReactNode;
  /** One-line rows separated by dividers instead of spaced cards. */
  compact?: boolean;
}

export default function ShopAisleGroup({ aisle, info, items, renderItem, compact = false }: ShopAisleGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const itemsLeft = items.filter(i => !i.checked).length;

  if (compact) {
    // Slim one-line header that stays in view while you scroll its aisle.
    return (
      <section className="bg-white rounded-xl border border-zinc-200/70 overflow-clip">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sticky top-0 z-10 w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50/95 backdrop-blur-sm border-b border-zinc-200/70 text-left cursor-pointer"
          aria-expanded={!isCollapsed}
          data-aisle-header={info.name}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 truncate">{info.name}</span>
          </span>
          <span className="text-xs font-semibold text-zinc-500 tabular-nums shrink-0">{itemsLeft} left</span>
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
