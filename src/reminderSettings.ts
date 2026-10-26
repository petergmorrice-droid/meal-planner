// Settings → Reminders: what you're reminded about, the same for both phones (they're synced
// settings). Each phone gets them its own way: as notifications when they're on for that phone,
// otherwise as alerts from the calendar (calendarReminders.ts). Both follow these settings.
import { UserPreferences } from './types';
import { parseClock } from './cookInfo';

/** The morning heads-up's time if you haven't said: 9am. */
export const DEFAULT_MORNING_AT = '09:00';
/** When the night-before reminder goes off if you haven't said: 8pm. */
export const DEFAULT_PREP_AT = '20:00';
/** The days "Plan next week" can go off, and the one if you haven't said. */
export const PLAN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DEFAULT_PLAN_DAY = 'Friday';

/**
 * When the notification sender sends reminders, UK time: it checks every quarter of an hour in the
 * morning and from mid-afternoon into the evening (netlify/functions/push-schedule.mts). Those
 * hours in UTC cover these in both summer and winter time.
 */
export const MORNING_WINDOW = { from: '06:00', to: '11:45' };
export const EVENING_WINDOW = { from: '15:00', to: '21:45' };

const within = (t: string | null | undefined, w: { from: string; to: string }) => {
  const m = parseClock(t);
  return m !== null && m >= parseClock(w.from)! && m <= parseClock(w.to)!;
};
/** A time the morning heads-up can be set to. */
export const morningOk = (t?: string | null) => within(t, MORNING_WINDOW);
/** A time the night-before reminder can be set to. */
export const eveningOk = (t?: string | null) => within(t, EVENING_WINDOW);
/** Whether the notification sender is checking at this time of day (minutes after midnight). */
export function senderChecksAt(minutes: number): boolean {
  const t = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return morningOk(t) || eveningOk(t);
}

export interface ReminderSettings {
  /** Each morning: tonight's dinner, when to start it, and anything to do tonight for tomorrow. */
  morning: boolean;
  /** When the morning heads-up goes off ("09:00"). */
  morningAt: string;
  /** When it's time to start dinner. */
  cook: boolean;
  /** How many minutes before the start time it goes off (0 = at the start time). */
  cookAlertBefore: number;
  /** The evening before: freezer meals to take out, steps to do ahead. */
  prep: boolean;
  /** When the evening reminder goes off ("20:00"). */
  prepAt: string;
  /** On one day a week, at the morning time: next week isn't planned, or isn't on the shopping list. */
  plan: boolean;
  /** Which day ("Friday"). */
  planDay: string;
}

export function reminderSettings(prefs?: Partial<UserPreferences> | null): ReminderSettings {
  return {
    morning: prefs?.notifyDinner !== false,
    morningAt: morningOk(prefs?.notifyMorningAt) ? prefs!.notifyMorningAt! : DEFAULT_MORNING_AT,
    cook: prefs?.reminderCook !== false,
    cookAlertBefore: Math.max(0, Number(prefs?.reminderCookBefore) || 0),
    prep: prefs?.reminderPrep !== false,
    prepAt: eveningOk(prefs?.reminderPrepAt) ? prefs!.reminderPrepAt! : DEFAULT_PREP_AT,
    plan: prefs?.reminderPlan !== false,
    planDay: PLAN_DAYS.includes(prefs?.reminderPlanDay || '') ? prefs!.reminderPlanDay! : DEFAULT_PLAN_DAY,
  };
}
