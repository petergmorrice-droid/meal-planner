/**
 * The shared product list: keeping it in one piece, and the changes the Products page makes
 * (remove, "Same as…", other names) together with what they mean for recipes, staples,
 * favourites and the shopping list.
 *
 * Everything here is a plain function of the app's data, so it can be tested on its own and
 * both phones get the same answer.
 */
import type { AppState, GroceryItem, ShoppingListItem, UserPreferences } from '../types';
import { getSyncMeta, stableStringify } from '../services/syncMerge';
import { aisleCategory, isAisleName } from './aisles';
import {
  EXTRA_PRODUCTS,
  builtInProducts,
  builtInSameAs,
  matchProduct,
  alsoCalled,
  applyDefaultChanges,
  listRenames,
  CATALOG_VERSION,
  type Catalog,
  type Product,
} from './catalog';
import { matchKey, nameWords } from './names';
import { canonicalUnit } from './units';

const ts = (x: { lastModifiedAt?: unknown } | null | undefined): number =>
  typeof x?.lastModifiedAt === 'number' ? x.lastModifiedAt : 0;
const same = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b);
/**
 * Time for a change the app makes by itself (giving a product its aisle, say): just newer than
 * the version it changed, so it never beats a real edit made since on the other phone.
 * Built-in defaults stay defaults.
 */
const bump = (t: number) => (t < 0 ? -0.5 : t + 1);

let builtInById: Map<string, GroceryItem> | null = null;
const builtIn = (id: string) => (builtInById ??= new Map(builtInProducts().map((i) => [i.id, i]))).get(id);

/**
 * Bring the shared list up to date, so it alone describes every product:
 *  - built-in products deleted by an older version get a "removed" marker, so they stay off
 *    after the deletion record is forgotten (90 days);
 *  - changes older versions kept separately (groceryOverrides) are folded into the products;
 *  - products added to the app since are added (unless you have one by that name);
 *  - every product's category becomes one of the Shop's aisles ('' if nothing says which);
 *  - built-in duplicates (Zucchini, Eggplant...) are merged into the product they're the same as.
 * Returns the same object when there's nothing to do. Deterministic, so both phones agree.
 */
export function normaliseProducts(state: AppState, now: number): AppState {
  const list = state.groceryDatabase;
  if (!Array.isArray(list) || list.length === 0) return state;
  const meta = getSyncMeta(state);
  const out = list.slice();
  const index = new Map(out.map((g, i) => [g.id, i]));
  let changed = false;
  const add = (item: GroceryItem) => {
    index.set(item.id, out.length);
    out.push(item);
    changed = true;
  };
  const deletedAt = (id: string) => meta.tombstones[`groceryDatabase:${id}`];

  // 1. Built-in products deleted outright by an older version.
  for (const [k, t] of Object.entries(meta.tombstones)) {
    if (!k.startsWith('groceryDatabase:')) continue;
    const id = k.slice('groceryDatabase:'.length);
    const b = builtIn(id);
    if (!b || index.has(id)) continue;
    add({ ...b, removed: true, lastModifiedAt: t + 1 });
  }

  // 2. Changes older versions kept separately.
  let groceryOverrides = state.groceryOverrides;
  const ov = state.groceryOverrides || {};
  const ovKeys = Object.keys(ov);
  if (ovKeys.length) {
    for (const k of ovKeys) {
      const {
        lastModifiedAt: _t,
        id: _id,
        ...fields
      } = (ov[k] || {}) as Partial<GroceryItem> & { lastModifiedAt?: number };
      const t = meta.overridesModifiedAt?.[k] || 0;
      const at = index.get(k);
      if (at !== undefined) {
        const cur = out[at];
        const next = { ...cur, ...fields, id: cur.id };
        if (!same(next, cur)) {
          out[at] = { ...next, lastModifiedAt: Math.max(ts(cur), t) + 1 };
          changed = true;
        }
      } else if (typeof fields.name === 'string' && fields.name.trim()) {
        add({ unit: 'each', increment: 1, category: '', ...fields, name: fields.name, id: k, lastModifiedAt: t + 1 });
      } else {
        const b = builtIn(k);
        if (b && deletedAt(k) === undefined) add({ ...b, ...fields, id: k, lastModifiedAt: t + 1 });
      }
      const tk = `groceryOverrides:${k}`;
      meta.tombstones[tk] = Math.max(meta.tombstones[tk] || 0, t, now);
      delete meta.overridesModifiedAt![k];
    }
    groceryOverrides = {};
    changed = true;
  }

  // 3. Products added to the app since this list was made.
  const ids = new Set(out.map((i) => i.id));
  const names = new Set(out.map((i) => matchKey(i.name)));
  for (const e of EXTRA_PRODUCTS) {
    if (ids.has(e.item.id) || names.has(matchKey(e.item.name)) || deletedAt(e.item.id) !== undefined) continue;
    add({ ...builtIn(e.item.id)!, lastModifiedAt: 0 });
  }

  // 4. Aisles, and built-in duplicates merged.
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    if (!cur || cur.removed) continue;
    let next: GroceryItem = cur;
    const cat = aisleCategory(cur);
    if (cat !== (cur.category ?? '')) next = { ...next, category: cat };
    const target = builtInSameAs(cur.id);
    const at = target ? index.get(target) : undefined;
    if (target && at !== undefined && !out[at].removed) next = { ...next, removed: true, mergedInto: target };
    if (next !== cur) {
      out[i] = { ...next, lastModifiedAt: bump(ts(cur)) };
      changed = true;
    }
  }

  if (!changed) return state;
  return { ...state, groceryDatabase: out, groceryOverrides, syncMeta: meta };
}

