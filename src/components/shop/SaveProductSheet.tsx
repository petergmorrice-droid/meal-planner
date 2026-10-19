import React, { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { FoodAisle, GROCERY_AISLES, getGroceryAisle, orderedAisles } from '../../utils';
import { canonicalUnit, unitInfo } from '../../shopping';

/** Units you'd buy something in, for "Sold as". */
const BUY_UNITS: { id: string; label: string }[] = [
  { id: 'each', label: 'each' }, { id: 'pack', label: 'pack' }, { id: 'bag', label: 'bag' }, { id: 'box', label: 'box' },
  { id: 'bottle', label: 'bottle' }, { id: 'jar', label: 'jar' }, { id: 'can', label: 'tin' }, { id: 'tub', label: 'tub' },
  { id: 'bunch', label: 'bunch' }, { id: 'roll', label: 'roll' }, { id: 'g', label: 'g' }, { id: 'kg', label: 'kg' },
  { id: 'ml', label: 'ml' }, { id: 'l', label: 'litre' },
];

export interface NewProductDetails { name: string; aisle: FoodAisle; unit: string; increment: number }

/**
 * "Save as a product": something added by hand becomes a product, so next time it goes straight
 * into the right aisle and is bought the way you buy it.
 */
export default function SaveProductSheet({ item, aisleOrder, onSave, onDecline, onClose }: {
  item: { name: string; amount?: number; unit?: string; category?: string };
  aisleOrder?: string[];
  onSave: (details: NewProductDetails) => void;
  /** "Not a product": don't ask about this again. */
  onDecline: () => void;
  onClose: () => void;
}) {
  const typed = canonicalUnit(item.unit);
  const known = BUY_UNITS.some((u) => u.id === typed);
  const measured = ['mass', 'volume'].includes(unitInfo(typed).dimension);
  const [name, setName] = useState(item.name);
  const [aisle, setAisle] = useState<FoodAisle>(getGroceryAisle({ name: item.name, category: item.category }));
  const [unit, setUnit] = useState(known ? typed : 'each');
  const [step, setStep] = useState(String(known && measured && item.amount ? item.amount : 1));
  const n = Number(step);
  const ok = name.trim().length > 0 && n > 0;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-label={`Save ${item.name} as a product`}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ name: name.trim(), aisle, unit, increment: n }); }}
        data-save-product-sheet={item.name}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><PackagePlus className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-zinc-900">Save as a product?</h3>
            <p className="text-sm text-zinc-600">Next time you add it, it goes straight into the right aisle, sold the way you buy it. On both phones.</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shrink-0" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" data-new-product-name /></label>
        <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Aisle</span>
          <select value={aisle} onChange={(e) => setAisle(e.target.value as FoodAisle)} className="w-full h-11 rounded-xl border border-zinc-300 px-2 text-base bg-white" data-new-product-aisle>
            {orderedAisles(aisleOrder).map((a) => <option key={a} value={a}>{GROCERY_AISLES[a].name}</option>)}
          </select></label>
        <div>
          <span className="text-xs font-semibold text-zinc-600 block mb-1">Sold as</span>
          <div className="flex gap-2">
            <input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" aria-label="How many" className="w-24 h-11 rounded-xl border border-zinc-300 px-3 text-base" data-new-product-step />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" className="flex-1 h-11 rounded-xl border border-zinc-300 px-2 text-base bg-white" data-new-product-unit>
              {BUY_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <span className="text-xs text-zinc-500 mt-1 block">e.g. 1 pack, 1 jar, 500 g. Adding one more adds this much.</span>
        </div>
        <button type="submit" disabled={!ok} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 cursor-pointer" data-new-product-save>Save product</button>
        <button type="button" onClick={onDecline} className="w-full h-10 rounded-xl text-sm font-semibold text-zinc-600 cursor-pointer" data-new-product-decline>Not a product: don't ask again</button>
      </form>
    </div>
  );
}
