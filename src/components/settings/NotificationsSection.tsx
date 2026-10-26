/**
 * Settings → Notifications: this phone gets a notification when the other person adds things to the
 * shopping list, and each morning tonight's dinner and anything to do tonight for tomorrow (take a
 * freezer meal out, marinate). The household key and the morning settings are in the synced
 * settings, so it needs Sync between phones.
 */
import { useState } from 'react';
import { Bell, BellOff, Send, Timer } from 'lucide-react';
import { UserPreferences } from '../../types';
import { parseClock } from '../../cookInfo';
import { personName } from '../PersonMark';
import {
  disablePush,
  enablePush,
  newHouseholdKey,
  pushOnHere,
  pushSupport,
  sendTest,
  sendTestLater,
} from '../../pushNotify';
import { morningSettings } from '../../pushSchedule';
import { messageOf } from '../../errors';
import { card, row, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

function Switch({ on, label, onClick, attr }: { on: boolean; label: string; onClick: () => void; attr: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`w-12 h-7 rounded-full p-0.5 shrink-0 cursor-pointer transition-colors ${on ? 'bg-emerald-600' : 'bg-zinc-300'}`}
      {...{ [`data-notify-${attr}`]: true }}
    >
      <span
        className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

export function NotificationsSection({
  store,
  who,
  say,
}: {
  store: SettingsTabProps['store'];
  who: string;
  say: (t: string) => void;
}) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const morning = morningSettings(prefs);
  const support = pushSupport();
  const syncing = Boolean(store.githubConfig);
  const [on, setOn] = useState(pushOnHere);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const other = personName(who === 'P' ? 'R' : 'P') || 'the other person';
  const time = new Date(`2000-01-01T${morning.at}:00`)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' ', '')
    .replace(':00', '');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(messageOf(err) || 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () =>
    run(async () => {
      let household = prefs.pushHousehold;
      if (!household) {
        household = newHouseholdKey();
        await store.updatePreferences({ pushHousehold: household });
      }
      await enablePush(household, who);
      setOn(true);
      say('Notifications on for this phone');
    });
  const turnOff = () =>
    run(async () => {
      if (prefs.pushHousehold) await disablePush(prefs.pushHousehold);
      setOn(false);
      say('Notifications off on this phone');
    });
  const test = () =>
    run(async () => {
      const n = await sendTest(prefs.pushHousehold!, who);
      say(n ? `Test sent to ${n} ${n === 1 ? 'phone' : 'phones'}` : 'No phones have notifications on yet');
    });
  const testLater = () =>
    run(async () => {
      const s = await sendTestLater(prefs.pushHousehold!, who);
      say(`Test coming in about ${s} seconds: close the app now`);
    });

  const note = (text: React.ReactNode, attr: string) => (
    <span className="block text-[13px] text-zinc-500 mt-1" {...{ [`data-notify-${attr}`]: true }}>
      {text}
    </span>
  );
  const blocked = !syncing
    ? note(
        <>
          Notifications use <b>Sync between phones</b> (below): set that up on both phones first.
        </>,
        'needs-sync',
      )
    : support === 'home-screen'
      ? note(
          <>
            On iPhone, notifications only work in the app on your Home Screen: in Safari tap Share →{' '}
            <b>Add to Home Screen</b>, then open the meal planner from that icon and come back here.
          </>,
          'home-screen',
        )
      : support === 'unsupported'
        ? note('This browser can’t show notifications from the app. Try Chrome or the Home Screen app.', 'unsupported')
        : null;

  return (
    <section data-settings-notifications>
      <h3 className={sectionTitle}>Notifications</h3>
      <div className={card}>
        <div className="px-4 py-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
            <Bell className="w-5 h-5 text-emerald-700" />
            Notifications on this phone
          </span>
          {blocked || (
            <>
              {note(
                on
                  ? `On. This phone hears when ${other} adds things to the shopping list, and each morning about dinner (below). They arrive with the app closed.`
                  : `Get notifications on this phone: when ${other} adds things to the shopping list, and each morning about dinner.`,
                'status',
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {on ? (
                  <>
                    <button
                      type="button"
                      onClick={test}
                      disabled={busy}
                      className="h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      data-notify-test
                    >
                      <Send className="w-4 h-4" />
                      Send test
                    </button>
                    <button
                      type="button"
                      onClick={testLater}
                      disabled={busy}
                      className="h-11 px-4 rounded-xl border border-emerald-600 text-emerald-800 font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      data-notify-test-later
                    >
                      <Timer className="w-4 h-4" />
                      Test in 45 seconds
                    </button>
                    <button
                      type="button"
                      onClick={turnOff}
                      disabled={busy}
                      className="h-11 px-4 rounded-xl border border-zinc-300 text-zinc-700 font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      data-notify-off
                    >
                      <BellOff className="w-4 h-4" />
                      Turn off
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={turnOn}
                    disabled={busy}
                    className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    data-notify-on
                  >
                    <Bell className="w-5 h-5" />
                    {busy ? 'Turning on…' : 'Turn on notifications'}
                  </button>
                )}
              </div>
              {on &&
                note(
                  '“Test in 45 seconds”: tap it, then close the app or lock the phone, to check notifications arrive with the app closed.',
                  'test-later-hint',
                )}
              {note(
                `Set who's using this phone (This phone, above) on both phones, so you're not told about your own additions.`,
                'who',
              )}
            </>
          )}
          {problem && (
            <span className="block text-[13px] text-rose-700 mt-2" role="alert" data-notify-problem>
              {problem}
            </span>
          )}
        </div>

        {/* What you're told about: the list (always), and the mornings (both phones; synced). */}
        {!blocked && (
          <>
            <div className={row} data-notify-kind="list">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900">Added to the list</span>
                <span className="block text-[13px] text-zinc-500">
                  “{other} added milk, eggs and bin bags”, a little after they finish. Not for meal ingredients from
                  Send to list.
                </span>
              </span>
            </div>
            <div className={row} data-notify-kind="dinner">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900">Tonight’s dinner</span>
                <span className="block text-[13px] text-zinc-500">
                  Each morning at {time}: the meal and when to start it.
                </span>
              </span>
              <Switch
                on={morning.dinner}
                label="Tonight's dinner notifications"
                onClick={() => store.updatePreferences({ notifyDinner: !morning.dinner })}
                attr="dinner-switch"
              />
            </div>
            <div className={row} data-notify-kind="prep">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900">To do tonight</span>
                <span className="block text-[13px] text-zinc-500">
                  At {time} the day before: take a freezer meal out to defrost, or marinate or soak overnight.
                </span>
              </span>
              <Switch
                on={morning.prep}
                label="To do tonight notifications"
                onClick={() => store.updatePreferences({ notifyPrep: !morning.prep })}
                attr="prep-switch"
              />
            </div>
            <div className={row}>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900">Morning time</span>
                <span className="block text-[13px] text-zinc-500">For both phones</span>
              </span>
              <input
                type="time"
                value={morning.at}
                onChange={(e) => {
                  if (parseClock(e.target.value) !== null) store.updatePreferences({ notifyMorningAt: e.target.value });
                }}
                className="h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold tabular-nums"
                aria-label="Morning notification time"
                data-notify-morning-at
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
