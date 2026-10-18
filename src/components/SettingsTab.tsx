import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Check, 
  Copy, 
  RotateCcw, 
  Download, 
  Upload, 
  Search, 
  X,
  Zap, 
  History,
  ChevronDown,
  Trash2,
  BookOpen,
  Plus,
  Minus,
  Users,
  Heart,
  Sparkles,
  Cloud
} from 'lucide-react';
import { parseClock, DEFAULT_EAT_AT } from '../cookInfo';
import { AppState, MealPlan, Recipe, UserPreferences, PlannedMeal, GroceryItem, DatabaseCleanAction } from '../types';
import { 
  isPastWeek, 
  formatWeekRange, 
  formatDateISO, 
  getMonday, 
  DAYS_OF_WEEK, 
  formatWeekStart,
  findGroceryDatabaseMatch,
  getGroceryAisle,
  GROCERY_AISLES,
  parseQtyAndUnit,
  syncRecurringStaplesForAllPlans
} from '../utils';
import { RecipeModal } from './CookBookTab';
import { INITIAL_GROCERY_DATABASE } from '../utils/initialGroceryDb';
import { useDeviceIdentity, setCurrentDeviceIdentity } from '../hooks/useDeviceIdentity';
import { CleanDatabaseModal } from './CleanDatabaseModal';

interface SettingsTabProps {
  store: {
    state: AppState;
    updatePreferences: (prefs: Partial<UserPreferences>) => void;
    resetPreferences: () => void;
    updateMealPlan: (plan: MealPlan) => void;
    duplicatePlanToWeek: (sourcePlanId: string, targetStartDate: string) => void;
    clearPastWeeks: () => void;
    exportAllData: () => string;
    importAllData: (data: string) => boolean;
    updateShoppingList?: (list: any[]) => void;
    updateGroceryDatabase?: (db: GroceryItem[]) => void;
    updateGroceryOverride?: (id: string, updates: Partial<GroceryItem>) => void;
    applyGroceryCleanActions?: (actions: DatabaseCleanAction[]) => Promise<void>;
    
    // GitHub Gist Fields
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
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void;
}

type SubSection = 'archive' | 'grocery_db' | 'household' | 'system' | 'github';

export default function SettingsTab({ store, onNavigateTab }: SettingsTabProps) {
  const currentMonday = getMonday(new Date());
  const currentMondayStr = formatDateISO(currentMonday);
  const activeMember = useDeviceIdentity();

  // Tab State - order matches user request: past weeks, reocurring staples, grocery database, my household, system
  const [activeSubSection, setActiveSubSection] = useState<SubSection>('archive');
  
  // Collapse Search states
  const [showArchiveSearch, setShowArchiveSearch] = useState(false);
  const [showDbSearch, setShowDbSearch] = useState(false);
  
  // Popup States
  const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Normal States
  const [searchArchive, setSearchArchive] = useState('');
  const [selectedPastPlanId, setSelectedPastPlanId] = useState<string | null>(null);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
  const [targetWeeks, setTargetWeeks] = useState<Record<string, string>>({});
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [templateTargetWeek, setTemplateTargetWeek] = useState<string>(currentMondayStr);
  const [showResetSettingsModal, setShowResetSettingsModal] = useState(false);
  const [isCleanDbModalOpen, setIsCleanDbModalOpen] = useState(false);
  const [localPat, setLocalPat] = useState('');
  const [localGistId, setLocalGistId] = useState('');
  const [localGeminiKey, setLocalGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

  // Grocery Database Search & Filters
  const [dbSearch, setDbSearch] = useState('');
  const [dbCategoryFilter, setDbCategoryFilter] = useState('All');

  // Popup Form States (Insert)
  const [dbNewName, setDbNewName] = useState('');
  const [dbNewUnit, setDbNewUnit] = useState('g');
  const [dbNewIncrement, setDbNewIncrement] = useState<number>(100);
  const [dbNewCategory, setDbNewCategory] = useState('Produce');

  // Popup Form States (Edit)
  const [editingItemName, setEditingItemName] = useState('');
  const [editingItemUnit, setEditingItemUnit] = useState('');
  const [editingItemIncrement, setEditingItemIncrement] = useState<number>(1);
  const [editingItemCategory, setEditingItemCategory] = useState('');

  const groceryDatabase = store.state.groceryDatabase || [];

  const hydratedCatalog = useMemo<GroceryItem[]>(() => {
    const baseItems = store.state.groceryDatabase && store.state.groceryDatabase.length > 0
      ? store.state.groceryDatabase
      : INITIAL_GROCERY_DATABASE;
    const overrides = store.state.groceryOverrides || {};
    return baseItems.map(item => ({
      ...item,
      ...(overrides[item.id] || {})
    }));
  }, [store.state.groceryDatabase, store.state.groceryOverrides]);

  const handleApplyCleanChanges = async (actions: DatabaseCleanAction[]) => {
    if (store.applyGroceryCleanActions) {
      await store.applyGroceryCleanActions(actions);
    } else if (store.updateGroceryDatabase) {
      const itemMap = new Map<string, GroceryItem>(hydratedCatalog.map(i => [i.id, { ...i }]));
      const deletedIds = new Set<string>();

      for (const action of actions) {
        if (action.actionType === 'merge') {
          const primary = itemMap.get(action.primaryItemId);
          const secondary = action.secondaryItemId ? itemMap.get(action.secondaryItemId) : undefined;
          if (primary && secondary) {
            const aliases = new Set((primary.aliases || []).map(a => a.toLowerCase().trim()));
            aliases.add(secondary.name.toLowerCase().trim());
            (secondary.aliases || []).forEach(a => aliases.add(a.toLowerCase().trim()));
            primary.aliases = Array.from(aliases);
            if (action.newName) primary.name = action.newName.trim();
            if (action.newAisle) primary.category = action.newAisle.trim();
            deletedIds.add(secondary.id);
          }
        } else if (action.actionType === 'rename') {
          const primary = itemMap.get(action.primaryItemId);
          if (primary && action.newName) {
            const aliases = new Set((primary.aliases || []).map(a => a.toLowerCase().trim()));
            aliases.add(primary.name.toLowerCase().trim());
            primary.aliases = Array.from(aliases);
            primary.name = action.newName.trim();
          }
        } else if (action.actionType === 'recategorize') {
          const primary = itemMap.get(action.primaryItemId);
          if (primary && action.newAisle) {
            primary.category = action.newAisle.trim();
          }
        }
      }

      const finalItems = Array.from(itemMap.values()).filter(i => !deletedIds.has(i.id));
      store.updateGroceryDatabase(finalItems);
    }
  };

  const handleAddGroceryItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbNewName.trim()) return;

    const newItem: GroceryItem = {
      id: `gdb-${Date.now()}`,
      name: dbNewName.trim(),
      unit: dbNewUnit.trim(),
      increment: Math.max(0.01, dbNewIncrement),
      category: dbNewCategory
    };

    const updatedDb = [...groceryDatabase, newItem];
    if (store.updateGroceryDatabase) {
      store.updateGroceryDatabase(updatedDb);
    }
    setDbNewName('');
    showToast(`Added "${newItem.name}" to database`);
  };

