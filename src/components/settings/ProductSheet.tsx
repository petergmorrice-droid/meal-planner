/** Adding or editing one product: its name, how it's sold, its aisle and the other names it goes by. */
import { useState } from 'react';
import { X, Trash2, Combine } from 'lucide-react';
import { GroceryItem } from '../../types';
import { GROCERY_AISLES } from '../../utils';
import { alsoCalled, withAlsoCalled, isAisleName, type Product } from '../../shopping';
import { AISLES_IN_ORDER, Sheet } from './parts';

export function ProductSheet({
  product,
  used,
  onSave,
  onRemove,
  onSameAs,
  onClose,
}: {
  product: Product | null;
  used: string[];
  onSave: (i: GroceryItem, isNew: boolean) => void;
  onRemove: (p: Product) => void;
  onSameAs: (p: Product) => void;
  onClose: () => void;
}) {
  const item = product?.item ?? null;
  const [name, setName] = useState(item?.name || '');
  const [unit, setUnit] = useState(item?.unit || 'each');
  const [step, setStep] = useState(String(item?.increment ?? 1));
  const [aisle, setAisle] = useState(
    item ? (isAisleName(item.category) ? item.category : '') : GROCERY_AISLES.produce.name,
  );
  const [names, setNames] = useState<string[]>(() => (item ? alsoCalled(item) : []));
  const [newName, setNewName] = useState('');
  const n = Number(step);
  const ok = name.trim() && n > 0;
  const addName = () => {
    const t = newName.trim();
    if (!t) return;
    if (!names.some((x) => x.toLowerCase() === t.toLowerCase()) && t.toLowerCase() !== name.trim().toLowerCase())
      setNames([...names, t]);
    setNewName('');
  };
  const submit = () => {
    if (!ok) return;
    const base: GroceryItem = {
      ...(item || { id: `gdb-custom-${crypto.randomUUID()}` }),
      name: name.trim(),
      unit: unit.trim() || 'each',
      increment: n,
      category: aisle,
    } as GroceryItem;
    onSave(withAlsoCalled(base, names), !item);
  };
  return (
    <Sheet label={item ? item.name : 'Add a product'} onClose={onClose}>
      <form
        className="p-4 space-y-3"
        data-product-sheet
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-zinc-900">{item ? 'Change product' : 'Add a product'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {item && (
          <p className={`text-[13px] ${used.length ? 'text-emerald-800' : 'text-zinc-500'}`} data-product-used>
            {used.length
              ? `${used.join('; ')}.`.replace(/^./, (c) => c.toUpperCase())
              : 'Not used by any recipe, staple or list yet.'}
          </p>
        )}
        <label className="block">
          <span className="text-xs font-semibold text-zinc-600 block mb-1">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base"
            data-product-name
            autoFocus={!item}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-600 block mb-1">Sold in steps of</span>
            <input
              value={step}
              onChange={(e) => setStep(e.target.value)}
              inputMode="decimal"
              className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base"
              data-product-step
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-600 block mb-1">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g, ml, pack, bunch…"
              className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base"
              data-product-unit
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-zinc-600 block mb-1">Aisle</span>
          <select
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
            className="w-full h-11 rounded-xl border border-zinc-300 px-2 text-base bg-white"
            data-product-aisle
          >
            {!aisle && <option value="">No aisle (store cupboard)</option>}
            {AISLES_IN_ORDER.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div data-product-aliases>
          <span className="text-xs font-semibold text-zinc-600 block mb-1">Also called</span>
          <p className="text-[12px] text-zinc-500 mb-1.5">Recipe ingredients with these names count as this product.</p>
          <div className="flex flex-wrap gap-1.5">
            {names.length === 0 && <span className="text-sm text-zinc-400">No other names yet</span>}
            {names.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-0.5 h-8 pl-2.5 pr-1 rounded-full bg-zinc-100 border border-zinc-200 text-sm text-zinc-800"
                data-alias={a}
              >
                {a}
                <button
                  type="button"
                  onClick={() => setNames(names.filter((x) => x !== a))}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 cursor-pointer"
                  aria-label={`Remove ${a}`}
                  data-alias-remove={a}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addName();
                }
              }}
              placeholder="Add another name"
              className="flex-1 min-w-0 h-10 rounded-xl border border-zinc-300 px-3 text-base"
              data-alias-input
              aria-label="Another name"
            />
            <button
              type="button"
              onClick={addName}
              disabled={!newName.trim()}
              className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-40"
              data-alias-add
            >
              Add
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={!ok}
          className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 cursor-pointer"
          data-product-save
        >
          {item ? 'Save' : 'Add product'}
        </button>
        {product && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSameAs(product)}
              className="flex-1 h-11 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              data-product-same-as
            >
              <Combine className="w-4 h-4" />
              Same as…
            </button>
            <button
              type="button"
              onClick={() => onRemove(product)}
              className="flex-1 h-11 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              data-product-remove
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
