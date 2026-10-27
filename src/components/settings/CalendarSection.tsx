/**
 * Settings → Calendar: the planned meals in each person's own calendar. With calendar sync on, the
 * calendar subscribes to a feed in the sync Gist and follows the plan by itself. There are two
 * feeds: just the dinners (for a phone whose reminders come as notifications), or the dinners with
 * the reminders as alerts (for a phone without notifications). Without sync, the reminders can
 * still be downloaded once as a file.
 */
import { useState } from 'react';
import { CalendarPlus, CalendarSync, ChevronDown, Copy, Download } from 'lucide-react';
import { calendarFeedUrl, reminderFileEvents, remindersCalendar, webcalUrl } from '../../calendarReminders';
import { UserPreferences } from '../../types';
import { formatDateISO } from '../../utils';
import { Segmented, card, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

const LAST_ADDED = 'mp-reminders-added';
const linkButton =
  'h-11 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer text-zinc-800';
const linkText = 'font-semibold text-emerald-700 cursor-pointer';
const muted = 'block text-[13px] text-zinc-500';

type Feed = 'dinners' | 'alerts';

export function CalendarSection({
  store,
  say,
  pushOn,
  onGoToSync,
}: {
  store: SettingsTabProps['store'];
  say: (t: string) => void;
  /** Whether this phone has notifications on: then its calendar needs just the dinners. */
  pushOn: boolean;
  /** Open the Sync & backup tab. */
  onGoToSync: () => void;
}) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const syncing = Boolean(store.githubConfig);
  const feedOn = Boolean(prefs.calendarSync) && syncing;
  const [picked, setPicked] = useState<Feed | null>(null);
  const feed: Feed = picked ?? (pushOn ? 'dinners' : 'alerts');
  const feedUrl =
    feedOn && store.gistOwner ? calendarFeedUrl(store.gistOwner, store.githubConfig!.gistId, feed === 'alerts') : null;
  const [showHow, setShowHow] = useState(false);
  const [showFile, setShowFile] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_ADDED);
    } catch {
      return null;
    }
  });

  const download = () => {
    const now = new Date();
    const events = reminderFileEvents(store.state, now);
    if (!events.length) {
      say('No reminders to come: plan a week, or switch a reminder on');
      return;
    }
    const blob = new Blob([remindersCalendar(events, now)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-reminders-${formatDateISO(now)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const stamp = now.toISOString();
    try {
      localStorage.setItem(LAST_ADDED, stamp);
    } catch {
      /* private browsing: just don't remember */
    }
    setLastAdded(stamp);
    say(`${events.length} reminders ready: open the file to add them to your calendar`);
  };

  const turnOn = () => {
    store.updatePreferences({ calendarSync: true });
    say('Calendar sync is on: now add it to your calendar below');
  };
  const copyLink = () => {
    if (!feedUrl) return;
    navigator.clipboard
      ?.writeText(feedUrl)
      .then(() => say('Calendar link copied'))
      .catch(() => say("Couldn't copy: press and hold the link to copy it"));
  };

  return (
    <section data-settings-calendar>
      <h3 className={sectionTitle}>Calendar</h3>
      <div className={card}>
        <div className="px-4 py-3" data-calendar-sync>
          <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
            <CalendarSync className="w-5 h-5 text-emerald-700" />
            Meals in my calendar
          </span>
          {!syncing ? (
            <span className={`${muted} mt-1`} data-calendar-sync-needs>
              Uses <b>Sync between phones</b>: set that up first, then come back here. Until then you can download the
              reminders once instead (below).
              <button type="button" onClick={onGoToSync} className={`${linkText} block mt-1`} data-calendar-goto-sync>
                Set up sync
              </button>
            </span>
          ) : !feedOn ? (
            <>
              <span className={`${muted} mt-1`}>
                Your planned dinners go in your own calendar and stay up to date as the plan changes: new meals appear,
                swapped or removed ones change or go. It can bring the reminders as alerts too, for a phone without
                notifications. Each of you adds it to your own calendar.
              </span>
              <button
                type="button"
                onClick={turnOn}
                className="mt-3 w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                data-calendar-sync-on
              >
                <CalendarSync className="w-5 h-5" />
                Turn on calendar sync
              </button>
            </>
          ) : (
            <>
              <span className={`${muted} mt-1`} data-calendar-sync-status>
                On. Each change to the plan updates the calendar the next time this app syncs; calendars check for
                changes every hour or so (Google Calendar can take up to a day).
              </span>
              <span className="block text-[15px] font-semibold text-zinc-900 mt-3 mb-1.5">Add to this calendar</span>
              <Segmented
                value={feed}
                options={[
                  { id: 'dinners', label: 'Just the dinners' },
                  { id: 'alerts', label: 'With reminders' },
                ]}
                onChange={setPicked}
                attr="calendar-feed"
              />
              <span className={`${muted} mt-1.5`} data-calendar-feed-advice>
                {feed === 'dinners'
                  ? pushOn
                    ? 'Best for this phone: its reminders come as notifications, so the calendar just shows the dinners.'
                    : "Just the dinners, no alerts. This phone doesn't have notifications on, so it won't get the reminders."
                  : pushOn
                    ? 'The dinners, with the reminders as alerts. This phone has notifications on too, so you’d be reminded twice.'
                    : 'Best for this phone: no notifications here, so the calendar sends the reminders as alerts.'}
              </span>
              {!feedUrl ? (
                <span className={`${muted} mt-2`} data-calendar-sync-waiting>
                  Getting your calendar link from the sync…{' '}
                  <button type="button" onClick={() => void store.manualSync()} className={linkText}>
                    Sync now
                  </button>
                </span>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a href={webcalUrl(feedUrl)} className={linkButton} data-calendar-sync-apple>
                      <CalendarPlus className="w-4 h-4" />
                      iPhone / Mac Calendar
                    </a>
                    <a
                      href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`}
                      target="_blank"
                      rel="noreferrer"
                      className={linkButton}
                      data-calendar-sync-google
                    >
                      <CalendarPlus className="w-4 h-4" />
                      Google Calendar
                    </a>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 font-mono text-xs text-zinc-600 truncate" data-calendar-sync-url>
                      {feedUrl}
                    </span>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      data-calendar-sync-copy
                    >
                      <Copy className="w-4 h-4" />
                      Copy link
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHow((o) => !o)}
                    className="mt-1 h-9 text-sm font-semibold text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                    aria-expanded={showHow}
                    data-calendar-sync-how
                  >
                    How to add it
                    <ChevronDown className={`w-4 h-4 transition-transform ${showHow ? 'rotate-180' : ''}`} />
                  </button>
                  {showHow && (
                    <ul className="mt-1 space-y-1.5 text-[13px] text-zinc-600 list-disc pl-5">
                      <li>
                        <b>iPhone or Mac:</b> tap <i>iPhone / Mac Calendar</i>, then <i>Subscribe</i>. Alerts come
                        through as normal (on a Mac, untick <i>Remove alerts</i>).
                      </li>
                      <li>
                        <b>Google Calendar / Android:</b> tap <i>Google Calendar</i> and <i>Add</i> (or on a computer,
                        Other calendars → <i>From URL</i> and paste the link). Google shows the meals but doesn't send
                        alerts for calendars added by link, so on Android turn on notifications (Notifications, above)
                        for the reminders.
                      </li>
                      <li>
                        <b>Outlook:</b> Add calendar → <i>Subscribe from web</i>, and paste the link.
                      </li>
                      <li>
                        To change between just the dinners and with reminders, remove the calendar you added and add the
                        other one.
                      </li>
                      <li>Anyone with the link can see the plan, so only share it with each other.</li>
                    </ul>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  store.updatePreferences({ calendarSync: false });
                  say('Calendar sync is off: the meals will go from your calendars at their next check');
                }}
                className="mt-1 block h-9 text-sm font-semibold text-zinc-500 cursor-pointer"
                data-calendar-sync-off
              >
                Turn off calendar sync
              </button>
            </>
          )}
        </div>
        <div className="px-4 py-3" data-reminders-file>
          <button
            type="button"
            onClick={() => setShowFile((o) => !o)}
            className="w-full text-left flex items-center gap-2 cursor-pointer"
            aria-expanded={showFile}
            data-reminders-file-toggle
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-zinc-900">Download the reminders once</span>
              <span className={muted}>Without calendar sync: a file to add to your calendar</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showFile ? 'rotate-180' : ''}`} />
          </button>
          {showFile && (
            <>
              <span className={`${muted} mt-2`}>
                The reminders still to come, as calendar events with alerts: your calendar sends them even with the app
                closed. It doesn't follow later changes, so download it again after planning a new week or changing
                meals; if your calendar then shows a reminder twice, delete the older one.
              </span>
              <button
                type="button"
                onClick={download}
                className="mt-3 w-full h-11 rounded-xl border border-zinc-300 text-zinc-800 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                data-reminders-add
              >
                <Download className="w-5 h-5" />
                Download reminders
              </button>
              {lastAdded && (
                <span className={`${muted} mt-2`} data-reminders-last-added>
                  Last added on this phone{' '}
                  {new Date(lastAdded).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  .
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
