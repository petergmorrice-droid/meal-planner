import React from "react";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BookOpen, Calendar, ShoppingCart, Snowflake, ChefHat, Sliders } from 'lucide-react';
import { useStore } from './store';
import CookBookTab from './components/CookBookTab';
import PlanningTab from './components/PlanningTab';
import ShopTab from './components/ShopTab';
import BatchTab from './components/BatchTab';
import ThisWeekTab from './components/ThisWeekTab';
import SettingsTab from './components/SettingsTab';

type Tab = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('planning');
  
  const store = useStore();

  const handleNavigateTab = (tab: Tab, planId?: string) => {
    if (planId) {
      
      store.setSelectedPlanId?.(planId);
    }
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-screen bg-[#fafafa] text-zinc-900 overflow-hidden select-none">
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'cookbook' && <CookBookTab store={store} onNavigateTab={handleNavigateTab} />}
        {activeTab === 'planning' && (
          <PlanningTab 
            store={store} 
            onNavigateTab={handleNavigateTab} 
            targetPlanId={store.selectedPlanId} 
          />
        )}
        {activeTab === 'this_week' && <ThisWeekTab store={store} onNavigateTab={handleNavigateTab} />}
        {activeTab === 'shop' && <ShopTab store={store} onNavigateTab={handleNavigateTab} />}
        {activeTab === 'batch' && <BatchTab store={store} />}
        {activeTab === 'settings' && <SettingsTab store={store} onNavigateTab={handleNavigateTab} />}
      </main>

      {/* Minimalist Bottom Navigation */}
      <nav className="bg-white/95 backdrop-blur-md border-t border-zinc-200/80 pb-safe shrink-0 relative z-30">
        <div className="w-full max-w-lg mx-auto flex items-center justify-between px-1 sm:px-4 py-1.5 gap-0.5 sm:gap-1">
          <TabButton
            active={activeTab === 'cookbook'}
            onClick={() => setActiveTab('cookbook')}
            icon={<BookOpen className="w-4 h-4 stroke-[1.75]" />}
            label="Cookbook"
          />
          <TabButton
            active={activeTab === 'planning'}
            onClick={() => setActiveTab('planning')}
            icon={<Calendar className="w-4 h-4 stroke-[1.75]" />}
            label="Planning"
          />
          <TabButton
            active={activeTab === 'shop'}
            onClick={() => setActiveTab('shop')}
            icon={<ShoppingCart className="w-4 h-4 stroke-[1.75]" />}
            label="Shop"
          />
          <TabButton
            active={activeTab === 'this_week'}
            onClick={() => setActiveTab('this_week')}
            icon={<ChefHat className="w-4 h-4 stroke-[1.75]" />}
            label="Cook"
          />
          <TabButton
            active={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
            icon={<Snowflake className="w-4 h-4 stroke-[1.75]" />}
            label="Freezer"
          />
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            icon={<Sliders className="w-4 h-4 stroke-[1.75]" />}
            label="Settings"
          />
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-1 px-1 sm:px-3 rounded-xl transition-all duration-150 min-w-0 ${
        active
          ? 'text-zinc-900 font-medium bg-zinc-100/90'
          : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      <div className="flex items-center justify-center h-5 shrink-0">
        {icon}
      </div>
      <span className="text-[9px] sm:text-[11px] tracking-tight mt-0.5 whitespace-nowrap truncate w-full text-center">{label}</span>
    </button>
  );
}
