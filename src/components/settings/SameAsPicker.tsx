import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { productMatchesSearch, type Product } from '../../shopping';
import { Sheet, card, row } from './parts';

/** "Same as…": pick the product this one really is (that one is kept). */
export function SameAsPicker({
  product,
  products,
  usageOf,
  onPick,
  onClose,
}: {
  product: Product;
  products: Product[];
  usageOf: (p: Product) => string;
  onPick: (keep: Product) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const options = products
    .filter((p) => p.id !== product.id && productMatchesSearch(p, t))
    .sort(
      (a, b) =>
        (t ? Number(!a.name.toLowerCase().startsWith(t)) - Number(!b.name.toLowerCase().startsWith(t)) : 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 30);
  return (
    <Sheet label={`${product.name} is the same as…`} onClose={onClose}>
      <div className="p-4" data-merge-picker>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">{product.name} is the same as…</h3>
            <p className="text-sm text-zinc-500">
              Pick the product to keep. {product.name} becomes another name for it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            autoFocus
            className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-base outline-none focus:border-emerald-500"
            data-merge-search
            aria-label="Search products"
          />
        </div>
        <div className={`${card} mt-2 max-h-[45dvh] overflow-y-auto`}>
          {options.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing matches.</p>}
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className={`${row} cursor-pointer hover:bg-zinc-50`}
              data-merge-option={p.name}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
                <span className="block text-[12px] text-zinc-500 truncate">
                  {p.item.category || 'No aisle'} · {usageOf(p)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
