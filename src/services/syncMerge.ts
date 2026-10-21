/**
 * Merge logic that lets two phones edit the same data safely.
 *
 * Rules:
 *  - Every recipe, meal plan, freezer batch, shopping item and grocery item
 *    carries `lastModifiedAt`. When both phones have a version, the newer wins.
 *  - Deleting something leaves a "tombstone" (collection:key -> time). An item
 *    is only kept if it was changed *after* it was deleted, so deletions stick.
 *  - Settings are combined one setting at a time (each has its own timestamp),
 *    and grocery overrides one grocery item at a time.
 *  - A week's plan is combined day by day, so you planning Tuesday and the other
 *    phone ticking Monday both count. The week's own details (sent to the list)
 *    have their own time.
 *  - Staples, favourites and past shops are combined item by item.
 *  - A phone that hasn't synced for longer than deletions are remembered starts
 *    from the shared copy (see keepOnlyChangesSince).
 *  - Things a brand-new phone starts with (default settings, the built-in
 *    grocery list, empty weeks) are stamped -1, so they never beat real data.
 *  - mergeAppStates is order-independent and repeatable (merging twice changes
 *    nothing), so both phones always end up with the same data.
 */
import { AppState, SyncMeta } from '../types';

type CollectionName = 'recipes' | 'mealPlans' | 'batches' | 'shoppingList' | 'groceryDatabase';

/**
 * One synced thing (a recipe, week, batch, shopping line or product) as merging sees it. Data from
 * the Gist may have been written by any version of the app, so nothing is assumed beyond this, and
 * every field is read with care.
 */
interface Item {
  [field: string]: unknown;
  lastModifiedAt?: number;
  lastModifiedBy?: string;
}
type MaybeItem = Item | null | undefined;
/** A week, with when each day and the week's own details last changed. */
interface Plan extends Item {
  startDate?: string;
  days?: Record<string, unknown>;
  dayModifiedAt?: Record<string, number>;
  headModifiedAt?: number;
}
/** Plain objects keyed by name (settings, product overrides, a copy of the data being built). */
type Fields = Record<string, unknown>;
/** A field of something that may not be an object at all: exactly `x?.[k]`. */
const get = (x: unknown, k: string): unknown => (x as Fields | null | undefined)?.[k];
/** A list read from the data (it may be missing). */
const listOf = (state: unknown, name: CollectionName) => get(state, name) as Item[] | undefined;
/** What a merge builds, given back as app data. */
const asState = (x: Fields) => x as unknown as AppState;

interface CollectionSpec {
  name: CollectionName;
  key: (item: MaybeItem) => string | undefined;
}

export const COLLECTIONS: CollectionSpec[] = [
  { name: 'recipes', key: (r) => r?.id as string | undefined },
  { name: 'mealPlans', key: (p) => p?.startDate as string | undefined },
  { name: 'batches', key: (b) => b?.id as string | undefined },
  { name: 'shoppingList', key: (i) => i?.id as string | undefined },
  { name: 'groceryDatabase', key: (g) => g?.id as string | undefined },
];

/** Tombstones older than this (relative to the newest change in the data) are forgotten. */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** A phone that hasn't synced for longer than this takes the shared copy first (deletions older than this are forgotten). */
export const LONG_ABSENCE_MS = TOMBSTONE_RETENTION_MS;

const tombstoneKey = (collection: string, key: string) => `${collection}:${key}`;

/** JSON.stringify with object keys sorted, so equal data always gives equal text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

const same = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b);

export function getSyncMeta(state: Partial<AppState> | null | undefined): SyncMeta {
  const meta = state?.syncMeta;
  return {
    tombstones: { ...(meta?.tombstones || {}) },
    preferencesModifiedAt: typeof meta?.preferencesModifiedAt === 'number' ? meta.preferencesModifiedAt : 0,
    preferencesFieldModifiedAt: { ...(meta?.preferencesFieldModifiedAt || {}) },
    overridesModifiedAt: { ...(meta?.overridesModifiedAt || {}) },
    prefItemModifiedAt: { ...(meta?.prefItemModifiedAt || {}) },
  };
}

/** Timestamp of one setting: its own if it has been edited since syncing began, otherwise the whole set's. */
const settingTime = (meta: SyncMeta, key: string): number =>
  meta.preferencesFieldModifiedAt?.[key] ?? meta.preferencesModifiedAt ?? 0;