  const handleDeleteGroceryItem = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" from the database?`)) return;
    const updatedDb = groceryDatabase.filter(item => item.id !== id);
    if (store.updateGroceryDatabase) {
      store.updateGroceryDatabase(updatedDb);
    }
    showToast(`Deleted "${name}"`);
  };

  const handleSaveEditGroceryItem = () => {
    if (!editingItemId || !editingItemName.trim()) return;

    const updatedDb = groceryDatabase.map(item => {
      if (item.id === editingItemId) {
        return {
          ...item,
          name: editingItemName.trim(),
          unit: editingItemUnit.trim(),
          increment: Math.max(0.01, editingItemIncrement),
          category: editingItemCategory
        };
      }
      return item;
    });

    if (store.updateGroceryDatabase) {
      store.updateGroceryDatabase(updatedDb);
    }
    setEditingItemId(null);
    showToast(`Saved changes to "${editingItemName}"`);
  };

  const filteredGroceryItems = useMemo(() => {
    return groceryDatabase.filter(item => {
      const nameMatches = item.name.toLowerCase().includes(dbSearch.toLowerCase());
      const catMatches = dbCategoryFilter === 'All' || item.category === dbCategoryFilter;
      return nameMatches && catMatches;
    });
  }, [groceryDatabase, dbSearch, dbCategoryFilter]);

  const uniqueDbCategories = useMemo(() => {
    const cats = new Set(groceryDatabase.map(item => item.category));
    return ['All', ...Array.from(cats)].sort();
  }, [groceryDatabase]);

  // Staples States
  const [newItemName, setNewItemName] = useState('');
  const [showStapleSuggestions, setShowStapleSuggestions] = useState(false);

  const stapleSuggestions = useMemo(() => {
    if (!newItemName.trim()) return [];
    const query = newItemName.toLowerCase();
    return groceryDatabase
      .filter(g => g.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [newItemName, groceryDatabase]);

  const handleQuickAddStaple = (name: string) => {
    if (!name.trim()) return;

    const matched = findGroceryDatabaseMatch(name, groceryDatabase);

    let finalName = name.trim();
    let finalUnit = 'item';
    let finalCategory = 'Dairy & Eggs';

    if (matched) {
      finalName = matched.name;
      finalUnit = matched.unit || finalUnit;
      finalCategory = matched.category || finalCategory;
    } else {
      // Auto-categorize using the imported getGroceryAisle utility
      const aisle = getGroceryAisle({ name: finalName });
      const catMap: Record<string, string> = {
        produce: 'Produce',
        meat_seafood: 'Meat & Seafood',
        dairy_eggs: 'Dairy & Eggs',
        grains_pasta: 'Grains & Pasta',
        canned_jars: 'Canned & Jars',
        bakery: 'Bakery',
        frozen: 'Frozen',
        pantry_spices: 'Pantry & Spices',
        household_other: 'Household & Other'
      };
      finalCategory = catMap[aisle] || 'Pantry & Spices';

      // Create a brand new item and add it to the grocery database state so that it is registered
      const newDbItem: GroceryItem = {
        id: `gdb-${Date.now()}`,
        name: finalName,
        unit: finalUnit,
        increment: 1,
        category: finalCategory
      };
      
      const updatedDb = [...groceryDatabase, newDbItem];
      if (store.updateGroceryDatabase) {
        store.updateGroceryDatabase(updatedDb);
      }
      showToast(`Added "${finalName}" to grocery database`);
    }

    const newRecItem = {
      id: crypto.randomUUID(),
      name: finalName,
      amount: 1, // Default qty to 1 like shopping list quick add
      unit: finalUnit,
      category: finalCategory
    };

    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = [...currentRecurring, newRecItem];
    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }

    setNewItemName('');
    setShowStapleSuggestions(false);
    showToast(`Added "${newRecItem.name}" to staples`);
  };

  const handleRemoveRecurringItem = (id: string, name: string) => {
    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = currentRecurring.filter(item => item.id !== id);
    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }
    showToast(`Removed "${name}"`);
  };

  const getStapleStep = (name: string): number => {
    const matched = findGroceryDatabaseMatch(name, groceryDatabase);
    return matched?.increment || 1;
  };

  const handleUpdateStapleQuantity = (id: string, delta: number) => {
    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = currentRecurring.map(item => {
      if (item.id === id) {
        const step = getStapleStep(item.name);
        const actualDelta = delta < 0 ? -step : step;
        const newAmount = Math.max(step, (item.amount || 1) + actualDelta);
        
        let nextUnit = item.unit;
        if (['item', 'items'].includes((item.unit || '').toLowerCase().trim())) {
          nextUnit = newAmount === 1 ? 'item' : 'items';
        }

        return {
          ...item,
          amount: Math.round(newAmount * 100) / 100,
          unit: nextUnit
        };
      }
      return item;
    });

    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }
  };

  const handleUpdateStapleQtyAndUnit = (id: string, amount: number, unit: string) => {
    const currentRecurring = prefs.recurringItems || [];
    const updatedRecurring = currentRecurring.map(item => {
      if (item.id === id) {
        return {
          ...item,
          amount: Math.max(0.1, amount),
          unit: unit
        };
      }
      return item;
    });

    store.updatePreferences({
      recurringItems: updatedRecurring
    });
    if (store.updateShoppingList) {
      const nextShoppingList = syncRecurringStaplesForAllPlans(
        store.state.mealPlans || [],
        store.state.shoppingList || [],
        updatedRecurring
      );
      store.updateShoppingList(nextShoppingList);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const favourites = useMemo<{ name: string; category: string }[]>(() => {
    if (store?.state?.preferences?.favouriteItems && store.state.preferences.favouriteItems.length > 0) {
      return store.state.preferences.favouriteItems;
    }
    try {
      const stored = localStorage.getItem('mealPlannerCustomFavouritesObj');
      if (stored) return JSON.parse(stored);
      const legacy = localStorage.getItem('mealPlannerCustomFavourites');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) return parsed.map((p: string) => ({ name: p, category: 'Staples' }));
      }
    } catch (err) {}
    return [];
  }, [store?.state?.preferences?.favouriteItems]);

  const toggleFavourite = (name: string, category: string = 'Staples') => {
    const exists = favourites.some(f => f.name.toLowerCase() === name.toLowerCase());
    const nextFavs = exists
      ? favourites.filter(f => f.name.toLowerCase() !== name.toLowerCase())
      : [...favourites, { name, category }];

    try {
      localStorage.setItem('mealPlannerCustomFavouritesObj', JSON.stringify(nextFavs));
    } catch (err) {}

    store.updatePreferences({ favouriteItems: nextFavs });
  };

  const pastPlans: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((p: MealPlan) => isPastWeek(p.startDate))
      .sort((a: MealPlan, b: MealPlan) => b.startDate.localeCompare(a.startDate));
  }, [store.state.mealPlans]);

  const filteredPastPlans = useMemo(() => {
    if (!searchArchive.trim()) return pastPlans;
    const q = searchArchive.toLowerCase();
    return pastPlans.filter(p => {
      const dateMatches = formatWeekRange(p.startDate).toLowerCase().includes(q) || p.startDate.includes(q);
      const meals = Object.values(p.days).flatMap(d => d.meals || []);
      const mealMatches = meals.some(m => 
        m.name.toLowerCase().includes(q) || 
        (m.note && m.note.toLowerCase().includes(q))
      );
      return dateMatches || mealMatches;
    });
  }, [pastPlans, searchArchive]);

  const prefs = store.state.preferences || {
    showPrepTime: true,
    showCookTime: true,
    showTotalTime: true,
    showMethod: true,
    showVegetarian: true,
    showVegan: true,
    defaultServings: 2,
    adultCount: 2,
    childCount: 0,
    currencySymbol: '£',
    weeklyBudgetLimit: 60,
    maxForwardWeeks: 4,
    preferredCookingMethod: 'all',
    ninjaModel: 'Ninja Combi 12-in-1',
    recurringItems: []
  };

  const availableTargetWeeks = useMemo(() => {
    const list: { startDate: string; label: string }[] = [];
    const maxWeeks = prefs.maxForwardWeeks || 4;
    for (let i = 0; i < maxWeeks; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i * 7);
      const iso = formatDateISO(d);
      const label = i === 0 ? `Current Week (${formatWeekStart(iso)})` : `In ${i} week${i > 1 ? 's' : ''} (${formatWeekStart(iso)})`;
      list.push({ startDate: iso, label });
    }
    return list;
  }, [currentMonday, prefs.maxForwardWeeks]);

  const copyWeekSummary = (plan: MealPlan) => {
    const lines: string[] = [];
    lines.push(`Meal Plan: ${formatWeekRange(plan.startDate)}`);
    lines.push(`Status: ${plan.status}`);
    const metrics = calculatePlanMetrics(plan);
    lines.push(`Total Meals: ${metrics.mealsCount}`);
    lines.push('');
    DAYS_OF_WEEK.forEach(d => {
      const day = plan.days[d];
      const meals = (day?.meals || []).map(m => {
        const note = m.note ? ` (${m.note})` : '';
        return `${m.name}${note}`;
      }).join(', ');
      lines.push(`${d} (${day?.date || ''}): ${meals || 'No meals'}`);
    });

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Week summary copied to clipboard!');
  };

  const exportBackup = () => {
    const dataStr = store.exportAllData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-planner-backup-${formatDateISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded successfully');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = store.importAllData(content);
        if (success) {
          showToast('Data restored successfully!');
        } else {
          showToast('Failed to restore data. Invalid JSON format.');
        }
      }
    };
    reader.readAsText(file);
  };

  // Export and Import Grocery Database specific actions
  const exportGroceryDatabaseJson = () => {
    try {
      const dataStr = JSON.stringify(groceryDatabase, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grocery_database_${formatDateISO(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Grocery database exported');
    } catch (e) {
      showToast('Failed to export grocery database');
    }
  };

  const handleImportGroceryDatabaseJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;

        const imported = JSON.parse(content);
        if (!Array.isArray(imported)) {
          showToast('Invalid format: Expected a JSON array');
          return;
        }

        const validatedItems: GroceryItem[] = [];
        for (let i = 0; i < imported.length; i++) {
          const item = imported[i];
          if (typeof item !== 'object' || item === null) continue;
          if (!item.name || typeof item.name !== 'string') continue;

          validatedItems.push({
            id: item.id && typeof item.id === 'string' ? item.id : `gdb-imported-${i}-${Date.now()}`,
            name: item.name.trim(),
            category: item.category && typeof item.category === 'string' ? item.category.trim() : 'Produce',
            unit: item.unit && typeof item.unit === 'string' ? item.unit.trim() : 'item',
            increment: typeof item.increment === 'number' ? Math.max(0.01, item.increment) : 1,
            aliases: Array.isArray(item.aliases) ? item.aliases.filter(a => typeof a === 'string') : []
          });
        }

        if (validatedItems.length === 0) {
          showToast('No valid grocery items found in file');
          return;
        }

        if (store.updateGroceryDatabase) {
          store.updateGroceryDatabase(validatedItems);
          showToast(`Imported ${validatedItems.length} grocery items!`);
        } else {
          showToast('Update database method not available');
        }
      } catch (err) {
        showToast('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // clear input
  };

  const calculatePlanMetrics = (plan: MealPlan) => {
    let mealsCount = 0;
    Object.values(plan.days).forEach(day => {
      (day.meals || []).forEach(meal => {
        if (meal.type !== 'no_meal') {
          mealsCount += 1;
        }
      });
    });
    return { mealsCount };
  };

  // Re-ordered tabs matching user's requested layout:
  // 1. past weeks, 2. grocery database, 3. my household, 4. system
  const sidebarItems = [
    { id: 'archive', label: 'past weeks', icon: History, desc: 'Clone and review completed plan history' },
    { id: 'grocery_db', label: 'grocery database', icon: BookOpen, desc: 'Standard shopping units and steps' },
    { id: 'household', label: 'my household', icon: Users, desc: 'Portions, when you eat & multi-cooker preferences' },
    { id: 'github', label: 'connections', icon: Cloud, desc: 'Sync with private GitHub Gist and configure Gemini AI' },
    { id: 'system', label: 'backup', icon: Download, desc: 'Download, restore and reset' }
  ] as const;

  return (
    <div className="h-full flex flex-col bg-zinc-50 overflow-hidden">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-300 stroke-[2.5]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Responsive Split Layout */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row max-w-4xl mx-auto w-full">
        
        {/* Navigation Horizontal Tabs (Mobile) / Vertical Tabs (Desktop) */}
        <nav className="lg:w-56 bg-white border-b lg:border-b-0 lg:border-r border-zinc-200 shrink-0 overflow-x-auto lg:overflow-y-auto flex lg:flex-col p-2 lg:p-3 gap-1 select-none scrollbar-none">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSubSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveSubSection(item.id);
                  // Reset search states on tab change to save vertical space
                  setShowArchiveSearch(false);
                  setShowDbSearch(false);
                  const mainContent = document.getElementById('settings-scroll-container');
                  if (mainContent) mainContent.scrollTop = 0;
                }}
                className={`flex items-center gap-2 px-3 py-1.5 lg:py-2 rounded-xl text-left transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                <div className="min-w-0">
                  <span className="text-xs block whitespace-nowrap lowercase">{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Scrollable Panel Area */}
        <div 
          id="settings-scroll-container"
          className="flex-1 overflow-y-auto min-h-0 bg-zinc-50/50"
        >
          <div className="p-4 sm:p-5 space-y-4">

            {/* SECTION 1: PAST WEEKS ARCHIVE */}
            {activeSubSection === 'archive' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  
                  {/* Collapsible Search and Header Row */}
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100/80">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-zinc-400" />
                      <h3 className="text-sm font-bold text-zinc-900 lowercase">past weeks</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Search Bar Collapsed into an Icon Button */}
                      {showArchiveSearch ? (
                        <div className="relative flex items-center animate-in fade-in slide-in-from-right-2 duration-150">
                          <input
                            type="text"
                            value={searchArchive}
                            onChange={(e) => setSearchArchive(e.target.value)}
                            placeholder="search completed plans..."
                            className="text-xs pl-3 pr-8 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 w-36 sm:w-48"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSearchArchive('');
                              setShowArchiveSearch(false);
                            }}
                            className="absolute right-2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowArchiveSearch(true)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                          title="Search plans"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Clear confirmation shortcut */}
                      {pastPlans.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Permanently clear all completed past weeks from archive?")) {
                              store.clearPastWeeks();
                              showToast('Cleared archive');
                            }
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Clear past plans"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {pastPlans.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center space-y-3">
                      <p className="text-xs text-zinc-500">No finished weeks yet.</p>
                      <p className="text-[11px] text-zinc-400">Once a week is over it appears here, where you can look back at it or copy it to a new week.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPastPlans.length === 0 ? (
                        <div className="text-center py-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-400">
                          No matching completed plans.
                        </div>
                      ) : (
                        filteredPastPlans.map(plan => {
                          const isExpanded = !!expandedPlanIds[plan.id];
                          const metrics = calculatePlanMetrics(plan);
                          const planTargetWeek = targetWeeks[plan.id] || templateTargetWeek;
                          
                          return (
                            <div
                              key={plan.id}
                              className={`bg-white border rounded-xl overflow-hidden transition-all duration-150 ${
                                isExpanded 
                                  ? 'border-zinc-950 ring-1 ring-zinc-950/5' 
                                  : 'border-zinc-200/80 hover:border-zinc-300'
                              }`}
                            >
                              {/* Summary Row */}
                              <div
                                onClick={() => setExpandedPlanIds(prev => ({ ...prev, [plan.id]: !prev[plan.id] }))}
                                className="px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none bg-white hover:bg-zinc-50/50"
                              >
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-zinc-900 block truncate">
                                    {formatWeekRange(plan.startDate)}
                                  </span>
                                  {/* Clean metadata without boxes */}
                                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                                    <span>{metrics.mealsCount} planned dinners</span>
                                    <span aria-hidden="true">·</span>
                                    <span>mon, {formatWeekStart(plan.startDate)}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedPlanIds(prev => ({ ...prev, [plan.id]: true }));
                                    }}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md text-[11px] font-bold cursor-pointer"
                                  >
                                    Reuse
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedPlanIds(prev => ({ ...prev, [plan.id]: !prev[plan.id] }));
                                    }}
                                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                  >
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                </div>
                              </div>

                              {/* Collapsible Re-use panel */}
                              {isExpanded && (
                                <div className="border-t border-zinc-100 bg-zinc-50/30 p-3 space-y-3">
                                  <div className="bg-zinc-900 text-white rounded-lg p-3 space-y-3.5 border border-zinc-800">
                                    <div className="min-w-0">
                                      <h4 className="text-[11px] font-bold text-white">Duplicate Whole Plan</h4>
                                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-normal">
                                        Clone this week's schedules directly into any active or upcoming week.
                                      </p>
                                    </div>
                                    
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                                      <div className="flex-1">
                                        <select
                                          value={planTargetWeek}
                                          onChange={(e) => setTargetWeeks(prev => ({ ...prev, [plan.id]: e.target.value }))}
                                          className="w-full text-xs px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-white focus:outline-none"
                                        >
                                          {availableTargetWeeks.map(target => (
                                            <option key={target.startDate} value={target.startDate}>{target.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      
                                      <button
                                        type="button"
                                        onClick={() => {
                                          store.duplicatePlanToWeek(plan.id, planTargetWeek);
                                          showToast(`Copied template to week of ${formatWeekStart(planTargetWeek)}`);
                                          if (onNavigateTab) {
                                            setTimeout(() => onNavigateTab('planning'), 600);
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-950 text-[11px] font-bold rounded-md transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                      >
                                        <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                        <span>Apply</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Simple Breakdown */}
                                  <div className="space-y-1">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {DAYS_OF_WEEK.map(dayName => {
                                        const day = plan.days[dayName];
                                        const meals = day?.meals || [];
                                        return (
                                          <div key={dayName} className="p-2 bg-white rounded-lg border border-zinc-200 text-[11px]">
                                            <div className="flex items-center justify-between font-bold border-b border-zinc-100 pb-1 text-[11px] text-zinc-500">
                                              <span>{dayName}</span>
                                              <span>{day?.date}</span>
                                            </div>
                                            {meals.length === 0 ? (
                                              <span className="text-zinc-400 italic block mt-1">no meals</span>
                                            ) : (
                                              meals.map(meal => (
                                                <div key={meal.id} className="mt-1 flex items-center justify-between text-zinc-700 font-medium">
                                                  <span className="truncate">{meal.name}</span>
                                                  {/* Metadata unboxed text */}
                                                  <span className="text-[11px] text-zinc-400 shrink-0 font-semibold lowercase">
                                                    · {meal.type}
                                                  </span>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="flex justify-end pt-1">
                                      <button
                                        type="button"
                                        onClick={() => copyWeekSummary(plan)}
                                        className="text-[11px] font-bold text-zinc-500 hover:text-zinc-800 hover:underline flex items-center gap-1"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>Copy text breakdown</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 3: GROCERY DATABASE MANAGER */}
            {activeSubSection === 'grocery_db' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* 🧹 Grocery Database Health Card */}
                <div className="bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/40 rounded-2xl border border-indigo-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
                            🧹 Grocery Database Health
                          </h3>
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                            Gemini AI
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 leading-normal">
                          Scan your item catalog for duplicates, inconsistent naming, and aisle misclassifications using AI.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-indigo-100/70">
                    <button
                      type="button"
                      onClick={() => setIsCleanDbModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer hover:shadow-indigo-200"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Run Database Clean-Up</span>
                    </button>
                    <span className="text-[11px] text-zinc-500 italic">
                      Reconciles aliases, merges duplicates, and optimizes smart aggregation.
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  
                  {/* Collapsed Search and Header Bar */}
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100/80">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-zinc-400" />
                      <h3 className="text-sm font-bold text-zinc-900 lowercase">grocery database</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      
                      {/* Search bar collapsed into a search icon button */}
                      {showDbSearch ? (
                        <div className="relative flex items-center animate-in fade-in slide-in-from-right-2 duration-150">
                          <input
                            type="text"
                            value={dbSearch}
                            onChange={(e) => setDbSearch(e.target.value)}
                            placeholder="search database..."
                            className="text-xs pl-3 pr-8 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 w-36 sm:w-48"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setDbSearch('');
                              setShowDbSearch(false);
                            }}
                            className="absolute right-2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowDbSearch(true)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                          title="Search items"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Trigger Add Item popup modal instead of inline form */}
                      <button
                        type="button"
                        onClick={() => {
                          setDbNewName('');
                          setDbNewUnit('g');
                          setDbNewIncrement(100);
                          setDbNewCategory('Produce');
                          setIsAddPopupOpen(true);
                        }}
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors cursor-pointer"
                        title="Add database item"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {/* Reset Presets */}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Restore the default grocery database presets? This overrides all customized units.")) {
                            if (store.updateGroceryDatabase) {
                              store.updateGroceryDatabase(INITIAL_GROCERY_DATABASE);
                              showToast('Reset presets');
                            }
                          }
                        }}
                        className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                        title="Reset database presets"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Filter and JSON Import/Export Actions Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <select
                      value={dbCategoryFilter}
                      onChange={(e) => setDbCategoryFilter(e.target.value)}
                      className="text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none text-zinc-700 font-semibold cursor-pointer shadow-3xs"
                    >
                      <option value="All">All Categories</option>
                      {uniqueDbCategories.filter(c => c !== 'All').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1.5">
                      {/* JSON Export Button */}
                      <button
                        type="button"
                        onClick={exportGroceryDatabaseJson}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-lg text-xs font-semibold cursor-pointer shadow-3xs"
                        title="Export database as JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Database JSON</span>
                      </button>

                      {/* JSON Import Button */}
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-lg text-xs font-semibold cursor-pointer shadow-3xs">
                        <Upload className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Import Database JSON</span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportGroceryDatabaseJson}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Touch/Mobile-friendly List View instead of a heavy overflowing table */}
                  <div className="divide-y divide-zinc-100 border border-zinc-200/80 rounded-2xl overflow-hidden shadow-4xs bg-white max-h-96 overflow-y-auto">
                    {filteredGroceryItems.length === 0 ? (
                      <div className="p-8 text-center text-zinc-500 italic text-xs">
                        No matching grocery database items.
                      </div>
                    ) : (
                      filteredGroceryItems.map(item => (
                        <div 
                          key={item.id} 
                          className="p-3 hover:bg-zinc-50/40 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-xs sm:text-sm text-zinc-900 block truncate">
                              {item.name}
                            </span>
                            {/* Metadata unboxed text with typographic middots */}
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-medium mt-0.5 lowercase">
                              <span>{item.category}</span>
                              <span aria-hidden="true" className="text-zinc-300">·</span>
                              <span>step: {item.increment} {item.unit || 'item'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                // Open edit popup modal
                                setEditingItemId(item.id);
                                setEditingItemName(item.name);
                                setEditingItemUnit(item.unit);
                                setEditingItemIncrement(item.increment);
                                setEditingItemCategory(item.category);
                              }}
                              className="px-2.5 py-1.5 text-[11px] font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteGroceryItem(item.id, item.name)}
                              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: MY HOUSEHOLD */}
            {activeSubSection === 'household' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Users className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase">household configuration</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    
                    {/* Member selection */}
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 flex flex-col justify-between">
                      <div>
                        <label className="text-xs font-semibold text-zinc-900 block">Active Planner</label>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentDeviceIdentity('P');
                            showToast("Switched member to Peter");
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                            activeMember === 'P'
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                              : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          Peter (P)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentDeviceIdentity('R');
                            showToast("Switched member to Rachel");
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                            activeMember === 'R'
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                              : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          Rachel (R)
                        </button>
                      </div>
                    </div>

                    {/* Portion sizes */}
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                      <label className="text-xs font-semibold text-zinc-900 block">Default Portions</label>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => store.updatePreferences({ defaultServings: Math.max(1, (prefs.defaultServings || 2) - 1) })}
                          className="w-8 h-8 rounded-lg border border-zinc-200 bg-white flex items-center justify-center text-zinc-600 hover:bg-zinc-100 font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-sm font-bold w-6 text-center tabular-nums">{prefs.defaultServings || 2}</span>
                        <button
                          type="button"
                          onClick={() => store.updatePreferences({ defaultServings: Math.min(12, (prefs.defaultServings || 2) + 1) })}
                          className="w-8 h-8 rounded-lg border border-zinc-200 bg-white flex items-center justify-center text-zinc-600 hover:bg-zinc-100 font-bold cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-[11px] text-zinc-500">portions</span>
                      </div>
                    </div>

                    {/* When you eat: the Cook tab works out when to start from it */}
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2" data-setting-eat-at>
                      <label htmlFor="setting-eat-at" className="text-xs font-semibold text-zinc-900 block">We usually eat at</label>
                      <div className="flex items-center gap-2.5">
                        <input
                          id="setting-eat-at"
                          type="time"
                          value={parseClock(prefs.eatAt) !== null ? prefs.eatAt : DEFAULT_EAT_AT}
                          onChange={(e) => { if (parseClock(e.target.value) !== null) store.updatePreferences({ eatAt: e.target.value }); }}
                          className="h-9 px-2 bg-white border border-zinc-200 rounded-lg text-sm font-bold tabular-nums focus:outline-none focus:border-emerald-500"
                          data-setting-eat-at-input
                        />
                        <span className="text-[11px] text-zinc-500 leading-snug">The Cook tab says when to start cooking to eat at this time. You can change it just for one evening there.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hardware card */}
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Zap className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase">appliances & hardware</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-semibold text-zinc-700 block">Multi-Cooker Model</label>
                      <input
                        type="text"
                        placeholder="e.g. Ninja Combi 12-in-1"
                        value={prefs.ninjaModel || 'Ninja Combi 12-in-1'}
                        onChange={(e) => store.updatePreferences({ ninjaModel: e.target.value })}
                        className="w-full mt-1.5 text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-700 block">Cooking Method focus</label>
                      <select
                        value={prefs.preferredCookingMethod || 'all'}
                        onChange={(e) => store.updatePreferences({ preferredCookingMethod: e.target.value as any })}
                        className="w-full mt-1.5 text-xs px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none font-medium cursor-pointer"
                      >
                        <option value="all">all methods</option>
                        <option value="ninja">ninja combi focus</option>
                        <option value="oven_hob">traditional oven & hob</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: GITHUB CLOUD SYNC */}
            {activeSubSection === 'github' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Cloud className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase font-semibold">cloud sync (github gist)</h3>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-normal">
                    Store and synchronize your recipes, meal plans, shopping lists, and preferences privately inside a GitHub Gist.
                    {store.githubConfig && (
                      <> Changes upload automatically, and the other phone's changes appear within about {store.syncPollSeconds || 20} seconds while the app is open.</>
                    )}
                  </p>

                  {store.githubConfig ? (
                    // Configured State
                    <div className="space-y-4">
                      <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-zinc-500">Sync Status:</span>
                          <span className={`font-bold px-2 py-0.5 rounded text-[11px] uppercase ${
                            store.syncStatus === 'synced' ? 'bg-emerald-100 text-emerald-700' :
                            store.syncStatus === 'loading' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                            store.syncStatus === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-700'
                          }`}>
                            {store.syncStatus}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-zinc-500">Gist ID:</span>
                          <span className="font-mono text-zinc-800 break-all bg-white px-1.5 py-0.5 border border-zinc-200 rounded">{store.githubConfig.gistId}</span>
                        </div>
                        {store.lastSynced && (
                          <div className="flex justify-between items-center text-[11px] text-zinc-500">
                            <span>Last Synced:</span>
                            <span>{store.lastSynced.toLocaleTimeString()}</span>
                          </div>
                        )}
                        {store.syncError && (
                          <div className="p-2 bg-rose-50 text-rose-700 text-[11px] rounded border border-rose-100 font-medium">
                            Error: {store.syncError}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await store.manualSync();
                            showToast("Database synced successfully!");
                          }}
                          disabled={store.syncStatus === 'loading'}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs animate-none"
                        >
                          {store.syncStatus === 'loading' ? 'Syncing...' : 'Sync Now'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Disconnect cloud sync? Your local data remains safe, but Gist cloud sync will stop.")) {
                              store.clearGithubConfig();
                              showToast("Cloud sync disconnected");
                            }
                          }}
                          className="px-3.5 py-2 bg-white hover:bg-zinc-100 text-rose-600 border border-zinc-200 hover:border-zinc-300 font-bold rounded-xl text-xs cursor-pointer shadow-3xs"
                        >
                          Disconnect Cloud Sync
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Setup Form State
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const mode = (target.elements.namedItem('syncMode') as HTMLSelectElement).value as 'pull' | 'push' | 'merge';
                      
                      try {
                        await store.saveGithubConfig(localPat, localGistId, mode);
                        showToast("Successfully connected and synced!");
                      } catch (err: any) {
                        showToast(err.message || "Failed to connect to Gist.");
                      }
                    }} className="space-y-4">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                          GitHub Personal Access Token (PAT)
                        </label>
                        <input
                          name="pat"
                          type="password"
                          required
                          value={localPat}
                          onChange={(e) => setLocalPat(e.target.value)}
                          placeholder="ghp_..."
                          className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                        />
                        <span className="text-[11px] text-zinc-400 block mt-1">
                          Needs 'gist' permission. You can generate one in GitHub Settings &gt; Developer settings.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                            Gist ID (Leave empty to create new)
                          </label>
                          <input
                            name="gistId"
                            type="text"
                            value={localGistId}
                            onChange={(e) => setLocalGistId(e.target.value)}
                            placeholder="Optional"
                            className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                            Initial Sync Strategy
                          </label>
                          <select
                            name="syncMode"
                            className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:bg-white transition-all font-semibold text-zinc-700 cursor-pointer shadow-3xs"
                          >
                            <option value="merge">Merge Gist & Local Data (Recommended)</option>
                            <option value="pull">Pull Gist Data (Overwrite Local)</option>
                            <option value="push">Push Local Data (Overwrite Gist)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                        <button
                          type="submit"
                          className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                        >
                          Connect Existing Gist
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!localPat.trim()) {
                              alert("Please enter your GitHub Personal Access Token first!");
                              return;
                            }
                            try {
                              const newId = await store.createGistFromLocal(localPat);
                              showToast(`Private Gist created successfully: ${newId}`);
                            } catch (err: any) {
                              showToast(err.message || "Failed to create private Gist.");
                            }
                          }}
                          className="flex-1 px-4 py-2.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 hover:border-zinc-300 font-bold rounded-xl text-xs cursor-pointer shadow-3xs transition-colors"
                        >
                          Create New Private Gist
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* GEMINI AI API CARD */}
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs mt-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase font-semibold">gemini ai (bring your own key)</h3>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-normal">
                    This application uses a client-side <strong>Bring Your Own Key (BYOK)</strong> pattern. Your Gemini API key is stored securely in your browser's local storage and used directly to communicate with Google's API, ensuring 100% serverless, private, and static-ready hosting.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                        Gemini API Key
                      </label>
                      <input
                        type="password"
                        value={localGeminiKey}
                        onChange={(e) => setLocalGeminiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                      />
                      <span className="text-[11px] text-zinc-400 block mt-1">
                        Get a free or paid API key from the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google AI Studio Console</a>.
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (localGeminiKey.trim()) {
                            localStorage.setItem('gemini_api_key', localGeminiKey.trim());
                            showToast("Gemini API key saved successfully!");
                          } else {
                            localStorage.removeItem('gemini_api_key');
                            showToast("Gemini API key cleared.");
                          }
                        }}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                      >
                        Save API Key
                      </button>

                      {localStorage.getItem('gemini_api_key') && (
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.removeItem('gemini_api_key');
                            setLocalGeminiKey('');
                            showToast("Gemini API key deleted.");
                          }}
                          className="px-3.5 py-2 bg-white hover:bg-zinc-100 text-rose-600 border border-zinc-200 hover:border-zinc-300 font-bold rounded-xl text-xs cursor-pointer shadow-3xs"
                        >
                          Clear Key
                        </button>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* SECTION 5: SYSTEM & BACKUPS */}
            {activeSubSection === 'system' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Sparkles className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase">tidy the grocery list</h3>
                  </div>

                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                    <p className="text-[11px] text-zinc-500 leading-normal">
                      Gemini looks for duplicate or oddly named products on your grocery list and suggests merges. You approve each change.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsCleanDbModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Run AI Catalog Clean-Up</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                    <Download className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-zinc-900 lowercase">backups</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={exportBackup}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Backup JSON</span>
                    </button>

                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-3xs">
                      <Upload className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Restore Backup</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowResetSettingsModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-zinc-500 hover:text-zinc-900 text-xs font-semibold hover:bg-zinc-100 rounded-lg transition-colors ml-auto cursor-pointer"
                    >
                      <span>Reset preferences</span>
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>

      {/* Insert Database Item Popup Modal */}
      {isAddPopupOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
          <div 
            className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-zinc-200/80 overflow-hidden animate-in slide-in-from-bottom-4 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">add database item</h3>
              <button 
                type="button" 
                onClick={() => setIsAddPopupOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              handleAddGroceryItem(e);
              setIsAddPopupOpen(false);
            }} className="p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Baby Spinach, Chicken Breast"
                  value={dbNewName}
                  onChange={(e) => setDbNewName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Standard Unit</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. g, ml, whole, tin"
                    value={dbNewUnit}
                    onChange={(e) => setDbNewUnit(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Step Increment</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={dbNewIncrement}
                    onChange={(e) => setDbNewIncrement(parseFloat(e.target.value) || 100)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Aisle Category</label>
                <select
                  value={dbNewCategory}
                  onChange={(e) => setDbNewCategory(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all font-semibold text-zinc-700 cursor-pointer shadow-3xs"
                >
                  <option value="Produce">Produce</option>
                  <option value="Meat">Meat</option>
                  <option value="Fish">Fish</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Canned">Canned</option>
                  <option value="Pasta">Pasta</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Household">Household</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setIsAddPopupOpen(false)}
                  className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Grocery Item Popup Modal */}
      {editingItemId && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
          <div 
            className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-zinc-200/80 overflow-hidden animate-in slide-in-from-bottom-4 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">edit database item</h3>
              <button 
                type="button" 
                onClick={() => setEditingItemId(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={editingItemName}
                  onChange={(e) => setEditingItemName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Standard Unit</label>
                  <input
                    type="text"
                    required
                    value={editingItemUnit}
                    onChange={(e) => setEditingItemUnit(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Step Increment</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={editingItemIncrement}
                    onChange={(e) => setEditingItemIncrement(parseFloat(e.target.value) || 1)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Aisle Category</label>
                <select
                  value={editingItemCategory}
                  onChange={(e) => setEditingItemCategory(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all font-semibold text-zinc-700 cursor-pointer shadow-3xs"
                >
                  <option value="Produce">Produce</option>
                  <option value="Meat">Meat</option>
                  <option value="Fish">Fish</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Canned">Canned</option>
                  <option value="Pasta">Pasta</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Household">Household</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setEditingItemId(null)}
                  className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditGroceryItem}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Reset Preferences Confirmation Modal */}
      {showResetSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-zinc-200 space-y-4">
            <div className="text-center space-y-1.5">
              <h3 className="text-sm font-bold text-zinc-900">Reset preferences?</h3>
              <p className="text-xs text-zinc-500">
                This will reset all your family sizes, display units, and cooking preferences to factory defaults. Your recipes and meal plans are unaffected.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetSettingsModal(false)}
                className="w-full py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  store.resetPreferences();
                  setShowResetSettingsModal(false);
                  showToast('Preferences reset');
                }}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Database Clean-Up & Reconciliation Modal */}
      <CleanDatabaseModal
        isOpen={isCleanDbModalOpen}
        onClose={() => setIsCleanDbModalOpen(false)}
        groceryItems={hydratedCatalog}
        onApplyChanges={handleApplyCleanChanges}
        showToast={showToast}
        onNavigateTab={onNavigateTab}
      />

      {/* Recipe Details Modal */}
      {viewingRecipe && (
        <RecipeModal
          store={store}
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
        />
      )}
    </div>
  );
}
