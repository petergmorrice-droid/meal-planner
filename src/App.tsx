import React from "react";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BookOpen, Calendar, ShoppingCart, Snowflake, ChefHat, Sliders } from 'lucide-react';
import { useStore } from './store';
import { firstUrl } from './recipeInfo';
import CookBookTab from './components/CookBookTab';
import PlanningTab from './components/PlanningTab';
import ShopTab, { readOpenShop } from './components/ShopTab';
import BatchTab from './components/BatchTab';
import CookTab from './components/CookTab';
import { TimerDock } from './components/cook/TimerBar';
import { checkForUpdate, updateNow } from './appVersion';
import { useEffect } from 'react';
import SettingsTab from './components/SettingsTab';

type Tab = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';

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
  const [activeTab, setActiveTab] = useState<Tab>(sharedRecipe ? 'cookbook' : readOpenShop() ? 'shop' : 'planning');
  // "Add to a day…" from a recipe in the Cookbook: Planning opens its day chooser for it.
  const [pendingAddRecipeId, setPendingAddRecipeId] = useState<string | null>(null);
  
  const store = useStore();

  // Shop opens on its own best week, unless you came from "See the list" for a particular week.
  const [shopPlanRequest, setShopPlanRequest] = useState<string | null>(null);
  const [shopPanelRequest, setShopPanelRequest] = useState<'aisles' | 'staples' | 'history' | null>(null);
  const handleNavigateTab = (tab: Tab, planId?: string) => {
    if (planId) {
      store.setSelectedPlanId?.(planId);
      if (tab === 'shop') setShopPlanRequest(planId);
    }
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-screen bg-[#fafafa] text-zinc-900 overflow-hidden">
      <UpdateBanner />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'cookbook' && (
          <CookBookTab
            store={store}
            onNavigateTab={handleNavigateTab}
            onAddToDay={(recipe) => { setPendingAddRecipeId(recipe.id); setActiveTab('planning'); }}
            startAddWith={sharedRecipe}
            onStartAddHandled={() => setSharedRecipe(null)}
          />
        )}
        {activeTab === 'planning' && (
          <PlanningTab 
            store={store} 
            onNavigateTab={handleNavigateTab} 
            targetPlanId={store.selectedPlanId} 
            pendingAddRecipeId={pendingAddRecipeId}
            onPendingAddDone={() => setPendingAddRecipeId(null)}
          />
        )}
        {activeTab === 'this_week' && <CookTab store={store} onNavigateTab={handleNavigateTab} />}
        {activeTab === 'shop' && <ShopTab store={store} onNavigateTab={handleNavigateTab} openPlanId={shopPlanRequest} onOpenPlanHandled={() => setShopPlanRequest(null)} openPanel={shopPanelRequest} onOpenPanelHandled={() => setShopPanelRequest(null)} />}
        {activeTab === 'batch' && <BatchTab store={store} onNavigateTab={handleNavigateTab} />}
        {activeTab === 'settings' && <SettingsTab store={store} onNavigateTab={handleNavigateTab} onOpenShopPanel={(panel) => { setShopPanelRequest(panel); setActiveTab('shop'); }} />}
      </main>

      {/* Kitchen timers keep going (and ring) on every tab; the Cook tab shows them at the top. */}
      <TimerDock hidden={activeTab === 'this_week'} />

      {/* Minimalist Bottom Navigation */}
      <nav className="bg-white/95 backdrop-blur-md border-t border-zinc-200/80 pb-safe shrink-0 relative z-30">
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
          <TabButton
            active={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
            icon={<Snowflake className="w-[18px] h-[18px] stroke-[2]" />}
            label="Freezer"
            tone="cyan"
          />
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            icon={<Sliders className="w-[18px] h-[18px] stroke-[2]" />}
            label="Settings"
            tone="zinc"
          />
        </div>
      </nav>
    </div>
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof TAB_TONES;
}) {
  const t = TAB_TONES[tone];
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-1 px-1 sm:px-3 rounded-xl transition-all duration-150 min-w-0 ${
        active ? `${t.on} font-semibold` : 'text-zinc-500 hover:bg-zinc-50'
      }`}
      aria-current={active ? 'page' : undefined}
      data-tab-tone={tone}
    >
      <div className={`flex items-center justify-center h-5 shrink-0 ${t.icon} ${active ? '' : 'opacity-75'}`}>
        {icon}
      </div>
      <span className="text-[11px] sm:text-[11px] tracking-tight mt-0.5 whitespace-nowrap truncate w-full text-center">{label}</span>
    </button>
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
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  if (!show) return null;
  return (
    <div className="shrink-0 bg-emerald-700 text-white px-4 py-2 flex items-center gap-3 text-sm" role="status" data-update-banner>
      <span className="flex-1 min-w-0">A new version of the app is ready.</span>
      <button type="button" onClick={() => void updateNow()} className="h-8 px-3 rounded-lg bg-white text-emerald-800 font-bold cursor-pointer" data-update-now>Update</button>
      <button type="button" onClick={() => setShow(false)} className="h-8 px-2 text-emerald-100 font-semibold cursor-pointer" aria-label="Not now">Later</button>
    </div>
  );
}
