// The Shop tab's list helpers: one row per product, how much to buy, the week to open on,
// "2 pints milk" typed into the add box, the list as text, and carrying items to another week.
import { MealPlan, ShoppingListItem, ShopRoute, ShopRecord } from './types';
import { aggregateIngredients } from './utils/aggregation';
import { matchProduct, matchProductDetailed, groupingKey, largeUnitQuantity, formatAmount, canonicalUnit, formatUnit, unitInfo } from './shopping';
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
  /** What your meals actually use, when it's less than you buy ("100 g" of a 300 g pack). */
  neededText?: string;
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

/**
 * Add up the list's lines into one row per product. `neededOf` gives what the meals use for a
 * meal line, worked out fresh from the week (otherwise the amount saved when the list was made).
 */
export function aggregateShoppingItems(items: ShoppingListItem[], neededOf?: (part: ShoppingListItem) => string | undefined): AggregatedShoppingListItem[] {
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
    const needs = groupItems.filter(isPlanned).map((i) => (neededOf ? neededOf(i) : undefined) ?? i.neededText).filter((t): t is string => Boolean(t));
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
      neededText: needs.join(' + ') || undefined,
    });
  }
  return result;
}

/**
 * Things you added by hand that aren't saved products yet (so the Shop can offer to save them):
 * one per name, not ones you've said aren't products.
 */
