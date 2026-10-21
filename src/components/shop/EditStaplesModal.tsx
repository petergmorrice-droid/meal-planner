/** Edit the weekly staples: what goes on every week's list, how many, and in which aisle. */
import { useState, useMemo } from 'react';
import { Plus, Minus, Trash2, X, RotateCcw, Search, Edit3 } from 'lucide-react';
import { matchProduct, catalogForState, aisleCategory, productMatchesSearch } from '../../shopping';
import { GROCERY_AISLES, getGroceryAisle } from '../../utils';
import { productKey } from '../../shopList';
import {
  addStaple,
  changeStaple,
  currentStaples,
  removeStaple,
  saveStaples,
  stapleFor,
  stepStaple,
} from '../../staples';
import type { AppStore } from '../../store';

export function EditRecurringStaplesModal({ store, onClose }: { store: AppStore; onClose: () => void }) {
  const prefs = store.state.preferences || { recurringItems: [] };
  const recurringItems = prefs.recurringItems || [];
  // The shared product list (what the Shop knows how to buy).
  const catalog = catalogForState(store.state);
  const aisleNames = Object.values(GROCERY_AISLES)
    .sort((a, b) => a.order - b.order)
    .map((a) => a.name);

  const [newItemName, setNewItemName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingStapleId, setEditingStapleId] = useState<string | null>(null);

  // Editing state for detailed edit popup inside the main modal
  const [editingStapleName, setEditingStapleName] = useState('');
  const [editingStapleAmount, setEditingStapleAmount] = useState<number>(1);
  const [editingStapleUnit, setEditingStapleUnit] = useState('item');
  const [editingStapleCategory, setEditingStapleCategory] = useState(GROCERY_AISLES.dairy_eggs.name);

  const stapleSuggestions = useMemo(() => {
    if (!newItemName.trim()) return [];
    const query = newItemName.toLowerCase().trim();
    const starts = (p: { name: string }) => (p.name.toLowerCase().startsWith(query) ? 0 : 1);
    return catalog.products
      .filter((p) => productMatchesSearch(p, query))
      .sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((p) => p.item);
  }, [newItemName, catalog]);

  // Every change goes through the shared staples functions (src/staples.ts): no doubles, every
  // week's list follows, and lines either of you took off a week stay off.

  /** Add what was typed or picked: one pack of the product it matches. */
  const handleQuickAddStaple = (name: string) => {
    if (!name.trim()) return;
    const { staples, staple, added } = addStaple(currentStaples(store), stapleFor(catalog, name));
    // If it's on a list already because you added it by hand, the staple's line takes over.
    if (added)
      saveStaples(store, staples, { takeOver: { staple, isSame: (i) => productKey(i) === productKey(staple) } });
    setNewItemName('');
    setShowSuggestions(false);
  };

  const handleRemoveRecurringItem = (id: string) => saveStaples(store, removeStaple(currentStaples(store), id));

  /** A step is a pack of the product (250 g of butter, 6 eggs), else 1. */
  const getStapleStep = (name: string): number => {
    const matched = matchProduct(catalog, name)?.item;
    return matched?.increment || 1;
  };

  const handleUpdateStapleQuantity = (id: string, delta: number) => {
    const staples = currentStaples(store);
    const staple = staples.find((x) => x.id === id);
    if (staple) saveStaples(store, stepStaple(staples, id, delta, getStapleStep(staple.name)));
  };

  const saveStapleDetails = () => {
    if (editingStapleId) {
      saveStaples(
        store,
        changeStaple(currentStaples(store), editingStapleId, {
          amount: Math.max(0.1, editingStapleAmount),
          unit: editingStapleUnit.trim() || 'item',
          category: editingStapleCategory,
        }),
      );
    }
    setEditingStapleId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-55 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-zinc-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-base text-zinc-900">Weekly staples</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-zinc-500 leading-normal font-medium">
            Staples configured here will automatically be included in your weekly shopping list.
          </p>

          {/* Quick Add Input */}
          <div className="relative z-30">
            <div className="flex items-center gap-2 bg-white border border-zinc-200/85 rounded-xl px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Quick add staple item (e.g. Milk, Eggs)"
                className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 outline-none font-medium"
                value={newItemName}
                onChange={(e) => {
                  setNewItemName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemName.trim()) {
                    handleQuickAddStaple(newItemName.trim());
                  }
                }}
              />
            </div>

            {showSuggestions && stapleSuggestions.length > 0 && (
              <>
                <div className="fixed inset-0 z-45" onClick={() => setShowSuggestions(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200/90 shadow-lg rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                  {stapleSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleQuickAddStaple(suggestion.name)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 text-left transition-colors border-b border-zinc-50 last:border-0 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-zinc-800">{suggestion.name}</span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
                        {suggestion.category}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Staples List */}
          {recurringItems.length === 0 ? (
            <div className="text-center py-8 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
              <p className="text-xs text-zinc-400 font-semibold">No recurring staples configured yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recurringItems.map((item) => {
                const aisle = getGroceryAisle(item);
                const aisleInfo = GROCERY_AISLES[aisle];
                return (
                  <div
                    key={item.id}
                    data-staple={item.name}
                    className="flex items-center justify-between px-3 py-2 rounded-xl border transition-all bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-xs text-zinc-900 truncate">{item.name}</p>
                        <span
                          className={`text-[11px] font-medium px-1.5 py-0.2 rounded border ${aisleInfo.colorClass}`}
                        >
                          {aisleInfo.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span className="font-semibold text-zinc-700">
                          {item.amount}
                          {item.unit &&
                          !['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(
                            item.unit.toLowerCase().trim(),
                          )
                            ? ` ${item.unit}`
                            : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {/* Adjuster */}
                      <div className="flex items-center bg-zinc-100/90 border border-zinc-200/80 rounded-lg p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateStapleQuantity(item.id, -1)}
                          disabled={item.amount <= 0.1}
                          aria-label={`Less ${item.name}`}
                          data-staple-less
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                        <span className="text-[11px] font-bold text-zinc-800 w-10 text-center select-none">
                          {item.amount}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateStapleQuantity(item.id, 1)}
                          aria-label={`More ${item.name}`}
                          data-staple-more
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white transition-all cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Edit details */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStapleId(item.id);
                          setEditingStapleName(item.name);
                          setEditingStapleAmount(item.amount);
                          setEditingStapleUnit(item.unit);
                          setEditingStapleCategory(
                            aisleCategory({ name: item.name, category: item.category }) ||
                              GROCERY_AISLES[getGroceryAisle({ name: item.name, category: item.category })].name,
                          );
                        }}
                        className="p-1 text-zinc-400 hover:text-emerald-600 rounded-lg transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveRecurringItem(item.id)}
                        aria-label={`Remove ${item.name} from the staples`}
                        data-staple-remove
                        className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-200 flex justify-end bg-zinc-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Editing details sub-modal */}
      {editingStapleId && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-zinc-200/90 overflow-hidden animate-in slide-in-from-bottom-4 duration-150">
            <div className="px-4 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">edit staple details</h3>
              <button
                type="button"
                onClick={() => setEditingStapleId(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  disabled
                  value={editingStapleName}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-500 cursor-not-allowed outline-none shadow-3xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    required
                    value={editingStapleAmount}
                    onChange={(e) => setEditingStapleAmount(parseFloat(e.target.value) || 1)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Unit (override)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. litre, pack"
                    value={editingStapleUnit}
                    onChange={(e) => setEditingStapleUnit(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all shadow-3xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Aisle Category
                </label>
                <select
                  value={editingStapleCategory}
                  onChange={(e) => setEditingStapleCategory(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:bg-white transition-all font-semibold text-zinc-700 cursor-pointer shadow-3xs"
                >
                  {aisleNames.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setEditingStapleId(null)}
                  className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveStapleDetails}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
