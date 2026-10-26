// The morning notifications (Settings → Notifications), worked out from the plan on the phone and
// sent to the notification sender, which sends each one at its time even with the app closed:
// - "Tonight's dinner": the day's meal and when to start (9am unless changed).
// - "For tomorrow": the evening before a meal that needs it, at the same morning time, what to do
//   tonight: take a freezer meal out to defrost, or a marinate/soak step.
import { BatchItem, MealPlan, Recipe, UserPreferences } from './types';
import { parseClock, clockText } from './cookInfo';
import { plannedMealEvents, upcomingReminders } from './calendarReminders';

/** When the morning notifications go off if you haven't said: 9am. */
export const DEFAULT_MORNING_AT = '09:00';
/** How far ahead the schedule goes. */
const DAYS_AHEAD = 21;

export interface ScheduledNote {
  id: string;
  at: number;
  title: string;
  body: string;
  tab?: 'shop' | 'this_week';
}

export function morningSettings(prefs?: Partial<UserPreferences> | null) {
  return {
    dinner: prefs?.notifyDinner !== false,
    prep: prefs?.notifyPrep !== false,
    at: parseClock(prefs?.notifyMorningAt) !== null ? prefs!.notifyMorningAt! : DEFAULT_MORNING_AT,
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atTime = (date: string, minutes: number) => {
  const d = new Date(date + 'T00:00:00');
  d.setMinutes(minutes);
  return d.getTime();
};

/** "Take the Lasagne out of the freezer tonight, for tomorrow's dinner." / "Marinate the chicken… (for tomorrow's Chicken tikka)." */
function prepBody(step: string, dish: string): string {
  const what = step.replace(/^Get ahead:\s*/i, '').replace(/[.…]+$/, '');
  return what.toLowerCase().includes(dish.toLowerCase())
    ? `${what} tonight, for tomorrow's dinner.`
    : `${what} (for tomorrow's ${dish}).`;
}

/** The morning notifications from today on (today's included even if its time has passed: the sender skips late ones). */
export function morningSchedule(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
): ScheduledNote[] {
  const settings = morningSettings(state.preferences);
  const morning = parseClock(settings.at)!;
  const today = iso(now);
  const last = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD));
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Start times and do-ahead steps, whatever the calendar reminders are set to.
  const reminders = upcomingReminders(
    {
      ...state,
      preferences: { ...state.preferences, reminderCook: true, reminderCookBefore: 0, reminderPrep: true },
    },
    startOfToday,
  );
  const out: ScheduledNote[] = [];

  if (settings.dinner) {
    for (const meal of plannedMealEvents(state, today)) {
      if (meal.date > last) continue;
      const cook = reminders.find((r) => r.kind === 'cook' && r.date === meal.date);
      const dish = meal.title.replace(/^Dinner:\s*/, '');
      const start = cook ? ` Start by ${clockText(cook.start.getHours() * 60 + cook.start.getMinutes())}.` : '';
      out.push({
        id: `${meal.date}-dinner`,
        at: atTime(meal.date, morning),
        title: "Tonight's dinner",
        body: `${dish}.${start}`.replace('..', '.'),
        tab: 'this_week',
      });
    }
  }

  if (settings.prep) {
    for (const r of reminders) {
      if (r.kind !== 'prep' || r.date < today || r.date > last) continue;
      // r.date is the evening before the meal; the details' first line names tomorrow's dinner.
      const forWhat = r.details
        .split('\n')[0]
        .replace(/^For tomorrow's dinner:\s*/, '')
        .replace(/\.$/, '');
      out.push({
        id: `${r.date}-prep`,
        at: atTime(r.date, morning),
        title: 'To do tonight',
        body: prepBody(r.title, forWhat),
        tab: 'this_week',
      });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
