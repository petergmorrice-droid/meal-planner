import React from 'react';
import { X, Heart, Sparkles, CheckCircle2, Info, ChevronRight, Apple, Flame, Utensils } from 'lucide-react';
import { MealPlan, Recipe } from '../types';
import { ensureRecipeBreakdowns } from '../utils/recipeBreakdowns';

interface WeeklyHealthModalProps {
  plan: MealPlan;
  recipes: Recipe[];
  onClose: () => void;
  onOpenMealHealth?: (recipe: Recipe) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WeeklyHealthModal({ plan, recipes, onClose, onOpenMealHealth }: WeeklyHealthModalProps) {
  const recipeMap = new Map(recipes.map(r => [r.id, ensureRecipeBreakdowns(r)]));

  let totalScore = 0;
  let scoredMealsCount = 0;
  let vegCount = 0;
  let highProteinCount = 0;
  let homeCookedCount = 0;

  const dailyBreakdown = DAYS_OF_WEEK.map(day => {
    const dayPlan = plan.days[day];
    const meal = dayPlan?.meals?.[0];
    let score: number | null = null;
    let label = 'No meal planned';
    let type = 'empty';
    let recipeObj: Recipe | undefined;
    let tag = '';

    if (meal) {
      type = meal.type;
      label = meal.name;

      if ((meal.type === 'recipe' || meal.type === 'leftover') && meal.recipeId) {
        recipeObj = recipeMap.get(meal.recipeId);
        if (recipeObj) {
          homeCookedCount++;
          score = recipeObj.healthScore || 7;
          totalScore += score;
          scoredMealsCount++;

          if (recipeObj.isVegetarian || recipeObj.isVegan || recipeObj.tags?.some(t => t.toLowerCase().includes('veg'))) {
            vegCount++;
            tag = 'Plant-forward';
          } else if (recipeObj.tags?.some(t => t.toLowerCase().includes('fish') || t.toLowerCase().includes('salmon'))) {
            tag = 'Omega-3 Rich';
          } else if (recipeObj.tags?.some(t => t.toLowerCase().includes('protein') || t.toLowerCase().includes('chicken') || t.toLowerCase().includes('beef'))) {
            highProteinCount++;
            tag = 'High Protein';
          } else {
            tag = 'Balanced';
          }
        }
      } else if (meal.type === 'batch') {
        score = 8;
        totalScore += score;
        scoredMealsCount++;
        homeCookedCount++;
        tag = 'Home Batch';
      } else if (meal.type === 'takeout') {
        score = 5;
        totalScore += score;
        scoredMealsCount++;
        tag = 'Treat / Takeout';
      } else if (meal.type === 'eating_out') {
        score = 6;
        totalScore += score;
        scoredMealsCount++;
        tag = 'Restaurant';
      } else if (meal.type === 'no_meal') {
        label = meal.note ? `No meal: ${meal.note}` : 'No meal planned';
      }
    }

    return {
      day,
      date: dayPlan?.date,
      meal,
      score,
      label,
      type,
      tag,
      recipeObj
    };
  });

  const avgHealth = scoredMealsCount > 0 ? (totalScore / scoredMealsCount).toFixed(1) : '—';
  const numAvg = scoredMealsCount > 0 ? Number(avgHealth) : 7;

  const getScoreBadge = (val: number) => {
    if (val >= 8) {
      return {
        label: 'Excellent Nutritional Balance',
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
      label: 'Moderate Balance',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200/80',
      bar: 'bg-rose-500'
    };
  };

  const badgeInfo = getScoreBadge(numAvg);

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
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Heart className="w-5 h-5 fill-rose-500/20" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 leading-tight">
                Weekly Health & Nutrition
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
          {/* Average Score Header Card */}
          <div className={`p-4 rounded-xl border ${badgeInfo.border} ${badgeInfo.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md bg-white/80 border ${badgeInfo.border} ${badgeInfo.text}`}>
                {badgeInfo.label}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-zinc-900 tabular-nums">
                  {avgHealth}
                </span>
                <span className="text-xs text-zinc-500 font-medium">/10 avg</span>
              </div>
            </div>

            {/* Score Bar */}
            <div className="w-full bg-white/70 h-2 rounded-full overflow-hidden mb-2.5 border border-black/5">
              <div
                className={`${badgeInfo.bar} h-full rounded-full transition-all duration-300`}
                style={{ width: `${Math.min(100, (numAvg / 10) * 100)}%` }}
              />
            </div>

            <p className="text-xs text-zinc-700 leading-relaxed font-medium">
              {scoredMealsCount > 0
                ? `Your weekly plan averages ${avgHealth}/10 across ${scoredMealsCount} meals, featuring ${homeCookedCount} home-cooked dinners and healthy variety.`
                : 'Plan meals to see your weekly nutritional health profile.'}
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Home Cooked
              </span>
              <span className="text-lg font-bold text-zinc-900 mt-0.5 block tabular-nums">
                {homeCookedCount} / 7
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Fresh food</span>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Plant / Veggie
              </span>
              <span className="text-lg font-bold text-zinc-900 mt-0.5 block tabular-nums">
                {vegCount} {vegCount === 1 ? 'meal' : 'meals'}
              </span>
              <span className="text-[10px] text-zinc-500">High fiber</span>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                High Protein
              </span>
              <span className="text-lg font-bold text-zinc-900 mt-0.5 block tabular-nums">
                {highProteinCount} {highProteinCount === 1 ? 'meal' : 'meals'}
              </span>
              <span className="text-[10px] text-zinc-500">Lean sources</span>
            </div>
          </div>

          {/* Day-by-Day Health Score Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-900">
                Daily Nutritional Ratings
              </span>
              <span className="text-[10px] text-zinc-400">
                Tap a recipe for full macronutrients
              </span>
            </div>

            <div className="space-y-1.5">
              {dailyBreakdown.map((item, idx) => {
                const isInteractive = Boolean(item.recipeObj && onOpenMealHealth);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (isInteractive && item.recipeObj) {
                        onOpenMealHealth!(item.recipeObj);
                      }
                    }}
                    className={`p-2.5 rounded-xl border border-zinc-150 flex items-center justify-between transition-colors ${
                      isInteractive
                        ? 'bg-white hover:bg-rose-50/40 hover:border-rose-200/80 cursor-pointer'
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
                        <span className="text-xs font-semibold text-zinc-900 block truncate">
                          {item.meal ? item.label : 'No meal planned'}
                        </span>
                        {item.tag && (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded inline-block mt-0.5">
                            {item.tag}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.score !== null ? (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${
                            item.score >= 8
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : item.score >= 6
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}
                        >
                          {item.score}/10
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300 font-medium">—</span>
                      )}
                      {isInteractive && (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-600" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Weekly Nutritional Insight */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-600 flex items-start gap-2 leading-relaxed">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-zinc-800">
                Nutritional Balance Assessment
              </p>
              <p className="text-zinc-500 mt-0.5">
                Planning home-cooked dinners gives you precise control over sodium, healthy fats, and vegetable fiber.
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
