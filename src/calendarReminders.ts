// Settings → Calendar: the planned dinners and the reminders (reminderSettings.ts) as calendar
// events, so a phone without notifications still gets the reminders, from its own calendar, even
// when the app is closed. Pure functions (no React, no storage). With calendar sync on, every upload
// to the sync Gist also writes two calendar feeds there, which each person's calendar subscribes
// to: just the dinners (for a phone that has notifications), or the dinners with the reminders as
// alerts. The screen can also download the alerts once as a file.
import { BatchItem, MealPlan, PlannedMeal, Recipe, UserPreferences } from './types';
import { eatAtFor, parseClock, prepTonight, recipeMinutes, clockText } from './cookInfo';
import { REHEAT_MINUTES, dayISO, isCookable } from './components/cook/cookDays';
import { DAYS_OF_WEEK, formatWeekRange } from './utils';
import { changedDaysSinceList } from './planning';
import { reminderSettings } from './reminderSettings';

/** A recipe with no times in it: assume this long. */
const UNKNOWN_RECIPE_MINUTES = 45;

export interface CalendarReminder {
  /** Stays the same for the same day and kind, so adding again can replace rather than double up. */
  uid: string;
  /**
   * 'meal' is the planned dinner itself (its alert, if any, is the morning heads-up); 'cook', 'prep'
   * and 'plan' (plan next week) are the reminders.
   */
  kind: 'meal' | 'cook' | 'prep' | 'plan';
  /** The day it goes off ("2026-10-27"). */
  date: string;
  start: Date;
  end: Date;
  title: string;
  details: string;
  /** Minutes before the start the alert goes off (null = no alert). */
  alertBefore: number | null;
}

const at = (iso: string, minutes: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setMinutes(minutes);
  return d;
};
const dayBefore = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const methodName = (m: string) => (m === 'ninja' ? 'Ninja' : 'oven & hob');

/**
 * The reminders still to come for every planned day from today on: "Start cooking" at the
 * Cook tab's start-by time, and the evening before, anything to take out of the freezer or do
 * ahead. Meals already ticked as cooked, and reminders whose time has passed, are left out.
 */
