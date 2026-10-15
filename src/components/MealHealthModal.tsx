import React from 'react';
import { X, Heart, CheckCircle2, AlertCircle, Info, Sparkles, Flame, Apple } from 'lucide-react';
import { Recipe } from '../types';
import { ensureRecipeBreakdowns } from '../utils/recipeBreakdowns';

interface MealHealthModalProps {
  recipe: Recipe;
  onClose: () => void;
}

export function MealHealthModal({ recipe, onClose }: MealHealthModalProps) {
  const readyRecipe = ensureRecipeBreakdowns(recipe);
  const healthData = readyRecipe.healthBreakdown;
  const score = healthData?.score ?? readyRecipe.healthScore ?? 7;
  const macros = healthData?.macros;
  const points = healthData?.points || [];

  const getScoreBadge = (val: number) => {
    if (val >= 8) {
      return {
        label: 'Exceptional Balance',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200/80',
        bar: 'bg-emerald-500'
      };
    }
    if (val >= 6) {
      return {
        label: 'Wholesome & Nourishing',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200/80',
        bar: 'bg-amber-500'
      };
    }
    return {
      label: 'Hearty Comfort',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200/80',
      bar: 'bg-rose-500'
    };
  };

  const badgeInfo = getScoreBadge(score);

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
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Heart className="w-5 h-5 fill-rose-500/20" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 leading-tight">
                Health Breakdown
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
          {/* Score Header Card */}
          <div className={`p-4 rounded-xl border ${badgeInfo.border} ${badgeInfo.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md bg-white/80 border ${badgeInfo.border} ${badgeInfo.text}`}>
                {badgeInfo.label}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-zinc-900 tabular-nums">
                  {score}
                </span>
                <span className="text-xs text-zinc-500 font-medium">/10</span>
              </div>
            </div>

            {/* Score Bar */}
            <div className="w-full bg-white/70 h-2 rounded-full overflow-hidden mb-2.5 border border-black/5">
              <div
                className={`${badgeInfo.bar} h-full rounded-full transition-all duration-300`}
                style={{ width: `${(score / 10) * 100}%` }}
              />
            </div>

            <p className="text-xs text-zinc-700 leading-relaxed font-medium">
              {healthData?.summary ||
                `${readyRecipe.name} provides a balanced nutrient ratio supporting sustained satiety.`}
            </p>
          </div>

          {/* Macronutrients Estimate */}
          {macros && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-900">
                  Estimated Macronutrients
                </span>
                <span className="text-[10px] text-zinc-400">
                  Per adult portion
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                {macros.calories && (
                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] text-zinc-400 block font-medium">Calories</span>
                    <span className="text-xs font-bold text-zinc-900 mt-0.5 block tabular-nums">
                      {macros.calories}
                    </span>
                    <span className="text-[9px] text-zinc-400">kcal</span>
                  </div>
                )}
                {macros.protein && (
                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] text-zinc-400 block font-medium">Protein</span>
                    <span className="text-xs font-bold text-zinc-900 mt-0.5 block tabular-nums">
                      {macros.protein}
                    </span>
                    <span className="text-[9px] text-emerald-600 font-medium">Lean</span>
                  </div>
                )}
                {macros.carbs && (
                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] text-zinc-400 block font-medium">Carbs</span>
                    <span className="text-xs font-bold text-zinc-900 mt-0.5 block tabular-nums">
                      {macros.carbs}
                    </span>
                    <span className="text-[9px] text-zinc-400">Complex</span>
                  </div>
                )}
                {macros.fat && (
                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] text-zinc-400 block font-medium">Fat</span>
                    <span className="text-xs font-bold text-zinc-900 mt-0.5 block tabular-nums">
                      {macros.fat}
                    </span>
                    <span className="text-[9px] text-zinc-400">Total</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nutritional Highlights / Points */}
          <div>
            <span className="text-xs font-semibold text-zinc-900 block mb-2">
              Nutritional Factors & Ingredients
            </span>

            <div className="space-y-2">
              {points.map((point, idx) => {
                const isPositive = point.impact === 'positive' || !point.impact;
                const isNeutral = point.impact === 'neutral';

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-zinc-150 bg-white flex items-start gap-2.5"
                  >
                    {isPositive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : isNeutral ? (
                      <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-900 leading-tight">
                        {point.factor}
                      </h4>
                      <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">
                        {point.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dietary & Lifestyle Badges */}
          <div className="pt-2 flex flex-wrap gap-1.5">
            {readyRecipe.isVegetarian && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                Vegetarian
              </span>
            )}
            {readyRecipe.isVegan && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                100% Plant-Based
              </span>
            )}
            {readyRecipe.tags?.map((t, idx) => (
              <span
                key={idx}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/60"
              >
                {t}
              </span>
            ))}
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
