/** Sides for a planned meal (peas, garlic bread…): popular ones, search the products, or add your own. */
import React, { useState, useMemo } from 'react';
import { Plus, Minus, Trash2, Check, X, Search, Database } from 'lucide-react';
import { PlannedMeal, PlannedMealSide } from '../../types';
import { GROCERY_AISLES } from '../../utils';
import { catalogForState, matchProduct, productMatchesSearch } from '../../shopping';

interface SidesModalInnerProps {
  dayName: string;
  meal: PlannedMeal;
  store: any;
  onClose: () => void;
  onSave: (sides: PlannedMealSide[]) => void;
}

export function SidesModalInner({ dayName, meal, store, onClose, onSave }: SidesModalInnerProps) {
  const [chosenSides, setChosenSides] = useState<PlannedMealSide[]>(() => meal.sides || []);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Triage state
  const [triageSideName, setTriageSideName] = useState<string | null>(null);
  const [triageCategory, setTriageCategory] = useState(GROCERY_AISLES.produce.name);
  const [triageUnit, setTriageUnit] = useState('g');
  const [triageIncrement, setTriageIncrement] = useState(100);

  const POPULAR_SIDES = [
    { name: 'Peas', category: GROCERY_AISLES.frozen.name, unit: 'g', amount: 150, increment: 100 },
    { name: 'Garlic Bread', category: GROCERY_AISLES.bakery.name, unit: 'pack', amount: 1, increment: 1 },
    { name: 'Broccoli', category: GROCERY_AISLES.produce.name, unit: 'head', amount: 1, increment: 1 },
    { name: 'Mixed Salad', category: GROCERY_AISLES.produce.name, unit: 'bag', amount: 1, increment: 1 },
    { name: 'Frozen Chips', category: GROCERY_AISLES.frozen.name, unit: 'g', amount: 300, increment: 250 },
    { name: 'Basmati Rice', category: GROCERY_AISLES.grains_pasta.name, unit: 'g', amount: 150, increment: 100 }
  ];

  // The shared product list (built-in products and yours, not ones you've taken off).
  const catalog = catalogForState(store.state);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const starts = (p: any) => (p.name.toLowerCase().startsWith(q) ? 0 : 1);
    return catalog.products
      .filter((p) => productMatchesSearch(p, q))
      .sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((p) => p.item);
  }, [searchQuery, catalog]);

  const handleAddSide = (sideItem: { name: string; category?: string; unit?: string; increment?: number; amount?: number }) => {
    const existing = chosenSides.find(s => s.name.toLowerCase() === sideItem.name.toLowerCase());
    if (existing) {
      setChosenSides(chosenSides.map(s => s.name.toLowerCase() === sideItem.name.toLowerCase()
        ? { ...s, amount: s.amount + (sideItem.increment || s.amount) }
        : s
      ));
    } else {
      const dbMatch = matchProduct(catalog, sideItem.name)?.item;
      const cat = sideItem.category || dbMatch?.category || 'Pantry';
      const unit = sideItem.unit || dbMatch?.unit || 'item';
      const amt = sideItem.amount || dbMatch?.increment || sideItem.increment || 1;
      
      const newSide: PlannedMealSide = {
        id: dbMatch?.id || `side-custom-${crypto.randomUUID()}`,
        name: sideItem.name,
        amount: amt,
        unit: unit,
        category: cat
      };
      setChosenSides([...chosenSides, newSide]);
    }
    setSearchQuery('');
    setTriageSideName(null);
  };

  const handleRemoveSide = (id: string) => {
    setChosenSides(chosenSides.filter(s => s.id !== id));
  };

  const handleUpdateAmount = (id: string, delta: number) => {
    setChosenSides(chosenSides.map(s => {
      if (s.id !== id) return s;
      
      const dbMatch = catalog.byId.get(s.id)?.item;
      const step = dbMatch?.increment || 1;
      const nextAmount = Math.max(step, s.amount + (delta * step));
      return { ...s, amount: nextAmount };
    }));
  };

  const handleAddCustomSide = () => {
    if (!triageSideName) return;
    
    const newId = `gdb-custom-${crypto.randomUUID()}`;
    const newItem = {
      id: newId,
      name: triageSideName,
      category: triageCategory,
      unit: triageUnit,
      increment: triageIncrement,
    };
    
 if (store.saveProduct) store.saveProduct(newItem);
    else store.updateGroceryOverride(newId, newItem);
    
    const newSide: PlannedMealSide = {
      id: newId,
      name: triageSideName,
      amount: triageIncrement,
      unit: triageUnit,
      category: triageCategory
    };
    
    setChosenSides([...chosenSides, newSide]);
    setTriageSideName(null);
    setSearchQuery('');
  };

  return (
    <div 
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-emerald-50/50">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
              <span>🥗</span>
              <span>Sides for {meal.name.replace(/^(leftovers?|batch):\s*/i, '')}</span>
            </h3>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{dayName} Meal Plan</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-950 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {/* Selected Sides List */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Chosen Sides</h4>
            {chosenSides.length === 0 ? (
              <div className="text-center py-4 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                <span className="text-xs text-zinc-400">No sides added yet.</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {chosenSides.map(side => (
                  <div key={side.id} className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl">
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-xs text-zinc-900 block truncate">{side.name}</span>
                      <span className="text-[11px] text-zinc-400">{side.category || 'Pantry'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateAmount(side.id, -1)}
                          className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-zinc-950 px-1.5 min-w-[3rem] text-center tabular-nums">
                          {side.amount} {side.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateAmount(side.id, 1)}
                          className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSide(side.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove side"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Popular Sides */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Frequent / Popular</h4>
            <div className="flex flex-wrap gap-1.5">
              {/* Special 'None' Option */}
              <button
                type="button"
                onClick={() => setChosenSides([])}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                  chosenSides.length === 0
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                None
              </button>

              {POPULAR_SIDES.map(pop => {
                const isSelected = chosenSides.some(s => s.name.toLowerCase() === pop.name.toLowerCase());
                return (
                  <button
                    key={pop.name}
                    type="button"
                    onClick={() => handleAddSide(pop)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                      isSelected 
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold' 
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {pop.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Bar */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Search your grocery list</h4>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search sides... (e.g. Peas, Salad)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-xs focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
              />
            </div>

            {/* Autocomplete Dropdown Search Results */}
            {searchQuery.trim() !== '' && (
              <div className="mt-1.5 border border-zinc-200 bg-white rounded-xl shadow-lg overflow-hidden divide-y divide-zinc-100">
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddSide(item)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="font-medium text-zinc-900">{item.name}</span>
                    <span className="text-[11px] text-zinc-400 font-semibold">{item.category}</span>
                  </button>
                ))}

                {/* If no exact match and query is non-empty, allow Triage */}
                {!searchResults.some(r => r.name.toLowerCase() === searchQuery.toLowerCase().trim()) && (
                  <button
                    type="button"
                    onClick={() => setTriageSideName(searchQuery.trim())}
                    className="w-full text-left px-3 py-2.5 text-xs text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5 transition-colors cursor-pointer font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add custom side "{searchQuery.trim()}"...</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Triage Sub-form if adding a custom/unmapped side */}
          {triageSideName && (
            <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Triage Custom Side</span>
                  </h5>
                  <p className="text-[11px] text-emerald-800/80 mt-0.5">Pick what you buy for "{triageSideName}" so it lands in the right aisle.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTriageSideName(null)}
                  className="text-emerald-400 hover:text-emerald-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Aisle / Category</label>
                  <select
                    value={triageCategory}
                    onChange={e => setTriageCategory(e.target.value)}
                    className="w-full p-1.5 border border-emerald-200/80 rounded-lg bg-white"
                  >
                    {Object.values(GROCERY_AISLES).sort((a, b) => a.order - b.order).map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Unit</label>
                  <input
                    type="text"
                    placeholder="g, pack, head..."
                    value={triageUnit}
                    onChange={e => setTriageUnit(e.target.value)}
                    className="w-full p-1.5 border border-emerald-200/80 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Default Amount / Increment</label>
                <div className="flex items-center gap-1.5 bg-white border border-emerald-200/80 rounded-lg p-0.5 w-fit">
                  <button
                    type="button"
                    onClick={() => setTriageIncrement(Math.max(1, triageIncrement - (triageUnit === 'g' ? 50 : 1)))}
                    className="w-5 h-5 rounded hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold text-zinc-950 px-2 min-w-[3rem] text-center">
                    {triageIncrement} {triageUnit}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTriageIncrement(triageIncrement + (triageUnit === 'g' ? 50 : 1))}
                    className="w-5 h-5 rounded hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCustomSide}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Database & Add Side</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(chosenSides)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Sides</span>
          </button>
        </div>
      </div>
    </div>
  );
}
