import React, { useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, ThemeId, applyTheme, savedTheme } from '../theme';
import { AisleIcon } from './AisleLook';
import Notice from './Notice';
import {
  Check, Copy, Download, Upload, Search, X, Plus, Minus, ChevronRight, ChevronLeft, Sparkles,
  RefreshCw, ListOrdered, RotateCcw, Trophy, Package, History, ThumbsUp, ThumbsDown, Trash2, Combine,
} from 'lucide-react';
import { parseClock, DEFAULT_EAT_AT } from '../cookInfo';
import { AppState, MealPlan, Recipe, UserPreferences, GroceryItem, DatabaseCleanAction } from '../types';
import { isPastWeek, formatDateISO, getMonday, DAYS_OF_WEEK, GROCERY_AISLES, orderedAisles } from '../utils';
import {
  catalogForState, productUsage, likelyDuplicates, hasNoAisle, isUnused, usageText, alsoCalled, withAlsoCalled,
  isBuiltInProduct, isAisleName, mergeSummary, productMatchesSearch, type Product, type RemovedProduct,
} from '../shopping';
import { useDeviceIdentity, setCurrentDeviceIdentity } from '../hooks/useDeviceIdentity';
import { CleanDatabaseModal } from './CleanDatabaseModal';
import { describeMeal, mealTitle } from './planner/DayListRow';
import { leftoverSourceDay } from '../planning';
import { formatWeekSpan } from '../shopList';
import { testGeminiKeyApi, getGeminiApiKey, saveGeminiApiKey, clearGeminiApiKey } from '../services/geminiService';
import { runningVersion, checkForUpdate, updateNow, builtText, UpdateCheck } from '../appVersion';
import { agoText, syncProblemText, backupSummary } from '../settingsInfo';

type TabName = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';
type ShopPanel = 'aisles' | 'staples' | 'history';

interface SettingsTabProps {
  store: {
    state: AppState;
    getState?: () => AppState;
    updatePreferences: (prefs: Partial<UserPreferences>) => void;
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
}

const LAST_BACKUP_KEY = 'last_backup_at';
const sectionTitle = 'text-[13px] font-bold uppercase tracking-wide text-zinc-500 px-1 mb-1.5';
const card = 'bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100';
const row = 'w-full px-4 py-3 flex items-center gap-3 text-left';

/**
 * Settings on one page: this phone, household, sync, shopping, history, backup and the app's
 * version. Products and past weeks open as their own pages.
 */
export default function SettingsTab({ store, onNavigateTab, onOpenShopPanel }: SettingsTabProps) {
  const who = useDeviceIdentity();
  const prefs: UserPreferences = (store.state.preferences || {}) as UserPreferences;
  const [view, setView] = useState<'main' | 'products' | 'history'>('main');
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: string; danger?: boolean; run: () => void } | null>(null);
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
    () => (store.state.mealPlans || []).filter((p) => isPastWeek(p.startDate)).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [store.state.mealPlans],
  );

  const body = view === 'products'
    ? <ProductsPage store={store} onBack={() => setView('main')} onClean={() => setCleaning(true)} say={say} setConfirm={setConfirm} />
    : view === 'history'
    ? <HistoryPage plans={pastPlans} store={store} onBack={() => setView('main')} say={say} setConfirm={setConfirm} onNavigateTab={onNavigateTab} />
    : (
      <div className="flex-1 overflow-y-auto" id="settings-scroll-container">
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24 space-y-5">
          <ThisPhone who={who} say={say} />
          <Household prefs={prefs} store={store} />
          <SyncSection store={store} say={say} setConfirm={setConfirm} />
          <section data-settings-shopping>
            <h3 className={sectionTitle}>Shopping</h3>
            <div className={card}>
              <NavRow icon={<ListOrdered className="w-5 h-5" />} title="Arrange aisles" sub="The order you walk round your shop" onClick={() => onOpenShopPanel?.('aisles')} attr="aisles" />
              <NavRow icon={<RotateCcw className="w-5 h-5" />} title="Weekly staples" sub={(prefs.recurringItems || []).map((x) => x.name).slice(0, 4).join(', ') || 'Things you buy every week'} onClick={() => onOpenShopPanel?.('staples')} attr="staples" />
              <NavRow icon={<Trophy className="w-5 h-5" />} title="Past shops" sub={(prefs.shopHistory || []).length ? `${(prefs.shopHistory || []).length} shops recorded` : 'How long your shops take'} onClick={() => onOpenShopPanel?.('history')} attr="past-shops" />
              <NavRow icon={<Package className="w-5 h-5" />} title="Products" sub={`${catalog.length} products: how they're sold, which aisle, what uses them`} onClick={() => setView('products')} attr="products" />
            </div>
          </section>
          <section data-settings-history>
            <h3 className={sectionTitle}>History</h3>
            <div className={card}>
              <NavRow icon={<History className="w-5 h-5" />} title="Past weeks" sub={pastPlans.length ? `${pastPlans.length} ${pastPlans.length === 1 ? 'week' : 'weeks'}: what you ate, and copy one to a new week` : 'Finished weeks appear here'} onClick={() => setView('history')} attr="past-weeks" />
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
          <div className="max-w-2xl mx-auto"><h2 className="text-[15px] font-bold text-zinc-900">Settings</h2></div>
        </header>
      )}
      {body}

      {toast && <Notice text={toast.text} action={toast.undo ? { label: 'Undo', run: toast.undo } : undefined} onDone={() => setToast(null)} />}

      {confirm && (
        <Sheet label={confirm.title} onClose={() => setConfirm(null)}>
          <div className="p-4" data-confirm>
            <h3 className="text-lg font-bold text-zinc-900">{confirm.title}</h3>
            <p className="text-[15px] text-zinc-700 mt-1 whitespace-pre-line">{confirm.body}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 h-12 rounded-xl border border-zinc-300 font-semibold cursor-pointer" data-confirm-cancel>Cancel</button>
              <button type="button" onClick={() => { const r = confirm.run; setConfirm(null); r(); }} className={`flex-1 h-12 rounded-xl text-white font-semibold cursor-pointer ${confirm.danger ? 'bg-rose-600' : 'bg-emerald-600'}`} data-confirm-ok>{confirm.action}</button>
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
        onNavigateTab={onNavigateTab as any}
      />
    </div>
  );
}

// ---------- Small parts ----------

