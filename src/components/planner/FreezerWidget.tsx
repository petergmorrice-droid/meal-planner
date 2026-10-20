/** What's in the freezer, in the corner of Planning on big screens. */
import React from 'react';
import { BatchItem, Recipe } from '../../types';

export default function FreezerWidget({ batches, recipes }: { batches: BatchItem[]; recipes: Recipe[] }) {
  return (
    <div className="absolute bottom-6 right-6 flex flex-col gap-3 hidden lg:flex pointer-events-none z-10">
      <div className="bg-white p-4 rounded-xl shadow-lg border border-zinc-200/90 w-64 pointer-events-auto">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Freezer Status</h4>
          <span className="text-[11px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded font-medium">
            {batches.reduce((acc: number, b: BatchItem) => acc + b.portions, 0)} Meals left
          </span>
        </div>
        <ul className="text-xs space-y-1.5 max-h-32 overflow-y-auto">
          {batches.length === 0 && (
             <li className="text-zinc-400 italic">No batches</li>
          )}
          {batches.map((batch: BatchItem) => {
            const recipe = batch.recipeId ? recipes.find((r: Recipe) => r.id === batch.recipeId) : null;
            const displayName = batch.name || recipe?.name || 'Freezer Batch';
            return (
              <li key={batch.id} className="flex justify-between items-center text-zinc-700">
                <span className="truncate pr-2 font-normal">{displayName}</span>
                <span className="font-semibold text-zinc-900 shrink-0">({batch.portions} {batch.portions === 1 ? 'meal' : 'meals'})</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
