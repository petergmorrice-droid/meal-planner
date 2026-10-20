/** The Shop's top bar: ‹ week › like Planning; share, list options and Go shopping on the right. */
import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Layers, ListOrdered, RotateCcw, Share2, ShoppingBag, ShoppingCart, Store, Trophy } from 'lucide-react';
import { MealPlan } from '../../types';
import { formatWeekSpan } from '../../shopList';
import type  { ShopViewMode } from './useShopLayout';

export default function ShopHeader({
  title, activePlan, sent, prevPlan, nextPlan, onSelectPlan, canShare, onShare, viewMode, onViewMode,
  onArrangeAisles, onStaples, onHistory, onGoShopping,
}: {
  /** "This week", "Next week", "w/c 3 Nov". */
  title: string;
  activePlan: MealPlan | null;
  /** The week's meals are on the list. */
  sent: boolean;
  prevPlan: MealPlan | null;
  nextPlan: MealPlan | null;
  onSelectPlan: (id: string) => void;
  canShare: boolean;
  onShare: () => void;
  viewMode: ShopViewMode;
  onViewMode: (mode: ShopViewMode) => void;
  onArrangeAisles: () => void;
  onStaples: () => void;
  onHistory: () => void;
  onGoShopping: () => void;
}) {
  const [showViewOptions, setShowViewOptions] = useState(false);
  return (
    <header className="app-bar border-b px-2 sm:px-5 py-1.5 shrink-0 relative z-40">
      <div className="max-w-[900px] mx-auto w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 min-w-0">
          <button
            type="button"
            onClick={() => prevPlan && onSelectPlan(prevPlan.id)}
            disabled={!prevPlan}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
            aria-label="Previous week"
            data-shop-week-prev
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 px-0.5 text-center" data-shop-week>
            <div className="text-[15px] font-bold text-zinc-900 whitespace-nowrap leading-tight" data-shop-week-name>{title}</div>
            {activePlan && (
              <div className="text-xs text-zinc-500 whitespace-nowrap leading-tight" data-shop-week-status>
                {formatWeekSpan(activePlan.startDate)} · {sent ? <span className="text-emerald-700 font-semibold">Sent</span> : 'Not sent yet'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => nextPlan && onSelectPlan(nextPlan.id)}
            disabled={!nextPlan}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-25 cursor-pointer disabled:cursor-default shrink-0"
            aria-label="Next week"
            data-shop-week-next
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onShare}
            disabled={!canShare}
            className="w-9 h-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
            aria-label="Share the list"
            title="Share or copy the list"
            data-share-list
          >
            <Share2 className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              id="btn-shop-view-options"
              onClick={() => setShowViewOptions(!showViewOptions)}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer ${
                showViewOptions ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600'
              }`}
              title="List options"
              aria-label="View options"
            >
              <Eye className="w-4 h-4" />
            </button>
            {showViewOptions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowViewOptions(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-zinc-200 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-2 pt-1 pb-1.5">Show the list</span>
                  {([
                    ['food_type', 'view-option-foodtype', 'By aisle', Store],
                    ['sections', 'view-option-sections', "By where it's from", Layers],
                    ['all', 'view-option-all', 'A–Z', ShoppingBag],
                  ] as const).map(([mode, id, label, Icon]) => (
                    <button
                      key={mode}
                      type="button"
                      id={id}
                      onClick={() => { onViewMode(mode); setShowViewOptions(false); }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-sm cursor-pointer ${viewMode === mode ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                    >
                      <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-zinc-500" />{label}</span>
                      {viewMode === mode && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                  ))}
                  <div className="border-t border-zinc-100 mt-1.5 pt-1.5">
                    <button
                      type="button"
                      id="btn-arrange-aisles"
                      onClick={() => { setShowViewOptions(false); onArrangeAisles(); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                    >
                      <ListOrdered className="w-4 h-4 text-zinc-500" /> Arrange aisles…
                    </button>
                    <button
                      type="button"
                      id="btn-weekly-staples"
                      onClick={() => { setShowViewOptions(false); onStaples(); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-zinc-500" /> Weekly staples…
                    </button>
                    <button
                      type="button"
                      id="btn-shop-history"
                      onClick={() => { setShowViewOptions(false); onHistory(); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-zinc-500" /> Past shops…
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            id="btn-go-shopping"
            onClick={onGoShopping}
            className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            title="Go shopping: full screen, tick as you go"
            aria-label="Go Shopping"
          >
            <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
            <span className="sm:hidden">Shop</span>
            <span className="hidden sm:inline">Go shopping</span>
          </button>
        </div>
      </div>
    </header>
  );
}
