/**
 * Merge logic that lets two phones edit the same data safely.
 *
 * Rules:
 *  - Every recipe, meal plan, freezer batch, shopping item and grocery item
 *    carries `lastModifiedAt`. When both phones have a version, the newer wins.
 *  - Deleting something leaves a "tombstone" (collection:key -> time). An item
 *    is only kept if it was changed *after* it was deleted, so deletions stick.
 *  - Preferences and grocery overrides carry their own timestamps in syncMeta.
 *  - mergeAppStates is order-independent and repeatable (merging twice changes
 *    nothing), so both phones always end up with the same data.
 */
import { AppState, SyncMeta } from '../types';

type CollectionName = 'recipes' | 'mealPlans' | 'batches' | 'shoppingList' | 'groceryDatabase';

interface CollectionSpec {
  name: CollectionName;
  key: (item: any) => string | undefined;
}

export const COLLECTIONS: CollectionSpec[] = [
  { name: 'recipes', key: (r) => r?.id },
  { name: 'mealPlans', key: (p) => p?.startDate },
  { name: 'batches', key: (b) => b?.id },
  { name: 'shoppingList', key: (i) => i?.id },
  { name: 'groceryDatabase', key: (g) => g?.id },
];

/** Tombstones older than this (relative to the newest change in the data) are forgotten. */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

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
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

const same = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b);

export function getSyncMeta(state: Partial<AppState> | null | undefined): SyncMeta {
  const meta = state?.syncMeta;
  return {
    tombstones: { ...(meta?.tombstones || {}) },
    preferencesModifiedAt: meta?.preferencesModifiedAt || 0,
    overridesModifiedAt: { ...(meta?.overridesModifiedAt || {}) },
  };
}

const ts = (item: any): number => (typeof item?.lastModifiedAt === 'number' ? item.lastModifiedAt : 0);

