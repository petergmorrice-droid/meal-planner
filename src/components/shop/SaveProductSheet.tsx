import React, { useEffect, useState } from 'react';
import { X, PackagePlus, CheckCircle2, Repeat, Star, Minus, Plus } from 'lucide-react';
import { FoodAisle, GROCERY_AISLES, getGroceryAisle, orderedAisles } from '../../utils';
import { canonicalUnit, unitInfo, formatUnit } from '../../shopping';
import { packsOnLine } from '../../shopList';

/** Units you'd buy something in, for "Sold as". */
const BUY_UNITS: { id: string; label: string }[] = [
  { id: 'each', label: 'each' }, { id: 'pack', label: 'pack' }, { id: 'bag', label: 'bag' }, { id: 'box', label: 'box' },
  { id: 'bottle', label: 'bottle' }, { id: 'jar', label: 'jar' }, { id: 'can', label: 'tin' }, { id: 'tub', label: 'tub' },
  { id: 'bunch', label: 'bunch' }, { id: 'roll', label: 'roll' }, { id: 'g', label: 'g' }, { id: 'kg', label: 'kg' },
  { id: 'ml', label: 'ml' }, { id: 'l', label: 'litre' },
];

export interface NewProductDetails {
  name: string;
  aisle: FoodAisle;
  unit: string;
  increment: number;
  /** Also put it on the list every week: this many of what it's sold as. */
  staple?: { packs: number };
  /** Also add it to your favourites. */
  favourite?: boolean;
}

/** "2 jars", "2 tins", "2 × 500 g", "2" — what a weekly staple of `packs` comes to. */
function everyWeekText(unit: string, step: number, packs: number): string {
  const u = canonicalUnit(unit);
  if (u === 'each') return '';
  if (['mass', 'volume'].includes(unitInfo(u).dimension)) return `× ${step} ${u === 'l' ? (step === 1 ? 'litre' : 'litres') : u}`;
  const label = u === 'can' ? 'tin' : u;
  return step === 1 ? formatUnit(label, packs) : `× ${step} ${formatUnit(label, step)}`;
}

/**
 * "Save as a product for future shops?": something added by hand becomes a product, so next time
 * it goes straight into the right aisle and is bought the way you buy it. It can also become a
 * weekly staple (on the list every week) and/or a favourite. Opens by itself the first time you
 * add something new (`justAdded`), and from the list's "Save for next time?" card or the item panel.
 */
