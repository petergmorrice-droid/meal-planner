/**
 * Settings → On this phone: notifications for this phone. When they're on, the reminders (Settings
 * → Reminders) and the other person's additions to the shopping list arrive as notifications, even
 * with the app closed. The household key is in the synced settings, so it needs Sync between phones.
 * A phone without them gets the reminders as calendar alerts instead (Calendar, below).
 */
import { useState } from 'react';
import { Bell, BellOff, Send, Timer } from 'lucide-react';
import { UserPreferences } from '../../types';
import { personName } from '../PersonMark';
import { disablePush, enablePush, newHouseholdKey, pushSupport, sendTest, sendTestLater } from '../../pushNotify';
import { messageOf } from '../../errors';
import { card, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

const linkText = 'font-semibold text-emerald-700 cursor-pointer';

export function NotificationsSection({
  store,
  who,
  say,
  on,
  setOn,
  onGoToSync,
}: {
  store: SettingsTabProps['store'];
  who: string;
  say: (t: string) => void;
  /** Whether this phone has notifications on (shared with the Calendar section). */
  on: boolean;
  setOn: (on: boolean) => void;
  /** Open the Sync & backup tab. */
  onGoToSync: () => void;
}) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const support = pushSupport();
  const syncing = Boolean(store.githubConfig);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const other = personName(who === 'P' ? 'R' : 'P') || 'the other person';

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
  const testLater = () => {
    const s = sendTestLater(prefs.pushHousehold!, who);
    say(`Test coming in about ${s} seconds: close the app now`);
  };
  const note = (text: React.ReactNode, attr: string) => (
    <span className="block text-[13px] text-zinc-500 mt-1" {...{ [`data-notify-${attr}`]: true }}>
      {text}
    </span>
  );
  const instead = ' Until then, this phone can get the reminders as calendar alerts (Calendar, below).';
  const blocked = !syncing
    ? note(
        <>
          Notifications use <b>Sync between phones</b>: set that up on both phones first.{instead}
          <button type="button" onClick={onGoToSync} className={`${linkText} block mt-1`} data-notify-goto-sync>
            Set up sync
          </button>
        </>,
        'needs-sync',
      )
    : support === 'home-screen'
      ? note(
          <>
            On iPhone, notifications only work in the app on your Home Screen: in Safari tap Share →{' '}
            <b>Add to Home Screen</b>, then open the meal planner from that icon and come back here.{instead}
          </>,
          'home-screen',
        )
      : support === 'unsupported'
        ? note(
            `This browser can’t show notifications from the app. Try Chrome or the Home Screen app.${instead}`,
            'unsupported',
          )
        : null;

  return (
    <section data-settings-notifications>
      <h3 className={sectionTitle}>On this phone</h3>
      <div className={card}>
        <div className="px-4 py-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
            <Bell className="w-5 h-5 text-emerald-700" />
            Notifications
          </span>
          {blocked || (
            <>
              {note(
                on
                  ? `On. The reminders, and ${other} adding things to the shopping list, arrive here as notifications, even with the app closed.`
                  : `Best for the reminders, and to hear when ${other} adds things to the shopping list: they arrive even with the app closed. Without them, this phone can get the reminders as calendar alerts (Calendar, below).`,
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
                `Set who's using this phone (Phone tab) on both phones, so you're not told about your own additions.`,
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
      </div>
    </section>
  );
}
