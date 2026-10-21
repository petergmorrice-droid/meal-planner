import { useState } from 'react';
import { X } from 'lucide-react';
import { ShoppingListItem } from '../../types';
import { aggregateIngredients } from '../../utils/aggregation';
import { matchProduct, groupingKey } from '../../shopping';
import { shopQuantityText } from '../../shopList';
import { getCatalog } from '../../utils';

/**
 * Cupboard check: one pass over the store-cupboard items (oil, spices, rice, stock...)
 * before you go. "Have it" takes an item off this week's list; "Need it" keeps it.
 * The list is fixed when the sheet opens, so answered rows stay put and can be changed.
 */
export function CupboardCheckSheet({
  items,
  allItems,
  onAnswer,
  onClose,
}: {
  items: ShoppingListItem[];
  allItems: ShoppingListItem[];
  onAnswer: (ids: string[], answer: 'have' | 'need' | null) => void;
  onClose: () => void;
}) {
  // Same product = one question, even if two recipes need it.
  const [groups] = useState(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const product = matchProduct(getCatalog(), item.name, { groceryId: item.groceryId });
      const key = product ? `p:${product.id}` : `n:${groupingKey(item.name)}`;
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({ key, ids: list.map((i) => i.id), first: list[0], list }));
  });
  const answerOf = (ids: string[]): 'have' | 'need' | undefined => {
    const live = allItems.filter((i) => ids.includes(i.id));
    if (live.length && live.every((i) => i.cupboard === 'have')) return 'have';
    if (live.length && live.every((i) => i.cupboard === 'need')) return 'need';
    return undefined;
  };
  const answered = groups.filter((g) => answerOf(g.ids)).length;
  const haveCount = groups.filter((g) => answerOf(g.ids) === 'have').length;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col shadow-xl border border-zinc-200 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Cupboard check"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Cupboard check</h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              Tap <strong className="font-semibold text-zinc-700">Have it</strong> for anything already in the cupboard.
              It comes off this week's list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="overflow-y-auto divide-y divide-zinc-100 px-2">
          {groups.map((g) => {
            const answer = answerOf(g.ids);
            const agg = aggregateIngredients(g.list);
            const amount = agg.displayQuantity || shopQuantityText({ amount: agg.amount, unit: agg.unit });
            const forRecipes = Array.from(new Set(g.list.flatMap((i) => i.recipeNames || [])));
            return (
              <li key={g.key} className="flex items-center gap-3 px-3 py-3" data-cupboard-row={g.first.name}>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-base font-semibold truncate ${answer === 'have' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}
                  >
                    {g.first.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {amount}
                    {forRecipes.length ? ` · for ${forRecipes.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0" role="group" aria-label={`${g.first.name}: have it or need it`}>
                  <button
                    type="button"
                    onClick={() => onAnswer(g.ids, answer === 'have' ? null : 'have')}
                    aria-pressed={answer === 'have'}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      answer === 'have'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    Have it
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(g.ids, answer === 'need' ? null : 'need')}
                    aria-pressed={answer === 'need'}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      answer === 'need'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    Need it
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-500 tabular-nums">
            {answered} of {groups.length} checked{haveCount ? ` · ${haveCount} off the list` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
