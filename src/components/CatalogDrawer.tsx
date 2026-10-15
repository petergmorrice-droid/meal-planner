import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Heart, Store, X, Plus, Clock, ArrowDownAZ, LayoutGrid } from 'lucide-react';
import { buildCatalog } from '../shopping';

interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: { name: string; amount: number; unit: string; category?: string; isAdhoc?: boolean }[]) => void;
  store: any;
  onToggleFavourite: (name: string, category: string) => void;
}

type SortMode = 'favorites' | 'recent' | 'category' | 'az';

export default function CatalogDrawer({ isOpen, onClose, onAddItems, store, onToggleFavourite }: CatalogDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('favorites');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const favourites = store?.state?.preferences?.favouriteItems || [];
  const shoppingList = store?.state?.shoppingList || [];

  const getAddedAmount = (name: string) => {
    return shoppingList
      .filter((i: any) => i.name.toLowerCase() === name.toLowerCase())
      .reduce((sum: number, i: any) => sum + i.amount, 0);
  };

  const allItems = useMemo(() => {
    const map = new Map<string, { name: string; category: string; isFav: boolean; recentCount: number; source: string }>();

    // Your grocery list (with your own items and edits), one entry per product.
    buildCatalog(store?.state?.groceryDatabase, store?.state?.groceryOverrides).products
      .filter(p => !p.sameAs)
      .forEach(p => {
        map.set(p.name.toLowerCase(), { name: p.name, category: p.category || 'Other', isFav: false, recentCount: 0, source: 'db' });
      });

    favourites.forEach((fav: any) => {
      const key = fav.name.toLowerCase();
      if (map.has(key)) {
        map.get(key)!.isFav = true;
      } else {
        map.set(key, { name: fav.name, category: fav.category || 'Other', isFav: true, recentCount: 0, source: 'fav' });
      }
    });

    shoppingList.forEach((item: any) => {
      const key = item.name.toLowerCase();
      if (map.has(key)) {
        map.get(key)!.recentCount += 1;
      } else {
        map.set(key, { name: item.name, category: item.category || 'Other', isFav: false, recentCount: 1, source: 'shopping' });
      }
    });

    return Array.from(map.values());
  }, [favourites, shoppingList, store?.state?.groceryDatabase, store?.state?.groceryOverrides]);

  const filteredAndSortedItems = useMemo(() => {
    let filtered = allItems;
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(lowerSearch));
    }

    // Sort based on mode
    return filtered.sort((a, b) => {
      if (sortMode === 'favorites') {
        if (a.isFav && !b.isFav) return -1;
        if (!a.isFav && b.isFav) return 1;
        if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'recent') {
        if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'category') {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'az') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [allItems, searchTerm, sortMode]);

  const handleQuickAdd = (name: string, category?: string) => {
    onAddItems([{
      name,
      amount: 1,
      unit: '',
      category: category || 'Other',
      isAdhoc: true
    }]);
  };

  // Group items for display if not searching
  const groupedItems = useMemo(() => {
    if (searchTerm.trim()) {
      return [{ title: 'Search Results', items: filteredAndSortedItems }];
    }
    
    if (sortMode === 'favorites') {
      const favs = filteredAndSortedItems.filter(i => i.isFav);
      const recent = filteredAndSortedItems.filter(i => !i.isFav && i.recentCount > 0);
      const others = filteredAndSortedItems.filter(i => !i.isFav && i.recentCount === 0);
      
      const groups = [];
      if (favs.length > 0) groups.push({ title: 'Favorites', items: favs });
      if (recent.length > 0) groups.push({ title: 'Frequently Added', items: recent });
      if (others.length > 0) groups.push({ title: 'Other Items', items: others });
      return groups;
    }
    
    if (sortMode === 'category') {
      const groupsMap = new Map<string, typeof filteredAndSortedItems>();
      filteredAndSortedItems.forEach(item => {
        if (!groupsMap.has(item.category)) groupsMap.set(item.category, []);
        groupsMap.get(item.category)!.push(item);
      });
      return Array.from(groupsMap.entries()).map(([title, items]) => ({ title, items }));
    }
    
    return [{ title: sortMode === 'recent' ? 'All Items (Most Frequent First)' : 'All Items (A-Z)', items: filteredAndSortedItems }];
  }, [filteredAndSortedItems, sortMode, searchTerm]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 z-50 transition-opacity backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 top-16 md:top-24 bg-white rounded-t-3xl z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300">
        
        {/* Header / Search */}
        <div className="p-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900">Add Items</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  handleQuickAdd(searchTerm.trim());
                  setSearchTerm('');
                }
              }}
              placeholder="Search or type new item..."
              className="w-full bg-zinc-100/80 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-2xl py-3 pl-9 pr-4 text-[15px] font-medium transition-all"
            />
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button 
              onClick={() => setSortMode('favorites')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${sortMode === 'favorites' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              <Heart className={`w-3.5 h-3.5 ${sortMode === 'favorites' ? 'fill-current' : ''}`} />
              Favorites First
            </button>
            <button 
              onClick={() => setSortMode('recent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${sortMode === 'recent' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              Frequently Added
            </button>
            <button 
              onClick={() => setSortMode('category')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${sortMode === 'category' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Category
            </button>
            <button 
              onClick={() => setSortMode('az')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${sortMode === 'az' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              <ArrowDownAZ className="w-3.5 h-3.5" />
              A-Z
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#fafafa]">
          
          {groupedItems.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-6 last:mb-0">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 px-1 sticky top-0 bg-[#fafafa]/90 backdrop-blur py-1 z-10">
                {group.title}
              </h3>
              
              <div className={group.title === 'Favorites' ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-1.5"}>
                {group.items.map(item => {
                  const amount = getAddedAmount(item.name);
                  const isGrid = group.title === 'Favorites';
                  
                  if (isGrid) {
                    return (
                      <div
                        key={item.name}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleQuickAdd(item.name, item.category)}
                        className="relative flex flex-col items-start p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs hover:border-emerald-300 hover:shadow-md transition-all active:scale-95 group cursor-pointer"
                      >
                        <div className="flex items-start justify-between w-full mb-1">
                          <span className="font-semibold text-sm text-zinc-900 truncate pr-2">
                            {item.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavourite(item.name, item.category);
                            }}
                            className={`p-1 -m-1 rounded-full hover:bg-rose-50 ${item.isFav ? 'text-rose-500' : 'text-zinc-300 hover:text-rose-500'}`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${item.isFav ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                        <span className="text-[11px] font-medium text-zinc-400">
                          {item.category}
                        </span>
                        
                        {amount > 0 && (
                          <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                            {amount}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs group cursor-pointer"
                      onClick={() => handleQuickAdd(item.name, item.category)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <Store className="w-4 h-4 text-zinc-400 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-sm text-zinc-900 truncate">
                            {item.name}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-400 truncate">
                            {item.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {amount > 0 && (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {amount} added
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavourite(item.name, item.category);
                          }}
                          className={`p-1.5 rounded-full transition-colors ${item.isFav ? 'text-rose-500 hover:bg-rose-50' : 'text-zinc-300 hover:text-rose-500 hover:bg-rose-50'}`}
                          title={item.isFav ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart className={`w-4 h-4 ${item.isFav ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAdd(item.name, item.category);
                          }}
                          className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-700 hover:bg-emerald-100 hover:text-emerald-700 flex items-center justify-center transition-colors active:scale-95"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Custom item quick add if no perfect match in search */}
          {searchTerm.trim() && !filteredAndSortedItems.some(f => f.name.toLowerCase() === searchTerm.trim().toLowerCase()) && (
            <div className="mt-4 pt-4 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  handleQuickAdd(searchTerm.trim());
                  setSearchTerm('');
                }}
                className="w-full flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <div className="flex flex-col items-start">
                  <span className="font-bold text-sm">Add "{searchTerm.trim()}"</span>
                  <span className="text-[11px] opacity-80">Custom Item</span>
                </div>
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
          
          {filteredAndSortedItems.length === 0 && !searchTerm.trim() && (
             <div className="text-center py-12">
               <p className="text-zinc-400 text-sm">No items found.</p>
             </div>
          )}
        </div>
      </div>
    </>
  );
}
