/**
 * Settings → Reminders: what you're reminded about, the same on both phones (synced settings).
 * How each phone gets them is below: notifications when they're on for that phone (On this phone),
 * otherwise alerts from the calendar (Calendar). Both follow these settings.
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { reminderFileEvents } from '../../calendarReminders';
import {
  DEFAULT_MORNING_AT,
  DEFAULT_PREP_AT,
  EVENING_WINDOW,
  MORNING_WINDOW,
  PLAN_DAYS,
  eveningOk,
  morningOk,
  reminderSettings,
} from '../../reminderSettings';
import { UserPreferences } from '../../types';
import { formatDateISO } from '../../utils';
import { personName } from '../PersonMark';
import { Segmented, Switch, card, row, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

const clock = (t: string) =>
  new Date(`2000-01-01T${t}:00`)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' ', '')
    .replace(':00', '');

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

const timeInput = 'h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold tabular-nums';

export function RemindersSection({ store, who }: { store: SettingsTabProps['store']; who: string }) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const settings = reminderSettings(prefs);
  const notifying = Boolean(prefs.pushHousehold);
  const other = personName(who === 'P' ? 'R' : 'P') || 'the other person';
  const [open, setOpen] = useState(false);
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60000);
  const coming = useMemo(() => reminderFileEvents(store.state, new Date(minuteKey * 60000)), [store.state, minuteKey]);
  const count = (k: string) => coming.filter((r) => r.kind === k).length;
  const [mornings, cooks, preps, plans] = [count('meal'), count('cook'), count('prep'), count('plan')];
  const lastDay = coming.length ? coming[coming.length - 1].start : null;
  const alertAt = (r: (typeof coming)[number]) => new Date(r.start.getTime() - (r.alertBefore || 0) * 60000);

  return (
    <section data-settings-reminders>
      <h3 className={sectionTitle}>Reminders</h3>
      <p className="text-[13px] text-zinc-500 px-1 -mt-1 mb-1.5">
        The same on both phones. Each phone gets them as notifications or calendar alerts (below).
      </p>
      <div className={card}>
        <div className={row} data-setting-reminder-morning>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Each morning</span>
            <span className="block text-[13px] text-zinc-500">
              Tonight's dinner, when to start it, and anything to do tonight
            </span>
          </span>
          {settings.morning && (
            <input
              type="time"
              value={settings.morningAt}
              onChange={(e) => {
                if (morningOk(e.target.value)) store.updatePreferences({ notifyMorningAt: e.target.value });
              }}
              className={timeInput}
              min={MORNING_WINDOW.from}
              max={MORNING_WINDOW.to}
              aria-label="Morning reminder time"
              data-setting-reminder-morning-at
            />
          )}
          <Switch
            on={settings.morning}
            label="Morning reminders"
            onClick={() =>
              store.updatePreferences(
                settings.morning
                  ? { notifyDinner: false }
                  : { notifyDinner: true, notifyMorningAt: prefs.notifyMorningAt || DEFAULT_MORNING_AT },
              )
            }
            attr="setting-reminder-morning-switch"
          />
        </div>
        <div className="px-4 py-3" data-setting-reminder-cook>
          <span className="block text-[15px] font-semibold text-zinc-900">Time to start cooking</span>
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
          {notifying && settings.cook && (
            <span className="block text-[13px] text-zinc-500 mt-2" data-reminder-cook-window>
              Notifications for this only go out between {clock(EVENING_WINDOW.from)} and {clock(EVENING_WINDOW.to)}.
            </span>
          )}
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
                if (eveningOk(e.target.value)) store.updatePreferences({ reminderPrepAt: e.target.value });
              }}
              className={timeInput}
              min={EVENING_WINDOW.from}
              max={EVENING_WINDOW.to}
              aria-label="Night-before reminder time"
              data-setting-reminder-prep-at
            />
          )}
          <Switch
            on={settings.prep}
            label="Night-before reminders"
            onClick={() =>
              store.updatePreferences(
                settings.prep
                  ? { reminderPrep: false }
                  : { reminderPrep: true, reminderPrepAt: prefs.reminderPrepAt || DEFAULT_PREP_AT },
              )
            }
            attr="setting-reminder-prep-switch"
          />
        </div>
        <div className={row} data-setting-reminder-plan>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Plan next week</span>
            <span className="block text-[13px] text-zinc-500">
              At {clock(settings.morningAt)}, if next week has days with nothing planned or isn't on the shopping list
              yet
            </span>
          </span>
          {settings.plan && (
            <select
              value={settings.planDay}
              onChange={(e) => store.updatePreferences({ reminderPlanDay: e.target.value })}
              className="h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold cursor-pointer"
              aria-label="Day to plan next week"
              data-setting-reminder-plan-day
            >
              {PLAN_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d.slice(0, 3)}
                </option>
              ))}
            </select>
          )}
          <Switch
            on={settings.plan}
            label="Plan next week reminders"
            onClick={() => store.updatePreferences({ reminderPlan: !settings.plan })}
            attr="setting-reminder-plan-switch"
          />
        </div>
        <div className={row} data-notify-kind="list">
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Added to the shopping list</span>
            <span className="block text-[13px] text-zinc-500">
              “{other} added milk, eggs and bin bags”, straight away. Notifications only; not for meal ingredients from
              Send to list.
            </span>
          </span>
        </div>
        <div className="px-4 py-3">
          <span className="block text-[13px] text-zinc-500" data-reminders-summary>
            {coming.length
              ? `Coming up: ${[
                  mornings && `${mornings} ${mornings === 1 ? 'morning' : 'mornings'}`,
                  cooks && `${cooks} start-cooking`,
                  preps && `${preps} night-before`,
                  plans && `${plans} plan-next-week`,
                ]
                  .filter(Boolean)
                  .join(
                    ', ',
                  )}, up to ${lastDay!.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}.`
              : !settings.morning && !settings.cook && !settings.prep && !settings.plan
                ? 'All the reminders are off.'
                : 'Nothing planned from now on. Plan a week, then come back here.'}
          </span>
          {coming.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-1 h-9 text-sm font-semibold text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                aria-expanded={open}
                data-reminders-show
              >
                {open ? 'Hide' : 'Show'} what's coming
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <ul className="mt-1 space-y-1.5" data-reminders-list>
                  {coming.map((r) => (
                    <li key={r.uid} className="text-[14px] leading-snug" data-reminder={r.kind}>
                      <span className="font-semibold text-zinc-900 tabular-nums">{whenText(alertAt(r), now)}</span>
                      <span className="text-zinc-600"> · {r.title.replace(/^Dinner:\s*/, 'Tonight: ')}</span>
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
