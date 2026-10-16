import React from 'react';
import { Plus, Trash2, Users, GripVertical, Snowflake, ShoppingBag, Utensils, RotateCcw, X } from 'lucide-react';
import { DayPlan, PlannedMeal, Recipe } from '../../types';

/** What can be dragged onto a day: a recipe from the strip, or a meal already on another day. */
export type PlannerDragPayload =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'meal'; fromDay: string; meal: PlannedMeal };

type BindFn = (payload: PlannerDragPayload, label: string) => Record<string, any>;

const minutes = (r: Recipe) => (r.prepTime || 0) + (r.cookTime || 0);
export const cleanMealName = (name: string) => (name || '').replace(/^(leftovers?|batch):\s*/i, '').trim();
export const isLeftoverMeal = (m: PlannedMeal) => m.type === 'leftover' || /^leftovers?:\s*/i.test(m.name || '');

/** A slim, sideways-scrolling row of recipes. Hold one and drag it onto a day; tap to open it. */
export function RecipeStrip({
  recipes,
  bind,
  onOpen,
  draggingId,
}: {
  recipes: Recipe[];
  bind: BindFn;
  onOpen: (recipe: Recipe) => void;
  draggingId?: string | null;
}) {
  return (
    <div className="shrink-0 bg-white border-b border-zinc-200/80">
      <p className="px-4 pt-2 text-[13px] text-zinc-600">
        <span className="font-semibold text-zinc-800">Hold a recipe</span> and drag it onto a day. Tap to open it.
      </p>
      {recipes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-600">No recipes match your search or filter.</p>
      ) : (
        <div
          className="flex gap-2 overflow-x-auto px-4 pt-2 pb-3 scrollbar-none"
          style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
          data-recipe-strip
        >
          {recipes.map((recipe) => {
            const mins = minutes(recipe);
            const diet = recipe.isVegan ? 'Vegan' : recipe.isVegetarian ? 'Veggie' : '';
            const b = bind({ kind: 'recipe', recipe }, recipe.name);
            return (
              <button
                key={recipe.id}
                type="button"
                {...b}
                style={{ ...b.style, touchAction: 'pan-x' }}
                onClick={() => onOpen(recipe)}
                className={`shrink-0 w-36 h-[76px] text-left rounded-xl border bg-white px-3 py-2 flex flex-col justify-between transition-colors cursor-grab active:cursor-grabbing ${
                  draggingId === recipe.id ? 'border-indigo-400 bg-indigo-50 opacity-60' : 'border-zinc-200 hover:border-zinc-400'
                }`}
                data-recipe-chip={recipe.name}
                aria-label={`${recipe.name}. Hold and drag onto a day, or tap to open.`}
              >
                <span className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">{recipe.name}</span>
                <span className="text-xs text-zinc-600 tabular-nums">
                  {mins > 0 ? `${mins} min` : ''}{mins > 0 && diet ? ' · ' : ''}{diet}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const typeLabel = (meal: PlannedMeal): { text: string; icon: React.ReactNode; tone: string } | null => {
  if (isLeftoverMeal(meal)) return { text: 'Leftovers', icon: <RotateCcw className="w-3.5 h-3.5" />, tone: 'text-amber-800 bg-amber-50 border-amber-200' };
  if (meal.type === 'batch' || /^batch:/i.test(meal.name || '')) return { text: 'Freezer', icon: <Snowflake className="w-3.5 h-3.5" />, tone: 'text-cyan-800 bg-cyan-50 border-cyan-200' };
  if (meal.type === 'takeout') return { text: 'Takeaway', icon: <ShoppingBag className="w-3.5 h-3.5" />, tone: 'text-orange-800 bg-orange-50 border-orange-200' };
  if (meal.type === 'eating_out') return { text: 'Eating out', icon: <Utensils className="w-3.5 h-3.5" />, tone: 'text-blue-800 bg-blue-50 border-blue-200' };
  if (meal.type === 'no_meal') return { text: 'No meal', icon: <X className="w-3.5 h-3.5" />, tone: 'text-zinc-700 bg-zinc-100 border-zinc-200' };
  return null;
};

/** One day of the week as a row: a drop target, with the planned meal (which can itself be dragged). */
export function WeekDayRow({
  day,
  dayPlan,
  meal,
  isOver,
  dragActive,
  bind,
  cooksFor,
  onAdd,
  onChange,
  onPeople,
  onRemove,
}: {
  day: string;
  dayPlan?: DayPlan;
  meal: PlannedMeal | null;
  isOver: boolean;
  dragActive: boolean;
  bind: BindFn;
  /** e.g. "2 + leftovers Wed" when a fresh cook feeds later days. */
  cooksFor?: string | null;
  onAdd: () => void;
  onChange: () => void;
  onPeople: () => void;
  onRemove: () => void;
}) {
  const date = dayPlan?.date ? new Date(dayPlan.date + 'T00:00:00') : null;
  const isToday = !!dayPlan?.date && dayPlan.date === (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
  let label = meal ? typeLabel(meal) : null;
  let note = meal?.note || '';
  if (meal && label) {
    // "Leftovers · from Mon" instead of a badge plus "Reheat from Monday" underneath.
    const from = isLeftoverMeal(meal) ? note.match(/^Reheat from (\w+)$/i) : null;
    if (from) { label = { ...label, text: `Leftovers from ${from[1].slice(0, 3)}` }; note = ''; }
    // Takeaway / Eating out named just that: no need to say it twice.
    if (!isLeftoverMeal(meal) && cleanMealName(meal.name).toLowerCase().replace('takeout', 'takeaway') === label.text.toLowerCase()) label = null;
  }
  const ring = isOver ? 'border-indigo-500 ring-2 ring-indigo-400/60 bg-indigo-50/60' : dragActive ? 'border-dashed border-indigo-300' : 'border-zinc-200';

  return (
    <div
      data-drop-day={day}
      className={`flex items-stretch rounded-xl border bg-white transition-colors min-h-[68px] ${ring}`}
    >
      <div className={`w-14 shrink-0 flex flex-col items-center justify-center border-r ${isToday ? 'border-emerald-200 bg-emerald-50 rounded-l-xl' : 'border-zinc-100'}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-emerald-800' : 'text-zinc-600'}`}>{day.slice(0, 3)}</span>
        <span className={`text-lg font-bold leading-tight tabular-nums ${isToday ? 'text-emerald-900' : 'text-zinc-900'}`}>{date ? date.getDate() : ''}</span>
      </div>

      {meal ? (
        <>
          {(() => {
            const b = bind({ kind: 'meal', fromDay: day, meal }, cleanMealName(meal.name));
            return (
              <button
                type="button"
                {...b}
                onClick={onChange}
                className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing"
                aria-label={`${day}: ${cleanMealName(meal.name)}. Tap to change, hold and drag to another day.`}
                data-day-meal={day}
              >
                <GripVertical className="w-4 h-4 text-zinc-300 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-zinc-900 leading-snug truncate">{cleanMealName(meal.name)}</span>
                  <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {label && (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-md px-1.5 py-px ${label.tone}`}>
                        {label.icon}{label.text}
                      </span>
                    )}
                    {note && <span className="text-xs text-zinc-600 truncate max-w-[180px]">{note}</span>}
                    {!note && cooksFor && <span className="text-xs text-zinc-600">{cooksFor}</span>}
                    {meal.sides && meal.sides.length > 0 && (
                      <span className="text-xs text-zinc-600 truncate">+ {meal.sides.map((s) => s.name).join(', ')}</span>
                    )}
                  </span>
                </span>
              </button>
            );
          })()}
          <div className="flex items-center gap-1 pr-1.5 shrink-0">
            {meal.type !== 'no_meal' && (
              <button
                type="button"
                onClick={onPeople}
                className="h-10 min-w-[44px] px-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                aria-label={`Cooking for ${meal.servings || 2}. Change people or notes`}
                title="People and notes"
              >
                <Users className="w-4 h-4 text-zinc-500" />
                <span className="tabular-nums">{meal.servings || 2}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="h-10 w-10 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
              aria-label={`Remove ${cleanMealName(meal.name)} from ${day}`}
              title="Remove meal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className={`flex-1 m-1.5 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-sm font-semibold cursor-pointer transition-colors ${
            isOver ? 'border-indigo-400 text-indigo-700' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'
          }`}
          aria-label={`Add a meal on ${day}`}
        >
          <Plus className="w-4 h-4" />
          <span>{dragActive ? 'Drop here' : 'Add meal'}</span>
        </button>
      )}
    </div>
  );
}

/** The card that follows your finger while dragging. */
export function DragGhost({ label, over, ghostRef, start }: { label: string; over: string | null; ghostRef: React.RefObject<HTMLDivElement | null>; start: string }) {
  return (
    <div className="fixed left-0 top-0 z-[100] pointer-events-none" ref={ghostRef as any} style={{ transform: start }} aria-hidden>
      <div className="-translate-x-1/2 -translate-y-[calc(100%+18px)] rounded-xl bg-zinc-900 text-white shadow-2xl px-3 py-2 max-w-[220px]">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{label}</p>
        <p className="text-xs text-zinc-300">{over ? `Drop on ${over}` : 'Drag onto a day'}</p>
      </div>
    </div>
  );
}

export interface DropChoice {
  fromDay: string;
  toDay: string;
  meal: PlannedMeal;
  replacing?: string | null;
  canLeftover: boolean;
  isRecipe: boolean;
}

/** When a planned meal is dropped on another day: leftovers, cook it again, or move it. */
export function DropChoiceSheet({
  choice,
  onLeftovers,
  onCookAgain,
  onMove,
  onCopy,
  onCancel,
}: {
  choice: DropChoice;
  onLeftovers: () => void;
  onCookAgain: () => void;
  onMove: () => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const name = cleanMealName(choice.meal.name);
  const btn = 'w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer';
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3 animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${name} on ${choice.toDay}`}
      >
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">{name} on {choice.toDay}</h3>
          {choice.replacing && <p className="text-sm text-zinc-600 mt-0.5">Replaces {choice.replacing}.</p>}
        </div>
        {choice.canLeftover && (
          <button type="button" onClick={onLeftovers} className={`${btn} border-amber-300 bg-amber-50 hover:bg-amber-100`}>
            <span className="block text-base font-semibold text-amber-950">Leftovers from {choice.fromDay}</span>
            <span className="block text-sm text-amber-900/80">{choice.fromDay}'s cook makes enough for both days.</span>
          </button>
        )}
        {choice.isRecipe && (
          <button type="button" onClick={onCookAgain} className={`${btn} border-zinc-200 hover:bg-zinc-50`}>
            <span className="block text-base font-semibold text-zinc-900">Cook it again</span>
            <span className="block text-sm text-zinc-600">A fresh cook on {choice.toDay}.</span>
          </button>
        )}
        {!choice.isRecipe && (
          <button type="button" onClick={onCopy} className={`${btn} border-zinc-200 hover:bg-zinc-50`}>
            <span className="block text-base font-semibold text-zinc-900">Also on {choice.toDay}</span>
            <span className="block text-sm text-zinc-600">Keep {choice.fromDay} as it is.</span>
          </button>
        )}
        <button type="button" onClick={onMove} className={`${btn} border-zinc-200 hover:bg-zinc-50`}>
          <span className="block text-base font-semibold text-zinc-900">Move to {choice.toDay}</span>
          <span className="block text-sm text-zinc-600">{choice.fromDay} becomes free.</span>
        </button>
        <button type="button" onClick={onCancel} className="w-full py-2.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

