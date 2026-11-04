import type { RecipeTag } from '../recipeInfo';
import { TagIcon } from './TagIcon';

/**
 * Filter by tag, after the one-tap filters: one chip per tag your recipes have (Oven/Hob, Ninja,
 * Slow cook, Vegetarian, … then your own), each with its symbol. Choosing more than one shows
 * recipes with all of them.
 */
export function TagFilterChips({
  tags,
  chosen,
  onToggle,
}: {
  tags: RecipeTag[];
  chosen: string[];
  onToggle: (key: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <>
      <span className="shrink-0 w-px self-stretch my-1.5 bg-zinc-200" aria-hidden="true" />
      {tags.map((t) => {
        const on = chosen.includes(t.key);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onToggle(t.key)}
            aria-pressed={on}
            data-filter={t.key}
            className={`shrink-0 h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-zinc-700 border-zinc-300'
            }`}
          >
            <TagIcon tag={t} plain={on} />
            {t.label}
          </button>
        );
      })}
    </>
  );
}

/** Add or take off a tag from the chosen ones. */
export const toggleTag = (cur: string[], key: string) =>
  cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key];
