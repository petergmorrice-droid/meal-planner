/** Changing products and settings, and backups (saved through the store's commit, like edits.ts). */
import { UserPreferences, GroceryItem, AppState, DatabaseCleanAction } from '../types';
import {
  catalogForState,
  normaliseProducts,
  saveProductIn,
  updateProductIn,
  removeProductIn,
  restoreProductIn,
  mergeProductsIn,
  markDifferentIn,
  resetProductsIn,
  replaceProductsIn,
  type RemovedProduct,
} from '../shopping';
import { DEFAULT_PREFERENCES, normalizeState } from './saved';
import type { StoreCore } from './edits';

/** Changes to products and settings, and backups. */
export function productEdits({ state, latest: newest, commit }: StoreCore) {
  const updateGroceryDatabase = async (dbDb: GroceryItem[]) => {
    commit(state, { ...state, groceryDatabase: dbDb });
  };

  // ---- Products: everything is in the one shared list ----
  /** Apply a change to the latest data (so two quick changes in one tap both count). */
  const editLatest = (change: (s: AppState) => AppState | null) => {
    const s = newest();
    const next = change(s);
    if (next && next !== s) commit(s, next);
  };

  /** Add a product or save changes to one. */
  const saveProduct = (item: GroceryItem) => editLatest((s) => saveProductIn(s, item));

  /** Change some details of a product (older screens call this; it writes to the shared list). */
  const updateGroceryOverride = async (id: string, updates: Partial<GroceryItem>) => {
    editLatest((s) => updateProductIn(s, id, updates));
  };

  /** Take a product off the list; returns what Undo needs. */
  const removeProduct = (id: string): RemovedProduct | null => {
    const s = newest();
    const r = removeProductIn(s, id);
    if (!r) return null;
    commit(s, r.next);
    return r.undo;
  };
  const restoreProduct = (undo: RemovedProduct) => editLatest((s) => restoreProductIn(s, undo));

  /** "Same as…": merge one product into another. */
  const mergeProducts = (keepId: string, goneId: string) =>
    editLatest((s) => mergeProductsIn(s, catalogForState(s), keepId, goneId));
  /** "Not the same": the tidy-up check stops pairing these two. */
  const markProductsDifferent = (aId: string, bId: string) => editLatest((s) => markDifferentIn(s, aId, bId));
  /** Back to the app's own products. */
  const resetProducts = () => editLatest(resetProductsIn);
  /** Products loaded from a file. */
  const replaceProducts = (items: GroceryItem[]) => editLatest((s) => replaceProductsIn(s, items));

  /** Gemini's tidy-up suggestions: merges, renames and new aisles. */
  const applyGroceryCleanActions = async (actions: DatabaseCleanAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;
    editLatest((start) => {
      let s = start;
      for (const action of actions) {
        const product = catalogForState(s).byId.get(action.primaryItemId)?.item;
        if (!product) continue;
        if (action.actionType === 'merge' && action.secondaryItemId) {
          s = mergeProductsIn(s, catalogForState(s), action.primaryItemId, action.secondaryItemId) || s;
        }
        const changes: Partial<GroceryItem> = {};
        if (action.newName && action.newName.trim() && action.newName.trim() !== product.name) {
          changes.name = action.newName.trim();
          const current = (s.groceryDatabase || []).find((g) => g.id === product.id) || product;
          changes.aliases = [...new Set([...(current.aliases || []), product.name])];
        }
        if (action.newAisle && action.newAisle.trim()) changes.category = action.newAisle.trim();
        if (Object.keys(changes).length) s = updateProductIn(s, product.id, changes);
      }
      return s;
    });
  };

  const getHydratedGroceryItem = (id: string): GroceryItem | undefined => catalogForState(newest()).byId.get(id)?.item;

  /**
   * Change settings. Pass a function to work out the change from the latest settings (adding
   * to a list such as ratings or past shops); return null to change nothing.
   */
  const updatePreferences = async (
    prefsOrChange: Partial<UserPreferences> | ((latest: UserPreferences) => Partial<UserPreferences> | null),
  ) => {
    const base = typeof prefsOrChange === 'function' ? newest() : state;
    const current = base.preferences || DEFAULT_PREFERENCES;
    const prefs = typeof prefsOrChange === 'function' ? prefsOrChange(current) : prefsOrChange;
    if (!prefs) return;
    commit(base, { ...base, preferences: { ...current, ...prefs } });
  };

  /** Settings back to how they started; keeps your staples, favourites, aisle order and shop history. */
  const resetPreferences = async () => {
    const keep = [
      'recurringItems',
      'favouriteItems',
      'aisleOrder',
      'shopRoute',
      'shopHistory',
      'catalogVersion',
      'ratings',
      'notStaples',
      'notProducts',
    ] as const;
    const kept: Partial<UserPreferences> = {};
    for (const k of keep) if (state.preferences?.[k] !== undefined) Object.assign(kept, { [k]: state.preferences[k] });
    commit(state, { ...state, preferences: { ...DEFAULT_PREFERENCES, ...kept } });
  };

  const exportAllData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importAllData = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        const s = newest();
        const next = normalizeState(parsed);
        commit(s, normaliseProducts(next, Date.now()));
        return true;
      }
    } catch (e) {
      console.error('Failed to import data', e);
    }
    return false;
  };

  return {
    updateGroceryDatabase,
    updateGroceryOverride,
    applyGroceryCleanActions,
    getHydratedGroceryItem,
    saveProduct,
    removeProduct,
    restoreProduct,
    mergeProducts,
    markProductsDifferent,
    resetProducts,
    replaceProducts,
    updatePreferences,
    resetPreferences,
    exportAllData,
    importAllData,
  };
}