/** Pick the newer of two versions; ties are broken by content so the result never depends on order. */
function newer<T>(a: T, aTime: number, b: T, bTime: number): T {
  if (a === b) return a;
  if (aTime !== bTime) return aTime > bTime ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

/** Drop old tombstones. The cut-off comes from the data itself, so both phones prune identically. */
function pruneTombstones(state: AppState, tombstones: Record<string, number>): Record<string, number> {
  let newest = 0;
  for (const t of Object.values(tombstones)) newest = Math.max(newest, t);
  for (const col of COLLECTIONS) {
    for (const item of (state[col.name] as any[]) || []) newest = Math.max(newest, ts(item));
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

  const out: any = {};
  for (const col of COLLECTIONS) {
    const listA = (a?.[col.name] as any[] | undefined);
    const listB = (b?.[col.name] as any[] | undefined);
    if (listA === undefined && listB === undefined) {
      out[col.name] = col.name === 'groceryDatabase' ? undefined : [];
      continue;
    }
    const map = new Map<string, any>();
    const order: string[] = [];
    const consider = (item: any) => {
      const k = col.key(item);
      if (k === undefined || k === null) return;
      const existing = map.get(k);
      if (existing === undefined) {
        map.set(k, item);
        order.push(k);
      } else {
        map.set(k, newer(existing, ts(existing), item, ts(item)));
      }
    };
    (listA || []).forEach(consider);
    (listB || []).forEach(consider);
    out[col.name] = order
      .map((k) => map.get(k))
      .filter((item) => {
        const deletedAt = tombstones[tombstoneKey(col.name, col.key(item)!)];
        return deletedAt === undefined || ts(item) > deletedAt;
      });
  }

  // Preferences: newest whole set wins.
  let preferences = a?.preferences;
  let preferencesModifiedAt = ma.preferencesModifiedAt || 0;
  if (a?.preferences === undefined) {
    preferences = b?.preferences;
    preferencesModifiedAt = mb.preferencesModifiedAt || 0;
  } else if (b?.preferences !== undefined) {
    preferences = newer(a.preferences, ma.preferencesModifiedAt || 0, b.preferences, mb.preferencesModifiedAt || 0);
    preferencesModifiedAt = Math.max(ma.preferencesModifiedAt || 0, mb.preferencesModifiedAt || 0);
  }

  // Grocery overrides: newest wins per grocery item.
  const oa = a?.groceryOverrides || {};
  const ob = b?.groceryOverrides || {};
  const groceryOverrides: Record<string, any> = {};
  const overridesModifiedAt: Record<string, number> = {};
  for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) {
    const ta = ma.overridesModifiedAt?.[k] || 0;
    const tb = mb.overridesModifiedAt?.[k] || 0;
    let value: any;
    let time: number;
    if (!(k in oa)) { value = ob[k]; time = tb; }
    else if (!(k in ob)) { value = oa[k]; time = ta; }
    else { value = newer(oa[k], ta, ob[k], tb); time = Math.max(ta, tb); }
    const deletedAt = tombstones[tombstoneKey('groceryOverrides', k)];
    if (deletedAt !== undefined && time <= deletedAt) continue;
    groceryOverrides[k] = value;
    if (time) overridesModifiedAt[k] = time;
  }

  const merged: AppState = {
    recipes: out.recipes,
    mealPlans: out.mealPlans,
    batches: out.batches,
    shoppingList: out.shoppingList,
    preferences,
    groceryDatabase: out.groceryDatabase,
    groceryOverrides,
  };
  merged.syncMeta = {
    tombstones: pruneTombstones(merged, tombstones),
    preferencesModifiedAt,
    overridesModifiedAt,
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
  const out: any = { ...current };

  for (const col of COLLECTIONS) {
    const baseList = (base?.[col.name] as any[]) || [];
    const nextList = (next?.[col.name] as any[]) || [];
    if (base?.[col.name] === next?.[col.name]) continue; // collection not touched by this edit
    const curList = (current?.[col.name] as any[]) || [];

    const byKey = (list: any[]) => {
      const m = new Map<string, any>();
      for (const item of list) {
        const k = col.key(item);
        if (k !== undefined && k !== null) m.set(k, item);
      }
      return m;
    };
    const baseMap = byKey(baseList);
    const nextMap = byKey(nextList);
    const curMap = byKey(curList);

    const changed = new Map<string, any>();
    for (const [k, item] of nextMap) {
      const before = baseMap.get(k);
      if (before === undefined || !same(before, item)) {
        // Must be newer than the version it replaces and than any earlier deletion of it.
        const stamp = Math.max(
          now,
          ts(curMap.get(k)) + 1,
          ts(item),
          (meta.tombstones[tombstoneKey(col.name, k)] || 0) + 1
        );
        changed.set(k, { ...item, lastModifiedAt: stamp });
      }
    }
    const removed: string[] = [];
    for (const k of baseMap.keys()) {
      if (!nextMap.has(k)) removed.push(k);
    }

    const result: any[] = [];
    const seen = new Set<string>();
    for (const item of nextList) {
      const k = col.key(item);
      if (k === undefined || k === null || seen.has(k)) continue;
      seen.add(k);
      if (changed.has(k)) result.push(changed.get(k));
      else if (curMap.has(k)) result.push(curMap.get(k));
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
    const bp: any = base?.preferences || {};
    const np: any = next?.preferences || {};
    const prefs: any = { ...(current?.preferences || {}) };
    for (const k of new Set([...Object.keys(bp), ...Object.keys(np)])) {
      if (!same(bp[k], np[k])) {
        if (np[k] === undefined) delete prefs[k];
        else prefs[k] = np[k];
      }
    }
    out.preferences = prefs;
    meta.preferencesModifiedAt = Math.max(now, (meta.preferencesModifiedAt || 0) + 1);
  }

  // Grocery overrides: per item.
  if (base?.groceryOverrides !== next?.groceryOverrides) {
    const bo: any = base?.groceryOverrides || {};
    const no: any = next?.groceryOverrides || {};
    const overrides: any = { ...(current?.groceryOverrides || {}) };
    const times = meta.overridesModifiedAt!;
    for (const k of new Set([...Object.keys(bo), ...Object.keys(no)])) {
      if (same(bo[k], no[k])) continue;
      const stamp = Math.max(
        now,
        (times[k] || 0) + 1,
        (meta.tombstones[tombstoneKey('groceryOverrides', k)] || 0) + 1
      );
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
  return out as AppState;
}

/** True when two copies hold the same data (ignoring the order of lists). */
export function statesEqual(a: AppState | null | undefined, b: AppState | null | undefined): boolean {
  return canonicalString(a) === canonicalString(b);
}

function canonicalString(state: AppState | null | undefined): string {
  const meta = getSyncMeta(state);
  const obj: any = {};
  for (const col of COLLECTIONS) {
    const list = ((state?.[col.name] as any[]) || []).slice();
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
    p: meta.preferencesModifiedAt || 0,
    o: meta.overridesModifiedAt || {},
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
