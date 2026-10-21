/**
 * What this week's meals need of each shopping line: which meals, which nights, how much.
 * Used for the "less than your meals need" check, the meals under a line and the (i) panel.
 */
import { useCallback, useMemo } from 'react';
import { ShoppingListItem, MealPlan, DayPlan, Recipe } from '../../types';
import { matchProduct, groupingKey, formatUnit, formatCookingAmount } from '../../shopping';
import { generateShoppingListForPlan, getCatalog, DAYS_OF_WEEK } from '../../utils';
import { partLabel } from '../../shopList';

export interface MealRequirementDetail {
  recipeName: string;
  night: string;
  servings: number;
  amount: number | string;
  displayQuantity?: string;
  unit: string;
}

export interface PlannedRequirement {
  requiredAmount: number;
  /** What the meals actually use, when less than you buy ("100 g"). */
  neededText?: string;
  recipes: string[];
  nights: string[];
  breakdown: MealRequirementDetail[];
}

export interface ThresholdWarningState {
  item: ShoppingListItem;
  targetAmount: number;
  isRemoval?: boolean;
  requirement: PlannedRequirement;
}

export function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Is this a line for the week's meals (not added by hand, a staple or an extra recipe)? */
const isMealLine = (i: ShoppingListItem) => !i.isAdhoc && !i.isBatch && !i.isRecurring;

/** For a sent week: what its meals need of each line, by line name (lower case). */
export function plannedNeedsByName(plan: MealPlan | null, recipes: Recipe[]): Map<string, PlannedRequirement> {
  const map = new Map<string, PlannedRequirement>();
  if (!plan || !plan.days || plan.status !== 'finalized') return map;

  const targetItems = generateShoppingListForPlan(plan, recipes);
  const catalog = getCatalog();
  const lineKeyFor = (name: string, unit?: string, amount?: number, groceryId?: string) => {
    const product = matchProduct(catalog, name, { unit, amount, groceryId });
    return product ? `p:${product.id}` : `n:${groupingKey(name)}`;
  };

  targetItems.forEach((target) => {
    const recipeSet = new Set<string>();
    const nightSet = new Set<string>();
    const breakdown: MealRequirementDetail[] = [];
    const normItemName = target.name.toLowerCase().trim();
    const targetKey = target.groceryId ? `p:${target.groceryId}` : lineKeyFor(target.name);

    Object.entries(plan.days).forEach(([dayKey, dayPlan]) => {
      const dp = dayPlan as DayPlan;
      if (!dp || !dp.meals) return;

      let dayName = dayKey;
      if (DAYS_OF_WEEK.includes(dayKey)) {
        dayName = dayKey;
      } else if (dp.date) {
        const d = new Date(dp.date + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          dayName = DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1] || dayKey;
        }
      }

      dp.meals.forEach((meal) => {
        if ((meal.type === 'recipe' || meal.type === 'leftover') && meal.recipeId) {
          const recipe = recipes.find((r: Recipe) => r.id === meal.recipeId);
          if (!recipe || !recipe.ingredients) return;

          const mealServings = meal.servings ?? 2;
          const baseServings = recipe.servings ?? 2;
          const scale = mealServings / (baseServings || 2);

          recipe.ingredients.forEach((ing) => {
            if (!ing || !ing.name) return;
            if (lineKeyFor(ing.name, ing.unit, ing.amount, ing.groceryId) === targetKey) {
              const scaled = Math.round(ing.amount * scale * 100) / 100;
              recipeSet.add(recipe.name);
              nightSet.add(dayName);
              breakdown.push({
                recipeName: recipe.name,
                night: dayName,
                servings: mealServings,
                amount: scaled,
                unit: ing.unit,
              });
            }
          });
        }
      });
    });

    const sortedNights = Array.from(nightSet).sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b));
    map.set(normItemName, {
      requiredAmount: target.amount,
      neededText: target.neededText,
      recipes: Array.from(recipeSet),
      nights: sortedNights,
      breakdown,
    });
  });

  return map;
}

/** What each meal uses of a meal line: [{ "Chilli con carne (Wed)", "1 can" }]. */
export function mealBreakdownFor(
  part: ShoppingListItem,
  needs: Map<string, PlannedRequirement>,
): { label: string; amount: string }[] {
  if (!isMealLine(part)) return [];
  const req = needs.get(part.name.toLowerCase().trim());
  if (!req || !req.breakdown.length) return [];
  const seen = new Set<string>();
  const out: { label: string; amount: string }[] = [];
  for (const b of req.breakdown) {
    const n = Number(b.amount);
    // Less than one reads singular: "⅔ can"
    const label = formatUnit(b.unit || '', n > 0 && n < 1 ? 1 : n);
    const amount = n > 0 ? `${formatCookingAmount(n, b.unit)}${label ? ` ${label}` : ''}` : '';
    const name = `${b.recipeName} (${b.night.slice(0, 3)})`;
    if (!seen.has(name + amount)) {
      seen.add(name + amount);
      out.push({ label: name, amount });
    }
  }
  return out;
}

/** The week's meal needs, worked out once per change to the week or the recipes. */
export function usePlannedNeeds(activePlan: MealPlan | null, recipes: Recipe[] | undefined) {
  const needs = useMemo(() => plannedNeedsByName(activePlan, recipes || []), [activePlan, recipes]);

  /** What the meals need of a meal line (null for anything else, or before the week is sent). */
  const requirementFor = (item: ShoppingListItem): PlannedRequirement | null => {
    if (!activePlan || !activePlan.days || activePlan.status !== 'finalized' || !isMealLine(item)) return null;
    return needs.get(item.name.toLowerCase().trim()) || null;
  };

  /** What the meals use for a meal line (see aggregateShoppingItems). */
  const neededOf = useCallback(
    (part: ShoppingListItem) =>
      needs.size ? (needs.get(part.name.toLowerCase().trim())?.neededText ?? '') : undefined,
    [needs],
  );

  const mealBreakdown = (part: ShoppingListItem) => mealBreakdownFor(part, needs);

  /** The line under a part in the item panel: the meals it's for, or where it came from. */
  const partDetail = (part: ShoppingListItem): string => {
    const meals = mealBreakdown(part);
    if (!meals.length) return partLabel(part);
    return `For ${meals.map((m) => (m.amount ? `${m.label}: ${m.amount}` : m.label)).join(', ')}`;
  };

  return { requirementFor, neededOf, mealBreakdown, partDetail };
}
