import React, { useEffect, useState } from 'react';
import {
  Plus,
  Users,
  Snowflake,
  ShoppingBag,
  Utensils,
  RotateCcw,
  X,
  ChevronRight,
  Check,
  Minus,
  Trash2,
  ArrowLeftRight,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { DayPlan, PlannedMeal } from '../../types';
import { cleanMealName, isLeftoverMeal, WEEK_DAYS } from '../../planning';
import PersonMark, { noteLook } from '../PersonMark';

export { cleanMealName, isLeftoverMeal };

type Label = { text: string; icon: React.ReactNode; tone: string };

/** How a planned meal is described: a label ("Leftovers from Mon", "Freezer", "Takeaway") and any note. */
export function describeMeal(meal: PlannedMeal, fromDay?: string | null): { label: Label | null; note: string } {
  let label: Label | null = null;
  let note = meal.note || '';
  if (isLeftoverMeal(meal))
    label = {
      text: 'Leftovers',
      icon: <RotateCcw className="w-3.5 h-3.5" />,
      tone: 'text-amber-900 bg-amber-50 border-amber-200',
    };
  else if (meal.type === 'batch' || /^batch:/i.test(meal.name || ''))
    label = {
      text: 'Freezer',
      icon: <Snowflake className="w-3.5 h-3.5" />,
      tone: 'text-cyan-900 bg-cyan-50 border-cyan-200',
    };
  else if (meal.type === 'takeout')
    label = {
      text: 'Takeaway',
      icon: <ShoppingBag className="w-3.5 h-3.5" />,
      tone: 'text-orange-900 bg-orange-50 border-orange-200',
    };
  else if (meal.type === 'eating_out')
    label = {
      text: 'Eating out',
      icon: <Utensils className="w-3.5 h-3.5" />,
      tone: 'text-blue-900 bg-blue-50 border-blue-200',
    };
  else if (meal.type === 'no_meal')
    label = { text: 'No meal', icon: <X className="w-3.5 h-3.5" />, tone: 'text-zinc-700 bg-zinc-100 border-zinc-200' };
  if (label) {
    // "Leftovers from Mon" rather than a badge plus "Reheat from Monday" underneath.
    const from = isLeftoverMeal(meal) ? note.match(/^Reheat from (\w+)$/i) : null;
    if (from) {
      label = { ...label, text: `Leftovers from ${from[1].slice(0, 3)}` };
      note = '';
    } else if (isLeftoverMeal(meal) && fromDay) label = { ...label, text: `Leftovers from ${fromDay.slice(0, 3)}` };
    if (/^heat up a premade batch$/i.test(note)) note = '';
    // A takeaway called "Takeaway" doesn't need saying twice.
    const plain = cleanMealName(meal.name)
      .toLowerCase()
      .replace('takeout', 'takeaway')
      .replace('no meal needed', 'no meal');
    if (!isLeftoverMeal(meal) && plain === label.text.toLowerCase()) label = { ...label, text: '' };
  }
  return { label, note };
}

/**
 * Leftover days are amber, freezer meals a faint ice blue, so they stand out from cooking days
 * (Planning and Cook). Null for everything else.
 */
export function dayTone(
  meal: PlannedMeal | null | undefined,
): { card: string; past: string; kind: 'leftover' | 'freezer' } | null {
  if (!meal) return null;
  if (isLeftoverMeal(meal))
    return { card: 'bg-amber-100/70 border-amber-300', past: 'bg-amber-50 border-amber-200', kind: 'leftover' };
  if (meal.type === 'batch' || /^batch:/i.test(meal.name || ''))
    return { card: 'bg-cyan-50 border-cyan-200', past: 'bg-cyan-50/60 border-cyan-200/70', kind: 'freezer' };
  return null;
}

/** "Takeaway" for meals saved before the app said Takeaway. */
export const mealTitle = (meal: PlannedMeal) => {
  const n = cleanMealName(meal.name);
  if (meal.type === 'takeout' && /^takeout$/i.test(n)) return 'Takeaway';
  if (meal.type === 'eating_out' && /^eating out$/i.test(n)) return 'Eating out';
  if (meal.type === 'no_meal' && /^no meal needed$/i.test(n)) return 'No meal';
  return n;
};

const LabelChip = ({ label }: { label: Label }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-md px-1.5 py-px ${label.tone}`}>
    {label.icon}
    {label.text}
  </span>
);

const shortDate = (iso?: string) => (iso ? new Date(iso + 'T00:00:00').getDate() : '');

/**
 * One day in the List view of Planning. Tap an empty day to add a meal; tap a planned day for
 * its panel (people, sides, notes, change, move, remove).
 */
export function DayListRow({
  day,
  dayPlan,
  meal,
  cooksFor,
  fromDay,
  today,
  onOpen,
}: {
  day: string;
  dayPlan?: DayPlan;
  meal: PlannedMeal | null;
  /** e.g. "Cook for 6: leftovers Tue, Thu" when later days eat leftovers of this cook. */
  cooksFor?: string | null;
  /** For leftovers: the day they were cooked. */
  fromDay?: string | null;
  today: string;
  onOpen: () => void;
}) {
  const isToday = !!dayPlan?.date && dayPlan.date === today;
  const isPast = !!dayPlan?.date && dayPlan.date < today;
  const d = meal ? describeMeal(meal, fromDay) : null;
  const tone = dayTone(meal);

  return (
    <div
      className={`flex items-stretch rounded-xl border min-h-[68px] ${isToday ? `border-emerald-400 ring-1 ring-emerald-400 ${tone ? tone.card.split(' ')[0] : 'bg-white'}` : tone ? (isPast ? tone.past : tone.card) : isPast ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
      data-list-day={day}
      data-day-tone={tone?.kind}
      data-today={isToday || undefined}
      data-past={isPast || undefined}
    >
      <div
        className={`w-14 shrink-0 flex flex-col items-center justify-center border-r ${isToday ? 'border-emerald-200 bg-emerald-50 rounded-l-xl' : 'border-zinc-100'}`}
      >
        <span
          className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-emerald-800' : isPast ? 'text-zinc-400' : 'text-zinc-600'}`}
        >
          {isToday ? 'Today' : day.slice(0, 3)}
        </span>
        <span
          className={`text-lg font-bold leading-tight tabular-nums ${isToday ? 'text-emerald-900' : isPast ? 'text-zinc-400' : 'text-zinc-900'}`}
        >
          {shortDate(dayPlan?.date)}
        </span>
      </div>

      {meal && d ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-black/[0.03] transition-colors"
          aria-label={`${day}: ${mealTitle(meal)}. Open the day`}
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[15px] font-semibold leading-snug line-clamp-2 break-words ${isPast ? 'text-zinc-500' : 'text-zinc-900'}`}
            >
              {mealTitle(meal)}
            </span>
            <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {d.label && d.label.text && <LabelChip label={d.label} />}
              {meal.cooked && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-800">
                  <Check className="w-3.5 h-3.5" />
                  Cooked
                </span>
              )}
              {d.note && (
                <span
                  className={`text-xs truncate max-w-[180px] ${meal.noteBy ? noteLook(meal.noteBy).text : 'text-zinc-600'}`}
                  data-meal-note-by={meal.noteBy || undefined}
                >
                  {d.note}
                </span>
              )}
              {!d.note && cooksFor && <span className="text-xs text-zinc-600">{cooksFor}</span>}
              {meal.sides && meal.sides.length > 0 && (
                <span className="text-xs text-zinc-600 truncate">+ {meal.sides.map((s) => s.name).join(', ')}</span>
              )}
              <PersonMark who={dayPlan?.updatedBy} what="Last changed" />
            </span>
          </span>
          {meal.type !== 'no_meal' && (
            <span
              className="text-sm font-semibold text-zinc-600 inline-flex items-center gap-1 shrink-0"
              aria-label={`${meal.servings || 2} people`}
            >
              <Users className="w-4 h-4 text-zinc-400" />
              {meal.servings || 2}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 m-1.5 rounded-lg border border-dashed border-zinc-300 text-zinc-600 hover:bg-zinc-50 flex items-center justify-between px-3 text-sm font-semibold cursor-pointer transition-colors"
          aria-label={`Add a meal on ${day}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add meal
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        </button>
      )}
    </div>
  );
}

