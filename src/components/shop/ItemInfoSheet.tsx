import React from 'react';
import { X, UtensilsCrossed, ChefHat, Repeat, UserRound, StickyNote, CheckCircle2, PackageX } from 'lucide-react';
import { AggregatedShoppingListItem, shopQuantityText } from '../../shopList';
import { AisleIcon } from '../AisleLook';
import type { FoodAisle } from '../../utils';
import { personLook } from '../PersonMark';

/** One line of "what's this for": a meal, an extra recipe, the weekly staple, what someone added, the note. */
export interface ItemInfoLine {
  kind: 'meal' | 'extra' | 'staple' | 'added' | 'note' | 'bought' | 'out';
  text: string;
  /** "1 can" */
  amount?: string;
  /** Who (added it, wrote the note, ticked it): Peter blue, Rachel pink. */
  who?: string;
}

const ICONS: Record<ItemInfoLine['kind'], { Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  meal: { Icon: UtensilsCrossed, tone: 'bg-emerald-50 text-emerald-700' },
  extra: { Icon: ChefHat, tone: 'bg-orange-50 text-orange-700' },
  staple: { Icon: Repeat, tone: 'bg-blue-50 text-blue-700' },
  added: { Icon: UserRound, tone: 'bg-zinc-100 text-zinc-700' },
  note: { Icon: StickyNote, tone: 'bg-amber-50 text-amber-700' },
  bought: { Icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  out: { Icon: PackageX, tone: 'bg-amber-50 text-amber-700' },
};

/**
 * (i) on a row: which meals it's for (and how much each), extra recipes, weekly staple, what was
 * added by hand and by whom, the note, and who ticked it. Read-only; Edit opens the item panel.
 */
export default function ItemInfoSheet({
  row,
  aisle,
  lines,
  onEdit,
  onClose,
}: {
  row: AggregatedShoppingListItem;
  aisle: FoodAisle;
  lines: ItemInfoLine[];
  onEdit?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-zinc-900/30 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`About ${row.name}`}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        data-item-info-sheet={row.name}
      >
        <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b border-zinc-100">
          <AisleIcon aisle={aisle} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-zinc-900 leading-snug">{row.name}</h3>
            <p className="text-sm text-zinc-600 tabular-nums">{shopQuantityText(row)} on the list</p>
            {row.neededText && <p className="text-sm text-zinc-600 tabular-nums">Your meals use {row.neededText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="overflow-y-auto px-4 py-2 divide-y divide-zinc-100" data-item-info-lines>
          {lines.map((l, i) => {
            const { Icon } = ICONS[l.kind];
            const person = personLook(l.who);
            const tone = person ? person.tile : ICONS[l.kind].tone;
            return (
              <li key={i} className="flex items-center gap-3 py-2.5" data-info-line={l.kind}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span
                  className={`flex-1 min-w-0 text-[15px] leading-snug ${l.kind === 'note' ? (person ? person.text : 'text-amber-900') : 'text-zinc-800'}`}
                  data-info-who={l.who || undefined}
                >
                  {l.text}
                </span>
                {l.amount && (
                  <span className="shrink-0 text-sm font-semibold text-zinc-900 tabular-nums">{l.amount}</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="px-4 pt-2 flex gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 h-11 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-800 cursor-pointer"
              data-item-info-edit
            >
              Change it
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
            data-item-info-close
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
