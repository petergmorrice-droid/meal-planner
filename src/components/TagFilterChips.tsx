import { Tag } from 'lucide-react';

/**
 * Filter by tag: one chip per tag your recipes have, after the one-tap filters. Choosing more
 * than one shows recipes with all of them.
 */
export function TagFilterChips({
  tags,
  chosen,
  onToggle,
}: {
  tags: string[];
  chosen: string[];
  onToggle: (tag: string) => void;
}) {
  if (tags.length === 0) return null;
  const isOn = (t: string) => chosen.some((c) => c.toLowerCase() === t.toLowerCase());
  return (
    <>
      <span className="shrink-0 w-px self-stretch my-1.5 bg-zinc-200" aria-hidden="true" />
      {tags.map((t) => {
        const on = isOn(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            aria-pressed={on}
            aria-label={`Tag: ${t}`}
            data-tag-filter={t}
            className={`shrink-0 h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              on
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-zinc-700 border-zinc-300 border-dashed'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            {t}
          </button>
        );
      })}
    </>
  );
}

/** Add or take off a tag from the chosen ones (whatever its capitals). */
export const toggleTag = (cur: string[], tag: string) =>
  cur.some((c) => c.toLowerCase() === tag.toLowerCase())
    ? cur.filter((c) => c.toLowerCase() !== tag.toLowerCase())
    : [...cur, tag];