export function notYetProducts(items: ShoppingListItem[], declined?: string[] | null): ShoppingListItem[] {
  const no = new Set((declined || []).map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: ShoppingListItem[] = [];
  const catalog = getCatalog();
  for (const i of items) {
    if (!i || !i.isAdhoc || i.isRecurring || i.isBatch || i.groceryId) continue;
    const k = String(i.name || '').trim().toLowerCase();
    if (!k || seen.has(k) || no.has(k)) continue;
    seen.add(k);
    if (matchProductDetailed(catalog, i.name)?.how === 'exact') continue;
    out.push(i);
  }
  return out;
}

/**
 * How many packs a line on the list comes to, for something sold `step` × `unit` at a time
 * ("2" of a jar = 2 jars, "1 kg" of a 500 g bag = 2 bags). At least 1, at most 99.
 */
export function packsOnLine(item: { amount?: number | string; unit?: string }, unit: string, step: number): number {
  const a = Number(item.amount) || 0;
  if (!(a > 0) || !(step > 0)) return 1;
  const have = unitInfo(canonicalUnit(item.unit));
  const want = unitInfo(canonicalUnit(unit));
  let packs = 1;
  if (have.unit === want.unit) packs = a / step;
  else if (have.dimension !== 'count' && have.dimension === want.dimension) packs = (a * have.factor) / (step * want.factor);
  else if (have.unit === 'each') packs = a; // a bare number is how many you buy
  return Math.min(99, Math.max(1, Math.round(packs)));
}

/**
 * A line added by hand, in the unit its product is sold in: "1" of something sold by the pack is
 * "1 pack", "2" of something sold in 500 g bags is "1000 g", 1 kg of it stays 1000 g. null when
 * it's already in that unit or can't sensibly be said in it (500 ml of something sold by the jar).
 */
export function inProductUnit(line: { amount?: number | string; unit?: string }, unit: string, step: number): { amount: number; unit: string } | null {
  const have = unitInfo(canonicalUnit(line.unit));
  const want = unitInfo(canonicalUnit(unit));
  const a = Number(line.amount) || 0;
  if (have.unit === want.unit || !(a > 0)) return null;
  let amount: number;
  if (have.unit === 'each') {
    // "1" of something sold by the gram can't mean 1 g
    if (want.dimension !== 'count' && (step > 0 ? step : 1) * want.factor < 10) return null;
    amount = packsOnLine(line, unit, step) * (step > 0 ? step : 1);
  }
  else if (have.dimension !== 'count' && have.dimension === want.dimension) amount = (a * have.factor) / want.factor;
  else return null;
  amount = Math.round(amount * 100) / 100;
  return { amount, unit: formatUnit(want.unit, amount) };
}

/**
 * Lines added by hand as a bare number before they were products ("1" Belvita breakfast biscuits),
 * put in the unit the product is sold in ("1 pack"), so adding another makes "2 packs", not
 * "1 + 1 pack". Returns the same list if nothing needed changing.
 */
export function fitHandAddedToProducts(
  list: ShoppingListItem[],
  productOf: (i: ShoppingListItem) => { buyUnit: string; step: number } | null,
): ShoppingListItem[] {
  let changed = false;
  const out = list.map((i) => {
    if (!i.isAdhoc || i.isRecurring || i.isBatch || !i.groceryId || canonicalUnit(i.unit) !== 'each') return i;
    const p = productOf(i);
    if (!p) return i;
    const q = inProductUnit(i, p.buyUnit, p.step);
    if (!q) return i;
    changed = true;
    return { ...i, amount: q.amount, unit: q.unit };
  });
  return changed ? out : list;
}

/** A weekly staple of `packs` × the pack it's sold in: "2 jars", "1000 g", "3 items". */
export function stapleQuantity(unit: string, step: number, packs: number): { amount: number; unit: string } {
  const amount = Math.round(Math.max(1, packs) * (step > 0 ? step : 1) * 100) / 100;
  const u = canonicalUnit(unit);
  return { amount, unit: u === 'each' ? (amount === 1 ? 'item' : 'items') : formatUnit(u, amount) };
}

/**
 * Something you'd added by hand has just become a weekly staple: in each week that now has the
 * staple's own line, that line takes over from the one you added (so it isn't on the list twice).
 * If you'd already ticked it that week, the staple's line is ticked too; a note comes with it.
 */
export function stapleTakesOver(list: ShoppingListItem[], recurringId: string, isSame: (i: ShoppingListItem) => boolean): ShoppingListItem[] {
  const byWeek = new Map<string, ShoppingListItem[]>();
  for (const i of list) {
    if (!i.isAdhoc || i.isRecurring || i.isBatch || !i.planId || !isSame(i)) continue;
    byWeek.set(i.planId, [...(byWeek.get(i.planId) || []), i]);
  }
  if (!byWeek.size) return list;
  const drop = new Set<string>();
  const carry = new Map<string, ShoppingListItem[]>();
  for (const [planId, added] of byWeek) {
    const stapleId = `recurring-${planId}-${recurringId}`;
    if (!list.some((i) => i.id === stapleId)) continue;
    added.forEach((i) => drop.add(i.id));
    carry.set(stapleId, added);
  }
  if (!drop.size) return list;
  return list
    .filter((i) => !drop.has(i.id))
    .map((i) => {
      const added = carry.get(i.id);
      if (!added) return i;
      const ticked = added.every((a) => a.checked);
      const note = i.note || added.find((a) => a.note)?.note;
      return {
        ...i,
        ...(ticked && !i.checked ? { checked: true, ...(added[0].checkedBy ? { checkedBy: added[0].checkedBy } : {}) } : {}),
        ...(note ? { note } : {}),
      };
    });
}

/** Something you keep adding by hand that could be a weekly staple. */
export interface StapleSuggestion {
  key: string;
  name: string;
  /** How many of the recent weeks it was added in. */
  weeks: number;
  /** Out of how many weeks looked at. */
  of: number;
  /** What it usually is each week (the most recent week's amount). */
  amount: number;
  unit: string;
  category?: string;
  groceryId?: string;
}

const weekOfLine = (i: ShoppingListItem): string | null => {
  const m = String(i.planId || '').match(/(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
};

/**
 * Things added by hand in at least `minWeeks` of the last `lookBack` weeks (up to and including
 * `thisWeek`, a Monday "YYYY-MM-DD"), that aren't weekly staples already and that you haven't
 * said aren't staples. Most-often first.
 */
export function suggestedStaples(
  list: ShoppingListItem[],
  opts: { thisWeek: string; staples?: { name: string }[]; declined?: string[]; lookBack?: number; minWeeks?: number },
): StapleSuggestion[] {
  const lookBack = opts.lookBack ?? 6;
  const minWeeks = opts.minWeeks ?? 3;
  const weeks = new Set<string>();
  const d = new Date(opts.thisWeek + 'T12:00:00');
  for (let n = 0; n < lookBack; n++) {
    const w = new Date(d);
    w.setDate(d.getDate() - 7 * n);
    weeks.add(`${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`);
  }
  const declined = new Set((opts.declined || []).map((x) => x.trim().toLowerCase()));
  const stapleKeys = new Set((opts.staples || []).flatMap((r) => [productKey({ name: r.name }), `name:${r.name.trim().toLowerCase()}`]));
  const found = new Map<string, { weeks: Set<string>; latestWeek: string; lines: ShoppingListItem[] }>();
  for (const i of list || []) {
    if (!i || !i.isAdhoc || i.isRecurring || i.isBatch) continue;
    const week = weekOfLine(i);
    if (!week || !weeks.has(week)) continue;
    const key = productKey(i);
    let f = found.get(key);
    if (!f) { f = { weeks: new Set(), latestWeek: '', lines: [] }; found.set(key, f); }
    f.weeks.add(week);
    if (week > f.latestWeek) { f.latestWeek = week; f.lines = [i]; }
    else if (week === f.latestWeek) f.lines.push(i);
  }
  const out: StapleSuggestion[] = [];
  for (const [key, f] of found) {
    if (f.weeks.size < minWeeks) continue;
    const latest = [...f.lines].sort((a, b) => (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0))[0];
    const name = latest.name;
    if (stapleKeys.has(key) || stapleKeys.has(`name:${name.trim().toLowerCase()}`)) continue;
    if (declined.has(name.trim().toLowerCase()) || declined.has(key)) continue;
    const unit = canonicalUnit(latest.unit);
    const amount = Math.round(f.lines.filter((l) => canonicalUnit(l.unit) === unit).reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100) / 100 || 1;
    out.push({ key, name, weeks: f.weeks.size, of: lookBack, amount, unit: latest.unit || '', category: latest.category, groceryId: latest.groceryId });
  }
  return out.sort((a, b) => b.weeks - a.weeks || a.name.localeCompare(b.name));
}

/** How many weeks of shopping lines each phone keeps (enough for suggested staples and checking back). */
export const KEEP_SHOP_WEEKS = 10;

/**
 * Lines from weeks that started more than `keepWeeks` weeks before this week (`todayIso`), which
 * can be cleared so the saved data and every sync don't keep growing. Lines with no week are kept.
 */
export function oldShoppingLineIds(list: ShoppingListItem[], todayIso: string, keepWeeks = KEEP_SHOP_WEEKS): string[] {
  const t = new Date(todayIso + 'T12:00:00');
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7 * keepWeeks);
  const cutoff = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  return (list || []).filter((i) => {
    const week = i ? weekOfLine(i) : null;
    return !!week && week < cutoff;
  }).map((i) => i.id);
}

const COUNT_UNITS =['', 'whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', 'each'];

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
