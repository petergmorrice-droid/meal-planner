// The Shop tab's list helpers: one row per product, how much to buy, the week to open on,
// "2 pints milk" typed into the add box, the list as text, and carrying items to another week.
import { MealPlan, ShoppingListItem, ShopRoute, ShopRecord } from './types';
import { aggregateIngredients } from './utils/aggregation';
import { matchProduct, matchProductDetailed, groupingKey, largeUnitQuantity, formatAmount, canonicalUnit, formatUnit } from './shopping';
import { getCatalog, convertToShoppingQuantity, quantityForAddedItem } from './utils/shoppingConversion';

/** One row on the list: every line for the same product, added up. */
export interface AggregatedShoppingListItem {
  /** The product this row is for (same for every row of the same product). */
  key: string;
  id: string;
  name: string;
  amount: number | string;
  displayQuantity?: string;
  unit: string;
  category?: string;
  checked: boolean;
  isAdhoc: boolean;
  isBatch?: boolean;
  isRecurring?: boolean;
  batchRecipeName?: string;
  recipeNames?: string[];
  underlyingIds: string[];
  /** The list lines behind this row (meal ingredients, a staple, something added by hand...). */
  parts: ShoppingListItem[];
  description: string;
  note?: string;
  checkCupboard?: boolean;
  needsCheck?: boolean;
  quantityNote?: string;
  /** Marked "out of stock" at the shop (and not ticked). */
  outOfStock?: boolean;
  /** Who ticked it. */
  checkedBy?: string;
}

/** Same product = same key, whatever it's called ("Chicken breasts" / "chicken breast fillets"). */
export function productKey(item: { name: string; groceryId?: string }): string {
  const product = matchProduct(getCatalog(), item.name, { groceryId: item.groceryId });
  return product ? `p:${product.id}` : `n:${groupingKey(item.name)}`;
}

const isPlanned = (i: ShoppingListItem) => !i.isAdhoc && !i.isBatch && !i.isRecurring;

/** Add up the list's lines into one row per product. */
export function aggregateShoppingItems(items: ShoppingListItem[]): AggregatedShoppingListItem[] {
  const groups = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const key = productKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  const result: AggregatedShoppingListItem[] = [];
  for (const [key, groupItems] of groups) {
    // The row takes its name from the meal ingredient if there is one, then extra recipe, staple, added by hand.
    const score = (i: ShoppingListItem) => (isPlanned(i) ? 4 : i.isBatch ? 3 : i.isRecurring ? 2 : 1);
    const canonical = [...groupItems].sort((a, b) => score(b) - score(a))[0];
    const { amount, unit, displayQuantity } = aggregateIngredients(groupItems);

    const recipeNames = new Set<string>();
    const extraRecipes = new Set<string>();
    let extraAmount = 0;
    let hasPlanned = false;
    let hasStaple = false;
    for (const i of groupItems) {
      if (isPlanned(i)) { hasPlanned = true; (i.recipeNames || []).forEach((r) => recipeNames.add(r)); }
      else if (i.isBatch) { if (i.batchRecipeName) extraRecipes.add(i.batchRecipeName); }
      else if (i.isRecurring) hasStaple = true;
      else extraAmount += i.amount || 0;
    }
    const desc: string[] = [];
    if (recipeNames.size) desc.push(`for ${Array.from(recipeNames).join(', ')}`);
    else if (hasPlanned) desc.push('for your meals');
    if (extraRecipes.size) desc.push(`for ${Array.from(extraRecipes).join(', ')} (extra)`);
    if (hasStaple) desc.push('weekly staple');
    if (extraAmount > 0 && desc.length) desc.push('some added by you');

    const notes = Array.from(new Set(groupItems.map((i) => (i.note || '').trim()).filter(Boolean)));
    result.push({
      key,
      id: canonical.id,
      name: canonical.name,
      amount,
      unit,
      displayQuantity,
      category: canonical.category,
      checked: groupItems.every((i) => i.checked),
      isAdhoc: groupItems.every((i) => i.isAdhoc),
      isBatch: groupItems.some((i) => i.isBatch),
      isRecurring: groupItems.some((i) => i.isRecurring),
      batchRecipeName: canonical.batchRecipeName,
      recipeNames: Array.from(recipeNames),
      underlyingIds: groupItems.map((i) => i.id),
      parts: groupItems,
      description: desc.join(' · '),
      note: notes.join('; ') || undefined,
      outOfStock: groupItems.every((i) => i.outOfStock && !i.checked) || undefined,
      checkedBy: groupItems.find((i) => i.checked && i.checkedBy)?.checkedBy,
      checkCupboard: groupItems.every((i) => i.checkCupboard && i.cupboard !== 'need'),
      needsCheck: groupItems.some((i) => i.needsCheck),
      quantityNote: groupItems.map((i) => i.quantityNote).filter(Boolean).join('; ') || undefined,
    });
  }
  return result;
}

