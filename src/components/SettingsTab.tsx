import { useEffect, useMemo, useState } from 'react';
import Notice from './Notice';
import { ListOrdered, RotateCcw, Trophy, Package, History } from 'lucide-react';
import { MealPlan, UserPreferences, GroceryItem, DatabaseCleanAction } from '../types';
import { isPastWeek } from '../utils';
import { catalogForState } from '../shopping';
import { useDeviceIdentity } from '../hooks/useDeviceIdentity';
import { CleanDatabaseModal } from './CleanDatabaseModal';
import { AboutSection } from './settings/AboutSection';
import { BackupSection } from './settings/BackupSection';
import { HistoryPage } from './settings/HistoryPage';
import { Household } from './settings/Household';
import { RemindersSection } from './settings/RemindersSection';
import { NotificationsSection } from './settings/NotificationsSection';
import { ProductsPage } from './settings/ProductsPage';
import { SyncSection } from './settings/SyncSection';
import { ThisPhone } from './settings/ThisPhone';
import { NavRow, Sheet, card, sectionTitle } from './settings/parts';
import { Confirm, SettingsTabProps } from './settings/types';

/**
 * Settings on one page: this phone, household, sync, shopping, history, backup and the app's
 * version. Products and past weeks open as their own pages.
 */
export default function SettingsTab({ store, onNavigateTab, onOpenShopPanel }: SettingsTabProps) {
  const who = useDeviceIdentity();
  const prefs: UserPreferences = (store.state.preferences || {}) as UserPreferences;
  const [view, setView] = useState<'main' | 'products' | 'history'>('main');
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [cleaning, setCleaning] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string, undo?: () => void) => setToast({ text, undo });

  // Products: the one shared list the Shop uses (built-in products and yours).
  const productCatalog = catalogForState(store.state);
  const catalog = useMemo<GroceryItem[]>(() => productCatalog.products.map((p) => p.item), [productCatalog]);

  const applyClean = async (actions: DatabaseCleanAction[]) => {
    if (store.applyGroceryCleanActions) await store.applyGroceryCleanActions(actions);
  };

  const pastPlans: MealPlan[] = useMemo(
    () =>
      (store.state.mealPlans || [])
        .filter((p) => isPastWeek(p.startDate))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [store.state.mealPlans],
  );

  const body =
    view === 'products' ? (
      <ProductsPage
        store={store}
        onBack={() => setView('main')}
        onClean={() => setCleaning(true)}
        say={say}
        setConfirm={setConfirm}
      />
    ) : view === 'history' ? (
      <HistoryPage
        plans={pastPlans}
        store={store}
        onBack={() => setView('main')}
        say={say}
        setConfirm={setConfirm}
        onNavigateTab={onNavigateTab}
      />
    ) : (
      <div className="flex-1 overflow-y-auto" id="settings-scroll-container">
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24 space-y-5">
          <ThisPhone who={who} say={say} />
          <Household prefs={prefs} store={store} />
          <RemindersSection store={store} say={say} />
          <NotificationsSection store={store} who={who} say={say} />
          <SyncSection store={store} say={say} setConfirm={setConfirm} />
          <section data-settings-shopping>
            <h3 className={sectionTitle}>Shopping</h3>
            <div className={card}>
              <NavRow
                icon={<ListOrdered className="w-5 h-5" />}
                title="Arrange aisles"
                sub="The order you walk round your shop"
                onClick={() => onOpenShopPanel?.('aisles')}
                attr="aisles"
              />
              <NavRow
                icon={<RotateCcw className="w-5 h-5" />}
                title="Weekly staples"
                sub={
                  (prefs.recurringItems || [])
                    .map((x) => x.name)
                    .slice(0, 4)
                    .join(', ') || 'Things you buy every week'
                }
                onClick={() => onOpenShopPanel?.('staples')}
                attr="staples"
              />
              <NavRow
                icon={<Trophy className="w-5 h-5" />}
                title="Past shops"
                sub={
                  (prefs.shopHistory || []).length
                    ? `${(prefs.shopHistory || []).length} shops recorded`
                    : 'How long your shops take'
                }
                onClick={() => onOpenShopPanel?.('history')}
                attr="past-shops"
              />
              <NavRow
                icon={<Package className="w-5 h-5" />}
                title="Products"
                sub={`${catalog.length} products: how they're sold, which aisle, what uses them`}
                onClick={() => setView('products')}
                attr="products"
              />
            </div>
          </section>
          <section data-settings-history>
            <h3 className={sectionTitle}>History</h3>
            <div className={card}>
              <NavRow
                icon={<History className="w-5 h-5" />}
                title="Past weeks"
                sub={
                  pastPlans.length
                    ? `${pastPlans.length} ${pastPlans.length === 1 ? 'week' : 'weeks'}: what you ate, and copy one to a new week`
                    : 'Finished weeks appear here'
                }
                onClick={() => setView('history')}
                attr="past-weeks"
              />
            </div>
          </section>
          <BackupSection store={store} catalog={catalog} say={say} setConfirm={setConfirm} />
          <AboutSection />
        </div>
      </div>
    );

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      {view === 'main' && (
        <header className="app-bar border-b px-4 py-2.5 shrink-0">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-[15px] font-bold text-zinc-900">Settings</h2>
          </div>
        </header>
      )}
      {body}

      {toast && (
        <Notice
          text={toast.text}
          action={toast.undo ? { label: 'Undo', run: toast.undo } : undefined}
          onDone={() => setToast(null)}
        />
      )}

      {confirm && (
        <Sheet label={confirm.title} onClose={() => setConfirm(null)}>
          <div className="p-4" data-confirm>
            <h3 className="text-lg font-bold text-zinc-900">{confirm.title}</h3>
            <p className="text-[15px] text-zinc-700 mt-1 whitespace-pre-line">{confirm.body}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="flex-1 h-12 rounded-xl border border-zinc-300 font-semibold cursor-pointer"
                data-confirm-cancel
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = confirm.run;
                  setConfirm(null);
                  r();
                }}
                className={`flex-1 h-12 rounded-xl text-white font-semibold cursor-pointer ${confirm.danger ? 'bg-rose-600' : 'bg-emerald-600'}`}
                data-confirm-ok
              >
                {confirm.action}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      <CleanDatabaseModal
        isOpen={cleaning}
        onClose={() => setCleaning(false)}
        groceryItems={catalog}
        onApplyChanges={applyClean}
        showToast={(m: string) => say(m)}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
}