export default function SaveProductSheet({ item, aisleOrder, justAdded = false, already = {}, onSave, onDecline, onClose }: {
  item: { name: string; amount?: number; unit?: string; category?: string };
  aisleOrder?: string[];
  /** Opened straight after adding it: says it's been added. */
  justAdded?: boolean;
  /** Already a weekly staple / favourite (by name). */
  already?: { staple?: boolean; favourite?: boolean };
  onSave: (details: NewProductDetails) => void;
  /** "Don't ask again": not a product, stop asking about it. */
  onDecline: () => void;
  /** "Not now". */
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
  const [staple, setStaple] = useState(!!already.staple);
  const [packs, setPacks] = useState(() => packsOnLine(item, known ? typed : 'each', known && measured && item.amount ? Number(item.amount) : 1));
  const [favourite, setFavourite] = useState(!!already.favourite);
  const ok = name.trim().length > 0 && n > 0;

  // Opened from the add box: put the keyboard away so the whole question shows.
  useEffect(() => {
    const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) el.blur();
  }, []);

  const submit = () => {
    if (!ok) return;
    onSave({
      name: name.trim(), aisle, unit, increment: n,
      ...(staple && !already.staple ? { staple: { packs } } : {}),
      ...(favourite && !already.favourite ? { favourite: true } : {}),
    });
  };

  const option = (
    on: boolean, set: (v: boolean) => void, was: boolean | undefined, icon: React.ReactNode, title: string, sub: string, attr: string,
  ) => (
    <label className={`flex items-center gap-3 px-3 py-2.5 ${was ? '' : 'cursor-pointer'}`} {...{ [attr]: '' }}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-zinc-900">{title}</span>
        <span className="block text-xs text-zinc-500">{was ? `Already ${title === 'Weekly staple' ? 'a weekly staple' : 'a favourite'}` : sub}</span>
      </span>
      <input type="checkbox" checked={on} disabled={was} onChange={(e) => set(e.target.checked)} className="w-5 h-5 accent-emerald-600 shrink-0" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-900/30 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <form
        role="dialog"
        aria-label={`Save ${item.name} as a product`}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-200"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        data-save-product-sheet={item.name}
        {...(justAdded ? { 'data-just-added': '' } : {})}
      >
        {justAdded && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700" data-added-line>
            <CheckCircle2 className="w-4 h-4 shrink-0" /> Added {item.name} to the list
          </p>
        )}
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><PackagePlus className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-zinc-900 leading-snug">Save it as a product for future shops?</h3>
            <p className="text-sm text-zinc-600">Next time it goes straight into the right aisle. On both phones.</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shrink-0" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <label className="block"><span className="text-xs font-semibold text-zinc-600 block mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base" data-new-product-name /></label>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <label className="block min-w-0"><span className="text-xs font-semibold text-zinc-600 block mb-1">Aisle</span>
            <select value={aisle} onChange={(e) => setAisle(e.target.value as FoodAisle)} className="w-full h-11 rounded-xl border border-zinc-300 px-2 text-base bg-white" data-new-product-aisle>
              {orderedAisles(aisleOrder).map((a) => <option key={a} value={a}>{GROCERY_AISLES[a].name}</option>)}
            </select></label>
          <div>
            <span className="text-xs font-semibold text-zinc-600 block mb-1">Sold as</span>
            <div className="flex gap-1.5">
              <input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" aria-label="How many" className="w-14 h-11 rounded-xl border border-zinc-300 px-2 text-base text-center" data-new-product-step />
              <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" className="w-[5.5rem] h-11 rounded-xl border border-zinc-300 px-1.5 text-base bg-white" data-new-product-unit>
                {BUY_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 -mt-1">Sold as: e.g. 1 pack, 1 jar or 500 g.</p>

        <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden" data-new-product-extras>
          {option(staple, setStaple, already.staple, <Repeat className="w-4 h-4" />, 'Weekly staple', 'On the list every week', 'data-new-product-staple')}
          {staple && !already.staple && (
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50" data-new-product-staple-amount>
              <span className="text-sm text-zinc-600 flex-1">Every week</span>
              <button type="button" onClick={() => setPacks((p) => Math.max(1, p - 1))} disabled={packs <= 1} className="w-9 h-9 rounded-full border border-zinc-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="Fewer each week"><Minus className="w-4 h-4" /></button>
              <span className="min-w-[1.5rem] text-center text-base font-semibold tabular-nums" data-staple-packs>{packs}</span>
              <button type="button" onClick={() => setPacks((p) => Math.min(99, p + 1))} className="w-9 h-9 rounded-full border border-zinc-300 bg-white flex items-center justify-center cursor-pointer" aria-label="More each week"><Plus className="w-4 h-4" /></button>
              <span className="text-sm text-zinc-600 min-w-[3rem]">{n > 0 ? everyWeekText(unit, n, packs) : ''}</span>
            </div>
          )}
          {option(favourite, setFavourite, already.favourite, <Star className="w-4 h-4" />, 'Favourite', 'Quick to add from your favourites', 'data-new-product-favourite')}
        </div>

        <button type="submit" disabled={!ok} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 cursor-pointer" data-new-product-save>Save product</button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 cursor-pointer" data-new-product-later>Not now</button>
          <button type="button" onClick={onDecline} className="flex-1 h-11 rounded-xl text-sm font-semibold text-zinc-500 cursor-pointer" data-new-product-decline>Don't ask again</button>
        </div>
      </form>
    </div>
  );
}
