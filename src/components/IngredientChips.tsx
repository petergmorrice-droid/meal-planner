/**
 * "Ingredients you'd like to use" (Auto populate, Add a recipe's ideas): type one or a few
 * ("salmon, chickpeas"), Add; each shows as a chip you can take off.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export function IngredientChips({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [typing, setTyping] = useState('');
  const add = () => {
    const next = [...value];
    for (const part of typing.split(',')) {
      const t = part.trim();
      if (t && !next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    onChange(next);
    setTyping('');
  };
  return (
    <div data-ingredient-chips>
      <div className="flex gap-2">
        <input
          value={typing}
          onChange={(e) => setTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
          placeholder="e.g. salmon, chickpeas"
          aria-label="Ingredients you'd like to use"
          enterKeyHint="done"
          className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-zinc-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || !typing.trim()}
          className="h-10 px-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          data-add-ingredient
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1 rounded-lg bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-900"
              data-ingredient={v}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                disabled={disabled}
                className="w-6 h-6 rounded-md flex items-center justify-center text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                aria-label={`Take off ${v}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
