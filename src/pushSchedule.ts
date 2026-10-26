// The reminders as notifications (Settings → Reminders, for phones with notifications on), worked
// out from the plan on the phone and sent to the notification sender, which sends each one at its
// time even with the app closed. They follow the same settings as the calendar's alerts:
// - Each morning: tonight's dinner, when to start it, and anything to do tonight for tomorrow.
// - Time to start cooking (at the start time, or a little before).
// - The night before: take a freezer meal out to defrost, or a marinate/soak step.
// The sender only checks in the morning and from mid-afternoon to the evening (reminderSettings.ts),
// so a reminder that falls outside those hours isn't sent as a notification.
import { BatchItem, MealPlan, Recipe, UserPreferences } from './types';
import { parseClock, clockText } from './cookInfo';
import { plannedMealEvents, upcomingReminders } from './calendarReminders';
import { reminderSettings, senderChecksAt } from './reminderSettings';

/** How far ahead the schedule goes. */
const DAYS_AHEAD = 21;
/** The sender checks every quarter of an hour, so each one is set for the quarter it's due in. */
const QUARTER = 15 * 60 * 1000;

export interface ScheduledNote {
  id: string;
  at: number;
  title: string;
  body: string;
  tab?: 'shop' | 'this_week';
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atTime = (date: string, minutes: number) => {
  const d = new Date(date + 'T00:00:00');
  d.setMinutes(minutes);
  return d.getTime();
};
const clockOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** "Take the Lasagne out of the freezer tonight, for tomorrow's dinner." / "Marinate the chicken… (for tomorrow's Chicken tikka)." */
function prepBody(step: string, dish: string): string {
  const what = step.replace(/^Get ahead:\s*/i, '').replace(/[.…]+$/, '');
  return what.toLowerCase().includes(dish.toLowerCase())
    ? `${what} tonight, for tomorrow's dinner.`
    : `${what} (for tomorrow's ${dish}).`;
}

/** The reminder notifications from today on (today's included even if their time has passed: the sender skips late ones). */
export function notificationSchedule(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
): ScheduledNote[] {
  const settings = reminderSettings(state.preferences);
  const today = iso(now);
  const last = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD));
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Every start time and do-ahead step: the morning heads-up mentions them even when their own
  // reminders are off.
  const all = upcomingReminders(
    {
      ...state,
      preferences: { ...state.preferences, reminderCook: true, reminderCookBefore: 0, reminderPrep: true },
    },
    startOfToday,
  ).filter((r) => r.date >= today && r.date <= last);
  const prepFor = (r: (typeof all)[number]) =>
    prepBody(
      r.title,
      r.details
        .split('\n')[0]
        .replace(/^For tomorrow's dinner:\s*/, '')
        .replace(/\.$/, ''),
    );
  const out: ScheduledNote[] = [];
  const add = (note: ScheduledNote) => {
    const at = Math.floor(note.at / QUARTER) * QUARTER;
    if (senderChecksAt(clockOf(at))) out.push({ ...note, at, tab: 'this_week' });
  };

  if (settings.morning) {
    const morning = parseClock(settings.morningAt)!;
    const meals = plannedMealEvents(state, today).filter((m) => m.date <= last);
    const dates = [
      ...new Set([...meals.map((m) => m.date), ...all.filter((r) => r.kind === 'prep').map((r) => r.date)]),
    ];
    for (const date of dates.sort()) {
      const meal = meals.find((m) => m.date === date);
      const cook = all.find((r) => r.kind === 'cook' && r.date === date);
      const prep = all.find((r) => r.kind === 'prep' && r.date === date);
      const dish = meal ? `${meal.title.replace(/^Dinner:\s*/, '')}.` : '';
      const start = meal && cook ? `Start by ${clockText(clockOf(cook.start.getTime()))}.` : '';
      add({
        id: `${date}-dinner`,
        at: atTime(date, morning),
        title: meal ? "Tonight's dinner" : 'To do tonight',
        body: [dish.replace('..', '.'), start, prep ? prepFor(prep) : ''].filter(Boolean).join(' '),
      });
    }
  }

  for (const r of all) {
    if (r.kind === 'cook' && settings.cook) {
      const before = settings.cookAlertBefore;
      const [eat, how] = r.details.split('\n');
      add({
        id: `${r.date}-cook`,
        at: r.start.getTime() - before * 60000,
        title: r.title,
        body: before
          ? `Start at ${clockText(clockOf(r.start.getTime()))}. ${eat}`
          : [eat, how].filter(Boolean).join(' '),
      });
    }
    if (r.kind === 'prep' && settings.prep) {
      add({
        id: `${r.date}-prep`,
        at: atTime(r.date, parseClock(settings.prepAt)!),
        title: 'To do tonight',
        body: prepFor(r),
      });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
