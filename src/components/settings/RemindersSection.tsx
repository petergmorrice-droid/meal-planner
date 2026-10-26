/**
 * Settings → Reminders: put the coming meals in this phone's calendar, so the calendar sends the
 * alerts (start dinner; take the freezer meal out the night before) even when the app is closed.
 */
import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronDown } from 'lucide-react';
import { parseClock } from '../../cookInfo';
import { DEFAULT_PREP_AT, reminderSettings, remindersCalendar, upcomingReminders } from '../../calendarReminders';
import { UserPreferences } from '../../types';
import { formatDateISO } from '../../utils';
import { Segmented, card, row, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

const LAST_ADDED = 'mp-reminders-added';

const whenText = (d: Date, now: Date) => {
  const day = (x: Date) => formatDateISO(x);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const name =
    day(d) === day(now)
      ? 'Today'
      : day(d) === day(tomorrow)
        ? 'Tomorrow'
        : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
  return `${name} ${t.replace(':00', '')}`;
};

export function RemindersSection({ store, say }: { store: SettingsTabProps['store']; say: (t: string) => void }) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const settings = reminderSettings(prefs);
  const [open, setOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_ADDED);
    } catch {
      return null;
    }
  });
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60000);
  const reminders = useMemo(
    () => upcomingReminders(store.state, new Date(minuteKey * 60000)),
    [store.state, minuteKey],
  );
  const cooks = reminders.filter((r) => r.kind === 'cook').length;
  const preps = reminders.length - cooks;
  const lastDay = reminders.length ? reminders[reminders.length - 1].start : null;

  const add = () => {
    if (!reminders.length) return;
    const ics = remindersCalendar(reminders, new Date());
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-reminders-${formatDateISO(new Date())}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const stamp = new Date().toISOString();
    try {
      localStorage.setItem(LAST_ADDED, stamp);
    } catch {
      /* private browsing: just don't remember */
    }
    setLastAdded(stamp);
    say(`${reminders.length} reminders ready: open the file to add them to your calendar`);
  };

  return (
    <section data-settings-reminders>
      <h3 className={sectionTitle}>Reminders</h3>
      <div className={card}>
        <div className="px-4 py-3" data-setting-reminder-cook>
          <span className="block text-[15px] font-semibold text-zinc-900">Time to start dinner</span>
          <span className="block text-[13px] text-zinc-500 mb-2">
            The Cook tab's start time, or this long before it
          </span>
          <Segmented
            value={!settings.cook ? 'off' : String(settings.cookAlertBefore)}
            options={[
              { id: '0', label: 'At start' },
              { id: '10', label: '10 mins' },
              { id: '30', label: '30 mins' },
              { id: 'off', label: 'Off' },
            ]}
            onChange={(v) =>
              store.updatePreferences(
                v === 'off' ? { reminderCook: false } : { reminderCook: true, reminderCookBefore: Number(v) },
              )
            }
            attr="reminder-cook"
          />
        </div>
        <div className={row} data-setting-reminder-prep>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">The night before</span>
            <span className="block text-[13px] text-zinc-500">
              Take freezer meals out, and steps to do ahead like marinating
            </span>
          </span>
          {settings.prep && (
            <input
              type="time"
              value={settings.prepAt}
              onChange={(e) => {
                if (parseClock(e.target.value) !== null) store.updatePreferences({ reminderPrepAt: e.target.value });
              }}
              className="h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold tabular-nums"
              aria-label="Night-before reminder time"
              data-setting-reminder-prep-at
            />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={settings.prep}
            aria-label="Night-before reminders"
            onClick={() =>
              store.updatePreferences(
                settings.prep
                  ? { reminderPrep: false }
                  : { reminderPrep: true, reminderPrepAt: prefs.reminderPrepAt || DEFAULT_PREP_AT },
              )
            }
            className={`w-12 h-7 rounded-full p-0.5 shrink-0 cursor-pointer transition-colors ${settings.prep ? 'bg-emerald-600' : 'bg-zinc-300'}`}
            data-setting-reminder-prep-switch
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${settings.prep ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={add}
            disabled={!reminders.length}
            className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            data-reminders-add
          >
            <CalendarPlus className="w-5 h-5" />
            Add to my calendar
          </button>
          <span className="block text-[13px] text-zinc-500 mt-2" data-reminders-summary>
            {reminders.length
              ? `${[
                  cooks && `${cooks} dinner ${cooks === 1 ? 'reminder' : 'reminders'}`,
                  preps && `${preps} night-before`,
                ]
                  .filter(Boolean)
                  .join(
                    ' and ',
                  )}, up to ${lastDay!.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}.`
              : !settings.cook && !settings.prep
                ? 'Both reminders are off.'
                : 'Nothing planned from now on. Plan a week, then come back here.'}
            {lastAdded &&
              ` Last added on this phone ${new Date(lastAdded).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.`}
          </span>
          <span className="block text-[13px] text-zinc-500 mt-1">
            Your phone's calendar sends the alerts, even with the app closed. Add them again after planning a new week
            or changing meals; if your calendar then shows a reminder twice, delete the older one.
          </span>
          {reminders.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-2 h-9 text-sm font-semibold text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                aria-expanded={open}
                data-reminders-show
              >
                {open ? 'Hide' : 'Show'} what will be added
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <ul className="mt-1 space-y-1.5" data-reminders-list>
                  {reminders.map((r) => (
                    <li key={r.uid} className="text-[14px] leading-snug" data-reminder={r.kind}>
                      <span className="font-semibold text-zinc-900 tabular-nums">
                        {whenText(new Date(r.start.getTime() - r.alertBefore * 60000), now)}
                      </span>
                      <span className="text-zinc-600"> · {r.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
