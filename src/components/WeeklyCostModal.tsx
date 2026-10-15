import React from 'react';
import { X, Coins, Sparkles, ShoppingBag, ArrowDownRight, Info, CheckCircle2, ChevronRight } from 'lucide-react';
import { MealPlan, Recipe } from '../types';
import { ensureRecipeBreakdowns } from '../utils/recipeBreakdowns';

interface WeeklyCostModalProps {
  plan: MealPlan;
  recipes: Recipe[];
  onClose: () => void;
  onOpenMealCost?: (recipe: Recipe, servings: number) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WeeklyCostModal({ plan, recipes, onClose, onOpenMealCost }: WeeklyCostModalProps) {
  const recipeMap = new Map(recipes.map(r => [r.id, ensureRecipeBreakdowns(r)]));

  // Compute daily and weekly costs
  let totalCost = 0;
  let groceryCost = 0;
  let diningCost = 0;
  let plannedCount = 0;
  let estimatedSavings = 0;

  const dailyBreakdown = DAYS_OF_WEEK.map(day => {
    const dayPlan = plan.days[day];
    const meal = dayPlan?.meals?.[0];
    let cost = 0;
    let label = 'Empty day';
    let type = 'empty';
    let recipeObj: Recipe | undefined;
    let servings = meal?.servings || 2;
    let isFree = false;

    if (meal) {
      plannedCount++;
      type = meal.type;
      label = meal.name;

      if (meal.type === 'recipe' && meal.recipeId) {
        recipeObj = recipeMap.get(meal.recipeId);
        const baseCost = recipeObj?.costEstimate ?? 6;
        const scale = servings / (recipeObj?.servings || 2);
        cost = Math.round(baseCost * scale);
        groceryCost += cost;
        totalCost += cost;
      } else if (meal.type === 'leftover') {
        if (meal.recipeId) {
          recipeObj = recipeMap.get(meal.recipeId);
        }
        // Leftovers represent previous cooking, 0 incremental new groceries
        cost = 0;
        isFree = true;
        estimatedSavings += 6 * (servings / 2);
      } else if (meal.type === 'batch') {
        cost = 0;
        isFree = true;
        estimatedSavings += 6 * (servings / 2);
      } else if (meal.type === 'takeout') {
        cost = servings * 11; // ~£11/person typical UK takeout
        diningCost += cost;
        totalCost += cost;
      } else if (meal.type === 'eating_out') {
        cost = servings * 18; // ~£18/person restaurant dinner
        diningCost += cost;
        totalCost += cost;
      } else if (meal.type === 'no_meal') {
        cost = 0;
        label = meal.note ? `No meal: ${meal.note}` : 'No meal planned';
      }
    }

    return {
      day,
      date: dayPlan?.date,
      meal,
      cost,
      label,
      type,
      servings,
      isFree,
      recipeObj
    };
  });

  const avgCostPerMeal = plannedCount > 0 ? (totalCost / plannedCount).toFixed(2) : '0.00';

  const formatWeekRange = (dateStr?: string) => {
    if (!dateStr) return 'This Week';
    const start = new Date(dateStr + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 leading-tight">
                Weekly Cost Breakdown
              </h3>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                {formatWeekRange(plan.startDate)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-0.5">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/80 block">
                Total Spend
              </span>
              <span className="text-xl font-bold text-zinc-900 mt-1 block tabular-nums">
                £{totalCost}
              </span>
              <span className="text-[10px] text-zinc-500">
                {plannedCount} meals planned
              </span>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Groceries
              </span>
              <span className="text-xl font-bold text-zinc-900 mt-1 block tabular-nums">
                £{groceryCost}
              </span>
              <span className="text-[10px] text-zinc-500">
                Home recipes
              </span>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Avg / Meal
              </span>
              <span className="text-xl font-bold text-zinc-900 mt-1 block tabular-nums">
                £{avgCostPerMeal}
              </span>
              <span className="text-[10px] text-zinc-500">
                Per planned day
              </span>
            </div>
          </div>

          {/* Leftover / Batch Savings Pill if any */}
          {estimatedSavings > 0 && (
            <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/70 text-xs text-emerald-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">
                  Smart savings from leftovers & freezer batches
                </span>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md tabular-nums">
                ~£{Math.round(estimatedSavings)} saved
              </span>
            </div>
          )}

          {/* Day-by-Day Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-900">
                Day-by-Day Allocation
              </span>
              <span className="text-[10px] text-zinc-400">
                Tap a home recipe to view ingredients
              </span>
            </div>

            <div className="space-y-1.5">
              {dailyBreakdown.map((item, idx) => {
                const isInteractive = Boolean(item.recipeObj && onOpenMealCost);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (isInteractive && item.recipeObj) {
                        onOpenMealCost!(item.recipeObj, item.servings);
                      }
                    }}
                    className={`p-2.5 rounded-xl border border-zinc-150 flex items-center justify-between transition-colors ${
                      isInteractive
                        ? 'bg-white hover:bg-amber-50/40 hover:border-amber-200/80 cursor-pointer'
                        : 'bg-zinc-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-8 text-center shrink-0">
                        <span className="text-[11px] font-bold text-zinc-800 block leading-tight">
                          {item.day.slice(0, 3)}
                        </span>
                        <span className="text-[9px] text-zinc-400">
                          {item.date
                            ? new Date(item.date + 'T00:00:00').getDate()
                            : ''}
                        </span>
                      </div>

                      <div className="w-px h-6 bg-zinc-200 shrink-0" />

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-zinc-900 truncate">
                            {item.meal ? item.label : 'No meal planned'}
                          </span>
                          {item.meal && item.meal.type !== 'no_meal' && (
                            <span className="text-[10px] text-zinc-500 font-normal shrink-0">
                              ({item.servings}p)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5">
                          {item.type === 'recipe' && <span className="text-amber-700 font-medium">Home Cooked</span>}
                          {item.type === 'leftover' && <span className="text-emerald-600 font-medium">Leftovers (Zero Spend)</span>}
                          {item.type === 'batch' && <span className="text-cyan-600 font-medium">Freezer Batch (Zero Spend)</span>}
                          {item.type === 'takeout' && <span className="text-orange-600 font-medium">Takeout</span>}
                          {item.type === 'eating_out' && <span className="text-indigo-600 font-medium">Dining Out</span>}
                          {item.type === 'empty' && <span>Rest / Open</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            item.isFree
                              ? 'text-emerald-600 font-semibold'
                              : item.cost > 0
                              ? 'text-zinc-900'
                              : 'text-zinc-400'
                          }`}
                        >
                          {item.isFree ? '£0' : item.cost > 0 ? `£${item.cost}` : '—'}
                        </span>
                      </div>
                      {isInteractive && (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-600" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supermarket Optimization Insight */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-600 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-zinc-800">
                Estimated Grocery Budget: £{groceryCost}
              </p>
              <p className="text-zinc-500 mt-0.5">
                Ingredients are automatically consolidated in your Shopping List tab to minimize food waste across recipes.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center shadow-2xs"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
}