/**
 * Once per catalogue version (after syncing, so it works on the latest data): built-in products
 * that still have an old default get the new one (UK pack sizes, names, aisles), staples and
 * favourites with a product's old name get its new name, and the version is recorded. Products
 * you've changed yourselves are left alone. (New products are added by normaliseProducts.)
 */
export function upgradeProductDefaults(state: AppState, defaultPrefs: UserPreferences): AppState {
  const list = state.groceryDatabase || [];
  let listChanged = false;
  const groceryDatabase = list.map((g) => {
    if (!g || g.removed) return g;
    const next = applyDefaultChanges(g);
    if (!next) return g;
    listChanged = true;
    return next;
  });
  const renames = listRenames();
  const rename = <T extends { name: string }>(x: T): T => {
    const to = renames.get(
      String(x?.name ?? '')
        .trim()
        .toLowerCase(),
    );
    return to ? { ...x, name: to } : x;
  };
  const prefs = state.preferences || defaultPrefs;
  const staples = (prefs.recurringItems || []).map(rename);
  const staplesChanged = staples.some((x, i) => x !== prefs.recurringItems![i]);
  const seen = new Set<string>();
  const favs = (prefs.favouriteItems || []).map(rename).filter((f) => {
    const k = String(f?.name ?? '')
      .trim()
      .toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const favsChanged =
    favs.length !== (prefs.favouriteItems || []).length || favs.some((x, i) => x !== prefs.favouriteItems![i]);
  return {
    ...state,
    groceryDatabase: listChanged ? groceryDatabase : state.groceryDatabase,
    preferences: {
      ...prefs,
      catalogVersion: CATALOG_VERSION,
      ...(staplesChanged ? { recurringItems: staples } : {}),
      ...(favsChanged ? { favouriteItems: favs } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Where each product is used
// ---------------------------------------------------------------------------

export interface ProductUsage {
  /** Recipe ids. */
  recipes: string[];
  staples: number;
  favourites: number;
  /** Lines on the shopping list. */
  list: number;
}

export const isUnused = (u: ProductUsage | undefined) =>
  !u || (u.recipes.length === 0 && u.staples === 0 && u.favourites === 0 && u.list === 0);

/** The parts of the data that can use a product (the whole AppState will do). */
export interface UsageSources {
  recipes?: AppState['recipes'];
  shoppingList?: AppState['shoppingList'];
  preferences?: Pick<UserPreferences, 'recurringItems' | 'favouriteItems'>;
}

/** For each product: the recipes, staples, favourites and shopping-list lines that use it. */
export function productUsage(state: UsageSources, catalog: Catalog): Map<string, ProductUsage> {
  const map = new Map<string, ProductUsage>();
  const get = (id: string) => {
    let u = map.get(id);
    if (!u) {
      u = { recipes: [], staples: 0, favourites: 0, list: 0 };
      map.set(id, u);
    }
    return u;
  };
  for (const r of state.recipes || []) {
    const seen = new Set<string>();
    for (const ing of r.ingredients || []) {
      if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) continue;
      const p = matchProduct(catalog, ing.name, {
        groceryId: ing.groceryId,
        unit: ing.unit,
        amount: Number(ing.amount),
      });
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        get(p.id).recipes.push(r.id);
      }
    }
  }
  for (const s of state.preferences?.recurringItems || []) {
    const p = s?.name ? matchProduct(catalog, s.name) : null;
    if (p) get(p.id).staples++;
  }
  for (const f of state.preferences?.favouriteItems || []) {
    const p = f?.name ? matchProduct(catalog, f.name) : null;
    if (p) get(p.id).favourites++;
  }
  for (const i of state.shoppingList || []) {
    const p = i?.name ? matchProduct(catalog, i.name, { groceryId: i.groceryId }) : null;
    if (p) get(p.id).list++;
  }
  return map;
}

/** "Used in 3 recipes · a staple" / "Not used yet". */
export function usageText(u: ProductUsage | undefined): string {
  if (isUnused(u)) return 'Not used yet';
  const parts: string[] = [];
  const n = u!.recipes.length;
  if (n) parts.push(`used in ${n} ${n === 1 ? 'recipe' : 'recipes'}`);
  if (u!.staples) parts.push('a staple');
  if (u!.favourites) parts.push('a favourite');
  if (u!.list) parts.push('on the list');
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Tidy-up checks
// ---------------------------------------------------------------------------

/** Words that never make a different product ("Fresh Basil" is Basil). Kept short on purpose. */
const SOFT_WORDS = new Set([
  'fresh',
  'freshly',
  'large',
  'small',
  'medium',
  'big',
  'organic',
  'british',
  'ripe',
  'whole',
]);
const coreKey = (name: string) => {
  const words = nameWords(name);
  const kept = words.filter((w) => !SOFT_WORDS.has(w));
  return (kept.length ? kept : words).join(' ');
};

function oneEditApart(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Built-in products that share a name on purpose ("pepper": peppers by the each, black pepper by the pinch). */
const KNOWN_DIFFERENT = new Set(['gdb-132|gdb-8']);
const saidDifferent = (a: Product, b: Product) =>
  KNOWN_DIFFERENT.has([a.id, b.id].sort().join('|')) ||
  Boolean(a.item.notSameAs?.includes(b.id) || b.item.notSameAs?.includes(a.id));

/**
 * Pairs of products that look like the same thing: the same name apart from words like "fresh"
 * or "large", one's name being another name the other goes by, or a one-letter spelling slip.
 * Pairs you've said are different are left out.
 */
export function likelyDuplicates(catalog: Catalog): [Product, Product][] {
  const products = catalog.products;
  const pairs = new Map<string, [Product, Product]>();
  const addPair = (a: Product, b: Product) => {
    if (a.id === b.id || saidDifferent(a, b)) return;
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (!pairs.has(k)) pairs.set(k, [a, b]);
  };
  const byCore = new Map<string, Product[]>();
  const byOtherName = new Map<string, Product[]>();
  for (const p of products) {
    const c = coreKey(p.name);
    if (c) byCore.set(c, [...(byCore.get(c) || []), p]);
    const own = matchKey(p.name);
    for (const k of p.keys) if (k !== own) byOtherName.set(k, [...(byOtherName.get(k) || []), p]);
  }
  for (const group of byCore.values())
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) addPair(group[i], group[j]);
  for (const p of products) for (const q of byOtherName.get(matchKey(p.name)) || []) addPair(q, p);
  const keyed = products.map((p) => ({ p, k: matchKey(p.name).replace(/ /g, '') }));
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i].k;
      const b = keyed[j].k;
      if (Math.min(a.length, b.length) >= 5 && oneEditApart(a, b)) addPair(keyed[i].p, keyed[j].p);
    }
  }
  return [...pairs.values()];
}

/** Products without one of the Shop's aisles. */
export const hasNoAisle = (p: Product) => !isAisleName(p.item.category);

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

/** A new product, or changes to one, saved into the list (its category always one of the aisles). */
export function saveProductIn(state: AppState, item: GroceryItem): AppState {
  const list = state.groceryDatabase || [];
  const clean: GroceryItem = { ...item, name: item.name.trim(), category: aisleCategory(item) };
  delete clean.removed;
  delete clean.mergedInto;
  const at = list.findIndex((g) => g.id === item.id);
  if (at >= 0) {
    if (same({ ...list[at], lastModifiedAt: 0 }, { ...clean, lastModifiedAt: 0 })) return state;
    return { ...state, groceryDatabase: list.map((g, i) => (i === at ? clean : g)) };
  }
  return { ...state, groceryDatabase: [...list, clean] };
}

/** Change some details of a product (adding it to the list first if it's a built-in that isn't there). */
export function updateProductIn(state: AppState, id: string, changes: Partial<GroceryItem>): AppState {
  const list = state.groceryDatabase || [];
  const cur = list.find((g) => g.id === id) ?? builtIn(id) ?? null;
  if (!cur) {
    if (typeof changes.name !== 'string' || !changes.name.trim()) return state;
    return saveProductIn(state, { unit: 'each', increment: 1, category: '', ...changes, id } as GroceryItem);
  }
  const { lastModifiedAt: _t, ...fields } = changes as Partial<GroceryItem> & { lastModifiedAt?: number };
  return saveProductIn(state, { ...cur, ...fields, id });
}

export interface RemovedProduct {
  item: GroceryItem;
  /** Recipe ingredients that were linked to it (put back by Undo). */
  recipeLinks: { recipeId: string; ingredientId: string }[];
  /** Shopping-list lines that were linked to it. */
  listLinks: string[];
}

/**
 * Take a product off the list. It's kept as "removed" so it stays off on both phones, and
 * recipes and shopping-list lines linked to it are unlinked (they're matched by name again).
 */
export function removeProductIn(state: AppState, id: string): { next: AppState; undo: RemovedProduct } | null {
  const list = state.groceryDatabase || [];
  const at = list.findIndex((g) => g.id === id);
  const item = at >= 0 ? list[at] : builtIn(id);
  if (!item || item.removed) return null;
  const { mergedInto: _m, ...rest } = item;
  const marker: GroceryItem = { ...rest, removed: true };
  const groceryDatabase = at >= 0 ? list.map((g, i) => (i === at ? marker : g)) : [...list, marker];

  const recipeLinks: RemovedProduct['recipeLinks'] = [];
  let recipesTouched = false;
  const recipes = (state.recipes || []).map((r) => {
    if (!(r.ingredients || []).some((ing) => ing?.groceryId === id)) return r;
    recipesTouched = true;
    return {
      ...r,
      ingredients: r.ingredients.map((ing) => {
        if (ing?.groceryId !== id) return ing;
        recipeLinks.push({ recipeId: r.id, ingredientId: ing.id });
        const { groceryId: _g, ...keep } = ing;
        return keep;
      }),
    };
  });
  const listLinks: string[] = [];
  const shoppingList = (state.shoppingList || []).map((i) => {
    if (i.groceryId !== id) return i;
    listLinks.push(i.id);
    const { groceryId: _g, ...keep } = i;
    return keep as ShoppingListItem;
  });
  return {
    next: {
      ...state,
      groceryDatabase,
      recipes: recipesTouched ? recipes : state.recipes,
      shoppingList: listLinks.length ? shoppingList : state.shoppingList,
    },
    undo: { item, recipeLinks, listLinks },
  };
}

/** Undo a removal: the product back as it was, and its links. */
export function restoreProductIn(state: AppState, undo: RemovedProduct): AppState {
  const list = state.groceryDatabase || [];
  const groceryDatabase = list.some((g) => g.id === undo.item.id)
    ? list.map((g) => (g.id === undo.item.id ? { ...undo.item } : g))
    : [...list, { ...undo.item }];
  const byRecipe = new Map<string, Set<string>>();
  for (const l of undo.recipeLinks)
    byRecipe.set(l.recipeId, (byRecipe.get(l.recipeId) || new Set()).add(l.ingredientId));
  const recipes = byRecipe.size
    ? (state.recipes || []).map((r) => {
        const ingIds = byRecipe.get(r.id);
        if (!ingIds) return r;
        return {
          ...r,
          ingredients: r.ingredients.map((ing) =>
            ingIds.has(ing.id) && !ing.groceryId ? { ...ing, groceryId: undo.item.id } : ing,
          ),
        };
      })
    : state.recipes;
  const lines = new Set(undo.listLinks);
  const shoppingList = lines.size
    ? (state.shoppingList || []).map((i) => (lines.has(i.id) && !i.groceryId ? { ...i, groceryId: undo.item.id } : i))
    : state.shoppingList;
  return { ...state, groceryDatabase, recipes, shoppingList };
}

/** What merging would change, for the confirm message. */
export function mergeSummary(
  state: AppState,
  catalog: Catalog,
  goneId: string,
): { recipes: number; staples: number; favourites: number; list: number } {
  const u = productUsage(state, catalog).get(goneId);
  return {
    recipes: u?.recipes.length || 0,
    staples: u?.staples || 0,
    favourites: u?.favourites || 0,
    list: u?.list || 0,
  };
}

/**
 * "Same as…": merge one product into another. The one kept takes on the other's names, and
 * recipes, staples, favourites and shopping-list lines move over to it. The other is kept as
 * "merged" so anything still pointing at it (on the other phone, say) leads to the one kept.
 */
export function mergeProductsIn(state: AppState, catalog: Catalog, keepId: string, goneId: string): AppState | null {
  if (keepId === goneId) return null;
  const list = state.groceryDatabase || [];
  const keep = list.find((g) => g.id === keepId) ?? builtIn(keepId);
  const gone = list.find((g) => g.id === goneId) ?? builtIn(goneId);
  if (!keep || !gone || keep.removed || gone.removed) return null;

  // Names
  const keepKeys = new Set([matchKey(keep.name), ...alsoCalled(keep).map(matchKey)]);
  const extraNames: string[] = [];
  for (const n of [gone.name, ...alsoCalled(gone)]) {
    const k = matchKey(n);
    if (!k || keepKeys.has(k)) continue;
    keepKeys.add(k);
    extraNames.push(n);
  }
  const notSameAs = (keep.notSameAs || []).filter((x) => x !== goneId);
  const { notSameAs: _n, ...keepRest } = keep;
  const kept: GroceryItem = {
    ...keepRest,
    ...(extraNames.length ? { aliases: [...(keep.aliases || []), ...extraNames] } : {}),
    ...(notSameAs.length ? { notSameAs } : {}),
  };
  const merged: GroceryItem = { ...gone, removed: true, mergedInto: keepId };
  const inList = (id: string) => list.some((g) => g.id === id);
  let groceryDatabase = list.map((g) =>
    g.id === keepId ? kept : g.id === goneId ? merged : g.mergedInto === goneId ? { ...g, mergedInto: keepId } : g,
  );
  if (!inList(keepId)) groceryDatabase = [...groceryDatabase, kept];
  if (!inList(goneId)) groceryDatabase = [...groceryDatabase, merged];

  const isGone = (name: string, groceryId?: string) =>
    groceryId === goneId || (!!name && matchProduct(catalog, name, { groceryId })?.id === goneId);

  // Recipes: links move over (names now lead to the kept product anyway).
  let recipesTouched = false;
  const recipes = (state.recipes || []).map((r) => {
    if (!(r.ingredients || []).some((ing) => ing?.groceryId === goneId)) return r;
    recipesTouched = true;
    return {
      ...r,
      ingredients: r.ingredients.map((ing) => (ing?.groceryId === goneId ? { ...ing, groceryId: keepId } : ing)),
    };
  });

  // Shopping list: lines move over; two unticked lines for the same week and unit become one.
  const goneNameKey = matchKey(gone.name);
  let listTouched = false;
  let shoppingList: ShoppingListItem[] = (state.shoppingList || []).map((i) => {
    if (!isGone(i.name, i.groceryId)) return i;
    listTouched = true;
    return {
      ...i,
      groceryId: keepId,
      name: matchKey(i.name) === goneNameKey ? keep.name : i.name,
      category: keep.category || i.category,
    };
  });
  if (listTouched) {
    const dropped = new Set<string>();
    const result: ShoppingListItem[] = [];
    const keptLine = new Map<string, number>();
    for (const i of shoppingList) {
      const isKeep =
        !i.checked &&
        (i.groceryId === keepId || matchProduct(catalog, i.name, { groceryId: i.groceryId })?.id === keepId);
      if (!isKeep) {
        result.push(i);
        continue;
      }
      const key = `${i.planId || ''}|${canonicalUnit(i.unit)}|${i.isRecurring ? 'r' : ''}`;
      const at = keptLine.get(key);
      if (at === undefined) {
        keptLine.set(key, result.length);
        result.push(i);
        continue;
      }
      const into = result[at];
      result[at] = {
        ...into,
        amount: Math.round(((Number(into.amount) || 0) + (Number(i.amount) || 0)) * 100) / 100,
        recipeNames: [...new Set([...(into.recipeNames || []), ...(i.recipeNames || [])])],
        groceryId: keepId,
      };
      dropped.add(i.id);
    }
    shoppingList = dropped.size ? result : shoppingList;
  }

  // Staples and favourites: renamed to the kept product.
  const prefs = state.preferences;
  let preferences = prefs;
  if (prefs) {
    const staples = prefs.recurringItems || [];
    const newStaples = staples.map((s) =>
      s?.name && isGone(s.name) ? { ...s, name: keep.name, category: keep.category || s.category } : s,
    );
    const favs = prefs.favouriteItems || [];
    let favsTouched = false;
    const seen = new Set<string>();
    const newFavs: { name: string; category?: string }[] = [];
    for (const f of favs) {
      const moved = f?.name && isGone(f.name) ? { ...f, name: keep.name, category: keep.category || f.category } : f;
      if (moved !== f) favsTouched = true;
      const k = String(moved?.name || '')
        .trim()
        .toLowerCase();
      if (seen.has(k)) {
        favsTouched = true;
        continue;
      }
      seen.add(k);
      newFavs.push(moved);
    }
    const staplesTouched = newStaples.some((s, i) => s !== staples[i]);
    if (staplesTouched || favsTouched) {
      preferences = {
        ...prefs,
        ...(staplesTouched ? { recurringItems: newStaples } : {}),
        ...(favsTouched ? { favouriteItems: newFavs } : {}),
      };
    }
  }

  return {
    ...state,
    groceryDatabase,
    recipes: recipesTouched ? recipes : state.recipes,
    shoppingList: listTouched ? shoppingList : state.shoppingList,
    preferences,
  };
}

/** "These two aren't the same": remembered on both, so the tidy-up check stops asking. */
export function markDifferentIn(state: AppState, aId: string, bId: string): AppState {
  let next = state;
  for (const [x, y] of [
    [aId, bId],
    [bId, aId],
  ]) {
    const list = next.groceryDatabase || [];
    const cur = list.find((g) => g.id === x) ?? builtIn(x);
    if (!cur || (cur.notSameAs || []).includes(y)) continue;
    next = updateProductIn(next, x, { notSameAs: [...(cur.notSameAs || []), y] });
  }
  return next;
}

/**
 * "Reset to built-in": the app's own products as they come, everything you added taken off
 * (kept as removed so it stays off on the other phone too) and links to those unlinked.
 */
export function resetProductsIn(state: AppState): AppState {
  const list = state.groceryDatabase || [];
  const builtIns = builtInProducts();
  const builtInIds = new Set(builtIns.map((b) => b.id));
  const gone = new Set<string>();
  const kept: GroceryItem[] = [];
  for (const g of list) {
    if (builtInIds.has(g.id)) continue;
    if (!g.removed) gone.add(g.id);
    kept.push(g.removed ? g : { ...g, removed: true });
  }
  const groceryDatabase = [...builtIns.map((b) => ({ ...b })), ...kept];
  const unlink = <T extends { groceryId?: string }>(x: T): T => {
    if (!x.groceryId || !gone.has(x.groceryId)) return x;
    const { groceryId: _g, ...rest } = x;
    return rest as T;
  };
  return {
    ...state,
    groceryDatabase,
    recipes: (state.recipes || []).map((r) =>
      r.ingredients?.some((i) => i.groceryId && gone.has(i.groceryId))
        ? { ...r, ingredients: r.ingredients.map(unlink) }
        : r,
    ),
    shoppingList: (state.shoppingList || []).map(unlink),
  };
}

/**
 * Load products from a file: those in the file replace yours (built-in ones keep their ids),
 * and any of yours not in the file are taken off.
 */
export function replaceProductsIn(state: AppState, items: GroceryItem[]): AppState {
  const list = state.groceryDatabase || [];
  const incoming = new Map(items.map((i) => [i.id, { ...i, category: aisleCategory(i) }]));
  const out: GroceryItem[] = [];
  for (const g of list) {
    const inc = incoming.get(g.id);
    if (inc) {
      out.push(inc);
      incoming.delete(g.id);
    } else out.push(g.removed ? g : { ...g, removed: true });
  }
  for (const i of incoming.values()) out.push(i);
  return { ...state, groceryDatabase: out };
}
