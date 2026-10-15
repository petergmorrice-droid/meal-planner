import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { GroceryItem, ShoppingListItem } from '../types';

interface EditItemDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: ShoppingListItem;
  hydratedItem?: GroceryItem;
  onSave: (id: string, updates: Partial<GroceryItem>) => void;
}

const CATEGORIES = [
  'Produce', 'Meat', 'Fish', 'Dairy', 'Bakery', 'Pasta', 'Pantry',
  'Canned', 'Frozen', 'Snacks', 'Beverages', 'Household', 'Hygiene'
];

export default function EditItemDrawer({ isOpen, onClose, item, hydratedItem, onSave }: EditItemDrawerProps) {
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [increment, setIncrement] = useState<number | string>(1);

  // Initialize from the fully hydrated grocery item (which includes overrides + base data)
  useEffect(() => {
    if (isOpen) {
      setCategory(hydratedItem?.category || item.category || 'Pantry');
      setUnit(hydratedItem?.unit || item.unit || 'item');
      setIncrement(hydratedItem?.increment || 1);
    }
  }, [isOpen, hydratedItem, item]);

  if (!isOpen) return null;

  const handleSave = () => {
    // If hydratedItem is provided, use its ID. Otherwise generate a slugified name.
    const id = hydratedItem?.id || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    onSave(id, {
      category,
      unit,
      increment: Number(increment) || 1
    });
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 z-50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 transform transition-transform shadow-2xl pb-safe">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-lg">Edit {item.name}</h3>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 active:bg-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-base py-3 px-4 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Unit (e.g. g, ml, whole, can)</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full text-base py-3 px-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Increment amount</label>
            <input
              type="number"
              min="1"
              step="any"
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
              className="w-full text-base py-3 px-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold text-lg active:bg-emerald-700 transition-colors shadow-sm"
          >
            Save preferences
          </button>
        </div>
      </div>
    </>
  );
}
