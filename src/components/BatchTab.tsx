import { useState } from 'react';
import { Snowflake, Plus, Trash2, Minus, X } from 'lucide-react';
import { BatchItem, Recipe } from '../types';

export default function BatchTab({ store }: { store: any }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleUpdatePortions = (id: string, newPortions: number) => {
    if (newPortions <= 0) {
      store.removeBatch(id);
    } else {
      const batch = store.state.batches.find((b: BatchItem) => b.id === id);
      if (batch) {
        store.updateBatch({ ...batch, portions: newPortions });
      }
    }
  };

  const totalMeals = store.state.batches.reduce((acc: number, b: BatchItem) => acc + b.portions, 0);

  return (
    <div className="h-full flex flex-col bg-[#fafafa] relative">
      {/* Top Header */}
      <header className="px-6 py-4 bg-white border-b border-zinc-200/80 shrink-0">
        <div className="flex justify-between items-center max-w-4xl mx-auto w-full">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Snowflake className="w-5 h-5 text-zinc-700" />
              Freezer Batches
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {totalMeals} {totalMeals === 1 ? 'meal' : 'meals'} ready in the freezer
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-all active:scale-95"
            aria-label="Add freezer batch"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Batch</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 max-w-4xl mx-auto w-full space-y-3">
        {store.state.batches.length === 0 ? (
          <div className="text-center text-zinc-400 py-16 bg-white rounded-2xl border border-zinc-200/70 p-6">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-zinc-500">
              <Snowflake className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800 mb-1">No batches in the freezer</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-4">
              Cook in bulk and store extra portions. They can be added to your weekly meal plan in one click.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Batch</span>
            </button>
          </div>
        ) : (
          store.state.batches.map((batch: BatchItem) => {
            const recipe = batch.recipeId ? store.state.recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
            const displayName = batch.name || recipe?.name || 'Custom Batch';
            return (
              <div 
                key={batch.id} 
                className="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-2xs flex items-center justify-between gap-4 transition-all hover:border-zinc-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-zinc-900 truncate">{displayName}</h3>
                    <span className="text-[11px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-medium shrink-0">
                      {batch.portions} {batch.portions === 1 ? 'meal' : 'meals'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Added {new Date(batch.dateAdded).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • 2 adults each
                  </p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/80 rounded-lg p-0.5">
                    <button
                      onClick={() => handleUpdatePortions(batch.id, batch.portions - 1)}
                      className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-md transition-colors"
                      title="Decrease portions"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-semibold text-zinc-800 min-w-[1.5rem] text-center tabular-nums">
                      {batch.portions}
                    </span>
                    <button
                      onClick={() => handleUpdatePortions(batch.id, batch.portions + 1)}
                      className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-md transition-colors"
                      title="Increase portions"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => store.removeBatch(batch.id)}
                    className="p-1.5 text-zinc-300 hover:text-red-500 rounded-lg transition-colors"
                    title="Remove batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddModal && (
        <AddBatchModal store={store} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function AddBatchModal({ store, onClose }: { store: any; onClose: () => void }) {
  const [batchName, setBatchName] = useState('');
  const [portions, setPortions] = useState(2);

  const handleAdd = () => {
    const trimmed = batchName.trim();
    if (!trimmed) return;
    
    const matchedRecipe = store.state.recipes?.find(
      (r: Recipe) => r.name.toLowerCase() === trimmed.toLowerCase()
    );

    store.addBatch({
      id: crypto.randomUUID(),
      name: trimmed,
      recipeId: matchedRecipe ? matchedRecipe.id : '',
      portions,
      dateAdded: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl border border-zinc-200 animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <h3 className="font-semibold text-sm text-zinc-900">Add Freezer Batch</h3>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }} className="space-y-4 py-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">Batch Name</label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Chili con Carne, Lasagne, Bolognese..."
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-zinc-400 focus:bg-white text-zinc-900 transition-colors placeholder:text-zinc-400"
              autoFocus
              list="cookbook-batch-suggestions"
            />
            {store.state.recipes && store.state.recipes.length > 0 && (
              <datalist id="cookbook-batch-suggestions">
                {store.state.recipes.map((r: Recipe) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>
            )}
          </div>
          
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">Portions to Store</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 6].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPortions(count)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    portions === count 
                      ? 'bg-indigo-600 text-white border-indigo-600' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Each meal portion feeds 2 adults.
            </p>
          </div>

          <div className="flex gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-zinc-600 font-medium bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!batchName.trim()}
              className="flex-1 py-2 text-white font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition-colors text-xs"
            >
              Save Batch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
