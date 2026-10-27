/** What the Settings pages share: the store they're given, and the "Are you sure?" they ask. */
import { AppState, MealPlan, GroceryItem, DatabaseCleanAction, TabName } from '../../types';
import { type RemovedProduct } from '../../shopping';
import type { AppStore } from '../../store';

type ShopPanel = 'aisles' | 'staples' | 'history';
/** Settings' own tabs. */
export type SettingsSection = 'phone' | 'alerts' | 'household' | 'shopping' | 'sync';

/** "Are you sure?" before something that can't easily be undone. */
export type Confirm = { title: string; body: string; action: string; danger?: boolean; run: () => void };

export interface SettingsTabProps {
  store: {
    state: AppState;
    getState?: () => AppState;
    updatePreferences: AppStore['updatePreferences'];
    resetPreferences: () => void;
    updateMealPlan: (plan: MealPlan) => void;
    duplicatePlanToWeek: (sourcePlanId: string, targetStartDate: string) => void;
    clearPastWeeks: () => void;
    exportAllData: () => string;
    importAllData: (data: string) => boolean;
    updateGroceryDatabase?: (db: GroceryItem[]) => void;
    updateGroceryOverride?: (id: string, updates: Partial<GroceryItem>) => void;
    applyGroceryCleanActions?: (actions: DatabaseCleanAction[]) => Promise<void>;
    saveProduct?: (item: GroceryItem) => void;
    removeProduct?: (id: string) => RemovedProduct | null;
    restoreProduct?: (undo: RemovedProduct) => void;
    mergeProducts?: (keepId: string, goneId: string) => void;
    markProductsDifferent?: (aId: string, bId: string) => void;
    resetProducts?: () => void;
    replaceProducts?: (items: GroceryItem[]) => void;
    syncNotice?: string | null;
    clearSyncNotice?: () => void;
    githubConfig: { pat: string; gistId: string } | null;
    gistOwner: string | null;
    syncStatus: 'idle' | 'loading' | 'synced' | 'error';
    lastSynced: Date | null;
    syncError: string | null;
    syncPollSeconds?: number;
    saveGithubConfig: (pat: string, gistId: string, syncMode: 'pull' | 'push' | 'merge') => Promise<void>;
    createGistFromLocal: (pat: string) => Promise<string>;
    clearGithubConfig: () => void;
    manualSync: () => Promise<void>;
  };
  onNavigateTab?: (tab: TabName) => void;
  /** Open the Shop with one of its panels (aisles, staples, past shops). */
  onOpenShopPanel?: (panel: ShopPanel) => void;
  /** Open on one of Settings' tabs (asked from elsewhere, e.g. the sync warning's Fix). */
  openSection?: SettingsSection | null;
  onOpenSectionHandled?: () => void;
}
