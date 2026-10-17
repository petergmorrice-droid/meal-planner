import React, { useMemo, useRef, useState } from 'react';
import { Plus, LayoutGrid } from 'lucide-react';
import { parseQuickAdd } from '../../shopList';

export interface QuickAddSuggestion { name: string; aisle: string; favourite?: boolean }

/**
 * "Add an item…": type and press Enter ("2 pints milk", "6 eggs", "bin bags"), or pick a
 * suggestion. Anything already on the list says so, and adding it again adds more.
 */
export default function QuickAdd({
  suggestions,
  onTheList,
  onAdd,
  onBrowse,
  compact = false,
}: {
  suggestions: QuickAddSuggestion[];
  onTheList: (name: string) => string | null;
  /** text as typed; `asName` when a suggestion was picked (keeps any amount typed before it). */
  onAdd: (text: string, asName?: string) => void;
  onBrowse?: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typedName = parseQuickAdd(text).name.toLowerCase();

  const matches = useMemo(() => {
    const q = typedName.trim();
    if (!q) return [];
    const starts: QuickAddSuggestion[] = [];
    const contains: QuickAddSuggestion[] = [];
    for (const s of suggestions) {
      const n = s.name.toLowerCase();
      if (n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))) starts.push(s);
      else if (n.includes(q)) contains.push(s);
    }
    const score = (s: QuickAddSuggestion) => (s.name.toLowerCase() === q ? -2 : s.favourite ? -1 : 0);
    return [...starts.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)), ...contains].slice(0, 6);
  }, [typedName, suggestions]);

  const add = (asName?: string) => {
    if (!text.trim()) return;
    const exact = !asName && matches.find((m) => m.name.toLowerCase() === typedName.trim());
    onAdd(text, asName || (exact ? exact.name : undefined));
    setText('');
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" data-quick-add-box>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') setOpen(false); }}
            placeholder={compact ? 'Forgot something? Add it…' : 'Add an item… e.g. 2 pints milk'}
            enterKeyHint="done"
            autoComplete="off"
            className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-[15px] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
            aria-label="Add an item"
            data-quick-add
          />
        </div>
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="shrink-0 h-[42px] px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            aria-label="Browse items to add"
            data-browse-items
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Browse</span>
          </button>
        )}
      </div>
      {open && text.trim() && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-zinc-200 shadow-lg overflow-hidden divide-y divide-zinc-100" data-suggestions>
          {matches.map((m) => {
            const onList = onTheList(m.name);
            return (
              <li key={m.name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(m.name)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 cursor-pointer"
                  data-suggestion={m.name}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-zinc-900 truncate">{m.name}</span>
                    <span className="block text-xs text-zinc-500 truncate">{m.aisle}</span>
                  </span>
                  {onList ? (
                    <span className="shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">On the list: {onList} · add more</span>
                  ) : (
                    <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
          {!matches.some((m) => m.name.toLowerCase() === typedName.trim()) && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add()}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 cursor-pointer"
                data-suggestion-new
              >
                <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-[15px] text-zinc-900">Add “{text.trim()}”</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
