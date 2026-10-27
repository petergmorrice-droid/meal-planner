/** One of Gemini's meal ideas (Auto populate, Add a recipe): name, time, a line about it, what it uses. */
import { useEffect, useRef, type ReactNode } from 'react';
import type { MealIdea } from '../services/geminiService';

/** A ref for a list of ideas: scrolled into view when new ideas arrive (they'd be below the fold). */
export function useIdeasInView(ideas: unknown) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (ideas) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ideas]);
  return ref;
}

export function MealIdeaCard({
  idea,
  usesLabel = 'Uses',
  children,
}: {
  idea: MealIdea;
  /** "Uses" (leftovers) or "With" (its main ingredients). */
  usesLabel?: string;
  /** What you can do with it (Write it…), underneath. */
  children?: ReactNode;
}) {
  return (
    <li className="bg-white rounded-lg border border-violet-100 p-2.5" data-idea>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-900">{idea.name}</span>
        {idea.minutes !== null && (
          <span className="text-xs text-zinc-500 tabular-nums shrink-0">{idea.minutes} min</span>
        )}
      </div>
      {idea.description && <p className="text-xs text-zinc-600 mt-0.5">{idea.description}</p>}
      {idea.uses.length > 0 && (
        <p className="text-xs text-violet-900/80 mt-0.5">
          {usesLabel} {idea.uses.join(', ')}
        </p>
      )}
      {children}
    </li>
  );
}