const ts = (item: unknown): number => {
  const t = get(item, 'lastModifiedAt');
  return typeof t === 'number' ? t : 0;
};

/** Pick the newer of two versions; ties are broken by content so the result never depends on order. */
function newer<T>(a: T, aTime: number, b: T, bTime: number): T {
  if (a === b) return a;
  if (aTime !== bTime) return aTime > bTime ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Meal plans, day by day
// ---------------------------------------------------------------------------

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayOrder = (keys: Iterable<string>) =>
  [...new Set(keys)].sort((x, y) => {
    const ix = DAY_ORDER.indexOf(x);
    const iy = DAY_ORDER.indexOf(y);
    if (ix !== iy) return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    return x < y ? -1 : x > y ? 1 : 0;
  });

/** The week's own details (everything except its days and bookkeeping). */
const HEAD_SKIP = new Set(['days', 'dayModifiedAt', 'headModifiedAt', 'lastModifiedAt', 'lastModifiedBy']);
function planHead(p: Plan | null | undefined): Fields {
  const h: Fields = {};
  const src: Plan = p || {};
  for (const k of Object.keys(src)) if (!HEAD_SKIP.has(k) && src[k] !== undefined) h[k] = src[k];
  return h;
}

/** When each day and the week's details last changed (all the week's time if an older app changed it since). */
function planTimes(p: Plan | null | undefined): { day: (d: string) => number; head: number } {
  const t = ts(p);
  const dm = p?.dayModifiedAt;
  if (!p || !dm || typeof dm !== 'object') return { day: () => t, head: t };
  let known = typeof p.headModifiedAt === 'number' ? p.headModifiedAt : -Infinity;
  for (const v of Object.values(dm)) if (typeof v === 'number') known = Math.max(known, v);
  if (t > known) return { day: () => t, head: t };
  return {
    day: (d: string) => (typeof dm[d] === 'number' ? dm[d] : t),
    head: typeof p.headModifiedAt === 'number' ? p.headModifiedAt : t,
  };
}

/** Two copies of the same week: each day from whichever changed it last; the same for the week's details. */
export function mergePlans(a: Plan, b: Plan): Plan {
  if (a === b || same(a, b)) return newer(a, ts(a), b, ts(b));
  const ta = planTimes(a);
  const tb = planTimes(b);
  const days: Record<string, unknown> = {};
  const dayModifiedAt: Record<string, number> = {};
  for (const d of dayOrder([...Object.keys(a?.days || {}), ...Object.keys(b?.days || {})])) {
    const da = a?.days?.[d];
    const db = b?.days?.[d];
    if (da === undefined) {
      days[d] = db;
      dayModifiedAt[d] = tb.day(d);
      continue;
    }
    if (db === undefined) {
      days[d] = da;
      dayModifiedAt[d] = ta.day(d);
      continue;
    }
    days[d] = newer(da, ta.day(d), db, tb.day(d));
    dayModifiedAt[d] = Math.max(ta.day(d), tb.day(d));
  }
  const head = newer(planHead(a), ta.head, planHead(b), tb.head);
  const out: Plan = {
    ...head,
    days,
    dayModifiedAt,
    headModifiedAt: Math.max(ta.head, tb.head),
    lastModifiedAt: Math.max(ts(a), ts(b)),
  };
  const by =
    ts(a) !== ts(b)
      ? (ts(a) > ts(b) ? a : b).lastModifiedBy
      : [a?.lastModifiedBy, b?.lastModifiedBy]
          .filter((x) => x !== undefined)
          .sort()
          .pop();
  if (by !== undefined) out.lastModifiedBy = by;
  return out;
}

/** An empty day, as a week starts. */
function emptyDay(startDate: string | undefined, d: string) {
  const i = DAY_ORDER.indexOf(d);
  let date = '';
  if (i >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    const dt = new Date(`${startDate}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + i);
    date = dt.toISOString().slice(0, 10);
  }
  return { date, meals: [] };
}

/**
 * A week deleted at `deletedAt`: gone, unless part of it was changed after that, in which case
 * the parts changed before the deletion are emptied (as if the week had been started again).
 */
function applyPlanDeletion(p: Plan, deletedAt: number | undefined): Plan | null {
  if (deletedAt === undefined) return p;
  const t = planTimes(p);
  const days = Object.keys(p?.days || {});
  const alive = t.head > deletedAt || days.some((d) => t.day(d) > deletedAt);
  if (!alive) return null;
  if (t.head > deletedAt && DAY_ORDER.every((d) => days.includes(d) && t.day(d) > deletedAt)) return p;
  const outDays: Record<string, unknown> = {};
  const dayModifiedAt: Record<string, number> = {};
  for (const d of dayOrder([...DAY_ORDER, ...days])) {
    if (days.includes(d) && t.day(d) > deletedAt) {
      outDays[d] = p.days?.[d];
      dayModifiedAt[d] = t.day(d);
    } else {
      outDays[d] = emptyDay(p.startDate, d);
      dayModifiedAt[d] = deletedAt;
    }
  }
  const headAlive = t.head > deletedAt;
  const head = headAlive
    ? planHead(p)
    : { id: `plan-${p.startDate}`, startDate: p.startDate, status: 'not_started', isCurrent: false };
  const out: Plan = {
    ...head,
    days: outDays,
    dayModifiedAt,
    headModifiedAt: headAlive ? t.head : deletedAt,
    lastModifiedAt: ts(p),
  };
  if (p.lastModifiedBy !== undefined) out.lastModifiedBy = p.lastModifiedBy;
  return out;
}

/**
 * A local edit to one week, applied to the latest copy: only the days (and week details) the
 * edit changed are taken from it. Null if it changed nothing that matters.
 */
function applyPlanEdit(cur: Plan | undefined, before: Plan | undefined, item: Plan, stamp: number): Plan | null {
  if (!before || !cur) {
    const dayModifiedAt: Record<string, number> = {};
    for (const d of Object.keys(item?.days || {})) dayModifiedAt[d] = stamp;
    return { ...item, dayModifiedAt, headModifiedAt: stamp, lastModifiedAt: stamp };
  }
  const ct = planTimes(cur);
  const days: Record<string, unknown> = { ...(cur.days || {}) };
  const dayModifiedAt: Record<string, number> = {};
  for (const d of Object.keys(days)) dayModifiedAt[d] = ct.day(d);
  let touched = false;
  for (const d of new Set([...Object.keys(before.days || {}), ...Object.keys(item.days || {})])) {
    if (same(before.days?.[d], item.days?.[d])) continue;
    touched = true;
    if (item.days?.[d] === undefined) {
      delete days[d];
      delete dayModifiedAt[d];
    } else {
      days[d] = item.days?.[d];
      dayModifiedAt[d] = stamp;
    }
  }
  const hb = planHead(before);
  const hi = planHead(item);
  const head = planHead(cur);
  let headChanged = false;
  for (const k of new Set([...Object.keys(hb), ...Object.keys(hi)])) {
    if (same(hb[k], hi[k])) continue;
    headChanged = true;
    if (hi[k] === undefined) delete head[k];
    else head[k] = hi[k];
  }
  if (!touched && !headChanged) return null;
  const out: Plan = {
    ...head,
    days,
    dayModifiedAt,
    headModifiedAt: headChanged ? stamp : ct.head,
    lastModifiedAt: stamp,
  };
  const by = item.lastModifiedBy ?? cur.lastModifiedBy;
  if (by !== undefined) out.lastModifiedBy = by;
  return out;
}

// ---------------------------------------------------------------------------
// Staples, favourites and past shops, item by item
// ---------------------------------------------------------------------------

interface PrefListSpec {
  /** Items can be objects (a staple) or plain text ("not a staple"), or anything an old app wrote. */
  key: (item: unknown) => string | undefined;
  /**
   * The list's order. It has to come from the items themselves (not from either phone's list)
   * so that merging in any order, any number of times, gives the same list on both phones.
   */
  sort: (a: unknown, b: unknown) => number;
}

const lower = (x: unknown) =>
  String(get(x, 'name') ?? '')
    .trim()
    .toLowerCase();
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
export const PREF_LISTS: Record<string, PrefListSpec> = {
  /** Staples: A to Z. */
  recurringItems: {
    key: (x) => (get(x, 'id') ? String(get(x, 'id')) : get(x, 'name') ? `n:${lower(x)}` : undefined),
    sort: (a, b) => cmp(lower(a), lower(b)) || cmp(String(get(a, 'id') ?? ''), String(get(b, 'id') ?? '')),
  },
  /** Favourites: A to Z. */
  favouriteItems: { key: (x) => (get(x, 'name') ? lower(x) : undefined), sort: (a, b) => cmp(lower(a), lower(b)) },
  /** Star ratings, one per recipe per person: in id order. */
  ratings: {
    key: (x) => (get(x, 'id') ? String(get(x, 'id')) : undefined),
    sort: (a, b) => cmp(String(get(a, 'id') ?? ''), String(get(b, 'id') ?? '')),
  },
  /** Things that aren't weekly staples: A to Z. */
  notStaples: { key: (x) => (typeof x === 'string' && x ? x : undefined), sort: (a, b) => cmp(String(a), String(b)) },
  /** Past shops: newest first. */
  shopHistory: {
    key: (x) => (get(x, 'id') ? String(get(x, 'id')) : undefined),
    sort: (a, b) =>
      cmp(String(get(b, 'date') ?? ''), String(get(a, 'date') ?? '')) ||
      cmp(String(get(a, 'id') ?? ''), String(get(b, 'id') ?? '')),
  },
};
const prefItemKey = (field: string, key: string) => `${field}:${key}`;
const prefTombstoneKey = (field: string, key: string) => `pref.${field}:${key}`;

function listByKey(spec: PrefListSpec, list: unknown): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const item of Array.isArray(list) ? list : []) {
    const k = spec.key(item);
    if (k !== undefined && !m.has(k)) m.set(k, item);
  }
  return m;
}

const prefItemTime = (meta: SyncMeta, field: string, key: string) =>
  meta.prefItemModifiedAt?.[prefItemKey(field, key)] ?? settingTime(meta, field);

const finishPrefList = (spec: PrefListSpec, list: unknown[]): unknown[] => list.slice().sort(spec.sort);

/** Merge one of those lists; records each kept item's time in `times`. */
function mergePrefList(
  field: string,
  listA: unknown,
  ma: SyncMeta,
  listB: unknown,
  mb: SyncMeta,
  tombstones: Record<string, number>,
  times: Record<string, number>,
): unknown[] | undefined {
  if (listA === undefined && listB === undefined) return undefined;
  const spec = PREF_LISTS[field];
  const A = listByKey(spec, listA);
  const B = listByKey(spec, listB);
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const k of [...A.keys(), ...B.keys()]) {
    if (seen.has(k)) continue;
    seen.add(k);
    const va = A.get(k);
    const vb = B.get(k);
    const xa = prefItemTime(ma, field, k);
    const xb = prefItemTime(mb, field, k);
    let value: unknown;
    let time: number;
    if (va === undefined) {
      value = vb;
      time = xb;
    } else if (vb === undefined) {
      value = va;
      time = xa;
    } else {
      value = newer(va, xa, vb, xb);
      time = Math.max(xa, xb);
    }
    const deletedAt = tombstones[prefTombstoneKey(field, k)];
    if (deletedAt !== undefined && time <= deletedAt) continue;
    out.push(value);
    // Always recorded, so an item's time doesn't change when the list's own time does.
    times[prefItemKey(field, k)] = time;
  }
  return finishPrefList(spec, out);
}

/** A local edit to one of those lists, applied to the latest copy item by item. */
function applyPrefListEdit(
  field: string,
  baseList: unknown,
  nextList: unknown,
  curList: unknown,
  meta: SyncMeta,
  now: number,
): unknown[] {
  const spec = PREF_LISTS[field];
  const bm = listByKey(spec, baseList);
  const nm = listByKey(spec, nextList);
  const cm = listByKey(spec, curList);
  const times = meta.prefItemModifiedAt!;
  const changed = new Set<string>();
  for (const [k, item] of nm) {
    const before = bm.get(k);
    if (before !== undefined && same(before, item)) continue;
    changed.add(k);
    times[prefItemKey(field, k)] = Math.max(
      now,
      prefItemTime(meta, field, k) + 1,
      (meta.tombstones[prefTombstoneKey(field, k)] || 0) + 1,
    );
  }
  const removed = new Set<string>();
  for (const k of bm.keys()) {
    if (nm.has(k)) continue;
    removed.add(k);
    const tk = prefTombstoneKey(field, k);
    meta.tombstones[tk] = Math.max(now, prefItemTime(meta, field, k) + 1, meta.tombstones[tk] || 0);
    delete times[prefItemKey(field, k)];
  }
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const [k, item] of nm) {
    seen.add(k);
    if (changed.has(k)) out.push(item);
    else if (cm.has(k)) out.push(cm.get(k));
    // else: deleted on the other phone meanwhile, and this edit didn't touch it
  }
  for (const [k, item] of cm) {
    if (seen.has(k) || removed.has(k)) continue;
    out.push(item); // added on the other phone since this screen last refreshed
  }
  return finishPrefList(spec, out);
}

/** Drop old tombstones. The cut-off comes from the data itself, so both phones prune identically. */
function pruneTombstones(state: AppState | Fields, tombstones: Record<string, number>): Record<string, number> {
  let newest = 0;
  for (const t of Object.values(tombstones)) newest = Math.max(newest, t);
  for (const col of COLLECTIONS) {
    for (const item of listOf(state, col.name) || []) newest = Math.max(newest, ts(item));
  }
  const cutoff = newest - TOMBSTONE_RETENTION_MS;
  const kept: Record<string, number> = {};
  for (const [k, t] of Object.entries(tombstones)) {
    if (t >= cutoff) kept[k] = t;
  }
  return kept;
}

/** Combine two copies of the app data. Used when a phone downloads the other phone's changes. */
export function mergeAppStates(a: AppState, b: AppState): AppState {
  const ma = getSyncMeta(a);
  const mb = getSyncMeta(b);

  const tombstones: Record<string, number> = { ...ma.tombstones };
  for (const [k, t] of Object.entries(mb.tombstones)) {
    tombstones[k] = Math.max(tombstones[k] || 0, t);
  }

  const out: Fields = {};
  for (const col of COLLECTIONS) {
    const listA = listOf(a, col.name);
    const listB = listOf(b, col.name);
    if (listA === undefined && listB === undefined) {
      out[col.name] = col.name === 'groceryDatabase' ? undefined : [];
      continue;
    }
    const map = new Map<string, Item>();
    const order: string[] = [];
    const consider = (item: Item) => {
      const k = col.key(item);
      if (k === undefined || k === null) return;
      const existing = map.get(k);
      if (existing === undefined) {
        map.set(k, item);
        order.push(k);
      } else if (col.name === 'mealPlans') {
        map.set(k, mergePlans(existing as Plan, item as Plan));
      } else {
        map.set(k, newer(existing, ts(existing), item, ts(item)));
      }
    };
    (listA || []).forEach(consider);
    (listB || []).forEach(consider);
    out[col.name] = order
      .map((k) => {
        const item = map.get(k) as Item;
        const deletedAt = tombstones[tombstoneKey(col.name, k)];
        if (col.name === 'mealPlans') return applyPlanDeletion(item as Plan, deletedAt);
        return deletedAt === undefined || ts(item) > deletedAt ? item : null;
      })
      .filter((item) => item !== null);
  }

  // Settings: newest wins, one setting at a time.
  let preferences = a?.preferences as Fields | undefined;
  let preferencesModifiedAt = ma.preferencesModifiedAt ?? 0;
  const preferencesFieldModifiedAt: Record<string, number> = {};
  const prefItemModifiedAt: Record<string, number> = {};
  if (a?.preferences === undefined) {
    preferences = b?.preferences as Fields | undefined;
    preferencesModifiedAt = mb.preferencesModifiedAt ?? 0;
    Object.assign(preferencesFieldModifiedAt, mb.preferencesFieldModifiedAt);
    Object.assign(prefItemModifiedAt, mb.prefItemModifiedAt);
  } else if (b?.preferences === undefined) {
    Object.assign(preferencesFieldModifiedAt, ma.preferencesFieldModifiedAt);
    Object.assign(prefItemModifiedAt, ma.prefItemModifiedAt);
  } else {
    const pa = a.preferences as unknown as Fields;
    const pb = b.preferences as unknown as Fields;
    const combined: Fields = {};
    preferences = combined;
    preferencesModifiedAt = Math.max(ma.preferencesModifiedAt ?? 0, mb.preferencesModifiedAt ?? 0);
    const keys = new Set([
      ...Object.keys(pa),
      ...Object.keys(pb),
      ...Object.keys(ma.preferencesFieldModifiedAt || {}),
      ...Object.keys(mb.preferencesFieldModifiedAt || {}),
    ]);
    for (const k of keys) {
      const ta = settingTime(ma, k);
      const tb = settingTime(mb, k);
      if (PREF_LISTS[k]) {
        const list = mergePrefList(k, pa[k], ma, pb[k], mb, tombstones, prefItemModifiedAt);
        if (list !== undefined) combined[k] = list;
        if (ma.preferencesFieldModifiedAt?.[k] !== undefined || mb.preferencesFieldModifiedAt?.[k] !== undefined) {
          preferencesFieldModifiedAt[k] = Math.max(ta, tb);
        }
        continue;
      }
      let fromA: boolean;
      if (ta !== tb) fromA = ta > tb;
      else if ((pa[k] === undefined) !== (pb[k] === undefined))
        fromA = pa[k] !== undefined; // a value beats no value
      else fromA = stableStringify(pa[k] ?? null) >= stableStringify(pb[k] ?? null);
      const value = fromA ? pa[k] : pb[k];
      if (value !== undefined) combined[k] = value;
      if (ma.preferencesFieldModifiedAt?.[k] !== undefined || mb.preferencesFieldModifiedAt?.[k] !== undefined) {
        preferencesFieldModifiedAt[k] = Math.max(ta, tb);
      }
    }
  }

  // Grocery overrides: newest wins per grocery item.
  const oa = a?.groceryOverrides || {};
  const ob = b?.groceryOverrides || {};
  const groceryOverrides: Fields = {};
  const overridesModifiedAt: Record<string, number> = {};
  for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) {
    const ta = ma.overridesModifiedAt?.[k] || 0;
    const tb = mb.overridesModifiedAt?.[k] || 0;
    let value: unknown;
    let time: number;
    if (!(k in oa)) {
      value = ob[k];
      time = tb;
    } else if (!(k in ob)) {
      value = oa[k];
      time = ta;
    } else {
      value = newer(oa[k], ta, ob[k], tb);
      time = Math.max(ta, tb);
    }
    const deletedAt = tombstones[tombstoneKey('groceryOverrides', k)];
    if (deletedAt !== undefined && time <= deletedAt) continue;
    groceryOverrides[k] = value;
    if (time) overridesModifiedAt[k] = time;
  }

  const merged = asState({
    recipes: out.recipes,
    mealPlans: out.mealPlans,
    batches: out.batches,
    shoppingList: out.shoppingList,
    preferences,
    groceryDatabase: out.groceryDatabase,
    groceryOverrides,
  });
  merged.syncMeta = {
    tombstones: pruneTombstones(merged, tombstones),
    preferencesModifiedAt,
    preferencesFieldModifiedAt,
    overridesModifiedAt,
    prefItemModifiedAt,
  };
  return merged;
}

/**
 * Apply a local edit on top of the latest data.
 *
 * `base` is the data the screen was showing when the edit was made and `next`
 * is the result of the edit. Only the differences between the two are applied
 * to `current` (which may already include changes just downloaded from the
 * other phone), so an edit can never undo changes it didn't touch.
 */
export function applyLocalChange(current: AppState, base: AppState, next: AppState, now: number): AppState {
  const meta = getSyncMeta(current);
  const out: Fields = { ...current };

  for (const col of COLLECTIONS) {
    const baseList = listOf(base, col.name) || [];
    const nextList = listOf(next, col.name) || [];
    if (base?.[col.name] === next?.[col.name]) continue; // collection not touched by this edit
    const curList = listOf(current, col.name) || [];

    const byKey = (list: Item[]) => {
      const m = new Map<string, Item>();
      for (const item of list) {
        const k = col.key(item);
        if (k !== undefined && k !== null) m.set(k, item);
      }
      return m;
    };
    const baseMap = byKey(baseList);
    const nextMap = byKey(nextList);
    const curMap = byKey(curList);

    const changed = new Map<string, Item>();
    for (const [k, item] of nextMap) {
      const before = baseMap.get(k);
      if (before === undefined || !same(before, item)) {
        // Must be newer than the version it replaces and than any earlier deletion of it.
        const stamp = Math.max(
          now,
          ts(curMap.get(k)) + 1,
          ts(item),
          (meta.tombstones[tombstoneKey(col.name, k)] || 0) + 1,
        );
        if (col.name === 'mealPlans') {
          const edited = applyPlanEdit(
            curMap.get(k) as Plan | undefined,
            before as Plan | undefined,
            item as Plan,
            stamp,
          );
          if (edited) changed.set(k, edited);
          continue;
        }
        changed.set(k, { ...item, lastModifiedAt: stamp });
      }
    }
    const removed: string[] = [];
    for (const k of baseMap.keys()) {
      if (!nextMap.has(k)) removed.push(k);
    }

    const result: Item[] = [];
    const seen = new Set<string>();
    for (const item of nextList) {
      const k = col.key(item);
      if (k === undefined || k === null || seen.has(k)) continue;
      seen.add(k);
      if (changed.has(k)) result.push(changed.get(k) as Item);
      else if (curMap.has(k)) result.push(curMap.get(k) as Item);
      // else: untouched by this edit but deleted on the other phone meanwhile; keep it deleted.
    }
    const removedSet = new Set(removed);
    for (const item of curList) {
      const k = col.key(item);
      if (k === undefined || k === null || seen.has(k) || removedSet.has(k)) continue;
      seen.add(k);
      result.push(item); // added on the other phone since this screen last refreshed
    }
    for (const k of removed) {
      const tk = tombstoneKey(col.name, k);
      meta.tombstones[tk] = Math.max(now, ts(curMap.get(k)) + 1, meta.tombstones[tk] || 0);
    }
    // Nothing actually changed (e.g. the screen re-saved an identical list): keep the existing list.
    if (removed.length === 0 && result.length === curList.length && result.every((item, i) => item === curList[i])) {
      continue;
    }
    out[col.name] = result;
  }

  // Preferences: apply only the settings this edit changed.
  if (base?.preferences !== next?.preferences && !same(base?.preferences, next?.preferences)) {
    const bp = (base?.preferences || {}) as Fields;
    const np = (next?.preferences || {}) as Fields;
    const prefs: Fields = { ...(current?.preferences || {}) };
    const fieldTimes = meta.preferencesFieldModifiedAt!;
    for (const k of new Set([...Object.keys(bp), ...Object.keys(np)])) {
      if (!same(bp[k], np[k])) {
        if (PREF_LISTS[k]) prefs[k] = applyPrefListEdit(k, bp[k], np[k], prefs[k], meta, now);
        else if (np[k] === undefined) delete prefs[k];
        else prefs[k] = np[k];
        fieldTimes[k] = Math.max(now, settingTime(meta, k) + 1);
      }
    }
    out.preferences = prefs;
  }

  // Grocery overrides: per item.
  if (base?.groceryOverrides !== next?.groceryOverrides) {
    const bo: Fields = base?.groceryOverrides || {};
    const no: Fields = next?.groceryOverrides || {};
    const overrides: Fields = { ...(current?.groceryOverrides || {}) };
    const times = meta.overridesModifiedAt!;
    for (const k of new Set([...Object.keys(bo), ...Object.keys(no)])) {
      if (same(bo[k], no[k])) continue;
      const stamp = Math.max(now, (times[k] || 0) + 1, (meta.tombstones[tombstoneKey('groceryOverrides', k)] || 0) + 1);
      if (no[k] === undefined) {
        delete overrides[k];
        delete times[k];
        meta.tombstones[tombstoneKey('groceryOverrides', k)] = stamp;
      } else {
        overrides[k] = no[k];
        times[k] = stamp;
      }
    }
    out.groceryOverrides = overrides;
  }

  meta.tombstones = pruneTombstones(out, meta.tombstones);
  out.syncMeta = meta;
  return asState(out);
}

/**
 * Before this phone merges in data downloaded from the Gist: drop grocery items
 * that are only this phone's built-in defaults (stamped -1) and that the shared
 * list doesn't have. Otherwise a new phone would bring back items the household
 * deleted or merged before deletions were tracked. (Kept out of mergeAppStates
 * so that merging stays order-independent.)
 */
export function dropDefaultsMissingFrom(local: AppState, remote: AppState | null | undefined): AppState {
  const remoteList = remote?.groceryDatabase;
  if (!Array.isArray(remoteList) || remoteList.length === 0 || !Array.isArray(local.groceryDatabase)) return local;
  const remoteIds = new Set(remoteList.map((g) => g.id));
  const kept = local.groceryDatabase.filter((g) => ts(g) >= 0 || remoteIds.has(g.id));
  return kept.length === local.groceryDatabase.length ? local : { ...local, groceryDatabase: kept };
}

/** True when two copies hold the same data (ignoring the order of lists). */
export function statesEqual(a: AppState | null | undefined, b: AppState | null | undefined): boolean {
  return canonicalString(a) === canonicalString(b);
}

function canonicalString(state: AppState | null | undefined): string {
  const meta = getSyncMeta(state);
  const obj: Fields = {};
  for (const col of COLLECTIONS) {
    const list = (listOf(state, col.name) || []).slice();
    list.sort((x, y) => {
      const kx = String(col.key(x));
      const ky = String(col.key(y));
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    obj[col.name] = list;
  }
  obj.preferences = state?.preferences ?? null;
  obj.groceryOverrides = state?.groceryOverrides || {};
  obj.meta = {
    t: meta.tombstones,
    p: meta.preferencesModifiedAt ?? 0,
    pf: meta.preferencesFieldModifiedAt || {},
    o: meta.overridesModifiedAt || {},
    pi: meta.prefItemModifiedAt || {},
  };
  return stableStringify(obj);
}

/**
 * Shopping items that were generated from a meal plan or staples list and then
 * removed by either of you, so they aren't automatically added back.
 */
export function getDismissedShoppingIds(state: AppState): string[] {
  const live = new Set((state.shoppingList || []).map((i) => i.id));
  const prefix = 'shoppingList:';
  return Object.keys(getSyncMeta(state).tombstones)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((id) => (id.startsWith('plan-') || id.startsWith('recurring-')) && !live.has(id))
    .sort();
}

/** Record items as removed (used once to carry over the old per-phone "removed" list). */
export function addTombstones(state: AppState, collection: CollectionName, keys: string[], now: number): AppState {
  if (keys.length === 0) return state;
  const meta = getSyncMeta(state);
  for (const k of keys) {
    const tk = tombstoneKey(collection, k);
    meta.tombstones[tk] = Math.max(meta.tombstones[tk] || 0, now);
  }
  return { ...state, syncMeta: meta };
}

/**
 * For a phone that hasn't synced for longer than deletions are remembered: only what was
 * changed on it since it last synced. Merging that into the shared copy keeps those changes
 * without bringing back things the other phone deleted meanwhile.
 */
export function keepOnlyChangesSince(state: AppState, since: number): AppState {
  const meta = getSyncMeta(state);
  const out: Fields = { ...state };
  for (const col of COLLECTIONS) {
    const list = listOf(state, col.name);
    if (Array.isArray(list)) out[col.name] = list.filter((item) => ts(item) > since);
  }
  if (state.preferences) {
    const prefs: Fields = { ...state.preferences };
    for (const field of Object.keys(PREF_LISTS)) {
      const list = prefs[field];
      if (!Array.isArray(list)) continue;
      const spec = PREF_LISTS[field];
      prefs[field] = list.filter((item) => {
        const k = spec.key(item);
        return k !== undefined && prefItemTime(meta, field, k) > since;
      });
    }
    out.preferences = prefs;
  }
  const overrides: Fields = {};
  for (const [k, v] of Object.entries(state.groceryOverrides || {})) {
    if ((meta.overridesModifiedAt?.[k] || 0) > since) overrides[k] = v;
  }
  out.groceryOverrides = overrides;
  const tombstones: Record<string, number> = {};
  for (const [k, t] of Object.entries(meta.tombstones)) if (t > since) tombstones[k] = t;
  out.syncMeta = { ...meta, tombstones };
  return asState(out);
}
