import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Sparkles, Database, Search, Check, Plus, Tag, ArrowRight, Pencil } from 'lucide-react';
import Fuse from 'fuse.js';
import { buildCatalog } from '../shopping';
import { GroceryItem } from '../types';

interface TriageItem {
  ingredient: any;
  suggestions: GroceryItem[];
}

export interface TriageMapping {
  originalName: string;
  mappedGroceryId: string;
  mappedGroceryName: string;
  always: boolean;
}

export function IngredientTriageModal({ 
  store,
  unmappedItems,
  onComplete
}: { 
  store: any;
  unmappedItems: TriageItem[];
  onComplete: (mappings: TriageMapping[]) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mappings, setMappings] = useState<TriageMapping[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentItem = unmappedItems[currentIndex];

  // Preserve the raw initial ingredient name so pendingRecipe.ingredients mapping match always succeeds
  const initialNamesRef = useRef<Record<number, string>>({});
  if (currentItem && !initialNamesRef.current[currentIndex]) {
    initialNamesRef.current[currentIndex] = currentItem.ingredient.name;
  }
  const originalIngredientName = initialNamesRef.current[currentIndex] || currentItem?.ingredient?.name || '';

  // Inline editing state for the current recipe ingredient
  const [isEditingIngredient, setIsEditingIngredient] = useState(false);
  const [editName, setEditName] = useState(currentItem?.ingredient?.name || '');
  const [editAmount, setEditAmount] = useState<number | string>(currentItem?.ingredient?.amount ?? 1);
  const [editUnit, setEditUnit] = useState(currentItem?.ingredient?.unit || '');
  const [editAisle, setEditAisle] = useState(currentItem?.ingredient?.suggestedAisle || 'Pantry');

  // Dynamic suggestions that update if the ingredient name is edited
  const [activeSuggestions, setActiveSuggestions] = useState<GroceryItem[]>(currentItem?.suggestions || []);

  // Sync state on navigation between unmapped items
  useEffect(() => {
    setSearchQuery('');
    if (currentItem) {
      setIsEditingIngredient(false);
      setEditName(currentItem.ingredient.name || '');
      setEditAmount(currentItem.ingredient.amount ?? 1);
      setEditUnit(currentItem.ingredient.unit || '');
      setEditAisle(currentItem.ingredient.suggestedAisle || 'Pantry');
      setActiveSuggestions(currentItem.suggestions || []);
    }
  }, [currentIndex, currentItem]);

  // Build the complete, unified grocery catalog from default DB + user overrides
  // The same product list the shopping list uses: your grocery list with your edits and custom items.
  const allGroceryItems = useMemo<GroceryItem[]>(() => {
    const catalog = buildCatalog(store?.state?.groceryDatabase, store?.state?.groceryOverrides);
    return catalog.products
      .filter(p => !p.sameAs)
      .map(p => p.item)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [store?.state?.groceryDatabase, store?.state?.groceryOverrides]);

  // Fuse search index
  const fuse = useMemo(() => {
    return new Fuse(allGroceryItems, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'aliases', weight: 0.5 },
        { name: 'category', weight: 0.2 }
      ],
      threshold: 0.35,
      ignoreLocation: true
    });
  }, [allGroceryItems]);

  // Filtered search results (combining exact substring and fuzzy)
  const searchResults = useMemo<GroceryItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const substringMatches = allGroceryItems.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const aliasMatch = Array.isArray(item.aliases) && item.aliases.some(a => a.toLowerCase().includes(q));
      return nameMatch || aliasMatch;
    });

    const fuzzyMatches = fuse.search(q).map(res => res.item);

    const seenIds = new Set<string>();
    const combined: GroceryItem[] = [];

    for (const item of [...substringMatches, ...fuzzyMatches]) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push(item);
      }
    }

    return combined.slice(0, 15);
  }, [searchQuery, allGroceryItems, fuse]);

  const handleSaveIngredientEdit = () => {
    if (!currentItem) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;

    // Mutate the live ingredient object
    currentItem.ingredient.name = trimmedName;
    currentItem.ingredient.amount = parseFloat(String(editAmount)) || currentItem.ingredient.amount || 1;
    currentItem.ingredient.unit = editUnit.trim();
    currentItem.ingredient.suggestedAisle = editAisle;

    // Recalculate candidate suggestions based on the updated name
    const updatedSuggestions = fuse.search(trimmedName).slice(0, 3).map(r => r.item);
    setActiveSuggestions(updatedSuggestions);
    currentItem.suggestions = updatedSuggestions;

    setIsEditingIngredient(false);
  };

  const handleMatch = (suggestion: GroceryItem, always: boolean) => {
    if (always) {
      const existing = store.state.groceryOverrides?.[suggestion.id] || {};
      const existingAliases = existing.aliases || suggestion.aliases || [];
      const aliasesToAdd = [currentItem.ingredient.name];
      if (originalIngredientName && originalIngredientName !== currentItem.ingredient.name) {
        aliasesToAdd.push(originalIngredientName);
      }
      const newAliases = [...new Set([...existingAliases, ...aliasesToAdd])];
      store.updateGroceryOverride(suggestion.id, {
        ...existing,
        aliases: newAliases
      });
    }
    
    const newMappings = [...mappings, {
      originalName: originalIngredientName,
      mappedGroceryId: suggestion.id,
      mappedGroceryName: suggestion.name,
      always
    }];
    setMappings(newMappings);
    nextOrComplete(newMappings);
  };

  const handleAddNew = (customName?: string) => {
    const nameToAdd = customName || currentItem.ingredient.name;
    const newId = `gdb-custom-${crypto.randomUUID()}`;
    const aliases = [nameToAdd];
    if (originalIngredientName && originalIngredientName !== nameToAdd) {
      aliases.push(originalIngredientName);
    }

    const newItem: Partial<GroceryItem> = {
      id: newId,
      name: nameToAdd,
      category: currentItem.ingredient.suggestedAisle || editAisle || 'Pantry',
      unit: currentItem.ingredient.unit || editUnit || 'unit',
      increment: 1,
      cost: currentItem.ingredient.estimatedCost || 0,
      aliases: [...new Set(aliases)]
    };
    store.updateGroceryOverride(newId, newItem);
    
    const newMappings = [...mappings, {
      originalName: originalIngredientName,
      mappedGroceryId: newId,
      mappedGroceryName: nameToAdd,
      always: true
    }];
    setMappings(newMappings);
    nextOrComplete(newMappings);
  };

  const handleSkip = () => {
    const newMappings = [...mappings, {
      originalName: originalIngredientName,
      mappedGroceryId: '',
      mappedGroceryName: currentItem.ingredient.name,
      always: false
    }];
    setMappings(newMappings);
    nextOrComplete(newMappings);
  };

  const nextOrComplete = (currentMappings: TriageMapping[]) => {
    if (currentIndex < unmappedItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete(currentMappings);
    }
  };

  if (!currentItem) return null;

  const getCategoryBadgeClass = (category?: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('meat') || cat.includes('fish') || cat.includes('seafood')) {
      return 'bg-rose-50 text-rose-700 border-rose-200/70';
    }
    if (cat.includes('produce') || cat.includes('fruit') || cat.includes('veg')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
    }
    if (cat.includes('dairy') || cat.includes('egg')) {
      return 'bg-sky-50 text-sky-700 border-sky-200/70';
    }
    if (cat.includes('bakery') || cat.includes('bread')) {
      return 'bg-amber-50 text-amber-700 border-amber-200/70';
    }
    if (cat.includes('frozen')) {
      return 'bg-cyan-50 text-cyan-700 border-cyan-200/70';
    }
    return 'bg-stone-50 text-stone-700 border-stone-200/70';
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 pb-safe max-h-[92vh] sm:max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-amber-50 px-5 py-3.5 border-b border-amber-100/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">Map Ingredient</span>
                <span className="text-[11px] font-extrabold bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded-full font-mono">
                  {currentIndex + 1} of {unmappedItems.length}
                </span>
              </div>
              <p className="text-[11px] text-amber-700/90 leading-tight">
                Match to your grocery database for accurate shopping lists.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 px-2 py-1 rounded-lg hover:bg-amber-100/80 transition-colors cursor-pointer"
            title="Keep original name and proceed"
          >
            Skip
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 flex flex-col gap-4 bg-zinc-50/60 overflow-y-auto flex-1 scrollbar-thin">
          
          {/* Target Unrecognized Ingredient Card */}
          <div className={`bg-white border rounded-xl p-3.5 shadow-3xs shrink-0 transition-all ${
            isEditingIngredient ? 'border-indigo-400 ring-2 ring-indigo-500/10 shadow-xs' : 'border-zinc-200/90'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                {activeSuggestions.length === 0 ? 'Suggested Grocery Name' : 'Recipe Ingredient'}
              </span>
              <div className="flex items-center gap-1.5">
                {currentItem.ingredient.suggestedAisle && !isEditingIngredient && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-150">
                    <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                    <span>Aisle: {currentItem.ingredient.suggestedAisle}</span>
                  </span>
                )}
                {isEditingIngredient && (
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-150">
                    Editing Ingredient
                  </span>
                )}
              </div>
            </div>

            {isEditingIngredient ? (
              <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Ingredient Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Garlic, Chicken Breast, Olive Oil..."
                    className="w-full text-xs font-bold bg-zinc-50 focus:bg-white border border-indigo-300 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 outline-none transition-all text-zinc-900 placeholder:text-zinc-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveIngredientEdit();
                      if (e.key === 'Escape') setIsEditingIngredient(false);
                    }}
                  />
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-3">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                      Qty
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="1"
                      className="w-full text-xs font-bold text-center bg-zinc-50 focus:bg-white border border-zinc-200 focus:border-indigo-400 rounded-lg px-1.5 py-1 outline-none font-mono"
                    />
                  </div>

                  <div className="col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      placeholder="g, tbsp, item"
                      className="w-full text-xs font-semibold text-center bg-zinc-50 focus:bg-white border border-zinc-200 focus:border-indigo-400 rounded-lg px-2 py-1 outline-none"
                    />
                  </div>

                  <div className="col-span-5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                      Aisle / Category
                    </label>
                    <select
                      value={editAisle}
                      onChange={(e) => setEditAisle(e.target.value)}
                      className="w-full text-xs font-semibold bg-zinc-50 focus:bg-white border border-zinc-200 focus:border-indigo-400 rounded-lg px-2 py-1 outline-none cursor-pointer"
                    >
                      {['Produce', 'Meat & Seafood', 'Dairy', 'Bakery', 'Frozen', 'Pantry', 'Other'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(currentItem.ingredient.name || '');
                      setEditAmount(currentItem.ingredient.amount ?? 1);
                      setEditUnit(currentItem.ingredient.unit || '');
                      setEditAisle(currentItem.ingredient.suggestedAisle || 'Pantry');
                      setIsEditingIngredient(false);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveIngredientEdit}
                    disabled={!editName.trim()}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-md transition-all shadow-3xs flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                    <span>Apply Changes</span>
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="flex items-baseline gap-2 cursor-pointer group"
                onClick={() => {
                  setEditName(currentItem.ingredient.name || '');
                  setEditAmount(currentItem.ingredient.amount ?? 1);
                  setEditUnit(currentItem.ingredient.unit || '');
                  setEditAisle(currentItem.ingredient.suggestedAisle || 'Pantry');
                  setIsEditingIngredient(true);
                }}
                title="Click to change ingredient name or quantities"
              >
                <span className="text-base font-extrabold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors">
                  {currentItem.ingredient.name}
                </span>
                {(currentItem.ingredient.amount || currentItem.ingredient.unit) && (
                  <span className="text-xs font-semibold text-zinc-500 font-mono">
                    ({currentItem.ingredient.amount} {currentItem.ingredient.unit})
                  </span>
                )}
                <span className="text-[11px] text-zinc-400 group-hover:text-indigo-600 font-medium ml-auto flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                  <Pencil className="w-2.5 h-2.5" />
                  <span>Click to change</span>
                </span>
              </div>
            )}
          </div>

          {/* Grocery Database Search Bar */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <label htmlFor="grocery-db-search" className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <span>Search Grocery Database</span>
              </label>
              <span className="text-[11px] text-zinc-400 font-medium">
                {allGroceryItems.length} items in catalog
              </span>
            </div>

            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
              <input
                id="grocery-db-search"
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search (e.g. olive oil, cream, onions, pasta)..."
                className="w-full bg-white border border-zinc-200/90 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition-all shadow-3xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-1 text-zinc-400 hover:text-zinc-600 rounded-md transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search Results (When user types a query) */}
          {searchQuery.trim() ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-zinc-700">
                  Search Results for &quot;{searchQuery}&quot;
                </span>
                <span className="text-[11px] text-zinc-400 font-medium font-mono">
                  {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div className="bg-white border border-dashed border-zinc-200 rounded-xl p-4 text-center space-y-2.5">
                  <p className="text-xs text-zinc-500">
                    No grocery items found matching <span className="font-semibold text-zinc-800">&quot;{searchQuery}&quot;</span>.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAddNew(searchQuery.trim())}
                      className="w-full sm:w-auto px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add &quot;{searchQuery.trim()}&quot; as New Item</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
                  {searchResults.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-zinc-200/90 hover:border-zinc-300 rounded-xl p-3 shadow-3xs flex flex-col gap-2 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-zinc-900 leading-tight">
                              {item.name}
                            </span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border ${getCategoryBadgeClass(item.category)}`}>
                              {item.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                            {item.unit && <span>Unit: {item.unit}</span>}
                            {item.cost ? <span>• £{item.cost.toFixed(2)}</span> : null}
                            {Array.isArray(item.aliases) && item.aliases.length > 0 && (
                              <span className="truncate max-w-[200px]" title={`Aliases: ${item.aliases.join(', ')}`}>
                                • Also known as: {item.aliases.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={() => handleMatch(item, false)}
                          className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold py-1.5 rounded-lg transition-colors cursor-pointer text-center"
                          title="Map only for this recipe"
                        >
                          Map Once
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMatch(item, true)}
                          className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 text-xs font-extrabold py-1.5 rounded-lg transition-colors cursor-pointer text-center flex items-center justify-center gap-1"
                          title="Save alias so future recipes recognize this automatically"
                        >
                          <Check className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                          <span>Map Always</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Suggested Matches (Default View when search input is empty) */
            <div className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-zinc-700">
                  {activeSuggestions.length > 0 ? 'Suggested Matches' : 'No Direct Suggestions'}
                </span>
                {activeSuggestions.length > 0 && (
                  <span className="text-[11px] text-zinc-400 font-medium">
                    Top {activeSuggestions.length} candidates
                  </span>
                )}
              </div>

              {activeSuggestions.length > 0 ? (
                <div className="space-y-2">
                  {activeSuggestions.map((suggestion, idx) => (
                    <div
                      key={suggestion.id}
                      className="bg-white border border-zinc-200/90 hover:border-zinc-300 rounded-xl p-3 shadow-3xs flex flex-col gap-2 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900 leading-tight">
                              {suggestion.name}
                            </span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border ${getCategoryBadgeClass(suggestion.category)}`}>
                              {suggestion.category}
                            </span>
                          </div>
                          <span className="block text-[11px] text-zinc-400 mt-0.5">
                            Match #{idx + 1} {suggestion.unit ? `• Unit: ${suggestion.unit}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={() => handleMatch(suggestion, false)}
                          className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold py-1.5 rounded-lg transition-colors cursor-pointer text-center"
                          title="Map only for this recipe"
                        >
                          Map Once
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMatch(suggestion, true)}
                          className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 text-xs font-extrabold py-1.5 rounded-lg transition-colors cursor-pointer text-center flex items-center justify-center gap-1"
                          title="Save alias so future recipes recognize this automatically"
                        >
                          <Check className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                          <span>Map Always</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-dashed border-zinc-200 rounded-xl p-3.5 text-center text-xs text-zinc-500 leading-relaxed">
                  No automated close matches were detected. Use the search bar above to look up an item in your catalog, or add this as a new item below.
                </div>
              )}
            </div>
          )}

          {/* Divider and Add as New Item button */}
          <div className="pt-2 border-t border-zinc-200/70 space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => handleAddNew()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer text-xs font-bold"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Add as New Item (&quot;{currentItem.ingredient.name}&quot;)</span>
            </button>

            <button
              type="button"
              onClick={handleSkip}
              className="w-full bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-800 border border-zinc-200/80 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold cursor-pointer"
            >
              Keep &quot;{currentItem.ingredient.name}&quot; As-Is (Don't Map)
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