const COUNT_UNITS = ['', 'whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', 'each'];

/** How much to buy, as it reads in the shop: "1 kg", "2 cans", "6". */
export function shopQuantityText(item: { amount: number | string; unit?: string; displayQuantity?: string }): string {
  if (item.displayQuantity) return item.displayQuantity;
  const rawUnit = (item.unit || '').toLowerCase().trim();
  const big = typeof item.amount === 'number' ? largeUnitQuantity(item.amount, item.unit) : null;
  if (big) return `${formatAmount(big.amount)} ${big.unit}`;
  return COUNT_UNITS.includes(rawUnit) ? `${item.amount}` : `${item.amount} ${item.unit}`;
}

/** Where a line on the list came from, for the item panel. */
export function partLabel(part: ShoppingListItem): string {
  if (part.isRecurring) return 'Weekly staple';
  if (part.isBatch) return part.batchRecipeName ? `For ${part.batchRecipeName} (extra)` : 'For an extra recipe';
  if (part.isAdhoc) return 'Added by you';
  return part.recipeNames?.length ? `For ${part.recipeNames.join(', ')}` : 'For your meals';
}

/** Something on this week's list still to buy (not ticked, not out of stock, not "already in the cupboard"). */
export const isToBuy = (i: ShoppingListItem) => !i.checked && !i.outOfStock && i.cupboard !== 'have';

/**
 * The week the Shop tab opens on: the week you're most likely shopping for (this week Mon–Thu,
 * next week Fri–Sun) if it's been sent and has things to buy; otherwise the next sent week after
 * it with things to buy; otherwise that likely week (or next week, or the first). Weeks before
 * the likely one don't count: on a Saturday, this week's leftovers aren't what you're shopping for.
 */
