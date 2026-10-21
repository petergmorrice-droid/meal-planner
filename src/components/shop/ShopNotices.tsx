/** The cards at the top of the Shop list: things to sort out before you go. */
import { Info, PackageCheck, PackagePlus, RefreshCw, Repeat } from 'lucide-react';
import { MealPlan, ShoppingListItem } from '../../types';
import { StapleSuggestion } from '../../shopList';
import { changedDaysSinceList } from '../../planning';
import { formatListWithAnd } from './needs';

/** The week's meals aren't on the list yet (or there are none). */
export function UnsentNotice({ plan, onPlanning }: { plan: MealPlan; onPlanning?: () => void }) {
  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-amber-900"
      data-shop-unsent
    >
      <div className="flex items-center gap-2 min-w-0">
        <Info className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm">
          {Object.values(plan.days).some((day) => day.meals && day.meals.length > 0)
            ? "This week's meals aren't on the list yet"
            : 'No meals planned for this week yet'}
        </span>
      </div>
      {onPlanning && (
        <button
          type="button"
          onClick={onPlanning}
          className="text-sm font-semibold text-amber-900 underline shrink-0 cursor-pointer"
        >
          Planning →
        </button>
      )}
    </div>
  );
}

/** The week changed on Planning after it was sent: one tap brings the list up to date. */
export function OutOfDateNotice({ plan, onUpdate }: { plan: MealPlan; onUpdate: () => void }) {
  const changed = changedDaysSinceList(plan);
  if (!changed.length) return null;
  return (
    <div
      className="bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3"
      data-shop-out-of-date
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <RefreshCw className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950">The meal plan has changed</p>
          <p className="text-xs text-amber-900/80">{changed.join(', ')} changed since this list was made.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUpdate}
        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-2 rounded-xl cursor-pointer"
        data-shop-update-list
      >
        Update list
      </button>
    </div>
  );
}

/** Added by hand but not saved products yet: save them so they go to the right aisle next time. */
export function SaveForNextTime({
  items,
  onPick,
}: {
  items: ShoppingListItem[];
  onPick: (item: ShoppingListItem) => void;
}) {
  if (!items.length) return null;
  const one = items.length === 1;
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3" data-new-products>
      <div className="flex items-start gap-2.5">
        <PackagePlus className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">Save for next time?</p>
          <p className="text-xs text-emerald-900/80">
            {one ? "This isn't a saved product yet" : "These aren't saved products yet"}. Save {one ? 'it' : 'them'} and
            next time {one ? 'it goes' : 'they go'} straight into the right aisle.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onPick(i)}
                className="h-8 px-3 rounded-full bg-white border border-emerald-300 text-sm font-semibold text-emerald-900 cursor-pointer"
                data-save-product={i.name}
              >
                {i.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Things you add yourself most weeks: make them weekly staples? */
export function StapleIdeas({
  suggestions,
  onPick,
}: {
  suggestions: StapleSuggestion[];
  onPick: (s: StapleSuggestion) => void;
}) {
  if (!suggestions.length) return null;
  const one = suggestions.length === 1;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3" data-staple-suggestions>
      <div className="flex items-start gap-2.5">
        <Repeat className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-950">Add every week?</p>
          <p className="text-xs text-blue-900/80">
            You add {one ? 'this' : 'these'} yourself most weeks. As a weekly staple, {one ? 'it goes' : 'they go'} on
            the list by {one ? 'itself' : 'themselves'}.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPick(s)}
                className="h-8 px-3 rounded-full bg-white border border-blue-300 text-sm font-semibold text-blue-900 cursor-pointer"
                data-suggest-staple={s.name}
              >
                {s.name}{' '}
                <span className="font-normal text-blue-800/70">
                  · {s.weeks} of {s.of} weeks
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Store-cupboard things you may already have: check before you go. */
export function CupboardNotice({ items, onCheck }: { items: ShoppingListItem[]; onCheck: () => void }) {
  if (!items.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <PackageCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950">Check the cupboard</p>
          <p className="text-xs text-amber-900/80">
            {items.length} {items.length === 1 ? 'item' : 'items'} you may already have, like{' '}
            {formatListWithAnd(Array.from(new Set<string>(items.map((i) => i.name))).slice(0, 3))}.
          </p>
        </div>
      </div>
      <button
        type="button"
        id="btn-cupboard-check"
        onClick={onCheck}
        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-2 rounded-xl cursor-pointer"
      >
        Check now
      </button>
    </div>
  );
}
