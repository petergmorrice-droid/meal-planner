/** The bar above the week: ‹ week › (with the list of weeks), and sending the week to the shopping list. */
import React from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, History, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { MealPlan } from '../../types';

/** The list of weeks (opens above the bar), with Copy a week, Plan the week after and Past weeks. */
export function WeekMenu({ plans, currentPlan, weekLabel, onPick, onClose, canCopy, onCopy, canPlanNext, maxWeeks, onPlanNext, onPastWeeks }: {
  plans: MealPlan[];
  currentPlan: MealPlan | undefined;
  weekLabel: (startDate: string) => string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** There are other weeks to copy from (and this week isn't sent yet). */
  canCopy: boolean;
  onCopy: () => void;
  canPlanNext: boolean;
  maxWeeks: number;
  onPlanNext: () => void;
  /** To Settings (left out when there's nowhere to go). */
  onPastWeeks?: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div className="absolute left-2 sm:left-4 bottom-full mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-zinc-200 p-2 z-50 animate-in fade-in slide-in-from-bottom-2">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Weeks
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1">
          {plans.map((plan: MealPlan) => {
            const isSelected = plan.id === currentPlan?.id;
            return (
              <button
                key={plan.id}
                onClick={() => onPick(plan.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-900 font-semibold'
                    : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="block font-medium">{weekLabel(plan.startDate)}</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {Object.values(plan.days).reduce((acc, d) => acc + d.meals.length, 0)} meals planned
                  </span>
                </div>
                {plan.status === 'finalized' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2 mt-1 border-t border-zinc-100 space-y-1">
          {canCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy meals from another week</span>
            </button>
          )}
          {canPlanNext ? (
            <button
              onClick={onPlanNext}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Plan the week after</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 text-[11px] text-zinc-400 italic text-center">
              Planning limit reached ({maxWeeks} weeks)
            </div>
          )}

          {onPastWeeks && (
            <button
              type="button"
              onClick={onPastWeeks}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 flex items-center justify-between transition-colors cursor-pointer bg-zinc-50 border border-zinc-100"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-zinc-500" />
                <span>Past weeks</span>
              </span>
              <span className="text-[11px] text-zinc-500 font-medium">in Settings →</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** ‹ week › on the left; Send to list / Update list / Sent on the right. */
export function WeekDockBar({
  title, menuOpen, onMenu, prevPlan, onPrev, canNext, onNext, status, changedDays, mealsPlanned, onUpdateList, onSent, onNoMeals, onSend,
}: {
  /** "This Week", "Next Week" or the dates. */
  title: string;
  menuOpen: boolean;
  onMenu: () => void;
  prevPlan: MealPlan | null;
  onPrev: () => void;
  /** There's a week after (or one can be made). */
  canNext: boolean;
  onNext: () => void;
  status?: MealPlan['status'];
  /** Days changed since the week was sent. */
  changedDays: string[];
  mealsPlanned: number;
  onUpdateList: () => void;
  onSent: () => void;
  onNoMeals: () => void;
  onSend: () => void;
}) {
  return (
    <div className="px-2 sm:px-4 py-1.5 border-b flex items-center justify-between gap-2 app-bar shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onPrev}
          disabled={!prevPlan}
          className="w-9 h-9 rounded-lg border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0"
          aria-label="Previous week"
          data-week-prev
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onMenu}
          className="h-9 flex items-center gap-1 px-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 transition-colors cursor-pointer shrink-0"
          aria-label="Choose a week"
          data-week-name
        >
          <span className="text-sm font-semibold text-zinc-900 whitespace-nowrap">
            {title}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="w-9 h-9 rounded-lg border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0"
          aria-label="Next week"
          data-week-next
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="shrink-0">
        {status === 'finalized' ? (
          changedDays.length > 0 ? (
            <button
              type="button"
              onClick={onUpdateList}
              className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-amber-950 rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title={`Changed since the list was made: ${changedDays.join(', ')}`}
              data-update-list
            >
              <RefreshCw className="w-4 h-4" />
              <span>Update list</span>
              <span className="text-xs font-semibold bg-amber-950/10 rounded px-1">{changedDays.length}<span className="hidden sm:inline"> {changedDays.length === 1 ? 'change' : 'changes'}</span></span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSent}
              className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Sent to the shopping list"
              data-sent
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Sent</span>
            </button>
          )
        ) : mealsPlanned === 0 ? (
          <button
            type="button"
            onClick={onNoMeals}
            className="h-9 px-3 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Plan at least one meal first"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Send to list</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            className="h-9 px-3 bg-white hover:bg-emerald-50 text-zinc-900 border border-emerald-400 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
            title="Check the week and send it to the shopping list"
            data-send-to-list
          >
            <ShoppingCart className="w-4 h-4 text-emerald-700" />
            <span className="sm:hidden">Send to list</span>
            <span className="hidden sm:inline">Send to shopping list</span>
          </button>
        )}
      </div>
    </div>
  );
}