function NavRow({ icon, title, sub, onClick, attr }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void; attr: string }) {
  return (
    <button type="button" onClick={onClick} className={`${row} cursor-pointer hover:bg-zinc-50`} data-setting-link={attr}>
      <span className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900">{title}</span>
        {sub && <span className="block text-[13px] text-zinc-500 truncate">{sub}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, attr }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; attr: string }) {
  return (
    <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200" data-segmented={attr}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`h-9 px-3 text-sm font-semibold rounded-lg cursor-pointer whitespace-nowrap ${value === o.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sheet({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div role="dialog" aria-label={label} className="bg-white w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {children}
      </div>
    </div>
  );
}

const SubHeader = ({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) => (
  <header className="bg-white border-b border-zinc-200/80 px-2 py-1.5 shrink-0">
    <div className="max-w-2xl mx-auto flex items-center gap-1">
      <button type="button" onClick={onBack} className="h-10 pl-1 pr-2 rounded-xl text-sm font-semibold text-zinc-600 inline-flex items-center cursor-pointer" data-settings-back><ChevronLeft className="w-5 h-5" />Settings</button>
      <h2 className="flex-1 text-center text-[15px] font-bold text-zinc-900 truncate pr-2">{title}</h2>
      <span className="min-w-[88px] flex justify-end">{right}</span>
    </div>
  </header>
);

// ---------- This phone ----------

/** Colour theme: four looks, each shown as a little screen. This phone only. */
function ThemeChooser({ say }: { say: (t: string) => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => savedTheme());
  return (
    <div className="px-4 py-3" data-setting-theme>
      <span className="block text-[15px] font-semibold text-zinc-900">Colour theme</span>
      <span className="block text-[13px] text-zinc-500 mb-2.5">Just this phone. Ticks, aisles and buttons keep their colours.</span>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => {
          const on = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTheme(t.id); applyTheme(t.id, true); say(`Colour theme: ${t.name}`); }}
              aria-pressed={on}
              className={`text-left rounded-xl border-2 p-1.5 cursor-pointer ${on ? 'border-emerald-600' : 'border-zinc-200'}`}
              data-theme-choice={t.id}
            >
              {/* A little screen in that theme (fixed colours, so each looks like itself) */}
              <span className="block rounded-lg overflow-hidden border border-black/5" style={{ background: t.page }} aria-hidden="true">
                <span className="block h-3.5" style={{ background: t.bar }} />
                <span className="flex gap-1 p-1.5">
                  <span className="h-2 flex-1 rounded-sm bg-white/90" />
                  <span className="h-2 w-5 rounded-sm" style={{ background: t.accent }} />
                </span>
                {t.id === 'tabs' && (
                  <span className="flex h-1.5">
                    {['#f59e0b', '#10b981', '#3b82f6', '#f97316', '#06b6d4'].map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 mt-1.5 px-0.5">
                <span className={`text-sm font-semibold ${on ? 'text-emerald-800' : 'text-zinc-900'}`}>{t.name}</span>
                {on && <Check className="w-3.5 h-3.5 text-emerald-700" />}
              </span>
              <span className="block text-[11px] text-zinc-500 px-0.5 leading-tight">{t.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThisPhone({ who, say }: { who: string; say: (t: string) => void }) {
  const [hasKey, setHasKey] = useState(() => !!getGeminiApiKey());
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; message?: string } | null>(null);
  const runTest = async (k: string) => {
    setTest({ busy: true });
    setTest(await testGeminiKeyApi(k));
  };
  return (
    <section data-settings-phone>
      <h3 className={sectionTitle}>This phone</h3>
      <div className={card}>
        <div className={row} data-setting-who>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Who's using this phone</span>
            <span className="block text-[13px] text-zinc-500">Shown on what you add and tick</span>
          </span>
          <Segmented value={who as 'P' | 'R'} options={[{ id: 'P', label: 'Peter' }, { id: 'R', label: 'Rachel' }]} onChange={(v) => { setCurrentDeviceIdentity(v); say(`This is ${v === 'P' ? "Peter's" : "Rachel's"} phone`); }} attr="who" />
        </div>
        <ThemeChooser say={say} />
        <div className="px-4 py-3" data-setting-gemini>
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-zinc-900">Gemini key</span>
              <span className={`block text-[13px] ${test && !test.busy ? (test.ok ? 'text-emerald-700' : 'text-rose-700') : 'text-zinc-500'}`} data-gemini-status>
                {test?.busy ? 'Checking…' : test?.message ? test.message : hasKey ? 'Saved on this phone' : 'Not added: needed for importing recipes and asking questions'}
              </span>
            </span>
            {!editing && hasKey && <button type="button" onClick={() => void runTest(getGeminiApiKey() || '')} disabled={test?.busy} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-50" data-gemini-test>Test it</button>}
            {!editing && <button type="button" onClick={() => { setEditing(true); setKey(''); setTest(null); }} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer" data-gemini-edit>{hasKey ? 'Change' : 'Add'}</button>}
          </div>
          {editing && (
            <div className="mt-3 space-y-2">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key (starts AIza…)" autoComplete="off"
                className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base outline-none focus:border-emerald-500" data-gemini-input aria-label="Gemini key" />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!key.trim()} onClick={() => { saveGeminiApiKey(key); setHasKey(true); setEditing(false); say('Gemini key saved'); void runTest(key); }} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 cursor-pointer" data-gemini-save>Save and test</button>
                <button type="button" onClick={() => setEditing(false)} className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer">Cancel</button>
                {hasKey && <button type="button" onClick={() => { clearGeminiApiKey(); setHasKey(false); setEditing(false); setTest(null); say('Gemini key removed from this phone'); }} className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer" data-gemini-remove>Remove</button>}
              </div>
              <p className="text-xs text-zinc-500">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a>. Each phone needs its own copy: it's kept only on this phone and never synced.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- Household ----------

function Household({ prefs, store }: { prefs: UserPreferences; store: SettingsTabProps['store'] }) {
  const people = prefs.defaultServings || 2;
  const appliance = (prefs.preferredCookingMethod || 'all') as 'all' | 'oven_hob' | 'ninja';
  return (
    <section data-settings-household>
      <h3 className={sectionTitle}>Household</h3>
      <div className={card}>
        <div className={row} data-setting-people>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Usually cooking for</span>
            <span className="block text-[13px] text-zinc-500">New meals start with this many people</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => store.updatePreferences({ defaultServings: Math.max(1, people - 1) })} disabled={people <= 1} className="w-10 h-10 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="One fewer person"><Minus className="w-4 h-4" /></button>
            <span className="w-8 text-center text-lg font-bold tabular-nums" data-people-count>{people}</span>
            <button type="button" onClick={() => store.updatePreferences({ defaultServings: Math.min(12, people + 1) })} className="w-10 h-10 rounded-xl border border-zinc-300 flex items-center justify-center cursor-pointer" aria-label="One more person"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <label className={row} data-setting-eat-at>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">We usually eat at</span>
            <span className="block text-[13px] text-zinc-500">The Cook tab says when to start. Change it for one evening there.</span>
          </span>
          <input id="setting-eat-at" type="time" value={parseClock(prefs.eatAt) !== null ? prefs.eatAt : DEFAULT_EAT_AT}
            onChange={(e) => { if (parseClock(e.target.value) !== null) store.updatePreferences({ eatAt: e.target.value }); }}
            className="h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold tabular-nums" data-setting-eat-at-input aria-label="We usually eat at" />
        </label>
        <div className="px-4 py-3" data-setting-appliance>
          <span className="block text-[15px] font-semibold text-zinc-900">Usual appliance</span>
          <span className="block text-[13px] text-zinc-500 mb-2">Cooking mode and start times use these steps when a recipe has both</span>
          <Segmented value={appliance} options={[{ id: 'oven_hob', label: 'Oven & hob' }, { id: 'ninja', label: 'Ninja' }, { id: 'all', label: 'Either' }]} onChange={(v) => store.updatePreferences({ preferredCookingMethod: v })} attr="appliance" />
        </div>
      </div>
    </section>
  );
}

// ---------- Sync ----------

function SyncSection({ store, say, setConfirm }: { store: SettingsTabProps['store']; say: (t: string) => void; setConfirm: (c: any) => void }) {
  const cfg = store.githubConfig;
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(iv); }, []);
  const [pat, setPat] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'merge' | 'pull' | 'push'>('merge');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const status = store.syncStatus;
  const problemNow = status === 'error' ? syncProblemText(store.syncError) : '';

  const connect = async () => {
    if (!pat.trim()) { setProblem('Paste the GitHub token first.'); return; }
    setBusy(true);
    setProblem('');
    try {
      if (code.trim()) await store.saveGithubConfig(pat, code, mode);
      else await store.createGistFromLocal(pat);
      say('Syncing is on');
      setPat(''); setCode('');
    } catch (e: any) {
      setProblem(syncProblemText(e?.message || String(e)));
    } finally { setBusy(false); }
  };

  return (
    <section data-settings-sync>
      <h3 className={sectionTitle}>Sync between phones</h3>
      <div className={card}>
        {cfg ? (
          <>
            <div className={row}>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status === 'error' ? 'bg-rose-500' : status === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900" data-sync-status>
                  {status === 'loading' ? 'Syncing…' : status === 'error' ? 'Not syncing right now' : store.lastSynced ? `Synced ${agoText(store.lastSynced)}` : 'Connected'}
                </span>
                <span className={`block text-[13px] ${problemNow ? 'text-rose-700' : 'text-zinc-500'}`} data-sync-detail>
                  {problemNow || `Changes go up straight away; the other phone's appear within about ${store.syncPollSeconds || 20} seconds.`}
                </span>
              </span>
              <button type="button" onClick={async () => { await store.manualSync(); say('Synced'); }} disabled={status === 'loading'} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0" data-sync-now>
                <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />Sync now
              </button>
            </div>
            {store.syncNotice && (
              <div className="px-4 py-3 flex items-start gap-3 bg-amber-50" data-sync-notice>
                <span className="flex-1 text-[13px] text-amber-900">{store.syncNotice}</span>
                <button type="button" onClick={() => store.clearSyncNotice?.()} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-amber-800 cursor-pointer" aria-label="Dismiss"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-zinc-500">Sync code (for the other phone)</span>
                <span className="block font-mono text-sm text-zinc-800 truncate" data-sync-code>{cfg.gistId}</span>
              </span>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(cfg.gistId).then(() => say('Sync code copied')).catch(() => say("Couldn't copy: select it and copy instead")); }} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"><Copy className="w-4 h-4" />Copy</button>
            </div>
            <button type="button" onClick={() => setConfirm({ title: 'Stop syncing on this phone?', body: "Everything stays on this phone, but changes won't go to or come from the other phone until you connect again.", action: 'Stop syncing', danger: true, run: () => { store.clearGithubConfig(); say('Syncing stopped on this phone'); } })}
              className={`${row} text-sm font-semibold text-rose-700 cursor-pointer`} data-sync-stop>Stop syncing on this phone</button>
          </>
        ) : (
          <div className="px-4 py-3 space-y-3" data-sync-setup>
            <p className="text-[15px] text-zinc-700">Both phones keep the same recipes, plans, lists and freezer through a private file on your GitHub account.</p>
            <ol className="text-sm text-zinc-700 list-decimal pl-5 space-y-1">
              <li>On github.com, make a token with only the <strong>gist</strong> permission (Settings → Developer settings → Personal access tokens).</li>
              <li>Paste it below.</li>
              <li>On the second phone, also paste the <strong>sync code</strong> shown on the first phone.</li>
            </ol>
            <input type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="GitHub token (ghp_…)" autoComplete="off" className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" aria-label="GitHub token" data-sync-token />
            <div>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Sync code from the other phone" className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" aria-label="Sync code" data-sync-code-input />
              <span className="block text-xs text-zinc-500 mt-1">Leave this empty on the first phone.</span>
            </div>
            <details className="text-sm text-zinc-600">
              <summary className="cursor-pointer font-semibold">Advanced: what if both have data?</summary>
              <div className="mt-2 space-y-1.5">
                {([['merge', 'Combine both (recommended)'], ['pull', "Use what's on GitHub (replace this phone's)"], ['push', "Use this phone's (replace what's on GitHub)"]] as const).map(([id, label]) => (
                  <label key={id} className="flex items-center gap-2"><input type="radio" name="sync-mode" checked={mode === id} onChange={() => setMode(id)} />{label}</label>
                ))}
              </div>
            </details>
            {problem && <p className="text-sm text-rose-700" data-sync-problem>{problem}</p>}
            <button type="button" onClick={() => void connect()} disabled={busy} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer" data-sync-connect>
              {busy ? 'Connecting…' : code.trim() ? 'Connect to the other phone' : 'Start syncing'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Backup ----------

function BackupSection({ store, catalog, say, setConfirm }: { store: SettingsTabProps['store']; catalog: GroceryItem[]; say: (t: string) => void; setConfirm: (c: any) => void }) {
  const [last, setLast] = useState<string | null>(() => { try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; } });
  const [restore, setRestore] = useState<{ name: string; text: string; parts: string[] } | null>(null);
  const [badFile, setBadFile] = useState('');
  const productsInput = useRef<HTMLInputElement>(null);

  const download = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const backup = () => {
    download(store.exportAllData(), `meal-planner-backup-${formatDateISO(new Date())}.json`);
    const now = new Date().toISOString();
    try { localStorage.setItem(LAST_BACKUP_KEY, now); } catch { /* fine */ }
    setLast(now);
    say('Backup downloaded');
  };
  const pickRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const s = backupSummary(text);
      if (!s.ok) { setBadFile(`“${file.name}” isn't a backup from this app.`); return; }
      setBadFile('');
      setRestore({ name: file.name, text, parts: s.parts });
    };
    reader.readAsText(file);
  };
  const importProducts = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result || ''));
        if (!Array.isArray(arr)) throw new Error('not a list');
        const items: GroceryItem[] = arr.filter((x) => x && typeof x.name === 'string' && x.name.trim() && !x.removed).map((x: any, i: number) => ({
          id: typeof x.id === 'string' ? x.id : `gdb-imported-${i}-${Date.now()}`,
          name: x.name.trim(),
          category: typeof x.category === 'string' ? x.category : '',
          unit: typeof x.unit === 'string' ? x.unit : 'each',
          increment: typeof x.increment === 'number' ? Math.max(0.01, x.increment) : 1,
          ...(Array.isArray(x.aliases) && x.aliases.length ? { aliases: x.aliases.filter((a: any) => typeof a === 'string') } : {}),
          ...(Array.isArray(x.hiddenAliases) && x.hiddenAliases.length ? { hiddenAliases: x.hiddenAliases.filter((a: any) => typeof a === 'string') } : {}),
        }));
        if (!items.length) throw new Error('empty');
        setConfirm({ title: `Replace your products with ${items.length} from the file?`, body: "The Shop will use these to turn recipe amounts into things you buy. Products that aren't in the file are taken off (on both phones).", action: 'Replace products', run: () => { if (store.replaceProducts) store.replaceProducts(items); else store.updateGroceryDatabase?.(items); say(`${items.length} products loaded`); } });
      } catch { say("That file isn't a products list"); }
    };
    reader.readAsText(file);
  };

  return (
    <section data-settings-backup>
      <h3 className={sectionTitle}>Backup &amp; reset</h3>
      <div className={card}>
        <div className={row}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Download a backup</span>
            <span className="block text-[13px] text-zinc-500" data-last-backup>{last ? `Last downloaded on this phone ${agoText(last)}` : 'Never downloaded on this phone'}</span>
          </span>
          <button type="button" onClick={backup} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0" data-backup-download><Download className="w-4 h-4" />Download</button>
        </div>
        <label className={`${row} cursor-pointer`}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Restore from a backup…</span>
            <span className={`block text-[13px] ${badFile ? 'text-rose-700' : 'text-zinc-500'}`}>{badFile || "Shows what's in the file before anything changes"}</span>
          </span>
          <Upload className="w-4 h-4 text-zinc-500" />
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickRestore(f); e.target.value = ''; }} data-restore-input />
        </label>
        <div className="px-4 py-3">
          <span className="block text-[15px] font-semibold text-zinc-900">Products list</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { download(JSON.stringify(catalog.map(({ lastModifiedAt: _t, notSameAs: _n, ...rest }) => rest), null, 2), `products-${formatDateISO(new Date())}.json`); say('Products downloaded'); }} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer" data-products-download>Download</button>
            <button type="button" onClick={() => productsInput.current?.click()} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer">Load from a file…</button>
            <button type="button" onClick={() => setConfirm({ title: 'Go back to the built-in products?', body: "The app's own products go back to how they come (aisles, how they're sold, other names), any you took off come back, and products you added are taken off, on both phones.\nRecipes linked to products you added are matched by name again.", action: 'Use built-in list', danger: true, run: () => { store.resetProducts?.(); say('Products reset'); } })} className="h-9 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer" data-products-reset>Reset to built-in</button>
            <input ref={productsInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importProducts(f); e.target.value = ''; }} />
          </div>
        </div>
        <button type="button" onClick={() => setConfirm({ title: 'Reset settings?', body: 'People, eating time, appliance and how recipe cards look go back to how they started.\nYour recipes, plans, lists, freezer, staples, aisle order and past shops are kept.', action: 'Reset settings', danger: true, run: () => { store.resetPreferences(); say('Settings reset'); } })}
          className={`${row} text-sm font-semibold text-rose-700 cursor-pointer`} data-settings-reset>Reset settings…</button>
      </div>

      {restore && (
        <Sheet label="Restore from a backup" onClose={() => setRestore(null)}>
          <div className="p-4" data-restore-sheet>
            <h3 className="text-lg font-bold text-zinc-900">Restore this backup?</h3>
            <p className="text-sm text-zinc-500 mt-0.5 break-all">{restore.name}</p>
            <ul className="mt-3 space-y-1 text-[15px] text-zinc-800" data-restore-parts>
              {restore.parts.map((p) => <li key={p} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />{p}</li>)}
            </ul>
            <p className="mt-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">This replaces everything on this phone{store.githubConfig ? ', and then the other phone too when it syncs' : ''}. Download a backup first if you're not sure.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setRestore(null)} className="flex-1 h-12 rounded-xl border border-zinc-300 font-semibold cursor-pointer">Cancel</button>
              <button type="button" onClick={() => { const ok = store.importAllData(restore.text); setRestore(null); say(ok ? 'Backup restored' : "Couldn't restore that file"); }} className="flex-1 h-12 rounded-xl bg-rose-600 text-white font-semibold cursor-pointer" data-restore-ok>Replace and restore</button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}

// ---------- About ----------

function AboutSection() {
  const running = runningVersion();
  const [check, setCheck] = useState<UpdateCheck | 'checking' | null>(null);
  return (
    <section data-settings-about>
      <h3 className={sectionTitle}>About this app</h3>
      <div className={card}>
        <div className={row}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Version</span>
            <span className="block text-[13px] text-zinc-500" data-app-version>
              {running ? `${builtText(running.built) || 'This version'} · ${running.id.slice(0, 7)}` : 'Preview (not the installed app)'}
            </span>
            {check && check !== 'checking' && (
              <span className={`block text-[13px] mt-0.5 ${check === 'available' ? 'text-emerald-700 font-semibold' : 'text-zinc-500'}`} data-update-result>
                {check === 'available' ? 'A newer version has been uploaded.' : check === 'current' ? "You're on the latest version." : "Couldn't check just now (no internet?)."}
              </span>
            )}
          </span>
          {check === 'available'
            ? <button type="button" onClick={() => void updateNow()} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer shrink-0">Update</button>
            : <button type="button" disabled={!running || check === 'checking'} onClick={async () => { setCheck('checking'); setCheck(await checkForUpdate()); }} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-40 shrink-0" data-update-check>{check === 'checking' ? 'Checking…' : 'Check for updates'}</button>}
        </div>
      </div>
    </section>
  );
}

// ---------- Products ----------

const PAGE = 60;
type ProductView = 'all' | 'duplicates' | 'no-aisle' | 'unused';
const AISLES_IN_ORDER = Object.values(GROCERY_AISLES).sort((a, b) => a.order - b.order);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listText = (names: string[], max = 3) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);

/**
 * Every product the Shop knows how to buy (built-in ones and yours), how each is sold, which
 * aisle it's in and what uses it, with checks for tidying up.
 */
function ProductsPage({ store, onBack, onClean, say, setConfirm }: {
  store: SettingsTabProps['store'];
  onBack: () => void;
  onClean: () => void;
  say: (t: string, undo?: () => void) => void;
  setConfirm: (c: any) => void;
}) {
  const storeRef = useRef(store);
  storeRef.current = store;
  const prefs = (store.state.preferences || {}) as UserPreferences;
  const catalog = catalogForState(store.state);
  const usage = useMemo(
    () => productUsage(store.state, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, store.state.recipes, store.state.preferences?.recurringItems, store.state.preferences?.favouriteItems, store.state.shoppingList],
  );
  const recipeNames = useMemo(() => new Map((store.state.recipes || []).map((r) => [r.id, r.name])), [store.state.recipes]);
  const dups = useMemo(() => {
    const used = (p: Product) => (usage.get(p.id)?.recipes.length || 0) * 10 + (isUnused(usage.get(p.id)) ? 0 : 1);
    // The one used more first (that's the one you'd usually keep).
    return likelyDuplicates(catalog).map(([a, b]) => (used(b) > used(a) ? [b, a] : [a, b]) as [Product, Product]);
  }, [catalog, usage]);
  const noAisle = useMemo(() => catalog.products.filter(hasNoAisle), [catalog]);
  const unused = useMemo(() => catalog.products.filter((p) => isUnused(usage.get(p.id))), [catalog, usage]);
  const yoursUnused = unused.filter((p) => !isBuiltInProduct(p.id)).length;

  const [view, setView] = useState<ProductView>('all');
  const [q, setQ] = useState('');
  const [aisle, setAisle] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [sameAsFor, setSameAsFor] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLimit(PAGE), [q, aisle, view]);
  const openView = (v: ProductView) => { setView(v); setAisle('all'); scrollRef.current?.scrollTo({ top: 0 }); };

  const aisleOf = (p: Product) => (hasNoAisle(p) ? null : p.aisle);
  const matchesQ = (p: Product) => productMatchesSearch(p, q);
  const shown = useMemo(() => {
    const base = view === 'no-aisle' ? noAisle : view === 'unused' ? unused : catalog.products;
    const yours = (p: Product) => (isBuiltInProduct(p.id) ? 1 : 0);
    return base
      .filter((p) => (aisle === 'all' || aisleOf(p) === aisle) && matchesQ(p))
      .sort((a, b) => (view === 'unused' ? yours(a) - yours(b) : 0) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, noAisle, unused, view, aisle, q]);

  const save = (item: GroceryItem, isNew: boolean) => {
    if (store.saveProduct) store.saveProduct(item);
    else store.updateGroceryOverride?.(item.id, item);
    setEditing(null);
    say(isNew ? `Added ${item.name}` : `Saved ${item.name}`);
  };

  const usedText = (p: Product) => {
    const u = usage.get(p.id);
    const bits: string[] = [];
    if (u?.recipes.length) bits.push(`used in ${plural(u.recipes.length, 'recipe')} (${listText(u.recipes.map((id) => recipeNames.get(id) || 'a recipe'))})`);
    if (u?.staples) bits.push('on your staples');
    if (u?.favourites) bits.push('a favourite');
    if (u?.list) bits.push('on the shopping list');
    return bits;
  };

  const askRemove = (p: Product) => {
    const u = usage.get(p.id);
    const bits = usedText(p);
    const body = [
      bits.length ? `It's ${bits.join(', ')}.` : 'Nothing uses it.',
      u?.recipes.length ? "Those recipes will be matched by name instead, which may find another product or none." : '',
      'It stays off on both phones. You can undo straight after.',
    ].filter(Boolean).join('\n');
    setConfirm({
      title: `Remove ${p.name}?`, body, action: 'Remove', danger: true,
      run: () => {
        const undo = store.removeProduct ? store.removeProduct(p.id) : null;
        setEditing(null);
        say(`Removed ${p.name}`, undo ? () => storeRef.current.restoreProduct?.(undo) : undefined);
      },
    });
  };

  const askMerge = (keep: Product, gone: Product) => {
    const m = mergeSummary(store.state, catalog, gone.id);
    const moves: string[] = [];
    if (m.recipes) moves.push(plural(m.recipes, 'recipe'));
    if (m.staples) moves.push(plural(m.staples, 'staple'));
    if (m.favourites) moves.push(plural(m.favourites, 'favourite'));
    if (m.list) moves.push(plural(m.list, 'shopping-list line'));
    const body = [
      `${gone.name} becomes another name for ${keep.name}${alsoCalled(gone.item).length ? `, along with the names it goes by` : ''}.`,
      moves.length ? `${listText(moves, 4)} will use ${keep.name}.` : `Nothing uses ${gone.name} yet.`,
      `${keep.name} keeps its own aisle and the way it's sold.`,
    ].join('\n');
    setConfirm({
      title: `Merge ${gone.name} into ${keep.name}?`, body, action: 'Merge',
      run: () => {
        store.mergeProducts?.(keep.id, gone.id);
        setEditing(null);
        setSameAsFor(null);
        say(`${gone.name} is now part of ${keep.name}`);
      },
    });
  };

  const setAisleFor = (p: Product, name: string) => {
    store.saveProduct?.({ ...p.item, category: name });
    say(`${p.name}: ${name}`);
  };

  const checks: { id: ProductView; count: number; text: string; sub: string }[] = [
    { id: 'duplicates', count: dups.length, text: `${plural(dups.length, 'pair')} that look like the same thing`, sub: 'Merge them, or say they’re different' },
    { id: 'no-aisle', count: noAisle.length, text: `${plural(noAisle.length, 'product')} with no aisle`, sub: 'The Shop puts these with the store cupboard' },
    { id: 'unused', count: unused.length, text: `${plural(unused.length, 'product')} not used yet`, sub: yoursUnused ? `${yoursUnused} of them added by you` : 'No recipe, staple or list uses them (that’s fine for built-in ones)' },
  ];
  const viewTitle = view === 'duplicates' ? 'Look like the same thing' : view === 'no-aisle' ? 'No aisle' : view === 'unused' ? 'Not used yet' : '';

  const row2 = (p: Product) => {
    const u = usage.get(p.id);
    const aisleText = hasNoAisle(p) ? 'No aisle' : p.item.category;
    return (
      <div key={p.id} className="flex items-center">
        <button type="button" onClick={() => setEditing(p)} className={`${row} cursor-pointer hover:bg-zinc-50 flex-1 min-w-0`} data-product={p.name}>
          {!hasNoAisle(p) && p.aisle && <AisleIcon aisle={p.aisle} size="md" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
            <span className="block text-[13px] text-zinc-500 truncate">{aisleText} · sold in {p.item.increment} {p.item.unit || 'item'}</span>
            <span className={`block text-[12px] truncate ${isUnused(u) ? 'text-zinc-400' : 'text-emerald-700'}`} data-product-usage>{usageText(u)}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </button>
        {view === 'no-aisle' && (
          <select aria-label={`Aisle for ${p.name}`} value="" onChange={(e) => e.target.value && setAisleFor(p, e.target.value)} className="mr-3 h-9 max-w-[42%] rounded-lg border border-zinc-300 bg-white px-1.5 text-sm" data-product-set-aisle={p.name}>
            <option value="">Choose aisle…</option>
            {AISLES_IN_ORDER.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <>
      <SubHeader title="Products" onBack={view === 'all' ? onBack : () => openView('all')} right={<button type="button" onClick={() => setEditing('new')} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1 cursor-pointer" data-product-add><Plus className="w-4 h-4" />Add</button>} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto" data-products-page data-products-view={view}>
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24">
          {view === 'all' ? (
            <>
              <p className="text-sm text-zinc-600 px-1">Everything the Shop knows how to buy, the same on both phones: how each is sold (in steps of 250 g, by the bunch), which aisle it's in, and what uses it.</p>
              <section className="mt-3" data-products-checks>
                <h3 className={sectionTitle}>Tidy up</h3>
                <div className={card}>
                  {checks.map((c) => (
                    <button key={c.id} type="button" onClick={() => openView(c.id)} disabled={c.count === 0} className={`${row} cursor-pointer hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-white`} data-check={c.id} data-check-count={c.count}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.count === 0 ? 'bg-emerald-500' : c.id === 'unused' ? 'bg-zinc-300' : 'bg-amber-400'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] font-semibold ${c.count ? 'text-zinc-900' : 'text-zinc-500'}`}>{c.count === 0 ? (c.id === 'duplicates' ? 'No likely duplicates' : c.id === 'no-aisle' ? 'Every product has an aisle' : 'Every product is used') : c.text}</span>
                        {c.count > 0 && <span className="block text-[13px] text-zinc-500">{c.sub}</span>}
                      </span>
                      {c.count > 0 && <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
                    </button>
                  ))}
                  <button type="button" onClick={onClean} className={`${row} cursor-pointer hover:bg-zinc-50`} data-products-tidy>
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="flex-1 text-[15px] font-semibold text-zinc-900">Ask Gemini to tidy</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="px-1 flex items-center justify-between gap-2" data-products-view-title>
              <h3 className="text-[17px] font-bold text-zinc-900">{viewTitle}</h3>
              <button type="button" onClick={() => openView('all')} className="h-9 px-3 rounded-xl border border-zinc-300 bg-white text-sm font-semibold cursor-pointer" data-products-show-all>All products</button>
            </div>
          )}

          {view === 'duplicates' ? (
            <div className="mt-3 space-y-2" data-dup-list>
              {dups.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing left to check.</p>}
              {dups.map(([a, b]) => (
                <div key={`${a.id}|${b.id}`} className="bg-white rounded-2xl border border-zinc-200 p-3" data-dup-pair={`${a.name}|${b.name}`}>
                  {[a, b].map((p) => (
                    <button key={p.id} type="button" onClick={() => setEditing(p)} className="w-full flex items-baseline justify-between gap-2 py-1 text-left cursor-pointer">
                      <span className="text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
                      <span className={`text-[12px] shrink-0 ${isUnused(usage.get(p.id)) ? 'text-zinc-400' : 'text-emerald-700'}`}>{usageText(usage.get(p.id))}</span>
                    </button>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => askMerge(a, b)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer" data-dup-keep={a.name}>Same: keep {a.name}</button>
                    <button type="button" onClick={() => askMerge(b, a)} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer" data-dup-keep={b.name}>Keep {b.name}</button>
                    <button type="button" onClick={() => { store.markProductsDifferent?.(a.id, b.id); say(`${a.name} and ${b.name} kept apart`); }} className="h-9 px-3 rounded-xl text-sm font-semibold text-zinc-600 cursor-pointer" data-dup-different>Not the same</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 app-page pt-3 pb-2 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${view === 'all' ? catalog.products.length : shown.length} products`} className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-9 text-base outline-none focus:border-emerald-500" data-products-search aria-label="Search products" />
                  {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 cursor-pointer" aria-label="Clear"><X className="w-4 h-4" /></button>}
                </div>
                {view === 'all' && (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-3 px-3" data-products-aisles>
                    {['all', ...orderedAisles(prefs.aisleOrder)].map((id) => (
                      <button key={id} type="button" onClick={() => setAisle(id)} aria-pressed={aisle === id} className={`h-8 px-3 rounded-full text-sm font-semibold whitespace-nowrap border cursor-pointer ${aisle === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'}`} data-aisle-chip={id}>{id === 'all' ? 'All aisles' : GROCERY_AISLES[id as keyof typeof GROCERY_AISLES].name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className={card} data-products-list>
                {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">{view === 'all' ? 'Nothing matches.' : 'Nothing left here.'}</p>}
                {shown.slice(0, limit).map(row2)}
              </div>
              {shown.length > limit && <button type="button" onClick={() => setLimit(shown.length)} className="mt-2 w-full h-11 rounded-xl border border-zinc-300 bg-white text-sm font-semibold cursor-pointer" data-products-more>Show all {shown.length}</button>}
            </>
          )}
        </div>
      </div>
      {editing && (
        <ProductSheet
          product={editing === 'new' ? null : editing}
          used={editing === 'new' ? [] : usedText(editing)}
          onSave={save}
          onRemove={askRemove}
          onSameAs={(p) => { setEditing(null); setSameAsFor(p); }}
          onClose={() => setEditing(null)}
        />
      )}
      {sameAsFor && (
        <SameAsPicker
          product={sameAsFor}
          products={catalog.products}
          usageOf={(p) => usageText(usage.get(p.id))}
          onPick={(keep) => askMerge(keep, sameAsFor)}
          onClose={() => setSameAsFor(null)}
        />
      )}
    </>
  );
}

function ProductSheet({ product, used, onSave, onRemove, onSameAs, onClose }: {
  product: Product | null;
  used: string[];
  onSave: (i: GroceryItem, isNew: boolean) => void;
  onRemove: (p: Product) => void;
  onSameAs: (p: Product) => void;
  onClose: () => void;
}) {
  const item = product?.item ?? null;
  const [name, setName] = useState(item?.name || '');
  const [unit, setUnit] = useState(item?.unit || 'each');
  const [step, setStep] = useState(String(item?.increment ?? 1));
  const [aisle, setAisle] = useState(item ? (isAisleName(item.category) ? item.category : '') : GROCERY_AISLES.produce.name);
  const [names, setNames] = useState<string[]>(() => (item ? alsoCalled(item) : []));
  const [newName, setNewName] = useState('');
  const n = Number(step);
  const ok = name.trim() && n > 0;
  const addName = () => {
    const t = newName.trim();
    if (!t) return;
    if (!names.some((x) => x.toLowerCase() === t.toLowerCase()) && t.toLowerCase() !== name.trim().toLowerCase()) setNames([...names, t]);
    setNewName('');
  };
  const submit = () => {
    if (!ok) return;
    const base: GroceryItem = { ...(item || { id: `gdb-custom-${crypto.randomUUID()}` }), name: name.trim(), unit: unit.trim() || 'each', increment: n, category: aisle } as GroceryItem;
    onSave(withAlsoCalled(base, names), !item);
  };
  return (
    <Sheet label={item ? item.name : 'Add a product'} onClose={onClose}>
      <form className="p-4 space-y-3" data-product-sheet onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-zinc-900">{item ? 'Change product' : 'Add a product'}</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {item && <p className={`text-[13px] ${used.length ? 'text-emerald-800' : 'text-zinc-500'}`} data-product-used>{used.length ? `${used.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : 'Not used by any recipe, staple or list yet.'}</p>}
        <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" data-product-name autoFocus={!item} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Sold in steps of</span>
            <input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" data-product-step /></label>
          <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, ml, pack, bunch…" className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" data-product-unit /></label>
        </div>
        <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Aisle</span>
          <select value={aisle} onChange={(e) => setAisle(e.target.value)} className="w-full h-11 rounded-xl border border-zinc-300 px-2 text-base bg-white" data-product-aisle>
            {!aisle && <option value="">No aisle (store cupboard)</option>}
            {AISLES_IN_ORDER.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select></label>
        <div data-product-aliases>
          <span className="text-xs font-semibold text-zinc-600 block mb-1">Also called</span>
          <p className="text-[12px] text-zinc-500 mb-1.5">Recipe ingredients with these names count as this product.</p>
          <div className="flex flex-wrap gap-1.5">
            {names.length === 0 && <span className="text-sm text-zinc-400">No other names yet</span>}
            {names.map((a) => (
              <span key={a} className="inline-flex items-center gap-0.5 h-8 pl-2.5 pr-1 rounded-full bg-zinc-100 border border-zinc-200 text-sm text-zinc-800" data-alias={a}>
                {a}
                <button type="button" onClick={() => setNames(names.filter((x) => x !== a))} className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 cursor-pointer" aria-label={`Remove ${a}`} data-alias-remove={a}><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addName(); } }} placeholder="Add another name" className="flex-1 min-w-0 h-10 rounded-xl border border-zinc-300 px-3 text-base" data-alias-input aria-label="Another name" />
            <button type="button" onClick={addName} disabled={!newName.trim()} className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-40" data-alias-add>Add</button>
          </div>
        </div>
        <button type="submit" disabled={!ok} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 cursor-pointer" data-product-save>{item ? 'Save' : 'Add product'}</button>
        {product && (
          <div className="flex gap-2">
            <button type="button" onClick={() => onSameAs(product)} className="flex-1 h-11 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer" data-product-same-as><Combine className="w-4 h-4" />Same as…</button>
            <button type="button" onClick={() => onRemove(product)} className="flex-1 h-11 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer" data-product-remove><Trash2 className="w-4 h-4" />Remove</button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** "Same as…": pick the product this one really is (that one is kept). */
function SameAsPicker({ product, products, usageOf, onPick, onClose }: {
  product: Product;
  products: Product[];
  usageOf: (p: Product) => string;
  onPick: (keep: Product) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const options = products
    .filter((p) => p.id !== product.id && productMatchesSearch(p, t))
    .sort((a, b) => (t ? Number(!a.name.toLowerCase().startsWith(t)) - Number(!b.name.toLowerCase().startsWith(t)) : 0) || a.name.localeCompare(b.name))
    .slice(0, 30);
  return (
    <Sheet label={`${product.name} is the same as…`} onClose={onClose}>
      <div className="p-4" data-merge-picker>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">{product.name} is the same as…</h3>
            <p className="text-sm text-zinc-500">Pick the product to keep. {product.name} becomes another name for it.</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 shrink-0 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" autoFocus className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-base outline-none focus:border-emerald-500" data-merge-search aria-label="Search products" />
        </div>
        <div className={`${card} mt-2 max-h-[45dvh] overflow-y-auto`}>
          {options.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing matches.</p>}
          {options.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className={`${row} cursor-pointer hover:bg-zinc-50`} data-merge-option={p.name}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
                <span className="block text-[12px] text-zinc-500 truncate">{p.item.category || 'No aisle'} · {usageOf(p)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ---------- History ----------

function HistoryPage({ plans, store, onBack, say, setConfirm, onNavigateTab }: {
  plans: MealPlan[];
  store: SettingsTabProps['store'];
  onBack: () => void;
  say: (t: string) => void;
  setConfirm: (c: any) => void;
  onNavigateTab?: (tab: TabName) => void;
}) {
  const [q, setQ] = useState('');
  const [copying, setCopying] = useState<MealPlan | null>(null);
  const recipes: Recipe[] = store.state.recipes || [];
  const t = q.trim().toLowerCase();
  const shown = t ? plans.filter((p) => Object.values(p.days || {}).some((d) => (d.meals || []).some((m) => mealTitle(m).toLowerCase().includes(t)))) : plans;

  const copyText = (p: MealPlan) => {
    const lines = [`Meals ${formatWeekSpan(p.startDate)}`, ...DAYS_OF_WEEK.map((d) => { const m = p.days?.[d]?.meals?.[0]; return `${d}: ${m ? mealTitle(m) : '—'}${m?.note ? ` (${m.note})` : ''}`; })];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => say('Copied the week as text')).catch(() => say("Couldn't copy on this phone"));
  };

  return (
    <>
      <SubHeader title="Past weeks" onBack={onBack} />
      <div className="flex-1 overflow-y-auto" data-history-page>
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24 space-y-3">
          {plans.length > 3 && (
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a meal you had" className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-base" data-history-search aria-label="Find a meal" />
            </div>
          )}
          {plans.length === 0 && <p className="text-center text-sm text-zinc-500 py-10">Finished weeks appear here, with what you ate. You can copy one to a new week.</p>}
          {shown.map((p) => (
            <section key={p.id} className="bg-white rounded-2xl border border-zinc-200" data-history-week={p.startDate}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-zinc-900">{formatWeekSpan(p.startDate)}</h3>
                <span className="text-xs text-zinc-500">{DAYS_OF_WEEK.filter((d) => p.days?.[d]?.meals?.[0]?.cooked).length} cooked</span>
              </div>
              <ul className="px-4 divide-y divide-zinc-100">
                {DAYS_OF_WEEK.map((d) => {
                  const m = p.days?.[d]?.meals?.[0] || null;
                  const label = m ? describeMeal(m, leftoverSourceDay(p.days, d, m)).label?.text : '';
                  const recipe = m?.recipeId ? recipes.find((r) => r.id === m.recipeId) : null;
                  return (
                    <li key={d} className="py-1.5 flex items-center gap-2 text-sm" data-history-day={d}>
                      <span className="w-9 text-xs font-bold text-zinc-500 shrink-0">{d.slice(0, 3)}</span>
                      <span className={`flex-1 min-w-0 truncate ${m ? 'text-zinc-800' : 'text-zinc-400'}`}>
                        {m ? mealTitle(m) : 'Nothing planned'}
                        {label && label.toLowerCase() !== (m ? mealTitle(m).toLowerCase() : '') && <span className="text-zinc-500"> · {label}</span>}
                      </span>
                      {recipe?.verdict === 'again' && <ThumbsUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Have it again" />}
                      {recipe?.verdict === 'not_for_us' && <ThumbsDown className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Not for us" />}
                      {m?.cooked && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Cooked" />}
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-zinc-100">
                <button type="button" onClick={() => setCopying(p)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer" data-history-copy>Copy to a week…</button>
                <button type="button" onClick={() => copyText(p)} className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"><Copy className="w-4 h-4" />Copy as text</button>
              </div>
            </section>
          ))}
          {plans.length > 0 && (
            <button type="button" onClick={() => setConfirm({ title: 'Clear all past weeks?', body: `${plans.length} finished ${plans.length === 1 ? 'week is' : 'weeks are'} deleted from both phones. Recipes keep their "last had" dates only while the weeks exist.`, action: 'Clear past weeks', danger: true, run: () => { store.clearPastWeeks(); say('Past weeks cleared'); } })}
              className="w-full h-11 text-sm font-semibold text-rose-700 cursor-pointer" data-history-clear>Clear all past weeks…</button>
          )}
        </div>
      </div>
      {copying && <CopyWeekSheet plan={copying} store={store} onClose={() => setCopying(null)} onDone={(label) => { setCopying(null); say(`Copied to ${label}`); setTimeout(() => onNavigateTab?.('planning'), 700); }} />}
    </>
  );
}

function CopyWeekSheet({ plan, store, onClose, onDone }: { plan: MealPlan; store: SettingsTabProps['store']; onClose: () => void; onDone: (label: string) => void }) {
  const monday = getMonday(new Date());
  const maxWeeks = store.state.preferences?.maxForwardWeeks || 4;
  const weeks = Array.from({ length: maxWeeks }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    const start = formatDateISO(d);
    const existing = (store.state.mealPlans || []).find((p) => p.startDate === start);
    const count = existing ? Object.values(existing.days || {}).reduce((n, day) => n + (day.meals?.length || 0), 0) : 0;
    const label = i === 0 ? 'this week' : i === 1 ? 'next week' : `w/c ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
    return { start, label, count, span: formatWeekSpan(start) };
  });
  return (
    <Sheet label="Copy to a week" onClose={onClose}>
      <div className="p-4" data-copy-week>
        <h3 className="text-lg font-bold text-zinc-900">Copy {formatWeekSpan(plan.startDate)} to…</h3>
        <p className="text-sm text-zinc-600 mt-0.5">The meals, people and notes come across, not yet cooked.</p>
        <div className="mt-3 space-y-1.5">
          {weeks.map((w) => (
            <button key={w.start} type="button" onClick={() => { store.duplicatePlanToWeek(plan.id, w.start); onDone(w.label); }} data-copy-to={w.start}
              className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 px-3 py-2.5 flex items-center gap-3 cursor-pointer">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900 capitalize">{w.label}</span>
                <span className="block text-xs text-zinc-500">{w.span}</span>
              </span>
              <span className={`text-xs font-bold rounded-lg px-2 py-1 ${w.count ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{w.count ? `Replaces ${w.count} meals` : 'Empty'}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full h-11 rounded-xl border border-zinc-300 font-semibold cursor-pointer">Cancel</button>
      </div>
    </Sheet>
  );
}
