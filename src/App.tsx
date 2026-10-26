import React from 'react';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';
import { BookOpen, Calendar, ShoppingCart, Snowflake, ChefHat, Sliders, Ellipsis } from 'lucide-react';
import { useStore } from './store';
import { useMorningSchedule } from './hooks/useMorningSchedule';
import { firstUrl } from './recipeInfo';
import CookBookTab from './components/CookBookTab';
import PlanningTab from './components/PlanningTab';
import ShopTab from './components/ShopTab';
import { readOpenShop } from './components/shop/openShop';
import BatchTab from './components/BatchTab';
import CookTab from './components/CookTab';
import { TimerDock } from './components/cook/TimerBar';
import { checkForUpdate, updateNow } from './appVersion';
import { useEffect } from 'react';
import SettingsTab from './components/SettingsTab';
import { applyTabColour } from './theme';
import ErrorBoundary, { TestBreak } from './components/ErrorBoundary';
import { getGistConfig } from './services/gistStorage';
import type { TabName } from './types';

export default function App() {
  // A recipe page shared to the app (Android: Share → Meals) arrives as ?share_url / ?share_text.
  const [sharedRecipe, setSharedRecipe] = useState<string | null>(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const url = q.get('share_url') || '';
      const text = q.get('share_text') || '';
      const title = q.get('share_title') || '';
      if (!url && !text && !title) return null;
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      return url || firstUrl(text) || [title, text].filter(Boolean).join('\n') || null;
    } catch {
      return null;
    }
  });
  // Mid-shop (phone locked, app closed)? Open straight back into shopping mode.
  // Opened from a notification (?tab=shop or ?tab=this_week): straight to that tab.
  const [fromNotification] = useState<TabName | null>(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab !== 'shop' && tab !== 'this_week') return null;
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      return tab;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<TabName>(
    sharedRecipe ? 'cookbook' : fromNotification || (readOpenShop() ? 'shop' : 'planning'),
  );
  // "Tab colours" theme: the screen takes its tab's colour.
  useEffect(() => {
    applyTabColour(activeTab);
  }, [activeTab]);
  // A notification tapped while the app is already open: go to its tab.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-tab' && (e.data.tab === 'shop' || e.data.tab === 'this_week'))
        setActiveTab(e.data.tab);
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, []);
  // "Add to a day…" from a recipe in the Cookbook: Planning opens its day chooser for it.
  const [pendingAddRecipeId, setPendingAddRecipeId] = useState<string | null>(null);

  const store = useStore();
  // The morning notifications (Settings → Notifications): kept up to date with the notification sender.
  useMorningSchedule(store.state);

  // Shop opens on its own best week, unless you came from "See the list" for a particular week.
  const [shopPlanRequest, setShopPlanRequest] = useState<string | null>(null);
  const [shopPanelRequest, setShopPanelRequest] = useState<'aisles' | 'staples' | 'history' | null>(null);
  const handleNavigateTab = (tab: TabName, planId?: string) => {
    if (planId) {
      store.setSelectedPlanId?.(planId);
      if (tab === 'shop') setShopPlanRequest(planId);
    }
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-screen app-page text-zinc-900 overflow-hidden">
      <UpdateBanner />
      {store.saveProblem && <SaveProblemBanner exportAll={store.exportAllData} />}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'cookbook' && (
          <ErrorBoundary key="cookbook" name="Cookbook">
            <TestBreak tab="cookbook" />
            <CookBookTab
              store={store}
              onNavigateTab={handleNavigateTab}
              onAddToDay={(recipe) => {
                setPendingAddRecipeId(recipe.id);
                setActiveTab('planning');
              }}
              startAddWith={sharedRecipe}
              onStartAddHandled={() => setSharedRecipe(null)}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'planning' && (
          <ErrorBoundary key="planning" name="Planning">
            <TestBreak tab="planning" />
            <PlanningTab
              store={store}
              onNavigateTab={handleNavigateTab}
              targetPlanId={store.selectedPlanId}
              pendingAddRecipeId={pendingAddRecipeId}
              onPendingAddDone={() => setPendingAddRecipeId(null)}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'this_week' && (
          <ErrorBoundary key="cook" name="Cook">
            <TestBreak tab="this_week" />
            <CookTab store={store} onNavigateTab={handleNavigateTab} />
          </ErrorBoundary>
        )}
        {activeTab === 'shop' && (
          <ErrorBoundary key="shop" name="Shop">
            <TestBreak tab="shop" />
            <ShopTab
              store={store}
              onNavigateTab={handleNavigateTab}
              openPlanId={shopPlanRequest}
              onOpenPlanHandled={() => setShopPlanRequest(null)}
              openPanel={shopPanelRequest}
              onOpenPanelHandled={() => setShopPanelRequest(null)}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'batch' && (
          <ErrorBoundary key="freezer" name="Freezer">
            <TestBreak tab="batch" />
            <BatchTab store={store} onNavigateTab={handleNavigateTab} />
          </ErrorBoundary>
        )}
        {activeTab === 'settings' && (
          <ErrorBoundary key="settings" name="Settings">
            <TestBreak tab="settings" />
            <SettingsTab
              store={store}
              onNavigateTab={handleNavigateTab}
              onOpenShopPanel={(panel) => {
                setShopPanelRequest(panel);
                setActiveTab('shop');
              }}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Kitchen timers keep going (and ring) on every tab; the Cook tab shows them at the top. */}
      <TimerDock hidden={activeTab === 'this_week'} />

      {/* Minimalist Bottom Navigation */}
      <nav className="app-nav backdrop-blur-md border-t border-zinc-200/80 pb-safe shrink-0 relative z-30">
        <div className="w-full max-w-lg mx-auto flex items-center justify-between px-1 sm:px-4 py-1.5 gap-0.5 sm:gap-1">
          <TabButton
            active={activeTab === 'cookbook'}
            onClick={() => setActiveTab('cookbook')}
            icon={<BookOpen className="w-[18px] h-[18px] stroke-[2]" />}
            label="Cookbook"
            tone="amber"
          />
          <TabButton
            active={activeTab === 'planning'}
            onClick={() => setActiveTab('planning')}
            icon={<Calendar className="w-[18px] h-[18px] stroke-[2]" />}
            label="Planning"
            tone="emerald"
          />
          <TabButton
            active={activeTab === 'shop'}
            onClick={() => setActiveTab('shop')}
            icon={<ShoppingCart className="w-[18px] h-[18px] stroke-[2]" />}
            label="Shop"
            tone="blue"
          />
          <TabButton
            active={activeTab === 'this_week'}
            onClick={() => setActiveTab('this_week')}
            icon={<ChefHat className="w-[18px] h-[18px] stroke-[2]" />}
            label="Cook"
            tone="orange"
          />
          <MoreTab activeTab={activeTab} onPick={setActiveTab} />
        </div>
      </nav>
    </div>
  );
}

/** The tabs under "More", with their own colours (the More button takes the colour of the one you're on). */
const MORE_TABS = [
  {
    id: 'batch',
    label: 'Freezer',
    sub: "What's in the freezer",
    tone: 'cyan',
    icon: <Snowflake className="w-5 h-5 stroke-[2]" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    sub: 'Reminders, sync, backup',
    tone: 'zinc',
    icon: <Sliders className="w-5 h-5 stroke-[2]" />,
  },
] as const;

/** The last tab: opens a small menu above the bar to go to the Freezer or Settings. */
function MoreTab({ activeTab, onPick }: { activeTab: TabName; onPick: (tab: TabName) => void }) {
  const [open, setOpen] = useState(false);
  const current = MORE_TABS.find((t) => t.id === activeTab);
  const wrap = useRef<HTMLSpanElement>(null);
  // Escape, or tapping anywhere outside the menu and the More button, closes it.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const tap = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', k);
    document.addEventListener('pointerdown', tap);
    return () => {
      window.removeEventListener('keydown', k);
      document.removeEventListener('pointerdown', tap);
    };
  }, [open]);
  return (
    <span ref={wrap} className="contents">
      {open && (
        <div
          className="absolute bottom-full right-2 mb-2 z-50 w-64 bg-white rounded-2xl border border-zinc-200 shadow-lg p-1.5 animate-in fade-in duration-150"
          role="menu"
          aria-label="More"
          data-more-menu
        >
          {MORE_TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(t.id);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer ${on ? TAB_TONES[t.tone].on : 'hover:bg-zinc-50 text-zinc-900'}`}
                aria-current={on ? 'page' : undefined}
                data-more-item={t.id}
              >
                <span className={`shrink-0 ${TAB_TONES[t.tone].icon}`}>{t.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{t.label}</span>
                  <span className="block text-[12px] text-zinc-500 truncate">{t.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <TabButton
        active={Boolean(current)}
        onClick={() => setOpen((o) => !o)}
        icon={
          current ? (
            React.cloneElement(current.icon, { className: 'w-[18px] h-[18px] stroke-[2]' })
          ) : (
            <Ellipsis className="w-[18px] h-[18px] stroke-[2]" />
          )
        }
        label="More"
        tone={current ? current.tone : 'zinc'}
        expanded={open}
      />
    </span>
  );
}

/** Each tab's own colour, so you can tell where you are at a glance. */
const TAB_TONES = {
  amber: { on: 'bg-amber-50 text-amber-800', icon: 'text-amber-600' },
  emerald: { on: 'bg-emerald-50 text-emerald-800', icon: 'text-emerald-600' },
  blue: { on: 'bg-blue-50 text-blue-800', icon: 'text-blue-600' },
  orange: { on: 'bg-orange-50 text-orange-800', icon: 'text-orange-600' },
  cyan: { on: 'bg-cyan-50 text-cyan-800', icon: 'text-cyan-600' },
  zinc: { on: 'bg-zinc-100 text-zinc-900', icon: 'text-zinc-600' },
} as const;

function TabButton({
  active,
  onClick,
  icon,
  label,
  tone,
  expanded,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof TAB_TONES;
  /** For the More tab: whether its menu is open. */
  expanded?: boolean;
}) {
  const t = TAB_TONES[tone];
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-1 px-1 sm:px-3 rounded-xl transition-all duration-150 min-w-0 ${
        active ? `${t.on} font-semibold` : 'text-zinc-500 hover:bg-zinc-50'
      }`}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      data-tab-tone={tone}
    >
      <div className={`flex items-center justify-center h-5 shrink-0 ${t.icon} ${active ? '' : 'opacity-75'}`}>
        {icon}
      </div>
      <span className="text-[11px] sm:text-[11px] tracking-tight mt-0.5 whitespace-nowrap truncate w-full text-center">
        {label}
      </span>
    </button>
  );
}

/**
 * This phone couldn't save the latest changes (its storage for the app is full). Says so plainly,
 * says whether they're still reaching the other phone, and offers a backup download.
 */
function SaveProblemBanner({ exportAll }: { exportAll: () => string }) {
  const download = () => {
    try {
      const blob = new Blob([exportAll()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `meal-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      /* nothing more to try */
    }
  };
  const syncing = !!getGistConfig();
  return (
    <div
      className="shrink-0 bg-rose-50 border-b border-rose-200 text-rose-950 px-4 py-2 flex items-center gap-3 text-sm"
      role="alert"
      data-save-problem
    >
      <span className="flex-1 min-w-0">
        <strong>This phone couldn't save your latest changes</strong> (its storage is full).{' '}
        {syncing ? "They're still being sent to the other phone." : 'Download a backup so nothing is lost.'}
      </span>
      <button
        type="button"
        onClick={download}
        className="h-8 px-3 rounded-lg bg-white border border-rose-300 text-rose-800 font-semibold cursor-pointer shrink-0"
        data-save-problem-backup
      >
        Backup
      </button>
    </div>
  );
}

/**
 * "A new version of the app is ready": shown when newer files have been uploaded than the ones
 * this phone is running (checked on opening and when coming back to the app, at most every
 * 10 minutes).
 */
function UpdateBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let last = 0;
    const check = async () => {
      const now = Date.now();
      if (now - last < 10 * 60_000) return;
      last = now;
      if ((await checkForUpdate()) === 'available') setShow(true);
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  if (!show) return null;
  return (
    <div
      className="shrink-0 bg-emerald-700 text-white px-4 py-2 flex items-center gap-3 text-sm"
      role="status"
      data-update-banner
    >
      <span className="flex-1 min-w-0">A new version of the app is ready.</span>
      <button
        type="button"
        onClick={() => void updateNow()}
        className="h-8 px-3 rounded-lg bg-white text-emerald-800 font-bold cursor-pointer"
        data-update-now
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="h-8 px-2 text-emerald-100 font-semibold cursor-pointer"
        aria-label="Not now"
      >
        Later
      </button>
    </div>
  );
}
