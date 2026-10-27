/**
 * What's left from a week, for Auto populate's "Still got these?", worked out from what was bought
 * and what was cooked:
 *
 * - More bought than used: the shopping list rounds up to whole packs (a 500 g pack of chicken
 *   for 300 g, a bunch of coriander for a tablespoon), so the rest is still in the fridge.
 * - Meals that didn't happen: a past day not ticked as cooked (in a week where you tick meals at
 *   all) still has all its ingredients. Days still to come are taken as cooked.
 *
 * Only things that go off are listed (meat and fish, fresh produce, chilled things, bread). Store-
 * cupboard things, frozen food, long keepers (onions, potatoes, eggs, butter, hard cheese) and
 * weekly staples (bought every week anyway) aren't. Amounts are in each product's own measure (grams, millilitres or a count), so they can
 * be taken off the next week's shopping. It's an estimate: Auto populate asks before using it.
 */
import type { MealPlan, OnHandItem, PlannedMeal, Recipe, ShoppingListItem } from './types';
import { planIngredientInputs } from './utils';
import { leftoverSourceDay, mealOnDay } from './planning';
import { planDayDate } from './freezer';
import { parseQuickAdd } from './shopList';
import {
  buyQuantity,
  canonicalUnit,
  displayName,
  formatAmount,
  formatCookingAmount,
  formatQuantity,
  formatUnit,
  groupingKey,
  guessAisle,
  largeUnitQuantity,
  matchProduct,
  parseAmount,
  toBase,
  type Catalog,
  type FoodAisle,
  type Product,
} from './shopping';

export interface Leftover {
  /** 'p:<product id>', or 'n:<name>|<unit>' for something not on the product list. */
  key: string;
  name: string;
  groceryId?: string;
  /** In the product's own measure ('g', 'ml', or 'each' for a count); a recipe's unit otherwise. */
  amount: number;
  unit: string;
  /** Roughly how many days it keeps: the sooner, the sooner it's used. */
  useWithin: number;
  /** Why it's thought to be there: "Bought 500 g, the meals use 300 g", "Chilli on Thursday wasn't cooked". */
  why: string;
  /** Typed in ("Anything else to use up?") rather than worked out. */
  added?: boolean;
}

const KEEPS_WELL =
  /\b(onions?|garlic|potato(e?s)?|shallots?|ginger|lemons?|limes?|oranges?|apples?|butternut|squash|swedes?|turnips?|parsnips?|carrots?|cabbages?|butter|cheddar|parmesan|pecorino|grana padano|eggs?)\b/;
const GOES_OFF_FAST =
  /\b(coriander|parsley|basil|mint|dill|chives|tarragon|rocket|spinach|lettuce|salad|watercress|bean ?sprouts?|pak choi|bok choy|mushrooms?|avocados?|raspberr(y|ies)|strawberr(y|ies)|blueberr(y|ies)|spring onions?)\b/;
const SOFT_DAIRY =
  /\b(cream|cr[eè]me fra[iî]che|fra[iî]che|yogh?urt|milk|mozzarella|ricotta|mascarpone|cottage|buttermilk|houmous|hummus|burrata|soft cheese)\b/;
const PERISHABLE_AISLES = new Set<FoodAisle>(['meat_seafood', 'produce', 'dairy_eggs', 'bakery']);

/**
 * Roughly how many days something keeps once you've got it, or null for things that keep (the
 * store cupboard, the freezer, onions and potatoes, eggs, butter, hard cheese).
 */
export function keepsForDays(name: string, aisle: FoodAisle | null, cupboard = false): number | null {
  const n = (name || '').toLowerCase();
  const a = aisle ?? guessAisle({ name });
  if (cupboard || !a || !PERISHABLE_AISLES.has(a)) return null;
  if (a === 'meat_seafood') return 2;
  if (GOES_OFF_FAST.test(n)) return 3;
  if (KEEPS_WELL.test(n)) return null;
  if (SOFT_DAIRY.test(n) || a === 'bakery') return 4;
  return a === 'produce' ? 6 : 7;
}

/** One pack (one buying step) in the product's own measure, if known. */
const packBase = (p: Product) => (p.buySize ? p.step * p.buySize : null);

