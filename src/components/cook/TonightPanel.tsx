/**
 * Tonight on the Cook tab: when to start to eat on time (and the dinner time, which can be changed
 * just for tonight), and anything to do tonight for tomorrow (take it out of the freezer, soak it).
 */
import { useState } from 'react';
import { Clock, Moon, Pencil, Snowflake } from 'lucide-react';
import { clockText, parseClock } from '../../cookInfo';

export function TonightPanel({
  day,
  showTime,
  timeLine,
  dinnerTime,
  eatAt,
  onSaveTime,
  prep,
  prepFromFreezer,
  prepNextWeek,
}: {
  day: string;
  /** Show "Start by …" (tonight's meal is cooked or reheated here and isn't done yet). */
  showTime: boolean;
  /** "Start by 5:15pm to eat at" / "Start now to eat at", or null for just "Eat at". */
  timeLine: string | null;
  /** Tonight's dinner time ("18:30"). */
  dinnerTime: string;
  eatAt: { usual: string; tonightOnly: boolean };
  /** A new time for tonight (the usual time puts it back). */
  onSaveTime: (time: string) => void;
  /** What to do tonight for tomorrow, or null. */
  prep: string | null;
  prepFromFreezer: boolean;
  prepNextWeek: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const save = (time: string) => {
    setEditing(false);
    onSaveTime(time);
  };
  const dinner = parseClock(dinnerTime)!;
  return (
    <div className="mt-2 space-y-1.5" data-tonight={day}>
      {showTime && (
        <div
          className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[13px] text-emerald-950"
          data-start-by
        >
          <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-px" />
          {editing ? (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              Eat at
              <input
                type="time"
                defaultValue={dinnerTime}
                autoFocus
                onBlur={(e) => save(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save((e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="h-8 rounded-md border border-zinc-300 bg-white px-1.5 text-[13px]"
                data-dinner-input
                aria-label="Dinner time tonight"
              />
              <span className="text-emerald-900/70">just tonight</span>
            </span>
          ) : (
            <span className="min-w-0">
              <span className="font-semibold">{timeLine || 'Eat at'}</span>{' '}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-bold underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center gap-0.5"
                data-dinner-time
                aria-label={`Dinner at ${clockText(dinner)}. Change it for tonight`}
              >
                {clockText(dinner)}
                <Pencil className="w-3 h-3 text-emerald-700/70" />
              </button>
              {eatAt.tonightOnly && (
                <span className="block text-emerald-900/70" data-eat-at-tonight>
                  Just tonight · usually {clockText(parseClock(eatAt.usual)!)}{' '}
                  <button
                    type="button"
                    onClick={() => save(eatAt.usual)}
                    className="font-semibold underline underline-offset-2 cursor-pointer"
                    data-eat-at-reset
                  >
                    use {clockText(parseClock(eatAt.usual)!)}
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
      )}
      {prep && (
        <div
          className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-950"
          data-prep-tonight
        >
          {prepFromFreezer ? (
            <Snowflake className="w-4 h-4 shrink-0 mt-px text-cyan-700" />
          ) : (
            <Moon className="w-4 h-4 shrink-0 mt-px text-amber-700" />
          )}
          <span>
            <span className="font-semibold">For tomorrow{prepNextWeek ? ' (next week)' : ''}:</span> {prep}
          </span>
        </div>
      )}
    </div>
  );
}
