import React from 'react';
import { RatingChip } from '../Stars';
import { PersonRatings } from '../../ratings';
import PersonMark, { noteLook } from '../PersonMark';
import {
  ChevronRight,
  ChefHat,
  Check,
  Snowflake,
  Plus,
  ArrowLeftRight,
  RotateCcw,
  ShoppingBag,
  Utensils,
  X,
  FileText,
  BookOpen,
  Star,
} from 'lucide-react';
import { PlannedMeal, Recipe } from '../../types';
import { describeMeal, mealTitle, dayTone } from '../planner/DayListRow';
import { isCookable } from './cookDays';

/** How each kind of meal is labelled ("Freezer", "Takeaway"); a fresh cook needs no label. */
const TYPE_CHIP: Record<string, { tone: string; icon: React.ReactNode }> = {
  leftover: { tone: 'bg-amber-50 text-amber-800', icon: <RotateCcw className="w-3 h-3" /> },
  batch: { tone: 'bg-cyan-50 text-cyan-800', icon: <Snowflake className="w-3 h-3" /> },
  takeout: { tone: 'bg-orange-50 text-orange-800', icon: <ShoppingBag className="w-3 h-3" /> },
  eating_out: { tone: 'bg-blue-50 text-blue-800', icon: <Utensils className="w-3 h-3" /> },
  no_meal: { tone: 'bg-zinc-100 text-zinc-600', icon: <X className="w-3 h-3" /> },
};
const TYPE_LABEL: Record<string, string> = {
  leftover: 'Leftovers',
  batch: 'Freezer',
  takeout: 'Takeaway',
  eating_out: 'Eating out',
  no_meal: 'No meal',
};

/**
 * One day, compact: the date down the left, the meal and one line about it (kind, people, time,
 * extra for leftovers, sides), the note if there is one, a tick on the right and small buttons
 * underneath (Swap, Recipe, Note) that wrap rather than spill off the card. The recipe has
 * Start cooking; today's card has its own big button.
 * Today's card adds when to start, what to do tonight for tomorrow and a Start cooking button.
 */