/** One day on the Classic week strip: a drop target for recipes; tap for the day's panel. */
export function WeekDayCard({
  day,
  dayPlan,
  meal,
  cooksFor,
  fromDay,
  today,
  dragActive,
  onDrop,
  onOpen,
  onAdd,
}: {
  day: string;
  dayPlan?: DayPlan;
  meal: PlannedMeal | null;
  cooksFor?: string | null;
  fromDay?: string | null;
  today: string;
  dragActive: boolean;
  onDrop: () => void;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const isToday = !!dayPlan?.date && dayPlan.date === today;
  const isPast = !!dayPlan?.date && dayPlan.date < today;
  const d = meal ? describeMeal(meal, fromDay) : null;
  const dateText = dayPlan?.date
    ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';

  const tone = dayTone(meal);
  const header = (
    <div className="flex items-center justify-between gap-1 shrink-0 mb-1">
      <div className="min-w-0 leading-tight truncate">
        <span className={`text-xs font-bold ${isPast ? 'text-zinc-400' : 'text-zinc-900'}`}>{day.slice(0, 3)}</span>
        <span className={`text-[11px] ml-1 ${isPast ? 'text-zinc-400' : 'text-zinc-500'}`}>{dateText}</span>
      </div>
      <span className="flex items-center gap-1 shrink-0">
        {meal && <PersonMark who={dayPlan?.updatedBy} what="Last changed" />}
        {isToday && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-white bg-emerald-600 rounded px-1.5 py-px shrink-0">
            Today
          </span>
        )}
      </span>
    </div>
  );

  const frame = `rounded-xl border flex flex-col h-full min-h-0 p-2 sm:p-2.5 relative select-none transition-all ${
    dragActive
      ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-400'
      : isToday
        ? 'ring-2 ring-emerald-500 border-emerald-500'
        : ''
  }`;

  if (!meal || !d) {
    return (
      <div
        data-week-day={day}
        data-drop-day={day}
        data-today={isToday || undefined}
        data-past={isPast || undefined}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`${frame} ${isPast ? 'bg-zinc-50 border-zinc-200 border-dashed' : 'bg-zinc-50/40 border-dashed border-zinc-300'}`}
      >
        {header}
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 min-h-0 rounded-lg border border-dashed border-zinc-300 bg-white hover:bg-zinc-50 flex flex-col items-center justify-center text-zinc-600 cursor-pointer"
          aria-label={`Add a meal on ${day}`}
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-semibold mt-0.5">Add meal</span>
          <span className="text-[11px] text-zinc-400 hidden md:block">or drop a recipe here</span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-week-day={day}
      data-drop-day={day}
      data-today={isToday || undefined}
      data-past={isPast || undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`${frame} ${tone ? (isPast ? tone.past : tone.card) : isPast ? 'bg-zinc-50 border-zinc-200' : 'bg-white border-zinc-200 shadow-2xs'}`}
      data-day-tone={tone?.kind}
    >
      {header}
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-h-0 text-left flex flex-col cursor-pointer"
        aria-label={`${day}: ${mealTitle(meal)}. Open the day`}
      >
        <span
          className={`shrink-0 text-[13px] font-semibold leading-snug line-clamp-2 break-words ${isPast ? 'text-zinc-500' : 'text-zinc-900'}`}
        >
          {mealTitle(meal)}
        </span>
        <span className="mt-1 flex-1 flex flex-col items-start gap-1 min-h-0 overflow-hidden">
          {d.label && d.label.text && (
            <span
              className={`max-w-full inline-flex items-center gap-1 text-[11px] font-semibold border rounded-md px-1.5 py-px whitespace-nowrap ${d.label.tone}`}
            >
              <span className="shrink-0 [&>svg]:w-3 [&>svg]:h-3">{d.label.icon}</span>
              <span className="truncate">{d.label.text}</span>
            </span>
          )}
          {!d.note && cooksFor && (
            <span className="text-[11px] font-medium text-zinc-700 leading-tight">{cooksFor}</span>
          )}
          {d.note && (
            <span
              className={`text-[11px] italic line-clamp-1 ${meal.noteBy ? noteLook(meal.noteBy).text : 'text-zinc-600'}`}
              data-meal-note-by={meal.noteBy || undefined}
            >
              {d.note}
            </span>
          )}
          {meal.sides && meal.sides.length > 0 && (
            <span className="text-[11px] text-zinc-600 line-clamp-1">+ {meal.sides.map((s) => s.name).join(', ')}</span>
          )}
        </span>
        <span className="shrink-0 pt-1 flex items-center justify-between gap-1">
          {meal.type !== 'no_meal' ? (
            <span
              className="text-xs font-semibold text-zinc-600 inline-flex items-center gap-1"
              aria-label={`${meal.servings || 2} people`}
            >
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              {meal.servings || 2}
            </span>
          ) : (
            <span />
          )}
          {meal.cooked && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">
              <Check className="w-3 h-3" />
              Cooked
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/** M T W T F S S with a dot for each planned day; tap a letter to jump to that day. */
export function WeekGlance({
  days,
  today,
  onJump,
  action,
}: {
  days: Record<string, DayPlan>;
  today: string;
  onJump: (day: string) => void;
  /** Shown instead of the count, e.g. "Copy a week" on an empty week. */
  action?: React.ReactNode;
}) {
  const planned = WEEK_DAYS.filter((d) => (days[d]?.meals || []).length > 0).length;
  return (
    <div
      className="flex items-center gap-1 px-2 sm:px-4 py-1 border-b border-zinc-100 bg-white shrink-0"
      data-week-glance
    >
      {WEEK_DAYS.map((day) => {
        const dp = days[day];
        const has = (dp?.meals || []).length > 0;
        const isToday = !!dp?.date && dp.date === today;
        const isPast = !!dp?.date && dp.date < today;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onJump(day)}
            aria-label={`${day}${has ? '' : ', nothing planned'}`}
            data-glance-day={day}
            className={`w-8 h-8 rounded-full flex flex-col items-center justify-center text-[11px] font-bold leading-none cursor-pointer ${
              isToday ? 'bg-emerald-600 text-white' : isPast ? 'text-zinc-400' : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            {day.slice(0, 1)}
            <span
              className={`mt-0.5 w-1.5 h-1.5 rounded-full ${has ? (isToday ? 'bg-white' : 'bg-emerald-500') : isToday ? 'bg-emerald-300' : 'bg-zinc-200'}`}
            />
          </button>
        );
      })}
      {action ? (
        <span className="ml-auto">{action}</span>
      ) : (
        <span className="ml-auto text-xs font-medium text-zinc-600 whitespace-nowrap" data-planned-count>
          {planned} of 7 planned
        </span>
      )}
    </div>
  );
}

/**
 * Everything about one planned day in one place: people, sides, notes, and change, move or remove.
 * People and notes are saved when the panel closes.
 */
export function DaySheet({
  day,
  dayPlan,
  meal,
  cooksFor,
  fromDay,
  plannedDays,
  hasRecipe,
  onSave,
  onSides,
  onChangeMeal,
  onMove,
  onRemove,
  onOpenRecipe,
  onClose,
  extra,
}: {
  day: string;
  dayPlan?: DayPlan;
  meal: PlannedMeal;
  cooksFor?: string | null;
  fromDay?: string | null;
  /** The week's days, to move or swap with. */
  plannedDays: { day: string; date?: string; meal?: PlannedMeal | null }[];
  hasRecipe: boolean;
  onSave: (patch: { servings: number; note: string }) => void;
  /** Change the sides (left out on the Cook tab, which just shows them). */
  onSides?: () => void;
  onChangeMeal: () => void;
  onMove: (to: string) => void;
  onRemove: () => void;
  onOpenRecipe?: () => void;
  onClose: () => void;
  /** Extra buttons at the top (the Cook tab's Start cooking / Tick as cooked). */
  extra?: React.ReactNode;
}) {
  const d = describeMeal(meal, fromDay);
  const [servings, setServings] = useState<number>(meal.servings || 2);
  const [note, setNote] = useState<string>(meal.note || '');
  const [moving, setMoving] = useState(false);
  const canSide = meal.type === 'recipe' || meal.type === 'leftover' || meal.type === 'batch';
  const dateText = dayPlan?.date
    ? new Date(dayPlan.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : day;

  const commit = () => {
    const s = meal.type === 'no_meal' ? 0 : servings;
    if (s !== (meal.type === 'no_meal' ? 0 : meal.servings || 2) || note.trim() !== (meal.note || '').trim())
      onSave({ servings: s, note: note.trim() });
  };
  const close = () => {
    commit();
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        role="dialog"
        aria-label={`${day}: ${mealTitle(meal)}`}
        data-day-sheet={day}
        className="bg-white w-full sm:max-w-md max-h-[90dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-zinc-500 block">{dateText}</span>
            <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{mealTitle(meal)}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {d.label && d.label.text && <LabelChip label={d.label} />}
              {meal.cooked && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-800">
                  <Check className="w-3.5 h-3.5" />
                  Cooked
                </span>
              )}
              {cooksFor && <span className="text-sm text-zinc-700">{cooksFor}</span>}
              {dayPlan?.updatedBy && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                  Last changed by <PersonMark who={dayPlan.updatedBy} what="Last changed" />
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {/* Save people/notes first, so a button here (tick, start cooking) doesn't lose them. */}
          {extra && <div onClickCapture={commit}>{extra}</div>}
          {hasRecipe && onOpenRecipe && (
            <button
              type="button"
              onClick={() => {
                commit();
                onOpenRecipe();
              }}
              className="text-[15px] font-semibold text-emerald-800 inline-flex items-center gap-1.5 cursor-pointer"
              data-open-recipe
            >
              <BookOpen className="w-4 h-4" />
              Open the recipe
            </button>
          )}

          {meal.type !== 'no_meal' && (
            <div className="flex items-center justify-between gap-3" data-day-people>
              <span className="text-base font-semibold text-zinc-900">People</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setServings((n) => Math.max(1, n - 1))}
                  disabled={servings <= 1}
                  className="w-11 h-11 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  aria-label="One fewer person"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="w-10 text-center text-xl font-bold tabular-nums" aria-live="polite" data-day-servings>
                  {servings}
                </span>
                <button
                  type="button"
                  onClick={() => setServings((n) => Math.min(24, n + 1))}
                  disabled={servings >= 24}
                  className="w-11 h-11 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  aria-label="One more person"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {canSide && (onSides || (meal.sides && meal.sides.length > 0)) && (
            <div className="flex items-center justify-between gap-3" data-day-sides>
              <div className="min-w-0">
                <span className="text-base font-semibold text-zinc-900 block">Sides</span>
                <span className="text-sm text-zinc-600 block truncate">
                  {meal.sides && meal.sides.length ? meal.sides.map((s) => s.name).join(', ') : 'None'}
                </span>
              </div>
              {onSides && (
                <button
                  type="button"
                  onClick={() => {
                    commit();
                    onSides();
                  }}
                  className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold shrink-0 cursor-pointer"
                >
                  {meal.sides && meal.sides.length ? 'Change' : 'Add a side'}
                </button>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-base font-semibold text-zinc-900 flex items-center gap-1.5 mb-1">
              Notes{meal.note && <PersonMark who={meal.noteBy} what="Note written" />}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                meal.type === 'takeout' ? 'e.g. Pizza from Franco Manca, order by 6:30' : 'e.g. prep veg in the morning'
              }
              aria-label="Notes"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-base sm:text-sm leading-relaxed"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                commit();
                onChangeMeal();
              }}
              className="h-12 rounded-xl border border-zinc-300 text-sm font-semibold flex flex-col items-center justify-center cursor-pointer"
              data-change-meal
            >
              <RefreshCw className="w-4 h-4 mb-0.5" />
              Change meal
            </button>
            <button
              type="button"
              onClick={() => setMoving(!moving)}
              aria-expanded={moving}
              className={`h-12 rounded-xl border text-sm font-semibold flex flex-col items-center justify-center cursor-pointer ${moving ? 'bg-emerald-600 text-white border-emerald-600' : 'border-zinc-300'}`}
              data-move-meal
            >
              <ArrowLeftRight className="w-4 h-4 mb-0.5" />
              Move or swap
            </button>
            <button
              type="button"
              onClick={() => {
                onRemove();
              }}
              className="h-12 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold flex flex-col items-center justify-center cursor-pointer"
              data-remove-meal
            >
              <Trash2 className="w-4 h-4 mb-0.5" />
              Remove
            </button>
          </div>

          {moving && (
            <div data-move-targets>
              <span className="text-sm text-zinc-600 block mb-1.5">
                Move {mealTitle(meal)} to… (a day with a meal swaps with it)
              </span>
              <div className="space-y-1.5">
                {plannedDays
                  .filter((x) => x.day !== day)
                  .map((x) => (
                    <button
                      key={x.day}
                      type="button"
                      onClick={() => {
                        commit();
                        onMove(x.day);
                      }}
                      data-move-to={x.day}
                      className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 px-3 py-2 flex items-center gap-3 cursor-pointer"
                    >
                      <span className="w-10 text-sm font-bold text-zinc-700">
                        {x.day.slice(0, 3)} {shortDate(x.date)}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-zinc-700 truncate">
                        {x.meal ? mealTitle(x.meal) : 'Free'}
                      </span>
                      <span className="text-xs font-semibold text-zinc-500 shrink-0">
                        {x.meal ? 'Swap' : 'Move here'}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div
          className="px-4 py-3 border-t border-zinc-200 shrink-0"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={close}
            className="w-full h-12 rounded-xl bg-emerald-600 text-white text-base font-semibold cursor-pointer inline-flex items-center justify-center gap-2"
            data-day-done
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