/** The least worth mentioning: a quarter of a pack (at least half of one for things you count). */
function minWorthListing(p: Product): number {
  const pack = packBase(p);
  if (p.base === 'each') return Math.max(0.5, pack ? pack * 0.25 : 0.5);
  return pack ? pack * 0.25 : 50;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** An amount in a product's own measure, the way you'd say it: "200 g", "1.2 kg", "¾ pot", "2". */
export function productAmountText(p: Product, amount: number): string {
  if (p.base === 'each') return formatCookingAmount(Math.max(0.5, roundTo(amount, 0.5)), 'each');
  const unit = canonicalUnit(p.buyUnit);
  if (!['g', 'ml', 'kg', 'l'].includes(unit) && p.buySize && p.buySize > 1) {
    // Bought in packs, pots, bunches or one at a time: say it in those ("¾ pot", "½" a pepper).
    const n = Math.max(0.25, roundTo(amount / p.buySize, unit === 'each' || !unit ? 0.5 : 0.25));
    const label = formatUnit(unit, n < 1 ? 1 : n);
    return label ? `${formatCookingAmount(n, unit)} ${label}` : formatCookingAmount(n, unit);
  }
  const neat = Math.max(10, roundTo(amount, amount >= 100 ? 25 : 10));
  const big = largeUnitQuantity(neat, p.base);
  return big ? `${formatAmount(big.amount)} ${big.unit}` : `${formatAmount(neat)} ${p.base}`;
}

/** How much is left, as you'd say it ("about 200 g", "¾ bunch", "2"). */
export function leftoverAmountText(l: Leftover, catalog: Catalog): string {
  const p = l.key.startsWith('p:') ? catalog.byId.get(l.key.slice(2)) : undefined;
  if (p) return `${l.added ? '' : 'about '}${productAmountText(p, l.amount)}`;
  return formatQuantity(l.amount, l.unit);
}

/** A leftover as it's kept on the week ("already got"), to come off its shopping. */
export function toOnHand(l: Leftover): OnHandItem {
  return {
    id: l.key,
    name: l.name,
    amount: Math.round(l.amount * 100) / 100,
    unit: l.unit,
    ...(l.groceryId ? { groceryId: l.groceryId } : {}),
  };
}

const isMealLine = (i: ShoppingListItem, planId: string) =>
  i.planId === planId && !i.isAdhoc && !i.isBatch && !i.isRecurring;

/**
 * What's probably left over from a week (see the top of this file), the things that go off first
 * first. `today` decides which days are past: they count as cooked only if ticked, when the week
 * has any ticks; days from today on are taken as cooked.
 */
export function weekLeftovers({
  plan,
  recipes,
  shoppingList,
  catalog,
  today,
  staples = [],
}: {
  plan: MealPlan | undefined | null;
  recipes: Recipe[];
  shoppingList: ShoppingListItem[];
  catalog: Catalog;
  today: string;
  /** Weekly staples (milk, bread…): not listed. */
  staples?: { name: string }[];
}): Leftover[] {
  if (!plan?.days) return [];
  const stapleIds = new Set(
    staples.map((st) => matchProduct(catalog, st?.name || '')?.id).filter((id): id is string => !!id),
  );
  const days = plan.days;
  const ticks = Object.values(days).some((d) => (d?.meals || []).some((m) => m?.cooked));
  const cooked = (day: string, meal: PlannedMeal | null): boolean => {
    if (!meal) return true;
    if (planDayDate(plan, day) >= today || !ticks) return true;
    return !!meal.cooked;
  };
  // A leftovers day's ingredients were cooked on its cook day.
  const eaten = (day: string, meal: PlannedMeal): boolean => {
    const from = leftoverSourceDay(days, day, meal);
    return from ? cooked(from, mealOnDay(days, from)) : cooked(day, meal);
  };

  type Tally = {
    product?: Product;
    name: string;
    unit: string;
    total: number;
    used: number;
    unsure: boolean;
    notCooked: string[];
  };
  const tallies = new Map<string, Tally>();
  for (const input of planIngredientInputs(plan, recipes)) {
    const amount = parseAmount(input.amount);
    if (!isFinite(amount) || amount <= 0) continue;
    const unit = String(input.unit ?? '');
    const product = matchProduct(catalog, input.name, { groceryId: input.groceryId ?? undefined, unit, amount });
    const key = product ? `p:${product.id}` : `n:${groupingKey(input.name)}|${canonicalUnit(unit)}`;
    let t = tallies.get(key);
    if (!t) {
      t = {
        product: product ?? undefined,
        name: product ? product.name : displayName(input.name),
        unit: product ? product.base : canonicalUnit(unit),
        total: 0,
        used: 0,
        unsure: false,
        notCooked: [],
      };
      tallies.set(key, t);
    }
    const base = product ? toBase(product, amount, unit) : amount;
    if (base === null) {
      t.unsure = true;
      continue;
    }
    t.total += base;
    if (eaten(input.day, input.meal)) t.used += base;
    else {
      const what = `${(input.meal.name || '').replace(/^(leftovers?|batch):\s*/i, '')} on ${input.day}`;
      if (!t.notCooked.includes(what)) t.notCooked.push(what);
    }
  }

  // Once the week's on the list, the list says what was bought: changed by hand, out of stock or
  // taken off (had it already).
  const lines = (shoppingList || []).filter((i) => i && isMealLine(i, plan.id));
  const lineFor = (p: Product) =>
    lines.find((i) => i.groceryId === p.id || matchProduct(catalog, i.name, { groceryId: i.groceryId })?.id === p.id);
  const onHandBase = (p: Product) =>
    (plan.onHand || []).reduce((sum, h) => {
      if (matchProduct(catalog, h.name, { groceryId: h.groceryId, unit: h.unit })?.id !== p.id) return sum;
      return sum + (toBase(p, parseAmount(h.amount), h.unit) ?? 0);
    }, 0);

  const out: Leftover[] = [];
  for (const [key, t] of tallies) {
    if (t.total <= 0) continue;
    const p = t.product;
    const useWithin = keepsForDays(t.name, p ? p.aisle : null, p?.cupboard);
    if (useWithin === null || (p && stapleIds.has(p.id))) continue;

    let available = t.total;
    if (p) {
      // What you had already for this week, plus what was bought for the rest (in whole packs).
      const had = Math.min(onHandBase(p), t.total);
      const rest = t.total - had;
      const packs = !t.unsure && rest > 0 ? buyQuantity(p, rest) : null;
      available = had + (packs && p.buySize ? packs.amount * p.buySize : rest);
      if (lines.length) {
        const line = lineFor(p);
        if (!line || line.outOfStock || line.cupboard === 'have') continue;
        if (line.userAdjusted) {
          const adjusted = toBase(p, parseAmount(line.amount), line.unit);
          if (adjusted !== null) available = had + adjusted;
        }
      }
    }
    const left = available - t.used;
    if (left <= 0 || (p ? left < minWorthListing(p) : !t.notCooked.length)) continue;

    const why: string[] = [];
    if (t.notCooked.length) why.push(`${t.notCooked.join(' and ')} wasn't cooked`);
    if (p && available > t.total + minWorthListing(p) / 2) {
      why.push(
        `${why.length ? 'bought' : 'Bought'} ${productAmountText(p, available)}, the meals use ${productAmountText(p, t.total)}`,
      );
    }
    out.push({
      key,
      name: t.name,
      ...(p ? { groceryId: p.id } : {}),
      amount: Math.round(left * 100) / 100,
      unit: p ? (p.base === 'each' ? 'each' : p.base) : t.unit,
      useWithin,
      why: why.join('; ') || 'Left from last week',
    });
  }
  return out.sort((a, b) => a.useWithin - b.useWithin || a.name.localeCompare(b.name));
}

/**
 * Something typed into "Anything else to use up?": "half a cabbage", "200g chicken", "6 eggs",
 * "crème fraîche". Null if there's nothing to go on.
 */
export function typedLeftover(text: string, catalog: Catalog): Leftover | null {
  const cleaned = (text || '')
    .trim()
    .replace(/^(half|½)\s+(an?\s+)?/i, '0.5 ')
    .replace(/^(a|an)\s+/i, '1 ');
  if (!cleaned) return null;
  const parsed = parseQuickAdd(cleaned);
  if (!parsed.name.trim()) return null;
  const product = matchProduct(catalog, parsed.name, { unit: parsed.unit, amount: parsed.amount });
  if (product) {
    const pack = packBase(product) ?? (product.base === 'each' ? 1 : 100);
    let amount: number | null = null;
    if (parsed.packs) amount = parsed.packs * pack;
    else if (parsed.amount && parsed.unit) amount = toBase(product, parsed.amount, parsed.unit);
    else if (parsed.amount) {
      // A plain number: a count of it ("6 eggs", "2 peppers"), or packs of something weighed.
      amount = toBase(product, parsed.amount, 'each') ?? parsed.amount * pack;
    }
    return {
      key: `p:${product.id}`,
      name: product.name,
      groceryId: product.id,
      amount: amount && amount > 0 ? amount : pack,
      unit: product.base === 'each' ? 'each' : product.base,
      useWithin: keepsForDays(product.name, product.aisle, product.cupboard) ?? 7,
      why: 'You added it',
      added: true,
    };
  }
  const unit = canonicalUnit(parsed.unit);
  return {
    key: `n:${groupingKey(parsed.name)}|${unit}`,
    name: displayName(parsed.name),
    amount: parsed.amount ?? parsed.packs ?? 1,
    unit,
    useWithin: keepsForDays(parsed.name, null) ?? 7,
    why: 'You added it',
    added: true,
  };
}