export function DayCard({
  day,
  meal,
  iso,
  recipe,
  isToday,
  isTomorrow,
  isPast,
  fromDay,
  after,
  prep,
  cook,
  updatedBy,
  ratings,
  me,
  onRate,
  onOpen,
  onTick,
  onMove,
  onCook,
  onRecipe,
  onNote,
  onPlan,
  todayPanel,
}: {
  key?: React.Key;
  day: string;
  /** Peter's and Rachel's stars for the recipe, who's using this phone, and "Rate it". */
  ratings?: PersonRatings;
  me?: string;
  onRate?: () => void;
  /** Who last changed this day's meal: a blue (Peter) / pink (Rachel) mark. */
  updatedBy?: string;
  iso: string;
  meal: PlannedMeal | null;
  recipe: Recipe | null;
  isToday: boolean;
  isTomorrow: boolean;
  isPast: boolean;
  fromDay: string | null;
  after: { extra: number; days: string[] };
  prep: number;
  cook: number;
  onOpen: () => void;
  onTick: () => void;
  onMove: () => void;
  onCook: () => void;
  onRecipe: () => void;
  onNote: () => void;
  onPlan: () => void;
  todayPanel?: React.ReactNode;
}) {
  const date = new Date(iso + 'T00:00:00');
  const d = meal ? describeMeal(meal, fromDay) : null;
  const cooked = !!meal?.cooked;
  // Leftover days amber, freezer meals faint ice blue.
  const tone = dayTone(meal);
  const note = (d?.note || '').trim();
  const canCook = meal?.type === 'recipe' && !!recipe && !cooked;
  const title = meal ? mealTitle(meal) : '';
  const chipText =
    !meal || meal.type === 'recipe'
      ? ''
      : meal.type === 'leftover'
        ? d?.label?.text || 'Leftovers'
        : TYPE_LABEL[meal.type] || '';
  const showChip = !!chipText && chipText.toLowerCase() !== title.toLowerCase();
  const people = meal ? (meal.servings || 2) + after.extra : 0;
  const minutes = prep + cook;
  const eats = !!meal && meal.type !== 'takeout' && meal.type !== 'eating_out' && meal.type !== 'no_meal';

  // One line about the meal; it's cut short rather than wrapping.
  const facts: React.ReactNode[] = [];
  if (meal && eats) {
    facts.push(
      after.extra > 0 ? (
        <span key="p" className="text-amber-800 font-semibold" data-cook-extra>
          Cook for {people} ({after.extra} for {after.days.map((x) => x.slice(0, 3)).join(', ')})
        </span>
      ) : (
        <span key="p">
          {people} {people === 1 ? 'person' : 'people'}
        </span>
      ),
    );
  }
  if (meal?.type === 'recipe' && minutes)
    facts.push(
      <span key="t" data-cook-times-row>
        {minutes} min
      </span>,
    );
  if (meal?.sides?.length)
    facts.push(<span key="s">with {meal.sides.map((x) => x.name.toLowerCase()).join(', ')}</span>);
  // Past days just need the tick (the panel has the rest).
  const showButtons = !!meal && (!isPast || isToday);

  const pill =
    'h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap';

  return (
    <section
      className={`rounded-xl ${tone ? tone.card.split(' ')[0] : 'bg-white'} ${isToday ? 'border-2 border-emerald-500 shadow-sm px-3 py-2.5' : `border ${tone ? tone.card.split(' ')[1] : 'border-zinc-200'} px-3 py-2`} ${isPast && !isToday ? 'opacity-70' : ''}`}
      data-cook-row={day}
      data-day-tone={tone?.kind}
    >
      <div className="flex items-start gap-2.5">
        {/* Date */}
        <div
          className={`w-9 shrink-0 text-center leading-none pt-0.5 ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`}
          aria-label={`${day} ${date.getDate()}`}
        >
          <div className="text-[11px] font-bold uppercase">{day.slice(0, 3)}</div>
          <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-emerald-800' : 'text-zinc-900'}`}>
            {date.getDate()}
          </div>
          {(isToday || isTomorrow) && (
            <div className={`text-[9px] font-bold uppercase mt-0.5 ${isToday ? 'text-emerald-700' : 'text-zinc-500'}`}>
              {isToday ? 'Today' : 'Tmrw'}
            </div>
          )}
        </div>

        {/* Meal */}
        <div className="min-w-0 flex-1">
          {!meal ? (
            <div className="flex items-center justify-between gap-2 min-h-9">
              <span className="text-sm text-zinc-400">Nothing planned</span>
              <button
                type="button"
                onClick={onPlan}
                className="h-8 px-2 text-xs font-semibold text-zinc-600 inline-flex items-center gap-0.5 cursor-pointer"
              >
                Plan
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={onOpen} className="block w-full text-left cursor-pointer" data-cook-open>
              <span
                className={`block font-semibold leading-snug break-words ${isToday ? 'text-[17px]' : 'text-[15px]'} ${cooked ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-900'}`}
              >
                {title}
                {updatedBy && (
                  <PersonMark who={updatedBy} what="Last changed" className="ml-1.5 align-[2px] no-underline" />
                )}
              </span>
              {(showChip || facts.length > 0) && (
                <span
                  className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 min-w-0 whitespace-nowrap"
                  data-cook-people
                >
                  {showChip && (
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-px font-semibold ${TYPE_CHIP[meal.type]?.tone || 'bg-zinc-100 text-zinc-600'}`}
                    >
                      {TYPE_CHIP[meal.type]?.icon}
                      {chipText}
                    </span>
                  )}
                  {facts.length > 0 && (
                    <span className="min-w-0 truncate">
                      {facts.map((f, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <span aria-hidden className="text-zinc-300">
                              {' '}
                              ·{' '}
                            </span>
                          )}
                          {f}
                        </React.Fragment>
                      ))}
                    </span>
                  )}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Tick */}
        {meal && isCookable(meal) && (
          <button
            type="button"
            onClick={onTick}
            aria-pressed={cooked}
            aria-label={cooked ? `Untick ${day}` : `Tick ${day} as cooked`}
            data-cook-tick={day}
            className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 flex items-center justify-center cursor-pointer"
          >
            <span
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${cooked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}
            >
              {cooked && <Check className="w-4 h-4" />}
            </span>
          </button>
        )}
      </div>

      {meal && (
        <div className="pl-[46px]">
          {note && (
            <button
              type="button"
              onClick={onNote}
              className={`mt-1 w-full flex items-start gap-1.5 text-left text-[13px] cursor-pointer ${meal.noteBy ? noteLook(meal.noteBy).text : 'text-amber-900'}`}
              data-cook-note={day}
              data-note-by={meal.noteBy || undefined}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${noteLook(meal.noteBy).icon}`} />
              <span className="min-w-0 flex-1 line-clamp-2 break-words">{note}</span>
            </button>
          )}

          {cooked && recipe && onRate && meal.type === 'recipe' && (
            <button
              type="button"
              onClick={onRate}
              className="mt-1 inline-flex items-center gap-1.5 cursor-pointer"
              data-cook-rate={day}
            >
              {ratings && (ratings.P || ratings.R) ? <RatingChip ratings={ratings} /> : null}
              {!(ratings && me && ratings[me as 'P' | 'R']) && (
                <span className="h-7 px-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5" />
                  Rate it
                </span>
              )}
            </button>
          )}

          {recipe && (recipe.notes || '').trim() && (
            <button
              type="button"
              onClick={onRecipe}
              className={`mt-1 w-full flex items-start gap-1.5 text-left text-[13px] cursor-pointer ${recipe.notesBy ? noteLook(recipe.notesBy).text : 'text-amber-900'}`}
              data-cook-recipe-note={day}
              data-note-by={recipe.notesBy || undefined}
            >
              <BookOpen className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${noteLook(recipe.notesBy).icon}`} />
              <span className="min-w-0 flex-1 line-clamp-2 break-words whitespace-pre-line">
                <span className="font-semibold">Recipe notes: </span>
                {recipe.notes!.trim()}
              </span>
            </button>
          )}

          {todayPanel}

          {isToday && canCook && (
            <button
              type="button"
              onClick={onCook}
              className="mt-2 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              data-tonight-start
              data-cook-start={day}
            >
              <ChefHat className="w-4 h-4" />
              Start cooking
            </button>
          )}

          {showButtons && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" data-cook-actions>
              <button
                type="button"
                onClick={onMove}
                aria-label={`Move or swap ${day}`}
                data-cook-move={day}
                className={`${pill} border-zinc-200 bg-white text-zinc-700`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Swap
              </button>
              {recipe && (
                <button
                  type="button"
                  onClick={onRecipe}
                  aria-label={`Open the recipe for ${day}`}
                  data-cook-recipe={day}
                  className={`${pill} border-zinc-200 bg-white text-zinc-700`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Recipe
                </button>
              )}
              {!note && (
                <button
                  type="button"
                  onClick={onNote}
                  data-cook-add-note={day}
                  className={`${pill} border-transparent text-zinc-500 hover:bg-zinc-100`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Note
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!meal && todayPanel && <div className="pl-[46px]">{todayPanel}</div>}
    </section>
  );
}
