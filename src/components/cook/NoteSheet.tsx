import React, { useState } from 'react';

/** Add or change a day's note. */
export function NoteSheet({
  title,
  note,
  onSave,
  onClose,
}: {
  key?: React.Key;
  title: string;
  note: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(note);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Note"
        data-note-sheet
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <span className="text-sm font-semibold text-zinc-500 block">Note</span>
        <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{title}</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. prep veg in the morning, Pizza from Franco Manca"
          className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-base leading-relaxed outline-none focus:border-emerald-500"
          data-note-input
          aria-label="Note"
        />
        <div className="mt-3 flex items-center gap-2">
          {note && (
            <button
              type="button"
              onClick={() => onSave('')}
              className="h-12 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer"
              data-note-remove
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-4 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer ml-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            className="h-12 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
            data-note-save
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
