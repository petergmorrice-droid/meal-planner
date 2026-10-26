// Settings → Reminders: the coming meals as calendar events, so each phone's own calendar sends
// the alerts (when to start dinner, what to take out of the freezer the night before) even when
// the app is closed. Pure functions (no React, no storage): the screen downloads the .ics file,
// and with calendar sync on, every upload to the sync Gist also writes it there as a calendar feed
// that each person's calendar subscribes to, so it follows the plan by itself.
import { BatchItem, MealPlan, PlannedMeal, Recipe, UserPreferences } from './types';
import { eatAtFor, parseClock, prepTonight, recipeMinutes, clockText } from './cookInfo';
import { REHEAT_MINUTES, dayISO, isCookable } from './components/cook/cookDays';
import { DAYS_OF_WEEK } from './utils';

/** When the night-before reminder goes off if you haven't said: 8pm. */
export const DEFAULT_PREP_AT = '20:00';
/** A recipe with no times in it: assume this long. */
const UNKNOWN_RECIPE_MINUTES = 45;

export interface ReminderSettings {
  /** Alerts when it's time to start dinner. */
  cook: boolean;
  /** How many minutes before the start time the alert goes off (0 = at the start time). */
  cookAlertBefore: number;
  /** Alerts the evening before: freezer meals to take out, steps to do ahead. */
  prep: boolean;
  /** When the evening alert goes off ("20:00"). */
  prepAt: string;
}

export function reminderSettings(prefs?: Partial<UserPreferences> | null): ReminderSettings {
  return {
    cook: prefs?.reminderCook !== false,
    cookAlertBefore: Math.max(0, Number(prefs?.reminderCookBefore) || 0),
    prep: prefs?.reminderPrep !== false,
    prepAt: parseClock(prefs?.reminderPrepAt) !== null ? prefs!.reminderPrepAt! : DEFAULT_PREP_AT,
  };
}

export interface CalendarReminder {
  /** Stays the same for the same day and kind, so adding again can replace rather than double up. */
  uid: string;
  /** 'meal' is the planned dinner itself (no alert); 'cook' and 'prep' are the reminders. */
  kind: 'meal' | 'cook' | 'prep';
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

/** How the planned dinner shows in the calendar ("Dinner: Chilli con carne", "Takeaway: Pizza"). */
function mealTitle(meal: PlannedMeal, recipes: Recipe[], batches: BatchItem[]): string {
  const recipe = meal.recipeId ? recipes.find((r) => r.id === meal.recipeId) : null;
  const bare = meal.name.replace(/^(leftovers?|batch):\s*/i, '').trim();
  if (meal.type === 'takeout') return bare ? `Takeaway: ${bare}` : 'Takeaway';
  if (meal.type === 'eating_out') return bare ? `Eating out: ${bare}` : 'Eating out';
  if (meal.type === 'batch')
    return `Dinner: ${batches.find((b) => b.id === meal.batchId)?.name || bare || 'from the freezer'} (from the freezer)`;
  if (meal.type === 'leftover') return `Dinner: ${recipe?.name || bare || 'leftovers'} (leftovers)`;
  return `Dinner: ${recipe?.name || bare || 'dinner'}`;
}

/**
 * The planned dinners themselves, from `fromDate` ("2026-10-19") on, at your usual eating time:
 * cooked or not, takeaways and eating out too (days with no meal are left out). No alerts; the
 * reminders carry those.
 */
export function plannedMealEvents(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  fromDate: string,
): CalendarReminder[] {
  const recipes = state.recipes || [];
  const batches = state.batches || [];
  const eatAt = parseClock(eatAtFor(state.preferences, '').usual)!;
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
      alertBefore: null,
    });
  }
  return out;
}

// ---------- Calendar sync: a feed in the sync Gist ----------

/** The calendar feed's file name in the sync Gist. */
export const CALENDAR_FILE = 'meal-planner-calendar.ics';
/** Days already gone that stay in the feed, so last week's dinners don't vanish from the calendar. */
const FEED_PAST_DAYS = 14;

/** The address calendars subscribe to: the newest copy of the feed file in the Gist. */
export function calendarFeedUrl(owner: string, gistId: string): string {
  return `https://gist.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(gistId)}/raw/${CALENDAR_FILE}`;
}

/** The same address for "Subscribe" on iPhone, iPad and Mac (webcal:// opens the Calendar app). */
export const webcalUrl = (url: string) => url.replace(/^https:/, 'webcal:');

/**
 * Everything in the feed: the planned dinners and their reminders, from two weeks ago on. Once
 * notifications are set up (Settings → Notifications), those send the reminders, so the feed has
 * just the dinners and no alerts.
 */
export function calendarFeedEvents(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  now: Date,
): CalendarReminder[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FEED_PAST_DAYS);
  const fromDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const reminders = state.preferences?.pushHousehold ? [] : upcomingReminders(state, from);
  return [...plannedMealEvents(state, fromDate), ...reminders].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.kind.localeCompare(b.kind),
  );
}

/**
 * The Gist files to write alongside the data: the calendar feed when calendar sync is on, or
 * (when it's been switched off) the old feed removed, so calendars empty out rather than go stale.
 */
export function calendarFeedFiles(
  state: { mealPlans?: MealPlan[]; recipes?: Recipe[]; batches?: BatchItem[]; preferences?: Partial<UserPreferences> },
  existingFiles: string[],
  now: Date,
): Record<string, { content: string } | null> {
  if (state.preferences?.calendarSync)
    return { [CALENDAR_FILE]: { content: remindersCalendar(calendarFeedEvents(state, now), now) } };
  return existingFiles.includes(CALENDAR_FILE) ? { [CALENDAR_FILE]: null } : {};
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

/** A calendar file holding the reminders, each with an alert. */
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
