// Settings → Reminders: the coming meals as calendar events, so each phone's own calendar sends
// the alerts (when to start dinner, what to take out of the freezer the night before) even when
// the app is closed. Pure functions (no React, no storage); the screen downloads the .ics file.
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
  kind: 'cook' | 'prep';
  /** The day it goes off ("2026-10-27"). */
  date: string;
  start: Date;
  end: Date;
  title: string;
  details: string;
  /** Minutes before the start the alert goes off. */
  alertBefore: number;
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
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      `TRIGGER:${r.alertBefore ? `-PT${r.alertBefore}M` : 'PT0M'}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