export function upcomingReminders(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
): CalendarReminder[] {
  const prefs = state.preferences || {};
  const settings = reminderSettings(prefs);
  const recipes = state.recipes || [];
  const batches = state.batches || [];
  const eatAt = parseClock(eatAtFor(prefs, '').usual)!;
  const prepAt = parseClock(settings.prepAt)!;
  const recipeFor = (m: PlannedMeal) => (m.recipeId ? recipes.find((r) => r.id === m.recipeId) || null : null);
  const methodFor = (r: Recipe | null) => {
    const ms = r?.cookingMethods?.length ? r.cookingMethods : ['oven_hob'];
    const p = prefs.preferredCookingMethod;
    return p && p !== 'all' && ms.includes(p) ? p : ms[0];
  };

  // Each date's meal, once (a day can't be in two plans, but be safe: the newest plan wins).
  const meals = new Map<string, PlannedMeal>();
  const plans = [...(state.mealPlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const plan of plans)
    for (const day of DAYS_OF_WEEK) {
      const meal = plan.days?.[day]?.meals?.[0];
      if (meal) meals.set(dayISO(plan, day), meal);
    }

  const out: CalendarReminder[] = [];
  for (const [date, meal] of [...meals].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isCookable(meal) || meal.cooked) continue;
    const recipe = recipeFor(meal);
    const name =
      (meal.type === 'batch' ? batches.find((b) => b.id === meal.batchId)?.name : null) ||
      recipe?.name ||
      meal.name.replace(/^(leftovers?|batch):\s*/i, '').trim() ||
      'dinner';

    if (settings.cook) {
      const isRecipe = meal.type === 'recipe';
      const method = methodFor(recipe);
      const known = isRecipe ? recipeMinutes(recipe, method) : REHEAT_MINUTES[meal.type] || 0;
      const minutes = known || UNKNOWN_RECIPE_MINUTES;
      const start = at(date, eatAt - minutes);
      if (start.getTime() - settings.cookAlertBefore * 60000 > now.getTime()) {
        const verb = isRecipe ? 'Start cooking' : meal.type === 'batch' ? 'Start reheating' : 'Heat up leftovers';
        out.push({
          uid: `${date}-cook@family-meal-planner`,
          kind: 'cook',
          date,
          start,
          end: at(date, eatAt),
          title: `${verb}: ${name}`,
          details: [
            `To eat at ${clockText(eatAt)}.`,
            isRecipe
              ? known
                ? `${minutes} mins prep and cooking (${methodName(method)}).`
                : `The recipe has no times, so this allows ${minutes} mins.`
              : `About ${minutes} mins to heat through.`,
            meal.note ? `Note: ${meal.note}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          alertBefore: settings.cookAlertBefore,
        });
      }
    }

    if (settings.prep) {
      const text = prepTonight(meal, recipe, name);
      const eve = dayBefore(date);
      const start = at(eve, prepAt);
      if (text && start.getTime() > now.getTime()) {
        const title = text.replace(/ tonight\b/i, '').replace(/^Get ahead:\s*/i, 'Get ahead: ');
        out.push({
          uid: `${date}-prep@family-meal-planner`,
          kind: 'prep',
          date: eve,
          start,
          end: new Date(start.getTime() + 15 * 60000),
          title: title.length > 70 ? `${title.slice(0, 69).trimEnd()}…` : title,
          details: [
            `For tomorrow's dinner: ${name}.`,
            meal.type === 'recipe' ? text.replace(/^Get ahead tonight:\s*/i, '') : '',
          ]
            .filter(Boolean)
            .join('\n'),
          alertBefore: 0,
        });
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const shortDays = (days: string[]) => {
  const d = days.map((x) => x.slice(0, 3));
  return d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}` : d[0];
};

/**
 * "Plan next week" on the chosen day each week (at the morning time), for the coming `days` from
 * `now`, when the week after it isn't ready: days with nothing planned, its ingredients not on
 * the shopping list yet, or meals changed since they were. Nothing when it's ready.
 */
export function planReminders(
  state: { mealPlans?: MealPlan[]; preferences?: Partial<UserPreferences> },
  now: Date,
  days = 21,
): CalendarReminder[] {
  const settings = reminderSettings(state.preferences);
  if (!settings.plan) return [];
  const morning = parseClock(settings.morningAt)!;
  const out: CalendarReminder[] = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const weekday = (d.getDay() + 6) % 7; // Monday 0
    if (DAYS_OF_WEEK[weekday] !== settings.planDay) continue;
    const date = isoDay(d);
    const start = at(date, morning);
    if (start.getTime() <= now.getTime()) continue;
    const week = isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 - weekday));
    const plan = (state.mealPlans || []).find((p) => p.startDate === week);
    const empty = DAYS_OF_WEEK.filter((day) => !plan?.days?.[day]?.meals?.length);
    const changed = changedDaysSinceList(plan);
    const range = formatWeekRange(week);
    const say: [string, string] | null =
      empty.length === 7
        ? ['Plan next week', `Nothing planned for ${range} yet.`]
        : empty.length
          ? ['Plan next week', `Nothing planned yet for ${shortDays(empty)} (${range}).`]
          : plan && plan.status !== 'finalized'
            ? ['Send next week to the shopping list', `${range} is planned, but it isn't on the shopping list yet.`]
            : changed.length
              ? [
                  "Update next week's shopping list",
                  `${shortDays(changed)} changed since the list was made (${range}).`,
                ]
              : null;
    if (!say) continue;
    const [title, details] = say;
    out.push({
      uid: `${date}-plan@family-meal-planner`,
      kind: 'plan',
      date,
      start,
      end: new Date(start.getTime() + 15 * 60000),
      title,
      details,
      alertBefore: 0,
    });
  }
  return out;
}

/** How the planned dinner shows in the calendar ("Dinner: Chilli con carne", "Takeaway: Pizza"). */
function mealTitle(meal: PlannedMeal, recipes: Recipe[], batches: BatchItem[]): string {
  const recipe = meal.recipeId ? recipes.find((r) => r.id === meal.recipeId) : null;
  const bare = meal.name.replace(/^(leftovers?|batch):\s*/i, '').trim();
  // A takeaway called "Takeaway" doesn't need saying twice.
  const named = (label: string) =>
    bare && bare.toLowerCase().replace('takeout', 'takeaway') !== label.toLowerCase() ? `${label}: ${bare}` : label;
  if (meal.type === 'takeout') return named('Takeaway');
  if (meal.type === 'eating_out') return named('Eating out');
  if (meal.type === 'batch')
    return `Dinner: ${batches.find((b) => b.id === meal.batchId)?.name || bare || 'from the freezer'} (from the freezer)`;
  if (meal.type === 'leftover') return `Dinner: ${recipe?.name || bare || 'leftovers'} (leftovers)`;
  return `Dinner: ${recipe?.name || bare || 'dinner'}`;
}

/**
 * The planned dinners themselves, from `fromDate` ("2026-10-19") on, at your usual eating time:
 * cooked or not, takeaways and eating out too (days with no meal are left out). With `alerts`, each
 * carries the morning heads-up (when that's on) as its alert; otherwise no alerts.
 */
export function plannedMealEvents(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  fromDate: string,
  alerts = false,
): CalendarReminder[] {
  const recipes = state.recipes || [];
  const batches = state.batches || [];
  const eatAt = parseClock(eatAtFor(state.preferences, '').usual)!;
  const settings = reminderSettings(state.preferences);
  const morningBefore = eatAt - parseClock(settings.morningAt)!;
  const alertBefore = alerts && settings.morning && morningBefore > 0 ? morningBefore : null;
  const meals = new Map<string, PlannedMeal>();
  const plans = [...(state.mealPlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const plan of plans)
    for (const day of DAYS_OF_WEEK) {
      const meal = plan.days?.[day]?.meals?.[0];
      if (meal) meals.set(dayISO(plan, day), meal);
    }
  const out: CalendarReminder[] = [];
  for (const [date, meal] of [...meals].sort(([a], [b]) => a.localeCompare(b))) {
    if (date < fromDate || meal.type === 'no_meal') continue;
    const people = Number(meal.servings) || 0;
    out.push({
      uid: `${date}-meal@family-meal-planner`,
      kind: 'meal',
      date,
      start: at(date, eatAt),
      end: at(date, eatAt + 60),
      title: mealTitle(meal, recipes, batches),
      details: [
        people && isCookable(meal) ? `For ${people}.` : '',
        meal.sides?.length ? `With ${meal.sides.map((s) => s.name).join(', ')}.` : '',
        meal.note ? `Note: ${meal.note}` : '',
        meal.cooked ? 'Cooked ✓' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      alertBefore,
    });
  }
  return out;
}

// ---------- Calendar sync: two feeds in the sync Gist ----------

/** The feed of just the dinners (for a phone whose reminders come as notifications). */
export const CALENDAR_FILE = 'meal-planner-calendar.ics';
/** The feed of the dinners and the reminders, with alerts (for a phone without notifications). */
export const CALENDAR_ALERTS_FILE = 'meal-planner-calendar-alerts.ics';
const CALENDAR_FILES = [CALENDAR_FILE, CALENDAR_ALERTS_FILE];
/** Days already gone that stay in the feed, so last week's dinners don't vanish from the calendar. */
const FEED_PAST_DAYS = 14;

/** The address calendars subscribe to: the newest copy of that feed's file in the Gist. */
export function calendarFeedUrl(owner: string, gistId: string, alerts = false): string {
  const file = alerts ? CALENDAR_ALERTS_FILE : CALENDAR_FILE;
  return `https://gist.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(gistId)}/raw/${file}`;
}

/** The same address for "Subscribe" on iPhone, iPad and Mac (webcal:// opens the Calendar app). */
export const webcalUrl = (url: string) => url.replace(/^https:/, 'webcal:');

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const byTime = (a: CalendarReminder, b: CalendarReminder) =>
  a.start.getTime() - b.start.getTime() || a.kind.localeCompare(b.kind);

/**
 * What's in a feed: the planned dinners from two weeks ago on, and with `alerts`, the reminders
 * too: the morning heads-up on each dinner, and the start-cooking, night-before and plan-next-week
 * reminders.
 */
export function calendarFeedEvents(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
  alerts = false,
): CalendarReminder[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FEED_PAST_DAYS);
  const reminders = alerts ? [...upcomingReminders(state, from), ...planReminders(state, now)] : [];
  return [...plannedMealEvents(state, isoDay(from), alerts), ...reminders].sort(byTime);
}

/**
 * The reminders still to come, as calendar events with alerts, in the order they go off: the same
 * events (and ids) as the alerts feed, so downloading them again replaces rather than doubles up.
 */
export function reminderFileEvents(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
): CalendarReminder[] {
  const mornings = plannedMealEvents(state, isoDay(now), true).filter(
    (m) => m.alertBefore !== null && m.start.getTime() - m.alertBefore * 60000 > now.getTime(),
  );
  const alertAt = (r: CalendarReminder) => r.start.getTime() - (r.alertBefore || 0) * 60000;
  return [...mornings, ...upcomingReminders(state, now), ...planReminders(state, now)].sort(
    (a, b) => alertAt(a) - alertAt(b) || byTime(a, b),
  );
}

/**
 * The Gist files to write alongside the data: both calendar feeds when calendar sync is on, or
 * (when it's been switched off) the old feeds removed, so calendars empty out rather than go stale.
 */
export function calendarFeedFiles(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  existingFiles: string[],
  now: Date,
): Record<string, { content: string } | null> {
  const out: Record<string, { content: string } | null> = {};
  if (state.preferences?.calendarSync) {
    out[CALENDAR_FILE] = { content: remindersCalendar(calendarFeedEvents(state, now), now) };
    out[CALENDAR_ALERTS_FILE] = { content: remindersCalendar(calendarFeedEvents(state, now, true), now) };
  } else for (const f of CALENDAR_FILES) if (existingFiles.includes(f)) out[f] = null;
  return out;
}

/** Calendar sync is on but a feed isn't in the Gist yet (just turned on, or from before there were two). */
export function calendarFeedMissing(state: { preferences?: Partial<UserPreferences> }, existingFiles: string[]) {
  return Boolean(state.preferences?.calendarSync) && CALENDAR_FILES.some((f) => !existingFiles.includes(f));
}

// ---------- The .ics file ----------

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Lines longer than 75 bytes are folded onto the next line with a leading space (RFC 5545). */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** A calendar file of these events, with an alert on each that has one. */
export function remindersCalendar(reminders: CalendarReminder[], now: Date): string {
  const stamp = utc(now);
  // Higher than last time, so a calendar that tracks events by their id takes the newer one.
  const sequence = Math.floor(now.getTime() / 60000) % 2_000_000_000;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Meal Planner//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Meal planner',
    // How often a subscribed calendar should look for changes (calendars that honour it).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const r of reminders) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.uid}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${utc(r.start)}`,
      `DTEND:${utc(r.end)}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(r.details)}`,
      'TRANSP:TRANSPARENT',
    );
    if (r.alertBefore !== null)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(r.title)}`,
        `TRIGGER:${r.alertBefore ? `-PT${r.alertBefore}M` : 'PT0M'}`,
        'END:VALARM',
      );
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
