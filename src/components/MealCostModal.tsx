import React from 'react';
import { X, Coins, Info, DollarSign } from 'lucide-react';
import { Recipe } from '../types';
import { ensureRecipeBreakdowns } from '../utils/recipeBreakdowns';

interface MealCostModalProps {
  recipe: Recipe;
  servings?: number;
  onClose: () => void;
}

export function MealCostModal({ recipe, servings, onClose }: MealCostModalProps) {
  const readyRecipe = ensureRecipeBreakdowns(recipe);
  const baseServings = readyRecipe.servings || 2;
  const currentServings = servings || baseServings;
  const scale = currentServings / baseServings;

  const costData = readyRecipe.costBreakdown;
  const baseTotal = costData?.totalCost ?? readyRecipe.costEstimate ?? 6;
  const scaledTotal = Number((baseTotal * scale).toFixed(2));
  const costPerServing = Number((scaledTotal / currentServings).toFixed(2));

  const items = costData?.items || [];
  const maxItemCost = items.length > 0 ? Math.max(...items.map(i => i.cost)) : 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
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
                Cost Breakdown
              </h3>
              <p className="text-xs text-zinc-500 font-medium truncate max-w-[240px] sm:max-w-[280px] mt-0.5">
                {readyRecipe.name}
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
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/50">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/80 block">
                Total Estimated Cost
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-zinc-900 tabular-nums">
                  £{scaledTotal.toFixed(2)}
                </span>
                <span className="text-xs text-zinc-500">
                  for {currentServings} {currentServings === 1 ? 'person' : 'people'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Cost Per Serving
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-zinc-900 tabular-nums">
                  £{costPerServing.toFixed(2)}
                </span>
                <span className="text-xs text-zinc-500">/ portion</span>
              </div>
            </div>
          </div>

          {/* Scale notice if servings are modified */}
          {scale !== 1 && (
            <div className="text-[11px] text-zinc-500 bg-zinc-100/70 px-3 py-1.5 rounded-lg flex items-center justify-between">
              <span>Scaled from standard 2 adult portion</span>
              <span className="font-semibold text-zinc-700">{currentServings} servings ({scale}x)</span>
            </div>
          )}

          {/* Ingredient Itemization */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-900">
                Ingredient Price Estimates
              </span>
              <span className="text-[10px] text-zinc-400">
                UK Supermarket avg
              </span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const itemScaledCost = Number((item.cost * scale).toFixed(2));
                const percentage = baseTotal > 0 ? Math.min(100, Math.round((item.cost / baseTotal) * 100)) : 0;

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-zinc-150 bg-white hover:bg-zinc-50/70 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="min-w-0 pr-2">
                        <span className="font-medium text-zinc-800 block truncate">
                          {item.ingredient}
                        </span>
                        {item.notes && (
                          <span className="text-[10px] text-zinc-400 block truncate">
                            {item.notes}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-zinc-900 tabular-nums">
                          £{itemScaledCost.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-zinc-400 block tabular-nums">
                          {percentage}% of cost
                        </span>
                      </div>
                    </div>

                    {/* Cost Progress Bar */}
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(5, (item.cost / maxItemCost) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Note Banner */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-600 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-zinc-800">
                {costData?.notes || 'Estimated based on average UK major supermarket shelf prices.'}
              </p>
              <p className="text-zinc-500 mt-0.5">
                Standard pantry staples (cooking oil, salt, black pepper, water) are factored as household staples.
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
