import React from 'react';
import { Clock, Flame, Zap, Leaf, Snowflake, CalendarCheck, Star } from 'lucide-react';
import { Recipe, UserPreferences } from '../types';
import { getRecipeEmojis, getEmojiLabel } from '../utils';
import {
  RecipeHistory,
  recipeMethods,
  totalMinutes,
  formatMinutes,
  isVegetarianRecipe,
  isVeganRecipe,
  formatAgo,
  formatPlannedDay,
  METHOD_LABEL,
} from '../recipeInfo';
import { RatingChip } from './Stars';
import type { PersonRatings } from '../ratings';

/** Which details the cards show (View options → Fields; saved for the household). */
export interface CardFields {
  time: boolean;
  method: boolean;
  veg: boolean;
  lastHad: boolean;
  freezer: boolean;
  emojis: boolean;
}

/** The card fields you can turn on and off, and the preference that holds each. */
export type CardPref = 'showTotalTime' | 'showMethod' | 'showVegetarian' | 'showLastHad' | 'showFreezer' | 'showEmojis';
export const CARD_FIELD_OPTIONS: { pref: CardPref; label: string; field: keyof CardFields }[] = [
  { pref: 'showTotalTime', label: 'Time', field: 'time' },
  { pref: 'showMethod', label: 'Oven/Hob or Ninja', field: 'method' },
  { pref: 'showVegetarian', label: 'Vegetarian / vegan', field: 'veg' },
  { pref: 'showLastHad', label: 'Last had / planned', field: 'lastHad' },
  { pref: 'showFreezer', label: 'In the freezer', field: 'freezer' },
  { pref: 'showEmojis', label: 'Emojis', field: 'emojis' },
];

export function cardFieldsFromPrefs(prefs: Partial<UserPreferences> | undefined): CardFields {
  const on = (k: CardPref) => prefs?.[k] !== false;
  return {
    time: on('showTotalTime'),
    method: on('showMethod'),
    veg: on('showVegetarian'),
    lastHad: on('showLastHad'),
    freezer: on('showFreezer'),
    emojis: on('showEmojis'),
  };
}

/**
 * A recipe in the Cookbook or on Planning: the name, one line of facts, and whether you've
 * had it lately or have it planned. Tap to open; on Planning it can also be dragged onto a day.
 */
export function RecipeCard({
  recipe,
  fields,
  history,
  freezer,
  today,
  inWeek,
  ratings,
  onOpen,
  dragProps,
}: {
  recipe: Recipe;
  fields: CardFields;
  history?: RecipeHistory;
  freezer: number;
  today: string;
  /** On Planning: the days this recipe is on in the week on screen ("This week: Tue"). */
  inWeek?: string[];
  /** Full-width row ("Rows of 1") rather than a grid tile. */
  /** Peter's and Rachel's stars. */
  ratings?: PersonRatings;
  onOpen: () => void;
  dragProps?: Pick<React.HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd'> & { draggable?: boolean };
}) {
  const mins = fields.time ? totalMinutes(recipe) : null;
  const methods = fields.method ? recipeMethods(recipe) : [];
  const veg = fields.veg ? (isVeganRecipe(recipe) ? 'Vegan' : isVegetarianRecipe(recipe) ? 'Veggie' : null) : null;
  const emojis = fields.emojis ? getRecipeEmojis(recipe) : [];

  let status: React.ReactNode = null;
  if (fields.lastHad) {
    if (inWeek && inWeek.length > 0) {
      status = (
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-700 rounded-md px-1.5 py-px"
          data-in-week
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          This week: {inWeek.join(', ')}
        </span>
      );
    } else if (history?.nextPlanned) {
      status = (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-px">
          <CalendarCheck className="w-3.5 h-3.5" />
          Planned {formatPlannedDay(history.nextPlanned, today)}
        </span>
      );
    } else if (history?.lastHad) {
      status = <span className="text-xs text-zinc-500">Last had {formatAgo(history.lastHad, today)}</span>;
    } else {
      status = <span className="text-xs text-zinc-500">Not had yet</span>;
    }
  }
  const frozen =
    fields.freezer && freezer > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-900 bg-cyan-50 border border-cyan-200 rounded-md px-1.5 py-px">
        <Snowflake className="w-3.5 h-3.5" />
        {freezer} in freezer
      </span>
    ) : null;

  const facts =
    mins || methods.length > 0 || veg ? (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-zinc-700">
        {mins && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            {formatMinutes(mins)}
          </span>
        )}
        {methods.map((m) => (
          <span key={m} className="inline-flex items-center gap-1">
            {m === 'ninja' ? (
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Flame className="w-3.5 h-3.5 text-rose-500" />
            )}
            {METHOD_LABEL[m]}
          </span>
        ))}
        {veg && (
          <span className="inline-flex items-center gap-1 text-emerald-800">
            <Leaf className="w-3.5 h-3.5 text-emerald-600" />
            {veg}
          </span>
        )}
      </div>
    ) : null;

  return (
    <div
      {...(dragProps || {})}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      data-recipe-card={recipe.name}
      aria-label={`${recipe.name}. Open recipe`}
      className={`bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 shadow-2xs p-2.5 sm:p-3 flex flex-col gap-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
        dragProps?.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <h3 className="text-[15px] font-semibold text-zinc-900 leading-snug line-clamp-2 break-words">
        {recipe.favourite && (
          <Star className="inline w-4 h-4 mr-1 -mt-0.5 fill-amber-400 text-amber-500" aria-label="Favourite" />
        )}
        {recipe.name}
        {emojis.length > 0 && (
          <span className="ml-1.5 text-[14px] font-normal whitespace-nowrap select-none" aria-hidden="true">
            {emojis.map((e) => (
              <span key={e} title={getEmojiLabel(e)}>
                {e}
              </span>
            ))}
          </span>
        )}
      </h3>
      {facts}
      {(status || frozen || (ratings && (ratings.P || ratings.R))) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {ratings && <RatingChip ratings={ratings} />}
          {status}
          {frozen}
        </div>
      )}
    </div>
  );
}
