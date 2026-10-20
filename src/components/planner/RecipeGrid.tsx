/** The meals to drag onto the week (Classic view): cards in rows of 2 (or 1), filtered and sorted. */
import React from 'react';
import { ChefHat } from 'lucide-react';
import { BatchItem, Recipe, RecipeRating } from '../../types';
import { ratingsFor } from '../../ratings';
import { freezerPortions, QuickFilter, RecipeHistory } from '../../recipeInfo';
import { RecipeCard, CardFields } from '../RecipeCard';

export default function RecipeGrid({
  recipes, matching, total, filtering, quickFilters, noFavourites, onClear, mealRowsLayout, cardFields, history, batches, ratings, today,
  daysInWeek, onOpen, onDragStart, onDragEnd,
}: {
  /** The meals to show, in order. */
  recipes: Recipe[];
  /** How many match the search and filters, of how many. */
  matching: number;
  total: number;
  /** A search or filter is on. */
  filtering: boolean;
  quickFilters: QuickFilter[];
  /** No recipe is a favourite yet. */
  noFavourites: boolean;
  onClear: () => void;
  mealRowsLayout: 1 | 2;
  cardFields: CardFields;
  history: Map<string, RecipeHistory>;
  batches: BatchItem[];
  /** All the ratings (preferences.ratings). */
  ratings: RecipeRating[] | undefined;
  today: string;
  daysInWeek: Map<string, string[]>;
  onOpen: (recipe: Recipe) => void;
  onDragStart: (recipe: Recipe) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col justify-between min-h-0">
      {filtering && (
        <div className="mb-2 flex items-center gap-2 text-sm text-zinc-600" data-filter-status>
          <span>{matching} of {total} meals</span>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={onClear} className="font-semibold text-emerald-800 underline underline-offset-2 cursor-pointer">Clear</button>
        </div>
      )}
      {matching === 0 ? (
        <div className="my-auto py-12 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-white/50">
          <ChefHat className="w-8 h-8 text-zinc-300 mb-2" />
          <p className="text-sm font-semibold text-zinc-700">No meals match</p>
          <p className="text-sm text-zinc-500 mt-0.5">{quickFilters.includes('favourites') && noFavourites ? 'No favourites yet: star recipes in the Cookbook.' : 'Try fewer filters or another word.'}</p>
        </div>
      ) : (
        <div className={`grid ${mealRowsLayout === 1 ? 'grid-cols-1 gap-2' : 'grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3'}`}>
          {recipes.map((recipe: Recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              fields={cardFields}
              history={history.get(recipe.id)}
              freezer={freezerPortions(recipe, batches)}
              ratings={ratingsFor(ratings, recipe.id)}
              today={today}
              inWeek={daysInWeek.get(recipe.id)}
              wide={mealRowsLayout === 1}
              onOpen={() => onOpen(recipe)}
              dragProps={{
                draggable: true,
                onDragStart: () => onDragStart(recipe),
                onDragEnd,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
