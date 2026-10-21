import { useState } from 'react';
import { Send } from 'lucide-react';

/** Type a question about the recipe (or pick a common one). */
export function AskSheet({
  recipeName,
  onAsk,
  onClose,
}: {
  recipeName: string;
  canDictate?: boolean;
  onAsk: (q: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const ideas = [
    'What can I use instead of…',
    'Can I make this ahead?',
    'How do I know when it’s done?',
    'Can I freeze this?',
  ];
  return (
    <div
      className="absolute inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Ask about this recipe"
        data-ask-sheet
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <span className="text-sm font-semibold text-zinc-500 block">Ask about</span>
        <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{recipeName}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onAsk(q);
          }}
          className="mt-3 flex items-end gap-2"
        >
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Can I use crème fraîche instead of soured cream?"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (q.trim()) onAsk(q);
              }
            }}
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-base leading-snug outline-none focus:border-emerald-500 resize-none"
            data-ask-input
            aria-label="Your question"
          />
          <button
            type="submit"
            disabled={!q.trim()}
            className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0"
            aria-label="Ask"
            data-ask-send
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ideas.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => (x.endsWith('…') ? setQ(x.replace('…', ' ')) : onAsk(x))}
              className="h-8 px-2.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              {x}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Gemini answers from this recipe, for the number of people you're cooking for. With Voice on you can also just
          say “question,” then ask.
        </p>
      </div>
    </div>
  );
}
