/**
 * Settings → Notifications: this phone gets a notification when the other person adds things to the
 * shopping list. The household key is in the synced settings, so it needs Sync between phones.
 */
import { useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { UserPreferences } from '../../types';
import { personName } from '../PersonMark';
import { disablePush, enablePush, newHouseholdKey, pushOnHere, pushSupport, sendTest } from '../../pushNotify';
import { messageOf } from '../../errors';
import { card, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

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
  const support = pushSupport();
  const syncing = Boolean(store.githubConfig);
  const [on, setOn] = useState(pushOnHere);
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
      say(`Notifications on: you'll hear when ${other} adds to the list`);
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

  const note = (text: React.ReactNode, attr: string) => (
    <span className="block text-[13px] text-zinc-500 mt-1" {...{ [`data-notify-${attr}`]: true }}>
      {text}
    </span>
  );

  return (
    <section data-settings-notifications>
      <h3 className={sectionTitle}>Notifications</h3>
      <div className={card}>
        <div className="px-4 py-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
            <Bell className="w-5 h-5 text-emerald-700" />
            When {other} adds to the list
          </span>
          {!syncing ? (
            note(
              <>
                Notifications use <b>Sync between phones</b> (below): set that up on both phones first.
              </>,
              'needs-sync',
            )
          ) : support === 'home-screen' ? (
            note(
              <>
                On iPhone, notifications only work in the app on your Home Screen: in Safari tap Share →{' '}
                <b>Add to Home Screen</b>, then open the meal planner from that icon and come back here.
              </>,
              'home-screen',
            )
          ) : support === 'unsupported' ? (
            note(
              'This browser can’t show notifications from the app. Try Chrome or the Home Screen app.',
              'unsupported',
            )
          ) : (
            <>
              {note(
                on
                  ? `On for this phone. ${other} adding things by hand sends one notification a little later ("${other} added milk, eggs and bin bags"); meal ingredients from Send to list don't.`
                  : `Get a notification on this phone when ${other} adds things to the shopping list.`,
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
      </div>
    </section>
  );
}