export function defaultShopWeek(plans: MealPlan[], list: ShoppingListItem[], likelyStart: string, nextStart: string): string | null {
  const sorted = [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const hasToBuy = (p: MealPlan) => p.status === 'finalized' && list.some((i) => i.planId === p.id && isToBuy(i));
  const likely = sorted.find((p) => p.startDate === likelyStart);
  if (likely && hasToBuy(likely)) return likely.id;
  const later = sorted.find((p) => p.startDate >= likelyStart && hasToBuy(p));
  if (later) return later.id;
  return (likely || sorted.find((p) => p.startDate === nextStart) || sorted[0])?.id ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "19–25 Oct", or "27 Oct – 2 Nov" across a month end. */
export function formatWeekSpan(startDate: string): string {
  const a = new Date(startDate + 'T00:00:00');
  if (isNaN(a.getTime())) return '';
  const b = new Date(a);
  b.setDate(a.getDate() + 6);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** "26 Oct": the Monday a week starts on. */
export function weekStartShort(startDate: string): string {
  const a = new Date(startDate + 'T00:00:00');
  return isNaN(a.getTime()) ? '' : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
}

// ---------- The "Add an item…" box ----------

const UNIT_WORDS = 'g|grams?|kg|kilos?|ml|l|litres?|liters?|pints?|cans?|tins?|jars?|packs?|packets?|bags?|box(?:es)?|bunch(?:es)?|bulbs?|heads?|balls?|blocks?|fillets?|oz|lbs?';
const UNIT_FIRST = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})\\.?\\s+(?:of\\s+)?(.+)$`, 'i');

export interface QuickAddText { name: string; amount?: number; unit?: string; packs?: number }

/** "2 pints milk", "500g mince", "6 eggs", "milk x2", "2x bread", "bin bags". */
export function parseQuickAdd(text: string): QuickAddText {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = t.match(/^(.+?)\s*[x×*]\s*(\d+)$/i);
  if (m && /\D/.test(m[1])) return { name: m[1].trim(), packs: Number(m[2]) };
  m = t.match(/^(\d+)\s*[x×]\s+(.+)$/i);
  if (m) return { name: m[2].trim(), packs: Number(m[1]) };
  m = t.match(UNIT_FIRST);
  if (m) return { name: m[3].trim(), amount: Number(m[1]), unit: m[2].toLowerCase() };
  m = t.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m) return { name: m[2].trim(), amount: Number(m[1]) };
  m = t.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
  if (m && /\D/.test(m[1])) return { name: m[1].trim(), amount: Number(m[2]) };
  return { name: t };
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * What goes on the list for what you typed. A plain number is a count of the thing ("6 eggs",
 * "2 lemons") unless that makes no sense for the product, then it's packs ("2 milk" = 2 pints).
 */
export function quickAddLine(parsed: QuickAddText): { name: string; amount: number; unit: string; category?: string; groceryId?: string } {
  // Only a product with exactly this name (or one of its other names): "tortilla chips" isn't Frozen Chips.
  const found = matchProductDetailed(getCatalog(), parsed.name);
  const product = found?.how === 'exact' ? found.product : null;
  if (!product) {
    const name = capitalise(parsed.name);
    const n = parsed.packs ?? parsed.amount ?? 1;
    const unit = parsed.unit ? formatUnit(canonicalUnit(parsed.unit), n) : '';
    return { name, amount: n, unit };
  }
  const name = product.name;
  const packs = (n: number) => {
    const q = quantityForAddedItem(parsed.name, n);
    return { name, amount: q.amount, unit: q.unit, category: q.category, groceryId: q.groceryId };
  };
  if (parsed.packs) return packs(parsed.packs);
  if (parsed.amount !== undefined) {
    const c = convertToShoppingQuantity(parsed.name, parsed.amount, parsed.unit || '');
    if (c.needsCheck && !parsed.unit) return packs(parsed.amount);
    return { name, amount: c.amount, unit: c.unit, category: c.category, groceryId: c.groceryId };
  }
  return packs(1);
}

// ---------- Sharing ----------

/** The list as plain text for WhatsApp or an online order: what's left to buy, aisle by aisle. */
export function listAsText(title: string, groups: { name: string; items: AggregatedShoppingListItem[] }[]): string {
  const lines: string[] = [title];
  for (const g of groups) {
    const items = g.items.filter((i) => !i.checked);
    if (!items.length) continue;
    lines.push('', g.name);
    for (const i of items) lines.push(`• ${i.name} – ${shopQuantityText(i)}${i.note ? ` (${i.note})` : ''}`);
  }
  if (lines.length === 1) lines.push('', 'Nothing left to buy.');
  return lines.join('\n');
}

// ---------- Moving things you didn't get to another week ----------

/**
 * Take these lines off their week and put them on another week's list (as things added by
 * hand, so rebuilding that week's meals doesn't wipe them). Lines for the same product become
 * one; a product already waiting on that week's list isn't added twice.
 */
export function carryItemsToWeek(
  list: ShoppingListItem[],
  ids: string[],
  toPlanId: string,
  weekLabel: string,
  makeId: () => string = () => crypto.randomUUID(),
): { list: ShoppingListItem[]; moved: string[]; alreadyThere: string[] } {
  const idSet = new Set(ids);
  const moving = list.filter((i) => idSet.has(i.id));
  const kept = list.filter((i) => !idSet.has(i.id));
  const waiting = new Set(kept.filter((i) => i.planId === toPlanId && !i.checked).map(productKey));

  const byProduct = new Map<string, ShoppingListItem[]>();
  for (const i of moving) {
    const k = productKey(i);
    byProduct.set(k, [...(byProduct.get(k) || []), i]);
  }
  const added: ShoppingListItem[] = [];
  const moved: string[] = [];
  const alreadyThere: string[] = [];
  for (const [key, group] of byProduct) {
    const first = group[0];
    if (waiting.has(key)) { alreadyThere.push(first.name); continue; }
    const total = aggregateIngredients(group);
    const numeric = typeof total.amount === 'number';
    const note = Array.from(new Set(group.map((i) => (i.note || '').trim()).filter(Boolean))).join('; ');
    added.push({
      id: makeId(),
      name: first.name,
      amount: numeric ? (total.amount as number) : first.amount,
      unit: numeric ? total.unit || first.unit : first.unit,
      category: first.category,
      ...(first.groceryId ? { groceryId: first.groceryId } : {}),
      ...(note ? { note } : {}),
      checked: false,
      isAdhoc: true,
      isBatch: false,
      isRecurring: false,
      planId: toPlanId,
      weekLabel,
    });
    moved.push(first.name);
  }
  return { list: [...kept, ...added], moved, alreadyThere };
}

/** "23 min", "1 hr 5 min" for how long a shop took (null if it doesn't look like one trip). */
export function shopDurationText(ms: number): string | null {
  if (!isFinite(ms) || ms < 60_000 || ms > 4 * 3600_000) return null;
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''}`;
}

// ---------- Learning your route round the shop ----------

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Learn from one shop: the order things were ticked. Each product and aisle gets a position
 * (0 = first, 1 = last), averaged with what was learned before. Short shops teach nothing.
 */
export function learnRoute(prev: ShopRoute | undefined, ticks: { key: string; aisle: string }[]): ShopRoute | undefined {
  const seen = new Set<string>();
  const seq = ticks.filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)));
  if (seq.length < 5) return prev;
  const pos = (i: number) => (seq.length > 1 ? i / (seq.length - 1) : 0);
  const blend = (old: number | undefined, now: number) => round3(old === undefined ? now : old * 0.5 + now * 0.5);
  const items = { ...(prev?.items || {}) };
  const aisles = { ...(prev?.aisles || {}) };
  const firstInAisle = new Map<string, number>();
  seq.forEach((t, i) => {
    items[t.key] = blend(prev?.items[t.key], pos(i));
    if (!firstInAisle.has(t.aisle)) firstInAisle.set(t.aisle, i);
  });
  for (const [aisle, i] of firstInAisle) aisles[aisle] = blend(prev?.aisles[aisle], pos(i));
  return { items, aisles, shops: (prev?.shops || 0) + 1 };
}

/** Aisles in the order you usually reach them (ones never learned keep their usual place after). */
export function routeAisleOrder<A extends string>(route: ShopRoute | undefined, usual: A[]): A[] | null {
  if (!route || !route.shops || !Object.keys(route.aisles).length) return null;
  const learned = usual.filter((a) => route.aisles[a] !== undefined).sort((a, b) => route.aisles[a] - route.aisles[b]);
  return [...learned, ...usual.filter((a) => route.aisles[a] === undefined)];
}

/** Items in the order you usually pick them up; new ones after, A–Z. */
export function sortByRoute<T extends { key: string; name: string }>(items: T[], route: ShopRoute | undefined): T[] {
  const rank = (t: T) => (route?.items[t.key] ?? Infinity);
  return [...items].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

// ---------- Shop history ----------

/** Add a finished shop to the history (newest first, last 20 kept). */
export function addShopRecord(history: ShopRecord[] | undefined, rec: ShopRecord, keep = 20): ShopRecord[] {
  return [rec, ...(history || []).filter((r) => r.id !== rec.id)].slice(0, keep);
}

/** Only shops of this many items count for your best and average time (a quick top-up isn't a fair race). */
export const BIG_SHOP = 10;

export function shopStats(history: ShopRecord[] | undefined): { best: number | null; average: number | null; timed: number } {
  const timed = (history || []).filter((r) => r.minutes !== null && r.minutes > 0 && r.bought >= BIG_SHOP);
  if (!timed.length) return { best: null, average: null, timed: 0 };
  const mins = timed.map((r) => r.minutes as number);
  return { best: Math.min(...mins), average: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), timed: timed.length };
}

/** "Halfway there!" when the % done passes 25, 50 or 75 (null otherwise). */
export function milestoneCrossed(before: number, after: number): string | null {
  if (before < 75 && after >= 75 && after < 100) return 'Three quarters done!';
  if (before < 50 && after >= 50 && after < 75) return 'Halfway there!';
  if (before < 25 && after >= 25 && after < 50) return 'A quarter done!';
  return null;
}
